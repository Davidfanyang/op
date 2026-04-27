/**
 * Training Round Result Repository 接口定义
 * 
 * 职责：训练轮次结果数据持久化抽象层
 */

/**
 * TrainingRoundResult 数据结构
 * @typedef {Object} TrainingRoundResult
 * @property {string} id - 结果ID（数据库自增）
 * @property {string} sessionId - 所属训练会话ID
 * @property {number} round - 轮次（从0开始）
 * @property {string} scenarioId - 场景ID
 * @property {string} scenarioTitle - 场景标题
 * @property {Object} analysisRaw - 分析引擎原始输出JSON
 * @property {string} feedbackText - 客服可读的反馈文本
 * @property {Object} structuredFeedback - 结构化反馈JSON
 * @property {boolean} isFinished - 该轮是否为最后一轮
 * @property {Date} createdAt - 创建时间
 */

class TrainingRoundResultRepository {
  /**
   * 保存训练轮次结果
   * @param {Object} resultData - 结果数据
   * @returns {Promise<TrainingRoundResult>} 保存的结果
   */
  async save(resultData) {
    throw new Error('Method not implemented');
  }

  /**
   * 按 sessionId 拉取轮次结果列表
   * @param {string} sessionId - 会话ID
   * @param {Object} options - 查询选项 { limit, offset, order }
   * @returns {Promise<TrainingRoundResult[]>}
   */
  async findBySessionId(sessionId, options = {}) {
    throw new Error('Method not implemented');
  }

  /**
   * 按 sessionId 和 round 查询轮次结果
   * @param {string} sessionId - 会话ID
   * @param {number} round - 轮次
   * @returns {Promise<TrainingRoundResult|null>}
   */
  async findBySessionAndRound(sessionId, round) {
    throw new Error('Method not implemented');
  }

  /**
   * 查询轮次结果列表（支持过滤）
   * @param {Object} filters - 过滤条件
   * @param {Object} pagination - 分页参数
   * @returns {Promise<{items: TrainingRoundResult[], total: number}>}
   */
  async findMany(filters, pagination = { page: 1, limit: 50 }) {
    throw new Error('Method not implemented');
  }

  /**
   * 统计会话的轮次结果数量
   * @param {string} sessionId - 会话ID
   * @returns {Promise<number>}
   */
  async countBySessionId(sessionId) {
    throw new Error('Method not implemented');
  }

  /**
   * 查询最后一轮结果
   * @param {string} sessionId - 会话ID
   * @returns {Promise<TrainingRoundResult|null>}
   */
  async findLastResult(sessionId) {
    throw new Error('Method not implemented');
  }
}

module.exports = { TrainingRoundResultRepository };
