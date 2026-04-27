const { LiveConversationBuilder } = require('./services/live-conversation-builder');
console.log('模块加载成功');
console.log('LiveConversationBuilder:', typeof LiveConversationBuilder);

const builder = new LiveConversationBuilder();
console.log('实例创建成功');

const msg = {
  source: 'telegram',
  entry_type: 'live_monitor',
  chat_id: '-1001234567890',
  message_id: 1001,
  sender_id: 12345,
  sender_name: 'user123',
  message_text: '测试消息',
  timestamp: new Date().toISOString()
};

builder.processMessage(msg).then(result => {
  console.log('消息处理成功');
  console.log('结果:', JSON.stringify(result, null, 2));
}).catch(err => {
  console.error('处理失败:', err.message);
});
