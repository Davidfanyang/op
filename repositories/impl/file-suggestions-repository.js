/**
 * Suggestions Repository - 内存实现
 * 
 * 唯一约束：evaluation_id 唯一（同一 evaluation 只能生成一条 suggestion）
 */

const { SuggestionsRepository } = require('../suggestions-repository');
const { v4: uuidv4 } = require('uuid');

class FileSuggestionsRepository extends SuggestionsRepository {
  constructor() {
    super();
    this.suggestions = new Map();
    this.evaluationIndex = new Map(); // evaluation_id -> suggestion_id 索引（唯一约束）
  }

  async create(data) {
    // 唯一约束检查（service 层防重）
    if (this.evaluationIndex.has(data.evaluationId)) {
      throw new Error(`Unique constraint violation: evaluation_id ${data.evaluationId} already exists`);
    }

    const suggestion = {
      id: data.id || `suggestion_${uuidv4()}`,
      projectId: data.projectId,
      sessionId: data.sessionId,
      messageId: data.messageId,
      evaluationId: data.evaluationId,
      entrySource: data.entrySource || 'live_monitor',
      agentId: data.agentId || 'unknown',
      scenario: data.scenario || '',
      suggestedReply: data.suggestedReply,
      sourceType: 'unknown_auto_generated', // 固定值
      status: 'active', // 固定值
      reviewStatus: 'pending_review', // 固定值
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.suggestions.set(suggestion.id, suggestion);
    this.evaluationIndex.set(suggestion.evaluationId, suggestion.id); // 建立唯一索引

    console.log('[SuggestionsRepo] 创建 suggestion:', suggestion.id, 'evaluation:', suggestion.evaluationId);
    
    return suggestion;
  }

  async findByEvaluationId(evaluationId) {
    const suggestionId = this.evaluationIndex.get(evaluationId);
    if (!suggestionId) {
      return null;
    }
    return this.suggestions.get(suggestionId) || null;
  }

  async findById(id) {
    return this.suggestions.get(id) || null;
  }

  async existsByEvaluationId(evaluationId) {
    return this.evaluationIndex.has(evaluationId);
  }

  async findPendingSuggestions() {
    return Array.from(this.suggestions.values())
      .filter(s => s.reviewStatus === 'pending_review');
  }

  async findBySessionId(sessionId) {
    return Array.from(this.suggestions.values())
      .filter(s => s.sessionId === sessionId);
  }

  async findByProjectId(projectId) {
    return Array.from(this.suggestions.values())
      .filter(s => s.projectId === projectId);
  }

  async updateReviewStatus(id, reviewStatus) {
    const suggestion = this.suggestions.get(id);
    if (!suggestion) {
      throw new Error(`Suggestion not found: ${id}`);
    }

    suggestion.reviewStatus = reviewStatus;
    suggestion.updatedAt = new Date();
    console.log('[SuggestionsRepo] 更新 suggestion 审核状态:', id, reviewStatus);
    
    return suggestion;
  }

  /**
   * 获取所有建议（调试用）
   */
  async getAll() {
    return Array.from(this.suggestions.values());
  }

  /**
   * 清空所有数据（测试用）
   */
  clear() {
    this.suggestions.clear();
    this.evaluationIndex.clear();
  }
}

// 导出类和单例
const defaultRepo = new FileSuggestionsRepository();

module.exports = {
  FileSuggestionsRepository,
  defaultRepo
};
