#!/usr/bin/env node
/**
 * test-live-conversation-builder.js - 实时会话拼接功能测试
 * 
 * 测试内容：
 * 1. 会话创建和超时逻辑
 * 2. 消息去重
 * 3. 角色识别（user / agent）
 * 4. conversation 拼接顺序
 * 5. 输出结构验证
 * 6. 多 chat_id 隔离
 */

const { LiveConversationBuilder } = require('./services/live-conversation-builder');

// 测试配置
const builder = new LiveConversationBuilder({
  timeoutMs: 10000 // 10秒超时（测试用，生产环境为10分钟）
});

// 辅助函数：创建标准消息
function createMessage(overrides = {}) {
  const base = {
    source: 'telegram',
    entry_type: 'live_monitor',
    chat_id: '-1001234567890',
    message_id: 1001,
    sender_id: 12345,
    sender_name: 'test_user',
    message_text: '测试消息',
    timestamp: new Date().toISOString()
  };
  return { ...base, ...overrides };
}

// 测试计数器
let passedCount = 0;
let failedCount = 0;

function assert(condition, testName, details = '') {
  if (condition) {
    console.log(`  ✅ ${testName}`);
    passedCount++;
  } else {
    console.log(`  ❌ ${testName}${details ? ' - ' + details : ''}`);
    failedCount++;
  }
}

/**
 * 测试 1: 基础会话创建
 */
async function testSessionCreation() {
  console.log('\n' + '='.repeat(60));
  console.log('测试 1: 基础会话创建');
  console.log('='.repeat(60));

  const msg1 = createMessage({
    message_id: 1001,
    sender_id: 12345,
    message_text: '你好，我想咨询一个问题'
  });

  const result1 = await builder.processMessage(msg1);

  assert(result1.chat_id === '-1001234567890', 'chat_id 正确');
  assert(result1.session_key.startsWith('live_-1001234567890_'), 'session_key 格式正确');
  assert(result1.conversation.length === 1, 'conversation 长度为 1');
  assert(result1.conversation[0].role === 'user', '首条消息角色为 user');
  assert(result1.conversation[0].content === '你好，我想咨询一个问题', '消息内容正确');
  assert(result1.last_message_id === 1001, 'last_message_id 正确');
  assert(typeof result1.updated_at === 'string', 'updated_at 存在');
}

/**
 * 测试 2: 消息去重
 */
async function testMessageDeduplication() {
  console.log('\n' + '='.repeat(60));
  console.log('测试 2: 消息去重');
  console.log('='.repeat(60));

  const msg1 = createMessage({
    message_id: 2001,
    sender_id: 12345,
    message_text: '这是第一条消息'
  });

  const result1 = await builder.processMessage(msg1);
  const length1 = result1.conversation.length;

  // 发送相同的 message_id
  const msg2 = createMessage({
    message_id: 2001,
    sender_id: 12345,
    message_text: '这是重复消息'
  });

  const result2 = await builder.processMessage(msg2);

  assert(result2.conversation.length === length1, '重复消息未添加', 
    `期望 ${length1}，实际 ${result2.conversation.length}`);
  assert(result2.conversation[0].content === '这是第一条消息', '保留原始消息内容');
}

/**
 * 测试 3: 角色识别 - 交替消息
 */
async function testRoleIdentification() {
  console.log('\n' + '='.repeat(60));
  console.log('测试 3: 角色识别 - 交替消息');
  console.log('='.repeat(60));

  const chatId = '-1009998887776';

  // 用户消息
  const userMsg = createMessage({
    chat_id: chatId,
    message_id: 3001,
    sender_id: 11111,
    message_text: '用户提问'
  });

  const result1 = await builder.processMessage(userMsg);
  assert(result1.conversation[0].role === 'user', '第一条消息识别为 user');

  // 客服消息（不同 sender_id）
  const agentMsg = createMessage({
    chat_id: chatId,
    message_id: 3002,
    sender_id: 22222,
    message_text: '客服回复'
  });

  const result2 = await builder.processMessage(agentMsg);
  assert(result2.conversation[1].role === 'agent', '第二条消息识别为 agent');

  // 用户再次发送
  const userMsg2 = createMessage({
    chat_id: chatId,
    message_id: 3003,
    sender_id: 11111,
    message_text: '用户再次提问'
  });

  const result3 = await builder.processMessage(userMsg2);
  assert(result3.conversation[2].role === 'user', '第三条消息识别为 user');

  // 验证顺序
  assert(
    result3.conversation[0].role === 'user' && 
    result3.conversation[1].role === 'agent' && 
    result3.conversation[2].role === 'user',
    '消息顺序正确（user -> agent -> user）'
  );
}

/**
 * 测试 4: 会话超时逻辑
 */
async function testSessionTimeout() {
  console.log('\n' + '='.repeat(60));
  console.log('测试 4: 会话超时逻辑');
  console.log('='.repeat(60));

  const chatId = '-1007776665554';

  // 第一条消息
  const msg1 = createMessage({
    chat_id: chatId,
    message_id: 4001,
    sender_id: 12345,
    message_text: '第一条消息',
    timestamp: new Date(Date.now() - 15000).toISOString() // 15秒前
  });

  const result1 = await builder.processMessage(msg1);
  const firstSessionKey = result1.session_key;

  // 第二条消息（超过10秒超时）
  const msg2 = createMessage({
    chat_id: chatId,
    message_id: 4002,
    sender_id: 12345,
    message_text: '超时后的消息',
    timestamp: new Date().toISOString() // 现在
  });

  const result2 = await builder.processMessage(msg2);

  assert(result2.session_key !== firstSessionKey, '超时后生成新 session_key', 
    `旧: ${firstSessionKey}, 新: ${result2.session_key}`);
  assert(result2.conversation.length === 1, '新会话从 1 开始');
  assert(result2.conversation[0].content === '超时后的消息', '新会话包含新消息');
}

/**
 * 测试 5: 多 chat_id 隔离
 */
async function testChatIsolation() {
  console.log('\n' + '='.repeat(60));
  console.log('测试 5: 多 chat_id 隔离');
  console.log('='.repeat(60));

  const chatId1 = '-1001112223334';
  const chatId2 = '-1005556667778';

  // chat1 的消息
  const msg1 = createMessage({
    chat_id: chatId1,
    message_id: 5001,
    sender_id: 12345,
    message_text: 'chat1 的消息'
  });

  const result1 = await builder.processMessage(msg1);

  // chat2 的消息
  const msg2 = createMessage({
    chat_id: chatId2,
    message_id: 5002,
    sender_id: 12345,
    message_text: 'chat2 的消息'
  });

  const result2 = await builder.processMessage(msg2);

  assert(result1.chat_id === chatId1, 'result1 属于 chat1');
  assert(result2.chat_id === chatId2, 'result2 属于 chat2');
  assert(result1.session_key !== result2.session_key, '不同 chat_id 有不同 session_key');
  assert(result1.conversation[0].content === 'chat1 的消息', 'chat1 内容独立');
  assert(result2.conversation[0].content === 'chat2 的消息', 'chat2 内容独立');
}

/**
 * 测试 6: 输出结构验证
 */
async function testOutputStructure() {
  console.log('\n' + '='.repeat(60));
  console.log('测试 6: 输出结构验证');
  console.log('='.repeat(60));

  const msg = createMessage({
    message_id: 6001,
    sender_id: 12345,
    message_text: '结构测试消息'
  });

  const result = await builder.processMessage(msg);

  // 验证必填字段
  const requiredFields = ['chat_id', 'session_key', 'conversation', 'last_message_id', 'updated_at'];
  const missingFields = requiredFields.filter(field => !(field in result));
  assert(missingFields.length === 0, '输出包含所有必填字段', 
    missingFields.length > 0 ? `缺少: ${missingFields.join(', ')}` : '');

  // 验证 conversation 子项结构
  if (result.conversation.length > 0) {
    const firstMsg = result.conversation[0];
    const msgRequiredFields = ['role', 'content', 'timestamp'];
    const msgMissingFields = msgRequiredFields.filter(field => !(field in firstMsg));
    assert(msgMissingFields.length === 0, 'conversation 子项包含 role/content/timestamp',
      msgMissingFields.length > 0 ? `缺少: ${msgMissingFields.join(', ')}` : '');
    
    assert(['user', 'agent'].includes(firstMsg.role), 'role 值为 user 或 agent');
    assert(typeof firstMsg.content === 'string', 'content 为字符串');
    assert(typeof firstMsg.timestamp === 'string', 'timestamp 为字符串');
  }
}

/**
 * 测试 7: 多轮对话拼接
 */
async function testMultiTurnConversation() {
  console.log('\n' + '='.repeat(60));
  console.log('测试 7: 多轮对话拼接');
  console.log('='.repeat(60));

  const chatId = '-1003334445556';
  const messages = [
    { message_id: 7001, sender_id: 111, text: '你好' },
    { message_id: 7002, sender_id: 222, text: '您好，有什么可以帮您？' },
    { message_id: 7003, sender_id: 111, text: '我想查询订单' },
    { message_id: 7004, sender_id: 222, text: '请提供订单号' },
    { message_id: 7005, sender_id: 111, text: '订单号是 123456' }
  ];

  let result;
  for (const msg of messages) {
    result = await builder.processMessage(createMessage({
      chat_id: chatId,
      message_id: msg.message_id,
      sender_id: msg.sender_id,
      message_text: msg.text
    }));
  }

  assert(result.conversation.length === 5, 'conversation 包含 5 条消息',
    `实际长度: ${result.conversation.length}`);
  
  // 验证角色交替
  const roles = result.conversation.map(m => m.role);
  assert(
    roles[0] === 'user' && roles[1] === 'agent' && roles[2] === 'user' && 
    roles[3] === 'agent' && roles[4] === 'user',
    '角色交替正确（user -> agent -> user -> agent -> user）'
  );

  // 验证内容顺序
  assert(result.conversation[0].content === '你好', '第1条消息内容正确');
  assert(result.conversation[2].content === '我想查询订单', '第3条消息内容正确');
  assert(result.conversation[4].content === '订单号是 123456', '第5条消息内容正确');
}

/**
 * 测试 8: 实时会话与训练会话隔离验证
 */
async function testIsolationFromTraining() {
  console.log('\n' + '='.repeat(60));
  console.log('测试 8: 实时会话与训练会话隔离验证');
  console.log('='.repeat(60));

  // 实时会话的 session_key 以 "live_" 开头
  const msg = createMessage({
    message_id: 8001,
    sender_id: 12345,
    message_text: '实时消息'
  });

  const result = await builder.processMessage(msg);

  assert(result.session_key.startsWith('live_'), '实时会话 session_key 以 live_ 开头');
  assert(!result.session_key.includes('training'), 'session_key 不包含 training');
  
  console.log('  ℹ️  训练会话使用 training-session-store.js，实时会话使用 live-conversation-builder.js');
  console.log('  ℹ️  两者使用不同的存储和 session_key 命名规则，完全隔离');
}

/**
 * 运行所有测试
 */
async function runAllTests() {
  console.log('='.repeat(60));
  console.log('开始测试实时会话拼接功能');
  console.log('='.repeat(60));

  try {
    await testSessionCreation();
    await testMessageDeduplication();
    await testRoleIdentification();
    await testSessionTimeout();
    await testChatIsolation();
    await testOutputStructure();
    await testMultiTurnConversation();
    await testIsolationFromTraining();

    console.log('\n' + '='.repeat(60));
    console.log('测试结果汇总');
    console.log('='.repeat(60));
    console.log(`通过: ${passedCount}`);
    console.log(`失败: ${failedCount}`);
    console.log(`总计: ${passedCount + failedCount}`);
    console.log('='.repeat(60));

    if (failedCount === 0) {
      console.log('✅ 所有测试通过！');
      process.exit(0);
    } else {
      console.log('❌ 部分测试失败');
      process.exit(1);
    }
  } catch (err) {
    console.error('\n❌ 测试执行出错:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

// 执行测试
runAllTests();
