/**
 * Live Messages Repository - 内存实现
 */

const { LiveMessagesRepository } = require('../live-messages-repository');

class FileLiveMessagesRepository extends LiveMessagesRepository {
  constructor() {
    super();
    this.messages = new Map();
  }

  async create(messageData) {
    const message = {
      messageId: messageData.messageId,
      sessionId: messageData.sessionId,
      role: messageData.role,
      senderId: messageData.senderId,
      senderName: messageData.senderName || null,
      content: messageData.content,
      timestamp: messageData.timestamp || new Date(),
      createdAt: new Date()
    };

    this.messages.set(message.messageId, message);
    console.log('[LiveMessagesRepo] 创建消息:', message.messageId, '[', message.role, ']');
    
    return message;
  }

  async exists(messageId) {
    return this.messages.has(String(messageId));
  }

  async findById(messageId) {
    return this.messages.get(messageId) || null;
  }

  async findBySessionId(sessionId, options = {}) {
    let items = Array.from(this.messages.values())
      .filter(m => m.sessionId === sessionId);

    // 按时间排序
    items.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    return items;
  }

  async createBatch(messagesData) {
    const results = [];
    for (const data of messagesData) {
      const message = await this.create(data);
      results.push(message);
    }
    return results;
  }
}

const defaultRepo = new FileLiveMessagesRepository();

module.exports = {
  FileLiveMessagesRepository,
  defaultRepo
};
