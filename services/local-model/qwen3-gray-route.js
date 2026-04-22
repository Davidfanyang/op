/**
 * @status EXPERIMENTAL_MODULE
 * @line MAIN_EXPERIMENT_LINE
 * @stage CURRENT_STAGE_TARGET
 * @production false
 * @scope qwen3 local experiment only
 */

/**
 * Qwen3 Adapter 灰度路由模块
 * 
 * 职责：
 * 1. 灰度开关判断（总开关 + 白名单）
 * 2. 灰度命中规则（任务类型 + 入口 + 场景）
 * 3. qwen3-adapter 调用封装
 * 4. 失败自动回退原逻辑
 * 5. 灰度日志记录
 * 6. 灰度统计收集
 * 
 * 设计原则：
 * - 旁路接入，不替换原逻辑
 * - 开关控制，可随时关闭
 * - 失败回退，不卡死流程
 * - 日志完备，可观测统计
 * 
 * 接入范围：
 * ✅ 允许：training, review, test_entry
 * ❌ 禁止：live_monitor, alert_pipeline
 */

const { evaluateWithQwen3Adapter } = require('./qwen3-adapter');

// 支持测试 mock
const evaluateWithQwen3AdapterMocked = async (input) => {
  if (global.__QWEN3_ADAPTER_MOCK__) {
    return global.__QWEN3_ADAPTER_MOCK__;
  }
  return evaluateWithQwen3Adapter(input);
};

// ============================================================
// 灰度开关配置
// ============================================================

const GRAY_CONFIG = {
  // 总开关
  enabled: process.env.QWEN3_ADAPTER_ENABLED === 'true',
  
  // 任务类型白名单（仅允许 quality_evaluation）
  taskTypeWhitelist: (process.env.QWEN3_ADAPTER_TASK_TYPES || 'quality_evaluation').split(',').map(s => s.trim()),
  
  // 场景白名单（初期仅允许已验证场景）
  scenarioWhitelist: (process.env.QWEN3_ADAPTER_SCENARIO_WHITELIST || 'transfer_not_received,withdraw_pending,payment_deducted_failed,service_response_poor,info_missing').split(',').map(s => s.trim()),
  
  // 入口白名单（仅允许 training, review, test_entry）
  entryWhitelist: (process.env.QWEN3_ADAPTER_ENTRY_WHITELIST || 'training,review,test_entry').split(',').map(s => s.trim()),
  
  // 采样率（灰度初期建议为 0，仅靠白名单命中）
  sampleRate: parseFloat(process.env.QWEN3_ADAPTER_SAMPLE_RATE || '0')
};

// ============================================================
// 灰度统计收集器（内存级，支持导出）
// ============================================================

const grayStats = {
  totalHits: 0,           // 灰度命中次数
  qwen3Success: 0,        // qwen3 成功次数
  qwen3Failure: 0,        // qwen3 失败次数
  fallbackCount: 0,       // 回退次数
  originalDirectCount: 0, // 原逻辑直走次数
  
  // 失败类型统计
  failureTypes: {
    request_failed: 0,
    timeout: 0,
    empty_response: 0,
    no_json_found: 0,
    json_parse_failed: 0,
    truncated_output: 0,
    invalid_fields: 0,
    risky_suggested_reply: 0
  },
  
  // 性能统计
  qwen3TotalDuration: 0,
  fallbackTotalDuration: 0,
  totalDuration: 0,
  
  // 质量统计
  parseSuccessCount: 0,
  usableSuccessCount: 0
};

/**
 * 导出灰度统计
 */
function getGrayStats() {
  const total = grayStats.totalHits;
  return {
    ...grayStats,
    qwen3AvgDuration: grayStats.qwen3Success > 0 ? grayStats.qwen3TotalDuration / grayStats.qwen3Success : 0,
    fallbackAvgDuration: grayStats.fallbackCount > 0 ? grayStats.fallbackTotalDuration / grayStats.fallbackCount : 0,
    parseSuccessRate: total > 0 ? grayStats.parseSuccessCount / total : 0,
    usableSuccessRate: total > 0 ? grayStats.usableSuccessCount / total : 0,
    fallbackRate: total > 0 ? grayStats.fallbackCount / total : 0
  };
}

/**
 * 重置灰度统计
 */
function resetGrayStats() {
  Object.keys(grayStats).forEach(key => {
    if (typeof grayStats[key] === 'number') {
      grayStats[key] = 0;
    } else if (typeof grayStats[key] === 'object') {
      Object.keys(grayStats[key]).forEach(k => grayStats[key][k] = 0);
    }
  });
}

// ============================================================
// 灰度命中判断
// ============================================================

/**
 * 判断是否命中灰度
 * 
 * @param {Object} context - 调用上下文
 * @param {string} context.taskType - 任务类型（quality_evaluation 等）
 * @param {string} context.entrySource - 入口来源（training, review, test_entry 等）
 * @param {string} context.scenario - 场景标识（可选）
 * @returns {Object} { hit: boolean, reason: string }
 */
function shouldUseQwen3Adapter(context = {}) {
  // 1. 检查总开关
  if (!GRAY_CONFIG.enabled) {
    return { hit: false, reason: 'total_switch_off' };
  }
  
  const { taskType, entrySource, scenario } = context;
  const reasons = [];
  
  // 2. 检查任务类型白名单
  if (!taskType || !GRAY_CONFIG.taskTypeWhitelist.includes(taskType)) {
    return { hit: false, reason: 'taskType_not_whitelisted' };
  }
  reasons.push('taskType_whitelisted');
  
  // 3. 检查入口白名单
  if (!entrySource || !GRAY_CONFIG.entryWhitelist.includes(entrySource)) {
    return { hit: false, reason: 'entry_not_whitelisted' };
  }
  reasons.push('entry_whitelisted');
  
  // 4. 检查场景白名单（如果提供了 scenario）
  if (scenario) {
    if (!GRAY_CONFIG.scenarioWhitelist.includes(scenario)) {
      return { hit: false, reason: 'scenario_not_whitelisted' };
    }
    reasons.push('scenario_whitelisted');
  }
  
  // 5. 采样率判断（灰度初期 sampleRate=0，仅靠白名单）
  if (GRAY_CONFIG.sampleRate > 0) {
    const random = Math.random();
    if (random > GRAY_CONFIG.sampleRate) {
      return { hit: false, reason: 'sample_rate_not_hit' };
    }
    reasons.push('sample_rate_hit');
  }
  
  // 6. 所有条件满足，命中灰度
  return { hit: true, reason: reasons.join(' + ') };
}

// ============================================================
// 灰度调用封装（带 fallback）
// ============================================================

/**
 * 调用 qwen3-adapter 并自动回退原逻辑
 * 
 * @param {Object} input - 评估输入
 * @param {Object} context - 调用上下文
 * @param {Function} originalLogic - 原逻辑函数
 * @returns {Promise<Object>} 统一结果
 */
async function callQwen3AdapterWithFallback(input, context, originalLogic) {
  const startTime = Date.now();
  const grayDecision = shouldUseQwen3Adapter(context);
  
  // 未命中灰度，直接走原逻辑
  if (!grayDecision.hit) {
    grayStats.originalDirectCount++;
    
    const originalStart = Date.now();
    const originalResult = await originalLogic(input, context);
    const originalDuration = Date.now() - originalStart;
    
    // 记录日志
    logGrayEvent({
      grayHit: false,
      grayReason: grayDecision.reason,
      route: 'original_direct',
      taskType: context.taskType,
      entrySource: context.entrySource,
      scenario: context.scenario,
      original: {
        durationMs: originalDuration
      }
    });
    
    return {
      route: 'original_direct',
      result: originalResult
    };
  }
  
  // 命中灰度，尝试 qwen3-adapter
  grayStats.totalHits++;
  
  try {
    const qwenStart = Date.now();
    const qwenResult = await evaluateWithQwen3AdapterMocked(input);
    const qwenDuration = Date.now() - qwenStart;
    
    // qwen3 成功
    if (qwenResult.success && qwenResult.data !== null) {
      grayStats.qwen3Success++;
      grayStats.qwen3TotalDuration += qwenDuration;
      
      if (qwenResult.parseSuccess) grayStats.parseSuccessCount++;
      if (qwenResult.usableSuccess) grayStats.usableSuccessCount++;
      
      const totalDuration = Date.now() - startTime;
      grayStats.totalDuration += totalDuration;
      
      // 记录日志
      logGrayEvent({
        grayHit: true,
        grayReason: grayDecision.reason,
        route: 'qwen3_adapter',
        qwen3: {
          success: true,
          parseSuccess: qwenResult.parseSuccess,
          usableSuccess: qwenResult.usableSuccess,
          retryCount: qwenResult.retryCount || 0,
          durationMs: qwenDuration
        },
        taskType: context.taskType,
        entrySource: context.entrySource,
        scenario: context.scenario,
        totalDurationMs: totalDuration
      });
      
      return {
        route: 'qwen3_adapter',
        result: qwenResult
      };
    }
    
    // qwen3 失败，自动回退
    grayStats.qwen3Failure++;
    grayStats.fallbackCount++;
    grayStats.qwen3TotalDuration += qwenDuration;
    
    const failureType = qwenResult.failureType || 'unknown';
    if (grayStats.failureTypes.hasOwnProperty(failureType)) {
      grayStats.failureTypes[failureType]++;
    }
    
    // 回退到原逻辑
    const fallbackStart = Date.now();
    const fallbackResult = await originalLogic(input, context);
    const fallbackDuration = Date.now() - fallbackStart;
    grayStats.fallbackTotalDuration += fallbackDuration;
    
    const totalDuration = Date.now() - startTime;
    grayStats.totalDuration += totalDuration;
    
    // 记录日志
    logGrayEvent({
      grayHit: true,
      grayReason: grayDecision.reason,
      route: 'fallback_original',
      qwen3: {
        success: false,
        failureType: failureType,
        error: qwenResult.error,
        retryCount: qwenResult.retryCount || 0,
        durationMs: qwenDuration
      },
      fallback: {
        used: true,
        durationMs: fallbackDuration
      },
      taskType: context.taskType,
      entrySource: context.entrySource,
      scenario: context.scenario,
      totalDurationMs: totalDuration
    });
    
    return {
      route: 'fallback_original',
      qwenFailure: {
        failureType: failureType,
        error: qwenResult.error
      },
      result: fallbackResult
    };
    
  } catch (error) {
    // 异常回退
    grayStats.qwen3Failure++;
    grayStats.fallbackCount++;
    
    const fallbackStart = Date.now();
    const fallbackResult = await originalLogic(input, context);
    const fallbackDuration = Date.now() - fallbackStart;
    grayStats.fallbackTotalDuration += fallbackDuration;
    
    const totalDuration = Date.now() - startTime;
    grayStats.totalDuration += totalDuration;
    
    // 记录日志
    logGrayEvent({
      grayHit: true,
      grayReason: grayDecision.reason,
      route: 'fallback_original',
      qwen3: {
        success: false,
        failureType: 'adapter_exception',
        error: error.message,
        durationMs: Date.now() - startTime
      },
      fallback: {
        used: true,
        durationMs: fallbackDuration
      },
      taskType: context.taskType,
      entrySource: context.entrySource,
      scenario: context.scenario,
      totalDurationMs: totalDuration
    });
    
    return {
      route: 'fallback_original',
      qwenFailure: {
        failureType: 'adapter_exception',
        error: error.message
      },
      result: fallbackResult
    };
  }
}

// ============================================================
// 日志封装
// ============================================================

/**
 * 记录灰度事件
 */
function logGrayEvent(event) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    ...event
  };
  
  // 输出到控制台（JSON 格式，便于日志收集）
  console.log('[Qwen3GrayRoute]', JSON.stringify(logEntry));
}

// ============================================================
// 导出
// ============================================================

module.exports = {
  // 配置
  GRAY_CONFIG,
  
  // 核心函数
  shouldUseQwen3Adapter,
  callQwen3AdapterWithFallback,
  
  // 统计
  getGrayStats,
  resetGrayStats,
  
  // 日志
  logGrayEvent
};
