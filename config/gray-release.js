/**
 * 灰度发布配置
 * 
 * 限制条件（必须严格遵守）：
 * 1. 只接一个项目
 * 2. 只接一个入口
 * 3. 只看内部监控
 * 4. Telegram告警先发测试群，不进正式主管群
 * 5. 结果只做观察，不做处罚依据
 */

const GRAY_RELEASE_CONFIG = {
  // 启用状态
  enabled: process.env.GRAY_RELEASE_ENABLED === 'true',
  
  // ========== 项目限制 ==========
  project: {
    // 只允许这一个项目
    allowedProjectId: process.env.GRAY_PROJECT_ID || 'lanton',
    
    // 是否拒绝其他项目
    rejectOthers: true,
    
    // 拒绝时的提示
    rejectMessage: '当前处于灰度阶段，仅支持特定项目'
  },
  
  // ========== 入口限制 ==========
  entry: {
    // 只允许来自这个入口的请求
    // 可选: 'telegram-bot', 'live-monitor-api', 'webhook'
    allowedSource: process.env.GRAY_ENTRY_SOURCE || 'live-monitor-api',
    
    // 请求头标识检查
    requireSourceHeader: true,
    sourceHeaderName: 'X-Source-Entry'
  },
  
  // ========== 告警路由限制 ==========
  alerts: {
    // 测试群ID（灰度期间所有告警发这里）
    testChatId: process.env.GRAY_TEST_CHAT_ID,
    
    // 正式主管群ID（灰度期间禁用）
    // 即使配置了也不使用
    productionChatId: null,
    
    // 告警前缀标识
    alertPrefix: '[灰度测试]',
    
    // 是否添加免责声明
    addDisclaimer: true,
    disclaimer: '⚠️ 此为灰度测试数据，不作为质检处罚依据'
  },
  
  // ========== 监控范围限制 ==========
  monitoring: {
    // 只监控内部员工（不监控外部真实客户）
    internalEmployeeOnly: true,
    
    // 允许的测试员工ID列表（空数组表示不限制）
    allowedEmployeeIds: process.env.GRAY_TEST_EMPLOYEES?.split(',') || [],
    
    // 是否需要标记为测试数据
    markAsTestData: true
  },
  
  // ========== 结果使用限制 ==========
  resultUsage: {
    // 是否允许用于绩效
    allowForPerformance: false,
    
    // 是否允许用于正式质检报告
    allowForOfficialReport: false,
    
    // 数据保留天数
    dataRetentionDays: 7,
    
    // 是否需要额外审批才能查看
    requireApproval: true
  },
  
  // ========== 灰度周期配置 ==========
  period: {
    // 开始时间
    startDate: process.env.GRAY_START_DATE,
    
    // 计划结束时间（默认14天后）
    endDate: process.env.GRAY_END_DATE,
    
    // 每日最大评估次数
    maxDailyEvaluations: parseInt(process.env.GRAY_MAX_DAILY) || 1000,
    
    // 告警频率限制（每分钟最多）
    alertRateLimit: 10
  }
};

/**
 * 检查项目是否在灰度范围内
 */
function isProjectAllowed(projectId) {
  if (!GRAY_RELEASE_CONFIG.enabled) return true;
  return projectId === GRAY_RELEASE_CONFIG.project.allowedProjectId;
}

/**
 * 检查入口是否在灰度范围内
 */
function isEntryAllowed(source) {
  if (!GRAY_RELEASE_CONFIG.enabled) return true;
  if (!GRAY_RELEASE_CONFIG.entry.requireSourceHeader) return true;
  return source === GRAY_RELEASE_CONFIG.entry.allowedSource;
}

/**
 * 检查员工是否在灰度范围内
 */
function isEmployeeAllowed(employeeId) {
  if (!GRAY_RELEASE_CONFIG.enabled) return true;
  if (!GRAY_RELEASE_CONFIG.monitoring.internalEmployeeOnly) return true;
  
  const allowed = GRAY_RELEASE_CONFIG.monitoring.allowedEmployeeIds;
  if (allowed.length === 0) return true;
  
  return allowed.includes(employeeId);
}

/**
 * 获取灰度期间的告警ChatId
 */
function getAlertChatId() {
  if (!GRAY_RELEASE_CONFIG.enabled) {
    return process.env.TELEGRAM_ALERT_CHAT_ID;
  }
  return GRAY_RELEASE_CONFIG.alerts.testChatId || process.env.TELEGRAM_ALERT_CHAT_ID;
}

/**
 * 检查是否超出每日限制
 */
function checkDailyLimit(currentCount) {
  if (!GRAY_RELEASE_CONFIG.enabled) return { allowed: true };
  
  const max = GRAY_RELEASE_CONFIG.period.maxDailyEvaluations;
  if (currentCount >= max) {
    return {
      allowed: false,
      reason: `已达到灰度每日限制 (${max})`
    };
  }
  return { allowed: true };
}

/**
 * 为灰度数据添加标记
 */
function markAsGrayRelease(data) {
  if (!GRAY_RELEASE_CONFIG.enabled) return data;
  
  return {
    ...data,
    _grayRelease: {
      isTestData: true,
      startDate: GRAY_RELEASE_CONFIG.period.startDate,
      notForPerformance: true,
      notForOfficialReport: true,
      disclaimer: GRAY_RELEASE_CONFIG.alerts.disclaimer
    }
  };
}

/**
 * 格式化灰度告警消息
 */
function formatGrayAlertMessage(originalMessage) {
  if (!GRAY_RELEASE_CONFIG.enabled) return originalMessage;
  
  let message = GRAY_RELEASE_CONFIG.alerts.alertPrefix + '\n\n';
  message += originalMessage;
  
  if (GRAY_RELEASE_CONFIG.alerts.addDisclaimer) {
    message += '\n\n' + GRAY_RELEASE_CONFIG.alerts.disclaimer;
  }
  
  return message;
}

module.exports = {
  GRAY_RELEASE_CONFIG,
  isProjectAllowed,
  isEntryAllowed,
  isEmployeeAllowed,
  getAlertChatId,
  checkDailyLimit,
  markAsGrayRelease,
  formatGrayAlertMessage
};
