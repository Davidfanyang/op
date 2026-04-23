/**
 * MySQL-based Reviews Repository 实现
 * 
 * 基于MySQL的审核数据持久化
 * 支持审核记录的创建、查询和列表
 */

const { ReviewsRepository } = require('../../../repositories/reviews-repository');
const { getPool } = require('./mysql-pool');

class MySQLReviewsRepository extends ReviewsRepository {
  constructor(poolOrConfig = null) {
    super();
    this.pool = poolOrConfig || getPool();
  }

  /**
   * 生成审核ID
   */
  _generateId() {
    return `review_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 数据库行转对象
   */
  _rowToObject(row) {
    if (!row) return null;
    
    return {
      id: row.id,
      reviewId: row.review_id,
      projectId: row.project_id,
      mode: row.mode,
      suggestionId: row.suggestion_id,
      evaluationId: row.evaluation_id,
      sessionId: row.session_id,
      messageId: row.message_id,
      reviewAction: row.review_action,
      reviewStatus: row.review_status,
      reviewDecision: row.review_decision,
      originalReply: row.original_reply,
      finalReply: row.final_reply,
      finalAccepted: row.final_accepted !== undefined ? row.final_accepted : row.is_adopted,
      isAdopted: row.is_adopted,
      problemTags: row.problem_tags,
      reviewComment: row.review_comment,
      reviewNote: row.review_note,
      reviewerId: row.reviewer_id,
      reviewedBy: row.reviewed_by,
      knowledgeId: row.knowledge_id,
      reviewedAt: row.reviewed_at,
      createdAt: row.created_at
    };
  }

  /**
   * 对象转数据库字段
   */
  _objectToRow(data) {
    return {
      review_id: data.reviewId || this._generateId(),
      project_id: data.projectId || 'default',
      mode: data.mode || 'live_monitor',
      suggestion_id: data.suggestionId ?? null,
      evaluation_id: data.evaluationId ?? null,
      session_id: data.sessionId ?? null,
      message_id: data.messageId ?? null,
      review_action: data.reviewAction ?? null,
      review_status: data.reviewStatus || 'pending_review',
      review_decision: data.reviewDecision || null,
      original_reply: data.originalReply ?? null,
      final_reply: data.finalReply || null,
      is_adopted: data.finalAccepted !== undefined ? data.finalAccepted : (data.isAdopted !== undefined ? data.isAdopted : null),
      problem_tags: data.problemTags || null,
      review_comment: data.reviewComment || null,
      review_note: data.reviewNote || null,
      reviewer_id: data.reviewerId ?? null,
      reviewed_by: data.reviewedBy || data.reviewerId || null,
      knowledge_id: data.knowledgeId || null,
      reviewed_at: data.reviewedAt || null
    };
  }

  /**
   * 创建审核记录
   * @param {Object} data - 审核数据
   * @returns {Promise<Object>} 创建的 review 对象
   */
  async create(data) {
    const row = this._objectToRow(data);
    
    const sql = `
      INSERT INTO reviews (
        review_id, project_id, mode, suggestion_id, evaluation_id, session_id, message_id,
        review_action, review_status, review_decision, original_reply, final_reply, is_adopted,
        problem_tags, review_comment, review_note, reviewer_id, reviewed_by, knowledge_id, reviewed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    await this.pool.insert(sql, [
      row.review_id,
      row.project_id,
      row.mode,
      row.suggestion_id,
      row.evaluation_id,
      row.session_id,
      row.message_id,
      row.review_action,
      row.review_status,
      row.review_decision,
      row.original_reply,
      row.final_reply,
      row.is_adopted,
      row.problem_tags,
      row.review_comment,
      row.review_note,
      row.reviewer_id,
      row.reviewed_by,
      row.knowledge_id,
      row.reviewed_at
    ]);
    
    // 优先使用evaluation_id查询（打标场景）
    if (row.evaluation_id) {
      return this.findByEvaluationId(row.evaluation_id);
    }
    return this.findBySuggestionId(row.suggestion_id);
  }

  /**
   * 根据 suggestion_id 查询审核记录
   * @param {string} suggestionId - suggestion ID
   * @returns {Promise<Object|null>} review 对象或 null
   */
  async findBySuggestionId(suggestionId) {
    const sql = `SELECT * FROM reviews WHERE suggestion_id = ? LIMIT 1`;
    const row = await this.pool.queryOne(sql, [suggestionId]);
    return this._rowToObject(row);
  }

  /**
   * 根据 evaluation_id 查询审核记录
   * @param {string} evaluationId - evaluation ID
   * @returns {Promise<Object|null>} review 对象或 null
   */
  async findByEvaluationId(evaluationId) {
    const sql = `SELECT * FROM reviews WHERE evaluation_id = ? LIMIT 1`;
    const row = await this.pool.queryOne(sql, [evaluationId]);
    return this._rowToObject(row);
  }

  /**
   * 根据 session_id 查询审核记录列表
   * @param {string} sessionId - session ID
   * @returns {Promise<Array>} review 列表
   */
  async findBySessionId(sessionId) {
    const sql = `SELECT * FROM reviews WHERE session_id = ? ORDER BY created_at DESC`;
    const rows = await this.pool.queryMany(sql, [sessionId]);
    return rows.map(row => this._rowToObject(row));
  }

  /**
   * 根据审核人查询审核记录列表
   * @param {string} reviewerId - 审核人 ID
   * @returns {Promise<Array>} review 列表
   */
  async findByReviewerId(reviewerId) {
    const sql = `SELECT * FROM reviews WHERE reviewer_id = ? ORDER BY created_at DESC`;
    const rows = await this.pool.queryMany(sql, [reviewerId]);
    return rows.map(row => this._rowToObject(row));
  }

  /**
   * 查询审核记录列表（支持过滤）
   * @param {Object} filters - 过滤条件
   * @returns {Promise<Array>} review 列表
   */
  async list(filters = {}) {
    const conditions = [];
    const params = [];

    if (filters.reviewAction) {
      conditions.push('review_action = ?');
      params.push(filters.reviewAction);
    }

    if (filters.reviewerId) {
      conditions.push('reviewer_id = ?');
      params.push(filters.reviewerId);
    }

    if (filters.sessionId) {
      conditions.push('session_id = ?');
      params.push(filters.sessionId);
    }

    const whereClause = conditions.length > 0 
      ? 'WHERE ' + conditions.join(' AND ')
      : '';

    const sql = `SELECT * FROM reviews ${whereClause} ORDER BY created_at DESC`;
    const rows = await this.pool.queryMany(sql, params);
    return rows.map(row => this._rowToObject(row));
  }

  /**
   * 更新审核记录
   * @param {string} suggestionId - suggestion ID
   * @param {Object} updates - 更新数据
   * @returns {Promise<Object>} 更新后的 review 对象
   */
  async update(suggestionId, updates) {
    const fields = [];
    const values = [];
    
    if (updates.reviewAction !== undefined) {
      fields.push('review_action = ?');
      values.push(updates.reviewAction);
    }
    if (updates.originalReply !== undefined) {
      fields.push('original_reply = ?');
      values.push(updates.originalReply);
    }
    if (updates.finalReply !== undefined) {
      fields.push('final_reply = ?');
      values.push(updates.finalReply);
    }
    if (updates.reviewNote !== undefined) {
      fields.push('review_note = ?');
      values.push(updates.reviewNote);
    }
    if (updates.reviewerId !== undefined) {
      fields.push('reviewer_id = ?');
      values.push(updates.reviewerId);
    }
    if (updates.reviewStatus !== undefined) {
      fields.push('review_status = ?');
      values.push(updates.reviewStatus);
    }
    
    if (fields.length === 0) {
      return this.findBySuggestionId(suggestionId);
    }
    
    const sql = `
      UPDATE reviews 
      SET ${fields.join(', ')}, updated_at = NOW()
      WHERE suggestion_id = ?
    `;
    values.push(suggestionId);
    
    const result = await this.pool.query(sql, values);
    
    if (!result || result.affectedRows === 0) {
      throw new Error(`Review update failed: no row matched suggestion_id=${suggestionId}`);
    }
    
    return this.findBySuggestionId(suggestionId);
  }

  /**
   * 标记 review 已生成知识库记录
   * @param {string} reviewId - review ID (review_id 业务字段)
   * @param {string} knowledgeId - 生成的知识 ID
   * @returns {Promise<Object>} 更新后的 review 对象
   */
  async markReviewKnowledgeCreated(reviewId, knowledgeId) {
    const sql = `
      UPDATE reviews 
      SET knowledge_id = ?, updated_at = NOW() 
      WHERE review_id = ?
    `;
    await this.pool.query(sql, [knowledgeId, reviewId]);
    
    return this.findByReviewId(reviewId);
  }

  /**
   * 根据 review_id 查询审核记录
   * @param {string} reviewId - review ID (review_id 业务字段)
   * @returns {Promise<Object|null>} review 对象或 null
   */
  async findByReviewId(reviewId) {
    const sql = `SELECT * FROM reviews WHERE review_id = ? LIMIT 1`;
    const row = await this.pool.queryOne(sql, [reviewId]);
    return this._rowToObject(row);
  }
}

// 导出类
module.exports = {
  MySQLReviewsRepository
};
