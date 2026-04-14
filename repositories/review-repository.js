/**
 * Review Repository 接口定义
 * 
 * 职责：主管复核数据持久化抽象层
 */

/**
 * Review Item 数据结构
 * @typedef {Object} ReviewItem
 * @property {string} reviewId - 复核唯一ID
 * @property {string} evaluationId - 关联评估ID
 * @property {string} messageId - 关联消息ID
 * @property {string} sessionId - 关联会话ID
 * @property {string} projectId - 项目ID
 * @property {string} mode - 模式 (training | live_monitor)
 * @property {string} alertLevel - 告警级别
 * @property {string} reviewStatus - 复核状态 (pending/confirmed/false_positive/dismissed)
 * @property {string} reviewedBy - 复核人ID
 * @property {Date} reviewedAt - 复核时间
 * @property {string} reviewComment - 复核意见
 * @property {string} falsePositiveReason - 误报原因
 * @property {boolean} suggestionAdopted - 建议是否被采纳
 * @property {Date} createdAt - 创建时间
 * @property {Date} updatedAt - 更新时间
 */

class ReviewRepository {
  /**
   * 创建 review item
   * @param {Object} reviewData - 复核数据
   * @returns {Promise<ReviewItem>} 创建的复核项
   */
  async create(reviewData) {
    throw new Error('Method not implemented');
  }

  /**
   * 按 reviewId 查询
   * @param {string} reviewId - 复核ID
   * @returns {Promise<ReviewItem|null>}
   */
  async findById(reviewId) {
    throw new Error('Method not implemented');
  }

  /**
   * 按 evaluationId 查询 review
   * @param {string} evaluationId - 评估ID
   * @returns {Promise<ReviewItem|null>}
   */
  async findByEvaluationId(evaluationId) {
    throw new Error('Method not implemented');
  }

  /**
   * 查询待复核列表
   * @param {string} projectId - 项目ID
   * @param {Object} filters - 过滤条件 { alertLevel, dateRange }
   * @param {Object} pagination - 分页参数
   * @returns {Promise<{items: ReviewItem[], total: number}>}
   */
  async findPending(projectId, filters = {}, pagination = { page: 1, limit: 20 }) {
    throw new Error('Method not implemented');
  }

  /**
   * 查询复核列表（支持多状态过滤）
   * @param {Object} filters - 过滤条件 { projectId, reviewStatus }
   * @param {Object} pagination - 分页参数
   * @returns {Promise<{items: ReviewItem[], total: number}>}
   */
  async findMany(filters, pagination = { page: 1, limit: 20 }) {
    throw new Error('Method not implemented');
  }

  /**
   * 更新复核状态
   * @param {string} reviewId - 复核ID
   * @param {string} status - 新状态
   * @param {Object} updates - 更新数据 { reviewedBy, reviewComment, falsePositiveReason }
   * @returns {Promise<ReviewItem>}
   */
  async updateStatus(reviewId, status, updates = {}) {
    throw new Error('Method not implemented');
  }

  /**
   * 提交复核结果
   * @param {string} reviewId - 复核ID
   * @param {Object} reviewResult - 复核结果
   * @returns {Promise<ReviewItem>}
   */
  async submitReview(reviewId, reviewResult) {
    throw new Error('Method not implemented');
  }

  /**
   * 查询复核统计
   * @param {string} projectId - 项目ID
   * @param {Object} dateRange - 日期范围
   * @returns {Promise<Object>} 统计数据
   */
  async getStats(projectId, dateRange = {}) {
    throw new Error('Method not implemented');
  }

  /**
   * 查询训练模式待复核列表
   * @param {string} projectId - 项目ID
   * @param {Object} filters - 过滤条件
   * @param {Object} pagination - 分页参数
   * @returns {Promise<{items: ReviewItem[], total: number}>}
   */
  async findTrainingPending(projectId, filters = {}, pagination = { page: 1, limit: 20 }) {
    throw new Error('Method not implemented');
  }

  /**
   * 查询训练模式统计
   * @param {string} projectId - 项目ID
   * @param {Object} dateRange - 日期范围
   * @returns {Promise<Object>} 训练统计数据
   */
  async getTrainingStats(projectId, dateRange = {}) {
    throw new Error('Method not implemented');
  }
}

module.exports = { ReviewRepository };
