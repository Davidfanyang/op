function formatScenarioList(scenarios) {
  return scenarios.map((s, i) => `${i + 1}. ${s.title}`).join('\n');
}

function formatResultMessage(result, scenario, customerMessage, userReply) {
  // 根据分析等级生成默认反馈
  let findings = (result.findings || []).slice(0, 3).map((f) => `- ${f.message || f}`).join('\n');
  let suggestions = (result.suggestions || []).slice(0, 3).map((s) => `- ${s}`).join('\n');
  
  const level = result.result?.level || result.level || 'fail';
  
  // 根据等级生成默认建议
  if (!findings) {
    if (level === 'pass') {
      findings = '- 回复质量优秀，无明显问题';
    } else if (level === 'borderline') {
      findings = '- 回复基本合格，可进一步优化细节';
    } else if (level === 'fail') {
      findings = '- 回复方向正确，但存在改进空间';
    } else {
      findings = '- 回复存在风险，需要大幅改进';
    }
  }
  
  if (!suggestions) {
    if (level === 'pass') {
      suggestions = '- 保持当前水平，继续加油！';
    } else if (level === 'borderline') {
      suggestions = '- 可参考标准回复优化表达方式';
    } else if (level === 'fail') {
      suggestions = '- 建议对照标准回复学习关键话术\n- 注意礼貌用语和安抚表达';
    } else {
      suggestions = '- 请认真学习标准回复话术\n- 注意收集必要信息\n- 加强礼貌和安抚表达';
    }
  }
  
  // 等级标记
  const levelEmoji = {
    'pass': '✅',
    'borderline': '⚠️',
    'fail': '❌',
    'risk': '🚨'
  };
  const emoji = levelEmoji[level] || '📋';
  const levelText = {
    'pass': '通过',
    'borderline': '临界',
    'fail': '不通过',
    'risk': '风险'
  };
  
  return [
    `${emoji} *${levelText[level] || '未知'}*: ${scenario.title}`,
    '',
    `*用户:* ${customerMessage}`,
    `*你的回复:* ${userReply}`,
    '',
    `*等级:* ${level}`,
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
    '👉 发送 /start 开始下一轮练习'
  ].join('\n');
}

function formatUsage() {
  return '*客服训练机器人使用说明*\n\n' + 
         '👉 发送 */start* 开始练习\n\n' + 
         '练习流程:\n' + 
         '1️⃣ 选择场景\n' + 
         '2️⃣ 发送用户消息或回复"默认"\n' + 
         '3️⃣ 发送你的客服回复\n\n' + 
         '可用命令:\n' + 
         '*/start* - 重新开始\n' + 
         '*/cancel* - 取消当前流程';
}

function formatWelcomeMessage(username) {
  return `*欢迎 ${username || ''}! 👋*\n\n` +
         '我是客服训练机器人，可以帮你评估客服回复质量。\n' +
         '发送 */start* 开始练习！';
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
         '系统会对你的回复进行分析评估。';
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