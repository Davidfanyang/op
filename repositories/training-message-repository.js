/**
 * Training Message Repository 接口定义
 * 
 * 职责：训练消息数据持久化抽象层
 */

/**
 * TrainingMessage 数据结构
 * @typedef {Object} TrainingMessage
 * @property {string} id - 消息ID（数据库自增）
 * @property {string} sessionId - 所属训练会话ID
 * @property {number} round - 轮次（从0开始）
 * @property {string} role - 角色: user/agent
 * @property {string} content - 消息内容
 * @property {string} source - 来源: ai/human
 * @property {Date} createdAt - 创建时间
 */

class TrainingMessageRepository {
  /**
   * 保存训练消息
   * @param {Object} messageData - 消息数据
   * @returns {Promise<TrainingMessage>} 保存的消息
   */
  async save(messageData) {
    throw new Error('Method not implemented');
  }

  /**
   * 批量保存训练消息
   * @param {Array} messages - 消息数组
   * @returns {Promise<Array>} 保存的消息数组
   */
  async saveBatch(messages) {
    throw new Error('Method not implemented');
  }

  /**
   * 按 sessionId 拉取消息列表
   * @param {string} sessionId - 会话ID
   * @param {Object} options - 查询选项 { limit, offset, order }
   * @returns {Promise<TrainingMessage[]>}
   */
  async findBySessionId(sessionId, options = {}) {
    throw new Error('Method not implemented');
  }

  /**
   * 按 sessionId 和 round 查询消息
   * @param {string} sessionId - 会话ID
   * @param {number} round - 轮次
   * @returns {Promise<TrainingMessage[]>}
   */
  async findBySessionAndRound(sessionId, round) {
    throw new Error('Method not implemented');
  }

  /**
   * 查询消息列表（支持过滤）
   * @param {Object} filters - 过滤条件
   * @param {Object} pagination - 分页参数
   * @returns {Promise<{items: TrainingMessage[], total: number}>}
   */
  async findMany(filters, pagination = { page: 1, limit: 50 }) {
    throw new Error('Method not implemented');
  }

  /**
   * 统计会话的消息数量
   * @param {string} sessionId - 会话ID
   * @returns {Promise<number>}
   */
  async countBySessionId(sessionId) {
    throw new Error('Method not implemented');
  }
}

module.exports = { TrainingMessageRepository };
