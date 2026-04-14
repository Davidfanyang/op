/**
 * File-based Message Repository 实现
 * 
 * 基于文件系统的消息持久化
 */

const fs = require('fs').promises;
const path = require('path');
const { MessageRepository } = require('../../../repositories/message-repository');

class FileMessageRepository extends MessageRepository {
  constructor(basePath = './runtime/persistence/messages') {
    super();
    this.basePath = path.resolve(basePath);
    this.messagesFile = path.join(this.basePath, 'messages.json');
    this.indexFile = path.join(this.basePath, 'message-index.json');
    this._initialized = false;
  }

  async _ensureInitialized() {
    if (this._initialized) return;
    
    try {
      await fs.mkdir(this.basePath, { recursive: true });
      try {
        await fs.access(this.messagesFile);
      } catch {
        await fs.writeFile(this.messagesFile, JSON.stringify([], null, 2));
      }
      try {
        await fs.access(this.indexFile);
      } catch {
        await fs.writeFile(this.indexFile, JSON.stringify({
          bySession: {},
          byEvaluation: {}
        }, null, 2));
      }
    } catch (err) {
      console.error('Failed to initialize message storage:', err);
      throw err;
    }
    this._initialized = true;
  }

  async _readMessages() {
    try {
      const data = await fs.readFile(this.messagesFile, 'utf8');
      return JSON.parse(data);
    } catch {
      return [];
    }
  }

  async _writeMessages(messages) {
    await fs.writeFile(this.messagesFile, JSON.stringify(messages, null, 2));
  }

  async _readIndex() {
    try {
      const data = await fs.readFile(this.indexFile, 'utf8');
      return JSON.parse(data);
    } catch {
      return { bySession: {}, byEvaluation: {} };
    }
  }

  async _writeIndex(index) {
    await fs.writeFile(this.indexFile, JSON.stringify(index, null, 2));
  }

  _generateId() {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  async save(messageData) {
    await this._ensureInitialized();
    const messageId = messageData.messageId || this._generateId();
    const now = new Date().toISOString();
    
    const message = {
      messageId,
      sessionId: messageData.sessionId,
      projectId: messageData.projectId,
      channel: messageData.channel || 'unknown',
      employeeId: messageData.employeeId,
      customerId: messageData.customerId,
      direction: messageData.direction, // inbound/outbound
      content: messageData.content,
      messageType: messageData.messageType || 'text',
      timestamp: messageData.timestamp || now,
      rawPayload: messageData.rawPayload || {},
      normalized: messageData.normalized || {},
      evaluationId: messageData.evaluationId || null,
      createdAt: now
    };

    const messages = await this._readMessages();
    messages.push(message);
    await this._writeMessages(messages);

    // 更新索引
    const index = await this._readIndex();
    if (!index.bySession[message.sessionId]) {
      index.bySession[message.sessionId] = [];
    }
    index.bySession[message.sessionId].push(messageId);
    await this._writeIndex(index);

    return message;
  }

  async findById(messageId) {
    await this._ensureInitialized();
    const messages = await this._readMessages();
    return messages.find(m => m.messageId === messageId) || null;
  }

  async findBySessionId(sessionId, options = {}) {
    await this._ensureInitialized();
    const index = await this._readIndex();
    const messageIds = index.bySession[sessionId] || [];
    
    const messages = await this._readMessages();
    let result = messages.filter(m => messageIds.includes(m.messageId));
    
    // 排序
    const order = options.order || 'asc';
    result.sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime();
      const timeB = new Date(b.timestamp).getTime();
      return order === 'asc' ? timeA - timeB : timeB - timeA;
    });
    
    // 分页
    if (options.offset || options.limit) {
      const offset = options.offset || 0;
      const limit = options.limit || result.length;
      result = result.slice(offset, offset + limit);
    }
    
    return result;
  }

  async findMany(filters = {}, pagination = { page: 1, limit: 50 }) {
    await this._ensureInitialized();
    let messages = await this._readMessages();
    
    // 应用过滤
    if (filters.projectId) {
      messages = messages.filter(m => m.projectId === filters.projectId);
    }
    if (filters.sessionId) {
      messages = messages.filter(m => m.sessionId === filters.sessionId);
    }
    if (filters.employeeId) {
      messages = messages.filter(m => m.employeeId === filters.employeeId);
    }
    if (filters.direction) {
      messages = messages.filter(m => m.direction === filters.direction);
    }
    if (filters.hasEvaluation !== undefined) {
      messages = messages.filter(m => 
        filters.hasEvaluation ? m.evaluationId : !m.evaluationId
      );
    }
    
    // 排序
    messages.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    const total = messages.length;
    const start = (pagination.page - 1) * pagination.limit;
    const items = messages.slice(start, start + pagination.limit);
    
    return { items, total };
  }

  async getLatestBySession(sessionId) {
    await this._ensureInitialized();
    const messages = await this.findBySessionId(sessionId, { order: 'desc', limit: 1 });
    return messages[0] || null;
  }

  async linkEvaluation(messageId, evaluationId) {
    await this._ensureInitialized();
    const messages = await this._readMessages();
    const index = messages.findIndex(m => m.messageId === messageId);
    
    if (index === -1) {
      throw new Error(`Message not found: ${messageId}`);
    }

    messages[index].evaluationId = evaluationId;
    await this._writeMessages(messages);

    // 更新索引
    const idx = await this._readIndex();
    idx.byEvaluation[evaluationId] = messageId;
    await this._writeIndex(idx);

    return messages[index];
  }
}

module.exports = { FileMessageRepository };
