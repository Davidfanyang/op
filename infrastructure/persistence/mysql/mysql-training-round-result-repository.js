/**
 * MySQL-based Training Round Result Repository 实现
 * 
 * 基于MySQL的训练轮次结果数据持久化
 */

const { TrainingRoundResultRepository } = require('../../../repositories/training-round-result-repository');
const { getPool } = require('./mysql-pool');

class MySQLTrainingRoundResultRepository extends TrainingRoundResultRepository {
  constructor(poolOrConfig = null) {
    super();
    this.pool = poolOrConfig || getPool();
  }

  /**
   * 数据库行转对象
   */
  _rowToObject(row) {
    if (!row) return null;
    
    // mysql2 会自动解析 JSON 字段
    const analysisRaw = typeof row.analysis_raw === 'string' 
      ? JSON.parse(row.analysis_raw) 
      : row.analysis_raw;
    
    const structuredFeedback = typeof row.structured_feedback === 'string'
      ? JSON.parse(row.structured_feedback)
      : row.structured_feedback;
    
    return {
      id: row.id,
      sessionId: row.session_id,
      round: row.round,
      scenarioId: row.scenario_id,
      scenarioTitle: row.scenario_title,
      analysisRaw,
      feedbackText: row.feedback_text,
      structuredFeedback,
      isFinished: row.is_finished === 1,
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
      scenario_id: data.scenarioId,
      scenario_title: data.scenarioTitle,
      analysis_raw: typeof data.analysisRaw === 'string' 
        ? data.analysisRaw 
        : JSON.stringify(data.analysisRaw),
      feedback_text: data.feedbackText,
      structured_feedback: typeof data.structuredFeedback === 'string'
        ? data.structuredFeedback
        : JSON.stringify(data.structuredFeedback),
      is_finished: data.isFinished ? 1 : 0
    };
  }

  /**
   * 保存训练轮次结果
   */
  async save(resultData) {
    const row = this._objectToRow(resultData);
    
    const sql = `
      INSERT INTO training_round_results (
        session_id, round, scenario_id, scenario_title, 
        analysis_raw, feedback_text, structured_feedback, is_finished
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    const result = await this.pool.insert(sql, [
      row.session_id,
      row.round,
      row.scenario_id,
      row.scenario_title,
      row.analysis_raw,
      row.feedback_text,
      row.structured_feedback,
      row.is_finished
    ]);
    
    // 返回插入的结果（带id）
    return {
      id: result.insertId || result.lastInsertId,
      ...row,
      created_at: new Date()
    };
  }

  /**
   * 按 sessionId 拉取轮次结果列表
   */
  async findBySessionId(sessionId, options = {}) {
    const limit = options.limit || 100;
    const offset = options.offset || 0;
    const order = options.order === 'DESC' ? 'DESC' : 'ASC';
    
    // mysql2 execute 不支持 LIMIT/OFFSET 使用参数，需要直接拼接
    const sql = `
      SELECT * FROM training_round_results 
      WHERE session_id = ?
      ORDER BY round ${order}, id ${order}
      LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}
    `;
    
    const rows = await this.pool.queryMany(sql, [sessionId]);
    return rows.map(row => this._rowToObject(row));
  }

  /**
   * 按 sessionId 和 round 查询轮次结果
   */
  async findBySessionAndRound(sessionId, round) {
    const sql = `
      SELECT * FROM training_round_results 
      WHERE session_id = ? AND round = ?
      LIMIT 1
    `;
    
    const row = await this.pool.queryOne(sql, [sessionId, round]);
    return this._rowToObject(row);
  }

  /**
   * 查询轮次结果列表（支持过滤）
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
    
    if (filters.scenarioId) {
      conditions.push('scenario_id = ?');
      params.push(filters.scenarioId);
    }
    
    if (filters.isFinished !== undefined) {
      conditions.push('is_finished = ?');
      params.push(filters.isFinished ? 1 : 0);
    }
    
    const whereClause = conditions.length > 0 
      ? `WHERE ${conditions.join(' AND ')}` 
      : '';
    
    // 查询总数
    const countSql = `SELECT COUNT(*) as total FROM training_round_results ${whereClause}`;
    const countRow = await this.pool.queryOne(countSql, params);
    const total = countRow.total;
    
    // 分页查询
    const limit = parseInt(pagination.limit) || 50;
    const offset = (pagination.page - 1) * limit;
    const sql = `
      SELECT * FROM training_round_results ${whereClause}
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}`;
    
    const rows = await this.pool.queryMany(sql, params);
    
    return {
      items: rows.map(row => this._rowToObject(row)),
      total
    };
  }

  /**
   * 统计会话的轮次结果数量
   */
  async countBySessionId(sessionId) {
    const sql = `SELECT COUNT(*) as count FROM training_round_results WHERE session_id = ?`;
    const row = await this.pool.queryOne(sql, [sessionId]);
    return row.count || 0;
  }

  /**
   * 查询最后一轮结果
   */
  async findLastResult(sessionId) {
    const sql = `
      SELECT * FROM training_round_results 
      WHERE session_id = ?
      ORDER BY round DESC, id DESC
      LIMIT 1
    `;
    
    const row = await this.pool.queryOne(sql, [sessionId]);
    return this._rowToObject(row);
  }

  /**
   * 按 sessionId 查询轮次结果列表（按轮次排序）
   */
  async findBySessionIdOrdered(sessionId) {
    const sql = `
      SELECT * FROM training_round_results 
      WHERE session_id = ?
      ORDER BY round ASC, id ASC
    `;
    
    const rows = await this.pool.queryMany(sql, [sessionId]);
    return rows.map(row => this._rowToObject(row));
  }
}

module.exports = { MySQLTrainingRoundResultRepository };
