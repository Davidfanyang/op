/**
 * Suggestions Repository 接口定义
 * 
 * 职责：建议答案数据持久化抽象层
 * 实现方式：File / Database / Cache
 * 
 * 建议答案表结构：
 * - id: 主键
 * - project_id: 项目 ID
 * - session_id: 会话 ID
 * - message_id: 触发消息 ID
 * - evaluation_id: 关联 evaluation 主键（唯一约束）
 * - entry_source: 触发来源
 * - agent_id: 客服或操作人 ID
 * - scenario: 场景名
 * - suggested_reply: 建议答案正文
 * - source_type: 来源类型（固定 unknown_auto_generated）
 * - status: 记录状态（固定 active）
 * - review_status: 审核状态（固定 pending_review）
 * - created_at: 创建时间
 * - updated_at: 更新时间
 */

/**
 * Suggestion 数据结构
 * @typedef {Object} Suggestion
 * @property {string} id - 主键
 * @property {string} projectId - 项目 ID
 * @property {string} sessionId - 会话 ID
 * @property {string} messageId - 触发消息 ID
 * @property {string} evaluationId - 关联 evaluation 主键（唯一）
 * @property {string} entrySource - 触发来源
 * @property {string} agentId - 客服或操作人 ID
 * @property {string} scenario - 场景名
 * @property {string} suggestedReply - 建议答案正文
 * @property {string} sourceType - 来源类型（固定 unknown_auto_generated）
 * @property {string} status - 记录状态（固定 active）
 * @property {string} reviewStatus - 审核状态（固定 pending_review）
 * @property {Date} createdAt - 创建时间
 * @property {Date} updatedAt - 更新时间
 */

class SuggestionsRepository {
  /**
   * 创建建议答案
   * @param {Object} data - 建议答案数据
   * @returns {Promise<Suggestion>} 创建的 suggestion 对象
   */
  async create(data) {
    throw new Error('Method not implemented');
  }

  /**
   * 根据 ID 查询建议答案
   * @param {string} id - suggestion ID
   * @returns {Promise<Suggestion|null>} suggestion 对象或 null
   */
  async findById(id) {
    throw new Error('Method not implemented');
  }

  /**
   * 根据 evaluation_id 查询建议答案
   * @param {string} evaluationId - 评估 ID
   * @returns {Promise<Suggestion|null>} suggestion 对象或 null
   */
  async findByEvaluationId(evaluationId) {
    throw new Error('Method not implemented');
  }

  /**
   * 检查指定 evaluation_id 是否已存在建议答案
   * @param {string} evaluationId - 评估 ID
   * @returns {Promise<boolean>} 是否存在
   */
  async existsByEvaluationId(evaluationId) {
    throw new Error('Method not implemented');
  }

  /**
   * 查询所有待审核的建议答案
   * @returns {Promise<Suggestion[]>} suggestion 列表
   */
  async findPendingSuggestions() {
    throw new Error('Method not implemented');
  }

  /**
   * 根据 session_id 查询建议答案列表
   * @param {string} sessionId - 会话 ID
   * @returns {Promise<Suggestion[]>} suggestion 列表
   */
  async findBySessionId(sessionId) {
    throw new Error('Method not implemented');
  }

  /**
   * 根据 project_id 查询建议答案列表
   * @param {string} projectId - 项目 ID
   * @returns {Promise<Suggestion[]>} suggestion 列表
   */
  async findByProjectId(projectId) {
    throw new Error('Method not implemented');
  }

  /**
   * 更新建议答案审核状态
   * @param {string} id - suggestion ID
   * @param {string} reviewStatus - 审核状态 (approved/modified_approved/rejected)
   * @returns {Promise<Suggestion>} 更新后的 suggestion 对象
   */
  async updateReviewStatus(id, reviewStatus) {
    throw new Error('Method not implemented');
  }
}

// 导出接口类
module.exports = {
  SuggestionsRepository
};
