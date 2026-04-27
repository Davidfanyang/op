/**
 * MySQL-based Live Evaluation Repository 实现
 * 
 * 基于MySQL的实时质检评估数据持久化
 */

const { LiveEvaluationsRepository } = require('../../../repositories/live-evaluations-repository');
const { getPool } = require('./mysql-pool');

class MySQLLiveEvaluationRepository extends LiveEvaluationsRepository {
  constructor(poolOrConfig = null) {
    super();
    this.pool = poolOrConfig || getPool();
  }

  /**
   * 生成评估ID
   */
  _generateId() {
    return `live_eval_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 数据库行转对象
   */
  _rowToObject(row) {
    if (!row) return null;
    
    // 解析 JSON 字段
    let inputPayload = {};
    let outputPayload = {};
    
    if (row.input_payload) {
      inputPayload = typeof row.input_payload === 'string' 
        ? JSON.parse(row.input_payload) 
        : row.input_payload;
    }
    
    if (row.output_payload) {
      outputPayload = typeof row.output_payload === 'string'
        ? JSON.parse(row.output_payload)
        : row.output_payload;
    }
    
    return {
      id: row.id,
      evaluationId: row.evaluation_id,
      sessionId: row.session_id,
      messageId: row.message_id,
      project: row.project,
      currentReply: row.current_reply,
      inputPayload: inputPayload,
      outputPayload: outputPayload,
      scenario: row.scenario,
      stage: row.stage,
      judgement: row.judgement,
      summary: row.summary,
      confidence: row.confidence,
      problemType: row.problem_type,
      needReview: row.need_review === 1,
      classifyReason: row.classify_reason,
      alertLevel: row.alert_level,
      hasAlert: row.has_alert === 1,
      createdAt: row.created_at
    };
  }

  /**
   * 保存评估结果
   */
  async save(evaluationData) {
    const evaluationId = evaluationData.evaluationId || this._generateId();
    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
    
    // 将对象转换为 JSON 字符串
    const inputPayloadJson = typeof evaluationData.inputPayload === 'string'
      ? evaluationData.inputPayload
      : JSON.stringify(evaluationData.inputPayload || {});
    
    const outputPayloadJson = typeof evaluationData.outputPayload === 'string'
      ? evaluationData.outputPayload
      : JSON.stringify(evaluationData.outputPayload || {});
    
    const sql = `
      INSERT INTO live_evaluations (
        evaluation_id, session_id, message_id, project, current_reply,
        input_payload, output_payload, scenario, stage, judgement, summary, confidence,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    await this.pool.query(sql, [
      evaluationId,
      evaluationData.sessionId,
      evaluationData.messageId,
      evaluationData.project || 'default',
      evaluationData.currentReply || '',
      inputPayloadJson,
      outputPayloadJson,
      evaluationData.scenario || null,
      evaluationData.stage || null,
      evaluationData.judgement || null,
      evaluationData.summary || null,
      evaluationData.confidence || null,
      now
    ]);
    
    console.log('[MySQLLiveEvaluationRepo] 保存评估:', evaluationId, 'scenario:', evaluationData.scenario);
    
    return this.findById(evaluationId);
  }

  /**
   * 按 evaluationId 查询评估
   */
  async findById(evaluationId) {
    const sql = `SELECT * FROM live_evaluations WHERE evaluation_id = ?`;
    const row = await this.pool.queryOne(sql, [evaluationId]);
    return this._rowToObject(row);
  }

  /**
   * 按 sessionId 查询评估列表
   */
  async findBySessionId(sessionId, options = {}) {
    const order = options.order === 'asc' ? 'ASC' : 'DESC';
    const limit = parseInt(options.limit) || 100;
    const offset = parseInt(options.offset) || 0;
    
    // 注意：LIMIT 和 OFFSET 不能参数化
    const sql = `
      SELECT * FROM live_evaluations 
      WHERE session_id = ?
      ORDER BY created_at ${order}
      LIMIT ${limit} OFFSET ${offset}
    `;
    
    const rows = await this.pool.queryMany(sql, [sessionId]);
    return rows.map(row => this._rowToObject(row));
  }

  /**
   * 按 messageId 查询评估
   */
  async findByMessageId(messageId) {
    const sql = `SELECT * FROM live_evaluations WHERE message_id = ?`;
    const row = await this.pool.queryOne(sql, [messageId]);
    return this._rowToObject(row);
  }

  /**
   * 更新分类字段（problem_type, need_review, classify_reason）
   */
  async updateClassification(evaluationId, classificationData) {
    const { problemType, needReview, classifyReason } = classificationData;
    
    const sql = `
      UPDATE live_evaluations 
      SET problem_type = ?, need_review = ?, classify_reason = ?
      WHERE evaluation_id = ?
    `;
    
    await this.pool.query(sql, [
      problemType || null,
      needReview ? 1 : 0,
      classifyReason || null,
      evaluationId
    ]);
    
    console.log('[MySQLLiveEvaluationRepo] 更新分类字段:', evaluationId, { problemType, needReview });
    
    return this.findById(evaluationId);
  }

  /**
   * 更新告警字段（alert_level, has_alert）
   */
  async updateAlert(evaluationId, alertData) {
    const { alertLevel, hasAlert } = alertData;
    
    const sql = `
      UPDATE live_evaluations 
      SET alert_level = ?, has_alert = ?
      WHERE evaluation_id = ?
    `;
    
    await this.pool.query(sql, [
      alertLevel || null,
      hasAlert ? 1 : 0,
      evaluationId
    ]);
    
    console.log('[MySQLLiveEvaluationRepo] 更新告警字段:', evaluationId, { alertLevel, hasAlert });
    
    return this.findById(evaluationId);
  }

  /**
   * 检查 evaluation 是否存在
   */
  async existsByMessageId(messageId) {
    const sql = `SELECT COUNT(*) as count FROM live_evaluations WHERE message_id = ?`;
    const result = await this.pool.queryOne(sql, [messageId]);
    return result && result.count > 0;
  }
}

module.exports = { MySQLLiveEvaluationRepository };
