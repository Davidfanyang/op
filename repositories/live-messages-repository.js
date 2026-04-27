/**
 * Live Messages Repository 接口定义
 * 
 * 职责：实时消息数据持久化抽象层
 * 实现方式：File / Database / Cache
 */

/**
 * LiveMessage 数据结构
 * @typedef {Object} LiveMessage
 * @property {string} messageId - Telegram 消息 ID
 * @property {string} sessionId - 所属实时会话 ID
 * @property {string} role - 消息角色: user/agent
 * @property {string} senderId - 发送人 ID
 * @property {string|null} senderName - 发送人显示名
 * @property {string} content - 消息内容
 * @property {Date} timestamp - 消息时间
 * @property {Date} createdAt - 入库时间
 */

class LiveMessagesRepository {
  /**
   * 创建实时消息
   * @param {Object} messageData - 消息数据
   * @returns {Promise<LiveMessage>} 创建的消息
   */
  async create(messageData) {
    throw new Error('Method not implemented');
  }

  /**
   * 检查消息是否已存在（按 message_id）
   * @param {string} messageId - 消息ID
   * @returns {Promise<boolean>} 是否存在
   */
  async exists(messageId) {
    throw new Error('Method not implemented');
  }

  /**
   * 按 sessionId 查询消息列表
   * @param {string} sessionId - 会话ID
   * @param {Object} options - 查询选项
   * @returns {Promise<LiveMessage[]>} 消息列表
   */
  async findBySessionId(sessionId, options = {}) {
    throw new Error('Method not implemented');
  }

  /**
   * 按 messageId 查询单条消息
   * @param {string} messageId - 消息ID
   * @returns {Promise<LiveMessage|null>} 消息对象或 null
   */
  async findById(messageId) {
    throw new Error('Method not implemented');
  }

  /**
   * 批量创建消息
   * @param {Array} messagesData - 消息数据数组
   * @returns {Promise<LiveMessage[]>} 创建的消息列表
   */
  async createBatch(messagesData) {
    throw new Error('Method not implemented');
  }
}

module.exports = { LiveMessagesRepository };
