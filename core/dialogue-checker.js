/**
 * Dialogue Checker - 对话检查器
 * 
 * 职责：
 * 1. 检查当前回复是否符合阶段期望
 * 2. 检查必须包含的信息
 * 3. 检查禁忌内容
 * 4. 检查全局规则
 */

/**
 * 检查客服回复质量
 * @param {string} reply - 客服回复内容
 * @param {Object} stage - 当前阶段规则
 * @param {Object} globalRules - 全局规则
 * @returns {Object} 检查结果 { issues, passed }
 */
function checkReplyQuality(reply, stage, globalRules = {}) {
  const issues = [];
  const replyLower = reply.toLowerCase();

  // 1. 检查必须包含的信息
  if (stage.mustInclude && stage.mustInclude.length > 0) {
    const missingIncludes = stage.mustInclude.filter(
      keyword => !replyLower.includes(keyword.toLowerCase())
    );

    if (missingIncludes.length > 0) {
      issues.push({
        type: 'missing_info',
        severity: missingIncludes.length > 2 ? 'high' : 'medium',
        message: `缺少关键信息: ${missingIncludes.join('、')}`,
        expected: `应包含: ${stage.mustInclude.join('、')}`,
        actual: `实际包含: ${missingIncludes.length} 项缺失`
      });
    }
  }

  // 2. 检查禁忌内容
  if (stage.mustAvoid && stage.mustAvoid.length > 0) {
    const foundAvoids = stage.mustAvoid.filter(
      keyword => replyLower.includes(keyword.toLowerCase())
    );

    if (foundAvoids.length > 0) {
      issues.push({
        type: 'forbidden_content',
        severity: 'high',
        message: `包含禁忌内容: ${foundAvoids.join('、')}`,
        expected: `不应包含: ${stage.mustAvoid.join('、')}`,
        actual: `发现: ${foundAvoids.join('、')}`
      });
    }
  }

  // 3. 检查全局规则(降低严格度，仅作为建议)
  if (globalRules.alwaysInclude && globalRules.alwaysInclude.length > 0) {
    const missingGlobal = globalRules.alwaysInclude.filter(
      keyword => !replyLower.includes(keyword.toLowerCase())
    );

    if (missingGlobal.length > 0 && missingGlobal.length <= 2) {
      // 全局规则最多标记为low，不影响pass判定
      issues.push({
        type: 'missing_info',
        severity: 'low',
        message: `建议包含: ${missingGlobal.slice(0, 2).join('、')}`,
        expected: `全局建议: ${globalRules.alwaysInclude.join('、')}`,
        actual: `缺失: ${missingGlobal.join('、')}`
      });
    }
  }

  if (globalRules.alwaysAvoid && globalRules.alwaysAvoid.length > 0) {
    const foundGlobalAvoids = globalRules.alwaysAvoid.filter(
      keyword => replyLower.includes(keyword.toLowerCase())
    );

    if (foundGlobalAvoids.length > 0) {
      issues.push({
        type: 'forbidden_content',
        severity: 'high',
        message: `违反全局禁忌规则: ${foundGlobalAvoids.join('、')}`,
        expected: `绝不包含: ${globalRules.alwaysAvoid.join('、')}`,
        actual: `发现: ${foundGlobalAvoids.join('、')}`
      });
    }
  }

  // 4. 检查回复长度(过短可能不完整)
  if (reply.length < 10) {
    issues.push({
      type: 'incomplete',
      severity: 'medium',
      message: '回复过短，可能不够完整',
      expected: '回复应至少包含基本的问候和指引',
      actual: `当前长度: ${reply.length} 字符`
    });
  }

  return {
    issues,
    passed: issues.filter(i => i.severity === 'high').length === 0
  };
}

/**
 * 检查期望动作是否执行
 * @param {string} reply - 客服回复
 * @param {Array} expectedActions - 期望动作列表
 * @returns {Object} 检查结果 { matched, unmatched }
 */
function checkExpectedActions(reply, expectedActions) {
  if (!expectedActions || expectedActions.length === 0) {
    return { matched: [], unmatched: [] };
  }

  const replyLower = reply.toLowerCase();
  
  // 简单关键词匹配期望动作
  const actionKeywords = {
    '礼貌问候': ['您好', '你好', '早上好', '下午好'],
    '安抚': ['理解', '抱歉', '别担心', '我们会尽快', '协助'],
    '确认': ['确认', '收到', '好的', '明白'],
    '询问': ['请问', '能否', '麻烦', '请提供'],
    '说明': ['说明', '告知', '预计', '将为您'],
    '承诺': ['会', '将', '承诺', '保证', '尽快']
  };

  const matched = [];
  const unmatched = [];

  expectedActions.forEach(action => {
    const keywords = actionKeywords[action] || [action];
    const hasMatch = keywords.some(kw => replyLower.includes(kw.toLowerCase()));
    
    if (hasMatch) {
      matched.push(action);
    } else {
      unmatched.push(action);
    }
  });

  return { matched, unmatched };
}

module.exports = { checkReplyQuality, checkExpectedActions };
