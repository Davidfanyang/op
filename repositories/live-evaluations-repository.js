/**
 * Live Evaluations Repository 接口定义
 * 
 * 职责：实时质检评估数据持久化抽象层
 * 实现方式：File / Database / Cache
 */

/**
 * LiveEvaluation 数据结构
 * @typedef {Object} LiveEvaluation
 * @property {string} evaluationId - 评估唯一ID
 * @property {string} sessionId - 所属实时会话 ID
 * @property {string} messageId - 当前触发分析的客服消息 ID
 * @property {string} project - 项目标识
 * @property {string} currentReply - 当前被分析的客服回复
 * @property {Object} inputPayload - 调引擎时的输入对象（标准协议）
 * @property {Object} outputPayload - 引擎返回原始结果
 * @property {string|null} scenario - 场景识别结果
 * @property {string|null} stage - 阶段判断结果
 * @property {string|null} judgement - 结论
 * @property {string|null} summary - 总结
 * @property {number|null} confidence - 置信度
 * @property {string|null} problemType - 问题类型：known / unknown
 * @property {boolean|null} needReview - 是否进入审核流
 * @property {string|null} classifyReason - 分流原因
 * @property {string|null} alertLevel - 告警等级：none / medium / high
 * @property {boolean|null} hasAlert - 是否有告警
 * @property {Date} createdAt - 创建时间
 */

class LiveEvaluationsRepository {
  /**
   * 创建实时质检评估
   * @param {Object} evaluationData - 评估数据
   * @returns {Promise<LiveEvaluation>} 创建的评估
   */
  async create(evaluationData) {
    throw new Error('Method not implemented');
  }

  /**
   * 检查消息是否已被分析（按 message_id）
   * @param {string} messageId - 消息ID
   * @returns {Promise<boolean>} 是否已分析
   */
  async existsByMessageId(messageId) {
    throw new Error('Method not implemented');
  }

  /**
   * 按 sessionId 查询评估列表
   * @param {string} sessionId - 会话ID
   * @param {Object} options - 查询选项
   * @returns {Promise<LiveEvaluation[]>} 评估列表
   */
  async findBySessionId(sessionId, options = {}) {
    throw new Error('Method not implemented');
  }

  /**
   * 按 evaluationId 查询评估
   * @param {string} evaluationId - 评估ID
   * @returns {Promise<LiveEvaluation|null>} 评估对象
   */
  async findById(evaluationId) {
    throw new Error('Method not implemented');
  }

  /**
   * 更新实时质检评估分类结果
   * @param {string} evaluationId - 评估ID
   * @param {Object} classificationData - 分类数据
   * @param {string} classificationData.problemType - 问题类型：known / unknown
   * @param {boolean} classificationData.needReview - 是否进入审核流
   * @param {string} classificationData.classifyReason - 分流原因
   * @returns {Promise<LiveEvaluation>} 更新后的评估
   */
  async updateClassification(evaluationId, classificationData) {
    throw new Error('Method not implemented');
  }

  /**
   * 更新实时质检评估告警信息
   * @param {string} evaluationId - 评估ID
   * @param {Object} alertData - 告警数据
   * @param {string} alertData.alertLevel - 告警等级：none / medium / high
   * @param {boolean} alertData.hasAlert - 是否有告警
   * @returns {Promise<LiveEvaluation>} 更新后的评估
   */
  async updateAlert(evaluationId, alertData) {
    throw new Error('Method not implemented');
  }

  /**
   * 查询评估列表
   * @param {Object} filters - 过滤条件
   * @param {Object} pagination - 分页参数
   * @returns {Promise<{items: LiveEvaluation[], total: number}>}
   */
  async findMany(filters, pagination = { page: 1, limit: 20 }) {
    throw new Error('Method not implemented');
  }
}

module.exports = { LiveEvaluationsRepository };
