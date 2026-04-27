/**
 * Reviews Repository - 内存实现
 * 
 * 用于保存每条 suggestion 的审核结果
 */

const { ReviewsRepository } = require('../reviews-repository');
const { v4: uuidv4 } = require('uuid');

class FileReviewsRepository extends ReviewsRepository {
  constructor() {
    super();
    this.reviews = new Map();
    this.suggestionIndex = new Map(); // suggestion_id -> review_id 索引
    this.evaluationIndex = new Map(); // evaluation_id -> review_id 索引
  }

  async create(data) {
    const review = {
      id: data.id || `review_${uuidv4()}`,
      reviewId: data.reviewId || `review_${uuidv4()}`,
      suggestionId: data.suggestionId,
      evaluationId: data.evaluationId,
      sessionId: data.sessionId,
      reviewAction: data.reviewAction,
      originalReply: data.originalReply,
      finalReply: data.finalReply || null,
      reviewNote: data.reviewNote || null,
      reviewerId: data.reviewerId,
      createdAt: new Date()
    };

    this.reviews.set(review.id, review);
    this.suggestionIndex.set(review.suggestionId, review.id);
    this.evaluationIndex.set(review.evaluationId, review.id);

    console.log('[ReviewsRepo] 创建 review:', review.id, 'suggestion:', review.suggestionId);
    
    return review;
  }

  async findBySuggestionId(suggestionId) {
    const reviewId = this.suggestionIndex.get(suggestionId);
    if (!reviewId) {
      return null;
    }
    return this.reviews.get(reviewId) || null;
  }

  async findByEvaluationId(evaluationId) {
    const reviewId = this.evaluationIndex.get(evaluationId);
    if (!reviewId) {
      return null;
    }
    return this.reviews.get(reviewId) || null;
  }

  async findBySessionId(sessionId) {
    return Array.from(this.reviews.values())
      .filter(r => r.sessionId === sessionId);
  }

  async findByReviewerId(reviewerId) {
    return Array.from(this.reviews.values())
      .filter(r => r.reviewerId === reviewerId);
  }

  async list(filters = {}) {
    let reviews = Array.from(this.reviews.values());

    // 支持按 review_action 过滤
    if (filters.reviewAction) {
      reviews = reviews.filter(r => r.reviewAction === filters.reviewAction);
    }

    // 支持按 reviewer_id 过滤
    if (filters.reviewerId) {
      reviews = reviews.filter(r => r.reviewerId === filters.reviewerId);
    }

    // 支持按 session_id 过滤
    if (filters.sessionId) {
      reviews = reviews.filter(r => r.sessionId === filters.sessionId);
    }

    return reviews;
  }

  /**
   * 获取所有审核记录（调试用）
   */
  async getAll() {
    return Array.from(this.reviews.values());
  }

  /**
   * 清空所有数据（测试用）
   */
  clear() {
    this.reviews.clear();
    this.suggestionIndex.clear();
    this.evaluationIndex.clear();
  }
}

// 导出类和单例
const defaultRepo = new FileReviewsRepository();

module.exports = {
  FileReviewsRepository,
  defaultRepo
};
