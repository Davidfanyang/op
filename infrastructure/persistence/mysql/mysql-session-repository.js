/**
 * MySQL-based Session Repository 实现
 * 
 * 基于MySQL的会话数据持久化
 */

const { SessionRepository } = require('../../../repositories/session-repository');
const { getPool } = require('./mysql-pool');

class MySQLSessionRepository extends SessionRepository {
  constructor(poolOrConfig = null) {
    super();
    this.pool = poolOrConfig || getPool();
  }

  /**
   * 生成会话ID
   */
  _generateId() {
    return `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 数据库行转对象
   */
  _rowToObject(row) {
    if (!row) return null;
    
    // 处理 metadata_json 字段（可能已经是对象，也可能是字符串）
    let metadata = {};
    if (row.metadata_json) {
      if (typeof row.metadata_json === 'string') {
        try {
          metadata = JSON.parse(row.metadata_json);
        } catch (e) {
          console.error('[MySQLSessionRepository] Failed to parse metadata_json:', e.message);
          metadata = {};
        }
      } else if (typeof row.metadata_json === 'object') {
        metadata = row.metadata_json;
      }
    }
    
    return {
      sessionId: row.session_id,
      projectId: row.project_id,
      channel: row.channel,
      mode: row.mode,
      employeeId: row.employee_id,
      customerId: row.customer_id,
      sourceType: row.source_type,
      status: row.status,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      metadata: metadata,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  /**
   * 对象转数据库字段
   */
  _objectToRow(data) {
    return {
      session_id: data.sessionId || this._generateId(),
      project_id: data.projectId,
      channel: data.channel,
      mode: data.mode || 'training',
      employee_id: data.employeeId || null,
      customer_id: data.customerId || null,
      source_type: data.sourceType || null,
      status: data.status || 'active',
      started_at: data.startedAt || new Date(),
      ended_at: data.endedAt || null,
      metadata_json: data.metadata ? JSON.stringify(data.metadata) : null
    };
  }

  /**
   * 创建新会话
   */
  async create(sessionData) {
    const row = this._objectToRow(sessionData);
    
    const sql = `
      INSERT INTO sessions (
        session_id, project_id, channel, mode, employee_id, customer_id,
        source_type, status, started_at, ended_at, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    await this.pool.insert(sql, [
      row.session_id,
      row.project_id,
      row.channel,
      row.mode,
      row.employee_id,
      row.customer_id,
      row.source_type,
      row.status,
      row.started_at,
      row.ended_at,
      row.metadata_json
    ]);
    
    return this.findById(row.session_id);
  }

  /**
   * 按 sessionId 查询会话
   */
  async findById(sessionId) {
    const sql = `SELECT * FROM sessions WHERE session_id = ?`;
    const row = await this.pool.queryOne(sql, [sessionId]);
    return this._rowToObject(row);
  }

  /**
   * 按 projectId + channel + employeeId 查询最近活跃会话
   */
  async findActiveSession(projectId, channel, employeeId, options = {}) {
    let sql = `
      SELECT * FROM sessions 
      WHERE project_id = ? 
        AND channel = ? 
        AND employee_id = ?
        AND status = 'active'
      ORDER BY started_at DESC
      LIMIT 1
    `;
    
    const row = await this.pool.queryOne(sql, [projectId, channel, employeeId]);
    return this._rowToObject(row);
  }

  /**
   * 查询会话列表
   */
  async findMany(filters, pagination = { page: 1, limit: 20 }) {
    const conditions = [];
    const params = [];
    
    if (filters.projectId) {
      conditions.push('project_id = ?');
      params.push(filters.projectId);
    }
    
    if (filters.channel) {
      conditions.push('channel = ?');
      params.push(filters.channel);
    }
    
    if (filters.mode) {
      conditions.push('mode = ?');
      params.push(filters.mode);
    }
    
    if (filters.status) {
      conditions.push('status = ?');
      params.push(filters.status);
    }
    
    if (filters.employeeId) {
      conditions.push('employee_id = ?');
      params.push(filters.employeeId);
    }
    
    if (filters.customerId) {
      conditions.push('customer_id = ?');
      params.push(filters.customerId);
    }
    
    const whereClause = conditions.length > 0 
      ? `WHERE ${conditions.join(' AND ')}` 
      : '';
    
    // 查询总数
    const countSql = `SELECT COUNT(*) as total FROM sessions ${whereClause}`;
    const countRow = await this.pool.queryOne(countSql, params);
    const total = countRow.total;
    
    // 分页查询
    const limit = parseInt(pagination.limit) || 20;
    const offset = (pagination.page - 1) * limit;
    const sql = `
      SELECT * FROM sessions ${whereClause}
      ORDER BY started_at DESC
      LIMIT ${limit} OFFSET ${offset}`;
    
    const rows = await this.pool.queryMany(sql, params);
    
    return {
      items: rows.map(row => this._rowToObject(row)),
      total
    };
  }

  /**
   * 更新会话状态
   */
  async updateStatus(sessionId, status, updates = {}) {
    const fields = ['status = ?'];
    const params = [status];
    
    if (updates.endedAt !== undefined) {
      fields.push('ended_at = ?');
      params.push(updates.endedAt);
    }
    
    if (updates.metadata) {
      fields.push('metadata_json = ?');
      params.push(JSON.stringify(updates.metadata));
    }
    
    params.push(sessionId);
    
    const sql = `UPDATE sessions SET ${fields.join(', ')} WHERE session_id = ?`;
    await this.pool.update(sql, params);
    
    return this.findById(sessionId);
  }

  /**
   * 关闭会话
   */
  async close(sessionId, closeData = {}) {
    return this.updateStatus(sessionId, 'closed', {
      endedAt: closeData.endedAt || new Date(),
      ...closeData
    });
  }
}

module.exports = { MySQLSessionRepository };
