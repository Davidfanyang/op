/**
 * 实时质检分析服务
 * 
 * 职责：
 * 1. 接收实时 conversation 结果
 * 2. 判断是否触发分析（仅 agent 消息）
 * 3. 组装标准输入对象（复用统一输入协议 v1.0）
 * 4. 调用统一引擎入口（evaluation-service）
 * 5. 承接分析结果
 * 6. 触发入库（live_sessions / live_messages / live_evaluations）
 * 
 * 严格约束：
 * - 必须复用统一输入协议
 * - 必须走统一引擎调用入口
 * - 必须保存原始会话 + 分析结果
 * - 实时数据必须与训练数据隔离
 * - 分析触发对象必须是当前客服回复
 */

const { evaluate } = require('./evaluation-service');
const { defaultClassifier: problemClassifier } = require('./problem-classifier-service');
const { defaultAlertService: alertService } = require('./alert-service');
const { defaultService: suggestionService } = require('./unknown-suggestion-service');
const { v4: uuidv4 } = require('uuid');

// Repository 层（根据环境变量选择实现）
function getLiveSessionsRepo() {
  if (process.env.REPOSITORY_TYPE === 'mysql') {
    const { getDefaultFactory } = require('../repositories');
    return getDefaultFactory().getLiveSessionRepository();
  }
  const { defaultRepo } = require('../repositories/impl/file-live-sessions-repository');
  return defaultRepo;
}

function getLiveMessagesRepo() {
  if (process.env.REPOSITORY_TYPE === 'mysql') {
    const { getDefaultFactory } = require('../repositories');
    return getDefaultFactory().getLiveMessageRepository();
  }
  const { defaultRepo } = require('../repositories/impl/file-live-messages-repository');
  return defaultRepo;
}

function getLiveEvaluationsRepo() {
  if (process.env.REPOSITORY_TYPE === 'mysql') {
    const { getDefaultFactory } = require('../repositories');
    return getDefaultFactory().getLiveEvaluationRepository();
  }
  const { defaultRepo } = require('../repositories/impl/file-live-evaluations-repository');
  return defaultRepo;
}

function getAlertsRepo() {
  if (process.env.REPOSITORY_TYPE === 'mysql') {
    const { getDefaultFactory } = require('../repositories');
    return getDefaultFactory().getRepositories().alerts;
  }
  const { defaultRepo } = require('../repositories/impl/file-alerts-repository');
  return defaultRepo;
}

function getSuggestionsRepo() {
  if (process.env.REPOSITORY_TYPE === 'mysql') {
    const { getDefaultFactory } = require('../repositories');
    return getDefaultFactory().getRepositories().suggestions;
  }
  const { defaultRepo } = require('../repositories/impl/file-suggestions-repository');
  return defaultRepo;
}

const liveSessionsRepo = getLiveSessionsRepo();
const liveMessagesRepo = getLiveMessagesRepo();
const liveEvaluationsRepo = getLiveEvaluationsRepo();
const alertsRepo = getAlertsRepo();
const suggestionsRepo = getSuggestionsRepo();

class LiveEvaluationService {
  constructor(options = {}) {
    this.project = options.project || 'default';
    this.rules = options.rules || {};
    
    // 注入 Repository（支持替换为 MySQL 实现）
    this.sessionsRepo = options.sessionsRepo || liveSessionsRepo;
    this.messagesRepo = options.messagesRepo || liveMessagesRepo;
    this.evaluationsRepo = options.evaluationsRepo || liveEvaluationsRepo;
    this.alertsRepo = options.alertsRepo || alertsRepo;
    this.suggestionsRepo = options.suggestionsRepo || suggestionsRepo;
    
    // 已分析的消息 ID 集合（内存去重）
    this.analyzedMessageIds = new Set();
  }

  /**
   * 处理实时会话结果（主入口）
   * 
   * @param {Object} conversationResult - live-conversation-builder 输出
   * @param {Object} currentMessage - 当前新增的消息对象
   * @returns {Object} 处理结果
   */
  async processConversation(conversationResult, currentMessage) {
    const { session_key, chat_id, conversation, last_message_id, updated_at } = conversationResult;
    const { message_id, sender_id, sender_name, message_text, timestamp } = currentMessage;

    console.log('[LiveEvaluation] 开始处理实时会话:', {
      session_key,
      chat_id,
      message_id,
      current_message_role: currentMessage.role
    });

    // 步骤 1: 确定当前消息是否需要分析
    const shouldAnalyze = await this._shouldTriggerAnalysis(currentMessage, conversationResult);
    
    if (!shouldAnalyze) {
      console.log('[LiveEvaluation] 不触发分析，仅入库消息');
      // 仅入库消息
      await this._saveSessionAndMessages(conversationResult, currentMessage);
      return {
        success: true,
        analyzed: false,
        reason: 'not_agent_message_or_duplicate'
      };
    }

    // 步骤 2: 写入 live_sessions 和 live_messages
    await this._saveSessionAndMessages(conversationResult, currentMessage);

    // 步骤 3: 组装标准分析输入对象
    const analysisInput = this._buildAnalysisInput(conversationResult, currentMessage);

    console.log('[LiveEvaluation] 标准输入协议:', JSON.stringify(analysisInput, null, 2));

    // 步骤 4: 调用统一引擎入口
    const analysisResult = await this._callAnalysisEngine(analysisInput);

    // 步骤 5: 承接分析结果并入库
    const evaluationRecord = await this._saveEvaluation(
      session_key,
      message_id,
      analysisInput,
      analysisResult
    );

    // 步骤 6: 已知/未知问题分流
    const { classificationResult, updatedEvaluation } = await this._classifyProblem(evaluationRecord);

    // 步骤 7: 告警判断与入库
    const { alertResult, alertRecord } = await this._processAlert(updatedEvaluation);

    // 步骤 8: 如果是 unknown 问题，生成建议答案
    let suggestionResult = null;
    if (classificationResult.problem_type === 'unknown' && classificationResult.need_review === true) {
      // 传入 evaluationId，由 suggestionService 内部查询完整上下文
      suggestionResult = await suggestionService.generateSuggestionByEvaluationId(
        updatedEvaluation.evaluationId
      );
    }

    console.log('[LiveEvaluation] 实时质检完成:', {
      session_key,
      message_id,
      evaluation_id: updatedEvaluation.evaluationId,
      scenario: updatedEvaluation.scenario,
      judgement: updatedEvaluation.judgement,
      problem_type: classificationResult.problem_type,
      need_review: classificationResult.need_review,
      alert_level: alertResult.alert_level,
      has_alert: alertResult.alert_level !== 'none',
      has_suggestion: suggestionResult && suggestionResult.generated === true
    });

    return {
      success: true,
      analyzed: true,
      evaluation: updatedEvaluation,
      classification: classificationResult,
      alert: alertResult,
      alertRecord: alertRecord,
      suggestion: suggestionResult
    };
  }

  /**
   * 判断是否触发分析
   * 
   * 触发条件：
   * 1. 当前消息角色为 agent
   * 2. 当前 message_id 未被分析过（内存 + 持久层双重去重）
   * 3. current_reply 非空
   * 4. conversation 非空
   */
  async _shouldTriggerAnalysis(currentMessage, conversationResult) {
    const { role, message_id, message_text } = currentMessage;
    const { conversation } = conversationResult;

    // 条件 1: 必须是 agent 消息
    if (role !== 'agent') {
      console.log('[LiveEvaluation] 跳过分析：不是 agent 消息');
      return false;
    }

    // 条件 2: 不能重复分析（内存去重 + 持久层去重）
    if (this.analyzedMessageIds.has(String(message_id))) {
      console.log('[LiveEvaluation] 跳过分析：消息已分析过（内存）', message_id);
      return false;
    }

    // 持久层去重（防止重启后重复分析）
    const existsInRepo = await this.evaluationsRepo.existsByMessageId(message_id);
    if (existsInRepo) {
      console.log('[LiveEvaluation] 跳过分析：消息已分析过（持久层）', message_id);
      return false;
    }

    // 条件 3: current_reply 不能为空
    if (!message_text || message_text.trim() === '') {
      console.log('[LiveEvaluation] 跳过分析：消息内容为空');
      return false;
    }

    // 条件 4: conversation 必须非空
    if (!conversation || conversation.length === 0) {
      console.log('[LiveEvaluation] 跳过分析：conversation 为空');
      return false;
    }

    return true;
  }

  /**
   * 组装标准分析输入对象
   * 
   * 严格复用统一输入协议 v1.0：
   * - project
   * - conversation
   * - current_reply
   * - metadata
   * - rules
   */
  _buildAnalysisInput(conversationResult, currentMessage) {
    const { session_key, chat_id, conversation } = conversationResult;
    const { message_id, sender_id, sender_name, message_text, timestamp } = currentMessage;

    return {
      // 1. project（必填）
      project: this.project,
      
      // 2. conversation（必填，原样传入）
      conversation: conversation.map(msg => ({
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp
      })),
      
      // 3. current_reply（必填，当前 agent 消息内容）
      current_reply: message_text,
      
      // 4. metadata（必填，最小上下文）
      metadata: {
        source: 'tg_live',
        session_id: session_key,
        agent_id: String(sender_id),
        timestamp: timestamp || new Date().toISOString(),
        entry_type: 'live_monitor',
        chat_id: chat_id,
        message_id: String(message_id),
        sender_name: sender_name || 'unknown'
      },
      
      // 5. rules（必填，无规则时传 {}）
      rules: this.rules
    };
  }

  /**
   * 调用统一引擎入口
   * 
   * 严格约束：
   * - 不绕开统一入口
   * - 不直接调 core
   * - 不在实时链路里写本地替代判断
   */
  async _callAnalysisEngine(analysisInput) {
    console.log('[LiveEvaluation] 调用统一引擎入口...');
    
    try {
      const result = await evaluate(analysisInput);
      
      console.log('[LiveEvaluation] 引擎返回结果:', {
        status: result.status,
        scenarioId: result.scenarioId,
        riskLevel: result.riskLevel
      });
      
      return result;
    } catch (error) {
      console.error('[LiveEvaluation] 引擎调用失败:', error.message);
      throw error;
    }
  }

  /**
   * 保存会话和消息
   */
  async _saveSessionAndMessages(conversationResult, currentMessage) {
    const { session_key, chat_id, conversation, updated_at } = conversationResult;
    const { message_id, sender_id, sender_name, message_text, timestamp, role } = currentMessage;

    // 1. 写入或更新 live_sessions
    let session = await this.sessionsRepo.findById(session_key);
    
    if (!session) {
      // 首次出现，创建新会话
      const firstMessage = conversation[0];
      session = await this.sessionsRepo.create({
        sessionId: session_key,
        project: this.project,
        chatId: chat_id,
        agentId: role === 'agent' ? String(sender_id) : null,
        status: 'active',
        startedAt: new Date(firstMessage.timestamp),
        updatedAt: new Date(updated_at)
      });
    } else {
      // 已存在，更新 updated_at 和 agent_id
      const updates = {
        updatedAt: new Date(updated_at)
      };
      
      // 补充 agent_id（如果还没有）
      if (!session.agentId && role === 'agent') {
        updates.agentId = String(sender_id);
      }
      
      await this.sessionsRepo.update(session_key, updates);
    }

    // 2. 写入 live_messages（当前消息）
    const messageExists = await this.messagesRepo.exists(message_id);
    if (!messageExists) {
      await this.messagesRepo.create({
        messageId: String(message_id),
        sessionId: session_key,
        role: role,
        senderId: String(sender_id),
        senderName: sender_name || null,
        content: message_text,
        timestamp: new Date(timestamp)
      });
    }

    return session;
  }

  /**
   * 保存分析结果
   */
  async _saveEvaluation(sessionKey, messageId, analysisInput, analysisResult) {
    // 提取关键结果字段
    const { scenarioId, result, coachSummary, riskLevel } = analysisResult;
    
    const evaluationData = {
      evaluationId: `live_eval_${uuidv4()}`,
      sessionId: sessionKey,
      messageId: String(messageId),
      project: this.project,
      currentReply: analysisInput.current_reply,
      inputPayload: analysisInput,
      outputPayload: analysisResult,
      scenario: scenarioId || null,
      stage: result?.stage || null,
      judgement: result?.judgement || result?.level || null,
      summary: coachSummary || null,
      confidence: result?.confidence || null
    };

    // 写入 live_evaluations
    const evaluation = await this.evaluationsRepo.create(evaluationData);

    // 只有写入成功后，才标记为已分析（防止写入失败后误判重复）
    this.analyzedMessageIds.add(String(messageId));

    return evaluation;
  }

  /**
   * 已知/未知问题分流
   * 
   * @param {Object} evaluationRecord - 实时质检评估记录
   * @returns {Promise<Object>} 分流结果
   */
  async _classifyProblem(evaluationRecord) {
    console.log('[LiveEvaluation] 开始问题分流:', {
      evaluationId: evaluationRecord.evaluationId,
      scenario: evaluationRecord.scenario,
      confidence: evaluationRecord.confidence
    });

    // 构造 classifier 需要的结构化字段（从 evaluationRecord 的扁平化字段取值）
    const classifierInput = {
      scenario: evaluationRecord.scenario,
      stage: evaluationRecord.stage,
      judgement: evaluationRecord.judgement,
      summary: evaluationRecord.summary,
      analysis: evaluationRecord.outputPayload?.analysis || {},
      confidence: evaluationRecord.confidence
    };
    
    // 调用分流服务（异步）
    const classificationResult = await problemClassifier.classifyProblem(
      classifierInput,
      this.project,
      this.rules
    );

    console.log('[LiveEvaluation] 分流结果:', classificationResult);

    // 更新评估记录的分流字段
    await this.evaluationsRepo.updateClassification(evaluationRecord.evaluationId, {
      problemType: classificationResult.problem_type,
      needReview: classificationResult.need_review,
      classifyReason: classificationResult.classify_reason
    });

    // 返回更新后的完整评估记录（包含分类字段）
    const updatedEvaluation = await this.evaluationsRepo.findById(evaluationRecord.evaluationId);

    return {
      classificationResult,
      updatedEvaluation
    };
  }

  /**
   * 告警判断与入库
   * 
   * @param {Object} evaluationRecord - 实时质检评估记录（已包含分流结果）
   * @returns {Object} 告警结果
   */
  async _processAlert(evaluationRecord) {
    console.log('[LiveEvaluation] 开始告警判断:', {
      evaluationId: evaluationRecord.evaluationId,
      problemType: evaluationRecord.problemType,
      needReview: evaluationRecord.needReview
    });

    // 步骤 1: 调用告警服务进行判定
    const alertResult = alertService.evaluateAlert(evaluationRecord);

    console.log('[LiveEvaluation] 告警判定结果:', alertResult);

    // 步骤 2: 写回 live_evaluations（更新 alert_level 和 has_alert）
    await this.evaluationsRepo.updateAlert(evaluationRecord.evaluationId, {
      alertLevel: alertResult.alert_level,
      hasAlert: alertResult.alert_level !== 'none'
    });

    // 步骤 3: 如果触发告警（medium 或 high），则写入 alerts 表
    let alertRecord = null;
    if (alertResult.alert_level !== 'none') {
      // 检查是否已存在告警（防止重复创建）
      const exists = await this.alertsRepo.existsByEvaluationId(evaluationRecord.evaluationId);
      
      if (!exists) {
        alertRecord = await this.alertsRepo.create({
          evaluationId: evaluationRecord.evaluationId,
          sessionId: evaluationRecord.sessionId,
          messageId: evaluationRecord.messageId,
          alertLevel: alertResult.alert_level,
          alertType: alertResult.alert_type,
          alertReason: alertResult.alert_reason
        });
        console.log('[LiveEvaluation] 告警记录已创建:', alertRecord.id);
      } else {
        console.log('[LiveEvaluation] 告警记录已存在，跳过创建');
      }
    }

    return {
      alertResult,
      alertRecord
    };
  }

  /**
   * 查询会话详情（包含消息和评估）
   */
  async getSessionDetail(sessionId) {
    const session = await this.sessionsRepo.findById(sessionId);
    if (!session) {
      return null;
    }

    const messages = await this.messagesRepo.findBySessionId(sessionId);
    const evaluations = await this.evaluationsRepo.findBySessionId(sessionId);

    return {
      session,
      messages,
      evaluations
    };
  }

  /**
   * 查询所有会话
   */
  async getAllSessions(filters = {}) {
    return await this.sessionsRepo.findMany(filters);
  }
}

// 导出类和单例
const defaultService = new LiveEvaluationService();

module.exports = {
  LiveEvaluationService,
  defaultService
};
