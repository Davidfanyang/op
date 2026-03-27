function formatScenarioList(scenarios) {
  return scenarios.map((s, i) => `${i + 1}. ${s.title}`).join('\n');
}

function formatResultMessage(result, scenario, customerMessage, userReply) {
  const findings = (result.findings || []).slice(0, 3).map((f) => `- ${f.message || f}`).join('\n') || '- 暂无';
  const suggestions = (result.suggestions || []).slice(0, 3).map((s) => `- ${s}`).join('\n') || '- 暂无';
  return [
    `【${result.score >= 80 ? '合格' : '待改进'}】${scenario.title}`,
    `用户：${customerMessage}`,
    `你的回复：${userReply}`,
    '',
    `总分：${result.score}`,
    `结论：${result.coachSummary}`,
    '',
    '核心问题：',
    findings,
    '',
    '改进建议：',
    suggestions,
    '',
    '参考回复：',
    result.standardReply,
    '',
    '下一步：发送 /score 开始下一轮，发送 /cancel 取消当前流程。'
  ].join('\n');
}

function formatUsage() {
  return '发送 /score 开始评分。\n流程：选场景 -> 发“默认”或用户消息 -> 发客服回复。\n可用命令：/start /score /cancel';
}

function formatScenarioPrompt(scenarios) {
  return `请选择场景，回复编号即可：\n${formatScenarioList(scenarios)}`;
}

function formatScenarioSelected(title) {
  return `已选择场景：${title}\n请发送用户消息，或回复“默认”使用系统默认问题。`;
}

function formatCustomerMessageRecorded(customerMessage) {
  return `用户消息已记录：${customerMessage}\n请发送你的客服回复。`;
}

module.exports = {
  formatScenarioList,
  formatResultMessage,
  formatUsage,
  formatScenarioPrompt,
  formatScenarioSelected,
  formatCustomerMessageRecorded
};
