const standards = require('../data/standards.json');

function includesAny(text, keywords = []) {
  return keywords.some((word) => text.includes(word));
}

function countMatched(text, keywords = []) {
  return keywords.filter((word) => text.includes(word)).length;
}

function toScore20(ratio) {
  return Math.max(0, Math.min(20, Math.round(ratio * 20)));
}

function addFinding(target, code, message) {
  target.push({ code, message });
}

function evaluateReply(userReply, scenario) {
  const text = String(userReply || '').trim();
  const dimensions = standards.default.dimensions;
  const findings = [];
  const suggestions = [];
  const dimensionScores = {};
  let weightedTotal = 0;

  const politeWords = ['您好', '请', '麻烦', '感谢', '不好意思', '抱歉'];
  const attitudeScore = includesAny(text, politeWords) ? 18 : 8;
  dimensionScores.attitude = attitudeScore;
  weightedTotal += attitudeScore * dimensions[0].weight;
  if (attitudeScore < 12) {
    addFinding(findings, 'attitude_missing', '语气不够客服化，礼貌表达不足。');
    suggestions.push('建议加入“您好 / 请 / 感谢”等标准客服表达。');
  }

  const processRatio = scenario.processKeywords?.length
    ? countMatched(text, scenario.processKeywords) / scenario.processKeywords.length
    : 0;
  const processScore = toScore20(processRatio);
  dimensionScores.process = processScore;
  weightedTotal += processScore * dimensions[1].weight;
  if (processScore < 12) {
    addFinding(findings, 'process_incomplete', '处理流程表达不完整，缺少关键动作说明。');
    suggestions.push('建议明确说明会协助查询、核查、申请或提交处理。');
  }

  const infoRatio = scenario.mustCollect?.length
    ? countMatched(text, scenario.mustCollect) / scenario.mustCollect.length
    : 0;
  const informationScore = toScore20(infoRatio);
  dimensionScores.information = informationScore;
  weightedTotal += informationScore * dimensions[2].weight;
  if (informationScore < 12) {
    const missing = (scenario.mustCollect || []).filter((item) => !text.includes(item));
    addFinding(findings, 'missing_information', `缺少关键资料收集：${missing.join('、')}`);
    suggestions.push('建议优先把必须收集的信息明确写出来。');
  }

  const empathyScore = includesAny(text, scenario.empathyKeywords || []) ? 18 : 8;
  dimensionScores.empathy = empathyScore;
  weightedTotal += empathyScore * dimensions[3].weight;
  if (empathyScore < 12) {
    addFinding(findings, 'empathy_weak', '安抚表达不足，容易让用户感觉被机械处理。');
    suggestions.push('建议补充“我们会尽快协助您处理 / 请您稍等”等安抚语。');
  }

  let clarityScore = 10;
  if (text.length >= 20 && text.length <= 220) clarityScore = 18;
  else if (text.length > 220 && text.length <= 350) clarityScore = 14;
  dimensionScores.clarity = clarityScore;
  weightedTotal += clarityScore * dimensions[4].weight;
  if (clarityScore < 14) {
    addFinding(findings, 'clarity_problem', '表达不够清晰或长度不太合适。');
    suggestions.push('建议保持简洁、完整、分点更明确。');
  }

  const avoidList = scenario.qualityChecks?.shouldAvoid || [];
  const violated = avoidList.filter((item) => text.includes(item));
  if (violated.length) {
    addFinding(findings, 'risk_phrase', `出现不建议使用的话术：${violated.join('、')}`);
    suggestions.push('去掉推诿、冷处理或风险表达。');
    weightedTotal = Math.max(0, weightedTotal - 2);
  }

  const strengths = [];
  if (attitudeScore >= 16) strengths.push('礼貌表达合格');
  if (processScore >= 16) strengths.push('流程动作清楚');
  if (informationScore >= 16) strengths.push('关键信息收集完整');
  if (empathyScore >= 16) strengths.push('安抚语气到位');

  const score = Math.round(weightedTotal * 5);

  return {
    score,
    dimensionScores,
    findings: findings.length ? findings : [{ code: 'pass', message: '整体回复合格，关键点覆盖较完整。' }],
    suggestions: suggestions.length ? suggestions : ['可以进一步优化语气，让表达更自然。'],
    strengths
  };
}

async function aiEvaluate() {
  return {
    enabled: false,
    reason: 'AI evaluator 暂未接入，本次使用结构化评分。'
  };
}

module.exports = { evaluateReply, aiEvaluate };
