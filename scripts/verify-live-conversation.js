#!/usr/bin/env node
/**
 * verify-live-conversation.js - 快速验证脚本
 */

const { LiveConversationBuilder } = require('./services/live-conversation-builder');

async function verify() {
  console.log('=== 实时会话拼接功能验证 ===\n');

  const builder = new LiveConversationBuilder({
    timeoutMs: 10000 // 10秒超时
  });

  // 测试场景：模拟真实 TG 消息流
  const chatId = '-1001234567890';
  
  console.log('场景：用户和客服交替对话\n');

  // 消息 1: 用户
  const msg1 = {
    source: 'telegram',
    entry_type: 'live_monitor',
    chat_id: chatId,
    message_id: 1001,
    sender_id: 12345,
    sender_name: 'user123',
    message_text: '你好，我想咨询一下产品问题',
    timestamp: new Date().toISOString()
  };

  console.log('[消息 1] 用户发送:', msg1.message_text);
  const result1 = await builder.processMessage(msg1);
  console.log('会话Key:', result1.session_key);
  console.log('对话轮次:', result1.conversation.length);
  console.log('');

  // 消息 2: 客服
  const msg2 = {
    ...msg1,
    message_id: 1002,
    sender_id: 99999,
    sender_name: 'agent001',
    message_text: '您好！请问有什么问题可以帮您？',
    timestamp: new Date().toISOString()
  };

  console.log('[消息 2] 客服回复:', msg2.message_text);
  const result2 = await builder.processMessage(msg2);
  console.log('对话轮次:', result2.conversation.length);
  console.log('');

  // 消息 3: 用户
  const msg3 = {
    ...msg1,
    message_id: 1003,
    sender_id: 12345,
    message_text: '你们的產品支持退款吗？',
    timestamp: new Date().toISOString()
  };

  console.log('[消息 3] 用户追问:', msg3.message_text);
  const result3 = await builder.processMessage(msg3);
  console.log('对话轮次:', result3.conversation.length);
  console.log('');

  // 验证输出结构
  console.log('=== 输出结构验证 ===');
  console.log('chat_id:', result3.chat_id);
  console.log('session_key:', result3.session_key);
  console.log('last_message_id:', result3.last_message_id);
  console.log('updated_at:', result3.updated_at);
  console.log('');

  console.log('=== 完整对话内容 ===');
  result3.conversation.forEach((msg, idx) => {
    console.log(`${idx + 1}. [${msg.role}] ${msg.content}`);
    console.log(`   时间: ${msg.timestamp}`);
  });

  console.log('\n=== 验证结果 ===');
  
  const checks = [
    { name: 'chat_id 正确', pass: result3.chat_id === chatId },
    { name: 'session_key 格式正确', pass: result3.session_key.startsWith('live_') },
    { name: 'conversation 长度为 3', pass: result3.conversation.length === 3 },
    { name: '角色识别正确', pass: 
      result3.conversation[0].role === 'user' &&
      result3.conversation[1].role === 'agent' &&
      result3.conversation[2].role === 'user'
    },
    { name: '消息顺序正确', pass:
      result3.conversation[0].content === '你好，我想咨询一下产品问题' &&
      result3.conversation[1].content === '您好！请问有什么问题可以帮您？' &&
      result3.conversation[2].content === '你们的產品支持退款吗？'
    },
    { name: '包含必填字段', pass:
      'chat_id' in result3 &&
      'session_key' in result3 &&
      'conversation' in result3 &&
      'last_message_id' in result3 &&
      'updated_at' in result3
    }
  ];

  let allPassed = true;
  checks.forEach(check => {
    console.log(`${check.pass ? '✅' : '❌'} ${check.name}`);
    if (!check.pass) allPassed = false;
  });

  console.log('\n' + '='.repeat(60));
  if (allPassed) {
    console.log('✅ 验证通过！实时会话拼接功能正常工作');
    console.log('\n输出结果可直接用于《实时质检分析入库执行单》');
    console.log('格式符合标准输入协议 v1.0');
  } else {
    console.log('❌ 验证失败');
    process.exit(1);
  }
  console.log('='.repeat(60));
}

verify().catch(err => {
  console.error('验证失败:', err.message);
  console.error(err.stack);
  process.exit(1);
});
