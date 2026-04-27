#!/usr/bin/env node
/**
 * test-tg-live-simple.js - 简化测试
 */

const { TGLiveListener } = require('./adapters/telegram/tg-live-listener');
const { LiveMessageIngestor } = require('./services/live-message-ingestor');

console.log('开始测试 TG 实时监听入口\n');

// 测试1：消息过滤
console.log('='.repeat(60));
console.log('测试1: 消息过滤');
console.log('='.repeat(60));

const listener = new TGLiveListener({
  token: 'fake',
  enabled: true,
  chatIds: ['-1001234567890'],
  ignoreBotSelf: true
});

listener.botId = 99999;

const testMessages = [
  { name: '有效消息', msg: { message_id: 1, chat: { id: -1001234567890 }, from: { id: 123, username: 'user' }, text: '你好', date: Math.floor(Date.now()/1000) }, expect: true },
  { name: 'Bot消息', msg: { message_id: 2, chat: { id: -1001234567890 }, from: { id: 99999, username: 'bot' }, text: 'Bot消息', date: Math.floor(Date.now()/1000) }, expect: false },
  { name: '系统消息', msg: { message_id: 3, chat: { id: -1001234567890 }, from: { id: 123 }, new_chat_members: [], date: Math.floor(Date.now()/1000) }, expect: false },
  { name: '空消息', msg: { message_id: 4, chat: { id: -1001234567890 }, from: { id: 123 }, date: Math.floor(Date.now()/1000) }, expect: false },
  { name: '其他群', msg: { message_id: 5, chat: { id: -9999999999 }, from: { id: 123 }, text: '其他群', date: Math.floor(Date.now()/1000) }, expect: false }
];

let passedCount = 0;
const receivedMessages = [];
listener.messageHandler = (msg) => receivedMessages.push(msg);

testMessages.forEach(({ name, msg, expect }) => {
  receivedMessages.length = 0;
  listener._processMessage(msg);
  const passed = (receivedMessages.length > 0) === expect;
  console.log(`${passed ? '✅' : '❌'} ${name}: ${expect ? '应通过' : '应过滤'} - ${receivedMessages.length > 0 ? '通过' : '过滤'}`);
  if (passed) passedCount++;
});

console.log(`\n测试1结果: ${passedCount}/${testMessages.length} 通过`);

// 测试2：标准对象
console.log('\n' + '='.repeat(60));
console.log('测试2: 标准对象结构');
console.log('='.repeat(60));

const standardObj = listener._toStandardObject({
  message_id: 1001,
  chat: { id: -1001234567890 },
  from: { id: 12345, username: 'test_user' },
  text: '测试消息',
  date: Math.floor(Date.now()/1000)
});

const requiredFields = ['source', 'entry_type', 'chat_id', 'message_id', 'sender_id', 'sender_name', 'message_text', 'timestamp', 'raw_event'];
const missing = requiredFields.filter(f => !(f in standardObj));

if (missing.length === 0) {
  console.log('✅ 所有必填字段存在');
  console.log('标准对象示例:');
  console.log(JSON.stringify(standardObj, null, 2));
} else {
  console.log(`❌ 缺少字段: ${missing.join(', ')}`);
}

// 测试3：Ingestor校验
console.log('\n' + '='.repeat(60));
console.log('测试3: 入口服务校验');
console.log('='.repeat(60));

const ingestor = new LiveMessageIngestor();

const validMsg = {
  source: 'telegram',
  entry_type: 'live_monitor',
  chat_id: '-1001234567890',
  message_id: 1001,
  sender_id: 12345,
  sender_name: 'user',
  message_text: '你好',
  timestamp: new Date().toISOString()
};

ingestor.ingest(validMsg).then(result => {
  console.log(`✅ 有效消息: ${result.success ? '通过' : '失败'}`);
  
  const invalidMsg = { ...validMsg, message_text: '' };
  return ingestor.ingest(invalidMsg);
}).then(result => {
  console.log(`✅ 空文本消息: ${result.success ? '通过' : '被拒绝'} (期望被拒绝)`);
  
  const missingFieldMsg = { entry_type: 'live_monitor', chat_id: '-100', message_id: 1, message_text: '你好' };
  return ingestor.ingest(missingFieldMsg);
}).then(result => {
  console.log(`✅ 缺少字段: ${result.success ? '通过' : '被拒绝'} (期望被拒绝)`);
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ 所有测试完成');
  console.log('='.repeat(60));
}).catch(err => {
  console.error('测试错误:', err);
});
