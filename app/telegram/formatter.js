function formatScenarioList(scenarios) {
  return scenarios.map((s, i) => `${i + 1}. ${s.title}`).join('\n');
}

function formatResultMessage(result, scenario, customerMessage, userReply) {
  // 如果没有返回 findings/suggestions，根据分数生成默认内容
  let findings = (result.findings || []).slice(0, 3).map((f) => `- ${f.message || f}`).join('\n');
  let suggestions = (result.suggestions || []).slice(0, 3).map((s) => `- ${s}`).join('\n');
  
  // 根据分数生成默认建议
  if (!findings) {
    if (result.score >= 90) {
      findings = '- 回复质量优秀，无明显问题';
    } else if (result.score >= 80) {
      findings = '- 回复基本合格，可进一步优化细节';
    } else if (result.score >= 60) {
      findings = '- 回复方向正确，但存在改进空间';
    } else {
      findings = '- 回复需要大幅改进，请参考标准话术';
    }
  }
  
  if (!suggestions) {
    if (result.score >= 90) {
      suggestions = '- 保持当前水平，继续加油！';
    } else if (result.score >= 80) {
      suggestions = '- 可参考标准回复优化表达方式';
    } else if (result.score >= 60) {
      suggestions = '- 建议对照标准回复学习关键话术\n- 注意礼貌用语和安抚表达';
    } else {
      suggestions = '- 请认真学习标准回复话术\n- 注意收集必要信息\n- 加强礼貌和安抚表达';
    }
  }
  
  // 添加维度得分详情
  const dims = result.dimensionScores || {};
  const dimText = `态度:${dims.attitude || 0} 流程:${dims.process || 0} 信息:${dims.information || 0} 安抚:${dims.empathy || 0} 清晰:${dims.clarity || 0}`;
  
  return [
    `*${result.score >= 80 ? '✅ 评分合格' : '⚠️ 需要改进'}*: ${scenario.title}`,
    '',
    `*用户:* ${customerMessage}`,
    `*你的回复:* ${userReply}`,
    '',
    `*总分:* ${result.score}/100`,
    `*维度:* ${dimText}`,
    `*评价:* ${result.coachSummary}`,
    '',
    '*需要改进:*',
    findings,
    '',
    '*建议:*',
    suggestions,
    '',
    '*参考回复:*',
    result.standardReply,
    '',
    '👉 发送 /score 开始下一轮评分'
  ].join('\n');
}

function formatUsage() {
  return '*客服训练机器人使用说明*\n\n' + 
         '👉 发送 */score* 开始评分\n\n' + 
         '*评分流程:*\n' + 
         '1️⃣ 选择场景\n' + 
         '2️⃣ 发送用户消息或回复"默认"\n' + 
         '3️⃣ 发送你的客服回复\n\n' + 
         '*可用命令:*\n' + 
         '*/start* - 重新开始\n' + 
         '*/score* - 开始评分\n' + 
         '*/cancel* - 取消当前流程';
}

function formatWelcomeMessage(username) {
  return `*欢迎 ${username || ''}! 👋*\n\n` +
         '我是客服训练机器人，可以帮你评估客服回复质量。\n' +
         '发送 */score* 开始练习！';
}

function formatScenarioPrompt(scenarios) {
  return `*请选择场景* 📝\n\n${formatScenarioList(scenarios)}\n\n回复数字编号选择场景。`;
}

function formatScenarioSelected(title) {
  return `*已选择场景:* ${title} ✅\n\n` + 
         '请发送用户消息内容，或回复 *默认* 使用系统预设问题。';
}

function formatCustomerMessageRecorded(customerMessage) {
  return `*用户消息已记录* ✅\n\n` +
         `"${customerMessage}"\n\n` +
         '现在，请发送你的客服回复。\n' +
         '系统会对你的回复进行评分。';
}

module.exports = {
  formatScenarioList,
  formatResultMessage,
  formatUsage,
  formatScenarioPrompt,
  formatScenarioSelected,
  formatCustomerMessageRecorded,
  formatWelcomeMessage
};