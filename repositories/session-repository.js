/**
 * Session Repository 接口定义
 * 
 * 职责：会话数据持久化抽象层
 * 实现方式：File / Database / Cache
 */

/**
 * Session 数据结构
 * @typedef {Object} Session
 * @property {string} sessionId - 会话唯一ID
 * @property {string} projectId - 项目ID
 * @property {string} channel - 渠道 (telegram/whatsapp等)
 * @property {string} employeeId - 客服ID
 * @property {string} customerId - 客户ID
 * @property {string} status - 状态 (active/closed/pending)
 * @property {Date} createdAt - 创建时间
 * @property {Date} updatedAt - 更新时间
 * @property {Date} closedAt - 关闭时间
 * @property {Object} metadata - 扩展元数据
 */

class SessionRepository {
  /**
   * 创建新会话
   * @param {Object} sessionData - 会话数据
   * @returns {Promise<Session>} 创建的会话
   */
  async create(sessionData) {
    throw new Error('Method not implemented');
  }

  /**
   * 按 sessionId 查询会话
   * @param {string} sessionId - 会话ID
   * @returns {Promise<Session|null>} 会话对象
   */
  async findById(sessionId) {
    throw new Error('Method not implemented');
  }

  /**
   * 按 projectId + channel + employeeId 查询最近活跃会话
   * @param {string} projectId - 项目ID
   * @param {string} channel - 渠道
   * @param {string} employeeId - 客服ID
   * @param {Object} options - 查询选项
   * @returns {Promise<Session|null>} 最近活跃会话
   */
  async findActiveSession(projectId, channel, employeeId, options = {}) {
    throw new Error('Method not implemented');
  }

  /**
   * 查询会话列表
   * @param {Object} filters - 过滤条件
   * @param {Object} pagination - 分页参数
   * @returns {Promise<{items: Session[], total: number}>}
   */
  async findMany(filters, pagination = { page: 1, limit: 20 }) {
    throw new Error('Method not implemented');
  }

  /**
   * 更新会话状态
   * @param {string} sessionId - 会话ID
   * @param {string} status - 新状态
   * @param {Object} updates - 其他更新字段
   * @returns {Promise<Session>} 更新后的会话
   */
  async updateStatus(sessionId, status, updates = {}) {
    throw new Error('Method not implemented');
  }

  /**
   * 关闭会话
   * @param {string} sessionId - 会话ID
   * @param {Object} closeData - 关闭数据
   * @returns {Promise<Session>}
   */
  async close(sessionId, closeData = {}) {
    throw new Error('Method not implemented');
  }
}

module.exports = { SessionRepository };
