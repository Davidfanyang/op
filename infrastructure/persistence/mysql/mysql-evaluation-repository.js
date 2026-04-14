/**
 * MySQL-based Evaluation Repository 实现
 * 
 * 基于MySQL的评估结果持久化
 * 支持 AI 评估结果 + 主管复核回写
 */

const { EvaluationRepository } = require('../../../repositories/evaluation-repository');
const { getPool } = require('./mysql-pool');

class MySQLEvaluationRepository extends EvaluationRepository {
  constructor(poolOrConfig = null) {
    super();
    this.pool = poolOrConfig || getPool();
  }

  /**
   * 生成评估ID
   */
  _generateId() {
    return `eval_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 数据库行转对象
   */
  _rowToObject(row) {
    if (!row) return null;
    
    // MySQL 9.x + mysql2 驱动会自动解析 JSON 字段
    const parseJson = (v, defaultValue) => {
      if (!v) return defaultValue;
      if (typeof v === "object") return v;
      try { return JSON.parse(v); } catch { return defaultValue; }
    };
    
    return {
      evaluationId: row.evaluation_id,
      messageId: row.message_id,
      sessionId: row.session_id,
      projectId: row.project_id,
      mode: row.mode,
      scenarioId: row.scenario_id,
      status: row.status,
      evaluationStatus: row.evaluation_status,
      alertLevel: row.alert_level || 'none',
      score: row.score,
      matchConfidence: row.match_confidence,
      dimensionScores: parseJson(row.dimension_scores_json, {}),
      findings: parseJson(row.findings_json, []),
      suggestions: parseJson(row.suggestions_json, []),
      strengths: parseJson(row.strengths_json, []),
      alerts: parseJson(row.alerts_json, []),
      summary: row.coach_summary,
      standardReply: row.standard_reply,
      createdAt: row.created_at,
      
      // 主管复核字段
      reviewStatus: row.review_status,
      reviewDecision: row.review_decision,
      reviewedBy: row.reviewed_by,
      reviewedAt: row.reviewed_at,
      finalAccepted: row.final_accepted,
      finalReplyVersion: row.final_reply_version,
      
      // 扩展元数据
      rawResult: parseJson(row.meta_json, {})
    };
  }

  /**
   * 对象转数据库字段
   */
  _objectToRow(data) {
    return {
      evaluation_id: data.evaluationId || this._generateId(),
      project_id: data.projectId,
      session_id: data.sessionId,
      message_id: data.messageId,
      mode: data.mode || 'training',
      scenario_id: data.scenarioId || null,
      status: data.status || 'ok',
      evaluation_status: data.evaluationStatus || 'completed',
      score: data.score ?? 0,
      alert_level: data.alertLevel || 'none',
      match_confidence: data.matchConfidence || null,
      dimension_scores_json: data.dimensionScores ? JSON.stringify(data.dimensionScores) : null,
      findings_json: data.findings ? JSON.stringify(data.findings) : null,
      suggestions_json: data.suggestions ? JSON.stringify(data.suggestions) : null,
      strengths_json: data.strengths ? JSON.stringify(data.strengths) : null,
      alerts_json: data.alerts ? JSON.stringify(data.alerts) : null,
      coach_summary: data.summary || null,
      standard_reply: data.standardReply || null,
      meta_json: data.rawResult ? JSON.stringify(data.rawResult) : null,
      
      // 复核字段默认值
      review_status: 'pending',
      review_decision: null,
      reviewed_by: null,
      reviewed_at: null,
      final_accepted: null,
      final_reply_version: null
    };
  }

  /**
   * 保存评估结果
   */
  async save(evaluationData) {
    const row = this._objectToRow(evaluationData);
    
    const sql = `
      INSERT INTO evaluations (
        evaluation_id, project_id, session_id, message_id, mode, scenario_id,
        status, evaluation_status, score, alert_level, match_confidence,
        dimension_scores_json, findings_json, suggestions_json, strengths_json,
        alerts_json, coach_summary, standard_reply, meta_json,
        review_status, review_decision, reviewed_by, reviewed_at,
        final_accepted, final_reply_version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    await this.pool.insert(sql, [
      row.evaluation_id,
      row.project_id,
      row.session_id,
      row.message_id,
      row.mode,
      row.scenario_id,
      row.status,
      row.evaluation_status,
      row.score,
      row.alert_level,
      row.match_confidence,
      row.dimension_scores_json,
      row.findings_json,
      row.suggestions_json,
      row.strengths_json,
      row.alerts_json,
      row.coach_summary,
      row.standard_reply,
      row.meta_json,
      row.review_status,
      row.review_decision,
      row.reviewed_by,
      row.reviewed_at,
      row.final_accepted,
      row.final_reply_version
    ]);
    
    return this.findById(row.evaluation_id);
  }

  /**
   * 按 evaluationId 查询
   */
  async findById(evaluationId) {
    const sql = `SELECT * FROM evaluations WHERE evaluation_id = ?`;
    const row = await this.pool.queryOne(sql, [evaluationId]);
    return this._rowToObject(row);
  }

  /**
   * 按 messageId 查询评估
   */
  async findByMessageId(messageId) {
    const sql = `SELECT * FROM evaluations WHERE message_id = ? ORDER BY created_at DESC LIMIT 1`;
    const row = await this.pool.queryOne(sql, [messageId]);
    return this._rowToObject(row);
  }

  /**
   * 按 sessionId 查询评估列表
   */
  async findBySessionId(sessionId) {
    const sql = `SELECT * FROM evaluations WHERE session_id = ? ORDER BY created_at DESC`;
    const rows = await this.pool.queryMany(sql, [sessionId]);
    return rows.map(row => this._rowToObject(row));
  }

  /**
   * 查询最近评估
   */
  async findRecent(projectId, mode = null, options = { limit: 20 }) {
    const conditions = ['project_id = ?'];
    const params = [projectId];
    
    if (mode) {
      conditions.push('mode = ?');
      params.push(mode);
    }
    
    if (options.alertLevel) {
      conditions.push('alert_level = ?');
      params.push(options.alertLevel);
    }
    
    const sql = `
      SELECT * FROM evaluations 
      WHERE ${conditions.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT ?
    `;
    
    params.push(options.limit);
    const rows = await this.pool.queryMany(sql, params);
    return rows.map(row => this._rowToObject(row));
  }

  /**
   * 更新评估状态
   */
  async updateStatus(evaluationId, status, updates = {}) {
    const fields = ['status = ?'];
    const params = [status];
    
    // 支持更新其他字段
    if (updates.alertLevel !== undefined) {
      fields.push('alert_level = ?');
      params.push(updates.alertLevel);
    }
    
    params.push(evaluationId);
    
    const sql = `UPDATE evaluations SET ${fields.join(', ')} WHERE evaluation_id = ?`;
    await this.pool.update(sql, params);
    
    return this.findById(evaluationId);
  }

  /**
   * 应用复核结果（主管复核回写）
   * @param {string} evaluationId - 评估ID
   * @param {Object} patch - 复核更新数据
   */
  async applyReviewResult(evaluationId, patch) {
    const fields = [];
    const params = [];
    
    if (patch.reviewStatus !== undefined) {
      fields.push('review_status = ?');
      params.push(patch.reviewStatus);
    }
    
    if (patch.reviewDecision !== undefined) {
      fields.push('review_decision = ?');
      params.push(patch.reviewDecision);
    }
    
    if (patch.reviewedBy !== undefined) {
      fields.push('reviewed_by = ?');
      params.push(patch.reviewedBy);
    }
    
    if (patch.reviewedAt !== undefined) {
      fields.push('reviewed_at = ?');
      params.push(patch.reviewedAt);
    } else if (patch.reviewStatus === 'reviewed' || patch.reviewStatus === 'closed') {
      fields.push('reviewed_at = ?');
      params.push(new Date());
    }
    
    if (patch.finalAccepted !== undefined) {
      fields.push('final_accepted = ?');
      params.push(patch.finalAccepted ? 1 : 0);
    }
    
    if (patch.finalReplyVersion !== undefined) {
      fields.push('final_reply_version = ?');
      params.push(patch.finalReplyVersion);
    }
    
    if (fields.length === 0) {
      return this.findById(evaluationId);
    }
    
    params.push(evaluationId);
    
    const sql = `UPDATE evaluations SET ${fields.join(', ')} WHERE evaluation_id = ?`;
    await this.pool.update(sql, params);
    
    return this.findById(evaluationId);
  }

  /**
   * 查询告警评估
   */
  async findAlerts(projectId, alertLevel = null, pagination = { page: 1, limit: 20 }) {
    const conditions = ['project_id = ?', "alert_level != 'none'"];
    const params = [projectId];
    
    if (alertLevel) {
      conditions.push('alert_level = ?');
      params.push(alertLevel);
    }
    
    // 查询总数
    const countSql = `SELECT COUNT(*) as total FROM evaluations WHERE ${conditions.join(' AND ')}`;
    const countRow = await this.pool.queryOne(countSql, params);
    const total = countRow.total;
    
    // 分页查询
    const limit = parseInt(pagination.limit) || 20;
    const offset = (pagination.page - 1) * limit;
    const sql = `
      SELECT * FROM evaluations 
      WHERE ${conditions.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}`;
    
    const rows = await this.pool.queryMany(sql, params);
    
    return {
      items: rows.map(row => this._rowToObject(row)),
      total
    };
  }

  /**
   * 查询待复核评估
   */
  async findPendingReviews(projectId, pagination = { page: 1, limit: 20 }) {
    const conditions = ['project_id = ?', "review_status = 'pending'"];
    const params = [projectId];
    
    // 查询总数
    const countSql = `SELECT COUNT(*) as total FROM evaluations WHERE ${conditions.join(' AND ')}`;
    const countRow = await this.pool.queryOne(countSql, params);
    const total = countRow.total;
    
    // 分页查询
    const limit = parseInt(pagination.limit) || 20;
    const offset = (pagination.page - 1) * limit;
    const sql = `
      SELECT * FROM evaluations 
      WHERE ${conditions.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}`;
    
    const rows = await this.pool.queryMany(sql, params);
    
    return {
      items: rows.map(row => this._rowToObject(row)),
      total
    };
  }
}

module.exports = { MySQLEvaluationRepository };
