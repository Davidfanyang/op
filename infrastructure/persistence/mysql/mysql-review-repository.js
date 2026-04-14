/**
 * MySQL-based Review Repository 实现
 * 
 * 基于MySQL的主管复核数据持久化
 * 支持 reviews + review_actions 双表操作
 */

const { ReviewRepository } = require('../../../repositories/review-repository');
const { getPool } = require('./mysql-pool');

class MySQLReviewRepository extends ReviewRepository {
  constructor(poolOrConfig = null, evaluationRepository = null) {
    super();
    this.pool = poolOrConfig || getPool();
    this.evaluationRepository = evaluationRepository;
  }

  /**
   * 设置 EvaluationRepository（用于同步更新 evaluation）
   */
  setEvaluationRepository(repo) {
    this.evaluationRepository = repo;
  }

  /**
   * 生成复核ID
   */
  _generateId() {
    return `review_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 生成动作ID
   */
  _generateActionId() {
    return `action_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 数据库行转对象
   */
  _rowToObject(row) {
    if (!row) return null;
    
    return {
      reviewId: row.review_id,
      evaluationId: row.evaluation_id,
      messageId: row.message_id,
      sessionId: row.session_id,
      projectId: row.project_id,
      mode: row.mode || 'live_monitor',  // 新增 mode 字段
      alertLevel: row.alert_level,
      channel: row.channel,
      employeeId: row.employee_id,
      customerId: row.customer_id,
      
      // 复核状态
      reviewStatus: row.review_status,
      reviewDecision: row.review_decision,
      reviewComment: row.review_comment,
      
      // 优化回复
      optimizedReply: row.optimized_reply,
      optimizedReplyApproved: row.optimized_reply_approved,
      
      // 采纳结果
      isAdopted: row.is_adopted,
      finalReplyVersion: row.final_reply_version,
      
      // 复核人信息
      reviewedBy: row.reviewed_by,
      reviewedAt: row.reviewed_at,
      
      // 误报标记
      falsePositiveReason: row.false_positive_reason,
      
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  /**
   * 创建 review item
   */
  async create(reviewData) {
    const reviewId = reviewData.reviewId || this._generateId();
    const now = new Date();
    
    const sql = `
      INSERT INTO reviews (
        review_id, project_id, mode, session_id, message_id, evaluation_id,
        channel, employee_id, customer_id, alert_level,
        review_status, review_decision, review_comment,
        optimized_reply, optimized_reply_approved,
        is_adopted, final_reply_version,
        reviewed_by, reviewed_at, false_positive_reason
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    await this.pool.insert(sql, [
      reviewId,
      reviewData.projectId,
      reviewData.mode || 'live_monitor',  // 新增 mode 字段
      reviewData.sessionId,
      reviewData.messageId,
      reviewData.evaluationId,
      reviewData.channel || 'telegram',
      reviewData.employeeId || null,
      reviewData.customerId || null,
      reviewData.alertLevel || 'warning',
      reviewData.reviewStatus || 'pending',
      reviewData.reviewDecision || null,
      reviewData.reviewComment || null,
      reviewData.optimizedReply || null,
      reviewData.optimizedReplyApproved || null,
      reviewData.isAdopted || null,
      reviewData.finalReplyVersion || null,
      reviewData.reviewedBy || null,
      reviewData.reviewedAt || null,
      reviewData.falsePositiveReason || null
    ]);
    
    // 创建 review_action 记录
    await this._createAction({
      reviewId,
      projectId: reviewData.projectId,
      actionType: 'created',
      actorId: reviewData.createdBy || 'system',
      actionComment: `Review item created (${reviewData.mode || 'live_monitor'} mode)`
    });
    
    return this.findById(reviewId);
  }

  /**
   * 创建 review_action 记录
   */
  async _createAction(actionData) {
    const sql = `
      INSERT INTO review_actions (
        action_id, review_id, project_id, action_type, actor_id, action_comment, payload_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    
    await this.pool.insert(sql, [
      this._generateActionId(),
      actionData.reviewId,
      actionData.projectId,
      actionData.actionType,
      actionData.actorId,
      actionData.actionComment || null,
      actionData.payload ? JSON.stringify(actionData.payload) : null
    ]);
  }

  /**
   * 按 reviewId 查询
   */
  async findById(reviewId) {
    const sql = `SELECT * FROM reviews WHERE review_id = ?`;
    const row = await this.pool.queryOne(sql, [reviewId]);
    return this._rowToObject(row);
  }

  /**
   * 按 evaluationId 查询 review
   */
  async findByEvaluationId(evaluationId) {
    const sql = `SELECT * FROM reviews WHERE evaluation_id = ?`;
    const row = await this.pool.queryOne(sql, [evaluationId]);
    return this._rowToObject(row);
  }

  /**
   * 查询待复核列表
   */
  async findPending(projectId, filters = {}, pagination = { page: 1, limit: 20 }) {
    const conditions = ['project_id = ?', "review_status = 'pending'"];
    const params = [projectId];
    
    if (filters.alertLevel) {
      conditions.push('alert_level = ?');
      params.push(filters.alertLevel);
    }
    
    if (filters.dateRange) {
      conditions.push('created_at >= ? AND created_at <= ?');
      params.push(filters.dateRange.start, filters.dateRange.end);
    }
    
    // 查询总数
    const countSql = `SELECT COUNT(*) as total FROM reviews WHERE ${conditions.join(' AND ')}`;
    const countRow = await this.pool.queryOne(countSql, params);
    const total = countRow.total;
    
    // 分页查询
    const limit = parseInt(pagination.limit) || 20;
    const page = parseInt(pagination.page) || 1;
    const offset = (page - 1) * limit;
    const sql = `
      SELECT * FROM reviews 
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
   * 查询复核列表（支持多状态过滤）
   */
  async findMany(filters, pagination = { page: 1, limit: 20 }) {
    const conditions = [];
    const params = [];
    
    if (filters.projectId) {
      conditions.push('project_id = ?');
      params.push(filters.projectId);
    }
    
    if (filters.reviewStatus) {
      if (Array.isArray(filters.reviewStatus)) {
        conditions.push(`review_status IN (${filters.reviewStatus.map(() => '?').join(', ')})`);
        params.push(...filters.reviewStatus);
      } else {
        conditions.push('review_status = ?');
        params.push(filters.reviewStatus);
      }
    }
    
    if (filters.alertLevel) {
      conditions.push('alert_level = ?');
      params.push(filters.alertLevel);
    }
    
    const whereClause = conditions.length > 0 
      ? `WHERE ${conditions.join(' AND ')}`
      : '';
    
    // 查询总数
    const countSql = `SELECT COUNT(*) as total FROM reviews ${whereClause}`;
    const countRow = await this.pool.queryOne(countSql, params);
    const total = countRow.total;
    
    // 分页查询
    const limit = parseInt(pagination.limit) || 20;
    const page = parseInt(pagination.page) || 1;
    const offset = (page - 1) * limit;
    const sql = `
      SELECT * FROM reviews ${whereClause}
      ORDER BY reviewed_at DESC, created_at DESC
      LIMIT ${limit} OFFSET ${offset}`;
    
    const rows = await this.pool.queryMany(sql, params);
    
    return {
      items: rows.map(row => this._rowToObject(row)),
      total
    };
  }

  /**
   * 更新复核状态
   */
  async updateStatus(reviewId, status, updates = {}) {
    const fields = ['review_status = ?'];
    const params = [status];
    
    if (updates.reviewedBy !== undefined) {
      fields.push('reviewed_by = ?');
      params.push(updates.reviewedBy);
    }
    
    if (updates.reviewComment !== undefined) {
      fields.push('review_comment = ?');
      params.push(updates.reviewComment);
    }
    
    if (updates.falsePositiveReason !== undefined) {
      fields.push('false_positive_reason = ?');
      params.push(updates.falsePositiveReason);
    }
    
    params.push(reviewId);
    
    const sql = `UPDATE reviews SET ${fields.join(', ')} WHERE review_id = ?`;
    await this.pool.update(sql, params);
    
    return this.findById(reviewId);
  }

  /**
   * 提交复核结果（核心方法）
   * 同时更新 reviews、evaluations 和 review_actions
   */
  async submitReview(reviewId, reviewResult) {
    const review = await this.findById(reviewId);
    if (!review) {
      throw new Error(`Review not found: ${reviewId}`);
    }
    
    const now = new Date();
    const actionType = this._mapDecisionToAction(reviewResult.reviewDecision);
    
    // 使用事务确保数据一致性
    return this.pool.transaction(async (conn) => {
      // 1. 更新 reviews 表
      const reviewFields = [
        'review_status = ?',
        'review_decision = ?',
        'reviewed_by = ?',
        'reviewed_at = ?'
      ];
      const reviewParams = [
        reviewResult.reviewStatus || 'reviewed',
        reviewResult.reviewDecision,
        reviewResult.reviewedBy,
        now
      ];
      
      if (reviewResult.reviewComment !== undefined) {
        reviewFields.push('review_comment = ?');
        reviewParams.push(reviewResult.reviewComment);
      }
      
      if (reviewResult.optimizedReply !== undefined) {
        reviewFields.push('optimized_reply = ?');
        reviewParams.push(reviewResult.optimizedReply);
      }
      
      if (reviewResult.optimizedReplyApproved !== undefined) {
        reviewFields.push('optimized_reply_approved = ?');
        reviewParams.push(reviewResult.optimizedReplyApproved ? 1 : 0);
      }
      
      if (reviewResult.isAdopted !== undefined) {
        reviewFields.push('is_adopted = ?');
        reviewParams.push(reviewResult.isAdopted ? 1 : 0);
      }
      
      if (reviewResult.finalReplyVersion !== undefined) {
        reviewFields.push('final_reply_version = ?');
        reviewParams.push(reviewResult.finalReplyVersion);
      }
      
      if (reviewResult.falsePositiveReason !== undefined) {
        reviewFields.push('false_positive_reason = ?');
        reviewParams.push(reviewResult.falsePositiveReason);
      }
      
      reviewParams.push(reviewId);
      
      await conn.update(
        `UPDATE reviews SET ${reviewFields.join(', ')} WHERE review_id = ?`,
        reviewParams
      );
      
      // 2. 同步更新 evaluations 表
      const evalUpdateFields = [
        'review_status = ?',
        'review_decision = ?',
        'reviewed_by = ?',
        'reviewed_at = ?'
      ];
      const evalParams = [
        reviewResult.reviewStatus || 'reviewed',
        reviewResult.reviewDecision,
        reviewResult.reviewedBy,
        now
      ];
      
      // 根据复核决定设置 final_accepted
      if (reviewResult.reviewDecision === 'approved') {
        evalUpdateFields.push('final_accepted = ?');
        evalParams.push(1);
      } else if (reviewResult.reviewDecision === 'rejected' || reviewResult.reviewDecision === 'needs_edit') {
        evalUpdateFields.push('final_accepted = ?');
        evalParams.push(0);
      }
      
      // 如果有最终回复版本
      if (reviewResult.finalReplyVersion !== undefined) {
        evalUpdateFields.push('final_reply_version = ?');
        evalParams.push(reviewResult.finalReplyVersion);
      }
      
      evalParams.push(review.evaluationId);
      
      await conn.update(
        `UPDATE evaluations SET ${evalUpdateFields.join(', ')} WHERE evaluation_id = ?`,
        evalParams
      );
      
      // 3. 插入 review_actions 记录
      await conn.insert(
        `INSERT INTO review_actions (
          action_id, review_id, project_id, action_type, actor_id, action_comment, payload_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          this._generateActionId(),
          reviewId,
          review.projectId,
          actionType,
          reviewResult.reviewedBy,
          reviewResult.reviewComment || null,
          JSON.stringify({
            decision: reviewResult.reviewDecision,
            isAdopted: reviewResult.isAdopted,
            optimizedReplyApproved: reviewResult.optimizedReplyApproved
          })
        ]
      );
      
      // 使用事务连接查询更新后的数据
      const [updatedRow] = await conn.query('SELECT * FROM reviews WHERE review_id = ?', [reviewId]);
      return this._rowToObject(updatedRow[0] || updatedRow);
    });
  }

  /**
   * 映射复核决定到动作类型
   */
  _mapDecisionToAction(decision) {
    const mapping = {
      'approved': 'approved',
      'rejected': 'rejected',
      'needs_edit': 'needs_edit',
      'false_positive': 'rejected'
    };
    return mapping[decision] || 'closed';
  }

  /**
   * 查询复核统计
   */
  async getStats(projectId, dateRange = {}) {
    const conditions = ['project_id = ?'];
    const params = [projectId];
    
    if (dateRange.start && dateRange.end) {
      conditions.push('created_at >= ? AND created_at <= ?');
      params.push(dateRange.start, dateRange.end);
    }
    
    const sql = `
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN review_status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN review_status = 'reviewed' THEN 1 ELSE 0 END) as reviewed,
        SUM(CASE WHEN review_status = 'closed' THEN 1 ELSE 0 END) as closed,
        SUM(CASE WHEN review_decision = 'approved' THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN review_decision = 'rejected' THEN 1 ELSE 0 END) as rejected,
        SUM(CASE WHEN review_decision = 'needs_edit' THEN 1 ELSE 0 END) as needs_edit,
        SUM(CASE WHEN alert_level = 'critical' THEN 1 ELSE 0 END) as critical_alerts,
        SUM(CASE WHEN alert_level = 'warning' THEN 1 ELSE 0 END) as warning_alerts,
        SUM(CASE WHEN alert_level = 'observation' THEN 1 ELSE 0 END) as observation_alerts
      FROM reviews
      WHERE ${conditions.join(' AND ')}
    `;
    
    const row = await this.pool.queryOne(sql, params);
    
    return {
      total: row.total,
      pending: row.pending,
      reviewed: row.reviewed,
      closed: row.closed,
      byDecision: {
        approved: row.approved,
        rejected: row.rejected,
        needs_edit: row.needs_edit
      },
      byAlertLevel: {
        critical: row.critical_alerts,
        warning: row.warning_alerts,
        observation: row.observation_alerts
      }
    };
  }

  /**
   * 查询复核动作历史
   */
  async getActionHistory(reviewId, pagination = { page: 1, limit: 20 }) {
    // 查询总数
    const countSql = `SELECT COUNT(*) as total FROM review_actions WHERE review_id = ?`;
    const countRow = await this.pool.queryOne(countSql, [reviewId]);
    const total = countRow.total;
    
    // 分页查询
    const limit = parseInt(pagination.limit) || 20;
    const page = parseInt(pagination.page) || 1;
    const offset = (page - 1) * limit;
    const sql = `
      SELECT * FROM review_actions 
      WHERE review_id = ?
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
    
    const rows = await this.pool.queryMany(sql, [reviewId]);
    
    return {
      items: rows.map(row => ({
        actionId: row.action_id,
        reviewId: row.review_id,
        projectId: row.project_id,
        actionType: row.action_type,
        actorId: row.actor_id,
        actionComment: row.action_comment,
        payload: (function(v) { if (!v) return null; if (typeof v === 'object') return v; try { return JSON.parse(v); } catch { return v; } })(row.payload_json),
        createdAt: row.created_at
      })),
      total
    };
  }

  /**
   * 查询训练模式待复核列表
   */
  async findTrainingPending(projectId, filters = {}, pagination = { page: 1, limit: 20 }) {
    const conditions = ["mode = 'training'", "review_status = 'pending'"];
    const params = [];
    
    if (projectId) {
      conditions.push('project_id = ?');
      params.push(projectId);
    }
    
    if (filters.alertLevel) {
      conditions.push('alert_level = ?');
      params.push(filters.alertLevel);
    }
    
    if (filters.dateRange) {
      conditions.push('created_at >= ? AND created_at <= ?');
      params.push(filters.dateRange.start, filters.dateRange.end);
    }
    
    // 查询总数
    const countSql = `SELECT COUNT(*) as total FROM reviews WHERE ${conditions.join(' AND ')}`;
    const countRow = await this.pool.queryOne(countSql, params);
    const total = countRow.total;
    
    // 分页查询
    const limit = parseInt(pagination.limit) || 20;
    const page = parseInt(pagination.page) || 1;
    const offset = (page - 1) * limit;
    const sql = `
      SELECT * FROM reviews 
      WHERE ${conditions.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
    
    const rows = await this.pool.queryMany(sql, params);
    
    return {
      items: rows.map(row => this._rowToObject(row)),
      total
    };
  }

  /**
   * 查询训练模式统计
   */
  async getTrainingStats(projectId, dateRange = {}) {
    const conditions = ["mode = 'training'"];
    const params = [];
    
    if (projectId) {
      conditions.push('project_id = ?');
      params.push(projectId);
    }
    
    if (dateRange.start && dateRange.end) {
      conditions.push('created_at >= ? AND created_at <= ?');
      params.push(dateRange.start, dateRange.end);
    }
    
    const whereClause = conditions.join(' AND ');
    
    // 按状态统计
    const statusSql = `
      SELECT 
        review_status,
        COUNT(*) as count,
        AVG(CASE WHEN score IS NOT NULL THEN score END) as avg_score
      FROM reviews r
      LEFT JOIN evaluations e ON r.evaluation_id = e.evaluation_id
      WHERE ${whereClause}
      GROUP BY review_status
    `;
    
    const statusRows = await this.pool.queryMany(statusSql, params);
    
    // 按告警级别统计
    const alertSql = `
      SELECT 
        alert_level,
        COUNT(*) as count
      FROM reviews
      WHERE ${whereClause}
      GROUP BY alert_level
    `;
    
    const alertRows = await this.pool.queryMany(alertSql, params);
    
    // 总计
    const totalSql = `SELECT COUNT(*) as total FROM reviews WHERE ${whereClause}`;
    const totalRow = await this.pool.queryOne(totalSql, params);
    
    return {
      total: totalRow.total,
      byStatus: statusRows.reduce((acc, row) => {
        acc[row.review_status] = {
          count: row.count,
          avgScore: row.avg_score ? parseFloat(row.avg_score).toFixed(1) : null
        };
        return acc;
      }, {}),
      byAlertLevel: alertRows.reduce((acc, row) => {
        acc[row.alert_level] = row.count;
        return acc;
      }, {}),
      period: dateRange
    };
  }
}

module.exports = { MySQLReviewRepository };
