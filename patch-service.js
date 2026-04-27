const fs = require('fs');
const content = fs.readFileSync('services/live-monitor-service.js', 'utf8');

// 替换 _createReviewItem 方法
const oldMethod = `  async _createReviewItem(analysis, message, session, input) {
    const projectId = analysis.project || analysis.projectId || input.projectId || input.project || 'default';
    const alertLevel = analysis.alertLevel || analysis.alert_level || 'warning';
    
    console.log('[LiveMonitor] 创建 review item:', {
      evaluationId: analysis.evaluationId,
      projectId: projectId,
      alertLevel: alertLevel
    });
    
    return this.repos.review.create({
      evaluationId: analysis.evaluationId,
      messageId: message.messageId,
      sessionId: session.sessionId,
      projectId: projectId,
      alertLevel: alertLevel,
      reviewStatus: 'pending',
      mode: 'live_monitor',
      channel: input.channel || 'telegram',
      employeeId: input.employeeId || null,
      customerId: input.customerId || null
    });
  }`;

const newMethod = `  async _createReviewItem(analysis, message, session, input, suggestionResult) {
    const projectId = analysis.project || analysis.projectId || input.projectId || input.project || 'default';
    const alertLevel = analysis.alertLevel || analysis.alert_level || 'warning';
    
    console.log('[LiveMonitor] 创建 review item:', {
      evaluationId: analysis.evaluationId,
      projectId: projectId,
      alertLevel: alertLevel,
      suggestionId: suggestionResult?.suggestion_id || null
    });
    
    return this.repos.review.create({
      evaluationId: analysis.evaluationId,
      messageId: message.messageId,
      sessionId: session.sessionId,
      projectId: projectId,
      alertLevel: alertLevel,
      reviewStatus: 'pending',
      mode: 'live_monitor',
      channel: input.channel || 'telegram',
      employeeId: input.employeeId || null,
      customerId: input.customerId || null,
      suggestionId: suggestionResult?.suggestion_id || null
    });
  }`;

if (content.includes(oldMethod)) {
  const newContent = content.replace(oldMethod, newMethod);
  fs.writeFileSync('services/live-monitor-service.js', newContent);
  console.log('File updated successfully');
} else {
  console.log('Pattern not found, trying alternative...');
  // 如果精确匹配失败，尝试替换函数签名
  const newContent = content.replace(
    'async _createReviewItem(analysis, message, session, input) {',
    'async _createReviewItem(analysis, message, session, input, suggestionResult) {'
  ).replace(
    "console.log('[LiveMonitor] 创建 review item:', {",
    "console.log('[LiveMonitor] 创建 review item:', {"
  ).replace(
    "alertLevel: alertLevel\n    });",
    "alertLevel: alertLevel,\n      suggestionId: suggestionResult?.suggestion_id || null\n    });"
  ).replace(
    "customerId: input.customerId || null\n    });",
    "customerId: input.customerId || null,\n      suggestionId: suggestionResult?.suggestion_id || null\n    });"
  );
  fs.writeFileSync('services/live-monitor-service.js', newContent);
  console.log('File updated with alternative method');
}
