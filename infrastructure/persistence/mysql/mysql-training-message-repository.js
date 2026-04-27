/**
 * MySQL-based Training Message Repository 实现
 * 
 * 基于MySQL的训练消息数据持久化
 */

const { TrainingMessageRepository } = require('../../../repositories/training-message-repository');
const { getPool } = require('./mysql-pool');

class MySQLTrainingMessageRepository extends TrainingMessageRepository {
  constructor(poolOrConfig = null) {
    super();
    this.pool = poolOrConfig || getPool();
  }

  /**
   * 数据库行转对象
   */
  _rowToObject(row) {
    if (!row) return null;
    
    return {
      id: row.id,
      sessionId: row.session_id,
      round: row.round,
      role: row.role,
      content: row.content,
      source: row.source,
      createdAt: row.created_at
    };
  }

  /**
   * 对象转数据库字段
   */
  _objectToRow(data) {
    return {
      session_id: data.sessionId,
      round: data.round,
      role: data.role,
      content: data.content,
      source: data.source || 'ai'
    };
  }

  /**
   * 保存训练消息
   */
  async save(messageData) {
    const row = this._objectToRow(messageData);
    
    const sql = `
      INSERT INTO training_messages (
        session_id, round, role, content, source
      ) VALUES (?, ?, ?, ?, ?)
    `;
    
    const result = await this.pool.insert(sql, [
      row.session_id,
      row.round,
      row.role,
      row.content,
      row.source
    ]);
    
    // 返回插入的消息（带id）
    return {
      id: result.insertId || result.lastInsertId,
      ...row,
      created_at: new Date()
    };
  }

  /**
   * 批量保存训练消息
   */
  async saveBatch(messages) {
    if (!messages || messages.length === 0) {
      return [];
    }

    const sql = `
      INSERT INTO training_messages (
        session_id, round, role, content, source
      ) VALUES ?
    `;
    
    const values = messages.map(msg => {
      const row = this._objectToRow(msg);
      return [row.session_id, row.round, row.role, row.content, row.source];
    });
    
    const result = await this.pool.insert(sql, [values]);
    
    // 返回保存的消息列表
    return messages.map((msg, idx) => ({
      id: result.insertId || result.lastInsertId + idx,
      ...this._objectToRow(msg),
      created_at: new Date()
    }));
  }

  /**
   * 按 sessionId 拉取消息列表
   */
  async findBySessionId(sessionId, options = {}) {
    const limit = options.limit || 1000;
    const offset = options.offset || 0;
    const order = options.order === 'DESC' ? 'DESC' : 'ASC';
    
    // mysql2 execute 不支持 LIMIT/OFFSET 使用参数，需要直接拼接
    const sql = `
      SELECT * FROM training_messages 
      WHERE session_id = ?
      ORDER BY round ${order}, id ${order}
      LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}
    `;
    
    const rows = await this.pool.queryMany(sql, [sessionId]);
    return rows.map(row => this._rowToObject(row));
  }

  /**
   * 按 sessionId 和 round 查询消息
   */
  async findBySessionAndRound(sessionId, round) {
    const sql = `
      SELECT * FROM training_messages 
      WHERE session_id = ? AND round = ?
      ORDER BY id ASC
    `;
    
    const rows = await this.pool.queryMany(sql, [sessionId, round]);
    return rows.map(row => this._rowToObject(row));
  }

  /**
   * 查询消息列表（支持过滤）
   */
  async findMany(filters, pagination = { page: 1, limit: 50 }) {
    const conditions = [];
    const params = [];
    
    if (filters.sessionId) {
      conditions.push('session_id = ?');
      params.push(filters.sessionId);
    }
    
    if (filters.round !== undefined) {
      conditions.push('round = ?');
      params.push(filters.round);
    }
    
    if (filters.role) {
      conditions.push('role = ?');
      params.push(filters.role);
    }
    
    if (filters.source) {
      conditions.push('source = ?');
      params.push(filters.source);
    }
    
    const whereClause = conditions.length > 0 
      ? `WHERE ${conditions.join(' AND ')}` 
      : '';
    
    // 查询总数
    const countSql = `SELECT COUNT(*) as total FROM training_messages ${whereClause}`;
    const countRow = await this.pool.queryOne(countSql, params);
    const total = countRow.total;
    
    // 分页查询
    const limit = parseInt(pagination.limit) || 50;
    const offset = (pagination.page - 1) * limit;
    const sql = `
      SELECT * FROM training_messages ${whereClause}
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}`;
    
    const rows = await this.pool.queryMany(sql, params);
    
    return {
      items: rows.map(row => this._rowToObject(row)),
      total
    };
  }

  /**
   * 统计会话的消息数量
   */
  async countBySessionId(sessionId) {
    const sql = `SELECT COUNT(*) as count FROM training_messages WHERE session_id = ?`;
    const row = await this.pool.queryOne(sql, [sessionId]);
    return row.count || 0;
  }

  /**
   * 按 sessionId 查询消息列表（按轮次和 ID 排序）
   */
  async findBySessionIdOrdered(sessionId) {
    const sql = `
      SELECT * FROM training_messages 
      WHERE session_id = ?
      ORDER BY round ASC, id ASC
    `;
    
    const rows = await this.pool.queryMany(sql, [sessionId]);
    return rows.map(row => this._rowToObject(row));
  }
}

module.exports = { MySQLTrainingMessageRepository };
