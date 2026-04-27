/**
 * 训练查询服务
 * 
 * 职责：
 * 1. 封装训练数据的查询逻辑
 * 2. 协调 training-session、training-message、training-round-result 三个 repository
 * 3. 提供标准化的查询接口供 API 层调用
 * 
 * 设计原则：
 * - 只读接口，不修改数据
 * - 不允许返回数据库原始字段
 * - 不允许混入实时质检数据
 * - 不影响训练主流程
 */

const { MySQLTrainingSessionRepository } = require('../infrastructure/persistence/mysql/mysql-training-session-repository');
const { MySQLTrainingMessageRepository } = require('../infrastructure/persistence/mysql/mysql-training-message-repository');
const { MySQLTrainingRoundResultRepository } = require('../infrastructure/persistence/mysql/mysql-training-round-result-repository');

// 单例模式
let instance = null;

class TrainingQueryService {
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
      instance = new TrainingQueryService();
    }
    return instance;
  }

  /**
   * 查询训练会话列表（支持筛选和分页）
   * 
   * @param {Object} filters - 过滤条件
   * @param {string} filters.project - 项目标识
   * @param {string} filters.agentId - 客服ID
   * @param {string} filters.scenarioId - 场景ID
   * @param {string} filters.status - 状态
   * @param {string} filters.startTime - 开始时间
   * @param {string} filters.endTime - 结束时间
   * @param {Object} pagination - 分页参数
   * @param {number} pagination.page - 页码（从1开始）
   * @param {number} pagination.pageSize - 每页数量（最大100）
   * @returns {Promise<Object>} 会话列表和分页信息
   */
  async findTrainingSessions(filters = {}, pagination = {}) {
    const page = Math.max(1, parseInt(pagination.page) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(pagination.pageSize) || 20));
    
    // 构建过滤条件
    const queryFilters = {};
    
    if (filters.project) {
      queryFilters.project = filters.project;
    }
    
    if (filters.agentId) {
      queryFilters.agentId = filters.agentId;
    }
    
    if (filters.scenarioId) {
      queryFilters.scenarioId = filters.scenarioId;
    }
    
    if (filters.status) {
      queryFilters.status = filters.status;
    }
    
    if (filters.startTime) {
      queryFilters.startTime = filters.startTime;
    }
    
    if (filters.endTime) {
      queryFilters.endTime = filters.endTime;
    }
    
    // 查询总数
    const total = await this.sessionRepo.countSessions(queryFilters);
    
    // 查询列表
    const result = await this.sessionRepo.findMany(queryFilters, { 
      page, 
      limit: pageSize 
    });
    
    // 格式化返回数据
    const items = result.items.map(session => this._formatSession(session));
    
    return {
      items,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize)
      }
    };
  }

  /**
   * 根据 session_id 查询训练会话详情
   * 
   * @param {string} sessionId - 会话ID
   * @returns {Promise<Object>} 完整的训练会话详情
   */
  async getTrainingSessionById(sessionId) {
    const session = await this.sessionRepo.findById(sessionId);
    
    if (!session) {
      return null;
    }
    
    // 查询消息列表
    const messages = await this.messageRepo.findBySessionIdOrdered(sessionId);
    
    // 查询轮次结果列表
    const roundResults = await this.roundResultRepo.findBySessionIdOrdered(sessionId);
    
    // 组装完整详情
    return {
      session: this._formatSession(session),
      messages: messages.map(msg => this._formatMessage(msg)),
      roundResults: roundResults.map(result => this._formatRoundResult(result)),
      feedbackText: roundResults.length > 0 ? roundResults[roundResults.length - 1].feedback_text : null,
      structuredFeedback: roundResults.length > 0 ? roundResults[roundResults.length - 1].structured_feedback : null
    };
  }

  /**
   * 查询训练会话的轮次结果列表
   * 
   * @param {string} sessionId - 会话ID
   * @returns {Promise<Object>} 轮次结果列表
   */
  async listTrainingRoundResultsBySessionId(sessionId) {
    const session = await this.sessionRepo.findById(sessionId);
    
    if (!session) {
      return null;
    }
    
    const roundResults = await this.roundResultRepo.findBySessionIdOrdered(sessionId);
    
    return {
      session: this._formatSession(session),
      roundResults: roundResults.map(result => this._formatRoundResult(result))
    };
  }

  /**
   * 查询训练会话的消息列表
   * 
   * @param {string} sessionId - 会话ID
   * @returns {Promise<Object>} 消息列表
   */
  async listTrainingMessagesBySessionId(sessionId) {
    const session = await this.sessionRepo.findById(sessionId);
    
    if (!session) {
      return null;
    }
    
    const messages = await this.messageRepo.findBySessionIdOrdered(sessionId);
    
    return {
      session: this._formatSession(session),
      messages: messages.map(msg => this._formatMessage(msg))
    };
  }

  /**
   * 聚合训练统计数据
   * 
   * @param {Object} filters - 过滤条件
   * @param {string} filters.project - 项目标识
   * @param {string} filters.agentId - 客服ID
   * @param {string} filters.scenarioId - 场景ID
   * @param {string} filters.startTime - 开始时间
   * @param {string} filters.endTime - 结束时间
   * @returns {Promise<Object>} 统计数据
   */
  async aggregateTrainingStats(filters = {}) {
    const queryFilters = {};
    
    if (filters.project) {
      queryFilters.project = filters.project;
    }
    
    if (filters.agentId) {
      queryFilters.agentId = filters.agentId;
    }
    
    if (filters.scenarioId) {
      queryFilters.scenarioId = filters.scenarioId;
    }
    
    if (filters.startTime) {
      queryFilters.startTime = filters.startTime;
    }
    
    if (filters.endTime) {
      queryFilters.endTime = filters.endTime;
    }
    
    const stats = await this.sessionRepo.aggregateStats(queryFilters);
    
    return this._formatStats(stats);
  }

  /**
   * 格式化会话数据（去除数据库原始字段）
   */
  _formatSession(session) {
    if (!session) return null;
    
    return {
      sessionId: session.sessionId,
      project: session.project,
      scenarioId: session.scenarioId,
      scenarioTitle: session.scenarioTitle,
      agentId: session.agentId,
      chatId: session.chatId,
      status: session.status,
      totalRounds: session.totalRounds,
      startedAt: session.startedAt,
      finishedAt: session.finishedAt,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt
    };
  }

  /**
   * 格式化消息数据
   */
  _formatMessage(message) {
    if (!message) return null;
    
    return {
      id: message.id,
      sessionId: message.sessionId,
      round: message.round,
      role: message.role,
      content: message.content,
      source: message.source,
      createdAt: message.createdAt
    };
  }

  /**
   * 格式化轮次结果数据
   */
  _formatRoundResult(result) {
    if (!result) return null;
    
    return {
      id: result.id,
      sessionId: result.sessionId,
      round: result.round,
      scenarioId: result.scenarioId,
      scenarioTitle: result.scenarioTitle,
      analysisRaw: result.analysisRaw,
      feedbackText: result.feedbackText,
      structuredFeedback: result.structuredFeedback,
      isFinished: result.isFinished,
      createdAt: result.createdAt
    };
  }

  /**
   * 格式化统计数据
   */
  _formatStats(stats) {
    if (!stats) return null;
    
    return {
      totalSessions: stats.totalSessions,
      finishedSessions: stats.finishedSessions,
      runningSessions: stats.runningSessions,
      cancelledSessions: stats.cancelledSessions,
      avgRounds: stats.avgRounds,
      maxRounds: stats.maxRounds,
      byScenario: stats.byScenario || [],
      byAgent: stats.byAgent || []
    };
  }
}

module.exports = { TrainingQueryService };
