/**
 * MySQL-based Live Session Repository 实现
 * 
 * 基于MySQL的实时会话数据持久化
 */

const { LiveSessionsRepository } = require('../../../repositories/live-sessions-repository');
const { getPool } = require('./mysql-pool');

class MySQLLiveSessionRepository extends LiveSessionsRepository {
  constructor(poolOrConfig = null) {
    super();
    this.pool = poolOrConfig || getPool();
  }

  /**
   * 生成会话ID
   */
  _generateId() {
    return `live_sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 数据库行转对象
   */
  _rowToObject(row) {
    if (!row) return null;
    
    return {
      id: row.id,
      sessionId: row.session_id,
      project: row.project,
      chatId: row.chat_id,
      agentId: row.agent_id,
      status: row.status,
      startedAt: row.started_at,
      updatedAt: row.updated_at,
      createdAt: row.created_at
    };
  }

  /**
   * 创建实时会话
   */
  async create(sessionData) {
    const sessionId = sessionData.sessionId || this._generateId();
    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
    
    const sql = `
      INSERT INTO live_sessions (session_id, project, chat_id, agent_id, status, started_at, updated_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    await this.pool.query(sql, [
      sessionId,
      sessionData.project || 'default',
      sessionData.chatId || '',
      sessionData.agentId || null,
      sessionData.status || 'active',
      sessionData.startedAt || now,
      sessionData.updatedAt || now,
      now
    ]);
    
    console.log('[MySQLLiveSessionRepo] 创建实时会话:', sessionId);
    
    return this.findById(sessionId);
  }

  /**
   * 按 sessionId 查询实时会话
   */
  async findById(sessionId) {
    const sql = `SELECT * FROM live_sessions WHERE session_id = ?`;
    const row = await this.pool.queryOne(sql, [sessionId]);
    return this._rowToObject(row);
  }

  /**
   * 更新实时会话
   */
  async update(sessionId, updates) {
    const fields = [];
    const params = [];
    
    if (updates.project !== undefined) {
      fields.push('project = ?');
      params.push(updates.project);
    }
    if (updates.chatId !== undefined) {
      fields.push('chat_id = ?');
      params.push(updates.chatId);
    }
    if (updates.agentId !== undefined) {
      fields.push('agent_id = ?');
      params.push(updates.agentId);
    }
    if (updates.status !== undefined) {
      fields.push('status = ?');
      params.push(updates.status);
    }
    
    fields.push('updated_at = ?');
    params.push(new Date().toISOString().replace('T', ' ').substring(0, 19));
    
    params.push(sessionId);
    
    const sql = `UPDATE live_sessions SET ${fields.join(', ')} WHERE session_id = ?`;
    await this.pool.query(sql, params);
    
    console.log('[MySQLLiveSessionRepo] 更新实时会话:', sessionId);
    
    return this.findById(sessionId);
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
    const conditions = [];
    const params = [];
    
    if (filters.project) {
      conditions.push('project = ?');
      params.push(filters.project);
    }
    if (filters.chatId) {
      conditions.push('chat_id = ?');
      params.push(filters.chatId);
    }
    if (filters.status) {
      conditions.push('status = ?');
      params.push(filters.status);
    }
    
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    
    // 查询总数
    const countSql = `SELECT COUNT(*) as total FROM live_sessions ${whereClause}`;
    const countResult = await this.pool.queryOne(countSql, params);
    const total = countResult.total;
    
    // 查询数据
    const limit = pagination.limit || 20;
    const offset = ((pagination.page || 1) - 1) * limit;
    
    const dataSql = `SELECT * FROM live_sessions ${whereClause} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;
    const rows = await this.pool.queryMany(dataSql, params);
    
    return {
      items: rows.map(row => this._rowToObject(row)),
      total
    };
  }
}

module.exports = { MySQLLiveSessionRepository };
