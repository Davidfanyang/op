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
 *   result: { level, issues, missing, strengths, nextAction },
 *   coachSummary: string,        // 教练式诊断总结
 *   riskLevel: string,           // none | low | medium | high | critical
 *   confidence: number,          // 置信度 0-1
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
  // 1. 整理问题列表（增强解释）
  const issues = (analysisResult.result?.issues || []).map(issue => ({
    ...issue,
    // 增强问题解释
    explanation: issue.explanation || explainIssue(issue),
    // 严重程度映射
    severity: issue.severity || mapSeverityFromLevel(analysisResult.result?.level)
  }));

  // 2. 整理缺失项（增强解释）
  const missing = (analysisResult.result?.missing || []).map(item => ({
    ...item,
    // 增强缺失项解释
    explanation: item.explanation || explainMissing(item, analysisResult.stage),
    // 建议补充内容
    suggestion: item.suggestion || suggestForMissing(item)
  }));

  // 3. 整理优势项
  const strengths = analysisResult.result?.strengths || [];

  // 4. 生成下一步建议
  const nextAction = analysisResult.result?.nextAction || 
                     generateNextAction(analysisResult, scenario);

  // 5. 生成教练总结
  const coachSummary = analysisResult.coachSummary || 
                       generateCoachSummary(analysisResult, issues, missing, strengths);

  return {
    // 场景与阶段
    scenario: analysisResult.scenario || {
      id: scenario?.id || 'unknown',
      title: scenario?.title || '未知场景',
      matchedStage: analysisResult.stage?.id || null,
      stageName: analysisResult.stage?.name || 'unknown'
    },

    stage: analysisResult.stage || {
      id: 'unknown',
      name: '未知阶段',
      description: '',
      expectedActions: [],
      mustInclude: [],
      mustAvoid: [],
      // 当前阶段解释
      explanation: '无法识别当前对话阶段'
    },

    // 分析结果
    result: {
      level: analysisResult.result?.level || 'fail',
      issues,
      missing,
      strengths,
      nextAction
    },

    // 诊断总结
    coachSummary,
    riskLevel: analysisResult.riskLevel || mapRiskLevel(analysisResult.result?.level),
    confidence: analysisResult.confidence || 0.5,

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
 * 解释问题
 */
function explainIssue(issue) {
  const severityMap = {
    'critical': '这是一个严重问题，会直接影响服务质量',
    'high': '这是一个重要问题，需要立即改进',
    'medium': '这是一个需要注意的问题，建议优化',
    'low': '这是一个轻微问题，可以在后续对话中改进'
  };
  
  const severity = issue.severity || 'medium';
  const baseExplanation = severityMap[severity] || '需要关注此问题';
  
  return issue.message 
    ? `${baseExplanation}: ${issue.message}`
    : baseExplanation;
}

/**
 * 根据等级映射严重程度
 */
function mapSeverityFromLevel(level) {
  const severityMap = {
    'pass': 'low',
    'borderline': 'medium',
    'fail': 'high',
    'risk': 'critical'
  };
  return severityMap[level] || 'medium';
}

/**
 * 解释缺失项
 */
function explainMissing(item, stage) {
  const stageName = stage?.name || '当前阶段';
  const itemName = typeof item === 'string' ? item : (item.name || item.key || '该项');
  
  return `在「${stageName}」阶段，缺少必要的内容: ${itemName}`;
}

/**
 * 为缺失项生成建议
 */
function suggestForMissing(item) {
  const itemName = typeof item === 'string' ? item : (item.name || item.key || '');
  
  const suggestionMap = {
    '身份验证': '请在回复中添加身份验证步骤，确认客户身份',
    '问题确认': '请先确认客户的具体问题，避免误解',
    '解决方案': '请提供明确的解决方案或处理步骤',
    '风险提示': '请添加必要的风险提示，确保客户知情',
    '安抚表达': '请增加安抚性表达，缓解客户情绪',
    '信息收集': '请收集必要的信息以便更好地处理问题'
  };
  
  return suggestionMap[itemName] || `请在回复中补充: ${itemName}`;
}

/**
 * 生成下一步建议
 */
function generateNextAction(analysisResult, scenario) {
  const level = analysisResult.result?.level || 'fail';
  const issues = analysisResult.result?.issues || [];
  const missing = analysisResult.result?.missing || [];
  
  // 根据等级生成建议
  if (level === 'pass') {
    return '回复质量良好，可以发送到客户';
  }
  
  if (level === 'borderline') {
    if (missing.length > 0) {
      return `建议补充缺失内容后再发送: ${missing.slice(0, 2).join('、')}`;
    }
    return '回复基本合格，建议优化细节后再发送';
  }
  
  if (level === 'fail') {
    if (issues.length > 0) {
      const criticalIssue = issues.find(i => i.severity === 'high' || i.severity === 'critical');
      if (criticalIssue) {
        return `需要先解决关键问题: ${criticalIssue.message || criticalIssue}`;
      }
    }
    return '回复需要大幅改进，建议参考标准话术重新组织';
  }
  
  // risk 等级
  return '回复存在风险，不建议直接发送，请重新组织回复内容';
}

/**
 * 生成教练总结
 */
function generateCoachSummary(analysisResult, issues, missing, strengths) {
  const level = analysisResult.result?.level || 'fail';
  const stage = analysisResult.stage?.name || '当前阶段';
  
  const levelSummary = {
    'pass': '回复质量优秀',
    'borderline': '回复基本合格，但仍有改进空间',
    'fail': '回复存在明显不足，需要改进',
    'risk': '回复存在风险，不建议发送'
  };
  
  let summary = levelSummary[level] || '分析完成';
  
  // 添加阶段信息
  summary += `。在「${stage}」阶段`;
  
  // 添加具体问题
  if (issues.length > 0) {
    summary += `，发现 ${issues.length} 个问题`;
  }
  
  // 添加缺失项
  if (missing.length > 0) {
    summary += `，缺少 ${missing.length} 项必要内容`;
  }
  
  // 添加优势
  if (strengths.length > 0) {
    summary += `。优点是: ${strengths.slice(0, 2).join('、')}`;
  }
  
  summary += '。';
  
  return summary;
}

/**
 * 根据等级映射风险等级
 */
function mapRiskLevel(level) {
  const riskMap = {
    'pass': 'none',
    'borderline': 'low',
    'fail': 'medium',
    'risk': 'high'
  };
  return riskMap[level] || 'medium';
}

module.exports = { 
  buildDiagnosticFeedback
};

