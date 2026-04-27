/**
 * Alerts Repository - 内存实现
 */

const { AlertsRepository } = require('../alerts-repository');
const { v4: uuidv4 } = require('uuid');

class FileAlertsRepository extends AlertsRepository {
  constructor() {
    super();
    this.alerts = new Map();
  }

  async create(alertData) {
    const alert = {
      id: alertData.id || `alert_${uuidv4()}`,
      evaluationId: alertData.evaluationId,
      sessionId: alertData.sessionId,
      messageId: alertData.messageId,
      alertLevel: alertData.alertLevel,
      alertType: alertData.alertType,
      alertReason: alertData.alertReason,
      status: 'open',
      createdAt: new Date()
    };

    this.alerts.set(alert.id, alert);
    console.log('[AlertsRepo] 创建告警:', alert.id, '等级:', alert.alertLevel, '类型:', alert.alertType);
    
    return alert;
  }

  async existsByEvaluationId(evaluationId) {
    return Array.from(this.alerts.values())
      .some(a => a.evaluationId === evaluationId);
  }

  async findBySessionId(sessionId) {
    return Array.from(this.alerts.values())
      .filter(a => a.sessionId === sessionId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  async findByEvaluationId(evaluationId) {
    return Array.from(this.alerts.values())
      .filter(a => a.evaluationId === evaluationId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  async findByAlertLevel(alertLevel, options = {}) {
    let items = Array.from(this.alerts.values())
      .filter(a => a.alertLevel === alertLevel);

    // 按时间排序
    items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // 可选限制数量
    if (options.limit) {
      items = items.slice(0, options.limit);
    }

    return items;
  }

  async findMany(filters = {}, pagination = { page: 1, limit: 20 }) {
    let items = Array.from(this.alerts.values());

    // 过滤
    if (filters.alertLevel) {
      items = items.filter(a => a.alertLevel === filters.alertLevel);
    }
    if (filters.alertType) {
      items = items.filter(a => a.alertType === filters.alertType);
    }
    if (filters.sessionId) {
      items = items.filter(a => a.sessionId === filters.sessionId);
    }
    if (filters.status) {
      items = items.filter(a => a.status === filters.status);
    }

    // 按时间排序（最新优先）
    items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // 分页
    const total = items.length;
    const start = (pagination.page - 1) * pagination.limit;
    const end = start + pagination.limit;
    items = items.slice(start, end);

    return { items, total };
  }
}

const defaultRepo = new FileAlertsRepository();

module.exports = {
  FileAlertsRepository,
  defaultRepo
};
