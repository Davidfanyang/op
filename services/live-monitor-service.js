/**
 * Live Monitor Service v5.0 - 实时监听服务（使用 live_* 专用表）
 * 
 * 职责：
 * 1. 接收监听输入并标准化
 * 2. 创建/关联 session（写入 live_sessions）
 * 3. 保存 message（写入 live_messages）
 * 4. 触发对话分析(基于 conversation 上下文)
 * 5. 保存 evaluation（写入 live_evaluations）
 * 6. 生成 review item（如需要）
 * 
 * 核心变更 v5.0:
 * - 使用 liveSessionRepo/liveMessageRepo/liveEvaluationRepo 写入 live_* 专用表
 * - 保留通用 repos 用于 review 等操作
 * 
 * 协议版本: v1.0（标准协议）
 */

const { evaluate } = require('./evaluation-service');
const { getRepositories } = require('../repositories');
const { defaultClassifier: problemClassifier } = require('./problem-classifier-service');
const { defaultService: suggestionService } = require('./unknown-suggestion-service');

class LiveMonitorService {
  constructor(options = {}) {
    this.repos = options.repositories || getRepositories();
    this.sessionTimeout = options.sessionTimeout || 30 * 60 * 1000; // 30分钟
    
    // 优先使用 live repository，如果不存在则回退到通用 repository
    this.liveSessionRepo = this.repos.liveSession || this.repos.session;
    this.liveMessageRepo = this.repos.liveMessage || this.repos.message;
    this.liveEvaluationRepo = this.repos.liveEvaluation || this.repos.evaluation;
  }

  /**
   * 处理监听输入 - 最小闭环入口
   */
  async process(input) {
    // 0. 标准化输入字段（修复 project/projectId 映射）
    input = this._normalizeInput(input);
    
    // 1. 输入校验
    this._validateInput(input);

    // 2. 获取或创建 session（live_sessions）
    const session = await this._getOrCreateSession(input);

    // 3. 保存 message（live_messages）
    const message = await this._saveMessage(input, session.sessionId);

    // 4. 如果是 outbound 消息（客服回复），触发分析
    let analysis = null;
    let reviewItem = null;
    let suggestionResult = null;

    if (input.direction === 'outbound') {
      analysis = await this._analyzeMessage(message, session, input);
      
      // 5. 如果是 unknown 问题，生成建议答案
      if (analysis.problemType === 'unknown' && analysis.needReview === true) {
        console.log('[LiveMonitor] unknown 问题，生成 suggestion:', analysis.evaluationId);
        try {
          suggestionResult = await suggestionService.generateSuggestionByEvaluationId(
            analysis.evaluationId
          );
          console.log('[LiveMonitor] suggestion 生成结果:', suggestionResult);
        } catch (err) {
          console.error('[LiveMonitor] suggestion 生成失败:', err.message);
          // 不影响主流程
        }
      }
      
      // 6. 如果命中告警或是 unknown 问题，创建 review item
      if (this._shouldCreateReview(analysis)) {
        reviewItem = await this._createReviewItem(analysis, message, session, input, suggestionResult);
      }
    }

    // 6. 更新 session 最后活动时间（live_sessions）
    await this.liveSessionRepo.updateStatus(session.sessionId, 'active');

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
  /**
   * 标准化输入字段（修复 project/projectId 映射）
   */
  _normalizeInput(input) {
    // 修复 project / projectId 映射
    if (!input.project && input.projectId) {
      input.project = input.projectId;
    }
    if (!input.projectId && input.project) {
      input.projectId = input.project;
    }
    
    // 确保 project 字段存在（默认值）
    if (!input.project) {
      input.project = 'default';
      input.projectId = 'default';
      console.warn('[LiveMonitor] project 字段缺失，使用默认值: default');
    }
    
    return input;
  }

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
   * 获取或创建 session（使用 live_sessions 表）
   */
  async _getOrCreateSession(input) {
    // 如果指定了 sessionId，优先查找该会话
    if (input.sessionId) {
      const existing = await this.liveSessionRepo.findById(input.sessionId);
      if (existing && existing.status === 'active') {
        return existing;
      }
      // 如果指定的会话不存在或已关闭，创建新会话
    }

    // 不要自动复用其他活跃会话，每次都创建新会话
    // 这样可以确保每个E2E测试使用独立的sessionId
    
    return this.liveSessionRepo.create({
      sessionId: input.sessionId,
      project: input.projectId || input.project || 'default',
      chatId: input.chatId || input.sessionId || 'unknown',
      agentId: input.employeeId || input.agentId || null,
      status: 'active',
      startedAt: new Date().toISOString().replace('T', ' ').substring(0, 19),
      updatedAt: new Date().toISOString().replace('T', ' ').substring(0, 19)
    });
  }

  /**
   * 保存消息（使用 live_messages 表）
   */
  async _saveMessage(input, sessionId) {
    // 修复 direction/role 映射：优先使用 role，其次根据 direction 推断
    let role = input.role;
    if (!role) {
      if (input.direction === 'inbound') {
        role = 'user';
      } else if (input.direction === 'outbound') {
        role = 'agent';
      } else {
        role = 'agent'; // 默认 agent
        console.warn(`[LiveMonitor] direction 和 role 都不存在，默认使用 role=agent`);
      }
    }
    
    const senderId = input.direction === 'inbound' 
      ? (input.customerId || input.senderId || 'customer') 
      : (input.employeeId || input.agentId || 'agent');
    
    return this.liveMessageRepo.save({
      messageId: input.messageId,
      sessionId,
      role,
      senderId,
      senderName: input.senderName || null,
      content: input.content,
      timestamp: input.timestamp || new Date().toISOString().replace('T', ' ').substring(0, 19)
    });
  }

  /**
   * 触发对话分析 - 基于 conversation 上下文（使用标准协议）
   */
  async _analyzeMessage(message, session, input) {
    // 获取完整对话历史（从 live_messages）
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
      // 修复：确保 project 和 projectId 都存在
      projectId: input.projectId || input.project || 'default',
      project: input.project || input.projectId || 'default',
      
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

    // 保存分析结果（使用 live_evaluations 表）
    let analysis = await this.liveEvaluationRepo.save({
      evaluationId: analysisResult.evaluationId,
      sessionId: session.sessionId,
      messageId: message.messageId,
      project: input.projectId || input.project || 'default',
      currentReply: input.content,
      inputPayload: analysisParams,
      outputPayload: analysisResult,
      scenario: analysisResult.scenarioId || analysisResult.scenario || null,
      stage: analysisResult.stage || null,
      judgement: analysisResult.result?.conclusion || analysisResult.result?.judgement || null,
      summary: analysisResult.coachSummary || analysisResult.summary || null,
      confidence: analysisResult.matchConfidence || analysisResult.confidence || null
    });

    // 关联 message 和 analysis
    await this.liveMessageRepo.linkEvaluation(message.messageId, analysis.evaluationId);

    // 步骤 5: 已知/未知问题分流
    analysis = await this._classifyAndUpdateEvaluation(analysis);

    // 步骤 6: 如果是 unknown 问题，生成建议答案
    if (analysis.problemType === 'unknown' && analysis.needReview === true) {
      console.log('[LiveMonitor] unknown 问题，生成 suggestion:', analysis.evaluationId);
      try {
        const suggestionResult = await suggestionService.generateSuggestionByEvaluationId(analysis.evaluationId);
        console.log('[LiveMonitor] suggestion 生成结果:', suggestionResult);
        analysis.suggestion = suggestionResult;
      } catch (err) {
        console.error('[LiveMonitor] suggestion 生成失败:', err.message);
        // 不影响主流程
      }
    }

    return analysis;
  }

  /**
   * 已知/未知问题分流并更新 evaluation
   */
  async _classifyAndUpdateEvaluation(evaluation) {
    console.log('[LiveMonitor] 开始问题分流:', {
      evaluationId: evaluation.evaluationId,
      scenario: evaluation.scenario,
      confidence: evaluation.confidence
    });

    // 构造 classifier 需要的结构化字段
    const classifierInput = {
      scenario: evaluation.scenario,
      stage: evaluation.stage,
      judgement: evaluation.judgement,
      summary: evaluation.summary,
      analysis: evaluation.outputPayload?.analysis || {},
      confidence: evaluation.confidence
    };

    // 调用分流服务
    const classificationResult = await problemClassifier.classifyProblem(
      classifierInput,
      evaluation.project,
      {}
    );

    console.log('[LiveMonitor] 分流结果:', classificationResult);

    // 更新评估记录的分流字段
    await this.liveEvaluationRepo.updateClassification(evaluation.evaluationId, {
      problemType: classificationResult.problem_type,
      needReview: classificationResult.need_review,
      classifyReason: classificationResult.classify_reason
    });

    // 返回更新后的 evaluation
    return await this.liveEvaluationRepo.findById(evaluation.evaluationId);
  }

  /**
   * 构建完整对话历史（使用 live_messages 表）
   */
  async _buildConversationHistory(sessionId, currentInput) {
    // 获取最近的消息历史（从 live_messages）
    const recentMessages = await this.liveMessageRepo.findBySessionId(
      sessionId,
      { limit: 20, order: 'asc' } // 获取最近20条消息
    );

    // 转换为标准 ConversationTurn 格式
    // 注意：role 使用标准协议格式（user/agent），而非旧格式（customer/agent）
    const conversation = recentMessages.map((msg, index) => ({
      turnIndex: index,
      role: msg.role || (msg.direction === 'inbound' ? 'user' : 'agent'),
      content: msg.content,
      timestamp: msg.timestamp,
      metadata: {
        messageId: msg.messageId,
        senderId: msg.senderId
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
   */
  _shouldCreateReview(analysis) {
    // 检查是否为 unknown 问题（需要主管审核）
    if (analysis.problemType === 'unknown' || analysis.problem_type === 'unknown') {
      console.log('[LiveMonitor] 需要创建 review: unknown 问题');
      return true;
    }
    
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
  async _createReviewItem(analysis, message, session, input, suggestionResult) {
    const projectId = analysis.project || analysis.projectId || input.projectId || input.project || 'default';
    const alertLevel = analysis.alertLevel || analysis.alert_level || 'warning';
    
    console.log('[LiveMonitor] 创建 review item:', {
      evaluationId: analysis.evaluationId,
      projectId: projectId,
      alertLevel: alertLevel,
      suggestionId: suggestionResult?.suggestion_id || null
    });
    
    // 使用 reviews repository（复数），专门用于 live_monitor 模式
    const reviewsRepo = this.repos.reviews || this.repos.review;
    
    return reviewsRepo.create({
      evaluationId: analysis.evaluationId,
      messageId: message.messageId,
      sessionId: session.sessionId,
      projectId: projectId,
      suggestionId: suggestionResult?.suggestion_id || null,
      reviewAction: 'pending',
      originalReply: input.content,
      finalReply: null,
      reviewNote: null,
      reviewerId: null
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
        direction: message.direction || message.role,
        timestamp: message.timestamp,
        employeeId: message.employeeId || message.senderId
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
        const message = await this.liveMessageRepo.findById(review.messageId);
        const analysis = await this.liveEvaluationRepo.findById(review.evaluationId);
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
