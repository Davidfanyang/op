/**
 * Live Evaluations Repository - 内存实现
 */

const { LiveEvaluationsRepository } = require('../live-evaluations-repository');
const { v4: uuidv4 } = require('uuid');

class FileLiveEvaluationsRepository extends LiveEvaluationsRepository {
  constructor() {
    super();
    this.evaluations = new Map();
  }

  async create(evaluationData) {
    const evaluation = {
      evaluationId: evaluationData.evaluationId || `live_eval_${uuidv4()}`,
      sessionId: evaluationData.sessionId,
      messageId: evaluationData.messageId,
      project: evaluationData.project || 'default',
      currentReply: evaluationData.currentReply,
      inputPayload: evaluationData.inputPayload,
      outputPayload: evaluationData.outputPayload,
      scenario: evaluationData.scenario || null,
      stage: evaluationData.stage || null,
      judgement: evaluationData.judgement || null,
      summary: evaluationData.summary || null,
      confidence: evaluationData.confidence || null,
      problemType: evaluationData.problemType || null,
      needReview: evaluationData.needReview || null,
      classifyReason: evaluationData.classifyReason || null,
      alertLevel: evaluationData.alertLevel || 'none',
      hasAlert: evaluationData.hasAlert || false,
      createdAt: new Date()
    };

    this.evaluations.set(evaluation.evaluationId, evaluation);
    console.log('[LiveEvaluationsRepo] 创建评估:', evaluation.evaluationId, '消息:', evaluation.messageId);
    
    return evaluation;
  }

  async existsByMessageId(messageId) {
    return Array.from(this.evaluations.values())
      .some(e => e.messageId === String(messageId));
  }

  async findBySessionId(sessionId, options = {}) {
    let items = Array.from(this.evaluations.values())
      .filter(e => e.sessionId === sessionId);

    // 按时间排序
    items.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    return items;
  }

  async findById(evaluationId) {
    return this.evaluations.get(evaluationId) || null;
  }

  async updateClassification(evaluationId, classificationData) {
    const evaluation = this.evaluations.get(evaluationId);
    
    if (!evaluation) {
      throw new Error(`评估记录不存在: ${evaluationId}`);
    }

    // 更新分类字段
    evaluation.problemType = classificationData.problemType || evaluation.problemType;
    evaluation.needReview = classificationData.needReview !== undefined ? classificationData.needReview : evaluation.needReview;
    evaluation.classifyReason = classificationData.classifyReason || evaluation.classifyReason;

    this.evaluations.set(evaluationId, evaluation);
    console.log('[LiveEvaluationsRepo] 更新评估分类:', evaluationId, 'problemType:', evaluation.problemType);
    
    return evaluation;
  }

  async updateAlert(evaluationId, alertData) {
    const evaluation = this.evaluations.get(evaluationId);
    
    if (!evaluation) {
      throw new Error(`评估记录不存在: ${evaluationId}`);
    }

    // 更新告警字段
    if (alertData.alertLevel !== undefined) {
      evaluation.alertLevel = alertData.alertLevel;
    }
    if (alertData.hasAlert !== undefined) {
      evaluation.hasAlert = alertData.hasAlert;
    }

    this.evaluations.set(evaluationId, evaluation);
    console.log('[LiveEvaluationsRepo] 更新评估告警:', evaluationId, 'alertLevel:', evaluation.alertLevel, 'hasAlert:', evaluation.hasAlert);
    
    return evaluation;
  }

  async findMany(filters = {}, pagination = { page: 1, limit: 20 }) {
    let items = Array.from(this.evaluations.values());

    // 过滤
    if (filters.project) {
      items = items.filter(e => e.project === filters.project);
    }
    if (filters.sessionId) {
      items = items.filter(e => e.sessionId === filters.sessionId);
    }
    if (filters.scenario) {
      items = items.filter(e => e.scenario === filters.scenario);
    }

    // 分页
    const total = items.length;
    const start = (pagination.page - 1) * pagination.limit;
    const end = start + pagination.limit;
    items = items.slice(start, end);

    return { items, total };
  }
}

const defaultRepo = new FileLiveEvaluationsRepository();

module.exports = {
  FileLiveEvaluationsRepository,
  defaultRepo
};
