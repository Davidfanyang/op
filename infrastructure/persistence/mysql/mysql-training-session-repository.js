/**
 * MySQL-based Training Session Repository 实现
 * 
 * 基于MySQL的训练会话数据持久化
 */

const { TrainingSessionRepository } = require('../../../repositories/training-session-repository');
const { getPool } = require('./mysql-pool');

class MySQLTrainingSessionRepository extends TrainingSessionRepository {
  constructor(poolOrConfig = null) {
    super();
    this.pool = poolOrConfig || getPool();
  }

  /**
   * 生成会话ID
   */
  _generateId() {
    return `train_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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
      scenarioId: row.scenario_id,
      scenarioTitle: row.scenario_title,
      agentId: row.agent_id,
      chatId: row.chat_id,
      status: row.status,
      totalRounds: row.total_rounds,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
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
      project: data.project || 'default',
      scenario_id: data.scenarioId,
      scenario_title: data.scenarioTitle,
      agent_id: data.agentId || null,
      chat_id: data.chatId,
      status: data.status || 'running',
      total_rounds: data.totalRounds || 0,
      started_at: data.startedAt || new Date(),
      finished_at: data.finishedAt || null
    };
  }

  /**
   * 创建训练会话
   */
  async create(sessionData) {
    const row = this._objectToRow(sessionData);
    
    const sql = `
      INSERT INTO training_sessions (
        session_id, project, scenario_id, scenario_title, agent_id, chat_id,
        status, total_rounds, started_at, finished_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    await this.pool.insert(sql, [
      row.session_id,
      row.project,
      row.scenario_id,
      row.scenario_title,
      row.agent_id,
      row.chat_id,
      row.status,
      row.total_rounds,
      row.started_at,
      row.finished_at
    ]);
    
    return this.findById(row.session_id);
  }

  /**
   * 按 sessionId 查询训练会话
   */
  async findById(sessionId) {
    const sql = `SELECT * FROM training_sessions WHERE session_id = ?`;
    const row = await this.pool.queryOne(sql, [sessionId]);
    return this._rowToObject(row);
  }

  /**
   * 按 chatId 查询最新的进行中的训练会话
   */
  async findActiveByChatId(chatId) {
    const sql = `
      SELECT * FROM training_sessions 
      WHERE chat_id = ? 
        AND status = 'running'
      ORDER BY started_at DESC
      LIMIT 1
    `;
    
    const row = await this.pool.queryOne(sql, [chatId]);
    return this._rowToObject(row);
  }

  /**
   * 更新训练会话状态
   */
  async updateStatus(sessionId, status, updates = {}) {
    const fields = ['status = ?'];
    const params = [status];
    
    if (updates.finishedAt !== undefined) {
      fields.push('finished_at = ?');
      params.push(updates.finishedAt);
    }
    
    if (updates.totalRounds !== undefined) {
      fields.push('total_rounds = ?');
      params.push(updates.totalRounds);
    }
    
    params.push(sessionId);
    
    const sql = `UPDATE training_sessions SET ${fields.join(', ')} WHERE session_id = ?`;
    await this.pool.update(sql, params);
    
    return this.findById(sessionId);
  }

  /**
   * 更新训练总轮次
   */
  async updateTotalRounds(sessionId, totalRounds) {
    const sql = `UPDATE training_sessions SET total_rounds = ? WHERE session_id = ?`;
    await this.pool.update(sql, [totalRounds, sessionId]);
    
    return this.findById(sessionId);
  }

  /**
   * 查询训练会话列表
   */
  async findMany(filters, pagination = { page: 1, limit: 20 }) {
    const conditions = [];
    const params = [];
    
    if (filters.project) {
      conditions.push('project = ?');
      params.push(filters.project);
    }
    
    if (filters.scenarioId) {
      conditions.push('scenario_id = ?');
      params.push(filters.scenarioId);
    }
    
    if (filters.agentId) {
      conditions.push('agent_id = ?');
      params.push(filters.agentId);
    }
    
    if (filters.chatId) {
      conditions.push('chat_id = ?');
      params.push(filters.chatId);
    }
    
    if (filters.status) {
      conditions.push('status = ?');
      params.push(filters.status);
    }
    
    const whereClause = conditions.length > 0 
      ? `WHERE ${conditions.join(' AND ')}` 
      : '';
    
    // 查询总数
    const countSql = `SELECT COUNT(*) as total FROM training_sessions ${whereClause}`;
    const countRow = await this.pool.queryOne(countSql, params);
    const total = countRow.total;
    
    // 分页查询
    const limit = parseInt(pagination.limit) || 20;
    const offset = (pagination.page - 1) * limit;
    const sql = `
      SELECT * FROM training_sessions ${whereClause}
      ORDER BY started_at DESC
      LIMIT ${limit} OFFSET ${offset}`;
    
    const rows = await this.pool.queryMany(sql, params);
    
    return {
      items: rows.map(row => this._rowToObject(row)),
      total
    };
  }

  /**
   * 完成训练会话
   */
  async finish(sessionId, finishData = {}) {
    const status = finishData.status || 'finished';
    const totalRounds = finishData.totalRounds || 0;
    const finishedAt = finishData.finishedAt || new Date();
    
    const sql = `
      UPDATE training_sessions 
      SET status = ?, total_rounds = ?, finished_at = ?
      WHERE session_id = ?
    `;
    
    await this.pool.update(sql, [status, totalRounds, finishedAt, sessionId]);
    
    return this.findById(sessionId);
  }

  /**
   * 统计训练会话数量（用于查询接口）
   */
  async countSessions(filters = {}) {
    const conditions = [];
    const params = [];
    
    if (filters.project) {
      conditions.push('project = ?');
      params.push(filters.project);
    }
    
    if (filters.agentId) {
      conditions.push('agent_id = ?');
      params.push(filters.agentId);
    }
    
    if (filters.scenarioId) {
      conditions.push('scenario_id = ?');
      params.push(filters.scenarioId);
    }
    
    if (filters.status) {
      conditions.push('status = ?');
      params.push(filters.status);
    }
    
    if (filters.startTime) {
      conditions.push('started_at >= ?');
      params.push(filters.startTime);
    }
    
    if (filters.endTime) {
      conditions.push('started_at <= ?');
      params.push(filters.endTime);
    }
    
    const whereClause = conditions.length > 0 
      ? `WHERE ${conditions.join(' AND ')}` 
      : '';
    
    const sql = `SELECT COUNT(*) as total FROM training_sessions ${whereClause}`;
    const row = await this.pool.queryOne(sql, params);
    return row.total || 0;
  }

  /**
   * 聚合训练统计数据
   */
  async aggregateStats(filters = {}) {
    const conditions = [];
    const params = [];
    
    if (filters.project) {
      conditions.push('project = ?');
      params.push(filters.project);
    }
    
    if (filters.agentId) {
      conditions.push('agent_id = ?');
      params.push(filters.agentId);
    }
    
    if (filters.scenarioId) {
      conditions.push('scenario_id = ?');
      params.push(filters.scenarioId);
    }
    
    if (filters.startTime) {
      conditions.push('started_at >= ?');
      params.push(filters.startTime);
    }
    
    if (filters.endTime) {
      conditions.push('started_at <= ?');
      params.push(filters.endTime);
    }
    
    const whereClause = conditions.length > 0 
      ? `WHERE ${conditions.join(' AND ')}` 
      : '';
    
    // 总体统计
    const totalSql = `
      SELECT 
        COUNT(*) as total_sessions,
        SUM(CASE WHEN status = 'finished' THEN 1 ELSE 0 END) as finished_sessions,
        SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) as running_sessions,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_sessions,
        AVG(total_rounds) as avg_rounds,
        MAX(total_rounds) as max_rounds
      FROM training_sessions
      ${whereClause}
    `;
    
    const totalStats = await this.pool.queryOne(totalSql, params);
    
    // 按场景统计
    const scenarioSql = `
      SELECT 
        scenario_id,
        scenario_title,
        COUNT(*) as session_count,
        AVG(total_rounds) as avg_rounds
      FROM training_sessions
      ${whereClause}
      GROUP BY scenario_id, scenario_title
      ORDER BY session_count DESC
    `;
    
    const scenarioStats = await this.pool.queryMany(scenarioSql, params);
    
    // 按客服统计
    const agentSql = `
      SELECT 
        agent_id,
        COUNT(*) as session_count,
        AVG(total_rounds) as avg_rounds,
        SUM(CASE WHEN status = 'finished' THEN 1 ELSE 0 END) as finished_count
      FROM training_sessions
      ${whereClause}
      GROUP BY agent_id
      ORDER BY session_count DESC
    `;
    
    const agentStats = await this.pool.queryMany(agentSql, params);
    
    return {
      totalSessions: totalStats.total_sessions || 0,
      finishedSessions: totalStats.finished_sessions || 0,
      runningSessions: totalStats.running_sessions || 0,
      cancelledSessions: totalStats.cancelled_sessions || 0,
      avgRounds: parseFloat(totalStats.avg_rounds) || 0,
      maxRounds: totalStats.max_rounds || 0,
      byScenario: scenarioStats,
      byAgent: agentStats
    };
  }
}

module.exports = { MySQLTrainingSessionRepository };
