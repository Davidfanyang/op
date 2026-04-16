/**
 * 灰度数据收集器 - 用于3-7天灰度期数据收集
 * 
 * 收集内容：
 * - 每次评估的完整输入输出
 * - 告警触发情况
 * - 模型使用情况
 * - 误报标记（后续人工复核）
 */

const fs = require('fs');
const path = require('path');
const { AlertLevel, ReviewStatus } = require('./constants/statuses');

const DATA_DIR = path.resolve(__dirname, '..', 'runtime', 'logs');
const GRAY_LOG_FILE = path.join(DATA_DIR, 'gray-evaluation.log');
const GRAY_STATS_FILE = path.join(DATA_DIR, 'gray-stats.json');

// 确保目录存在
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// 灰度期统计数据（支持新 alertLevel 体系）
let grayStats = {
  startDate: new Date().toISOString(),
  totalEvaluations: 0,
  levelDistribution: {
    'pass': 0,
    'borderline': 0,
    'fail': 0,
    'risk': 0
  },
  alertStats: {
    total: 0,
    critical: 0,      // 严重级
    warning: 0,       // 警告级
    observation: 0    // 观察级
  },
  modelUsage: {
    local: 0,
    openrouter: 0,
    fallback: 0
  },
  aiEnhancement: {
    triggered: 0,
    success: 0,
    failed: 0
  },
  scenarioStats: {},
  reviewStatus: {
    pending: 0,
    confirmed: 0,
    false_positive: 0,
    dismissed: 0
  },
  dailyStats: {}
};

// 加载已有统计
function loadStats() {
  try {
    if (fs.existsSync(GRAY_STATS_FILE)) {
      const data = fs.readFileSync(GRAY_STATS_FILE, 'utf8');
      grayStats = JSON.parse(data);
    }
  } catch (err) {
    console.error('[GrayCollector] 加载统计失败:', err.message);
  }
}

// 保存统计
function saveStats() {
  try {
    fs.writeFileSync(GRAY_STATS_FILE, JSON.stringify(grayStats, null, 2));
  } catch (err) {
    console.error('[GrayCollector] 保存统计失败:', err.message);
  }
}

// 记录单次评估（支持新 alertLevel 体系）
function recordEvaluation(data) {
  const {
    projectId,
    scenarioId,
    alertLevel,
    alerts,
    reviewStatus,
    modelSource,
    aiEnhanced,
    aiFallback,
    customerMessage,
    userReply,
    metadata,
    evaluationStatus,
    sessionId,
    employeeId,
    level
  } = data;

  const timestamp = new Date().toISOString();
  const dateKey = timestamp.split('T')[0];

  // 1. 写入详细日志（每行一个JSON，便于后续分析）
  const logEntry = {
    timestamp,
    sessionId: sessionId || metadata?.sessionId || null,
    employeeId: employeeId || metadata?.employeeId || null,
    projectId,
    scenarioId,
    evaluationStatus: evaluationStatus || 'ok',
    alertLevel: alertLevel || AlertLevel.NONE,
    reviewStatus: reviewStatus || ReviewStatus.PENDING,
    level: level || 'fail',
    alerts,
    modelSource: modelSource || 'local',
    aiEnhanced: aiEnhanced || false,
    aiFallback: aiFallback || false,
    customerMessage: customerMessage?.substring(0, 200),
    userReply: userReply?.substring(0, 200),
    metadata
  };

  try {
    fs.appendFileSync(GRAY_LOG_FILE, JSON.stringify(logEntry) + '\n');
  } catch (err) {
    console.error('[GrayCollector] 写入日志失败:', err.message);
  }

  // 2. 更新统计数据
  grayStats.totalEvaluations++;

  // 等级分布
  if (level) {
    grayStats.levelDistribution[level] = (grayStats.levelDistribution[level] || 0) + 1;
  }

  // 告警统计（新体系：observation, warning, critical）
  if (alerts && alerts.length > 0) {
    grayStats.alertStats.total++;
    if (alertLevel === AlertLevel.CRITICAL) grayStats.alertStats.critical++;
    else if (alertLevel === AlertLevel.WARNING) grayStats.alertStats.warning++;
    else if (alertLevel === AlertLevel.OBSERVATION) grayStats.alertStats.observation++;
  }

  // 模型使用统计
  if (modelSource === 'openrouter') grayStats.modelUsage.openrouter++;
  else if (aiFallback) grayStats.modelUsage.fallback++;
  else grayStats.modelUsage.local++;

  // AI 增强统计
  if (aiEnhanced) {
    grayStats.aiEnhancement.triggered++;
    if (!aiFallback) grayStats.aiEnhancement.success++;
    else grayStats.aiEnhancement.failed++;
  }

  // 场景统计
  if (!grayStats.scenarioStats[scenarioId]) {
    grayStats.scenarioStats[scenarioId] = {
      count: 0,
      alerts: 0,
      levelDistribution: { pass: 0, borderline: 0, fail: 0, risk: 0 }
    };
  }
  const s = grayStats.scenarioStats[scenarioId];
  s.count++;
  if (level) s.levelDistribution[level] = (s.levelDistribution[level] || 0) + 1;
  if (alerts && alerts.length > 0) s.alerts++;

  // 复核状态统计
  const rs = reviewStatus || ReviewStatus.PENDING;
  grayStats.reviewStatus[rs] = (grayStats.reviewStatus[rs] || 0) + 1;

  // 每日统计
  if (!grayStats.dailyStats[dateKey]) {
    grayStats.dailyStats[dateKey] = {
      evaluations: 0,
      alerts: 0,
      levelDistribution: { pass: 0, borderline: 0, fail: 0, risk: 0 }
    };
  }
  const d = grayStats.dailyStats[dateKey];
  d.evaluations++;
  if (alerts && alerts.length > 0) d.alerts++;
  if (level) d.levelDistribution[level] = (d.levelDistribution[level] || 0) + 1;

  // 保存统计
  saveStats();
}

// 获取当前统计摘要
function getStatsSummary() {
  return {
    ...grayStats,
    summary: {
      alertRate: grayStats.totalEvaluations > 0 
        ? (grayStats.alertStats.total / grayStats.totalEvaluations * 100).toFixed(2) + '%'
        : '0%',
      daysRunning: Object.keys(grayStats.dailyStats).length
    }
  };
}



// 标记误报（人工复核用）
function markFalsePositive(evaluationId, reason, reviewedBy) {
  // 这里可以实现从日志中查找并更新状态
  // 简化版：记录到单独文件
  const fpLog = path.join(DATA_DIR, 'gray-false-positives.log');
  const entry = {
    timestamp: new Date().toISOString(),
    evaluationId,
    reason,
    reviewedBy,
    type: 'false_positive'
  };
  fs.appendFileSync(fpLog, JSON.stringify(entry) + '\n');
  
  // 更新统计
  grayStats.reviewStatus.falsePositive++;
  grayStats.reviewStatus.pending = Math.max(0, grayStats.reviewStatus.pending - 1);
  saveStats();
}

// 初始化加载
loadStats();

module.exports = {
  recordEvaluation,
  getStatsSummary,
  markFalsePositive,
  GRAY_LOG_FILE,
  GRAY_STATS_FILE
};
