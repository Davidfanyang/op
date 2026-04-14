/**
 * 告警限流器
 * 防止告警轰炸
 */

class AlertThrottler {
  constructor(options = {}) {
    // 去重时间窗口（毫秒）
    this.sessionDedupWindow = options.sessionDedupWindow || 5 * 60 * 1000; // 5分钟
    // 员工限流时间窗口
    this.employeeRateWindow = options.employeeRateWindow || 60 * 60 * 1000; // 1小时
    // 员工 critical 告警上限
    this.employeeCriticalLimit = options.employeeCriticalLimit || 3;
    
    // 内存存储（生产环境应使用 Redis）
    this.sessionAlerts = new Map(); // sessionId -> { alertType, timestamp }
    this.employeeAlerts = new Map(); // employeeId -> [{ level, timestamp }]
  }

  /**
   * 检查是否应该发送告警
   * @param {Object} alert - 告警对象
   * @param {Object} context - 上下文
   * @param {string} context.sessionId - 会话ID
   * @param {string} context.employeeId - 员工ID
   * @returns {Object} { shouldSend, reason, throttled }
   */
  shouldSendAlert(alert, context = {}) {
    const { sessionId, employeeId } = context;
    
    // 1. 场景匹配失败不触发高危告警
    if (alert.type === 'scenario_match_failed' || alert.type === 'scenario_not_found') {
      return {
        shouldSend: false,
        reason: '场景匹配失败，不触发告警',
        throttled: true
      };
    }

    // 2. 同一会话去重
    if (sessionId) {
      const sessionKey = `${sessionId}:${alert.type}`;
      const lastAlert = this.sessionAlerts.get(sessionKey);
      const now = Date.now();
      
      if (lastAlert && (now - lastAlert.timestamp) < this.sessionDedupWindow) {
        return {
          shouldSend: false,
          reason: `同一会话${Math.floor(this.sessionDedupWindow / 60000)}分钟内已发送相同类型告警`,
          throttled: true,
          lastAlertTime: lastAlert.timestamp
        };
      }
      
      // 记录本次告警
      this.sessionAlerts.set(sessionKey, {
        alertType: alert.type,
        timestamp: now
      });
    }

    // 3. 员工限流
    if (employeeId && alert.level === 'critical') {
      const now = Date.now();
      const employeeHistory = this.employeeAlerts.get(employeeId) || [];
      
      // 清理过期记录
      const validHistory = employeeHistory.filter(
        record => (now - record.timestamp) < this.employeeRateWindow
      );
      
      // 统计 critical 数量
      const criticalCount = validHistory.filter(r => r.level === 'critical').length;
      
      if (criticalCount >= this.employeeCriticalLimit) {
        return {
          shouldSend: false,
          reason: `该员工${Math.floor(this.employeeRateWindow / 3600000)}小时内 critical 告警已达上限`,
          throttled: true,
          criticalCount
        };
      }
      
      // 记录本次告警
      validHistory.push({ level: alert.level, timestamp: now });
      this.employeeAlerts.set(employeeId, validHistory);
    }

    return {
      shouldSend: true,
      throttled: false
    };
  }

  /**
   * 清理过期数据
   */
  cleanup() {
    const now = Date.now();
    
    // 清理会话告警
    for (const [key, value] of this.sessionAlerts.entries()) {
      if ((now - value.timestamp) > this.sessionDedupWindow) {
        this.sessionAlerts.delete(key);
      }
    }
    
    // 清理员工告警历史
    for (const [employeeId, history] of this.employeeAlerts.entries()) {
      const validHistory = history.filter(
        record => (now - record.timestamp) < this.employeeRateWindow
      );
      if (validHistory.length === 0) {
        this.employeeAlerts.delete(employeeId);
      } else {
        this.employeeAlerts.set(employeeId, validHistory);
      }
    }
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      sessionAlertCount: this.sessionAlerts.size,
      employeeAlertCount: this.employeeAlerts.size
    };
  }
}

module.exports = { AlertThrottler };
