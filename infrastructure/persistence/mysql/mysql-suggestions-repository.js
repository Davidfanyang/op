/**
 * MySQL-based Suggestions Repository 实现
 * 
 * 基于MySQL的建议答案数据持久化
 * 支持 suggestion 的创建、查询和状态更新
 */

const { SuggestionsRepository } = require('../../../repositories/suggestions-repository');
const { getPool } = require('./mysql-pool');

class MySQLSuggestionsRepository extends SuggestionsRepository {
  constructor(poolOrConfig = null) {
    super();
    this.pool = poolOrConfig || getPool();
  }

  /**
   * 生成建议ID
   */
  _generateId() {
    return `suggestion_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 数据库行转对象
   */
  _rowToObject(row) {
    if (!row) return null;
    
    return {
      id: row.id,
      suggestionId: row.suggestion_id,
      projectId: row.project_id,
      sessionId: row.session_id,
      messageId: row.message_id,
      evaluationId: row.evaluation_id,
      entrySource: row.entry_source,
      agentId: row.agent_id,
      scenario: row.scenario,
      suggestedReply: row.suggested_reply,
      sourceType: row.source_type,
      status: row.status,
      reviewStatus: row.review_status,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  /**
   * 对象转数据库字段
   */
  _objectToRow(data) {
    return {
      suggestion_id: data.suggestionId || this._generateId(),
      project_id: data.projectId,
      session_id: data.sessionId,
      message_id: data.messageId,
      evaluation_id: data.evaluationId,
      entry_source: data.entrySource || 'live_monitor',
      agent_id: data.agentId || 'unknown',
      scenario: data.scenario || '',
      suggested_reply: data.suggestedReply,
      source_type: 'unknown_auto_generated',
      status: 'active',
      review_status: 'pending_review'
    };
  }

  /**
   * 创建建议答案
   * @param {Object} data - 建议答案数据
   * @returns {Promise<Object>} 创建的 suggestion 对象
   */
  async create(data) {
    const row = this._objectToRow(data);
    
    const sql = `
      INSERT INTO suggestions (
        suggestion_id, project_id, session_id, message_id, evaluation_id,
        entry_source, agent_id, scenario, suggested_reply,
        source_type, status, review_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    await this.pool.insert(sql, [
      row.suggestion_id,
      row.project_id,
      row.session_id,
      row.message_id,
      row.evaluation_id,
      row.entry_source,
      row.agent_id,
      row.scenario,
      row.suggested_reply,
      row.source_type,
      row.status,
      row.review_status
    ]);
    
    return this.findByEvaluationId(row.evaluation_id);
  }

  /**
   * 根据 ID 查询建议答案
   * @param {string} id - suggestion ID (可以是自增ID或业务ID)
   * @returns {Promise<Object|null>} suggestion 对象或 null
   */
  async findById(id) {
    // 如果id以suggestion_开头，使用suggestion_id查询
    if (id && id.startsWith('suggestion_')) {
      return this.findBySuggestionId(id);
    }
    const sql = `SELECT * FROM suggestions WHERE id = ? LIMIT 1`;
    const row = await this.pool.queryOne(sql, [id]);
    return this._rowToObject(row);
  }

  /**
   * 根据 suggestion_id 查询建议答案
   * @param {string} suggestionId - suggestion 业务ID
   * @returns {Promise<Object|null>} suggestion 对象或 null
   */
  async findBySuggestionId(suggestionId) {
    const sql = `SELECT * FROM suggestions WHERE suggestion_id = ? LIMIT 1`;
    const row = await this.pool.queryOne(sql, [suggestionId]);
    return this._rowToObject(row);
  }

  /**
   * 根据 evaluation_id 查询建议答案
   * @param {string} evaluationId - 评估 ID
   * @returns {Promise<Object|null>} suggestion 对象或 null
   */
  async findByEvaluationId(evaluationId) {
    const sql = `SELECT * FROM suggestions WHERE evaluation_id = ? LIMIT 1`;
    const row = await this.pool.queryOne(sql, [evaluationId]);
    return this._rowToObject(row);
  }

  /**
   * 检查指定 evaluation_id 是否已存在建议答案
   * @param {string} evaluationId - 评估 ID
   * @returns {Promise<boolean>} 是否存在
   */
  async existsByEvaluationId(evaluationId) {
    const sql = `SELECT COUNT(*) as count FROM suggestions WHERE evaluation_id = ?`;
    const row = await this.pool.queryOne(sql, [evaluationId]);
    return row.count > 0;
  }

  /**
   * 查询所有待审核的建议答案
   * @returns {Promise<Array>} suggestion 列表
   */
  async findPendingSuggestions() {
    const sql = `SELECT * FROM suggestions WHERE review_status = 'pending_review' ORDER BY created_at ASC`;
    const rows = await this.pool.queryMany(sql, []);
    return rows.map(row => this._rowToObject(row));
  }

  /**
   * 根据 session_id 查询建议答案列表
   * @param {string} sessionId - 会话 ID
   * @returns {Promise<Array>} suggestion 列表
   */
  async findBySessionId(sessionId) {
    const sql = `SELECT * FROM suggestions WHERE session_id = ? ORDER BY created_at DESC`;
    const rows = await this.pool.queryMany(sql, [sessionId]);
    return rows.map(row => this._rowToObject(row));
  }

  /**
   * 根据 project_id 查询建议答案列表
   * @param {string} projectId - 项目 ID
   * @returns {Promise<Array>} suggestion 列表
   */
  async findByProjectId(projectId) {
    const sql = `SELECT * FROM suggestions WHERE project_id = ? ORDER BY created_at DESC`;
    const rows = await this.pool.queryMany(sql, [projectId]);
    return rows.map(row => this._rowToObject(row));
  }

  /**
   * 更新建议答案审核状态
   * @param {string} id - suggestion ID (可以是自增ID或业务ID)
   * @param {string} reviewStatus - 审核状态 (approved/modified_approved/rejected)
   * @returns {Promise<Object>} 更新后的 suggestion 对象
   */
  async updateReviewStatus(id, reviewStatus) {
    // 如果id以suggestion_开头，使用suggestion_id更新
    if (id && id.startsWith('suggestion_')) {
      const sql = `UPDATE suggestions SET review_status = ?, updated_at = NOW() WHERE suggestion_id = ?`;
      await this.pool.update(sql, [reviewStatus, id]);
      return this.findBySuggestionId(id);
    }
    const sql = `UPDATE suggestions SET review_status = ?, updated_at = NOW() WHERE id = ?`;
    await this.pool.update(sql, [reviewStatus, id]);
    
    return this.findById(id);
  }
}

// 导出类
module.exports = {
  MySQLSuggestionsRepository
};
