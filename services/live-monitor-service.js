/**
 * Live Monitor Service v4.1 - 实时监听服务
 * 
 * 职责：
 * 1. 接收监听输入并标准化
 * 2. 创建/关联 session
 * 3. 保存 message
 * 4. 触发对话分析(基于 conversation 上下文)
 * 5. 生成 review item（如需要）
 * 
 * 核心变更:
 * - 基于完整对话上下文进行分析
 * - 不再只看单轮 customerMessage + agentReply
 * 
 * 协议版本: v1.0（标准协议）
 * - conversation 使用标准格式 [{role: "user"|"agent", content: string}]
 * - 使用 projectId/project, mode/entry_type, currentReply/current_reply（向后兼容）
 */

const { evaluate } = require('./evaluation-service');
const { getRepositories } = require('../repositories');

class LiveMonitorService {
  constructor(options = {}) {
    this.repos = options.repositories || getRepositories();
    this.sessionTimeout = options.sessionTimeout || 30 * 60 * 1000; // 30分钟
  }

  /**
   * 处理监听输入 - 最小闭环入口
   */
  async process(input) {
    // 1. 输入校验
    this._validateInput(input);

    // 2. 获取或创建 session
    const session = await this._getOrCreateSession(input);

    // 3. 保存 message
    const message = await this._saveMessage(input, session.sessionId);

    // 4. 如果是 outbound 消息（客服回复），触发分析
    let analysis = null;
    let reviewItem = null;

    if (input.direction === 'outbound') {
      analysis = await this._analyzeMessage(message, session, input);
      
      // 5. 如果命中告警，创建 review item
      if (this._shouldCreateReview(analysis)) {
        reviewItem = await this._createReviewItem(analysis, message, session);
      }
    }

    // 6. 更新 session 最后活动时间
    await this.repos.session.updateStatus(session.sessionId, 'active', {
      updatedAt: new Date().toISOString()
    });

    return {
      success: true,
      sessionId: session.sessionId,
      messageId: message.messageId,
      analysisId: analysis?.evaluationId || null,
      reviewId: reviewItem?.reviewId || null,
      alertTriggered: !!reviewItem,
      reviewPayload: reviewItem ? this._buildReviewPayload(reviewItem, message, analysis) : null
    };
  }

  /**
   * 输入校验
   */
  _validateInput(input) {
    const required = ['projectId', 'channel', 'employeeId', 'content', 'direction'];
    const missing = required.filter(field => !input[field]);
    
    if (missing.length > 0) {
      throw new Error(`Missing required fields: ${missing.join(', ')}`);
    }

    if (!['inbound', 'outbound'].includes(input.direction)) {
      throw new Error(`Invalid direction: ${input.direction}, must be 'inbound' or 'outbound'`);
    }
  }

  /**
   * 获取或创建 session
   */
  async _getOrCreateSession(input) {
    if (input.sessionId) {
      const existing = await this.repos.session.findById(input.sessionId);
      if (existing && existing.status === 'active') {
        return existing;
      }
    }

    const activeSession = await this.repos.session.findActiveSession(
      input.projectId,
      input.channel,
      input.employeeId,
      { timeout: this.sessionTimeout }
    );

    if (activeSession) {
      return activeSession;
    }

    return this.repos.session.create({
      projectId: input.projectId,
      channel: input.channel,
      employeeId: input.employeeId,
      customerId: input.customerId || 'unknown',
      status: 'active',
      metadata: {
        source: 'live_monitor',
        createdBy: input.employeeId
      }
    });
  }

  /**
   * 保存消息
   */
  async _saveMessage(input, sessionId) {
    return this.repos.message.save({
      sessionId,
      projectId: input.projectId,
      channel: input.channel,
      employeeId: input.employeeId,
      customerId: input.customerId || 'unknown',
      direction: input.direction,
      content: input.content,
      messageType: input.messageType || 'text',
      timestamp: input.timestamp || new Date().toISOString(),
      rawPayload: input.rawPayload || {},
      normalized: {
        messageId: input.messageId,
        scenarioId: input.scenarioId
      }
    });
  }

  /**
   * 触发对话分析 - 基于 conversation 上下文（使用标准协议）
   */
  async _analyzeMessage(message, session, input) {
    // 获取完整对话历史
    const conversationHistory = await this._buildConversationHistory(session.sessionId, input);
    
    // 标准化 conversation 格式（role: customer → user）
    const normalizedConversation = conversationHistory.map(turn => ({
      role: turn.role === 'customer' ? 'user' : (turn.role || 'unknown'),
      content: turn.content || turn.text || '',
      _meta: turn.turnIndex !== undefined || turn.timestamp ? {
        turnIndex: turn.turnIndex,
        ts: turn.timestamp
      } : undefined
    })).filter(turn => turn.role && turn.content);
    
    // 构建分析参数（使用标准协议，向后兼容）
    const analysisParams = {
      // 向后兼容：支持 projectId 和 project
      projectId: input.projectId,
      project: input.project,
      
      // 模式固定为 live_monitor
      mode: 'live_monitor',
      metadata: {
        ...(input.metadata || {}),
        session_id: session.sessionId,
        sessionId: session.sessionId, // 向后兼容
        agent_id: input.employeeId,
        employeeId: input.employeeId, // 向后兼容
        customerId: input.customerId,
        messageId: message.messageId,
        entry_type: 'live_monitor',
        timestamp: input.timestamp || new Date().toISOString()
      },
      
      // conversation 使用标准格式
      conversation: normalizedConversation,
      
      // 向后兼容：支持 currentReply 和 current_reply
      currentReply: input.content,
      current_reply: input.content,
      
      // rules 字段
      rules: input.rules || {}
    };

    // 如果提供了 scenarioId，直接使用
    if (input.scenarioId) {
      analysisParams.scenarioId = input.scenarioId;
    }

    // 调用分析服务
    const analysisResult = await evaluate(analysisParams);

    // 保存分析结果
    const analysis = await this.repos.evaluation.save({
      messageId: message.messageId,
      sessionId: session.sessionId,
      projectId: input.projectId,
      mode: 'live_monitor',
      scenarioId: analysisResult.scenarioId,
      status: analysisResult.status,
      alertLevel: analysisResult.alertLevel,
      score: analysisResult.result?.level === 'pass' ? 85 : 
             analysisResult.result?.level === 'borderline' ? 60 :
             analysisResult.result?.level === 'fail' ? 35 : 15,
      dimensionScores: {}, // v4.0 不再使用维度分数
      findings: analysisResult.result?.issues || [],
      suggestions: [analysisResult.result?.nextAction].filter(Boolean),
      alerts: analysisResult.alerts || [],
      summary: analysisResult.coachSummary,
      standardReply: null, // v4.0 不再使用标准答案
      matchedScenario: analysisResult.matchedScenario,
      matchConfidence: analysisResult.matchConfidence,
      rawResult: analysisResult
    });

    // 关联 message 和 analysis
    await this.repos.message.linkEvaluation(message.messageId, analysis.evaluationId);

    return analysis;
  }

  /**
   * 构建完整对话历史（使用标准协议格式）
   */
  async _buildConversationHistory(sessionId, currentInput) {
    // 获取最近的消息历史
    const recentMessages = await this.repos.message.findBySessionId(
      sessionId,
      { limit: 20, order: 'asc' } // 获取最近20条消息
    );

    // 转换为标准 ConversationTurn 格式
    // 注意：role 使用标准协议格式（user/agent），而非旧格式（customer/agent）
    const conversation = recentMessages.map((msg, index) => ({
      turnIndex: index,
      role: msg.direction === 'inbound' ? 'user' : 'agent',
      content: msg.content,
      timestamp: msg.timestamp,
      metadata: {
        messageId: msg.messageId,
        employeeId: msg.employeeId,
        customerId: msg.customerId
      }
    }));

    // 如果当前消息是 outbound，添加到对话历史
    if (currentInput.direction === 'outbound') {
      conversation.push({
        turnIndex: conversation.length,
        role: 'agent',
        content: currentInput.content,
        timestamp: currentInput.timestamp || new Date().toISOString(),
        metadata: {
          employeeId: currentInput.employeeId,
          customerId: currentInput.customerId
        }
      });
    }

    return conversation;
  }

  /**
   * 判断是否应创建 review item
   * 
   * TODO: 职责错位检查
   * 本函数包含告警判断逻辑（基于 status、alertLevel、riskLevel、issues）
   * 理论上应归属于 core/alert-router.js 或新增 core/review-decider.js
   * 当前保留在 services 层是因为需要结合业务需求（何时创建 review）
   * 建议后续将判断逻辑迁移到 core，services 仅调用
   */
  _shouldCreateReview(analysis) {
    if (analysis.status === 'alert_triggered') {
      return true;
    }
    
    if (analysis.alertLevel && analysis.alertLevel !== 'none') {
      return true;
    }

    // 检查 riskLevel
    if (analysis.riskLevel === 'high' || analysis.riskLevel === 'medium') {
      return true;
    }

    // 检查是否有严重问题
    const hasHardFail = analysis.result?.issues?.some(issue => 
      issue.severity === 'high' || issue.type === 'forbidden_content'
    );
    
    return hasHardFail;
  }

  /**
   * 创建 review item
   */
  async _createReviewItem(analysis, message, session) {
    return this.repos.review.create({
      evaluationId: analysis.evaluationId,
      messageId: message.messageId,
      sessionId: session.sessionId,
      projectId: analysis.projectId,
      alertLevel: analysis.alertLevel,
      reviewStatus: 'pending'
    });
  }

  /**
   * 构建主管可读 Review Payload
   */
  _buildReviewPayload(reviewItem, message, analysis) {
    return {
      reviewId: reviewItem.reviewId,
      projectId: reviewItem.projectId,
      createdAt: reviewItem.createdAt,
      message: {
        messageId: message.messageId,
        content: message.content,
        direction: message.direction,
        timestamp: message.timestamp,
        employeeId: message.employeeId
      },
      analysis: {
        evaluationId: analysis.evaluationId,
        scenario: analysis.scenario,
        stage: analysis.stage,
        result: analysis.result,
        coachSummary: analysis.coachSummary,
        riskLevel: analysis.riskLevel,
        matchedScenario: analysis.matchedScenario
      },
      alertLevel: reviewItem.alertLevel,
      reviewStatus: reviewItem.reviewStatus
    };
  }

  /**
   * 获取待复核列表
   */
  async getPendingReviews(projectId, options = {}) {
    const result = await this.repos.review.findPending(projectId, {}, {
      page: options.page || 1,
      limit: options.limit || 20
    });

    const items = await Promise.all(
      result.items.map(async (review) => {
        const message = await this.repos.message.findById(review.messageId);
        const analysis = await this.repos.evaluation.findById(review.evaluationId);
        return this._buildReviewPayload(review, message, analysis);
      })
    );

    return {
      items,
      total: result.total
    };
  }

  /**
   * 提交复核结果
   */
  async submitReview(reviewId, reviewResult) {
    const review = await this.repos.review.submitReview(reviewId, {
      status: reviewResult.status,
      reviewedBy: reviewResult.reviewedBy,
      reviewComment: reviewResult.reviewComment,
      falsePositiveReason: reviewResult.falsePositiveReason,
      suggestionAdopted: reviewResult.suggestionAdopted
    });

    return review;
  }
}

module.exports = { LiveMonitorService };

