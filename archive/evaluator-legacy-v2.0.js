const standards = require('../data/standards.json');
const { aiEvaluate: runAiEvaluation } = require('./ai-evaluator');

// ==================== 智能评分配置 ====================

// 态度评分 - 多层级礼貌用语检测
const POLITE_PATTERNS = {
  high: ['您好', '你好', '亲', '尊敬的用户', '您好～', '亲，您好'],
  medium: ['请', '麻烦', '感谢', '谢谢', '不好意思', '抱歉', '对不起'],
  softeners: ['呢', '哦', '呀', '～', '😊', '👋']
};

// 安抚关键词
const EMPATHY_PATTERNS = {
  strong: ['请您放心', '不用担心', '资金安全', '我们会尽快', '第一时间', '立即为您', '马上处理'],
  medium: ['建议您', '请您', '我们会', '协助您', '帮您', '为您处理', '恢复后'],
  emotional: ['理解', '抱歉给您', '带来不便', '耐心等待', '感谢您的理解']
};

// 流程动作关键词
const ACTION_PATTERNS = [
  '查询', '核查', '核实', '确认', '处理', '解决', '协助', '申请',
  '提交', '反馈', '跟进', '通知', '回复', '提供', '发送'
];

// 负面/风险表达
const NEGATIVE_PATTERNS = [
  '自己等等', '不用管', '自己联系', '这个我们不管', '没办法', '不可能',
  '你自己', '不关我们事', '找别人', '别找我'
];

// ==================== 工具函数 ====================

function addFinding(target, code, message) {
  target.push({ code, message });
}

function toScore20(value) {
  return Math.max(0, Math.min(20, Math.round(value)));
}

// 计算文本相似度（简化版余弦相似度）
function calculateSimilarity(text1, text2) {
  if (!text1 || !text2) return 0;
  
  const words1 = text1.toLowerCase().split(/\s+|，|。|！|？|；|：/);
  const words2 = text2.toLowerCase().split(/\s+|，|。|！|？|；|：/);
  
  const set1 = new Set(words1.filter(w => w.length > 1));
  const set2 = new Set(words2.filter(w => w.length > 1));
  
  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);
  
  return union.size === 0 ? 0 : intersection.size / union.size;
}

// 检测关键词匹配度（支持部分匹配）
function detectPatterns(text, patterns) {
  if (!text || !patterns) return { matched: [], score: 0 };
  const matched = patterns.filter(p => text.includes(p));
  return {
    matched,
    score: matched.length > 0 ? Math.min(1, matched.length / 3) : 0
  };
}

// ==================== 智能评分维度 ====================

/**
 * 态度礼貌性评分 (0-20)
 * 基于多层级礼貌用语检测
 */
function scoreAttitude(text) {
  const highMatch = detectPatterns(text, POLITE_PATTERNS.high);
  const mediumMatch = detectPatterns(text, POLITE_PATTERNS.medium);
  const softenerMatch = detectPatterns(text, POLITE_PATTERNS.softeners);
  
  let score = 8; // 基础分
  
  if (highMatch.matched.length > 0) score += 6;
  if (mediumMatch.matched.length >= 2) score += 4;
  else if (mediumMatch.matched.length === 1) score += 2;
  if (softenerMatch.matched.length > 0) score += 2;
  
  // 检测是否有称呼用户
  if (/您|你|用户|客户/.test(text)) score += 2;
  
  return {
    score: toScore20(score),
    matched: [...highMatch.matched, ...mediumMatch.matched],
    details: {
      hasGreeting: highMatch.matched.length > 0,
      politeWords: mediumMatch.matched.length,
      hasSoftener: softenerMatch.matched.length > 0
    }
  };
}

/**
 * 流程完整性评分 (0-20)
 * 基于与标准回复的语义相似度 + 动作词检测
 */
function scoreProcess(text, scenario) {
  const standardReply = scenario.standardReply || '';
  
  // 语义相似度
  const similarity = calculateSimilarity(text, standardReply);
  
  // 动作词检测
  const actionMatch = detectPatterns(text, ACTION_PATTERNS);
  
  // 关键信息点覆盖（从标准回复中提取关键短语）
  const keyPhrases = extractKeyPhrases(standardReply);
  const phraseMatches = keyPhrases.filter(p => text.includes(p)).length;
  const phraseCoverage = keyPhrases.length > 0 ? phraseMatches / keyPhrases.length : 0;
  
  let score = 5; // 基础分
  score += similarity * 8; // 相似度最高加8分
  score += actionMatch.score * 4; // 动作词最高加4分
  score += phraseCoverage * 3; // 关键信息覆盖最高加3分
  
  return {
    score: toScore20(score),
    similarity,
    actions: actionMatch.matched,
    coverage: phraseCoverage,
    details: {
      hasAction: actionMatch.matched.length > 0,
      keyPointsCovered: phraseMatches,
      totalKeyPoints: keyPhrases.length
    }
  };
}

/**
 * 信息收集完整性评分 (0-20)
 * 基于场景类型智能判断
 */
function scoreInformation(text, scenario) {
  // 从标准回复中提取需要收集的信息类型
  const standardReply = scenario.standardReply || '';
  
  // 检测是否包含信息收集请求
  const infoPatterns = [
    '提供', '发送', '截图', '手机号', '账户', 'ID', '信息',
    '资料', '证件', '照片', '视频', '截图', '账单'
  ];
  
  const infoMatch = detectPatterns(text, infoPatterns);
  
  // 检测是否有明确的请求表达
  const requestPatterns = ['请.*提供', '麻烦.*发送', '需要.*确认', '请.*截图'];
  const hasExplicitRequest = requestPatterns.some(p => new RegExp(p).test(text));
  
  // 对比标准回复的信息收集程度
  const standardInfoMatch = detectPatterns(standardReply, infoPatterns);
  const infoRatio = standardInfoMatch.matched.length > 0 
    ? Math.min(1, infoMatch.matched.length / Math.max(1, standardInfoMatch.matched.length))
    : 0.5;
  
  let score = 8; // 基础分
  score += infoRatio * 8;
  if (hasExplicitRequest) score += 2;
  if (infoMatch.matched.length >= 2) score += 2;
  
  return {
    score: toScore20(score),
    infoRequests: infoMatch.matched,
    details: {
      hasExplicitRequest,
      infoCoverage: infoRatio
    }
  };
}

/**
 * 安抚能力评分 (0-20)
 * 基于安抚表达检测
 */
function scoreEmpathy(text, scenario) {
  const strongMatch = detectPatterns(text, EMPATHY_PATTERNS.strong);
  const mediumMatch = detectPatterns(text, EMPATHY_PATTERNS.medium);
  const emotionalMatch = detectPatterns(text, EMPATHY_PATTERNS.emotional);
  
  // 检测是否针对用户问题提供解决方案
  const hasSolution = /会.*处理|会.*解决|会.*协助|为您.*查询/.test(text);
  
  // 检测时效性承诺
  const hasTimeline = /尽快|第一时间|马上|立即|稍后|预计.*时间/.test(text);
  
  let score = 6; // 基础分
  score += strongMatch.matched.length * 4;
  score += mediumMatch.score * 4;
  score += emotionalMatch.matched.length * 2;
  if (hasSolution) score += 2;
  if (hasTimeline) score += 2;
  
  return {
    score: toScore20(score),
    empathyPhrases: [...strongMatch.matched, ...mediumMatch.matched, ...emotionalMatch.matched],
    details: {
      hasSolution,
      hasTimeline,
      strongEmpathy: strongMatch.matched.length > 0
    }
  };
}

/**
 * 表达清晰度评分 (0-20)
 * 基于可读性和结构
 */
function scoreClarity(text) {
  const length = text.length;
  const sentences = text.split(/[。！？\n]+/).filter(s => s.trim().length > 0);
  const avgSentenceLength = sentences.length > 0 ? length / sentences.length : 0;
  
  // 检测结构标记
  const hasStructure = /[1-9]\.|[①②③④⑤]|[（(][1-9][)）]|\n/.test(text);
  
  // 检测重复表达
  const repeatedWords = findRepeatedPhrases(text);
  
  let score = 10; // 基础分
  
  // 长度评分
  if (length >= 30 && length <= 200) score += 5;
  else if (length > 200 && length <= 350) score += 3;
  else if (length < 30) score -= 2;
  
  // 句子长度评分
  if (avgSentenceLength >= 10 && avgSentenceLength <= 50) score += 3;
  
  // 结构评分
  if (hasStructure) score += 2;
  
  // 重复扣减
  score -= repeatedWords.length * 2;
  
  return {
    score: toScore20(score),
    details: {
      length,
      sentenceCount: sentences.length,
      avgSentenceLength: Math.round(avgSentenceLength),
      hasStructure,
      repeatedIssues: repeatedWords
    }
  };
}

// ==================== 辅助函数 ====================

function extractKeyPhrases(text) {
  if (!text) return [];
  // 提取2-6字的关键短语
  const phrases = [];
  const candidates = text.split(/[，。！？；：\s]+/);
  candidates.forEach(c => {
    const trimmed = c.trim();
    if (trimmed.length >= 2 && trimmed.length <= 8) {
      phrases.push(trimmed);
    }
  });
  return phrases.slice(0, 5); // 最多取5个关键短语
}

function findRepeatedPhrases(text) {
  const repeats = [];
  const segments = text.match(/[\u4e00-\u9fa5]{2,4}/g) || [];
  const counts = {};
  segments.forEach(s => {
    counts[s] = (counts[s] || 0) + 1;
    if (counts[s] === 3) repeats.push(s);
  });
  return repeats;
}

function detectNegativePatterns(text) {
  return NEGATIVE_PATTERNS.filter(p => text.includes(p));
}

// ==================== 主评估函数 ====================

function evaluateReply(userReply, scenario) {
  const text = String(userReply || '').trim();
  const dimensions = standards.default.dimensions;
  const findings = [];
  const suggestions = [];
  const dimensionScores = {};
  const details = {};
  let weightedTotal = 0;

  // 1. 态度评分
  const attitudeResult = scoreAttitude(text);
  dimensionScores.attitude = attitudeResult.score;
  weightedTotal += attitudeResult.score * dimensions[0].weight;
  details.attitude = attitudeResult.details;
  
  if (attitudeResult.score < 12) {
    addFinding(findings, 'attitude_missing', '语气不够客服化，礼貌表达不足。');
    suggestions.push('建议加入"您好 / 请 / 感谢"等标准客服表达。');
  }

  // 2. 流程评分
  const processResult = scoreProcess(text, scenario);
  dimensionScores.process = processResult.score;
  weightedTotal += processResult.score * dimensions[1].weight;
  details.process = processResult.details;
  
  if (processResult.score < 12) {
    addFinding(findings, 'process_incomplete', '处理流程表达不完整，缺少关键动作说明。');
    suggestions.push('建议明确说明会协助查询、核查、申请或提交处理。');
  }

  // 3. 信息收集评分
  const infoResult = scoreInformation(text, scenario);
  dimensionScores.information = infoResult.score;
  weightedTotal += infoResult.score * dimensions[2].weight;
  details.information = infoResult.details;
  
  if (infoResult.score < 12) {
    addFinding(findings, 'missing_information', '信息收集不够完整，建议明确需要用户提供的资料。');
    suggestions.push('建议优先把必须收集的信息明确写出来。');
  }

  // 4. 安抚评分
  const empathyResult = scoreEmpathy(text, scenario);
  dimensionScores.empathy = empathyResult.score;
  weightedTotal += empathyResult.score * dimensions[3].weight;
  details.empathy = empathyResult.details;
  
  if (empathyResult.score < 12) {
    addFinding(findings, 'empathy_weak', '安抚表达不足，容易让用户感觉被机械处理。');
    suggestions.push('建议补充"我们会尽快协助您处理 / 请您稍等"等安抚语。');
  }

  // 5. 清晰度评分
  const clarityResult = scoreClarity(text);
  dimensionScores.clarity = clarityResult.score;
  weightedTotal += clarityResult.score * dimensions[4].weight;
  details.clarity = clarityResult.details;
  
  if (clarityResult.score < 14) {
    addFinding(findings, 'clarity_problem', '表达不够清晰或长度不太合适。');
    suggestions.push('建议保持简洁、完整、分点更明确。');
  }

  // 风险检查
  const negativePatterns = detectNegativePatterns(text);
  if (negativePatterns.length > 0) {
    addFinding(findings, 'risk_phrase', `出现不建议使用的话术，请避免使用消极表达。`);
    suggestions.push('去掉推诿、冷处理或风险表达，使用积极的解决导向语言。');
    weightedTotal = Math.max(0, weightedTotal - 3);
  }

  // 优点收集（更细致）
  const strengths = [];
  if (attitudeResult.score >= 16) strengths.push('礼貌表达合格');
  if (attitudeResult.score >= 18) strengths.push('态度亲切友好');
  if (processResult.score >= 16) strengths.push('流程动作清楚');
  if (processResult.score >= 18) strengths.push('处理步骤完整');
  if (infoResult.score >= 16) strengths.push('关键信息收集完整');
  if (empathyResult.score >= 16) strengths.push('安抚语气到位');
  if (empathyResult.score >= 18) strengths.push('同理心表达优秀');
  if (clarityResult.score >= 16) strengths.push('表达清晰简洁');
  if (processResult.similarity > 0.6) strengths.push('回复符合标准话术');

  const score = Math.round(weightedTotal);

  return {
    score,
    dimensionScores,
    findings: findings.length ? findings : [{ code: 'pass', message: '整体回复合格，关键点覆盖较完整。' }],
    suggestions: suggestions.length ? suggestions : ['可以进一步优化语气，让表达更自然。'],
    strengths,
    details,
    _raw: {
      attitude: attitudeResult,
      process: processResult,
      information: infoResult,
      empathy: empathyResult,
      clarity: clarityResult
    }
  };
}

// 使用 AI 评估
async function aiEvaluate(userReply, scenario) {
  try {
    return await runAiEvaluation(userReply, scenario);
  } catch (err) {
    console.error('AI 评估失败:', err);
    return {
      enabled: false,
      reason: `AI 评估失败: ${err.message}，使用规则评分代替。`
    };
  }
}

module.exports = { evaluateReply, aiEvaluate };
