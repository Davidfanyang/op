/**
 * 知识注入内部试运行服务
 * 
 * 职责：
 * 1. 判断是否命中内部试运行
 * 2. 调用带知识注入的 Qwen3
 * 3. 记录知识命中日志
 * 4. 失败时回退到原逻辑
 * 
 * 设计原则：
 * - 有总开关
 * - 有范围控制（entry/scenario/project 白名单）
 * - 有回退保护
 * - 有最小日志
 */

const { evaluateWithQwen3Adapter, getLastKnowledgeIds } = require('./local-model/qwen3-adapter');
const { KnowledgeRetrievalService } = require('./knowledge-retrieval-service');

// ============================================================
// 内部试运行开关配置
// ============================================================

const TRIAL_CONFIG = {
  // 总开关
  enabled: process.env.KNOWLEDGE_INJECTION_ENABLED === 'true',
  
  // 入口白名单
  entryWhitelist: (process.env.KNOWLEDGE_INJECTION_ENTRY_WHITELIST || 'training,internal_trial').split(',').map(s => s.trim()),
  
  // 场景白名单
  scenarioWhitelist: (process.env.KNOWLEDGE_INJECTION_SCENARIO_WHITELIST || 'transfer_not_received,withdraw_pending,payment_deducted_failed').split(',').map(s => s.trim()),
  
  // 项目白名单（空表示不限制）
  projectWhitelist: (process.env.KNOWLEDGE_INJECTION_PROJECT_WHITELIST || '').split(',').map(s => s.trim()).filter(s => s),
  
  // 最大知识条数
  maxKnowledgeItems: parseInt(process.env.KNOWLEDGE_INJECTION_MAX_ITEMS || '3', 10)
};

/**
 * 判断是否命中内部试运行
 * 
 * @param {Object} context - 调用上下文
 * @param {string} context.entrySource - 入口来源
 * @param {string} context.scenario - 场景标识
 * @param {string} context.projectId - 项目标识
 * @returns {Object} { hit: boolean, reason: string }
 */
function shouldRunTrial(context = {}) {
  // 1. 检查总开关
  if (!TRIAL_CONFIG.enabled) {
    return { hit: false, reason: 'trial_disabled' };
  }
  
  const { entrySource, scenario, projectId } = context;
  
  // 2. 检查入口白名单
  if (!entrySource || !TRIAL_CONFIG.entryWhitelist.includes(entrySource)) {
    return { hit: false, reason: 'entry_not_whitelisted' };
  }
  
  // 3. 检查场景白名单（如果提供了 scenario）
  if (scenario && !TRIAL_CONFIG.scenarioWhitelist.includes(scenario)) {
    return { hit: false, reason: 'scenario_not_whitelisted' };
  }
  
  // 4. 检查项目白名单（如果配置了）
  if (TRIAL_CONFIG.projectWhitelist.length > 0) {
    if (!projectId || !TRIAL_CONFIG.projectWhitelist.includes(projectId)) {
      return { hit: false, reason: 'project_not_whitelisted' };
    }
  }
  
  // 5. 所有条件满足，命中内部试运行
  return { hit: true, reason: 'trial_hit' };
}

/**
 * 运行知识注入回答（带回退保护）
 * 
 * @param {Object} input - 输入数据
 * @param {string} input.conversationText - 对话文本
 * @param {string} input.scenario - 场景标识
 * @param {string} input.projectId - 项目标识
 * @param {Object} context - 调用上下文
 * @param {Function} originalLogic - 原逻辑函数（回退用）
 * @returns {Promise<Object>} 统一结果
 */
async function runKnowledgeInjectionTrial(input, context, originalLogic) {
  const startTime = Date.now();
  
  // 1. 判断是否命中内部试运行
  const trialDecision = shouldRunTrial(context);
  
  if (!trialDecision.hit) {
    // 未命中，直接走原逻辑
    console.log(`[KnowledgeInjectionTrial] 未命中内部试运行: ${trialDecision.reason}, context:`, JSON.stringify(context));
    
    if (originalLogic) {
      return await originalLogic(input, context);
    }
    
    return null;
  }
  
  console.log(`[KnowledgeInjectionTrial] 命中内部试运行: ${trialDecision.reason}`);
  
  // 2. 尝试调用带知识注入的 Qwen3
  try {
    const qwenResult = await evaluateWithQwen3Adapter(input, {
      timeoutMs: 60000,
      maxRetries: 0  // 试运行不重试
    });
    
    const durationMs = Date.now() - startTime;
    
    // 3. 记录知识命中日志
    const knowledgeIds = getLastKnowledgeIds() || [];
    const knowledgeHitCount = knowledgeIds.length;
    
    const logEntry = {
      timestamp: new Date().toISOString(),
      entry_source: context.entrySource || 'unknown',
      scenario: context.scenario || 'unknown',
      project_id: context.projectId || 'unknown',
      knowledge_hit_count: knowledgeHitCount,
      knowledge_ids: knowledgeIds,
      injected: qwenResult.success,
      fallback: !qwenResult.success,
      duration_ms: durationMs,
      success: qwenResult.success,
      failure_type: qwenResult.failureType
    };
    
    console.log('[KnowledgeInjectionTrial] 命中日志:', JSON.stringify(logEntry));
    
    // 4. 如果成功，返回 Qwen3 结果
    if (qwenResult.success) {
      return {
        success: true,
        source: 'knowledge_injection_trial',
        data: qwenResult.data,
        knowledgeInjected: true,
        durationMs
      };
    }
    
    // 5. 如果失败，回退到原逻辑
    console.warn('[KnowledgeInjectionTrial] 知识注入失败，回退到原逻辑:', qwenResult.failureType);
    
    logEntry.fallback = true;
    logEntry.fallback_reason = qwenResult.failureType;
    console.log('[KnowledgeInjectionTrial] 回退日志:', JSON.stringify(logEntry));
    
    if (originalLogic) {
      return await originalLogic(input, context);
    }
    
    return {
      success: false,
      source: 'fallback',
      error: qwenResult.failureType
    };
    
  } catch (error) {
    // 6. 异常回退
    console.error('[KnowledgeInjectionTrial] 知识注入异常，回退到原逻辑:', error.message);
    
    if (originalLogic) {
      return await originalLogic(input, context);
    }
    
    return {
      success: false,
      source: 'fallback',
      error: error.message
    };
  }
}

/**
 * 获取试运行配置（用于调试）
 */
function getTrialConfig() {
  return TRIAL_CONFIG;
}

// 导出
module.exports = {
  runKnowledgeInjectionTrial,
  shouldRunTrial,
  getTrialConfig
};
