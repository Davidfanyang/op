/**
 * AI 用户模拟器测试
 * 
 * 测试目标：
 * 1. 能生成第一轮用户问题
 * 2. 能根据上下文生成后续用户消息
 * 3. 能控制对话轮数在 3~6 轮
 * 4. 能判断对话结束
 * 5. 用户表达自然，不像是机器人
 */

const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const { generateUserMessage } = require('../services/user-simulator');
const { getScenarioById } = require('../core/scenario-loader');

console.log('=== AI 用户模拟器测试 ===\n');

// 测试1: 生成第一轮用户问题
async function testFirstMessage() {
  console.log('[测试1] 生成第一轮用户问题');
  
  const scenario = getScenarioById('register_flow') || {
    id: 'test_scenario',
    title: '注册流程指引',
    description: '用户咨询如何注册账户',
    customerMessage: '我想注册账户，怎么操作？'
  };
  
  const result = await generateUserMessage({
    project: 'default',
    scenario: scenario,
    conversation: [],
    round: 0
  });
  
  console.log('生成的用户消息:', result.user_message);
  console.log('是否结束:', result.is_finished);
  
  if (result.user_message && !result.is_finished) {
    console.log('✓ 通过 - 成功生成第一轮消息\n');
    return true;
  } else {
    console.log('✗ 失败 - 第一轮消息生成异常\n');
    return false;
  }
}

// 测试2: 模拟完整的多轮对话（3轮）
async function testMultiRoundConversation() {
  console.log('[测试2] 模拟3轮对话');
  
  const scenario = getScenarioById('register_flow') || {
    id: 'test_scenario',
    title: '注册流程指引',
    description: '用户咨询如何注册账户',
    customerMessage: '我想注册账户，怎么操作？',
    stages: [
      {
        id: 'stage_1',
        name: '问候并收集信息',
        turnIndex: 0
      },
      {
        id: 'stage_2',
        name: '指引注册步骤',
        turnIndex: 1
      },
      {
        id: 'stage_3',
        name: '处理问题',
        turnIndex: 2
      }
    ]
  };
  
  const conversation = [];
  let round = 0;
  
  // 第1轮：用户发起
  const msg1 = await generateUserMessage({
    project: 'default',
    scenario: scenario,
    conversation: conversation,
    round: round
  });
  
  console.log(`[第${round + 1}轮] 用户: ${msg1.user_message}`);
  conversation.push({ role: 'user', content: msg1.user_message });
  
  // 模拟客服回复
  const agentReply1 = '您好！请问您已经下载APP了吗？';
  console.log(`[第${round + 1}轮] 客服: ${agentReply1}`);
  conversation.push({ role: 'agent', content: agentReply1 });
  round++;
  
  // 第2轮：用户回应
  const msg2 = await generateUserMessage({
    project: 'default',
    scenario: scenario,
    conversation: conversation,
    round: round
  });
  
  console.log(`[第${round + 1}轮] 用户: ${msg2.user_message}`);
  conversation.push({ role: 'user', content: msg2.user_message });
  
  const agentReply2 = '好的，第一步请点击首页的注册按钮，然后输入手机号。';
  console.log(`[第${round + 1}轮] 客服: ${agentReply2}`);
  conversation.push({ role: 'agent', content: agentReply2 });
  round++;
  
  // 第3轮：用户回应
  const msg3 = await generateUserMessage({
    project: 'default',
    scenario: scenario,
    conversation: conversation,
    round: round
  });
  
  console.log(`[第${round + 1}轮] 用户: ${msg3.user_message}`);
  console.log(`[第${round + 1}轮] 是否结束: ${msg3.is_finished}`);
  
  if (msg3.user_message && conversation.length >= 4) {
    console.log('✓ 通过 - 成功完成3轮对话\n');
    return true;
  } else {
    console.log('✗ 失败 - 对话轮数异常\n');
    return false;
  }
}

// 测试3: 对话结束判断
async function testConversationEnding() {
  console.log('[测试3] 对话结束判断');
  
  const scenario = {
    id: 'test_scenario',
    title: '测试场景',
    customerMessage: '测试问题'
  };
  
  // 构造6轮对话（应该结束）
  const conversation = [];
  for (let i = 0; i < 6; i++) {
    conversation.push({ role: 'user', content: `用户消息${i}` });
    conversation.push({ role: 'agent', content: `客服回复${i}` });
  }
  
  const result = await generateUserMessage({
    project: 'default',
    scenario: scenario,
    conversation: conversation,
    round: 6
  });
  
  console.log('6轮后是否结束:', result.is_finished);
  
  if (result.is_finished) {
    console.log('✓ 通过 - 6轮后正确结束对话\n');
    return true;
  } else {
    console.log('✗ 失败 - 6轮后未结束对话\n');
    return false;
  }
}

// 测试4: 用户表达自然度检查
async function testNaturalExpression() {
  console.log('[测试4] 用户表达自然度检查');
  
  const scenario = {
    id: 'test_scenario',
    title: '转账问题',
    description: '用户咨询转账相关操作',
    customerMessage: '转账一直失败怎么办？'
  };
  
  const conversation = [
    { role: 'user', content: '转账一直失败怎么办？' },
    { role: 'agent', content: '您好，请问您遇到的错误提示是什么？' }
  ];
  
  const messages = [];
  
  // 生成多条消息检查多样性
  for (let i = 0; i < 3; i++) {
    const result = await generateUserMessage({
      project: 'default',
      scenario: scenario,
      conversation: conversation,
      round: 1
    });
    
    if (result.user_message) {
      messages.push(result.user_message);
    }
  }
  
  console.log('生成的消息样本:');
  messages.forEach((msg, idx) => {
    console.log(`  ${idx + 1}. ${msg}`);
  });
  
  // 检查是否像真实用户（不应包含过于正式的表达）
  const formalPatterns = [
    '感谢您的回复',
    '我非常理解',
    '请您放心',
    '我们将为您'
  ];
  
  let hasFormalExpression = false;
  messages.forEach(msg => {
    formalPatterns.forEach(pattern => {
      if (msg.includes(pattern)) {
        hasFormalExpression = true;
      }
    });
  });
  
  if (!hasFormalExpression && messages.length > 0) {
    console.log('✓ 通过 - 用户表达自然，无过于正式的客服语气\n');
    return true;
  } else {
    console.log('✗ 失败 - 用户表达过于正式或像客服\n');
    return false;
  }
}

// 运行所有测试
async function runAllTests() {
  const results = [];
  
  results.push(await testFirstMessage());
  results.push(await testMultiRoundConversation());
  results.push(await testConversationEnding());
  results.push(await testNaturalExpression());
  
  console.log('=== 测试结果汇总 ===');
  console.log(`通过: ${results.filter(r => r).length}/${results.length}`);
  
  if (results.every(r => r)) {
    console.log('\n✅ 所有测试通过');
    process.exit(0);
  } else {
    console.log('\n❌ 部分测试失败');
    process.exit(1);
  }
}

// 执行测试
runAllTests().catch(err => {
  console.error('测试执行失败:', err);
  process.exit(1);
});
