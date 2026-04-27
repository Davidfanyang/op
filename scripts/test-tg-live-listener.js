#!/usr/bin/env node
/**
 * test-tg-live-listener.js - TG 实时监听入口测试
 * 
 * 测试内容：
 * 1. TGLiveListener 消息过滤逻辑
 * 2. LiveMessageIngestor 校验逻辑
 * 3. 统一对象结构验证
 */

const { TGLiveListener } = require('./adapters/telegram/tg-live-listener');
const { LiveMessageIngestor } = require('./services/live-message-ingestor');

// 模拟消息数据
const mockMessages = {
  // 有效消息
  validUserMessage: {
    message_id: 1001,
    chat: { id: -1001234567890, type: 'supergroup', title: '测试群' },
    from: { id: 12345, username: 'test_user', first_name: '测试用户' },
    text: '你好，我想咨询一下产品问题',
    date: Math.floor(Date.now() / 1000)
  },

  // Bot 自己的消息（应该被过滤）
  botMessage: {
    message_id: 1002,
    chat: { id: -1001234567890, type: 'supergroup', title: '测试群' },
    from: { id: 99999, username: 'my_bot', first_name: 'Bot', is_bot: true },
    text: '这是 Bot 自己的消息',
    date: Math.floor(Date.now() / 1000)
  },

  // 系统消息（应该被过滤）
  systemMessage: {
    message_id: 1003,
    chat: { id: -1001234567890, type: 'supergroup', title: '测试群' },
    from: { id: 12345, username: 'test_user' },
    new_chat_members: [{ id: 54321, username: 'new_user' }],
    date: Math.floor(Date.now() / 1000)
  },

  // 空消息（应该被过滤）
  emptyMessage: {
    message_id: 1004,
    chat: { id: -1001234567890, type: 'supergroup', title: '测试群' },
    from: { id: 12345, username: 'test_user' },
    date: Math.floor(Date.now() / 1000)
  },

  // 图片消息（应该被过滤）
  photoMessage: {
    message_id: 1005,
    chat: { id: -1001234567890, type: 'supergroup', title: '测试群' },
    from: { id: 12345, username: 'test_user' },
    photo: [{ file_id: 'xxx', file_size: 1000 }],
    date: Math.floor(Date.now() / 1000)
  },

  // 非指定群消息（应该被过滤）
  otherChatMessage: {
    message_id: 1006,
    chat: { id: -1009999999999, type: 'supergroup', title: '其他群' },
    from: { id: 12345, username: 'test_user' },
    text: '这是其他群的消息',
    date: Math.floor(Date.now() / 1000)
  }
};

/**
 * 测试 1: TGLiveListener 消息过滤
 */
function testMessageFiltering() {
  console.log('\n' + '='.repeat(60));
  console.log('测试 1: TGLiveListener 消息过滤');
  console.log('='.repeat(60));

  const receivedMessages = [];
  
  const listener = new TGLiveListener({
    token: 'fake_token',
    enabled: true,
    chatIds: ['-1001234567890'], // 只允许这个群
    ignoreBotSelf: true
  });

  // 设置 Bot ID
  listener.botId = 99999;

  // 模拟消息处理函数
  listener.messageHandler = (message) => {
    receivedMessages.push(message);
  };

  // 测试所有消息
  console.log('\n处理消息列表:');
  Object.entries(mockMessages).forEach(([name, message]) => {
    console.log(`\n[${name}]`);
    console.log(`  - message_id: ${message.message_id}`);
    console.log(`  - chat_id: ${message.chat.id}`);
    console.log(`  - from: ${message.from?.username || 'unknown'}`);
    console.log(`  - text: ${message.text || '(无文本)'}`);
    
    // 调用内部处理方法
    listener._processMessage(message);
  });

  // 验证结果
  console.log('\n' + '-'.repeat(60));
  console.log('过滤结果:');
  console.log(`  - 总消息数: ${Object.keys(mockMessages).length}`);
  console.log(`  - 通过过滤: ${receivedMessages.length}`);
  console.log(`  - 被过滤: ${Object.keys(mockMessages).length - receivedMessages.length}`);

  if (receivedMessages.length === 1 && 
      receivedMessages[0].message_id === 1001) {
    console.log('\n✅ 测试通过：只有有效用户消息通过过滤');
    return true;
  } else {
    console.log('\n❌ 测试失败：过滤逻辑有误');
    console.log('通过的消息 IDs:', receivedMessages.map(m => m.message_id));
    return false;
  }
}

/**
 * 测试 2: 统一对象结构验证
 */
function testStandardObjectStructure() {
  console.log('\n' + '='.repeat(60));
  console.log('测试 2: 统一对象结构验证');
  console.log('='.repeat(60));

  const listener = new TGLiveListener({
    token: 'fake_token',
    enabled: true
  });

  listener.botId = 99999;

  const validMessage = mockMessages.validUserMessage;
  const standardObj = listener._toStandardObject(validMessage);

  console.log('\n生成的标准对象:');
  console.log(JSON.stringify(standardObj, null, 2));

  // 验证必填字段
  const requiredFields = ['source', 'entry_type', 'chat_id', 'message_id', 'sender_id', 'sender_name', 'message_text', 'timestamp', 'raw_event'];
  const missingFields = requiredFields.filter(field => !(field in standardObj));

  if (missingFields.length > 0) {
    console.log(`\n❌ 测试失败：缺少字段 ${missingFields.join(', ')}`);
    return false;
  }

  // 验证字段值
  const checks = [
    { field: 'source', expected: 'telegram' },
    { field: 'entry_type', expected: 'live_monitor' },
    { field: 'chat_id', expected: '-1001234567890' },
    { field: 'message_id', expected: 1001 },
    { field: 'message_text', expected: '你好，我想咨询一下产品问题' }
  ];

  let allPassed = true;
  for (const check of checks) {
    if (standardObj[check.field] !== check.expected) {
      console.log(`\n❌ 字段 ${check.field} 错误: 期望 ${check.expected}, 实际 ${standardObj[check.field]}`);
      allPassed = false;
    }
  }

  // 验证 timestamp 是 ISO8601 格式
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/.test(standardObj.timestamp)) {
    console.log(`\n❌ timestamp 格式错误: ${standardObj.timestamp}`);
    allPassed = false;
  }

  // 验证 raw_event 保留了原始数据
  if (!standardObj.raw_event || standardObj.raw_event.message_id !== 1001) {
    console.log('\n❌ raw_event 未正确保留');
    allPassed = false;
  }

  if (allPassed) {
    console.log('\n✅ 测试通过：标准对象结构完整且正确');
    return true;
  } else {
    console.log('\n❌ 测试失败');
    return false;
  }
}

/**
 * 测试 3: LiveMessageIngestor 校验逻辑
 */
function testIngestorValidation() {
  console.log('\n' + '='.repeat(60));
  console.log('测试 3: LiveMessageIngestor 校验逻辑');
  console.log('='.repeat(60));

  const ingestor = new LiveMessageIngestor();
  const receivedMessages = [];

  ingestor.onMessage((msg) => {
    receivedMessages.push(msg);
  });

  // 测试用例
  const testCases = [
    {
      name: '有效消息',
      message: {
        source: 'telegram',
        entry_type: 'live_monitor',
        chat_id: '-1001234567890',
        message_id: 1001,
        sender_id: 12345,
        sender_name: 'test_user',
        message_text: '你好',
        timestamp: new Date().toISOString()
      },
      shouldPass: true
    },
    {
      name: '缺少 source',
      message: {
        entry_type: 'live_monitor',
        chat_id: '-1001234567890',
        message_id: 1002,
        message_text: '你好'
      },
      shouldPass: false
    },
    {
      name: '空 message_text',
      message: {
        source: 'telegram',
        entry_type: 'live_monitor',
        chat_id: '-1001234567890',
        message_id: 1003,
        message_text: ''
      },
      shouldPass: false
    },
    {
      name: 'message_id 类型错误',
      message: {
        source: 'telegram',
        entry_type: 'live_monitor',
        chat_id: '-1001234567890',
        message_id: '1004', // 应该是 number
        message_text: '你好'
      },
      shouldPass: false
    },
    {
      name: 'chat_id 类型错误',
      message: {
        source: 'telegram',
        entry_type: 'live_monitor',
        chat_id: 123456, // 应该是 string
        message_id: 1005,
        message_text: '你好'
      },
      shouldPass: false
    }
  ];

  let passedCount = 0;

  for (const testCase of testCases) {
    console.log(`\n[${testCase.name}]`);
    
    ingestor.ingest(testCase.message).then(result => {
      const passed = result.success === testCase.shouldPass;
      if (passed) {
        console.log(`  ✅ 通过 - success: ${result.success}`);
        passedCount++;
      } else {
        console.log(`  ❌ 失败 - 期望: ${testCase.shouldPass}, 实际: ${result.success}`);
        if (result.error) {
          console.log(`     错误: ${result.error}`);
        }
      }

      // 检查是否是最后一个测试
      if (passedCount + (testCases.length - passedCount) === testCases.length) {
        console.log(`\n${'-'.repeat(60)}`);
        console.log(`测试结果: ${passedCount}/${testCases.length} 通过`);
        if (passedCount === testCases.length) {
          console.log('✅ 所有测试通过');
        } else {
          console.log('❌ 部分测试失败');
        }
      }
    });
  }
}

/**
 * 运行所有测试
 */
async function runAllTests() {
  console.log('='.repeat(60));
  console.log('开始测试 TG 实时监听入口');
  console.log('='.repeat(60));

  const test1Result = testMessageFiltering();
  const test2Result = testStandardObjectStructure();
  
  await testIngestorValidation();

  console.log('\n' + '='.repeat(60));
  console.log('测试总结');
  console.log('='.repeat(60));
  console.log(`测试 1 (消息过滤): ${test1Result ? '✅ 通过' : '❌ 失败'}`);
  console.log(`测试 2 (标准对象): ${test2Result ? '✅ 通过' : '❌ 失败'}`);
  console.log(`测试 3 (校验逻辑): 见上方输出`);
  console.log('='.repeat(60));
}

// 执行测试
runAllTests().catch(err => {
  console.error('测试执行异常:', err);
  process.exit(1);
});
