/**
 * File-based Review Repository 实现
 * 
 * 基于文件系统的复核数据持久化
 */

const fs = require('fs').promises;
const path = require('path');
const { ReviewRepository } = require('../../../repositories/review-repository');

class FileReviewRepository extends ReviewRepository {
  constructor(basePath = './runtime/persistence/reviews') {
    super();
    this.basePath = path.resolve(basePath);
    this.reviewsFile = path.join(this.basePath, 'reviews.json');
    this.indexFile = path.join(this.basePath, 'review-index.json');
    this._initialized = false;
  }

  async _ensureInitialized() {
    if (this._initialized) return;
    
    try {
      await fs.mkdir(this.basePath, { recursive: true });
      try {
        await fs.access(this.reviewsFile);
      } catch {
        await fs.writeFile(this.reviewsFile, JSON.stringify([], null, 2));
      }
      try {
        await fs.access(this.indexFile);
      } catch {
        await fs.writeFile(this.indexFile, JSON.stringify({
          byEvaluation: {},
          byProject: {},
          pending: {},
          byReviewer: {}
        }, null, 2));
      }
    } catch (err) {
      console.error('Failed to initialize review storage:', err);
      throw err;
    }
    this._initialized = true;
  }

  async _readReviews() {
    try {
      const data = await fs.readFile(this.reviewsFile, 'utf8');
      return JSON.parse(data);
    } catch {
      return [];
    }
  }

  async _writeReviews(reviews) {
    await fs.writeFile(this.reviewsFile, JSON.stringify(reviews, null, 2));
  }

  async _readIndex() {
    try {
      const data = await fs.readFile(this.indexFile, 'utf8');
      return JSON.parse(data);
    } catch {
      return { byEvaluation: {}, byProject: {}, pending: {}, byReviewer: {} };
    }
  }

  async _writeIndex(index) {
    await fs.writeFile(this.indexFile, JSON.stringify(index, null, 2));
  }

  _generateId() {
    return `review_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  async create(reviewData) {
    await this._ensureInitialized();
    const reviewId = reviewData.reviewId || this._generateId();
    const now = new Date().toISOString();
    
    const review = {
      reviewId,
      evaluationId: reviewData.evaluationId,
      messageId: reviewData.messageId,
      sessionId: reviewData.sessionId,
      projectId: reviewData.projectId,
      alertLevel: reviewData.alertLevel || 'warning',
      reviewStatus: reviewData.reviewStatus || 'pending',
      reviewedBy: reviewData.reviewedBy || null,
      reviewedAt: reviewData.reviewedAt || null,
      reviewComment: reviewData.reviewComment || '',
      falsePositiveReason: reviewData.falsePositiveReason || null,
      suggestionAdopted: reviewData.suggestionAdopted || false,
      createdAt: now,
      updatedAt: now
    };

    const reviews = await this._readReviews();
    reviews.push(review);
    await this._writeReviews(reviews);

    // 更新索引
    const index = await this._readIndex();
    
    index.byEvaluation[review.evaluationId] = reviewId;
    
    if (!index.byProject[review.projectId]) {
      index.byProject[review.projectId] = [];
    }
    index.byProject[review.projectId].push(reviewId);
    
    // 待复核索引
    if (review.reviewStatus === 'pending') {
      if (!index.pending[review.projectId]) {
        index.pending[review.projectId] = [];
      }
      index.pending[review.projectId].push(reviewId);
    }
    
    await this._writeIndex(index);

    return review;
  }

  async findById(reviewId) {
    await this._ensureInitialized();
    const reviews = await this._readReviews();
    return reviews.find(r => r.reviewId === reviewId) || null;
  }

  async findByEvaluationId(evaluationId) {
    await this._ensureInitialized();
    const index = await this._readIndex();
    const reviewId = index.byEvaluation[evaluationId];
    if (!reviewId) return null;
    return this.findById(reviewId);
  }

  async findPending(projectId, filters = {}, pagination = { page: 1, limit: 20 }) {
    await this._ensureInitialized();
    const index = await this._readIndex();
    const pendingIds = index.pending[projectId] || [];
    
    let reviews = await this._readReviews();
    reviews = reviews.filter(r => pendingIds.includes(r.reviewId));
    
    // 应用过滤
    if (filters.alertLevel) {
      reviews = reviews.filter(r => r.alertLevel === filters.alertLevel);
    }
    if (filters.dateRange) {
      const { start, end } = filters.dateRange;
      reviews = reviews.filter(r => {
        const created = new Date(r.createdAt);
        return created >= new Date(start) && created <= new Date(end);
      });
    }
    
    // 排序（按创建时间倒序，新的优先复核）
    reviews.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    const total = reviews.length;
    const start = (pagination.page - 1) * pagination.limit;
    const items = reviews.slice(start, start + pagination.limit);
    
    return { items, total };
  }

  /**
   * 查询复核列表（支持多状态过滤）
   */
  async findMany(filters, pagination = { page: 1, limit: 20 }) {
    await this._ensureInitialized();
    let reviews = await this._readReviews();
    
    if (filters.projectId) {
      reviews = reviews.filter(r => r.projectId === filters.projectId);
    }
    
    if (filters.reviewStatus) {
      if (Array.isArray(filters.reviewStatus)) {
        reviews = reviews.filter(r => filters.reviewStatus.includes(r.reviewStatus));
      } else {
        reviews = reviews.filter(r => r.reviewStatus === filters.reviewStatus);
      }
    }
    
    if (filters.alertLevel) {
      reviews = reviews.filter(r => r.alertLevel === filters.alertLevel);
    }
    
    // 排序
    reviews.sort((a, b) => {
      const aTime = a.reviewedAt ? new Date(a.reviewedAt) : new Date(a.createdAt);
      const bTime = b.reviewedAt ? new Date(b.reviewedAt) : new Date(b.createdAt);
      return bTime - aTime;
    });
    
    const total = reviews.length;
    const start = (pagination.page - 1) * pagination.limit;
    const items = reviews.slice(start, start + pagination.limit);
    
    return { items, total };
  }

  async updateStatus(reviewId, status, updates = {}) {
    await this._ensureInitialized();
    const reviews = await this._readReviews();
    const index = reviews.findIndex(r => r.reviewId === reviewId);
    
    if (index === -1) {
      throw new Error(`Review not found: ${reviewId}`);
    }

    const oldStatus = reviews[index].reviewStatus;
    
    reviews[index] = {
      ...reviews[index],
      reviewStatus: status,
      updatedAt: new Date().toISOString(),
      ...updates
    };

    await this._writeReviews(reviews);

    // 更新索引
    const idx = await this._readIndex();
    const projectId = reviews[index].projectId;
    
    // 从 pending 索引中移除（如果状态不再是 pending）
    if (oldStatus === 'pending' && status !== 'pending') {
      if (idx.pending[projectId]) {
        idx.pending[projectId] = idx.pending[projectId].filter(id => id !== reviewId);
      }
    }
    
    // 添加到 reviewer 索引
    if (updates.reviewedBy) {
      if (!idx.byReviewer[updates.reviewedBy]) {
        idx.byReviewer[updates.reviewedBy] = [];
      }
      idx.byReviewer[updates.reviewedBy].push(reviewId);
    }
    
    await this._writeIndex(idx);

    return reviews[index];
  }

  async submitReview(reviewId, reviewResult) {
    await this._ensureInitialized();
    const updates = {
      reviewedBy: reviewResult.reviewedBy,
      reviewedAt: new Date().toISOString(),
      reviewComment: reviewResult.reviewComment,
      falsePositiveReason: reviewResult.falsePositiveReason || null,
      suggestionAdopted: reviewResult.suggestionAdopted || false
    };
    
    return this.updateStatus(reviewId, reviewResult.status || 'confirmed', updates);
  }

  async getStats(projectId, dateRange = {}) {
    await this._ensureInitialized();
    const reviews = await this._readReviews();
    let projectReviews = reviews.filter(r => r.projectId === projectId);
    
    // 日期过滤
    if (dateRange.start && dateRange.end) {
      const start = new Date(dateRange.start);
      const end = new Date(dateRange.end);
      projectReviews = projectReviews.filter(r => {
        const created = new Date(r.createdAt);
        return created >= start && created <= end;
      });
    }
    
    const stats = {
      total: projectReviews.length,
      pending: projectReviews.filter(r => r.reviewStatus === 'pending').length,
      reviewed: projectReviews.filter(r => r.reviewStatus === 'reviewed').length,
      closed: projectReviews.filter(r => r.reviewStatus === 'closed').length,
      confirmed: projectReviews.filter(r => r.reviewStatus === 'confirmed').length,
      falsePositive: projectReviews.filter(r => r.reviewStatus === 'false_positive').length,
      dismissed: projectReviews.filter(r => r.reviewStatus === 'dismissed').length,
      byDecision: {
        approved: projectReviews.filter(r => r.reviewDecision === 'approved').length,
        rejected: projectReviews.filter(r => r.reviewDecision === 'rejected').length,
        needs_edit: projectReviews.filter(r => r.reviewDecision === 'needs_edit').length
      },
      byAlertLevel: {
        critical: projectReviews.filter(r => r.alertLevel === 'critical').length,
        warning: projectReviews.filter(r => r.alertLevel === 'warning').length,
        observation: projectReviews.filter(r => r.alertLevel === 'observation').length
      }
    };
    
    return stats;
  }
}

module.exports = { FileReviewRepository };
