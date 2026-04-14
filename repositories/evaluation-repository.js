/**
 * Evaluation Repository 接口定义
 * 
 * 职责：评估结果持久化抽象层
 */

/**
 * Evaluation 数据结构
 * @typedef {Object} Evaluation
 * @property {string} evaluationId - 评估唯一ID
 * @property {string} messageId - 关联消息ID
 * @property {string} sessionId - 关联会话ID
 * @property {string} projectId - 项目ID
 * @property {string} mode - 模式 (training/live_monitor)
 * @property {string} scenarioId - 场景ID
 * @property {string} status - 状态 (ok/alert_triggered/error)
 * @property {string} alertLevel - 告警级别 (none/observation/warning/critical)
 * @property {number} score - 总分
 * @property {Object} dimensionScores - 维度得分
 * @property {Array} findings - 发现问题
 * @property {Array} suggestions - 建议
 * @property {Array} alerts - 告警列表
 * @property {Date} createdAt - 创建时间
 * @property {Object} rawResult - 原始评估结果
 */

class EvaluationRepository {
  /**
   * 保存评估结果
   * @param {Object} evaluationData - 评估数据
   * @returns {Promise<Evaluation>} 保存的评估
   */
  async save(evaluationData) {
    throw new Error('Method not implemented');
  }

  /**
   * 按 evaluationId 查询
   * @param {string} evaluationId - 评估ID
   * @returns {Promise<Evaluation|null>}
   */
  async findById(evaluationId) {
    throw new Error('Method not implemented');
  }

  /**
   * 按 messageId 查询评估
   * @param {string} messageId - 消息ID
   * @returns {Promise<Evaluation|null>}
   */
  async findByMessageId(messageId) {
    throw new Error('Method not implemented');
  }

  /**
   * 按 sessionId 查询评估列表
   * @param {string} sessionId - 会话ID
   * @returns {Promise<Evaluation[]>}
   */
  async findBySessionId(sessionId) {
    throw new Error('Method not implemented');
  }

  /**
   * 查询最近评估
   * @param {string} projectId - 项目ID
   * @param {string} mode - 模式过滤
   * @param {Object} options - 查询选项 { limit, alertLevel }
   * @returns {Promise<Evaluation[]>}
   */
  async findRecent(projectId, mode = null, options = { limit: 20 }) {
    throw new Error('Method not implemented');
  }

  /**
   * 更新评估状态
   * @param {string} evaluationId - 评估ID
   * @param {string} status - 新状态
   * @param {Object} updates - 其他更新
   * @returns {Promise<Evaluation>}
   */
  async updateStatus(evaluationId, status, updates = {}) {
    throw new Error('Method not implemented');
  }

  /**
   * 查询告警评估
   * @param {string} projectId - 项目ID
   * @param {string} alertLevel - 告警级别过滤
   * @param {Object} pagination - 分页参数
   * @returns {Promise<{items: Evaluation[], total: number}>}
   */
  async findAlerts(projectId, alertLevel = null, pagination = { page: 1, limit: 20 }) {
    throw new Error('Method not implemented');
  }
}

module.exports = { EvaluationRepository };
