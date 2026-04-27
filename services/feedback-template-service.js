/**
 * 训练反馈模板服务
 * 
 * 职责：
 * 1. 接收分析结果
 * 2. 生成客服可读的 feedback_text（用于 TG 消息）
 * 3. 生成 structured_feedback（用于后续入库）
 * 
 * 反馈内容包含：
 * - 场景
 * - 当前轮次
 * - 本轮做得好的地方
 * - 本轮存在的问题
 * - 本轮缺失项
 * - 下一步建议
 * - 训练状态（继续训练 / 本轮结束）
 */

/**
 * 生成训练反馈
 * 
 * @param {Object} params
 * @param {Object} params.scenario - 场景对象
 * @param {number} params.round - 当前轮次（从 0 开始）
 * @param {Object} params.analysis - 分析结果
 * @param {boolean} params.isFinished - 是否训练结束
 * @returns {Object} { feedback_text, structured_feedback }
 */
function generateFeedback({ scenario, round, analysis, isFinished }) {
  // 1. 提取分析结果中的关键信息
  const strengths = extractStrengths(analysis);
  const problems = extractProblems(analysis);
  const missing = extractMissing(analysis);
  const suggestions = generateSuggestions(analysis, strengths, problems, missing);
  const statusText = isFinished ? '🏁 本轮结束' : '🔄 继续训练';

  // 2. 生成客服可读的反馈文本
  const feedbackText = buildFeedbackText({
    scenario,
    round,
    strengths,
    problems,
    missing,
    suggestions,
    statusText,
    isFinished
  });

  // 3. 生成结构化反馈（用于入库）
  const structuredFeedback = {
    scenario_id: scenario.id,
    scenario_title: scenario.title,
    round: round + 1, // 转换为从 1 开始
    strengths,
    problems,
    missing,
    suggestions,
    is_finished: isFinished,
    status: isFinished ? 'finished' : 'continuing',
    generated_at: new Date().toISOString()
  };

  return {
    feedback_text: feedbackText,
    structured_feedback: structuredFeedback
  };
}

/**
 * 提取优点
 */
function extractStrengths(analysis) {
  if (!analysis.strengths || analysis.strengths.length === 0) {
    return [];
  }
  
  // strengths 可能是字符串数组或对象数组
  return analysis.strengths.map(s => {
    if (typeof s === 'string') return s;
    if (s.text) return s.text;
    if (s.message) return s.message;
    return String(s);
  }).filter(s => s && s.length > 0);
}

/**
 * 提取问题
 */
function extractProblems(analysis) {
  // 优先使用 problems，其次使用 issues
  const problems = analysis.problems || analysis.issues || [];
  
  if (problems.length === 0) {
    return [];
  }
  
  // problems/issues 可能是字符串数组或对象数组
  return problems.map(p => {
    if (typeof p === 'string') return p;
    if (p.message) return p.message;
    if (p.text) return p.text;
    return String(p);
  }).filter(p => p && p.length > 0);
}

/**
 * 提取缺失项
 */
function extractMissing(analysis) {
  if (!analysis.missing || analysis.missing.length === 0) {
    return [];
  }
  
  // missing 可能是字符串数组或对象数组
  return analysis.missing.map(m => {
    if (typeof m === 'string') return m;
    if (m.message) return m.message;
    if (m.text) return m.text;
    return String(m);
  }).filter(m => m && m.length > 0);
}

/**
 * 生成可执行的建议
 * 
 * 严格要求：
 * - 建议必须可执行，不能只是重复问题
 * - 需要基于问题、缺失项和优点综合生成
 */
function generateSuggestions(analysis, strengths, problems, missing) {
  const suggestions = [];
  
  // 1. 基于问题生成改进建议
  if (problems.length > 0) {
    problems.forEach(problem => {
      const suggestion = convertProblemToSuggestion(problem, analysis);
      if (suggestion) {
        suggestions.push(suggestion);
      }
    });
  }
  
  // 2. 基于缺失项生成补充建议
  if (missing.length > 0) {
    missing.forEach(item => {
      const suggestion = convertMissingToSuggestion(item, analysis);
      if (suggestion) {
        suggestions.push(suggestion);
      }
    });
  }
  
  // 3. 如果没有具体问题，给出通用建议
  if (suggestions.length === 0) {
    if (strengths.length > 0) {
      suggestions.push('保持当前的服务态度和专业水平，继续保持！');
    } else {
      suggestions.push('建议多练习场景对话，提升服务意识和沟通技巧。');
    }
  }
  
  // 4. 去重并限制数量
  const uniqueSuggestions = [...new Set(suggestions)];
  return uniqueSuggestions.slice(0, 3); // 最多 3 条建议
}

/**
 * 将问题转换为可执行的建议
 */
function convertProblemToSuggestion(problem, analysis) {
  const problemLower = problem.toLowerCase();
  
  // 针对常见问题类型给出具体建议
  if (problemLower.includes('语气') || problemLower.includes('态度')) {
    return '注意调整语气，使用更友善、专业的表达方式。';
  }
  
  if (problemLower.includes('信息') || problemLower.includes('完整')) {
    return '确保回复包含所有必要信息，避免遗漏关键步骤。';
  }
  
  if (problemLower.includes('流程') || problemLower.includes('步骤')) {
    return '按照标准流程逐步引导客户，不要跳过关键环节。';
  }
  
  if (problemLower.includes('确认') || problemLower.includes('核实')) {
    return '在操作前先确认客户身份和关键信息，避免误操作。';
  }
  
  if (problemLower.includes('解决') || problemLower.includes('方案')) {
    return '提供明确的解决方案，而不是模糊的回复。';
  }
  
  // 通用转换：将问题描述转为建议
  if (problem.includes('没有') || problem.includes('未') || problem.includes('缺少')) {
    return `注意补充${problem.replace(/没有|未|缺少的?/g, '')}。`;
  }
  
  // 默认：给出改进方向
  return `需要改进：${problem}`;
}

/**
 * 将缺失项转换为可执行的建议
 */
function convertMissingToSuggestion(missingItem, analysis) {
  const missingLower = missingItem.toLowerCase();
  
  // 针对常见缺失类型给出具体建议
  if (missingLower.includes('身份') || missingLower.includes('验证')) {
    return '请先验证客户身份，确认关键信息后再进行操作。';
  }
  
  if (missingLower.includes('步骤') || missingLower.includes('流程')) {
    return '补充完整的操作步骤，确保客户能够顺利完成。';
  }
  
  if (missingLower.includes('联系方式') || missingLower.includes('手机')) {
    return '记得收集或确认客户的联系方式，便于后续跟进。';
  }
  
  if (missingLower.includes('解释') || missingLower.includes('说明')) {
    return '对客户的问题进行详细解释，避免简单回复。';
  }
  
  // 通用转换
  return `需要补充：${missingItem}`;
}

/**
 * 构建客服可读的反馈文本
 * 
 * 严格要求：
 * - 返回内容必须是人话
 * - 不能直接返回 JSON
 * - 不能直接返回技术日志
 */
function buildFeedbackText({ scenario, round, strengths, problems, missing, suggestions, statusText, isFinished }) {
  const lines = [];
  
  // 标题
  lines.push(`📋 *训练反馈 - 第 ${round + 1} 轮*`);
  lines.push('');
  
  // 场景信息
  lines.push(`*场景：* ${scenario.title}`);
  lines.push('');
  
  // 做得好的地方
  if (strengths.length > 0) {
    lines.push(`✅ *本轮做得好的地方：*`);
    strengths.forEach(s => {
      lines.push(`• ${s}`);
    });
    lines.push('');
  } else {
    lines.push(`✅ *本轮做得好的地方：*`);
    lines.push('• 本轮暂未发现突出优点，继续加油！');
    lines.push('');
  }
  
  // 存在的问题
  if (problems.length > 0) {
    lines.push(`🔴 *本轮存在的问题：*`);
    problems.forEach(p => {
      lines.push(`• ${p}`);
    });
    lines.push('');
  } else {
    lines.push(`🔴 *本轮存在的问题：*`);
    lines.push('• 本轮没有发现明显问题，做得很好！');
    lines.push('');
  }
  
  // 缺失项
  if (missing.length > 0) {
    lines.push(`⚠️ *本轮缺失项：*`);
    missing.forEach(m => {
      lines.push(`• ${m}`);
    });
    lines.push('');
  } else {
    lines.push(`⚠️ *本轮缺失项：*`);
    lines.push('• 本轮没有遗漏关键信息，继续保持！');
    lines.push('');
  }
  
  // 下一步建议
  lines.push(`💡 *下一步建议：*`);
  suggestions.forEach(s => {
    lines.push(`• ${s}`);
  });
  lines.push('');
  
  // 训练状态
  if (isFinished) {
    lines.push(`🏁 *训练状态：* 本轮结束`);
    lines.push('');
    lines.push('_发送 /start 开始下一轮训练_');
  } else {
    lines.push(`🔄 *训练状态：* 继续训练`);
    lines.push('');
    lines.push('_请继续回复用户消息_');
  }
  
  return lines.join('\n');
}

module.exports = {
  generateFeedback
};
