#!/usr/bin/env node
/**
 * @status EXPERIMENTAL_MODULE
 * @line MAIN_EXPERIMENT_LINE
 * @stage CURRENT_STAGE_TARGET
 * @production false
 * @scope qwen3 local experiment only
 */

/**
 * Qwen3 Shadow Mode Runner - 影子模式运行器
 * 
 * 职责：
 * 1. 判断是否命中 Shadow Mode
 * 2. 调用 qwen3-adapter
 * 3. 捕获所有异常
 * 4. 组装 shadow 记录
 * 5. 调用 logger 落盘
 * 
 * 设计原则：
 * - 原逻辑优先，qwen3 只做旁路记录
 * - qwen3 失败不得影响主流程
 * - 必须可关闭
 * - 必须可统计
 */

const { evaluateWithQwen3Adapter } = require('./qwen3-adapter');
const { logShadowRecord } = require('./qwen3-shadow-logger');
const { runKnowledgeInjectionTrial } = require('../knowledge-injection-trial');

// ============================================================
// Shadow Mode 开关配置
// ============================================================

const SHADOW_CONFIG = {
  // 总开关
  enabled: process.env.QWEN3_SHADOW_MODE_ENABLED === 'true',
  
  // 任务类型白名单
  taskTypes: (process.env.QWEN3_SHADOW_TASK_TYPES || 'quality_evaluation').split(',').map(s => s.trim()),
  
  // 入口白名单（支持 training 和 test_entry）
  entryWhitelist: (process.env.QWEN3_SHADOW_ENTRY_WHITELIST || 'training,test_entry').split(',').map(s => s.trim()),
  
  // 场景白名单
  scenarioWhitelist: (process.env.QWEN3_SHADOW_SCENARIO_WHITELIST || 'transfer_not_received,withdraw_pending,payment_deducted_failed,service_response_poor,info_missing,complex_case').split(',').map(s => s.trim()),
  
  // 最大并发数
  maxConcurrency: parseInt(process.env.QWEN3_SHADOW_MAX_CONCURRENCY || '1', 10),
  
  // 超时时间
  timeoutMs: parseInt(process.env.QWEN3_SHADOW_TIMEOUT_MS || '30000', 10)
};

/**
 * 判断是否命中 Shadow Mode
 * 
 * @param {Object} context - 调用上下文
 * @returns {Object} { hit: boolean, reason: string }
 */
function shouldRunShadow(context = {}) {
  // 1. 检查总开关
  if (!SHADOW_CONFIG.enabled) {
    return { hit: false, reason: 'shadow_mode_disabled' };
  }
  
  const { taskType, entrySource, scenario } = context;
  
  // 2. 检查任务类型
  if (!taskType || !SHADOW_CONFIG.taskTypes.includes(taskType)) {
    return { hit: false, reason: 'taskType_not_whitelisted' };
  }
  
  // 3. 检查入口
  if (!entrySource || !SHADOW_CONFIG.entryWhitelist.includes(entrySource)) {
    return { hit: false, reason: 'entry_not_whitelisted' };
  }
  
  // 4. 检查场景（如果提供了 scenario）
  if (scenario && !SHADOW_CONFIG.scenarioWhitelist.includes(scenario)) {
    return { hit: false, reason: 'scenario_not_whitelisted' };
  }
  
  // 5. 所有条件满足，命中 shadow
  return { hit: true, reason: 'shadow_mode_hit' };
}

/**
 * 运行 Shadow Mode
 * 
 * @param {Object} input - 输入数据
 * @param {Object} context - 调用上下文
 * @param {Object} originalResult - 原逻辑结果
 * @returns {Promise<Object|null>} shadow 结果（包含 dualScore）
 */
async function runQwen3Shadow(input, context, originalResult) {
  const startTime = Date.now();
  
  try {
    // 1. 判断是否命中 shadow
    const shadowDecision = shouldRunShadow(context);
    
    if (!shadowDecision.hit) {
      // 未命中，不记录
      console.log(`[Qwen3ShadowRunner] Shadow 未命中: ${shadowDecision.reason}, context:`, JSON.stringify(context));
      return null;
    }
    
    // 2. 尝试知识注入内部试运行（旁路中的旁路）
    let qwen3Result;
    let knowledgeInjectionUsed = false;
    
    try {
      const trialResult = await runKnowledgeInjectionTrial(
        input,
        context,
        // 原逻辑：直接调用 qwen3-adapter
        async () => {
          return await evaluateWithQwen3Adapter(input, {
            timeoutMs: SHADOW_CONFIG.timeoutMs,
            maxRetries: 0
          });
        }
      );
      
      if (trialResult && trialResult.source === 'knowledge_injection_trial') {
        // 知识注入成功
        knowledgeInjectionUsed = true;
        qwen3Result = {
          success: true,
          data: trialResult.data,
          processed: trialResult.data,
          processedScore: trialResult.data ? {
            qwen_raw_score: trialResult.data.score,
            rule_score: trialResult.data.score,
            base_score: trialResult.data.score,
            deductions: [],
            meta: { knowledge_injected: true }
          } : null,
          retryCount: 0,
          failureType: null
        };
      } else if (trialResult && trialResult.source === 'original_logic') {
        // 回退到原逻辑
        qwen3Result = trialResult;
      } else {
        // 未命中或异常，直接调用 adapter
        qwen3Result = await evaluateWithQwen3Adapter(input, {
          timeoutMs: SHADOW_CONFIG.timeoutMs,
          maxRetries: 0
        });
      }
    } catch (trialError) {
      // 知识注入试运行异常，回退到原逻辑
      console.error('[Qwen3ShadowRunner] 知识注入试运行异常，回退:', trialError.message);
      qwen3Result = await evaluateWithQwen3Adapter(input, {
        timeoutMs: SHADOW_CONFIG.timeoutMs,
        maxRetries: 0
      });
    }
    
    const durationMs = Date.now() - startTime;
    
    // 3. 组装 shadow 记录
    const shadowRecord = {
      timestamp: new Date().toISOString(),
      taskType: context.taskType,
      entrySource: context.entrySource,
      scenario: context.scenario || 'unknown',
      shadowDecision: shadowDecision.reason,
      knowledgeInjection: {
        used: knowledgeInjectionUsed,
        source: knowledgeInjectionUsed ? 'knowledge_injection_trial' : 'qwen3_adapter'
      },
      original: {
        success: originalResult && originalResult.success,
        source: originalResult && originalResult.source ? originalResult.source : 'original_logic',
        // 保存原系统的详细分析结果（如果存在）
        analysisResult: originalResult && originalResult.analysisResult ? {
          score: originalResult.analysisResult.score,
          problem_type: originalResult.analysisResult.problem_type,
          riskLevel: originalResult.analysisResult.riskLevel
        } : null
      },
      qwen3: {
        called: true,
        success: qwen3Result.success,
        failureType: qwen3Result.failureType || null,
        route: qwen3Result.success ? 'qwen3_adapter' : 'shadow_failure',
        retryCount: qwen3Result.retryCount || 0,
        durationMs: durationMs,
        replyRisk: qwen3Result.processed ? qwen3Result.processed.replyRisk : null,
        // 统一 risk_level 映射
        risk_level: qwen3Result.processed ? (
          qwen3Result.processed.replyRisk === 'risky_reply_detected' ? 'high' :
          qwen3Result.processed.replyRisk === 'no_obvious_risk' ? 'low' :
          'medium'
        ) : 'medium'
      },
      data: qwen3Result.data && qwen3Result.data.score != null && qwen3Result.data.problem_type != null ? {
        score: qwen3Result.data.score,
        problem_type: qwen3Result.data.problem_type,
        scenario: qwen3Result.data.scenario
      } : (qwen3Result.processed && qwen3Result.processed.data && qwen3Result.processed.data.score != null && qwen3Result.processed.data.problem_type != null ? {
        // 即使 qwen3Result.success 为 false（如 risky_suggested_reply），
        // 如果 processed.data 有值，也保存用于对比分析
        score: qwen3Result.processed.data.score,
        problem_type: qwen3Result.processed.data.problem_type,
        scenario: qwen3Result.processed.data.scenario
      } : null),
      // 规则化评分数据
      ruleScore: qwen3Result.processedScore ? {
        qwen_raw_score: qwen3Result.processedScore.qwen_raw_score,
        rule_score: qwen3Result.processedScore.rule_score,
        base_score: qwen3Result.processedScore.base_score,
        deductions: qwen3Result.processedScore.deductions,
        meta: qwen3Result.processedScore.meta
      } : null
    };
    
    // 4. 计算双轨评分差值（核心）
    const originalScore = originalResult?.analysisResult?.score ?? null;
    const ruleScore = qwen3Result.processedScore?.rule_score ?? null;
    const qwenRawScore = qwen3Result.processedScore?.qwen_raw_score ?? null;
    
    const scoreGapRule = (ruleScore != null && originalScore != null) ? ruleScore - originalScore : null;
    const scoreGapQwen = (qwenRawScore != null && originalScore != null) ? qwenRawScore - originalScore : null;
    
    // 新增：dualScore 字段
    shadowRecord.dualScore = {
      original_score: originalScore,
      qwen_raw_score: qwenRawScore,
      rule_score: ruleScore,
      score_gap_rule: scoreGapRule,
      score_gap_qwen: scoreGapQwen,
      final_score_source: 'original'
    };
    
    // 5. 调用 logger 落盘（捕获所有异常）
    try {
      logShadowRecord(shadowRecord);
    } catch (loggerError) {
      // logger 异常不影响主流程
      console.error('[Qwen3ShadowRunner] Logger error:', loggerError.message);
    }
    
    // 6. 返回 shadow 结果（包含 dualScore）
    return shadowRecord;
    
  } catch (error) {
    // 最外层捕获，确保不影响主流程
    console.error('[Qwen3ShadowRunner] Unexpected error:', error.message);
    return null;  // 明确返回 null，而不是 undefined
  }
}

/**
 * 导出配置（供测试使用）
 */
function getShadowConfig() {
  return { ...SHADOW_CONFIG };
}

/**
 * 导出开关状态（供测试使用）
 */
function isShadowEnabled() {
  return SHADOW_CONFIG.enabled;
}

// 导出
module.exports = {
  runQwen3Shadow,
  shouldRunShadow,
  getShadowConfig,
  isShadowEnabled,
  SHADOW_CONFIG
};
