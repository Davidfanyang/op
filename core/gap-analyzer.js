/**
 * Gap Analyzer - 差距分析器
 * 
 * 职责:
 * 1. 综合分析问题列表
 * 2. 确定最终等级 (pass/borderline/fail/risk)
 * 3. 识别缺失信息
 * 4. 生成下一步行动建议
 * 5. 生成教练式总结
 */

/**
 * 分析回复与期望的差距
 * @param {Object} qualityCheck - 质量检查结果
 * @param {Object} actionCheck - 动作检查结果
 * @param {Object} stage - 当前阶段规则
 * @param {string} reply - 客服回复
 * @returns {Object} 分析结果
 */
function analyzeGap(qualityCheck, actionCheck, stage, reply) {
  const issues = qualityCheck.issues || [];
  
  // 添加未完成的期望动作作为问题
  if (actionCheck.unmatched && actionCheck.unmatched.length > 0) {
    issues.push({
      type: 'incomplete',
      severity: actionCheck.unmatched.length > 2 ? 'medium' : 'low',
      message: `未完成期望动作: ${actionCheck.unmatched.join('、')}`,
      expected: `应执行: ${actionCheck.matched.concat(actionCheck.unmatched).join('、')}`,
      actual: `仅完成: ${actionCheck.matched.join('、') || '无'}`
    });
  }

  // 确定等级
  const level = determineLevel(issues);

  // 提取缺失信息
  const missing = extractMissingInfo(issues, stage);

  // 生成下一步行动建议
  const nextAction = generateNextAction(issues, stage, level);

  // 计算风险等级
  const riskLevel = calculateRiskLevel(issues);

  return {
    level,
    issues,
    missing,
    nextAction,
    riskLevel
  };
}

/**
 * 确定回复等级
 * @param {Array} issues - 问题列表
 * @returns {string} pass | borderline | fail | risk
 */
function determineLevel(issues) {
  const highSeverity = issues.filter(i => i.severity === 'high').length;
  const mediumSeverity = issues.filter(i => i.severity === 'medium').length;
  const hasForbiddenContent = issues.some(i => i.type === 'forbidden_content');

  // risk: 包含禁忌内容或2个以上严重问题
  if (hasForbiddenContent || highSeverity >= 2) {
    return 'risk';
  }

  // fail: 有1个严重问题或2个以上中等问题
  if (highSeverity >= 1 || mediumSeverity >= 2) {
    return 'fail';
  }

  // borderline: 有1个中等问题或多个低等问题
  if (mediumSeverity >= 1 || issues.length >= 3) {
    return 'borderline';
  }

  // pass: 无问题或仅有低等问题
  return 'pass';
}

/**
 * 提取缺失的关键信息
 * @param {Array} issues - 问题列表
 * @param {Object} stage - 当前阶段规则
 * @returns {Array} 缺失信息列表
 */
function extractMissingInfo(issues, stage) {
  const missing = [];

  // 从missing_info类型问题中提取
  issues.filter(i => i.type === 'missing_info').forEach(issue => {
    if (issue.expected) {
      // 提取"应包含:"后面的内容
      const match = issue.expected.match(/应包含: (.+)/);
      if (match) {
        missing.push(...match[1].split('、'));
      }
    }
  });

  // 从未完成的期望动作中提取
  issues.filter(i => i.type === 'incomplete').forEach(issue => {
    if (issue.expected) {
      const match = issue.expected.match(/应执行: (.+)/);
      if (match) {
        missing.push(...match[1].split('、'));
      }
    }
  });

  // 去重
  return [...new Set(missing)];
}

/**
 * 生成下一步行动建议
 * @param {Array} issues - 问题列表
 * @param {Object} stage - 当前阶段规则
 * @param {string} level - 当前等级
 * @returns {string} 下一步行动建议
 */
function generateNextAction(issues, stage, level) {
  if (level === 'pass') {
    return stage.nextStage ? '可进入下一阶段' : '当前阶段完成良好';
  }

  // 提取最严重的问题类型
  const highIssues = issues.filter(i => i.severity === 'high');
  if (highIssues.length > 0) {
    return `优先解决: ${highIssues[0].message}`;
  }

  // 中等问题
  const mediumIssues = issues.filter(i => i.severity === 'medium');
  if (mediumIssues.length > 0) {
    return `建议改进: ${mediumIssues[0].message}`;
  }

  // 低等问题
  return '可优化细节，当前回复基本可用';
}

/**
 * 计算风险等级
 * @param {Array} issues - 问题列表
 * @returns {string} none | low | medium | high
 */
function calculateRiskLevel(issues) {
  const highCount = issues.filter(i => i.severity === 'high').length;
  const hasForbidden = issues.some(i => i.type === 'forbidden_content');

  if (hasForbidden || highCount >= 2) {
    return 'high';
  }

  if (highCount >= 1) {
    return 'medium';
  }

  if (issues.length > 0) {
    return 'low';
  }

  return 'none';
}

/**
 * 生成教练式诊断总结
 * @param {Object} gapAnalysis - 差距分析结果
 * @param {Object} stage - 当前阶段
 * @param {string} reply - 客服回复
 * @returns {string} 教练总结
 */
function generateCoachSummary(gapAnalysis, stage, reply) {
  const { level, issues, missing, nextAction } = gapAnalysis;

  // 根据等级生成不同风格的总结
  if (level === 'pass') {
    return `✓ 当前回复符合"${stage.name}"阶段期望。${
      missing.length > 0 ? `建议补充: ${missing.slice(0, 2).join('、')}` : '回复完整度良好。'
    } ${nextAction ? '下一步: ' + nextAction : ''}`;
  }

  if (level === 'borderline') {
    return `△ 回复方向正确，但还需完善。${
      missing.length > 0 ? `缺少: ${missing.slice(0, 3).join('、')}` : ''
    } ${nextAction ? '建议: ' + nextAction : ''}`;
  }

  if (level === 'fail') {
    return `✗ 回复存在明显不足。主要问题: ${
      issues.slice(0, 2).map(i => i.message).join('；')
    }。${nextAction ? '改进方向: ' + nextAction : ''}`;
  }

  // risk
  return `⚠ 回复存在严重问题，不建议发送。风险点: ${
    issues.filter(i => i.severity === 'high').slice(0, 2).map(i => i.message).join('；')
  }。${nextAction ? '必须改进: ' + nextAction : ''}`;
}

module.exports = { analyzeGap, generateCoachSummary };
