/**
 * File-based Session Repository 实现
 * 
 * 基于文件系统的会话持久化（用于开发和测试）
 */

const fs = require('fs').promises;
const path = require('path');
const { SessionRepository } = require('../../../repositories/session-repository');

class FileSessionRepository extends SessionRepository {
  constructor(basePath = './runtime/persistence/sessions') {
    super();
    this.basePath = path.resolve(basePath);
    this.sessionsFile = path.join(this.basePath, 'sessions.json');
    this.indexFile = path.join(this.basePath, 'index.json');
    this._initialized = false;
  }

  async _ensureInitialized() {
    if (this._initialized) return;
    
    try {
      await fs.mkdir(this.basePath, { recursive: true });
      // 初始化空文件
      try {
        await fs.access(this.sessionsFile);
      } catch {
        await fs.writeFile(this.sessionsFile, JSON.stringify([], null, 2));
      }
      try {
        await fs.access(this.indexFile);
      } catch {
        await fs.writeFile(this.indexFile, JSON.stringify({
          byProject: {},
          byEmployee: {},
          activeSessions: {}
        }, null, 2));
      }
      this._initialized = true;
    } catch (err) {
      console.error('Failed to initialize session storage:', err);
      throw err;
    }
  }

  async _readSessions() {
    try {
      const data = await fs.readFile(this.sessionsFile, 'utf8');
      return JSON.parse(data);
    } catch {
      return [];
    }
  }

  async _writeSessions(sessions) {
    await fs.writeFile(this.sessionsFile, JSON.stringify(sessions, null, 2));
  }

  async _readIndex() {
    try {
      const data = await fs.readFile(this.indexFile, 'utf8');
      return JSON.parse(data);
    } catch {
      return { byProject: {}, byEmployee: {}, activeSessions: {} };
    }
  }

  async _writeIndex(index) {
    await fs.writeFile(this.indexFile, JSON.stringify(index, null, 2));
  }

  _generateId() {
    return `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  async create(sessionData) {
    await this._ensureInitialized();
    const sessionId = sessionData.sessionId || this._generateId();
    const now = new Date().toISOString();
    
    const session = {
      sessionId,
      projectId: sessionData.projectId,
      channel: sessionData.channel || 'unknown',
      employeeId: sessionData.employeeId,
      customerId: sessionData.customerId,
      status: sessionData.status || 'active',
      createdAt: now,
      updatedAt: now,
      closedAt: null,
      metadata: sessionData.metadata || {}
    };

    const sessions = await this._readSessions();
    sessions.push(session);
    await this._writeSessions(sessions);

    // 更新索引
    const index = await this._readIndex();
    const key = `${sessionData.projectId}:${sessionData.channel}:${sessionData.employeeId}`;
    index.activeSessions[key] = sessionId;
    
    if (!index.byProject[sessionData.projectId]) {
      index.byProject[sessionData.projectId] = [];
    }
    index.byProject[sessionData.projectId].push(sessionId);
    
    await this._writeIndex(index);

    return session;
  }

  async findById(sessionId) {
    await this._ensureInitialized();
    const sessions = await this._readSessions();
    return sessions.find(s => s.sessionId === sessionId) || null;
  }

  async findActiveSession(projectId, channel, employeeId, options = {}) {
    await this._ensureInitialized();
    const index = await this._readIndex();
    const key = `${projectId}:${channel}:${employeeId}`;
    const sessionId = index.activeSessions[key];
    
    if (!sessionId) return null;
    
    const session = await this.findById(sessionId);
    
    // 检查会话是否仍然活跃
    if (session && session.status === 'active') {
      // 检查超时（默认30分钟）
      const timeout = options.timeout || 30 * 60 * 1000;
      const lastActivity = new Date(session.updatedAt).getTime();
      if (Date.now() - lastActivity < timeout) {
        return session;
      }
    }
    
    return null;
  }

  async findMany(filters = {}, pagination = { page: 1, limit: 20 }) {
    await this._ensureInitialized();
    let sessions = await this._readSessions();
    
    // 应用过滤
    if (filters.projectId) {
      sessions = sessions.filter(s => s.projectId === filters.projectId);
    }
    if (filters.status) {
      sessions = sessions.filter(s => s.status === filters.status);
    }
    if (filters.employeeId) {
      sessions = sessions.filter(s => s.employeeId === filters.employeeId);
    }
    if (filters.channel) {
      sessions = sessions.filter(s => s.channel === filters.channel);
    }
    
    // 排序（默认按创建时间倒序）
    sessions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    const total = sessions.length;
    const start = (pagination.page - 1) * pagination.limit;
    const items = sessions.slice(start, start + pagination.limit);
    
    return { items, total };
  }

  async updateStatus(sessionId, status, updates = {}) {
    await this._ensureInitialized();
    const sessions = await this._readSessions();
    const index = sessions.findIndex(s => s.sessionId === sessionId);
    
    if (index === -1) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    sessions[index] = {
      ...sessions[index],
      status,
      updatedAt: new Date().toISOString(),
      ...updates
    };

    await this._writeSessions(sessions);
    return sessions[index];
  }

  async close(sessionId, closeData = {}) {
    await this._ensureInitialized();
    const session = await this.updateStatus(sessionId, 'closed', {
      closedAt: new Date().toISOString(),
      ...closeData
    });

    // 从活跃会话索引中移除
    const index = await this._readIndex();
    const key = `${session.projectId}:${session.channel}:${session.employeeId}`;
    if (index.activeSessions[key] === sessionId) {
      delete index.activeSessions[key];
      await this._writeIndex(index);
    }

    return session;
  }
}

module.exports = { FileSessionRepository };
