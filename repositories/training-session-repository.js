/**
 * Training Session Repository 接口定义
 * 
 * 职责：训练会话数据持久化抽象层
 * 实现方式：File / Database / Cache
 */

/**
 * TrainingSession 数据结构
 * @typedef {Object} TrainingSession
 * @property {string} sessionId - 训练会话唯一ID
 * @property {string} project - 项目标识
 * @property {string} scenarioId - 场景ID
 * @property {string} scenarioTitle - 场景标题
 * @property {string} agentId - 客服ID
 * @property {string} chatId - Telegram chat ID
 * @property {string} status - 状态: running/finished/cancelled
 * @property {number} totalRounds - 总轮次
 * @property {Date} startedAt - 训练开始时间
 * @property {Date} finishedAt - 训练结束时间
 * @property {Date} createdAt - 创建时间
 * @property {Date} updatedAt - 更新时间
 */

class TrainingSessionRepository {
  /**
   * 创建训练会话
   * @param {Object} sessionData - 会话数据
   * @returns {Promise<TrainingSession>} 创建的会话
   */
  async create(sessionData) {
    throw new Error('Method not implemented');
  }

  /**
   * 按 sessionId 查询训练会话
   * @param {string} sessionId - 会话ID
   * @returns {Promise<TrainingSession|null>} 会话对象
   */
  async findById(sessionId) {
    throw new Error('Method not implemented');
  }

  /**
   * 按 chatId 查询最新的进行中的训练会话
   * @param {string} chatId - Telegram chat ID
   * @returns {Promise<TrainingSession|null>} 会话对象
   */
  async findActiveByChatId(chatId) {
    throw new Error('Method not implemented');
  }

  /**
   * 更新训练会话状态
   * @param {string} sessionId - 会话ID
   * @param {string} status - 新状态
   * @param {Object} updates - 其他更新字段
   * @returns {Promise<TrainingSession>} 更新后的会话
   */
  async updateStatus(sessionId, status, updates = {}) {
    throw new Error('Method not implemented');
  }

  /**
   * 更新训练总轮次
   * @param {string} sessionId - 会话ID
   * @param {number} totalRounds - 总轮次
   * @returns {Promise<TrainingSession>} 更新后的会话
   */
  async updateTotalRounds(sessionId, totalRounds) {
    throw new Error('Method not implemented');
  }

  /**
   * 查询训练会话列表
   * @param {Object} filters - 过滤条件
   * @param {Object} pagination - 分页参数
   * @returns {Promise<{items: TrainingSession[], total: number}>}
   */
  async findMany(filters, pagination = { page: 1, limit: 20 }) {
    throw new Error('Method not implemented');
  }

  /**
   * 完成训练会话
   * @param {string} sessionId - 会话ID
   * @param {Object} finishData - 完成数据 { status, totalRounds, finishedAt }
   * @returns {Promise<TrainingSession>}
   */
  async finish(sessionId, finishData = {}) {
    throw new Error('Method not implemented');
  }
}

module.exports = { TrainingSessionRepository };
