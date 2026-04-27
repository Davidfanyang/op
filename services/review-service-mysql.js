/**
 * 主管审核服务（MySQL 事务版）
 * 
 * 职责：
 * 1. 读取待审核 suggestion
 * 2. 拼装审核上下文（suggestion + evaluation + conversation）
 * 3. 接收主管审核动作（approve / modify_and_approve / reject）
 * 4. 生成 review 记录
 * 5. 更新 suggestion 状态
 * 6. 所有操作在事务中完成
 * 
 * 审核动作固定为：
 * - approve: 直接通过
 * - modify_and_approve: 修改后通过
 * - reject: 驳回
 * 
 * 审核状态流转：
 * - pending_review → approved (approve)
 * - pending_review → modified_approved (modify_and_approve)
 * - pending_review → rejected (reject)
 */

const { MySQLSuggestionsRepository } = require('../infrastructure/persistence/mysql/mysql-suggestions-repository');
const { MySQLReviewsRepository } = require('../infrastructure/persistence/mysql/mysql-reviews-repository');
const { MySQLKnowledgeRepository } = require('../infrastructure/persistence/mysql/mysql-knowledge-repository');
const { KnowledgeService } = require('./knowledge-service');
const { getPool } = require('../infrastructure/persistence/mysql/mysql-pool');

// 审核动作常量
const REVIEW_ACTIONS = {
  APPROVE: 'approve',
  MODIFY_AND_APPROVE: 'modify_and_approve',
  REJECT: 'reject'
};

// 审核状态常量
const REVIEW_STATUSES = {
  PENDING_REVIEW: 'pending_review',
  APPROVED: 'approved',
  MODIFIED_APPROVED: 'modified_approved',
  REJECTED: 'rejected'
};

class ReviewServiceMySQL {
  constructor(options = {}) {
    this.pool = options.pool || getPool();
    this.suggestionsRepo = new MySQLSuggestionsRepository(this.pool);
    this.reviewsRepo = new MySQLReviewsRepository(this.pool);
    this.knowledgeService = new KnowledgeService({ pool: this.pool });
  }

  /**
   * 获取待审核的 suggestion 列表
   * 
   * @returns {Promise<Array>} 待审核 suggestion 列表
   */
  async getPendingSuggestions() {
    console.log('[ReviewServiceMySQL] 查询待审核 suggestion 列表');
    
    const suggestions = await this.suggestionsRepo.findPendingSuggestions();
    
    console.log(`[ReviewServiceMySQL] 找到 ${suggestions.length} 条待审核 suggestion`);
    
    return suggestions;
  }

  /**
   * 执行审核动作（主入口 - 事务版）
   * 
   * 事务流程：
   * 1. 查询 suggestion
   * 2. 校验 suggestion.review_status 是否为 pending_review
   * 3. 创建 review 记录
   * 4. 更新 suggestion.review_status
   * 5. 事务提交
   * 
   * 如果任一步失败，整体回滚
   * 
   * @param {Object} params - 审核参数
   * @param {string} params.suggestionId - suggestion ID (数据库主键 id)
   * @param {string} params.reviewAction - 审核动作 (approve/modify_and_approve/reject)
   * @param {string} params.finalReply - 审核后的最终答案（modify_and_approve 时必填）
   * @param {string} params.reviewNote - 审核备注
   * @param {string} params.reviewerId - 审核人 ID
   * @returns {Promise<Object>} 审核结果
   */
  async submitReview(params) {
    const { suggestionId, reviewAction, finalReply, reviewNote, reviewerId } = params;
    
    console.log('[ReviewServiceMySQL] 提交审核（事务）:', { suggestionId, reviewAction, reviewerId });
    
    // 使用事务执行所有操作
    try {
      const result = await this.pool.transaction(async (tx) => {
        // 步骤1: 校验审核动作
        if (!this._isValidReviewAction(reviewAction)) {
          throw new Error(`INVALID_REVIEW_ACTION: 无效的审核动作: ${reviewAction}`);
        }
        
        // 步骤2: 校验必填字段
        if (!suggestionId) {
          throw new Error('SUGGESTION_ID_REQUIRED: suggestionId 不能为空');
        }
        
        if (!reviewerId) {
          throw new Error('REVIEWER_ID_REQUIRED: reviewerId 不能为空');
        }
        
        // 步骤3: 查询 suggestion（使用事务连接）
        const suggestion = await this._findByIdInTx(tx, suggestionId);
        if (!suggestion) {
          throw new Error(`SUGGESTION_NOT_FOUND: Suggestion 不存在: ${suggestionId}`);
        }
        
        // 步骤4: 校验 suggestion 状态
        if (suggestion.reviewStatus !== REVIEW_STATUSES.PENDING_REVIEW) {
          throw new Error(`SUGGESTION_ALREADY_REVIEWED: Suggestion 已经审核过，当前状态: ${suggestion.reviewStatus}`);
        }
        
        // 步骤5: 根据审核动作校验 finalReply
        const validationResult = this._validateFinalReply(reviewAction, finalReply, suggestion.suggestedReply);
        if (!validationResult.valid) {
          throw new Error(`${validationResult.error}: ${validationResult.message}`);
        }
        
        // 步骤6: 确定最终答案和审核状态
        const { finalReplyValue, newReviewStatus } = this._determineFinalValues(
          reviewAction, 
          finalReply, 
          suggestion.suggestedReply
        );
        
        // 步飤7: 创建 review 记录（使用事务连接）
        const review = await this._createReviewInTx(tx, {
          projectId: suggestion.projectId,
          suggestionId: suggestion.suggestionId,
          evaluationId: suggestion.evaluationId,
          sessionId: suggestion.sessionId,
          messageId: suggestion.messageId,
          reviewAction: reviewAction,
          originalReply: suggestion.suggestedReply,
          finalReply: finalReplyValue,
          reviewNote: reviewNote || null,
          reviewerId: reviewerId
        });
        
        console.log('[ReviewServiceMySQL] review 记录已创建（事务中）:', review.reviewId);
        
        // 步骤8: 更新 suggestion 审核状态（使用事务连接）
        await this._updateReviewStatusInTx(tx, suggestion.id, newReviewStatus);
        
        console.log('[ReviewServiceMySQL] suggestion 状态已更新（事务中）:', newReviewStatus);
        
        // 步骤9: 如果审核通过，触发知识沉淀（异步，不阻塞主流程）
        if (newReviewStatus === REVIEW_STATUSES.APPROVED || newReviewStatus === REVIEW_STATUSES.MODIFIED_APPROVED) {
          console.log('[ReviewServiceMySQL] 审核通过，将异步触发知识沉淀');
          
          // 异步执行知识沉淀，不阻塞事务提交
          setImmediate(async () => {
            try {
              // 等待100ms确保事务已提交
              await new Promise(resolve => setTimeout(resolve, 100));
              
              const ingestResult = await this.knowledgeService.ingestFromReview(review.reviewId);
              if (ingestResult.success) {
                console.log('[ReviewServiceMySQL] 知识沉淀成功, knowledgeId:', ingestResult.knowledge.knowledgeId);
              } else {
                console.warn('[ReviewServiceMySQL] 知识沉淀失败:', ingestResult.message);
              }
            } catch (error) {
              console.error('[ReviewServiceMySQL] 知识沉淀异常:', error.message);
            }
          });
        }
        
        // 步骤10: 返回结果
        return {
          success: true,
          review: review,
          suggestion: {
            id: suggestion.id,
            suggestionId: suggestion.suggestionId,
            reviewStatus: newReviewStatus
          }
        };
      });
      
      console.log('[ReviewServiceMySQL] 事务提交成功');
      return result;
      
    } catch (error) {
      console.error('[ReviewServiceMySQL] 事务执行失败（已自动回滚）:', error.message);
      
      // 解析错误信息
      const errorParts = error.message.split(':');
      const errorCode = errorParts[0] || 'TRANSACTION_FAILED';
      const errorMessage = errorParts.slice(1).join(':').trim() || error.message;
      
      return {
        success: false,
        error: errorCode,
        message: errorMessage
      };
    }
  }

  /**
   * 在事务中查询 suggestion
   */
  async _findByIdInTx(tx, id) {
    const sql = `SELECT * FROM suggestions WHERE id = ? LIMIT 1`;
    const [rows] = await tx.query(sql, [id]);
    
    if (rows.length === 0) return null;
    
    const row = rows[0];
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
   * 在事务中创建 review 记录
   */
  async _createReviewInTx(tx, data) {
    const reviewId = `review_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date();
      
    const sql = `
      INSERT INTO reviews (
        review_id, project_id, suggestion_id, evaluation_id, session_id, message_id,
        review_action, original_reply, final_reply, review_note, reviewer_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
      
    await tx.query(sql, [
      reviewId,
      data.projectId || 'default',
      data.suggestionId,
      data.evaluationId,
      data.sessionId,
      data.messageId || '',
      data.reviewAction,
      data.originalReply,
      data.finalReply,
      data.reviewNote,
      data.reviewerId,
      now
    ]);
    
    // 查询刚创建的 review
    const selectSql = `SELECT * FROM reviews WHERE review_id = ? LIMIT 1`;
    const [rows] = await tx.query(selectSql, [reviewId]);
    
    const row = rows[0];
    return {
      id: row.id,
      reviewId: row.review_id,
      suggestionId: row.suggestion_id,
      evaluationId: row.evaluation_id,
      sessionId: row.session_id,
      reviewAction: row.review_action,
      originalReply: row.original_reply,
      finalReply: row.final_reply,
      reviewNote: row.review_note,
      reviewerId: row.reviewer_id,
      createdAt: row.created_at
    };
  }

  /**
   * 在事务中更新 suggestion 审核状态
   */
  async _updateReviewStatusInTx(tx, id, reviewStatus) {
    const sql = `UPDATE suggestions SET review_status = ?, updated_at = NOW() WHERE id = ?`;
    await tx.query(sql, [reviewStatus, id]);
  }

  /**
   * 校验审核动作是否有效
   */
  _isValidReviewAction(action) {
    return Object.values(REVIEW_ACTIONS).includes(action);
  }

  /**
   * 校验 finalReply 是否符合规则
   */
  _validateFinalReply(reviewAction, finalReply, originalReply) {
    // approve: finalReply 默认为 originalReply
    if (reviewAction === REVIEW_ACTIONS.APPROVE) {
      return { valid: true };
    }
    
    // modify_and_approve: 必须提供 finalReply，且不为空
    if (reviewAction === REVIEW_ACTIONS.MODIFY_AND_APPROVE) {
      if (!finalReply || finalReply.trim() === '') {
        return {
          valid: false,
          error: 'FINAL_REPLY_REQUIRED',
          message: 'modify_and_approve 动作必须提供 finalReply，且不能为空'
        };
      }
      return { valid: true };
    }
    
    // reject: finalReply 可为空
    if (reviewAction === REVIEW_ACTIONS.REJECT) {
      return { valid: true };
    }
    
    return {
      valid: false,
      error: 'INVALID_REVIEW_ACTION',
      message: `无效的审核动作: ${reviewAction}`
    };
  }

  /**
   * 确定最终答案和审核状态
   */
  _determineFinalValues(reviewAction, finalReply, originalReply) {
    if (reviewAction === REVIEW_ACTIONS.APPROVE) {
      return {
        finalReplyValue: originalReply,
        newReviewStatus: REVIEW_STATUSES.APPROVED
      };
    }
    
    if (reviewAction === REVIEW_ACTIONS.MODIFY_AND_APPROVE) {
      return {
        finalReplyValue: finalReply,
        newReviewStatus: REVIEW_STATUSES.MODIFIED_APPROVED
      };
    }
    
    if (reviewAction === REVIEW_ACTIONS.REJECT) {
      return {
        finalReplyValue: null,
        newReviewStatus: REVIEW_STATUSES.REJECTED
      };
    }
    
    throw new Error(`Invalid review action: ${reviewAction}`);
  }

  /**
   * 根据 suggestionId（业务ID）查询审核结果
   * 
   * @param {string} suggestionId - suggestion 业务 ID
   * @returns {Promise<Object|null>} 审核结果
   */
  async getReviewBySuggestionId(suggestionId) {
    return await this.reviewsRepo.findBySuggestionId(suggestionId);
  }

  /**
   * 查询审核记录列表（支持过滤）
   * 
   * @param {Object} filters - 过滤条件
   * @returns {Promise<Array>} 审核记录列表
   */
  async listReviews(filters = {}) {
    return await this.reviewsRepo.list(filters);
  }
}

// 导出类和常量
module.exports = {
  ReviewServiceMySQL,
  REVIEW_ACTIONS,
  REVIEW_STATUSES
};
