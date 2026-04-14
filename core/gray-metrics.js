/**
 * 灰度监控统计模块
 * 
 * 统计三个核心指标：
 * 1. 告警总数
 * 2. 实际误报数
 * 3. 主管认可率
 */

const fs = require('fs');
const path = require('path');

const METRICS_DIR = './runtime/metrics';
const METRICS_FILE = path.join(METRICS_DIR, 'gray-metrics.json');

// 确保目录存在
function ensureDir() {
  if (!fs.existsSync(METRICS_DIR)) {
    fs.mkdirSync(METRICS_DIR, { recursive: true });
  }
}

/**
 * 获取或初始化统计数据
 */
function getMetrics() {
  ensureDir();
  
  if (fs.existsSync(METRICS_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(METRICS_FILE, 'utf8'));
    } catch (e) {
      console.error('[GrayMetrics] 读取统计文件失败:', e.message);
    }
  }
  
  return initMetrics();
}

/**
 * 初始化统计数据结构
 */
function initMetrics() {
  return {
    // 基础统计
    totalEvaluations: 0,
    totalAlerts: 0,
    
    // 告警分级统计
    alertsByLevel: {
      critical: 0,
      warning: 0
    },
    
    // 误报统计
    falsePositives: {
      count: 0,
      cases: [] // 存储最近的误报案例
    },
    
    // 主管复核统计
    supervisorReview: {
      totalReviewed: 0,      // 总复核数
      confirmedValid: 0,     // 确认有效告警
      confirmedFalse: 0,     // 确认误报
      pending: 0,            // 待复核
      
      // 认可率 = confirmedValid / totalReviewed
      // 误报率 = confirmedFalse / totalReviewed
    },
    
    // 按类别统计
    byCategory: {
      polite_but_short: { count: 0, alerts: 0, falsePositives: 0 },
      normal_inquiry: { count: 0, alerts: 0, falsePositives: 0 },
      standard_template: { count: 0, alerts: 0, falsePositives: 0 },
      semi_complete: { count: 0, alerts: 0, falsePositives: 0 },
      risky_response: { count: 0, alerts: 0, missed: 0 },
      low_confidence_match: { count: 0, lowConfidence: 0 }
    },
    
    // 时间序列数据（按天）
    dailyStats: {},
    
    // 开始时间
    startDate: new Date().toISOString(),
    
    // 最后更新时间
    lastUpdated: new Date().toISOString()
  };
}

/**
 * 保存统计数据
 */
function saveMetrics(metrics) {
  ensureDir();
  metrics.lastUpdated = new Date().toISOString();
  fs.writeFileSync(METRICS_FILE, JSON.stringify(metrics, null, 2));
}

/**
 * 记录一次评估
 */
function recordEvaluation(data) {
  const metrics = getMetrics();
  
  metrics.totalEvaluations++;
  
  // 按天统计
  const today = new Date().toISOString().split('T')[0];
  if (!metrics.dailyStats[today]) {
    metrics.dailyStats[today] = {
      evaluations: 0,
      alerts: 0,
      falsePositives: 0
    };
  }
  metrics.dailyStats[today].evaluations++;
  
  saveMetrics(metrics);
  return metrics;
}

/**
 * 记录一次告警
 */
function recordAlert(alertData) {
  const metrics = getMetrics();
  
  metrics.totalAlerts++;
  
  // 分级统计
  if (alertData.level) {
    metrics.alertsByLevel[alertData.level] = 
      (metrics.alertsByLevel[alertData.level] || 0) + 1;
  }
  
  // 按天统计
  const today = new Date().toISOString().split('T')[0];
  if (metrics.dailyStats[today]) {
    metrics.dailyStats[today].alerts++;
  }
  
  saveMetrics(metrics);
  return metrics;
}

/**
 * 记录误报
 */
function recordFalsePositive(caseData) {
  const metrics = getMetrics();
  
  metrics.falsePositives.count++;
  
  // 保存最近的10个案例
  metrics.falsePositives.cases.unshift({
    ...caseData,
    timestamp: new Date().toISOString()
  });
  if (metrics.falsePositives.cases.length > 10) {
    metrics.falsePositives.cases = metrics.falsePositives.cases.slice(0, 10);
  }
  
  // 按天统计
  const today = new Date().toISOString().split('T')[0];
  if (metrics.dailyStats[today]) {
    metrics.dailyStats[today].falsePositives++;
  }
  
  saveMetrics(metrics);
  return metrics;
}

/**
 * 记录主管复核结果
 */
function recordSupervisorReview(reviewData) {
  const metrics = getMetrics();
  
  metrics.supervisorReview.totalReviewed++;
  
  if (reviewData.isValid === true) {
    metrics.supervisorReview.confirmedValid++;
  } else if (reviewData.isValid === false) {
    metrics.supervisorReview.confirmedFalse++;
  } else {
    metrics.supervisorReview.pending++;
  }
  
  saveMetrics(metrics);
  return metrics;
}

/**
 * 计算核心指标
 */
function calculateCoreMetrics() {
  const metrics = getMetrics();
  
  const reviewed = metrics.supervisorReview.totalReviewed;
  const confirmedValid = metrics.supervisorReview.confirmedValid;
  const confirmedFalse = metrics.supervisorReview.confirmedFalse;
  
  return {
    // 告警总数
    totalAlerts: metrics.totalAlerts,
    
    // 实际误报数（主管确认的）
    confirmedFalsePositives: confirmedFalse,
    
    // 主管认可率
    supervisorApprovalRate: reviewed > 0 
      ? (confirmedValid / reviewed * 100).toFixed(2) + '%'
      : 'N/A (暂无复核数据)',
    
    // 误报率（基于主管复核）
    falsePositiveRate: reviewed > 0
      ? (confirmedFalse / reviewed * 100).toFixed(2) + '%'
      : 'N/A (暂无复核数据)',
    
    // 待复核数
    pendingReview: metrics.supervisorReview.pending,
    
    // 总评估数
    totalEvaluations: metrics.totalEvaluations,
    
    // 告警率
    alertRate: metrics.totalEvaluations > 0
      ? (metrics.totalAlerts / metrics.totalEvaluations * 100).toFixed(2) + '%'
      : '0%'
  };
}

/**
 * 生成灰度报告
 */
function generateGrayReport() {
  const metrics = getMetrics();
  const coreMetrics = calculateCoreMetrics();
  
  const report = {
    generatedAt: new Date().toISOString(),
    period: {
      start: metrics.startDate,
      end: new Date().toISOString()
    },
    coreMetrics,
    details: metrics,
    
    // 灰度建议
    recommendation: generateRecommendation(coreMetrics)
  };
  
  return report;
}

/**
 * 基于指标生成灰度建议
 */
function generateRecommendation(metrics) {
  const issues = [];
  
  // 检查误报率
  const fpRate = parseFloat(metrics.falsePositiveRate);
  if (!isNaN(fpRate) && fpRate > 20) {
    issues.push('误报率超过20%，建议调整告警阈值');
  }
  
  // 检查认可率
  const approvalRate = parseFloat(metrics.supervisorApprovalRate);
  if (!isNaN(approvalRate) && approvalRate < 70) {
    issues.push('主管认可率低于70%，建议优化评分算法');
  }
  
  // 检查告警率
  const alertRate = parseFloat(metrics.alertRate);
  if (!isNaN(alertRate) && alertRate > 30) {
    issues.push('告警率过高，建议检查阈值设置');
  }
  
  if (issues.length === 0) {
    return {
      level: 'good',
      message: '指标正常，可以继续灰度或考虑扩大范围',
      issues: []
    };
  } else if (issues.length <= 2) {
    return {
      level: 'warning',
      message: '存在一些问题，建议优化后再扩大灰度',
      issues
    };
  } else {
    return {
      level: 'critical',
      message: '多项指标异常，建议暂停灰度并全面优化',
      issues
    };
  }
}

/**
 * 重置统计数据
 */
function resetMetrics() {
  const fresh = initMetrics();
  saveMetrics(fresh);
  return fresh;
}

module.exports = {
  recordEvaluation,
  recordAlert,
  recordFalsePositive,
  recordSupervisorReview,
  calculateCoreMetrics,
  generateGrayReport,
  getMetrics,
  resetMetrics
};
