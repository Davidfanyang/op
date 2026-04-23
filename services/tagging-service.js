/**
 * 主管打标服务（最小闭环）
 * 
 * 职责：
 * 1. 打标数据验证
 * 2. 打标结果入库（reviews表）
 * 3. FAQ沉淀条件判断
 * 
 * 不碰评分系统、不碰历史正文、不碰FAQ生成逻辑
 */

// Repository 选择（根据环境变量）
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

const reviewsRepo = getReviewsRepo();
const evaluationsRepo = getLiveEvaluationsRepo();

// 问题类型枚举（主管打标最小闭环）
const PROBLEM_TYPES = [
  'known',
  'unknown'
];

class TaggingService {
  /**
   * 提交打标结果
   * 
   * @param {Object} data - 打标数据
   * @param {string} data.evaluation_id - 评估ID（必填）
   * @param {string} [data.suggestion_id] - 建议ID（可选）
   * @param {string} data.reviewer_id - 审核人ID（必填）
   * @param {boolean} data.is_correct - 客服回复是否正确（必填）
   * @param {string} data.problem_type - 问题类型（必填）
   * @param {boolean} data.should_store - 是否应沉淀到FAQ（必填）
   * @param {string} [data.corrected_answer] - 修正后的标准答案（可选）
   * @param {string} [data.review_comment] - 主管备注（可选）
   * @returns {Promise<Object>} 打标结果
   */
  async submitTag(data) {
    console.log('[TaggingService] 提交打标结果:', data);

    // 1. 验证必填字段
    this._validateRequired(data);

    // 2. 验证枚举值
    this._validateProblemType(data.problem_type);

    // 3. 验证逻辑约束
    this._validateLogic(data);

    // 4. 查询evaluation获取必要信息
    const evaluation = await evaluationsRepo.findById(data.evaluation_id);
    if (!evaluation) {
      throw new Error(`evaluation_id=${data.evaluation_id} 不存在`);
    }

    // 5. 检查是否已打标，避免重复插入
    const existingReview = await reviewsRepo.findByEvaluationId(data.evaluation_id);
    if (existingReview) {
      throw new Error(`evaluation_id=${data.evaluation_id} 已完成打标`);
    }

    // 6. 判断FAQ沉淀条件
    const faqEligible = this.isFaqEligible(
      data.is_correct,
      data.should_store
    );

    // 7. 构建reviews记录
    const reviewData = {
      reviewId: `tag_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      projectId: evaluation.project || evaluation.projectId || 'default',
      mode: 'live_monitor',
      sessionId: evaluation.sessionId,
      messageId: evaluation.messageId,
      evaluationId: data.evaluation_id,
      suggestionId: data.suggestion_id || null,
      
      // 打标核心字段
      reviewAction: 'tag',
      finalAccepted: data.is_correct ? 1 : 0,
      problemTags: JSON.stringify([data.problem_type]),
      finalReply: data.corrected_answer || null,
      reviewNote: data.review_comment || null,
      
      // FAQ沉淀标记
      knowledgeId: faqEligible ? 'pending_faq' : null,  // should_store=true且符合条件
      
      // 审核人信息
      reviewerId: data.reviewer_id,
      reviewedAt: new Date(),
      
      // 状态
      reviewStatus: 'tagged'
    };

    // 8. 入库
    const review = await reviewsRepo.create(reviewData);

    console.log('[TaggingService] 打标成功:', {
      review_id: review.reviewId,
      faq_eligible: faqEligible,
      knowledge_id: review.knowledgeId
    });

    // 9. 返回结果
    return {
      evaluation_id: data.evaluation_id,
      is_correct: data.is_correct,
      problem_type: data.problem_type,
      should_store: data.should_store,
      corrected_answer: data.corrected_answer || null,
      review_comment: data.review_comment || null,
      review_id: review.reviewId,
      status: 'tagged',
      faq_eligible: faqEligible,
      knowledge_id: review.knowledgeId,
      message: faqEligible 
        ? '打标成功，数据已具备FAQ沉淀条件' 
        : '打标成功，数据不满足FAQ沉淀条件'
    };
  }

  /**
   * 查询打标记录
   * 
   * @param {Object} filters - 筛选条件
   * @param {string} [filters.project_id] - 项目ID
   * @param {string} [filters.reviewer_id] - 审核人ID
   * @param {boolean} [filters.faq_eligible] - 是否只查可沉淀FAQ的数据
   * @param {Object} pagination - 分页参数
   * @param {number} pagination.page - 页码
   * @param {number} pagination.page_size - 每页条数
   * @returns {Promise<Object>} 打标记录列表
   */
  async getTaggedRecords(filters = {}, pagination = {}) {
    console.log('[TaggingService] 查询打标记录:', { filters, pagination });

    // 1. 查询所有tagged状态的记录
    let allReviews = await reviewsRepo.list({
      reviewAction: 'tag'
    });

    // 2. 应用筛选条件
    let filteredReviews = allReviews;

    if (filters.project_id) {
      filteredReviews = filteredReviews.filter(r => r.projectId === filters.project_id);
    }

    if (filters.reviewer_id) {
      filteredReviews = filteredReviews.filter(r => r.reviewerId === filters.reviewer_id);
    }

    if (filters.faq_eligible === true) {
      filteredReviews = filteredReviews.filter(r => r.knowledgeId === 'pending_faq');
    } else if (filters.faq_eligible === false) {
      filteredReviews = filteredReviews.filter(r => r.knowledgeId !== 'pending_faq');
    }

    // 3. 分页
    const page = Math.max(1, parseInt(pagination.page) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(pagination.page_size) || 20));
    const total = filteredReviews.length;
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const paginatedReviews = filteredReviews.slice(startIndex, endIndex);

    // 4. 构建返回数据
    const list = paginatedReviews.map(review => ({
      review_id: review.reviewId,
      evaluation_id: review.evaluationId,
      suggestion_id: review.suggestionId,
      session_id: review.sessionId,
      is_correct: review.finalAccepted === 1,
      problem_type: review.problemTags ? JSON.parse(review.problemTags)[0] : null,
      should_store: review.knowledgeId === 'pending_faq',
      faq_eligible: review.knowledgeId === 'pending_faq',
      corrected_answer: review.finalReply,
      review_comment: review.reviewNote,
      reviewer_id: review.reviewerId,
      tagged_at: review.reviewedAt ? new Date(review.reviewedAt).toISOString() : null
    }));

    return {
      list,
      total,
      page,
      page_size: pageSize
    };
  }

  /**
   * 判断是否可沉淀FAQ
   * 
   * @param {boolean} isCorrect - 客服回复是否正确
   * @param {boolean} shouldStore - 是否应沉淀
   * @param {string} problemType - 问题类型
   * @returns {boolean} 是否可沉淀
   */
  isFaqEligible(isCorrect, shouldStore) {
    return isCorrect === true && shouldStore === true;
  }

  /**
   * 验证必填字段
   */
  _validateRequired(data) {
    const missing = [];

    if (!data.evaluation_id) missing.push('evaluation_id');
    if (!data.reviewer_id) missing.push('reviewer_id');
    if (data.is_correct === undefined || data.is_correct === null) missing.push('is_correct');
    if (!data.problem_type) missing.push('problem_type');
    if (data.should_store === undefined || data.should_store === null) missing.push('should_store');

    if (missing.length > 0) {
      throw new Error(`缺少必填字段: ${missing.join(', ')}`);
    }

    // 验证类型
    if (typeof data.is_correct !== 'boolean') {
      throw new Error('is_correct 必须是布尔值');
    }

    if (typeof data.should_store !== 'boolean') {
      throw new Error('should_store 必须是布尔值');
    }
  }

  /**
   * 验证问题类型枚举
   */
  _validateProblemType(problemType) {
    if (!PROBLEM_TYPES.includes(problemType)) {
      throw new Error(
        `problem_type 必须是以下值之一: ${PROBLEM_TYPES.join(', ')}`
      );
    }
  }

  /**
   * 验证逻辑约束
   */
  _validateLogic(data) {
    // is_correct=false 时，should_store 必须为false
    if (data.is_correct === false && data.should_store === true) {
      throw new Error('is_correct=false 时，should_store 必须为 false');
    }
  }
}

// 导出
module.exports = {
  TaggingService,
  PROBLEM_TYPES
};
