/**
 * Reviews Repository 接口定义
 * 
 * 职责：审核数据持久化抽象层
 * 实现方式：File / Database / Cache
 * 
 * 审核表结构：
 * - id: 主键
 * - review_id: 审核唯一ID
 * - suggestion_id: 对应 suggestion
 * - evaluation_id: 对应 live_evaluation
 * - session_id: 对应 live_session
 * - review_action: 审核动作 (approve/modify_and_approve/reject)
 * - original_reply: suggestion 原始内容
 * - final_reply: 审核后的最终内容
 * - review_note: 审核备注
 * - reviewer_id: 审核人
 * - created_at: 创建时间
 */

/**
 * Review 数据结构
 * @typedef {Object} Review
 * @property {string} id - 主键
 * @property {string} reviewId - 审核唯一ID
 * @property {string} suggestionId - 对应 suggestion
 * @property {string} evaluationId - 对应 live_evaluation
 * @property {string} sessionId - 对应 live_session
 * @property {string} reviewAction - 审核动作 (approve/modify_and_approve/reject)
 * @property {string} originalReply - suggestion 原始内容
 * @property {string} finalReply - 审核后的最终内容
 * @property {string} reviewNote - 审核备注
 * @property {string} reviewerId - 审核人
 * @property {Date} createdAt - 创建时间
 */

class ReviewsRepository {
  /**
   * 创建审核记录
   * @param {Object} data - 审核数据
   * @returns {Promise<Review>} 创建的 review 对象
   */
  async create(data) {
    throw new Error('Method not implemented');
  }

  /**
   * 根据 suggestion_id 查询审核记录
   * @param {string} suggestionId - suggestion ID
   * @returns {Promise<Review|null>} review 对象或 null
   */
  async findBySuggestionId(suggestionId) {
    throw new Error('Method not implemented');
  }

  /**
   * 根据 evaluation_id 查询审核记录
   * @param {string} evaluationId - evaluation ID
   * @returns {Promise<Review|null>} review 对象或 null
   */
  async findByEvaluationId(evaluationId) {
    throw new Error('Method not implemented');
  }

  /**
   * 根据 session_id 查询审核记录列表
   * @param {string} sessionId - session ID
   * @returns {Promise<Review[]>} review 列表
   */
  async findBySessionId(sessionId) {
    throw new Error('Method not implemented');
  }

  /**
   * 根据审核人查询审核记录列表
   * @param {string} reviewerId - 审核人 ID
   * @returns {Promise<Review[]>} review 列表
   */
  async findByReviewerId(reviewerId) {
    throw new Error('Method not implemented');
  }

  /**
   * 查询审核记录列表（支持过滤）
   * @param {Object} filters - 过滤条件
   * @returns {Promise<Review[]>} review 列表
   */
  async list(filters = {}) {
    throw new Error('Method not implemented');
  }
}

// 导出接口类
module.exports = {
  ReviewsRepository
};
