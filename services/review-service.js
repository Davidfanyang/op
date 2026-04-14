/**
 * 复核服务层 - 主管人工审核接口
 * 
 * 职责：
 * 1. 更新复核状态
 * 2. 校验复核规则
 * 3. 记录复核历史
 * 4. 更新灰度统计数据
 */

const fs = require('fs');
const path = require('path');
const {
  ReviewStatus,
  FalsePositiveReason,
  ReviewValidationRules
} = require('../core/constants/statuses');

const DATA_DIR = path.resolve(__dirname, '..', 'runtime', 'logs');
const REVIEW_LOG_FILE = path.join(DATA_DIR, 'review-history.log');

// 确保目录存在
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

/**
 * 更新复核状态
 * @param {Object} params - 复核参数
 * @param {string} params.sessionId - 会话ID
 * @param {string} params.reviewStatus - 新复核状态
 * @param {string} params.reviewedBy - 复核人
 * @param {string} params.reviewComment - 复核备注（可选）
 * @param {string} params.falsePositiveReason - 误报原因（false_positive时必填）
 * @param {boolean} params.force - 是否强制更新（允许从终态改回pending）
 * @returns {Object} 更新结果
 */
function updateReviewStatus(params) {
  const {
    sessionId,
    reviewStatus,
    reviewedBy,
    reviewComment = '',
    falsePositiveReason = null,
    force = false
  } = params;

  // 1. 基础校验
  if (!sessionId) {
    return createErrorResult('SESSION_ID_REQUIRED', 'sessionId 不能为空');
  }

  if (!reviewStatus) {
    return createErrorResult('REVIEW_STATUS_REQUIRED', 'reviewStatus 不能为空');
  }

  if (!Object.values(ReviewStatus).includes(reviewStatus)) {
    return createErrorResult(
      'INVALID_REVIEW_STATUS',
      `无效的复核状态: ${reviewStatus}，可选值: ${Object.values(ReviewStatus).join(', ')}`
    );
  }

  if (!reviewedBy) {
    return createErrorResult('REVIEWED_BY_REQUIRED', 'reviewedBy 不能为空');
  }

  // 2. 读取当前记录
  const record = findRecordBySessionId(sessionId);
  if (!record) {
    return createErrorResult('RECORD_NOT_FOUND', `未找到会话ID: ${sessionId}`);
  }

  // 3. 状态流转校验
  const currentStatus = record.reviewStatus;
  
  // 不允许从终态改回pending（除非force=true）
  const finalStates = [ReviewStatus.CONFIRMED, ReviewStatus.FALSE_POSITIVE, ReviewStatus.DISMISSED];
  if (finalStates.includes(currentStatus) && reviewStatus === ReviewStatus.PENDING && !force) {
    return createErrorResult(
      'INVALID_STATE_TRANSITION',
      `不能将已复核的记录(${currentStatus})改回 pending，如需修改请设置 force=true`
    );
  }

  // 4. 根据状态校验字段
  const validationRules = ReviewValidationRules[reviewStatus];
  if (!validationRules) {
    return createErrorResult('UNKNOWN_REVIEW_STATUS', `未知的复核状态: ${reviewStatus}`);
  }

  // false_positive 必须提供原因
  if (reviewStatus === ReviewStatus.FALSE_POSITIVE) {
    if (!falsePositiveReason) {
      return createErrorResult(
        'FALSE_POSITIVE_REASON_REQUIRED',
        'false_positive 状态必须提供 falsePositiveReason'
      );
    }
    if (!Object.values(FalsePositiveReason).includes(falsePositiveReason)) {
      return createErrorResult(
        'INVALID_FALSE_POSITIVE_REASON',
        `无效的误报原因: ${falsePositiveReason}，可选值: ${Object.values(FalsePositiveReason).join(', ')}`
      );
    }
  }

  // confirmed/dismissed 不能有误报原因
  if ((reviewStatus === ReviewStatus.CONFIRMED || reviewStatus === ReviewStatus.DISMISSED) 
      && falsePositiveReason) {
    return createErrorResult(
      'FALSE_POSITIVE_REASON_NOT_ALLOWED',
      `${reviewStatus} 状态不能设置 falsePositiveReason`
    );
  }

  // 5. 执行更新
  const now = new Date().toISOString();
  const updatedRecord = {
    ...record,
    reviewStatus,
    reviewedBy,
    reviewedAt: now,
    reviewComment: reviewComment || '',
    falsePositiveReason: reviewStatus === ReviewStatus.FALSE_POSITIVE ? falsePositiveReason : null,
    updatedAt: now
  };

  // 6. 保存更新
  saveRecord(updatedRecord);

  // 7. 记录复核历史
  logReviewHistory({
    sessionId,
    previousStatus: currentStatus,
    newStatus: reviewStatus,
    reviewedBy,
    reviewComment,
    falsePositiveReason,
    timestamp: now
  });

  // 8. 更新灰度统计
  updateGrayStats(currentStatus, reviewStatus);

  return {
    success: true,
    data: updatedRecord,
    message: '复核状态更新成功'
  };
}

/**
 * 根据 sessionId 查找记录
 * 从 gray-evaluation.log 中查找
 */
function findRecordBySessionId(sessionId) {
  const GRAY_LOG_FILE = path.join(DATA_DIR, 'gray-evaluation.log');
  
  if (!fs.existsSync(GRAY_LOG_FILE)) {
    return null;
  }

  try {
    const content = fs.readFileSync(GRAY_LOG_FILE, 'utf8');
    const lines = content.trim().split('\n');
    
    // 从后往前找，找到最新的匹配记录
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const record = JSON.parse(lines[i]);
        if (record.sessionId === sessionId || record.metadata?.sessionId === sessionId) {
          return record;
        }
      } catch (e) {
        // 忽略解析错误的行
        continue;
      }
    }
  } catch (err) {
    console.error('[ReviewService] 读取日志失败:', err.message);
  }

  return null;
}

/**
 * 保存更新后的记录
 * 实际实现：追加一条更新记录到日志
 */
function saveRecord(record) {
  const REVIEW_UPDATE_FILE = path.join(DATA_DIR, 'review-updates.log');
  
  try {
    const entry = {
      type: 'review_update',
      timestamp: new Date().toISOString(),
      record
    };
    fs.appendFileSync(REVIEW_UPDATE_FILE, JSON.stringify(entry) + '\n');
  } catch (err) {
    console.error('[ReviewService] 保存更新失败:', err.message);
  }
}

/**
 * 记录复核历史
 */
function logReviewHistory(history) {
  try {
    fs.appendFileSync(REVIEW_LOG_FILE, JSON.stringify(history) + '\n');
  } catch (err) {
    console.error('[ReviewService] 记录历史失败:', err.message);
  }
}

/**
 * 更新灰度统计数据
 */
function updateGrayStats(oldStatus, newStatus) {
  const GRAY_STATS_FILE = path.join(DATA_DIR, 'gray-stats.json');
  
  try {
    if (!fs.existsSync(GRAY_STATS_FILE)) {
      return;
    }

    const data = fs.readFileSync(GRAY_STATS_FILE, 'utf8');
    const stats = JSON.parse(data);

    // 更新复核状态计数
    if (!stats.reviewStatus) {
      stats.reviewStatus = {};
    }

    // 减少旧状态计数
    if (stats.reviewStatus[oldStatus] && stats.reviewStatus[oldStatus] > 0) {
      stats.reviewStatus[oldStatus]--;
    }

    // 增加新状态计数
    stats.reviewStatus[newStatus] = (stats.reviewStatus[newStatus] || 0) + 1;

    fs.writeFileSync(GRAY_STATS_FILE, JSON.stringify(stats, null, 2));
  } catch (err) {
    console.error('[ReviewService] 更新统计失败:', err.message);
  }
}

/**
 * 创建错误结果
 */
function createErrorResult(code, message) {
  return {
    success: false,
    error: {
      code,
      message
    }
  };
}

/**
 * 获取复核历史
 * @param {string} sessionId - 会话ID
 * @returns {Array} 复核历史记录
 */
function getReviewHistory(sessionId) {
  if (!fs.existsSync(REVIEW_LOG_FILE)) {
    return [];
  }

  try {
    const content = fs.readFileSync(REVIEW_LOG_FILE, 'utf8');
    const lines = content.trim().split('\n');
    
    return lines
      .map(line => {
        try {
          return JSON.parse(line);
        } catch (e) {
          return null;
        }
      })
      .filter(h => h && h.sessionId === sessionId)
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  } catch (err) {
    console.error('[ReviewService] 读取历史失败:', err.message);
    return [];
  }
}

/**
 * 解析 Telegram review 命令
 * @param {string} text - 命令文本
 * @returns {Object|null} 解析结果
 */
function parseReviewCommand(text) {
  const normalized = text.trim().toLowerCase();
  
  // 匹配 /review confirmed [备注]
  // 匹配 /review false_positive [原因] [备注]
  // 匹配 /review dismissed [备注]
  
  const match = normalized.match(/^\/review\s+(confirmed|false_positive|dismissed)(?:\s+(.+))?$/);
  if (!match) {
    return null;
  }

  const status = match[1];
  const rest = match[2] || '';

  const result = {
    reviewStatus: status,
    falsePositiveReason: null,
    reviewComment: ''
  };

  if (status === 'false_positive') {
    // 尝试解析误报原因
    const reasonMatch = rest.match(/^(threshold_too_sensitive|dimension_mapping_strict|model_understanding_limitation|scenario_match_error|other)(?:\s+(.+))?$/);
    if (reasonMatch) {
      result.falsePositiveReason = reasonMatch[1];
      result.reviewComment = reasonMatch[2] || '';
    } else {
      // 没有提供原因，整个作为备注（这种情况应该报错）
      result.reviewComment = rest;
    }
  } else {
    // confirmed 或 dismissed，剩余部分都是备注
    result.reviewComment = rest;
  }

  return result;
}

module.exports = {
  updateReviewStatus,
  getReviewHistory,
  parseReviewCommand,
  ReviewStatus,
  FalsePositiveReason
};
