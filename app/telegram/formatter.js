function formatScenarioList(scenarios) {
  return scenarios.map((s, i) => `${i + 1}. ${s.title}`).join('\n');
}

function formatResultMessage(result, scenario, customerMessage, userReply) {
  // 使用标准输出协议 v1.0
  // result 结构: { scenarioId, scenarioName, stage, result, riskLevel, issues, missing, strengths, nextAction, coachSummary, confidence }
  
  // 评估等级映射
  const levelEmoji = {
    'pass': '✅',
    'borderline': '⚠️',
    'fail': '❌',
    'risk': '🚨'
  };
  const levelText = {
    'pass': '通过',
    'borderline': '临界',
    'fail': '不通过',
    'risk': '风险'
  };
  
  const resultLevel = result.result || 'unknown';
  const emoji = levelEmoji[resultLevel] || '📋';
  const text = levelText[resultLevel] || '未知';
  
  // 构建消息
  const lines = [
    `${emoji} *${text}* - ${result.scenarioName || scenario.title}`,
    `阶段: ${result.stage || '未知'}`,
    '',
    `*用户:* ${customerMessage}`,
    `*你的回复:* ${userReply}`,
    '',
    `*评估结果:* ${text} (${resultLevel})`,
    `*风险等级:* ${result.riskLevel || 'unknown'}`,
    `*置信度:* ${Math.round((result.confidence || 0) * 100)}%`,
    ''
  ];
  
  // 问题项（issues 是字符串数组）
  if (result.issues && result.issues.length > 0) {
    lines.push('*🔴 问题项:*');
    result.issues.slice(0, 5).forEach(issue => {
      lines.push(`• ${issue}`);
    });
    lines.push('');
  }
  
  // 缺失信息（missing 是字符串数组）
  if (result.missing && result.missing.length > 0) {
    lines.push('*⚠️ 缺失关键词:*');
    result.missing.slice(0, 5).forEach(item => {
      lines.push(`• ${item}`);
    });
    lines.push('');
  }
  
  // 优点（strengths 是字符串数组）
  if (result.strengths && result.strengths.length > 0) {
    lines.push('*✅ 优点:*');
    result.strengths.slice(0, 3).forEach(item => {
      lines.push(`• ${item}`);
    });
    lines.push('');
  }
  
  // 教练总结
  if (result.coachSummary) {
    lines.push('*📝 评价:*');
    lines.push(result.coachSummary);
    lines.push('');
  }
  
  // 下一步行动
  if (result.nextAction) {
    lines.push('*👉 改进建议:*');
    lines.push(result.nextAction);
    lines.push('');
  }
  
  lines.push('发送 /start 开始下一轮练习');
  
  return lines.join('\n');
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