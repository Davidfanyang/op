/**
 * Message Repository 接口定义
 * 
 * 职责：消息数据持久化抽象层
 */

/**
 * Message 数据结构
 * @typedef {Object} Message
 * @property {string} messageId - 消息唯一ID
 * @property {string} sessionId - 所属会话ID
 * @property {string} projectId - 项目ID
 * @property {string} channel - 渠道
 * @property {string} employeeId - 客服ID
 * @property {string} customerId - 客户ID
 * @property {string} direction - 方向 (inbound/outbound)
 * @property {string} content - 消息内容
 * @property {string} messageType - 消息类型 (text/image/file)
 * @property {Date} timestamp - 消息时间戳
 * @property {Object} rawPayload - 原始payload
 * @property {Object} normalized - 标准化字段
 * @property {Date} createdAt - 创建时间
 */

class MessageRepository {
  /**
   * 保存消息
   * @param {Object} messageData - 消息数据
   * @returns {Promise<Message>} 保存的消息
   */
  async save(messageData) {
    throw new Error('Method not implemented');
  }

  /**
   * 按 messageId 查询消息
   * @param {string} messageId - 消息ID
   * @returns {Promise<Message|null>}
   */
  async findById(messageId) {
    throw new Error('Method not implemented');
  }

  /**
   * 按 sessionId 拉取消息列表
   * @param {string} sessionId - 会话ID
   * @param {Object} options - 查询选项 { limit, offset, order }
   * @returns {Promise<Message[]>}
   */
  async findBySessionId(sessionId, options = {}) {
    throw new Error('Method not implemented');
  }

  /**
   * 查询消息列表（支持过滤）
   * @param {Object} filters - 过滤条件
   * @param {Object} pagination - 分页参数
   * @returns {Promise<{items: Message[], total: number}>}
   */
  async findMany(filters, pagination = { page: 1, limit: 50 }) {
    throw new Error('Method not implemented');
  }

  /**
   * 获取会话最新消息
   * @param {string} sessionId - 会话ID
   * @returns {Promise<Message|null>}
   */
  async getLatestBySession(sessionId) {
    throw new Error('Method not implemented');
  }

  /**
   * 更新消息评估关联
   * @param {string} messageId - 消息ID
   * @param {string} evaluationId - 评估ID
   * @returns {Promise<Message>}
   */
  async linkEvaluation(messageId, evaluationId) {
    throw new Error('Method not implemented');
  }
}

module.exports = { MessageRepository };
