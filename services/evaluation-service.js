/**
 * 评估服务层 v4.1 - 对话分析统一入口
 * 
 * 职责：
 * 1. 组织对话分析流程
 * 2. 支持多轮对话上下文
 * 3. 统一调用 trainer 主链 (analyzeTurn / analyzeConversation)
 * 4. 支持 training 和 live_monitor 两种模式
 * 5. 模式分流：training → training_queue, live_monitor → supervisor_group
 * 
 * 协议版本: v1.0（标准协议）
 * - 使用 projectId/project 字段（向后兼容）
 * - 使用 mode/metadata.entry_type 字段（向后兼容）
 * - 使用 currentReply/current_reply 字段（向后兼容）
 * - conversation 使用标准格式 [{role: "user"|"agent", content: string}]
 * - rules 字段已纳入标准协议
 */

const { analyzeTurn, analyzeConversation } = require('../core/trainer');
const { matchScenario, getScenarioById } = require('../core/scenario-loader');
const { recordEvaluation } = require('../core/gray-collector');
const {
  EvaluationStatus,
  AlertLevel,
  ReviewStatus,
  StatusFlow
} = require('../core/constants/statuses');

/**
 * 模式分流配置
 */
const ALERT_CONFIG = {
  training: {
    enabled: process.env.TRAINING_ALERT_ENABLED !== 'false',
    threshold: parseInt(process.env.TRAINING_ALERT_THRESHOLD) || 30,
    channel: process.env.TRAINING_ALERT_CHANNEL || 'training_queue'
  },
  live_monitor: {
    enabled: process.env.LIVE_MONITOR_ALERT_ENABLED !== 'false',
    threshold: parseInt(process.env.LIVE_MONITOR_ALERT_THRESHOLD) || 40,
    channel: process.env.LIVE_MONITOR_ALERT_CHANNEL || 'supervisor_group'
  }
};

/**
 * 统一对话分析接口
 * @param {Object} params - 分析参数
 * @param {string} params.projectId - 项目ID
 * @param {string} params.mode - 模式 ('training' | 'live_monitor')
 * @param {string} params.scenarioId - 场景ID (training模式必填)
 * @param {Array} params.conversation - 完整对话历史
 * @param {string} params.currentReply - 当前客服回复(待分析)
 * @param {string} params.customerMessage - 客户消息 (live_monitor模式用于自动匹配场景)
 * @param {Object} params.metadata - 元数据
 * @returns {Promise<Object>} 标准分析结果
 */
async function evaluate(params) {
  // 1. 输入校验
  const validation = validateInput(params);
  if (!validation.valid) {
    return createErrorResult('invalid_input', validation.error, params);
  }

  // 2. 根据模式处理场景
  let scenarioId = params.scenarioId;
  let matchedScenario = null;
  let matchConfidence = null;
  let matchWarning = null;
  
  if (params.mode === 'live_monitor') {
    // live_monitor 模式：自动匹配场景
    const customerMessage = params.customerMessage || params.metadata?.customerMessage;
    if (customerMessage && !params.scenarioId) {
      const matchResult = matchScenario(customerMessage, params.projectId);
      matchedScenario = matchResult.scenario;
      matchConfidence = matchResult.confidence;
      matchWarning = matchResult.warning || null;
      
      if (matchResult.matchType === 'low_confidence') {
        return createErrorResult(
          'scenario_match_low_confidence',
          `匹配置信度过低 (${(matchConfidence * 100).toFixed(1)}%)，请人工确认场景或提供明确的 scenarioId`,
          params
        );
      }
      
      if (matchedScenario) {
        scenarioId = matchedScenario.id;
      }
    }
    
    if (!scenarioId) {
      return createErrorResult('scenario_not_found', '无法匹配场景，请提供 customerMessage 或 scenarioId', params);
    }
  }

  // 3. 组织调用 trainer 主链（使用标准协议，向后兼容）
  try {
    // 标准化 conversation 格式
    const normalizedConversation = (params.conversation || []).map(turn => ({
      role: turn.role === 'customer' ? 'user' : (turn.role || 'unknown'),
      content: turn.content || turn.text || '',
      _meta: turn.turnIndex !== undefined || turn.ts || turn.timestamp ? {
        turnIndex: turn.turnIndex,
        ts: turn.ts || turn.timestamp
      } : undefined
    })).filter(turn => turn.role && turn.content);

    const trainerInput = {
      // 向后兼容：支持 projectId 和 project
      projectId: params.projectId,
      project: params.project,
      
      // 向后兼容：支持 mode 和 metadata.entry_type
      mode: params.mode,
      metadata: {
        ...(params.metadata || {}),
        entry_type: params.metadata?.entry_type || params.mode
      },
      
      // conversation 使用标准格式
      conversation: normalizedConversation,
      
      // 向后兼容：支持 currentReply 和 current_reply
      currentReply: params.currentReply,
      current_reply: params.current_reply,
      
      // 场景标识
      scenarioId: scenarioId,
      
      // rules 字段（可选，协议适配层会自动加载）
      rules: params.rules || {}
    };

    const result = await analyzeTurn(trainerInput);
    
    // 4. 计算告警等级(基于 riskLevel)
    result.alerts = checkAlerts(result, params.mode);
    result.scenarioId = scenarioId;
    
    // live_monitor 模式额外添加匹配信息
    if (params.mode === 'live_monitor') {
      result.matchedScenario = matchedScenario ? {
        id: matchedScenario.id,
        title: matchedScenario.title,
        customerMessage: matchedScenario.customerMessage
      } : null;
      result.matchConfidence = matchConfidence;
      result.matchWarning = matchWarning;
    }
    
    // 5. 确保输出符合标准 schema
    const normalized = normalizeResult(result, params);
    
    // 6. 灰度数据收集（仅 live_monitor）
    if (params.mode === 'live_monitor') {
      recordEvaluation({
        projectId: params.projectId,
        scenarioId: normalized.scenarioId,
        alertLevel: normalized.alertLevel,
        alerts: normalized.alerts,
        reviewStatus: normalized.reviewStatus,
        riskLevel: normalized.riskLevel,
        level: normalized.result.level,
        customerMessage: params.customerMessage,
        userReply: params.currentReply,
        metadata: params.metadata
      });
    }
    
    // 7. 模式分流：根据配置决定通知出口
    await routeAlert(normalized, params);
    
    return normalized;
    
  } catch (error) {
    // 区分错误类型
    if (error.message.includes('未找到场景')) {
      return createErrorResult('scenario_not_found', error.message, params);
    }
    if (error.message.includes('INVALID_SCENARIO')) {
      return createErrorResult('invalid_scenario_format', error.message, params);
    }
    return createErrorResult('analysis_failed', error.message, params);
  }
}

/**
 * 分析完整对话(多轮)
 */
async function evaluateConversation(params) {
  const validation = validateConversationInput(params);
  if (!validation.valid) {
    return createErrorResult('invalid_input', validation.error, params);
  }

  try {
    // 标准化 conversation 格式
    const normalizedConversation = (params.conversation || []).map(turn => ({
      role: turn.role === 'customer' ? 'user' : (turn.role || 'unknown'),
      content: turn.content || turn.text || '',
      _meta: turn.turnIndex !== undefined || turn.ts || turn.timestamp ? {
        turnIndex: turn.turnIndex,
        ts: turn.ts || turn.timestamp
      } : undefined
    })).filter(turn => turn.role && turn.content);

    const result = await analyzeConversation({
      // 向后兼容：支持 projectId 和 project
      projectId: params.projectId,
      project: params.project,
      
      // 向后兼容：支持 mode 和 metadata.entry_type
      mode: params.mode,
      metadata: {
        ...(params.metadata || {}),
        entry_type: params.metadata?.entry_type || params.mode
      },
      
      // conversation 使用标准格式
      conversation: normalizedConversation,
      
      // 场景标识
      scenarioId: params.scenarioId,
      
      // rules 字段
      rules: params.rules || {}
    });

    return result;
  } catch (error) {
    return createErrorResult('analysis_failed', error.message, params);
  }
}

/**
 * 输入校验（向后兼容）
 */
function validateInput(params) {
  if (!params || typeof params !== 'object') {
    return { valid: false, error: '参数必须是对象' };
  }

  // 向后兼容：支持 projectId 和 project
  const hasProject = params.projectId || params.project;
  const hasMode = params.mode || params.metadata?.entry_type;
  const hasCurrentReply = params.currentReply || params.current_reply;
  
  const required = [hasProject, hasMode, params.conversation, hasCurrentReply];
  const missing = required.filter(x => !x);
  
  if (missing.length > 0) {
    return { valid: false, error: `缺少必要字段: projectId/project, mode/entry_type, conversation, currentReply/current_reply` };
  }

  if (!Array.isArray(params.conversation)) {
    return { valid: false, error: 'conversation 必须是数组' };
  }

  const validModes = ['training', 'live_monitor'];
  if (!validModes.includes(hasMode)) {
    return { valid: false, error: `mode 必须是: ${validModes.join(' | ')}` };
  }

  if (hasMode === 'training' && !params.scenarioId) {
    return { valid: false, error: 'training 模式必须提供 scenarioId' };
  }

  if (hasMode === 'live_monitor' && !params.scenarioId && !params.customerMessage && !params.metadata?.customerMessage) {
    return { valid: false, error: 'live_monitor 模式必须提供 scenarioId 或 customerMessage' };
  }

  return { valid: true };
}

/**
 * 完整对话输入校验
 */
function validateConversationInput(params) {
  if (!params || typeof params !== 'object') {
    return { valid: false, error: '参数必须是对象' };
  }

  const required = ['projectId', 'mode', 'scenarioId', 'conversation'];
  const missing = required.filter(key => !params[key]);
  
  if (missing.length > 0) {
    return { valid: false, error: `缺少必要字段: ${missing.join(', ')}` };
  }

  if (!Array.isArray(params.conversation)) {
    return { valid: false, error: 'conversation 必须是数组' };
  }

  return { valid: true };
}

/**
 * 告警检查 - 基于 riskLevel
 * 
 * TODO: 职责错位检查
 * 本函数包含告警判断逻辑，理论上应归属于 core/alert-router.js
 * 当前保留在 services 层是因为：
 * 1. 需要适配不同的模式（training vs live_monitor）
 * 2. 告警阈值可能因业务需求调整
 * 建议后续迁移到 core 层，services 仅调用
 */
function checkAlerts(result, mode = 'live_monitor') {
  const alerts = [];
  const riskLevel = result.riskLevel || 'none';
  const level = result.result?.level || 'fail';
  
  // 基于 riskLevel 的告警
  if (riskLevel === 'high') {
    alerts.push({
      level: AlertLevel.CRITICAL,
      type: 'high_risk',
      message: '回复存在高风险，不建议发送',
      riskLevel
    });
  } else if (riskLevel === 'medium') {
    alerts.push({
      level: AlertLevel.WARNING,
      type: 'medium_risk',
      message: '回复存在中等风险，建议修改后发送',
      riskLevel
    });
  } else if (riskLevel === 'low') {
    alerts.push({
      level: AlertLevel.OBSERVATION,
      type: 'low_risk',
      message: '回复存在轻微问题，可优化',
      riskLevel
    });
  }
  
  // 基于 level 的告警
  if (level === 'risk') {
    alerts.push({
      level: AlertLevel.CRITICAL,
      type: 'level_risk',
      message: '分析等级为 risk，需人工审核',
      level
    });
  } else if (level === 'fail') {
    alerts.push({
      level: AlertLevel.WARNING,
      type: 'level_fail',
      message: '分析等级为 fail，需要改进',
      level
    });
  }
  
  return alerts;
}

/**
 * 计算 alertLevel 四档
 * 
 * TODO: 职责错位检查
 * 本函数负责告警等级计算，属于判断逻辑
 * 建议后续与 checkAlerts 一起迁移到 core/alert-router.js
 */
function calculateAlertLevel(alerts) {
  if (!alerts || alerts.length === 0) {
    return AlertLevel.NONE;
  }
  
  const levels = alerts.map(a => a.level);
  
  if (levels.includes(AlertLevel.CRITICAL)) {
    return AlertLevel.CRITICAL;
  }
  if (levels.includes(AlertLevel.WARNING)) {
    return AlertLevel.WARNING;
  }
  if (levels.includes(AlertLevel.OBSERVATION)) {
    return AlertLevel.OBSERVATION;
  }
  
  return AlertLevel.NONE;
}

/**
 * 创建错误结果
 */
function createErrorResult(status, errorMessage, params = {}) {
  const now = new Date().toISOString();
  
  let evaluationStatus, alertLevel, reviewStatus;
  
  switch (status) {
    case 'invalid_input':
      evaluationStatus = EvaluationStatus.INVALID_INPUT;
      alertLevel = AlertLevel.NONE;
      break;
    case 'scenario_not_found':
      evaluationStatus = EvaluationStatus.SCENARIO_NOT_FOUND;
      alertLevel = AlertLevel.NONE;
      break;
    case 'scenario_match_low_confidence':
      evaluationStatus = EvaluationStatus.SCENARIO_MATCH_LOW_CONFIDENCE;
      alertLevel = AlertLevel.NONE;
      break;
    case 'invalid_scenario_format':
      evaluationStatus = EvaluationStatus.INVALID_INPUT;
      alertLevel = AlertLevel.NONE;
      break;
    case 'analysis_failed':
      evaluationStatus = EvaluationStatus.EVALUATION_FAILED;
      alertLevel = AlertLevel.NONE;
      break;
    default:
      evaluationStatus = EvaluationStatus.EVALUATION_FAILED;
      alertLevel = AlertLevel.NONE;
  }
  
  reviewStatus = ReviewStatus.PENDING;
  
  return {
    status: evaluationStatus,
    evaluationStatus,
    alertLevel,
    reviewStatus,
    
    projectId: params.projectId || null,
    mode: params.mode || null,
    sessionId: params.metadata?.sessionId || null,
    employeeId: params.metadata?.employeeId || null,
    
    scenarioId: null,
    matchedScenarioId: null,
    matchConfidence: null,
    
    customerMessage: params.customerMessage || params.metadata?.customerMessage || null,
    currentReply: params.currentReply || null,
    
    result: {
      level: 'fail',
      issues: [{
        code: status.toUpperCase(),
        severity: 'high',
        message: errorMessage,
        type: 'system_error',
        expected: '正常分析流程',
        actual: status
      }],
      missing: [],
      nextAction: '请检查输入参数或场景配置'
    },
    coachSummary: `系统错误: ${errorMessage}`,
    riskLevel: 'high',
    alerts: [],
    
    reviewedBy: null,
    reviewedAt: null,
    reviewComment: '',
    falsePositiveReason: null,
    
    createdAt: now,
    updatedAt: now,
    meta: {
      analyzerVersion: 'v4.0',
      source: 'evaluation-service',
      timestamp: now,
      error: errorMessage
    }
  };
}

/**
 * 标准化结果
 */
function normalizeResult(result, params) {
  const mode = params.mode;
  const alerts = result.alerts || [];
  const alertLevel = calculateAlertLevel(alerts);
  const now = new Date().toISOString();
  
  const evaluationStatus = alertLevel !== AlertLevel.NONE 
    ? EvaluationStatus.ALERT_TRIGGERED 
    : EvaluationStatus.OK;
  
  const normalized = {
    status: evaluationStatus,
    evaluationStatus,
    alertLevel,
    reviewStatus: ReviewStatus.PENDING,
    
    projectId: params.projectId,
    mode: params.mode,
    sessionId: params.metadata?.sessionId || null,
    employeeId: params.metadata?.employeeId || null,
    
    scenarioId: result.scenarioId || params.scenarioId,
    matchedScenarioId: result.matchedScenario?.id || null,
    matchConfidence: result.matchConfidence || null,
    
    customerMessage: params.customerMessage || params.metadata?.customerMessage || null,
    currentReply: params.currentReply,
    
    // 新增字段
    scenario: result.scenario,
    stage: result.stage,
    result: result.result,
    coachSummary: result.coachSummary,
    riskLevel: result.riskLevel,
    
    reviewedBy: null,
    reviewedAt: null,
    reviewComment: '',
    falsePositiveReason: null,
    
    createdAt: now,
    updatedAt: now,
    
    grayRelease: {
      isGrayMode: true,
      phase: 'pilot',
      disclaimer: '灰度测试数据，不作为处罚依据',
      startDate: now
    },
    
    meta: {
      analyzerVersion: result.meta?.analyzerVersion || 'v4.0',
      source: result.meta?.source || 'unknown',
      timestamp: now,
      ...result.meta
    }
  };

  normalized.alerts = alerts;
  
  if (mode === 'live_monitor') {
    normalized.matchedScenario = result.matchedScenario || null;
    normalized.matchWarning = result.matchWarning || null;
  }

  return normalized;
}

/**
 * 模式分流
 */
async function routeAlert(result, params) {
  const mode = params.mode;
  const config = ALERT_CONFIG[mode];
  
  if (!config || !config.enabled) {
    console.log(`[AlertRouter] ${mode} 模式告警已禁用`);
    return;
  }
  
  const riskLevel = result.riskLevel || 'none';
  const shouldAlert = riskLevel === 'high' || riskLevel === 'medium';
  
  if (!shouldAlert) {
    console.log(`[AlertRouter] ${mode} 模式风险等级 ${riskLevel}，不触发告警`);
    return;
  }
  
  console.log(`[AlertRouter] ${mode} 模式风险等级 ${riskLevel}，触发告警，出口: ${config.channel}`);
  
  switch (config.channel) {
    case 'training_queue':
      console.log(`[AlertRouter] 进入训练监督队列: ${result.sessionId || 'unknown'}`);
      await createReviewForTraining(result, params);
      break;
      
    case 'supervisor_group':
      console.log(`[AlertRouter] 推送到主管群: ${result.sessionId || 'unknown'}`);
      await createReviewAndAlert(result, params);
      break;
      
    case 'both':
      console.log(`[AlertRouter] 同时进入训练队列和主管群: ${result.sessionId || 'unknown'}`);
      await createReviewForTraining(result, params);
      await createReviewAndAlert(result, params);
      break;
      
    default:
      console.warn(`[AlertRouter] 未知的 channel 配置: ${config.channel}`);
  }
}

async function createReviewForTraining(result, params) {
  try {
    const { RepositoryFactory } = require('../repositories');
    const repos = RepositoryFactory.getMySQLRepositories();
    
    const reviewData = {
      projectId: params.projectId,
      mode: 'training',
      sessionId: params.metadata?.sessionId || result.sessionId,
      messageId: params.metadata?.messageId,
      evaluationId: result.evaluationId,
      alertLevel: result.alertLevel,
      reviewStatus: 'pending',
      createdBy: 'system'
    };
    
    await repos.review.create(reviewData);
    console.log(`[AlertRouter] Training review created: ${reviewData.sessionId}`);
  } catch (error) {
    console.error('[AlertRouter] 创建 training review 失败:', error.message);
  }
}

async function createReviewAndAlert(result, params) {
  try {
    const { RepositoryFactory } = require('../repositories');
    const repos = RepositoryFactory.getMySQLRepositories();
    const { TelegramAlerter } = require('../adapters/alerts/telegram-alert');
    
    const reviewData = {
      projectId: params.projectId,
      mode: 'live_monitor',
      sessionId: params.metadata?.sessionId || result.sessionId,
      messageId: params.metadata?.messageId,
      evaluationId: result.evaluationId,
      alertLevel: result.alertLevel,
      reviewStatus: 'pending',
      createdBy: 'system'
    };
    
    await repos.review.create(reviewData);
    console.log(`[AlertRouter] Live monitor review created: ${reviewData.sessionId}`);
    
    const alerter = new TelegramAlerter();
    await alerter.sendAlert(result);
    console.log(`[AlertRouter] Telegram alert sent`);
  } catch (error) {
    console.error('[AlertRouter] 创建 review 或发送告警失败:', error.message);
  }
}



module.exports = {
  evaluate,
  evaluateConversation,
  EvaluationStatus,
  AlertLevel,
  ReviewStatus,
  ALERT_CONFIG
};

