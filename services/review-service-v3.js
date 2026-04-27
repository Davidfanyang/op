/**
 * 主管审核服务
 * 
 * 职责：
 * 1. 读取待审核 suggestion
 * 2. 拼装审核上下文（suggestion + evaluation + conversation）
 * 3. 接收主管审核动作（approve / modify_and_approve / reject）
 * 4. 生成 review 记录
 * 5. 更新 suggestion 状态
 * 6. 不负责知识库写入
 * 7. 不负责 Web 页面
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

// Repository 选择（根据环境变量）
function getSuggestionsRepo() {
  if (process.env.REPOSITORY_TYPE === 'mysql') {
    const { getDefaultFactory } = require('../repositories');
    return getDefaultFactory().getSuggestionsRepository();
  }
  const { defaultRepo } = require('../repositories/impl/file-suggestions-repository');
  return defaultRepo;
}

function getReviewsRepo() {
  if (process.env.REPOSITORY_TYPE === 'mysql') {
    const { getDefaultFactory } = require('../repositories');
    return getDefaultFactory().getReviewsRepository();
  }
  const { defaultRepo } = require('../repositories/impl/file-reviews-repository');
  return defaultRepo;
}

function getLiveEvaluationsRepo() {
  if (process.env.REPOSITORY_TYPE === 'mysql') {
    const { getDefaultFactory } = require('../repositories');
    return getDefaultFactory().getLiveEvaluationRepository();
  }
  const { defaultRepo } = require('../repositories/impl/file-live-evaluations-repository');
  return defaultRepo;
}

function getLiveMessagesRepo() {
  if (process.env.REPOSITORY_TYPE === 'mysql') {
    const { getDefaultFactory } = require('../repositories');
    return getDefaultFactory().getLiveMessageRepository();
  }
  const { defaultRepo } = require('../repositories/impl/file-live-messages-repository');
  return defaultRepo;
}

function getLiveSessionsRepo() {
  if (process.env.REPOSITORY_TYPE === 'mysql') {
    const { getDefaultFactory } = require('../repositories');
    return getDefaultFactory().getLiveSessionRepository();
  }
  const { defaultRepo } = require('../repositories/impl/file-live-sessions-repository');
  return defaultRepo;
}

const suggestionsRepo = getSuggestionsRepo();
const reviewsRepo = getReviewsRepo();
const liveEvaluationsRepo = getLiveEvaluationsRepo();
const liveMessagesRepo = getLiveMessagesRepo();
const liveSessionsRepo = getLiveSessionsRepo();

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

class ReviewService {
  constructor(options = {}) {
    this.suggestionsRepo = options.suggestionsRepo || suggestionsRepo;
    this.reviewsRepo = options.reviewsRepo || reviewsRepo;
    this.evaluationsRepo = options.evaluationsRepo || liveEvaluationsRepo;
    this.messagesRepo = options.messagesRepo || liveMessagesRepo;
    this.sessionsRepo = options.sessionsRepo || liveSessionsRepo;
  }

  /**
   * 获取待审核的 suggestion 列表
   * 
   * @returns {Promise<Array>} 待审核 suggestion 列表
   */
  async getPendingSuggestions() {
    console.log('[ReviewService] 查询待审核 suggestion 列表');
    
    const suggestions = await this.suggestionsRepo.findPendingSuggestions();
    
    console.log(`[ReviewService] 找到 ${suggestions.length} 条待审核 suggestion`);
    
    return suggestions;
  }

  /**
   * 获取审核上下文（主管审核时看到的完整信息）
   * 
   * @param {string} suggestionId - suggestion ID
   * @returns {Promise<Object>} 审核上下文
   */
  async getReviewContext(suggestionId) {
    console.log('[ReviewService] 获取审核上下文:', { suggestionId });
    
    // 1. 查询 suggestion
    const suggestion = await this.suggestionsRepo.findById(suggestionId);
    if (!suggestion) {
      throw new Error(`Suggestion not found: ${suggestionId}`);
    }
    
    // 2. 查询 evaluation
    const evaluation = await this.evaluationsRepo.findById(suggestion.evaluationId);
    if (!evaluation) {
      throw new Error(`Evaluation not found: ${suggestion.evaluationId}`);
    }
    
    // 3. 查询 session
    const session = await this.sessionsRepo.findById(suggestion.sessionId);
    
    // 4. 查询 conversation（该 session 下的所有消息）
    const messages = await this.messagesRepo.findBySessionId(suggestion.sessionId);
    
    // 5. 组装上下文
    const context = {
      suggestion: {
        id: suggestion.id,
        suggestionId: suggestion.suggestionId || suggestion.suggestion_id,  // ✅ 添加业务 ID
        suggestedReply: suggestion.suggestedReply,
        reviewStatus: suggestion.reviewStatus,
        evaluationId: suggestion.evaluationId,
        sessionId: suggestion.sessionId,
        messageId: suggestion.messageId,
        scenario: suggestion.scenario,
        sourceType: suggestion.sourceType,
        createdAt: suggestion.createdAt
      },
      evaluation: {
        id: evaluation.id,
        evaluationId: evaluation.evaluationId,
        scenario: evaluation.scenario,
        stage: evaluation.stage,
        judgement: evaluation.judgement,
        summary: evaluation.summary,
        confidence: evaluation.confidence,
        classifyReason: evaluation.classifyReason,
        problemType: evaluation.problemType,
        currentReply: evaluation.currentReply,
        createdAt: evaluation.createdAt
      },
      session: session ? {
        id: session.id,
        sessionId: session.sessionId,
        agentId: session.agentId,
        status: session.status
      } : null,
      conversation: messages.map(msg => ({
        messageId: msg.messageId,
        role: msg.role,
        senderId: msg.senderId,
        senderName: msg.senderName,
        content: msg.content,
        timestamp: msg.timestamp
      })).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
    };
    
    console.log('[ReviewService] 审核上下文获取成功');
    
    return context;
  }

  /**
   * 执行审核动作（主入口）
   * 
   * @param {Object} params - 审核参数
   * @param {string} params.suggestionId - suggestion ID
   * @param {string} params.reviewAction - 审核动作 (approve/modify_and_approve/reject)
   * @param {string} params.finalReply - 审核后的最终答案（modify_and_approve 时必填）
   * @param {string} params.reviewNote - 审核备注
   * @param {string} params.reviewerId - 审核人 ID
   * @returns {Promise<Object>} 审核结果
   */
  async submitReview(params) {
    const { suggestionId, reviewAction, finalReply, reviewNote, reviewerId } = params;
    
    console.log('[ReviewService] 提交审核:', { suggestionId, reviewAction, reviewerId });
    
    // 步骤1: 校验审核动作
    if (!this._isValidReviewAction(reviewAction)) {
      return {
        success: false,
        error: 'INVALID_REVIEW_ACTION',
        message: `无效的审核动作: ${reviewAction}，可选值: ${Object.values(REVIEW_ACTIONS).join(', ')}`
      };
    }
    
    // 步骤2: 校验必填字段
    if (!suggestionId) {
      return {
        success: false,
        error: 'SUGGESTION_ID_REQUIRED',
        message: 'suggestionId 不能为空'
      };
    }
    
    if (!reviewerId) {
      return {
        success: false,
        error: 'REVIEWER_ID_REQUIRED',
        message: 'reviewerId 不能为空'
      };
    }
    
    // 步骤3: 查询 suggestion
    const suggestion = await this.suggestionsRepo.findById(suggestionId);
    if (!suggestion) {
      return {
        success: false,
        error: 'SUGGESTION_NOT_FOUND',
        message: `Suggestion 不存在: ${suggestionId}`
      };
    }
    
    // 步骤4: 校验 suggestion 状态
    if (suggestion.reviewStatus !== REVIEW_STATUSES.PENDING_REVIEW) {
      return {
        success: false,
        error: 'SUGGESTION_ALREADY_REVIEWED',
        message: `Suggestion 已经审核过，当前状态: ${suggestion.reviewStatus}`
      };
    }
    
    // 步骤5: 根据审核动作校验 finalReply
    const validationResult = this._validateFinalReply(reviewAction, finalReply, suggestion.suggestedReply);
    if (!validationResult.valid) {
      return {
        success: false,
        error: validationResult.error,
        message: validationResult.message
      };
    }
    
    // 步骤6: 确定最终答案和审核状态
    const { finalReplyValue, newReviewStatus } = this._determineFinalValues(
      reviewAction, 
      finalReply, 
      suggestion.suggestedReply
    );
    
    // 使用业务ID (suggestionId) 而不是数据库自增ID (id)
    const suggestionBusinessId =
      suggestion.suggestionId ||
      suggestion.suggestion_id ||
      suggestionId;
    
    try {
      // 步骤7: 检查是否已存在review，存在则更新，不存在则创建
      let review = await this.reviewsRepo.findBySuggestionId(suggestionBusinessId);
      if (review) {
        // 更新现有review
        review = await this.reviewsRepo.update(suggestionBusinessId, {
          reviewAction: reviewAction,
          originalReply: suggestion.suggestedReply,
          finalReply: finalReplyValue,
          reviewNote: reviewNote || null,
          reviewerId: reviewerId,
          reviewStatus: newReviewStatus
        });
        
        // 校验更新结果
        if (!review) {
          throw new Error(`Review update failed: suggestion_id=${suggestionBusinessId}`);
        }
        
        if (
          review.reviewAction === 'pending' ||
          review.reviewStatus === 'pending_review' ||
          !review.finalReply
        ) {
          throw new Error(`Review still pending after update: suggestion_id=${suggestionBusinessId}`);
        }
        
        console.log('[ReviewService] review 记录已更新:', review.reviewId);
      } else {
        // 创建新review
        review = await this.reviewsRepo.create({
          suggestionId: suggestionBusinessId,
          evaluationId: suggestion.evaluationId,
          sessionId: suggestion.sessionId,
          reviewAction: reviewAction,
          originalReply: suggestion.suggestedReply,
          finalReply: finalReplyValue,
          reviewNote: reviewNote || null,
          reviewerId: reviewerId
        });
        console.log('[ReviewService] review 记录已创建:', review.reviewId);
      }
      
      // 步骤8: 更新 suggestion 审核状态（使用业务ID）
      await this.suggestionsRepo.updateReviewStatus(suggestionBusinessId, newReviewStatus);
      
      console.log('[ReviewService] suggestion 状态已更新:', newReviewStatus);
      
      // 步骤9: 返回审核结果
      return {
        success: true,
        review: {
          id: review.id,
          reviewId: review.reviewId,
          suggestionId: review.suggestionId,
          evaluationId: review.evaluationId,
          sessionId: review.sessionId,
          reviewAction: review.reviewAction,
          originalReply: review.originalReply,
          finalReply: review.finalReply,
          reviewNote: review.reviewNote,
          reviewerId: review.reviewerId,
          createdAt: review.createdAt
        },
        suggestion: {
          id: suggestion.id,
          reviewStatus: newReviewStatus
        }
      };
      
    } catch (error) {
      console.error('[ReviewService] 审核失败:', error.message);
      return {
        success: false,
        error: 'REVIEW_FAILED',
        message: `审核失败: ${error.message}`
      };
    }
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
   * 根据 suggestionId 查询审核结果
   * 
   * @param {string} suggestionId - suggestion ID
   * @returns {Promise<Object|null>} 审核结果
   */
  async getReviewBySuggestionId(suggestionId) {
    return await this.reviewsRepo.findBySuggestionId(suggestionId);
  }

  /**
   * 根据 evaluationId 查询审核结果
   * 
   * @param {string} evaluationId - evaluation ID
   * @returns {Promise<Object|null>} 审核结果
   */
  async getReviewByEvaluationId(evaluationId) {
    return await this.reviewsRepo.findByEvaluationId(evaluationId);
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
  ReviewService,
  REVIEW_ACTIONS,
  REVIEW_STATUSES
};
