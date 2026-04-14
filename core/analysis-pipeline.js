/**
 * Analysis Pipeline v5.0 - 对话分析核心主链
 * 
 * 新架构:
 * loadScenario -> detectScenario -> detectStage -> checkCurrentReply -> analyzeGaps -> buildFeedback
 * 
 * 核心变更:
 * - 完全移除 score pipeline
 * - 纯分析管道，无分数计算
 * - 严格遵循新输入输出 schema
 */

const { getScenarioById } = require('./scenario-loader');
const { detectStage } = require('./stage-detector');
const { checkReplyQuality, checkExpectedActions } = require('./dialogue-checker');
const { analyzeGap, generateCoachSummary } = require('./gap-analyzer');

/**
 * 分析单轮对话 - 新主入口
 * 
 * @param {Object} input - 输入参数
 * @param {string} input.projectId - 项目ID
 * @param {string} input.mode - 模式: "training" | "live_monitor"
 * @param {Array} input.conversation - 对话历史
 * @param {string} input.conversation[].role - 角色: "customer" | "agent"
 * @param {string} input.conversation[].text - 文本内容
 * @param {string} [input.conversation[].ts] - 时间戳(可选)
 * @param {string} input.currentReply - 当前客服回复(待分析)
 * @param {Object} [input.metadata] - 元数据(可选)
 * 
 * @returns {Promise<Object>} 分析结果
 * @returns {string} return.scenarioId - 场景ID
 * @returns {string} return.scenarioName - 场景名称
 * @returns {string} return.stage - 当前阶段
 * @returns {string} return.result - "pass" | "borderline" | "fail" | "risk"
 * @returns {string} return.riskLevel - "none" | "low" | "medium" | "high" | "critical"
 * @returns {Array<string>} return.issues - 问题列表
 * @returns {Array<string>} return.missing - 缺失信息
 * @returns {Array<string>} return.strengths - 优势列表
 * @returns {string} return.nextAction - 下一步建议
 * @returns {string} return.coachSummary - 教练总结
 * @returns {number} return.confidence - 置信度 (0-1)
 * @returns {string} [return.reviewStatus] - 审核状态: "pending" | "auto_pass" | "needs_review"
 */
async function analyzeTurn(input) {
  // 1. 校验输入
  validateAnalyzeTurnInput(input);

  const { projectId, mode, conversation, currentReply, metadata = {} } = input;

  // 2. 标准化对话格式(兼容 text/content 字段)
  const normalizedConversation = normalizeConversation(conversation);

  // 3. 加载场景
  const scenario = loadScenario(normalizedConversation, metadata);

  // 4. 检测场景匹配
  const scenarioDetection = detectScenario(scenario, normalizedConversation);

  // 5. 检测当前阶段
  const stageResult = detectStage(scenario, normalizedConversation);

  // 6. 检查当前回复
  const replyCheck = checkCurrentReply(currentReply, stageResult, scenario);

  // 7. 分析差距
  const gapAnalysis = analyzeGaps(replyCheck, stageResult, scenario);

  // 8. 构建反馈
  const feedback = buildFeedback(gapAnalysis, stageResult, scenario, mode);

  // 9. 注入元数据
  feedback.projectId = projectId;
  feedback.meta = {
    mode,
    timestamp: new Date().toISOString(),
    conversationTurns: normalizedConversation.length,
    ...metadata
  };

  return feedback;
}

/**
 * 分析完整对话(多轮)
 * 
 * @param {Object} input - 输入参数
 * @param {string} input.projectId - 项目ID
 * @param {string} input.mode - 模式
 * @param {Array} input.conversation - 完整对话历史
 * @param {Object} [input.metadata] - 元数据
 * 
 * @returns {Promise<Object>} 对话整体分析结果
 */
async function analyzeConversation(input) {
  validateAnalyzeConversationInput(input);

  const { projectId, mode, conversation, metadata = {} } = input;

  // 标准化对话
  const normalizedConversation = normalizeConversation(conversation);

  // 加载场景
  const scenario = loadScenario(normalizedConversation, metadata);

  // 提取所有客服回复
  const agentTurns = normalizedConversation
    .map((turn, index) => ({ ...turn, originalIndex: index }))
    .filter(turn => turn.role === 'agent');

  // 分析每一轮客服回复
  const turnAnalyses = [];
  for (let i = 0; i < agentTurns.length; i++) {
    const agentTurn = agentTurns[i];
    const conversationUpToNow = normalizedConversation.slice(0, agentTurn.originalIndex + 1);

    const turnResult = await analyzeTurn({
      projectId,
      mode,
      conversation: conversationUpToNow,
      currentReply: agentTurn.text,
      metadata: { ...metadata, turnIndex: i }
    });

    turnAnalyses.push({
      turnIndex: agentTurn.originalIndex,
      turnNumber: i + 1,
      ...turnResult
    });
  }

  // 计算整体统计
  const overallStats = calculateOverallStats(turnAnalyses);

  return {
    projectId,
    mode,
    scenarioId: turnAnalyses[0]?.scenarioId || 'unknown',
    scenarioName: turnAnalyses[0]?.scenarioName || '未知场景',
    turns: turnAnalyses,
    overall: overallStats,
    meta: {
      timestamp: new Date().toISOString(),
      totalTurns: normalizedConversation.length,
      agentTurns: agentTurns.length,
      ...metadata
    }
  };
}

/**
 * 加载场景
 */
function loadScenario(conversation, metadata) {
  // 优先从 metadata 获取 scenarioId
  if (metadata.scenarioId) {
    const scenario = getScenarioById(metadata.scenarioId);
    if (scenario) return scenario;
  }

  // 否则从对话中检测场景(基于关键词)
  const customerMessages = conversation
    .filter(turn => turn.role === 'customer')
    .map(turn => turn.text.toLowerCase())
    .join(' ');

  // 遍历所有场景找匹配
  const allScenarios = require('./scenario-loader').loadAllScenarios();
  
  for (const scenario of allScenarios) {
    if (scenario.stages && scenario.stages.length > 0) {
      // 检查场景关键词是否匹配
      const keywords = extractScenarioKeywords(scenario);
      const hasMatch = keywords.some(kw => customerMessages.includes(kw.toLowerCase()));
      if (hasMatch) {
        return scenario;
      }
    }
  }

  // 兜底: 返回第一个有 stages 的场景
  const firstValidScenario = allScenarios.find(s => s.stages && s.stages.length > 0);
  if (firstValidScenario) {
    return firstValidScenario;
  }

  throw new Error('SCENARIO_NOT_FOUND: 未找到可用的场景规则');
}

/**
 * 检测场景匹配
 */
function detectScenario(scenario, conversation) {
  const customerMessages = conversation
    .filter(turn => turn.role === 'customer')
    .map(turn => turn.text.toLowerCase())
    .join(' ');

  const keywords = extractScenarioKeywords(scenario);
  const matchedKeywords = keywords.filter(kw => 
    customerMessages.includes(kw.toLowerCase())
  );

  return {
    scenarioId: scenario.id,
    scenarioName: scenario.title,
    matchedKeywords,
    confidence: matchedKeywords.length / Math.max(keywords.length, 1)
  };
}

/**
 * 检查当前回复
 */
function checkCurrentReply(currentReply, stageResult, scenario) {
  const currentStage = stageResult.stage;
  const globalRules = scenario.globalRules || {};

  // 1. 检查回复质量
  const qualityCheck = checkReplyQuality(currentReply, currentStage, globalRules);

  // 2. 检查期望动作
  const actionCheck = checkExpectedActions(currentReply, currentStage.expectedActions || []);

  return {
    reply: currentReply,
    quality: qualityCheck,
    actions: actionCheck,
    stage: currentStage
  };
}

/**
 * 分析差距
 */
function analyzeGaps(replyCheck, stageResult, scenario) {
  const gapAnalysis = analyzeGap(
    replyCheck.quality,
    replyCheck.actions,
    replyCheck.stage,
    replyCheck.reply
  );

  // 提取优势
  const strengths = extractStrengths(replyCheck, stageResult);

  // 计算置信度
  const confidence = calculateConfidence(gapAnalysis, replyCheck);

  return {
    ...gapAnalysis,
    strengths,
    confidence
  };
}

/**
 * 构建反馈
 */
function buildFeedback(gapAnalysis, stageResult, scenario, mode) {
  const coachSummary = generateCoachSummary(gapAnalysis, stageResult.stage, gapAnalysis.reply || '');

  // 确定审核状态
  const reviewStatus = determineReviewStatus(gapAnalysis, mode);

  return {
    scenarioId: scenario.id,
    scenarioName: scenario.title,
    stage: stageResult.stage.name,
    result: gapAnalysis.level,
    riskLevel: normalizeRiskLevel(gapAnalysis.riskLevel),
    issues: gapAnalysis.issues.map(issue => issue.message || issue),
    missing: gapAnalysis.missing,
    strengths: gapAnalysis.strengths,
    nextAction: gapAnalysis.nextAction,
    coachSummary,
    confidence: gapAnalysis.confidence,
    reviewStatus
  };
}

/**
 * 提取场景关键词
 */
function extractScenarioKeywords(scenario) {
  const keywords = [];
  
  if (scenario.stages) {
    scenario.stages.forEach(stage => {
      if (stage.trigger && stage.trigger.customerIntent) {
        keywords.push(...stage.trigger.customerIntent);
      }
      if (stage.mustInclude) {
        keywords.push(...stage.mustInclude);
      }
    });
  }

  return [...new Set(keywords)]; // 去重
}

/**
 * 提取优势
 */
function extractStrengths(replyCheck, stageResult) {
  const strengths = [];
  const currentStage = stageResult.stage;

  // 检查是否包含所有必须信息
  if (replyCheck.quality.issues.filter(i => i.type === 'missing_info').length === 0) {
    strengths.push('包含所有必要信息');
  }

  // 检查是否包含禁忌内容
  if (replyCheck.quality.issues.filter(i => i.type === 'forbidden_content').length === 0) {
    strengths.push('未使用禁忌表达');
  }

  // 检查期望动作完成度
  if (replyCheck.actions.matched && replyCheck.actions.matched.length > 0) {
    strengths.push(`完成期望动作: ${replyCheck.actions.matched.join('、')}`);
  }

  // 检查回复长度
  if (replyCheck.reply && replyCheck.reply.length >= 20) {
    strengths.push('回复详实充分');
  }

  return strengths;
}

/**
 * 计算置信度
 */
function calculateConfidence(gapAnalysis, replyCheck) {
  let confidence = 0.8; // 基础置信度

  // 根据问题数量调整
  const issueCount = gapAnalysis.issues.length;
  if (issueCount === 0) {
    confidence = 0.95;
  } else if (issueCount <= 2) {
    confidence = 0.85;
  } else if (issueCount <= 4) {
    confidence = 0.7;
  } else {
    confidence = 0.5;
  }

  // 根据匹配方式调整
  if (replyCheck.stage && replyCheck.stage.matchedBy === 'turn_index') {
    confidence += 0.05; // turnIndex匹配更准确
  }

  return Math.min(confidence, 1.0);
}

/**
 * 确定审核状态
 */
function determineReviewStatus(gapAnalysis, mode) {
  const level = gapAnalysis.level;
  const riskLevel = gapAnalysis.riskLevel;

  // training 模式
  if (mode === 'training') {
    if (level === 'pass' && riskLevel === 'none') {
      return 'auto_pass';
    }
    if (level === 'risk' || riskLevel === 'high' || riskLevel === 'critical') {
      return 'needs_review';
    }
    return 'pending';
  }

  // live_monitor 模式
  if (level === 'pass') {
    return 'auto_pass';
  }
  if (level === 'risk' || riskLevel === 'critical') {
    return 'needs_review';
  }

  return 'pending';
}

/**
 * 标准化风险等级
 */
function normalizeRiskLevel(riskLevel) {
  const riskMap = {
    'none': 'none',
    'low': 'low',
    'medium': 'medium',
    'high': 'high',
    'critical': 'critical'
  };

  return riskMap[riskLevel] || 'low';
}

/**
 * 计算整体统计
 */
function calculateOverallStats(turnAnalyses) {
  if (turnAnalyses.length === 0) {
    return { totalTurns: 0, levelDistribution: {}, avgConfidence: 0 };
  }

  const levelDistribution = {
    pass: 0,
    borderline: 0,
    fail: 0,
    risk: 0
  };

  let totalConfidence = 0;
  const allIssues = [];
  const allStrengths = [];

  turnAnalyses.forEach(turn => {
    levelDistribution[turn.result] = (levelDistribution[turn.result] || 0) + 1;
    totalConfidence += turn.confidence || 0;
    allIssues.push(...turn.issues);
    allStrengths.push(...turn.strengths);
  });

  return {
    totalTurns: turnAnalyses.length,
    levelDistribution,
    avgConfidence: totalConfidence / turnAnalyses.length,
    totalIssues: allIssues.length,
    totalStrengths: allStrengths.length,
    overallRiskLevel: determineOverallRiskLevel(turnAnalyses)
  };
}

/**
 * 确定整体风险等级
 */
function determineOverallRiskLevel(turnAnalyses) {
  const hasCritical = turnAnalyses.some(t => t.riskLevel === 'critical');
  const hasHigh = turnAnalyses.some(t => t.riskLevel === 'high');
  const hasRisk = turnAnalyses.some(t => t.result === 'risk');

  if (hasCritical) return 'critical';
  if (hasHigh || hasRisk) return 'high';
  
  const hasFail = turnAnalyses.some(t => t.result === 'fail');
  if (hasFail) return 'medium';

  return 'low';
}

/**
 * 标准化对话格式
 */
function normalizeConversation(conversation) {
  return conversation.map((turn, index) => ({
    turnIndex: index,
    role: turn.role,
    text: turn.text || turn.content || '',
    ts: turn.ts || turn.timestamp || new Date().toISOString()
  }));
}

/**
 * 校验 analyzeTurn 输入
 */
function validateAnalyzeTurnInput(input) {
  if (!input || typeof input !== 'object') {
    throw new Error('INVALID_INPUT: input 必须是对象');
  }

  if (!input.projectId || typeof input.projectId !== 'string') {
    throw new Error('INVALID_INPUT: 缺少 projectId');
  }

  if (!input.mode || !['training', 'live_monitor'].includes(input.mode)) {
    throw new Error('INVALID_INPUT: mode 必须是 "training" 或 "live_monitor"');
  }

  if (!input.conversation || !Array.isArray(input.conversation)) {
    throw new Error('INVALID_INPUT: 缺少 conversation 数组');
  }

  if (!input.currentReply || typeof input.currentReply !== 'string') {
    throw new Error('INVALID_INPUT: 缺少 currentReply');
  }

  // 校验 conversation 格式
  input.conversation.forEach((turn, index) => {
    if (!turn.role || !['customer', 'agent'].includes(turn.role)) {
      throw new Error(`INVALID_INPUT: conversation[${index}] 的 role 必须是 "customer" 或 "agent"`);
    }
    if (!turn.text && !turn.content) {
      throw new Error(`INVALID_INPUT: conversation[${index}] 缺少 text 字段`);
    }
  });
}

/**
 * 校验 analyzeConversation 输入
 */
function validateAnalyzeConversationInput(input) {
  if (!input || typeof input !== 'object') {
    throw new Error('INVALID_INPUT: input 必须是对象');
  }

  if (!input.projectId || typeof input.projectId !== 'string') {
    throw new Error('INVALID_INPUT: 缺少 projectId');
  }

  if (!input.mode || !['training', 'live_monitor'].includes(input.mode)) {
    throw new Error('INVALID_INPUT: mode 必须是 "training" 或 "live_monitor"');
  }

  if (!input.conversation || !Array.isArray(input.conversation)) {
    throw new Error('INVALID_INPUT: 缺少 conversation 数组');
  }
}

module.exports = {
  analyzeTurn,
  analyzeConversation,
  // 内部函数(供测试)
  loadScenario,
  detectScenario,
  checkCurrentReply,
  analyzeGaps,
  buildFeedback,
  normalizeConversation
};
