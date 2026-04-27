/**
 * 训练记录服务
 * 
 * 职责：
 * 1. 封装训练数据的入库逻辑
 * 2. 协调 training-session、training-message、training-round-result 三个 repository
 * 3. 提供训练数据的查询接口
 * 
 * 设计原则：
 * - 训练数据与实时监听数据完全隔离
 * - 所有训练过程数据必须完整入库
 * - 支持按 session_id 还原完整训练过程
 */

const { MySQLTrainingSessionRepository } = require('../infrastructure/persistence/mysql/mysql-training-session-repository');
const { MySQLTrainingMessageRepository } = require('../infrastructure/persistence/mysql/mysql-training-message-repository');
const { MySQLTrainingRoundResultRepository } = require('../infrastructure/persistence/mysql/mysql-training-round-result-repository');

// 单例模式
let instance = null;

class TrainingRecordService {
  constructor() {
    if (instance) {
      return instance;
    }

    // 初始化 repository
    this.sessionRepo = new MySQLTrainingSessionRepository();
    this.messageRepo = new MySQLTrainingMessageRepository();
    this.roundResultRepo = new MySQLTrainingRoundResultRepository();

    instance = this;
  }

  /**
   * 获取单例实例
   */
  static getInstance() {
    if (!instance) {
      instance = new TrainingRecordService();
    }
    return instance;
  }

  /**
   * 创建训练会话记录
   * 
   * @param {Object} params
   * @param {string} params.sessionId - 会话ID（来自 training-session-store）
   * @param {string} params.scenarioId - 场景ID
   * @param {string} params.scenarioTitle - 场景标题
   * @param {string} params.agentId - 客服ID
   * @param {string} params.chatId - Telegram chat ID
   * @returns {Promise<Object>} 创建的会话记录
   */
  async createSession({ sessionId, scenarioId, scenarioTitle, agentId, chatId }) {
    console.log(`[TrainingRecord] 创建训练会话记录: ${sessionId}`);

    return await this.sessionRepo.create({
      sessionId,
      project: 'default',
      scenarioId,
      scenarioTitle,
      agentId: agentId || 'unknown',
      chatId: String(chatId),
      status: 'running',
      totalRounds: 0,
      startedAt: new Date()
    });
  }

  /**
   * 保存训练消息
   * 
   * @param {Object} params
   * @param {string} params.sessionId - 会话ID
   * @param {number} params.round - 轮次（从0开始）
   * @param {string} params.role - 角色: user/agent
   * @param {string} params.content - 消息内容
   * @param {string} params.source - 来源: ai/human（默认 ai）
   * @returns {Promise<Object>} 保存的消息
   */
  async saveMessage({ sessionId, round, role, content, source = 'ai' }) {
    console.log(`[TrainingRecord] 保存训练消息: session=${sessionId}, round=${round}, role=${role}`);

    return await this.messageRepo.save({
      sessionId,
      round,
      role,
      content,
      source
    });
  }

  /**
   * 批量保存训练消息
   * 
   * @param {Array} messages - 消息数组
   * @returns {Promise<Array>} 保存的消息数组
   */
  async saveMessagesBatch(messages) {
    if (!messages || messages.length === 0) {
      return [];
    }

    console.log(`[TrainingRecord] 批量保存训练消息: count=${messages.length}`);
    return await this.messageRepo.saveBatch(messages);
  }

  /**
   * 保存训练轮次结果
   * 
   * @param {Object} params
   * @param {string} params.sessionId - 会话ID
   * @param {number} params.round - 轮次（从0开始）
   * @param {string} params.scenarioId - 场景ID
   * @param {string} params.scenarioTitle - 场景标题
   * @param {Object} params.analysisRaw - 分析引擎原始输出
   * @param {string} params.feedbackText - 客服可读的反馈文本
   * @param {Object} params.structuredFeedback - 结构化反馈JSON
   * @param {boolean} params.isFinished - 是否为最后一轮
   * @returns {Promise<Object>} 保存的轮次结果
   */
  async saveRoundResult({ sessionId, round, scenarioId, scenarioTitle, analysisRaw, feedbackText, structuredFeedback, isFinished }) {
    console.log(`[TrainingRecord] 保存训练轮次结果: session=${sessionId}, round=${round}, isFinished=${isFinished}`);

    return await this.roundResultRepo.save({
      sessionId,
      round,
      scenarioId,
      scenarioTitle,
      analysisRaw,
      feedbackText,
      structuredFeedback,
      isFinished
    });
  }

  /**
   * 完成训练会话
   * 
   * @param {string} sessionId - 会话ID
   * @param {number} totalRounds - 总轮次
   * @returns {Promise<Object>} 更新后的会话记录
   */
  async finishSession(sessionId, totalRounds) {
    console.log(`[TrainingRecord] 完成训练会话: session=${sessionId}, totalRounds=${totalRounds}`);

    return await this.sessionRepo.finish(sessionId, {
      status: 'finished',
      totalRounds,
      finishedAt: new Date()
    });
  }

  /**
   * 取消训练会话
   * 
   * @param {string} sessionId - 会话ID
   * @param {number} totalRounds - 已完成的轮次
   * @returns {Promise<Object>} 更新后的会话记录
   */
  async cancelSession(sessionId, totalRounds) {
    console.log(`[TrainingRecord] 取消训练会话: session=${sessionId}, totalRounds=${totalRounds}`);

    return await this.sessionRepo.finish(sessionId, {
      status: 'cancelled',
      totalRounds,
      finishedAt: new Date()
    });
  }

  /**
   * 查询训练会话
   * 
   * @param {string} sessionId - 会话ID
   * @returns {Promise<Object>} 会话记录
   */
  async getSession(sessionId) {
    return await this.sessionRepo.findById(sessionId);
  }

  /**
   * 查询完整训练过程（会话 + 消息 + 轮次结果）
   * 
   * @param {string} sessionId - 会话ID
   * @returns {Promise<Object>} 完整训练数据
   */
  async getFullTraining(sessionId) {
    const session = await this.sessionRepo.findById(sessionId);
    if (!session) {
      return null;
    }

    const messages = await this.messageRepo.findBySessionId(sessionId, { order: 'ASC' });
    const roundResults = await this.roundResultRepo.findBySessionId(sessionId, { order: 'ASC' });

    return {
      session,
      messages,
      roundResults,
      totalRounds: session.totalRounds,
      status: session.status
    };
  }

  /**
   * 查询训练会话列表
   * 
   * @param {Object} filters - 过滤条件
   * @param {Object} pagination - 分页参数
   * @returns {Promise<Object>} 会话列表
   */
  async listSessions(filters = {}, pagination = { page: 1, limit: 20 }) {
    return await this.sessionRepo.findMany(filters, pagination);
  }

  /**
   * 查询活跃的训练会话
   * 
   * @param {string} chatId - Telegram chat ID
   * @returns {Promise<Object>} 活跃会话
   */
  async getActiveSession(chatId) {
    return await this.sessionRepo.findActiveByChatId(chatId);
  }
}

module.exports = { TrainingRecordService };
