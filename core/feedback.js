/**
 * Feedback v4.0 - 诊断结果输出层
 * 
 * 统一输出结构 (V4.0 Schema):
 * {
 *   // 场景与阶段
 *   scenario: { id, title, matchedStage, stageName },
 *   stage: { id, name, description, expectedActions, mustInclude, mustAvoid },
 *   
 *   // 分析结果
 *   result: { level, issues, missing, nextAction },
 *   coachSummary: string,        // 教练式诊断总结
 *   riskLevel: string,           // none | low | medium | high
 *   
 *   // 元数据
 *   meta: { analyzerVersion, mode, source, timestamp }
 * }
 */

/**
 * 构建诊断反馈
 * @param {Object} analysisResult - 分析器结果
 * @param {Object} scenario - 场景对象
 * @returns {Object} 标准诊断输出结构
 */
function buildDiagnosticFeedback(analysisResult, scenario) {
  return {
    // 场景与阶段
    scenario: analysisResult.scenario || {
      id: scenario.id,
      title: scenario.title,
      matchedStage: null,
      stageName: 'unknown'
    },

    stage: analysisResult.stage || {
      id: 'unknown',
      name: '未知阶段',
      description: '',
      expectedActions: [],
      mustInclude: [],
      mustAvoid: []
    },

    // 分析结果
    result: analysisResult.result || {
      level: 'fail',
      issues: [],
      missing: [],
      nextAction: '无'
    },

    // 诊断总结
    coachSummary: analysisResult.coachSummary || '分析完成',
    riskLevel: analysisResult.riskLevel || 'none',

    // 元数据
    meta: {
      analyzerVersion: 'v4.0',
      mode: 'dialogue_analysis',
      source: analysisResult.meta?.source || 'evaluator',
      timestamp: new Date().toISOString(),
      ...analysisResult.meta
    }
  };
}

/**
 * 向后兼容: 构建旧版反馈格式(逐步废弃)
 * @deprecated 使用 buildDiagnosticFeedback 替代
 */
function buildFeedback(result, scenario) {
  console.warn('[Feedback] buildFeedback 已废弃，请使用 buildDiagnosticFeedback');
  
  // 将旧版 score 格式转换为新版诊断格式
  return buildDiagnosticFeedback({
    scenario: {
      id: scenario.id,
      title: scenario.title,
      matchedStage: 'legacy',
      stageName: '旧版评分模式'
    },
    stage: {
      id: 'legacy',
      name: '旧版模式',
      description: '兼容旧版评分系统',
      expectedActions: [],
      mustInclude: [],
      mustAvoid: []
    },
    result: {
      level: convertScoreToLevel(result.score),
      issues: result.findings || [],
      missing: [],
      nextAction: result.suggestions?.[0] || '无'
    },
    coachSummary: result.coachSummary || result.summary || '评估完成',
    riskLevel: convertScoreToRiskLevel(result.score),
    meta: result.meta || {}
  }, scenario);
}

/**
 * 将旧版分数转换为等级
 */
function convertScoreToLevel(score) {
  if (score >= 70) return 'pass';
  if (score >= 50) return 'borderline';
  if (score >= 30) return 'fail';
  return 'risk';
}

/**
 * 将旧版分数转换为风险等级
 */
function convertScoreToRiskLevel(score) {
  if (score >= 70) return 'none';
  if (score >= 50) return 'low';
  if (score >= 30) return 'medium';
  return 'high';
}

module.exports = { 
  buildDiagnosticFeedback,
  buildFeedback // 向后兼容
};

