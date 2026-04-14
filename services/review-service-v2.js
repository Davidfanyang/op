/**
 * 复核服务层 V2 - 支持 Repository 抽象
 * 
 * 职责：
 * 1. 查询待复核列表
 * 2. 查询复核详情
 * 3. 提交复核结果（事务性更新 review + evaluation）
 * 4. 查询复核统计
 * 5. 创建 review item（从 live_monitor 触发）
 */

const { Errors, APIError } = require('../core/api/response');
const ConversationSignalsService = require('../core/conversation-signals');

// 合法的复核决定
const VALID_REVIEW_DECISIONS = ['approved', 'rejected', 'needs_edit'];

/**
 * 复核服务类
 */
class ReviewServiceV2 {
  constructor(repositories) {
    this.sessionRepo = repositories.session;
    this.messageRepo = repositories.message;
    this.evaluationRepo = repositories.evaluation;
    this.reviewRepo = repositories.review;
  }

  /**
   * 查询待复核列表
   * @param {Object} params - 查询参数
   * @returns {Promise<Object>}
   */
  async getPendingReviews(params) {
    const { projectId, alertLevel, limit = 20, offset = 0 } = params;
    
    if (!projectId) {
      throw Errors.projectIdRequired();
    }
    
    const filters = {};
    if (alertLevel) {
      filters.alertLevel = alertLevel;
    }
    
    const result = await this.reviewRepo.findPending(projectId, filters, {
      page: Math.floor(offset / limit) + 1,
      limit: Math.min(limit, 100)
    });
    
    // 转换为列表摘要格式
    const items = await Promise.all(result.items.map(async (review) => {
      // 获取关联的 evaluation 以获取 score 和 summary
      const evaluation = await this.evaluationRepo.findById(review.evaluationId);
      const message = await this.messageRepo.findById(review.messageId);
      const session = await this.sessionRepo.findById(review.sessionId);
      
      // 🆕 获取 conversation signals 摘要
      let signalsSummary = null;
      try {
        const conversationId = await this._findConversationId(session, message);
        if (conversationId) {
          const signals = await this.conversationSignals.getSignalsByConversation(conversationId);
          if (signals) {
            signalsSummary = {
              is_sla_risk: signals.is_sla_risk || 0,
              is_invalid_conversation: signals.is_invalid_conversation || 0,
              is_unclosed_conversation: signals.is_unclosed_conversation || 0,
              is_high_message_count: signals.is_high_message_count || 0,
              first_response_seconds: signals.first_response_seconds || null,
              message_count: signals.message_count || 0
            };
          }
        }
      } catch (err) {
        console.warn('[ReviewServiceV2] Failed to fetch signals summary for pending:', err.message);
      }
      
      return {
        reviewId: review.reviewId,
        projectId: review.projectId,
        evaluationId: review.evaluationId,
        sessionId: review.sessionId,
        messageId: review.messageId,
        channel: review.channel,
        employeeId: review.employeeId,
        customerId: review.customerId,
        alertLevel: review.alertLevel,
        reviewStatus: review.reviewStatus,
        score: evaluation?.score ?? 0,
        coachSummary: evaluation?.summary || '',
        originalReplyPreview: message?.content?.substring(0, 200) || '',
        createdAt: review.createdAt,
        
        // 🆕 附加 signals 摘要 (列表页快速判断)
        conversationSignals: signalsSummary
      };
    }));
    
    return {
      items,
      pagination: {
        limit,
        offset,
        total: result.total,
        hasMore: offset + items.length < result.total
      }
    };
  }

  /**
   * 查询复核详情
   * @param {string} reviewId - 复核ID
   * @returns {Promise<Object>}
   */
  async getReviewDetail(reviewId) {
    const review = await this.reviewRepo.findById(reviewId);
    if (!review) {
      throw Errors.reviewNotFound();
    }
    
    // 并行获取所有关联数据
    const [evaluation, message, session, actions] = await Promise.all([
      this.evaluationRepo.findById(review.evaluationId),
      this.messageRepo.findById(review.messageId),
      this.sessionRepo.findById(review.sessionId),
      this.reviewRepo.getActionHistory(reviewId, { limit: 50 })
    ]);
    
    if (!evaluation) {
      throw Errors.evaluationNotFound();
    }
    
    // 构建 supervisorPayload（前端渲染核心卡片）
    const supervisorPayload = {
      originalReply: message?.content || '',
      score: evaluation.score,
      alertLevel: evaluation.alertLevel,
      findings: evaluation.findings || [],
      suggestions: evaluation.suggestions || [],
      recommendedReply: evaluation.standardReply || '',
      reviewStatus: review.reviewStatus
    };
    
    return {
      review: {
        reviewId: review.reviewId,
        projectId: review.projectId,
        evaluationId: review.evaluationId,
        sessionId: review.sessionId,
        messageId: review.messageId,
        channel: review.channel,
        employeeId: review.employeeId,
        customerId: review.customerId,
        alertLevel: review.alertLevel,
        reviewStatus: review.reviewStatus,
        reviewDecision: review.reviewDecision,
        reviewComment: review.reviewComment,
        optimizedReply: review.optimizedReply,
        optimizedReplyApproved: review.optimizedReplyApproved,
        isAdopted: review.isAdopted,
        finalReplyVersion: review.finalReplyVersion,
        reviewedBy: review.reviewedBy,
        reviewedAt: review.reviewedAt,
        falsePositiveReason: review.falsePositiveReason,
        createdAt: review.createdAt,
        updatedAt: review.updatedAt
      },
      evaluation: {
        evaluationId: evaluation.evaluationId,
        projectId: evaluation.projectId,
        mode: evaluation.mode,
        scenarioId: evaluation.scenarioId,
        status: evaluation.status,
        evaluationStatus: evaluation.evaluationStatus,
        score: evaluation.score,
        alertLevel: evaluation.alertLevel,
        matchConfidence: evaluation.matchConfidence,
        dimensionScores: evaluation.dimensionScores || {},
        findings: evaluation.findings || [],
        suggestions: evaluation.suggestions || [],
        strengths: evaluation.strengths || [],
        alerts: evaluation.alerts || [],
        coachSummary: evaluation.summary || '',
        standardReply: evaluation.standardReply,
        reviewStatus: evaluation.reviewStatus,
        reviewDecision: evaluation.reviewDecision,
        reviewedBy: evaluation.reviewedBy,
        reviewedAt: evaluation.reviewedAt,
        finalAccepted: evaluation.finalAccepted,
        finalReplyVersion: evaluation.finalReplyVersion,
        createdAt: evaluation.createdAt,
        updatedAt: evaluation.updatedAt
      },
      message: message ? {
        messageId: message.messageId,
        sessionId: message.sessionId,
        projectId: message.projectId,
        channel: message.channel,
        senderRole: message.senderRole,
        senderId: message.senderId,
        messageDirection: message.direction,
        content: message.content,
        normalizedIntent: message.normalized?.intent || null,
        normalizedEvent: message.normalized?.event || null,
        sentAt: message.timestamp
      } : null,
      session: session ? {
        sessionId: session.sessionId,
        projectId: session.projectId,
        channel: session.channel,
        mode: session.mode,
        employeeId: session.employeeId,
        customerId: session.customerId,
        status: session.status,
        startedAt: session.startedAt,
        endedAt: session.endedAt
      } : null,
      supervisorPayload,
      actions: actions.items || []
    };
  }

  /**
   * 提交复核结果
   * @param {string} reviewId - 复核ID
   * @param {Object} payload - 复核数据
   * @returns {Promise<Object>}
   */
  async submitReview(reviewId, payload) {
    const {
      reviewedBy,
      reviewDecision,
      reviewComment,
      optimizedReply,
      optimizedReplyApproved,
      isAdopted,
      closeReview = false
    } = payload;
    
    // 1. 校验必填字段
    if (!reviewedBy) {
      throw Errors.badRequest('reviewedBy is required');
    }
    
    if (!reviewDecision || !VALID_REVIEW_DECISIONS.includes(reviewDecision)) {
      throw Errors.invalidReviewDecision();
    }
    
    // 2. 查询当前 review
    const review = await this.reviewRepo.findById(reviewId);
    if (!review) {
      throw Errors.reviewNotFound();
    }
    
    // 3. 检查是否已处理
    if (review.reviewStatus !== 'pending') {
      throw Errors.reviewAlreadyProcessed();
    }
    
    // 4. 构建复核结果
    const reviewResult = {
      reviewedBy,
      reviewDecision,
      reviewComment,
      optimizedReply,
      optimizedReplyApproved,
      isAdopted,
      reviewStatus: closeReview ? 'closed' : 'reviewed'
    };
    
    // 5. 如果采纳了优化回复，设置 finalReplyVersion
    if (optimizedReply && (reviewDecision === 'approved' || reviewDecision === 'needs_edit')) {
      reviewResult.finalReplyVersion = optimizedReply;
    }
    
    // 6. 执行提交（事务性更新 review + evaluation + action）
    const updatedReview = await this.reviewRepo.submitReview(reviewId, reviewResult);
    
    // 7. 获取更新后的 evaluation
    const updatedEvaluation = await this.evaluationRepo.findById(review.evaluationId);
    
    return {
      review: {
        reviewId: updatedReview.reviewId,
        reviewStatus: updatedReview.reviewStatus,
        reviewDecision: updatedReview.reviewDecision,
        reviewComment: updatedReview.reviewComment,
        optimizedReply: updatedReview.optimizedReply,
        optimizedReplyApproved: updatedReview.optimizedReplyApproved,
        isAdopted: updatedReview.isAdopted,
        finalReplyVersion: updatedReview.finalReplyVersion,
        reviewedBy: updatedReview.reviewedBy,
        reviewedAt: updatedReview.reviewedAt,
        updatedAt: updatedReview.updatedAt
      },
      evaluation: {
        evaluationId: updatedEvaluation.evaluationId,
        reviewStatus: updatedEvaluation.reviewStatus,
        reviewDecision: updatedEvaluation.reviewDecision,
        reviewedBy: updatedEvaluation.reviewedBy,
        reviewedAt: updatedEvaluation.reviewedAt,
        finalAccepted: updatedEvaluation.finalAccepted,
        finalReplyVersion: updatedEvaluation.finalReplyVersion,
        updatedAt: updatedEvaluation.updatedAt
      },
      syncStatus: {
        reviewUpdated: true,
        evaluationUpdated: true,
        actionLogged: true
      }
    };
  }

  /**
   * 查询复核统计
   * @param {string} projectId - 项目ID
   * @param {Object} dateRange - 日期范围（可选）
   * @returns {Promise<Object>}
   */
  async getReviewStats(projectId, dateRange = {}) {
    if (!projectId) {
      throw Errors.projectIdRequired();
    }
    
    const stats = await this.reviewRepo.getStats(projectId, dateRange);
    
    // 计算比率
    const total = stats.total || 0;
    const processed = (stats.reviewed || 0) + (stats.closed || 0);
    
    return {
      projectId,
      summary: {
        pendingCount: stats.pending || 0,
        reviewedCount: stats.reviewed || 0,
        closedCount: stats.closed || 0,
        approvedCount: stats.byDecision?.approved || 0,
        rejectedCount: stats.byDecision?.rejected || 0,
        needsEditCount: stats.byDecision?.needs_edit || 0,
        highAlertCount: stats.byAlertLevel?.critical || 0,
        mediumAlertCount: stats.byAlertLevel?.warning || 0,
        lowAlertCount: stats.byAlertLevel?.observation || 0
      },
      rates: {
        approvedRate: processed > 0 ? (stats.byDecision?.approved || 0) / processed : 0,
        rejectedRate: processed > 0 ? (stats.byDecision?.rejected || 0) / processed : 0,
        needsEditRate: processed > 0 ? (stats.byDecision?.needs_edit || 0) / processed : 0,
        highAlertRate: total > 0 ? (stats.byAlertLevel?.critical || 0) / total : 0
      },
      updatedAt: new Date().toISOString()
    };
  }

  /**
   * 查询最近已处理记录
   * @param {string} projectId - 项目ID
   * @param {number} limit - 返回数量
   * @returns {Promise<Object>}
   */
  async getRecentReviews(projectId, limit = 20) {
    if (!projectId) {
      throw Errors.projectIdRequired();
    }
    
    // 查询已处理状态的记录
    const result = await this.reviewRepo.findMany(
      { projectId, reviewStatus: ['reviewed', 'closed'] },
      { page: 1, limit: Math.min(limit, 100) }
    );
    
    // 转换为摘要格式
    const items = await Promise.all(result.items.map(async (review) => {
      const evaluation = await this.evaluationRepo.findById(review.evaluationId);
      const message = await this.messageRepo.findById(review.messageId);
      
      return {
        reviewId: review.reviewId,
        reviewStatus: review.reviewStatus,
        reviewDecision: review.reviewDecision,
        alertLevel: review.alertLevel,
        employeeId: review.employeeId,
        reviewedBy: review.reviewedBy,
        reviewedAt: review.reviewedAt,
        score: evaluation?.score ?? 0,
        originalReplyPreview: message?.content?.substring(0, 200) || ''
      };
    }));
    
    return { items };
  }

  /**
   * 创建 review item（从 live_monitor 触发）
   * @param {Object} data - 创建数据
   * @returns {Promise<Object>}
   */
  async createReviewItem(data) {
    const {
      evaluationId,
      projectId,
      sessionId,
      messageId,
      channel,
      employeeId,
      customerId,
      alertLevel,
      createdBy
    } = data;
    
    // 检查是否已存在
    const existing = await this.reviewRepo.findByEvaluationId(evaluationId);
    if (existing) {
      return existing; // 已存在，直接返回
    }
    
    // 创建新的 review item
    const review = await this.reviewRepo.create({
      projectId,
      sessionId,
      messageId,
      evaluationId,
      channel,
      employeeId,
      customerId,
      alertLevel,
      reviewStatus: 'pending',
      createdBy: createdBy || 'system'
    });
    
    return review;
  }

  /**
   * 查找对应的 conversation ID
   * 
   * 映射策略:
   * 1. 优先通过 session.metadata.chat_id 匹配
   * 2. 其次通过 message.rawPayload.chat_id 匹配
   * 3. 如果都找不到,返回 null (signals 将为 null,不阻断流程)
   * 
   * @param {Object} session - session 对象
   * @param {Object} message - message 对象
   * @returns {Promise<number|null>} conversation_id 或 null
   */
  async _findConversationId(session, message) {
    try {
      // 策略 1: 从 session metadata 中获取 chat_id
      if (session?.metadata?.chat_id) {
        return session.metadata.chat_id;
      }
      
      // 策略 2: 从 message rawPayload 中获取 chat_id
      if (message?.rawPayload?.chat?.id) {
        return message.rawPayload.chat.id;
      }
      
      // 策略 3: 从 session metadata_json 解析 (MySQL 模式)
      if (session?.metadataJson && typeof session.metadataJson === 'object') {
        if (session.metadataJson.chat_id) {
          return session.metadataJson.chat_id;
        }
      }
      
      // 找不到映射,返回 null
      console.warn('[ReviewServiceV2] Cannot find chat_id to map conversation:', {
        sessionId: session?.sessionId,
        messageId: message?.messageId
      });
      
      return null;
    } catch (err) {
      console.warn('[ReviewServiceV2] Error finding conversation ID:', err.message);
      return null;
    }
  }
}

module.exports = {
  ReviewServiceV2,
  VALID_REVIEW_DECISIONS
};
