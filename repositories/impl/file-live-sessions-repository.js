/**
 * Live Sessions Repository - 内存实现
 * 
 * 职责：实时会话数据的内存存储（用于开发和测试）
 * 生产环境应使用 MySQL 实现
 */

const { LiveSessionsRepository } = require('../live-sessions-repository');

class FileLiveSessionsRepository extends LiveSessionsRepository {
  constructor() {
    super();
    this.sessions = new Map();
  }

  /**
   * 创建实时会话
   */
  async create(sessionData) {
    const session = {
      sessionId: sessionData.sessionId,
      project: sessionData.project || 'default',
      chatId: sessionData.chatId,
      agentId: sessionData.agentId || null,
      status: sessionData.status || 'active',
      startedAt: sessionData.startedAt || new Date(),
      updatedAt: sessionData.updatedAt || new Date(),
      createdAt: new Date()
    };

    this.sessions.set(session.sessionId, session);
    console.log('[LiveSessionsRepo] 创建会话:', session.sessionId);
    
    return session;
  }

  /**
   * 按 sessionId 查询实时会话
   */
  async findById(sessionId) {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * 更新实时会话
   */
  async update(sessionId, updates) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`会话不存在: ${sessionId}`);
    }

    Object.assign(session, updates, { updatedAt: new Date() });
    this.sessions.set(sessionId, session);
    
    console.log('[LiveSessionsRepo] 更新会话:', sessionId);
    return session;
  }

  /**
   * 更新会话状态
   */
  async updateStatus(sessionId, status) {
    return this.update(sessionId, { status });
  }

  /**
   * 查询实时会话列表
   */
  async findMany(filters = {}, pagination = { page: 1, limit: 20 }) {
    let items = Array.from(this.sessions.values());

    // 过滤
    if (filters.project) {
      items = items.filter(s => s.project === filters.project);
    }
    if (filters.chatId) {
      items = items.filter(s => s.chatId === filters.chatId);
    }
    if (filters.status) {
      items = items.filter(s => s.status === filters.status);
    }

    // 分页
    const total = items.length;
    const start = (pagination.page - 1) * pagination.limit;
    const end = start + pagination.limit;
    items = items.slice(start, end);

    return { items, total };
  }
}

// 导出单例
const defaultRepo = new FileLiveSessionsRepository();

module.exports = {
  FileLiveSessionsRepository,
  defaultRepo
};
