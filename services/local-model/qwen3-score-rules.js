/**
 * Qwen3 评分规则引擎
 * 
 * 职责：基于 qwen3 的结构化判断结果，计算规则化分数
 * 原则：
 * - qwen3 负责看问题（problem_type, issues, missing_info）
 * - 规则引擎负责定分（base_score - deductions）
 * 
 * @author Qoder
 * @date 2026-04-22
 */

'use strict';

// ========================
// 配置常量（第五版：qwen_raw_score + 微调模式）
// ========================

const MAX_ADJUSTMENT = 20; // 最大调整幅度：规则对qwen_raw_score的改变不超过20分

const DEDUCTION_RULES = {
  // 1. issues 扣分：每条扣 3 分，最多扣 15 分
  issues: {
    perItem: 3,
    max: 15
  },
  
  // 2. missing_info 扣分：每条扣 2 分，最多扣 10 分
  missingInfo: {
    perItem: 2,
    max: 10
  },
  
  // 3. 敷衍回复扣分：扣 8 分
  passiveReply: 8,
  
  // 4. 无明确处理动作扣分：扣 6 分
  noActionPath: 6,
  
  // 5. 未收集关键信息额外扣分：missing_info >= 2 时扣 4 分
  insufficientInfo: 4,
  
  // 6. unknown 问题保守扣分：扣 3 分（轻扣）
  unknownProblem: 3,
  
  // 7. 仅安抚无动作额外压分：扣 12 分
  onlyReassure: 12
};

const ADDITION_RULES = {
  // 1. 明确处理动作：+3 分
  actionPath: 3,
  
  // 2. 主动收集资料：+3 分
  infoCollection: 3,
  
  // 3. 下一步指引：+3 分
  nextStep: 3,
  
  // 4. 共情表达：+2 分
  empathy: 2,
  
  // 5. 闭环表达：+2 分
  followUp: 2
};

// 敷衍回复关键词
const PASSIVE_REPLY_KEYWORDS = [
  '等等',
  '稍等',
  '耐心等待',
  '帮您看看',
  '先等等',
  '请稍等',
  '等一下',
  '马上',
  '尽快'
];

// 明确处理动作关键词（第三版增强）
const ACTION_PATH_KEYWORDS = [
  '请提供',
  '请发送',
  '请补充',
  '请核实',
  '我们将查询',
  '我们会协助处理',
  '我们将核实',
  '我们将联系',
  '请确认',
  '请说明',
  '建议您',
  '我们需要',
  '我们会',
  '我们将',
  '我们将为您查询',
  '请您',
  '可以帮您处理',
  '我们将协助'
];

// 下一步指引关键词（第三版增强）
const NEXT_STEP_KEYWORDS = [
  '接下来',
  '之后',
  '完成后',
  '再为您处理',
  '处理完成后会通知您'
];

// 共情表达关键词（第三版）
const EMPATHY_KEYWORDS = [
  '理解您的情况',
  '抱歉给您带来不便',
  '感谢您的反馈',
  '抱歉让您久等',
  '非常理解'
];

// 闭环表达关键词（第三版新增）
const FOLLOW_UP_KEYWORDS = [
  '后续会继续跟进',
  '反馈结果',
  '处理完成后通知',
  '我们会持续跟进',
  '有结果会通知您'
];

// ========================
// 核心函数
// ========================

/**
 * 计算规则化分数（第五版：qwen_raw_score + 规则微调模式）
 * 
 * @param {Object} qwenData - qwen3 的结构化判断结果
 * @param {string} qwenData.problem_type - 问题类型
 * @param {string} qwenData.scenario - 场景
 * @param {string[]} qwenData.issues - 问题列表
 * @param {string[]} qwenData.missing_info - 缺失信息列表
 * @param {string} qwenData.suggested_reply - 建议回复
 * @param {number} qwenData.confidence - 置信度
 * @param {number} qwenData.score - qwen3 原始分数（qwen_raw_score）
 * @returns {Object} 评分结果
 */
function calculateRuleBasedScore(qwenData) {
  if (!qwenData) {
    throw new Error('qwenData is required');
  }
  
  // 第五版：使用 qwen_raw_score 作为初始分
  const qwenRawScore = typeof qwenData.score === 'number' ? qwenData.score : 75;
  let currentScore = qwenRawScore;
  
  const deductions = [];
  const additions = [];
  const detectedFlags = [];
  
  const issues = Array.isArray(qwenData.issues) ? qwenData.issues : [];
  const missingInfo = Array.isArray(qwenData.missing_info) ? qwenData.missing_info : [];
  const suggestedReply = qwenData.suggested_reply || '';
  const problemType = qwenData.problem_type || 'unknown';
  
  // ========================
  // 轻量微调逻辑（第五版）
  // ========================
  
  // 1. issues 扣分（轻量）：每条扣 3 分，最多 15 分
  if (issues.length > 0) {
    const issuesDeduction = Math.min(issues.length * DEDUCTION_RULES.issues.perItem, DEDUCTION_RULES.issues.max);
    currentScore -= issuesDeduction;
    deductions.push({
      reason: 'issues_count',
      points: issuesDeduction,
      detail: `${issues.length} 个问题，每个扣 ${DEDUCTION_RULES.issues.perItem} 分`
    });
  }
  
  // 2. missing_info 扣分（轻量）：每条扣 2 分，最多 10 分
  if (missingInfo.length > 0) {
    const missingInfoDeduction = Math.min(missingInfo.length * DEDUCTION_RULES.missingInfo.perItem, DEDUCTION_RULES.missingInfo.max);
    currentScore -= missingInfoDeduction;
    deductions.push({
      reason: 'missing_info_count',
      points: missingInfoDeduction,
      detail: `${missingInfo.length} 个缺失信息，每个扣 ${DEDUCTION_RULES.missingInfo.perItem} 分`
    });
  }
  
  // 3. 敷衍回复扣分（中度）：扣 8 分
  if (hasPassiveReply(suggestedReply, issues)) {
    currentScore -= DEDUCTION_RULES.passiveReply;
    detectedFlags.push('passive_reply');
    deductions.push({
      reason: 'passive_reply',
      points: DEDUCTION_RULES.passiveReply,
      detail: '检测到敷衍回复特征'
    });
  }
  
  // 4. 无明确处理动作扣分（中度）：扣 6 分
  if (!hasActionPath(suggestedReply)) {
    currentScore -= DEDUCTION_RULES.noActionPath;
    detectedFlags.push('no_action_path');
    deductions.push({
      reason: 'no_action_path',
      points: DEDUCTION_RULES.noActionPath,
      detail: '未检测到明确的处理动作'
    });
  }
  
  // 5. 未收集关键信息额外扣分（轻度）：missing_info >= 2 时扣 4 分
  if (missingInfo.length >= 2) {
    currentScore -= DEDUCTION_RULES.insufficientInfo;
    detectedFlags.push('insufficient_info');
    deductions.push({
      reason: 'insufficient_info',
      points: DEDUCTION_RULES.insufficientInfo,
      detail: `missing_info >= 2（当前 ${missingInfo.length} 个）`
    });
  }
  
  // 6. unknown 问题保守扣分（轻度）：扣 3 分
  if (problemType === 'unknown') {
    currentScore -= DEDUCTION_RULES.unknownProblem;
    detectedFlags.push('unknown_problem');
    deductions.push({
      reason: 'unknown_problem',
      points: DEDUCTION_RULES.unknownProblem,
      detail: '问题类型为 unknown，保守扣分'
    });
  }
  
  // ========================
  // 加分逻辑（第五版：轻量加分）
  // ========================
    
  const hasAction = hasActionPath(suggestedReply);
  const hasInfoCollection = hasActiveInfoCollection(suggestedReply, missingInfo);
  const hasNextStep = hasNextStepGuidance(suggestedReply);
  const hasEmpathyExpr = hasEmpathy(suggestedReply);
  const hasFollowUp = hasFollowUpGuidance(suggestedReply);
    
  // 1. 明确处理动作（+3）
  if (hasAction) {
    currentScore += ADDITION_RULES.actionPath;
    additions.push({
      reason: 'has_action_path',
      points: ADDITION_RULES.actionPath,
      detail: '包含明确处理动作'
    });
  }
    
  // 2. 资料收集行为加分（+3）
  if (hasInfoCollection) {
    currentScore += ADDITION_RULES.infoCollection;
    additions.push({
      reason: 'info_collection',
      points: ADDITION_RULES.infoCollection,
      detail: '主动收集关键信息'
    });
  }
    
  // 3. 有下一步指引（+3）
  if (hasNextStep) {
    currentScore += ADDITION_RULES.nextStep;
    additions.push({
      reason: 'next_step_guidance',
      points: ADDITION_RULES.nextStep,
      detail: '包含下一步指引'
    });
  }
    
  // 4. 基本共情（+2）
  if (hasEmpathyExpr) {
    currentScore += ADDITION_RULES.empathy;
    additions.push({
      reason: 'empathy',
      points: ADDITION_RULES.empathy,
      detail: '包含共情表达'
    });
  }
    
  // 5. 闭环表达加分（+2）
  if (hasFollowUp) {
    currentScore += ADDITION_RULES.followUp;
    additions.push({
      reason: 'follow_up',
      points: ADDITION_RULES.followUp,
      detail: '明确后续跟进/闭环'
    });
  }
  
  // ========================
  // 硬规则（第五版）
  // ========================
  
  // 硬规则1：仅安抚无动作，额外压分
  if (hasEmpathyExpr && !hasAction && !hasInfoCollection && !hasNextStep) {
    currentScore -= DEDUCTION_RULES.onlyReassure;
    detectedFlags.push('only_reassure');
    deductions.push({
      reason: 'only_reassure',
      points: DEDUCTION_RULES.onlyReassure,
      detail: '仅安抚，无处理动作/资料收集/下一步'
    });
  }
  
  // 硬规则2：差样本封顶规则
  if (issues.length >= 2 && missingInfo.length >= 2) {
    currentScore = Math.min(currentScore, 70);
    detectedFlags.push('bad_sample_cap');
  }
  
  // 硬规则3：好样本下限规则
  if (issues.length === 0 && missingInfo.length === 0 && hasAction && hasNextStep) {
    currentScore = Math.max(currentScore, 80);
    detectedFlags.push('good_sample_floor');
  }
  
  // ========================
  // 限制调整幅度（第五版新增）
  // ========================
  
  const adjustment = currentScore - qwenRawScore;
  if (Math.abs(adjustment) > MAX_ADJUSTMENT) {
    // 如果调整幅度超过限制，裁剪到允许范围内
    if (adjustment > 0) {
      currentScore = qwenRawScore + MAX_ADJUSTMENT;
    } else {
      currentScore = qwenRawScore - MAX_ADJUSTMENT;
    }
    detectedFlags.push('adjustment_capped');
  }
  
  // ========================
  // 边界裁剪
  // ========================
  
  const finalScore = Math.max(0, Math.min(100, currentScore));
  
  return {
    score: finalScore,
    qwen_raw_score: qwenRawScore,  // 第五版：记录原始分数
    base_score: qwenRawScore,  // 第五版：base_score 就是 qwen_raw_score
    deductions: deductions,
    additions: additions,
    meta: {
      issuesCount: issues.length,
      missingInfoCount: missingInfo.length,
      detectedFlags: detectedFlags,
      totalDeduction: deductions.reduce((sum, d) => sum + d.points, 0),
      totalAddition: additions.reduce((sum, a) => sum + a.points, 0),
      adjustment: finalScore - qwenRawScore,  // 第五版：记录调整幅度
      score_source: 'qwen_raw_plus_rules'  // 第五版：标识评分来源
    }
  };
}

/**
 * 检测是否包含敷衍回复特征
 * 
 * @param {string} suggestedReply - 建议回复
 * @param {string[]} issues - 问题列表
 * @returns {boolean}
 */
function hasPassiveReply(suggestedReply, issues) {
  const text = (suggestedReply + ' ' + issues.join(' ')).toLowerCase();
  
  return PASSIVE_REPLY_KEYWORDS.some(keyword => text.includes(keyword));
}

/**
 * 检测是否包含明确处理动作
 * 
 * @param {string} suggestedReply - 建议回复
 * @returns {boolean}
 */
function hasActionPath(suggestedReply) {
  if (!suggestedReply) return false;
  
  const text = suggestedReply.toLowerCase();
  
  return ACTION_PATH_KEYWORDS.some(keyword => text.includes(keyword));
}

/**
 * 检测是否包含下一步指引（第二版新增）
 * 
 * @param {string} suggestedReply - 建议回复
 * @returns {boolean}
 */
function hasNextStepGuidance(suggestedReply) {
  if (!suggestedReply) return false;
  
  const text = suggestedReply.toLowerCase();
  
  return NEXT_STEP_KEYWORDS.some(keyword => text.includes(keyword));
}

/**
 * 检测是否包含共情表达（第三版）
 * 
 * @param {string} suggestedReply - 建议回复
 * @returns {boolean}
 */
function hasEmpathy(suggestedReply) {
  if (!suggestedReply) return false;
  
  const text = suggestedReply.toLowerCase();
  
  return EMPATHY_KEYWORDS.some(keyword => text.includes(keyword));
}

/**
 * 检测是否主动收集资料（第三版新增）
 * 
 * @param {string} suggestedReply - 建议回复
 * @param {string[]} missingInfo - 缺失信息列表
 * @returns {boolean}
 */
function hasActiveInfoCollection(suggestedReply, missingInfo) {
  if (!suggestedReply) return false;
  
  const text = suggestedReply.toLowerCase();
  
  // 检测是否包含主动收集信息的表达
  const collectionKeywords = [
    '请提供',
    '请发送',
    '请补充',
    '请上传',
    '需要您提供',
    '需要您发送',
    '请核实后提供',
    '我们需要',
    '请您提供'
  ];
  
  return collectionKeywords.some(keyword => text.includes(keyword));
}

/**
 * 检测是否包含闭环表达（第三版新增）
 * 
 * @param {string} suggestedReply - 建议回复
 * @returns {boolean}
 */
function hasFollowUpGuidance(suggestedReply) {
  if (!suggestedReply) return false;
  
  const text = suggestedReply.toLowerCase();
  
  return FOLLOW_UP_KEYWORDS.some(keyword => text.includes(keyword));
}

// ========================
// 导出
// ========================

module.exports = {
  calculateRuleBasedScore,
  hasPassiveReply,
  hasActionPath,
  hasNextStepGuidance,
  hasEmpathy,
  hasActiveInfoCollection,
  hasFollowUpGuidance,
  DEDUCTION_RULES,
  ADDITION_RULES,
  MAX_ADJUSTMENT
};
