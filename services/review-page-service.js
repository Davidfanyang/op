/**
 * 主管审核页面承接服务
 * 
 * 职责：
 * 1. 查询审核任务列表（支持筛选）
 * 2. 查询审核任务详情（包含完整上下文）
 * 3. 提交审核结果（复用既有 review-service）
 * 4. 查询审核记录列表
 * 5. 查询审核统计
 * 
 * 不直接写知识库，不修改 suggestion 生成逻辑
 */

const { ReviewService, REVIEW_ACTIONS, REVIEW_STATUSES } = require('./review-service-v3');
const { KnowledgeService } = require('./knowledge-service');

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

function getAlertsRepo() {
  if (process.env.REPOSITORY_TYPE === 'mysql') {
    const { getDefaultFactory } = require('../repositories');
    return getDefaultFactory().getAlertsRepository();
  }
  const { defaultRepo } = require('../repositories/impl/file-alerts-repository');
  return defaultRepo;
}

const suggestionsRepo = getSuggestionsRepo();
const reviewsRepo = getReviewsRepo();
const liveEvaluationsRepo = getLiveEvaluationsRepo();
const liveMessagesRepo = getLiveMessagesRepo();
const liveSessionsRepo = getLiveSessionsRepo();
const alertsRepo = getAlertsRepo();

class ReviewPageService {
  constructor(options = {}) {
    this.reviewService = options.reviewService || new ReviewService();
    this.suggestionsRepo = options.suggestionsRepo || suggestionsRepo;
    this.reviewsRepo = options.reviewsRepo || reviewsRepo;
    this.evaluationsRepo = options.evaluationsRepo || liveEvaluationsRepo;
    this.messagesRepo = options.messagesRepo || liveMessagesRepo;
    this.sessionsRepo = options.sessionsRepo || liveSessionsRepo;
    this.alertsRepo = options.alertsRepo || alertsRepo;
    this.knowledgeService = options.knowledgeService || new KnowledgeService();
  }

  /**
   * 查询待审核任务列表
   * 
   * @param {Object} filters - 筛选条件
   * @param {Object} pagination - 分页参数
   * @returns {Promise<Object>} 任务列表和分页信息
   */
  async getReviewTasks(filters = {}, pagination = {}) {
    console.log('[ReviewPageService] 查询审核任务列表:', { filters, pagination });

    // 获取所有 suggestion
    let allSuggestions = await this.suggestionsRepo.findPendingSuggestions();

    // 根据筛选条件过滤
    let filteredSuggestions = allSuggestions;

    if (filters.status) {
      filteredSuggestions = filteredSuggestions.filter(s => s.reviewStatus === filters.status);
    }

    // 获取关联的 session 和 evaluation 信息用于筛选
    const suggestionsWithDetails = await Promise.all(
      filteredSuggestions.map(async (suggestion) => {
        const session = await this.sessionsRepo.findById(suggestion.sessionId);
        const evaluation = await this.evaluationsRepo.findById(suggestion.evaluationId);
        
        return {
          suggestion,
          session,
          evaluation
        };
      })
    );

    // 应用项目筛选
    if (filters.project) {
      filteredSuggestions = suggestionsWithDetails
        .filter(item => item.session && item.session.projectId === filters.project)
        .map(item => item.suggestion);
    }

    // 应用客服 ID 筛选
    if (filters.agent_id) {
      filteredSuggestions = suggestionsWithDetails
        .filter(item => item.session && item.session.agentId === filters.agent_id)
        .map(item => item.suggestion);
    }

    // 应用场景筛选
    if (filters.scenario) {
      filteredSuggestions = suggestionsWithDetails
        .filter(item => item.evaluation && item.evaluation.scenario === filters.scenario)
        .map(item => item.suggestion);
    }

    // 应用告警级别筛选
    if (filters.alert_level) {
      const alertFilteredSuggestions = [];
      for (const suggestion of filteredSuggestions) {
        const alerts = await this.alertsRepo.findByEvaluationId(suggestion.evaluationId);
        const hasMatchingAlert = alerts.some(alert => alert.alertLevel === filters.alert_level);
        if (hasMatchingAlert) {
          alertFilteredSuggestions.push(suggestion);
        }
      }
      filteredSuggestions = alertFilteredSuggestions;
    }

    // 应用时间范围筛选
    if (filters.start_time) {
      const startTime = new Date(filters.start_time);
      filteredSuggestions = filteredSuggestions.filter(s => new Date(s.createdAt) >= startTime);
    }

    if (filters.end_time) {
      const endTime = new Date(filters.end_time);
      filteredSuggestions = filteredSuggestions.filter(s => new Date(s.createdAt) <= endTime);
    }

    // 分页处理
    const page = Math.max(1, parseInt(pagination.page) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(pagination.page_size) || 20));
    const total = filteredSuggestions.length;
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const paginatedSuggestions = filteredSuggestions.slice(startIndex, endIndex);

    // 构建返回数据
    const list = await Promise.all(
      paginatedSuggestions.map(async (suggestion) => {
        const evaluation = await this.evaluationsRepo.findById(suggestion.evaluationId);
        const session = await this.sessionsRepo.findById(suggestion.sessionId);
        const alerts = await this.alertsRepo.findByEvaluationId(suggestion.evaluationId) || [];
        
        return {
          task_id: suggestion.id || '',
          suggestion_id: suggestion.suggestionId || suggestion.id || '',  // ✅ 优先使用业务 ID
          session_id: suggestion.sessionId || '',
          evaluation_id: suggestion.evaluationId || '',
          project: session ? session.projectId : null,
          agent_id: session ? session.agentId : null,
          scenario: evaluation ? evaluation.scenario : null,
          problem_type: evaluation ? evaluation.problemType : null,
          classify_reason: evaluation ? evaluation.classifyReason : null,
          suggested_reply_preview: suggestion.suggestedReply ? (typeof suggestion.suggestedReply === 'string' ? (suggestion.suggestedReply.substring(0, 100) + (suggestion.suggestedReply.length > 100 ? '...' : '')) : null) : null,
          alert_level: alerts && alerts.length > 0 ? alerts[0].alertLevel : null,
          status: suggestion.reviewStatus || 'pending',
          created_at: suggestion.createdAt ? suggestion.createdAt.toISOString() : null
        };
      })
    );

    return {
      code: 0,
      data: {
        list,
        total,
        page,
        page_size: pageSize
      }
    };
  }

  /**
   * 查询审核任务详情
   * 
   * @param {string} suggestionId - suggestion ID
   * @returns {Promise<Object>} 完整的审核上下文
   */
  async getReviewTaskDetail(suggestionId) {
    console.log('[ReviewPageService] 查询审核任务详情:', suggestionId);

    try {
      // 1. 优先按业务 suggestion_id 查询，其次兼容自增 id
      const suggestion =
        await this.suggestionsRepo.findBySuggestionId(suggestionId) ||
        await this.suggestionsRepo.findById(suggestionId);
      
      if (!suggestion) {
        return {
          code: 1,
          error: 'task_not_found',
          message: '审核任务不存在'
        };
      }

      const businessSuggestionId =
        suggestion.suggestionId ||
        suggestion.suggestion_id ||
        suggestionId;

      const sessionId =
        suggestion.sessionId ||
        suggestion.session_id ||
        null;

      const evaluationId =
        suggestion.evaluationId ||
        suggestion.evaluation_id ||
        null;

      // 2. 直接用 live repositories 查上下文，不再调用 reviewService.getReviewContext
      const session = sessionId
        ? await this.sessionsRepo.findById(sessionId)
        : null;

      const evaluation = evaluationId
        ? await this.evaluationsRepo.findById(evaluationId)
        : null;

      let conversation = [];
      if (sessionId && this.messagesRepo.findBySessionId) {
        conversation = await this.messagesRepo.findBySessionId(sessionId);
      } else if (sessionId && this.messagesRepo.findMany) {
        const result = await this.messagesRepo.findMany({ sessionId });
        conversation = result.items || result.list || result || [];
      }

      let alerts = [];
      if (evaluationId && this.alertsRepo.findByEvaluationId) {
        alerts = await this.alertsRepo.findByEvaluationId(evaluationId);
      }
      alerts = Array.isArray(alerts) ? alerts : [];

      const review = this.reviewsRepo.findBySuggestionId
        ? await this.reviewsRepo.findBySuggestionId(businessSuggestionId)
        : null;

      const safeDate = (value) => {
        if (!value) return null;
        try {
          return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
        } catch (e) {
          return String(value);
        }
      };

      const list = Array.isArray(conversation)
        ? conversation
        : Array.isArray(conversation.items)
          ? conversation.items
          : Array.isArray(conversation.list)
            ? conversation.list
            : [];

      return {
        code: 0,
        data: {
          task: {
            task_id: businessSuggestionId,
            suggestion_id: businessSuggestionId,
            session_id: sessionId,
            evaluation_id: evaluationId,
            status: suggestion.reviewStatus || suggestion.review_status || suggestion.status || 'pending_review',
            created_at: safeDate(suggestion.createdAt || suggestion.created_at)
          },
          suggestion: {
            suggestion_id: businessSuggestionId,
            status: suggestion.reviewStatus || suggestion.review_status || suggestion.status || 'pending_review',
            source_type: suggestion.sourceType || suggestion.source_type || null,
            suggested_reply: suggestion.suggestedReply || suggestion.suggested_reply || '',
            created_at: safeDate(suggestion.createdAt || suggestion.created_at)
          },
          session: session ? {
            session_id: session.sessionId || session.session_id || sessionId,
            project: session.project || session.projectId || session.project_id || null,
            chat_id: session.chatId || session.chat_id || null,
            agent_id: session.agentId || session.agent_id || null,
            status: session.status || null,
            started_at: safeDate(session.startedAt || session.started_at || session.createdAt || session.created_at),
            updated_at: safeDate(session.updatedAt || session.updated_at)
          } : null,
          conversation: list.map(msg => ({
            role: msg.role || msg.senderRole || msg.sender_role || '-',
            sender_name: msg.senderName || msg.sender_name || msg.senderId || msg.sender_id || '-',
            content: msg.content || '',
            timestamp: safeDate(msg.timestamp || msg.createdAt || msg.created_at)
          })),
          evaluation: evaluation ? {
            evaluation_id: evaluation.evaluationId || evaluation.evaluation_id || evaluationId,
            scenario: evaluation.scenario || null,
            stage: evaluation.stage || null,
            judgement: evaluation.judgement || null,
            summary: evaluation.summary || null,
            coach_summary: evaluation.coachSummary || evaluation.coach_summary || null,
            confidence: evaluation.confidence || null,
            problem_type: evaluation.problemType || evaluation.problem_type || null,
            need_review: evaluation.needReview || evaluation.need_review || false,
            classify_reason: evaluation.classifyReason || evaluation.classify_reason || null,
            alert_level: evaluation.alertLevel || evaluation.alert_level || 'none',
            created_at: safeDate(evaluation.createdAt || evaluation.created_at)
          } : null,
          alerts: alerts.map(alert => ({
            alert_id: alert.alertId || alert.alert_id || alert.id || null,
            alert_level: alert.alertLevel || alert.alert_level || 'none',
            alert_type: alert.alertType || alert.alert_type || null,
            alert_reason: alert.alertReason || alert.alert_reason || null,
            status: alert.status || null,
            created_at: safeDate(alert.createdAt || alert.created_at)
          })),
          review: review ? {
            review_id: review.reviewId || review.review_id || null,
            suggestion_id: review.suggestionId || review.suggestion_id || businessSuggestionId,
            review_action: review.reviewAction || review.review_action || null,
            review_status: review.reviewStatus || review.review_status || null,
            original_reply: review.originalReply || review.original_reply || null,
            final_reply: review.finalReply || review.final_reply || null,
            review_note: review.reviewNote || review.review_note || null,
            reviewer_id: review.reviewerId || review.reviewer_id || null,
            created_at: safeDate(review.createdAt || review.created_at)
          } : null
        }
      };
    } catch (error) {
      console.error('[ReviewPageService] 获取审核详情失败:', error);
      return {
        code: 1,
        error: 'internal_error',
        message: error.message
      };
    }
  }

  /**
   * 提交审核结果
   * 
   * @param {Object} params - 审核参数
   * @returns {Promise<Object>} 审核结果
   */
  async submitReviewResult(params) {
    console.log('[ReviewPageService] 提交审核结果:', params);

    const { suggestion_id, review_action, final_reply, review_note, reviewer_id } = params;

    // 校验必填字段
    if (!suggestion_id) {
      return { code: 1, error: 'suggestion_id_required' };
    }

    if (!review_action) {
      return { code: 1, error: 'review_action_required' };
    }

    if (!reviewer_id) {
      return { code: 1, error: 'reviewer_id_required' };
    }

    // 校验 review_action
    const validActions = [REVIEW_ACTIONS.APPROVE, REVIEW_ACTIONS.MODIFY_AND_APPROVE, REVIEW_ACTIONS.REJECT];
    if (!validActions.includes(review_action)) {
      return { code: 1, error: 'invalid_review_action' };
    }

    // 校验 final_reply（modify_and_approve 时必填）
    if (review_action === REVIEW_ACTIONS.MODIFY_AND_APPROVE) {
      if (!final_reply || final_reply.trim() === '') {
        return { code: 1, error: 'final_reply_required' };
      }
    }

    // 检查 suggestion 是否存在且处于 pending_review 状态
    // 优先使用业务 ID 查询
    let suggestion =
      await this.suggestionsRepo.findBySuggestionId(suggestion_id) ||
      await this.suggestionsRepo.findById(suggestion_id);
    
    if (!suggestion) {
      return { code: 1, error: 'suggestion_not_found' };
    }

    if (suggestion.reviewStatus !== REVIEW_STATUSES.PENDING_REVIEW) {
      return { code: 1, error: 'suggestion_already_reviewed' };
    }
    
    // 使用业务 ID 调用 reviewService
    const businessSuggestionId =
      suggestion.suggestionId ||
      suggestion.suggestion_id ||
      suggestion_id;

    // 复用既有 review-service 提交审核
    const reviewResult = await this.reviewService.submitReview({
      suggestionId: businessSuggestionId,
      reviewAction: review_action,
      finalReply: final_reply || null,
      reviewNote: review_note || null,
      reviewerId: reviewer_id
    });

    if (!reviewResult.success) {
      return { code: 1, error: reviewResult.error };
    }

    // 步骤6: 如果审核通过，沉淀到 knowledge_base
    let knowledgeResult = null;
    if (review_action === REVIEW_ACTIONS.APPROVE || review_action === REVIEW_ACTIONS.MODIFY_AND_APPROVE) {
      console.log('[ReviewPageService] 审核通过，开始沉淀知识, reviewId:', reviewResult.review.reviewId);
      
      // 调用 knowledgeService 沉淀知识
      knowledgeResult = await this.knowledgeService.ingestFromReview(reviewResult.review.reviewId);
      console.log('[ReviewPageService] 知识沉淀结果:', knowledgeResult);
      
      // 强校验：如果沉淀失败，必须抛出错误
      if (!knowledgeResult.success) {
        const errorMsg = `Knowledge ingestion failed: ${knowledgeResult.error} - ${knowledgeResult.message}`;
        console.error('[ReviewPageService]', errorMsg);
        throw new Error(errorMsg);
      }
      
      // 二次确认：重新查询 knowledge_base 确认记录已创建
      const verifyKnowledge = await this.knowledgeService.getKnowledgeByReviewId(reviewResult.review.reviewId);
      if (!verifyKnowledge) {
        const errorMsg = `Knowledge verification failed: record not found after ingestion, reviewId=${reviewResult.review.reviewId}`;
        console.error('[ReviewPageService]', errorMsg);
        throw new Error(errorMsg);
      }
      
      console.log('[ReviewPageService] Knowledge 沉淀成功验证:', verifyKnowledge.knowledgeId);
    }

    return {
      code: 0,
      data: {
        review_id: reviewResult.review.reviewId,
        suggestion_id: reviewResult.review.suggestionId,
        review_action: reviewResult.review.reviewAction,
        status: reviewResult.suggestion.reviewStatus,
        knowledge: knowledgeResult ? {
          knowledge_id: knowledgeResult.knowledge?.knowledgeId || null,
          success: knowledgeResult.success,
          error: knowledgeResult.error || null
        } : null
      }
    };
  }

  /**
   * 查询审核记录列表
   * 
   * @param {Object} filters - 筛选条件
   * @param {Object} pagination - 分页参数
   * @returns {Promise<Object>} 审核记录列表
   */
  async getReviewRecords(filters = {}, pagination = {}) {
    console.log('[ReviewPageService] 查询审核记录列表:', { filters, pagination });

    // 获取所有 review 记录
    let allReviews = await this.reviewsRepo.list(filters);

    // 应用筛选条件
    let filteredReviews = allReviews;

    if (filters.review_action) {
      filteredReviews = filteredReviews.filter(r => r.reviewAction === filters.review_action);
    }

    if (filters.reviewer_id) {
      filteredReviews = filteredReviews.filter(r => r.reviewerId === filters.reviewer_id);
    }

    // 获取关联的 session 和 evaluation 用于筛选
    const reviewsWithDetails = await Promise.all(
      filteredReviews.map(async (review) => {
        const session = await this.sessionsRepo.findById(review.sessionId);
        const evaluation = await this.evaluationsRepo.findById(review.evaluationId);
        
        return {
          review,
          session,
          evaluation
        };
      })
    );

    // 应用项目筛选
    if (filters.project) {
      filteredReviews = reviewsWithDetails
        .filter(item => item.session && item.session.projectId === filters.project)
        .map(item => item.review);
    }

    // 应用场景筛选
    if (filters.scenario) {
      filteredReviews = reviewsWithDetails
        .filter(item => item.evaluation && item.evaluation.scenario === filters.scenario)
        .map(item => item.review);
    }

    // 应用时间范围筛选
    if (filters.start_time) {
      const startTime = new Date(filters.start_time);
      filteredReviews = filteredReviews.filter(r => new Date(r.createdAt) >= startTime);
    }

    if (filters.end_time) {
      const endTime = new Date(filters.end_time);
      filteredReviews = filteredReviews.filter(r => new Date(r.createdAt) <= endTime);
    }

    // 分页处理
    const page = Math.max(1, parseInt(pagination.page) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(pagination.page_size) || 20));
    const total = filteredReviews.length;
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const paginatedReviews = filteredReviews.slice(startIndex, endIndex);

    // 构建返回数据
    const list = await Promise.all(
      paginatedReviews.map(async (review) => {
        const evaluation = await this.evaluationsRepo.findById(review.evaluationId);
        const session = await this.sessionsRepo.findById(review.sessionId);
        
        return {
          review_id: review.reviewId,
          suggestion_id: review.suggestionId,
          session_id: review.sessionId,
          evaluation_id: review.evaluationId,
          project: session ? session.projectId : null,
          scenario: evaluation ? evaluation.scenario : null,
          review_action: review.reviewAction,
          reviewer_id: review.reviewerId,
          created_at: review.createdAt.toISOString()
        };
      })
    );

    return {
      code: 0,
      data: {
        list,
        total,
        page,
        page_size: pageSize
      }
    };
  }

  /**
   * 查询审核统计
   * 
   * @param {Object} filters - 筛选条件
   * @returns {Promise<Object>} 统计数据
   */
  async getReviewStats(filters = {}) {
    console.log('[ReviewPageService] 查询审核统计:', filters);

    // 获取所有 suggestion
    let allSuggestions = await this.suggestionsRepo.findPendingSuggestions();
    
    // 获取所有 review 记录
    let allReviews = await this.reviewsRepo.list(filters);

    // 应用筛选条件（如果有）
    if (filters.project || filters.reviewer_id || filters.start_time || filters.end_time) {
      const reviewsWithDetails = await Promise.all(
        allReviews.map(async (review) => {
          const session = await this.sessionsRepo.findById(review.sessionId);
          return { review, session };
        })
      );

      let filteredReviews = reviewsWithDetails;

      if (filters.project) {
        filteredReviews = filteredReviews.filter(item => item.session && item.session.projectId === filters.project);
      }

      if (filters.reviewer_id) {
        filteredReviews = filteredReviews.filter(item => item.review.reviewerId === filters.reviewer_id);
      }

      if (filters.start_time) {
        const startTime = new Date(filters.start_time);
        filteredReviews = filteredReviews.filter(item => new Date(item.review.createdAt) >= startTime);
      }

      if (filters.end_time) {
        const endTime = new Date(filters.end_time);
        filteredReviews = filteredReviews.filter(item => new Date(item.review.createdAt) <= endTime);
      }

      allReviews = filteredReviews.map(item => item.review);
    }

    // 统计数据
    const pendingCount = allSuggestions.filter(s => s.reviewStatus === REVIEW_STATUSES.PENDING_REVIEW).length;
    const approvedCount = allReviews.filter(r => r.reviewAction === REVIEW_ACTIONS.APPROVE).length;
    const modifiedApprovedCount = allReviews.filter(r => r.reviewAction === REVIEW_ACTIONS.MODIFY_AND_APPROVE).length;
    const rejectedCount = allReviews.filter(r => r.reviewAction === REVIEW_ACTIONS.REJECT).length;
    const totalReviewed = allReviews.length;

    return {
      code: 0,
      data: {
        pending_count: pendingCount,
        approved_count: approvedCount,
        modified_approved_count: modifiedApprovedCount,
        rejected_count: rejectedCount,
        total_reviewed: totalReviewed
      }
    };
  }
}

// 导出类和默认实例
const defaultService = new ReviewPageService();

module.exports = {
  ReviewPageService,
  defaultService
};
