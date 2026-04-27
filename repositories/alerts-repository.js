/**
 * Alerts Repository 接口定义
 * 
 * 职责：告警数据持久化抽象层
 * 实现方式：File / Database / Cache
 * 
 * 告警表结构：
 * - id: 告警主键
 * - evaluation_id: 对应 live_evaluation 主键
 * - session_id: 对应 live session
 * - message_id: 对应触发分析的客服消息
 * - alert_level: medium / high
 * - alert_type: risk / unknown / quality / compliance
 * - alert_reason: 触发原因
 * - status: 固定 open
 * - created_at: 创建时间
 */

/**
 * Alert 数据结构
 * @typedef {Object} Alert
 * @property {string} id - 告警主键
 * @property {string} evaluationId - 对应 live_evaluation 主键
 * @property {string} sessionId - 对应 live session
 * @property {string} messageId - 对应触发分析的客服消息
 * @property {string} alertLevel - 告警等级：medium / high
 * @property {string} alertType - 告警类型：risk / unknown / quality / compliance
 * @property {string} alertReason - 触发原因
 * @property {string} status - 状态：固定 open
 * @property {Date} createdAt - 创建时间
 */

class AlertsRepository {
  /**
   * 创建告警记录
   * @param {Object} alertData - 告警数据
   * @returns {Promise<Alert>} 创建的告警
   */
  async create(alertData) {
    throw new Error('Method not implemented');
  }

  /**
   * 检查指定 evaluation 是否已存在告警
   * @param {string} evaluationId - 评估ID
   * @returns {Promise<boolean>} 是否已存在告警
   */
  async existsByEvaluationId(evaluationId) {
    throw new Error('Method not implemented');
  }

  /**
   * 按 sessionId 查询告警列表
   * @param {string} sessionId - 会话ID
   * @returns {Promise<Alert[]>} 告警列表
   */
  async findBySessionId(sessionId) {
    throw new Error('Method not implemented');
  }

  /**
   * 按 alertLevel 查询告警列表
   * @param {string} alertLevel - 告警等级
   * @param {Object} options - 查询选项
   * @returns {Promise<Alert[]>} 告警列表
   */
  async findByAlertLevel(alertLevel, options = {}) {
    throw new Error('Method not implemented');
  }

  /**
   * 查询告警列表
   * @param {Object} filters - 过滤条件
   * @param {Object} pagination - 分页参数
   * @returns {Promise<{items: Alert[], total: number}>}
   */
  async findMany(filters = {}, pagination = { page: 1, limit: 20 }) {
    throw new Error('Method not implemented');
  }
}

module.exports = { AlertsRepository };
