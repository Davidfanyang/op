/**
 * 最小复核记录表
 * 
 * P0.5: 支持人工标记每条告警
 * 记录字段：reviewStatus, reviewedBy, reviewedAt, reviewComment, falsePositiveReason
 */

const fs = require('fs');
const path = require('path');

const REVIEW_DIR = './runtime/reviews';
const REVIEW_FILE = path.join(REVIEW_DIR, 'review-records.json');

// 确保目录存在
function ensureDir() {
  if (!fs.existsSync(REVIEW_DIR)) {
    fs.mkdirSync(REVIEW_DIR, { recursive: true });
  }
}

/**
 * 获取或初始化复核记录
 */
function getRecords() {
  ensureDir();
  
  if (fs.existsSync(REVIEW_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(REVIEW_FILE, 'utf8'));
    } catch (e) {
      console.error('[ReviewRecord] 读取失败:', e.message);
    }
  }
  
  return {
    version: '1.0',
    totalRecords: 0,
    pendingCount: 0,
    confirmedCount: 0,
    falsePositiveCount: 0,
    dismissedCount: 0,
    records: []
  };
}

/**
 * 保存记录
 */
function saveRecords(data) {
  ensureDir();
  fs.writeFileSync(REVIEW_FILE, JSON.stringify(data, null, 2));
}

/**
 * 创建复核记录
 * @param {Object} evaluationResult - 评估结果
 * @returns {string} recordId - 记录ID
 */
function createRecord(evaluationResult) {
  const records = getRecords();
  
  const record = {
    id: generateId(),
    // 关联信息
    sessionId: evaluationResult.sessionId || null,
    employeeId: evaluationResult.employeeId || null,
    projectId: evaluationResult.projectId,
    scenarioId: evaluationResult.scenarioId,
    
    // 评估结果快照
    score: evaluationResult.score,
    alertLevel: evaluationResult.alertLevel,
    alerts: evaluationResult.alerts || [],
    customerMessage: evaluationResult.customerMessage,
    userReply: evaluationResult.userReply,
    
    // 复核字段
    reviewStatus: 'pending',
    reviewedBy: null,
    reviewedAt: null,
    reviewComment: null,
    falsePositiveReason: null, // 误报归因分类
    
    // 元数据
    createdAt: new Date().toISOString(),
    grayRelease: evaluationResult.grayRelease || null
  };
  
  records.records.unshift(record);
  records.totalRecords++;
  records.pendingCount++;
  
  // 限制记录数量（保留最近1000条）
  if (records.records.length > 1000) {
    records.records = records.records.slice(0, 1000);
  }
  
  saveRecords(records);
  
  console.log(`[ReviewRecord] 创建记录: ${record.id}`);
  return record.id;
}

/**
 * 更新复核状态
 * @param {string} recordId - 记录ID
 * @param {Object} update - 更新内容
 * @param {string} update.status - confirmed | false_positive | dismissed
 * @param {string} update.reviewedBy - 复核人
 * @param {string} update.comment - 复核意见
 * @param {string} update.falsePositiveReason - 误报原因分类
 */
function updateReview(recordId, update) {
  const records = getRecords();
  const record = records.records.find(r => r.id === recordId);
  
  if (!record) {
    console.error(`[ReviewRecord] 记录不存在: ${recordId}`);
    return null;
  }
  
  // 更新状态计数
  if (record.reviewStatus === 'pending') {
    records.pendingCount--;
  } else if (record.reviewStatus === 'confirmed') {
    records.confirmedCount--;
  } else if (record.reviewStatus === 'false_positive') {
    records.falsePositiveCount--;
  } else if (record.reviewStatus === 'dismissed') {
    records.dismissedCount--;
  }
  
  // 更新记录
  record.reviewStatus = update.status || record.reviewStatus;
  record.reviewedBy = update.reviewedBy || record.reviewedBy;
  record.reviewedAt = new Date().toISOString();
  record.reviewComment = update.comment || record.reviewComment;
  record.falsePositiveReason = update.falsePositiveReason || record.falsePositiveReason;
  
  // 更新新状态计数
  if (record.reviewStatus === 'confirmed') {
    records.confirmedCount++;
  } else if (record.reviewStatus === 'false_positive') {
    records.falsePositiveCount++;
  } else if (record.reviewStatus === 'dismissed') {
    records.dismissedCount++;
  } else if (record.reviewStatus === 'pending') {
    records.pendingCount++;
  }
  
  saveRecords(records);
  
  console.log(`[ReviewRecord] 更新记录: ${recordId} -> ${record.reviewStatus}`);
  return record;
}

/**
 * 获取统计信息
 */
function getStats() {
  const records = getRecords();
  const total = records.totalRecords;
  
  return {
    total,
    pending: records.pendingCount,
    confirmed: records.confirmedCount,
    falsePositive: records.falsePositiveCount,
    dismissed: records.dismissedCount,
    // 计算采纳率
    adoptionRate: total > 0 
      ? ((records.confirmedCount / total) * 100).toFixed(2) + '%'
      : 'N/A',
    // 计算误报率
    falsePositiveRate: total > 0
      ? ((records.falsePositiveCount / total) * 100).toFixed(2) + '%'
      : 'N/A'
  };
}

/**
 * 获取待复核列表
 */
function getPendingList(limit = 50) {
  const records = getRecords();
  return records.records
    .filter(r => r.reviewStatus === 'pending')
    .slice(0, limit);
}

/**
 * 获取误报分类统计
 */
function getFalsePositiveStats() {
  const records = getRecords();
  const fpRecords = records.records.filter(r => r.reviewStatus === 'false_positive');
  
  const reasons = {};
  fpRecords.forEach(r => {
    const reason = r.falsePositiveReason || '未分类';
    reasons[reason] = (reasons[reason] || 0) + 1;
  });
  
  return {
    total: fpRecords.length,
    byReason: reasons
  };
}

/**
 * 生成唯一ID
 */
function generateId() {
  return `rev_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

module.exports = {
  createRecord,
  updateReview,
  getStats,
  getPendingList,
  getFalsePositiveStats,
  getRecords
};
