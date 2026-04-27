/**
 * Live Monitor 告警分流规则
 * 
 * 目标: 主管负担可控,不是所有告警都推给主管
 * 
 * 分流层级:
 * 1. 直接进主管 review (需立即处理)
 * 2. 进入待观察队列 (定期review)
 * 3. 不进入主管流 (自动记录,仅统计)
 */

class AlertRouter {
  constructor(options = {}) {
    this.rules = options.rules || this.getDefaultRules();
  }

  /**
   * 默认分流规则
   */
  getDefaultRules() {
    return {
      // 直接进主管 review 的条件
      direct_to_supervisor: [
        { 
          name: 'risk_level',
          condition: (result) => result.riskLevel === 'high' || result.result?.level === 'risk',
          reason: '高风险或风险等级'
        },
        { 
          name: 'critical_fail',
          condition: (result) => result.result?.level === 'fail' && result.riskLevel === 'medium',
          reason: '不通过且中等风险'
        },
        { 
          name: 'risk_keywords',
          condition: (result) => {
            const reply = (result.currentReply || result.userReply || '').toLowerCase();
            const riskWords = ['不知道', '不关我事', '没办法', '不行', '不是我的问题'];
            return riskWords.some(word => reply.includes(word));
          },
          reason: '包含风险关键词'
        },
        { 
          name: 'complaint_escalation',
          condition: (result) => {
            const issues = result.result?.issues || result.findings || [];
            return issues.some(issue => 
              issue.type === 'risk' || 
              issue.message?.includes('投诉') ||
              issue.message?.includes('升级') ||
              issue.severity === 'critical'
            );
          },
          reason: '可能引发投诉/升级'
        }
      ],

      // 进入待观察队列的条件
      observation_queue: [
        { 
          name: 'borderline_level',
          condition: (result) => result.result?.level === 'borderline',
          reason: '临界等级，需要关注'
        },
        { 
          name: 'low_risk',
          condition: (result) => result.riskLevel === 'low',
          reason: '轻微风险'
        },
        { 
          name: 'first_occurrence',
          condition: (result, context) => {
            // 首次出现该问题的员工
            return context?.employeeHistory?.totalIssues === 0;
          },
          reason: '员工首次出现问题'
        }
      ],

      // 不进入主管流 (仅记录)
      auto_record_only: [
        { 
          name: 'pass_level',
          condition: (result) => result.result?.level === 'pass',
          reason: '通过等级'
        },
        { 
          name: 'minor_wording',
          condition: (result) => {
            const issues = result.result?.issues || result.findings || [];
            return issues.length === 1 && 
                   issues[0].severity === 'low' &&
                   issues[0].type === 'wording';
          },
          reason: '轻微话术问题'
        },
        { 
          name: 'repeat_low_priority',
          condition: (result, context) => {
            // 同一员工1小时内第3次以上observation
            return context?.employeeHistory?.observationCount >= 3;
          },
          reason: '重复低优先级问题,已触发限流'
        }
      ]
    };
  }

  /**
   * 路由决策 (核心方法)
   * 
   * @param {Object} result - 评估结果
   * @param {Object} context - 上下文 (员工历史等)
   * @returns {Object} { route, reason, priority, action }
   */
  route(result, context = {}) {
    // 1. 检查是否直接进主管 review
    for (const rule of this.rules.direct_to_supervisor) {
      if (rule.condition(result, context)) {
        return {
          route: 'supervisor_review',
          reason: rule.reason,
          rule: rule.name,
          priority: 'high',
          action: '需立即处理',
          notification: true
        };
      }
    }

    // 2. 检查是否进入待观察队列
    for (const rule of this.rules.observation_queue) {
      if (rule.condition(result, context)) {
        return {
          route: 'observation_queue',
          reason: rule.reason,
          rule: rule.name,
          priority: 'medium',
          action: '定期review',
          notification: false
        };
      }
    }

    // 3. 默认: 仅记录
    return {
      route: 'auto_record',
      reason: '自动记录,不通知主管',
      rule: 'default',
      priority: 'low',
      action: '仅统计',
      notification: false
    };
  }

  /**
   * 批量路由 (用于历史数据分析)
   */
  routeBatch(results, contexts = {}) {
    return results.map((result, index) => {
      const context = contexts[index] || {};
      return {
        ...result,
        routing: this.route(result, context)
      };
    });
  }

  /**
   * 获取分流统计
   */
  getRoutingStats(routedResults) {
    const stats = {
      supervisor_review: 0,
      observation_queue: 0,
      auto_record: 0,
      total: routedResults.length
    };

    routedResults.forEach(r => {
      const route = r.routing?.route || 'auto_record';
      stats[route]++;
    });

    return {
      ...stats,
      supervisor_rate: ((stats.supervisor_review / stats.total) * 100).toFixed(1) + '%',
      observation_rate: ((stats.observation_queue / stats.total) * 100).toFixed(1) + '%',
      auto_rate: ((stats.auto_record / stats.total) * 100).toFixed(1) + '%'
    };
  }

  /**
   * 规则说明 (用于文档生成)
   */
  getRulesDocumentation() {
    return {
      supervisor_review: {
        name: '直接进主管 Review',
        rules: this.rules.direct_to_supervisor.map(r => ({
          name: r.name,
          reason: r.reason
        })),
        action: '立即通知主管,需24小时内处理'
      },
      observation_queue: {
        name: '待观察队列',
        rules: this.rules.observation_queue.map(r => ({
          name: r.name,
          reason: r.reason
        })),
        action: '进入观察队列,主管定期review (每周)'
      },
      auto_record: {
        name: '自动记录 (不进入主管流)',
        rules: this.rules.auto_record_only.map(r => ({
          name: r.name,
          reason: r.reason
        })),
        action: '仅记录到数据库,用于统计分析,不通知主管'
      }
    };
  }
}

module.exports = { AlertRouter };
