/**
 * AI 用户模拟器 - 快速上手示例
 * 
 * 这个文件展示如何使用 user-simulator 模块
 */

const { generateUserMessage } = require('../services/user-simulator');

// 示例场景
const scenario = {
  id: 'example_scenario',
  title: '注册流程指引',
  description: '用户咨询如何注册账户',
  customerMessage: '我想注册账户，怎么操作？',
  stages: [
    {
      id: 'stage_1',
      name: '问候并收集信息',
      description: '礼貌问候，确认用户注册意图',
      trigger: { turnIndex: 0 }
    },
    {
      id: 'stage_2',
      name: '指引注册步骤',
      description: '根据用户情况提供具体注册步骤指引',
      trigger: { turnIndex: 1 }
    },
    {
      id: 'stage_3',
      name: '处理注册问题',
      description: '处理注册过程中遇到的具体问题',
      trigger: { turnIndex: 2 }
    }
  ]
};

/**
 * 示例1: 生成第一轮用户问题
 */
async function example1_firstMessage() {
  console.log('=== 示例1: 生成第一轮用户问题 ===\n');
  
  const result = await generateUserMessage({
    project: 'default',
    scenario: scenario,
    conversation: [],  // 第一轮，对话历史为空
    round: 0
  });
  
  console.log('用户消息:', result.user_message);
  console.log('是否结束:', result.is_finished);
  console.log('');
}

/**
 * 示例2: 生成第二轮用户消息
 */
async function example2_secondMessage() {
  console.log('=== 示例2: 生成第二轮用户消息 ===\n');
  
  // 模拟第一轮对话
  const conversation = [
    { role: 'user', content: '我想注册账户，怎么操作？' },
    { role: 'agent', content: '您好！请问您已经下载APP了吗？' }
  ];
  
  const result = await generateUserMessage({
    project: 'default',
    scenario: scenario,
    conversation: conversation,
    round: 1  // 第二轮
  });
  
  console.log('用户消息:', result.user_message);
  console.log('是否结束:', result.is_finished);
  console.log('');
}

/**
 * 示例3: 基于分析结果生成用户消息
 */
async function example3_withAnalysisResult() {
  console.log('=== 示例3: 基于分析结果生成用户消息 ===\n');
  
  // 模拟两轮对话
  const conversation = [
    { role: 'user', content: '我想注册账户，怎么操作？' },
    { role: 'agent', content: '您好！请问您已经下载APP了吗？' },
    { role: 'user', content: '下载了，但是不会注册' },
    { role: 'agent', content: '好的，第一步请点击首页的注册按钮。' }
  ];
  
  // 模拟上一轮的分析结果
  const analysisResult = {
    result: { level: 'borderline' },
    riskLevel: 'low',
    issues: ['未说明必填字段'],
    missing: ['手机号', '验证码']
  };
  
  const result = await generateUserMessage({
    project: 'default',
    scenario: scenario,
    conversation: conversation,
    round: 2,  // 第三轮
    analysisResult: analysisResult  // 传入分析结果
  });
  
  console.log('用户消息:', result.user_message);
  console.log('是否结束:', result.is_finished);
  console.log('');
}

/**
 * 示例4: 模拟完整的3轮对话
 */
async function example4_fullConversation() {
  console.log('=== 示例4: 模拟完整的3轮对话 ===\n');
  
  const conversation = [];
  let round = 0;
  
  // 第1轮
  console.log('--- 第1轮 ---');
  let result = await generateUserMessage({
    project: 'default',
    scenario: scenario,
    conversation: conversation,
    round: round
  });
  console.log('用户:', result.user_message);
  conversation.push({ role: 'user', content: result.user_message });
  
  // 模拟客服回复
  const agentReply1 = '您好！请问您已经下载APP了吗？';
  console.log('客服:', agentReply1);
  conversation.push({ role: 'agent', content: agentReply1 });
  round++;
  
  // 第2轮
  console.log('\n--- 第2轮 ---');
  result = await generateUserMessage({
    project: 'default',
    scenario: scenario,
    conversation: conversation,
    round: round
  });
  console.log('用户:', result.user_message);
  conversation.push({ role: 'user', content: result.user_message });
  
  // 模拟客服回复
  const agentReply2 = '好的，第一步请点击首页的"注册"按钮，然后输入您的手机号。';
  console.log('客服:', agentReply2);
  conversation.push({ role: 'agent', content: agentReply2 });
  round++;
  
  // 第3轮
  console.log('\n--- 第3轮 ---');
  result = await generateUserMessage({
    project: 'default',
    scenario: scenario,
    conversation: conversation,
    round: round
  });
  console.log('用户:', result.user_message);
  console.log('是否结束:', result.is_finished);
  console.log('');
}

/**
 * 示例5: 对话结束判断
 */
async function example5_conversationEnding() {
  console.log('=== 示例5: 对话结束判断 ===\n');
  
  // 模拟6轮对话（应该结束）
  const conversation = [];
  for (let i = 0; i < 6; i++) {
    conversation.push({ role: 'user', content: `用户消息${i}` });
    conversation.push({ role: 'agent', content: `客服回复${i}` });
  }
  
  const result = await generateUserMessage({
    project: 'default',
    scenario: scenario,
    conversation: conversation,
    round: 6  // 第7轮（从0开始）
  });
  
  console.log('6轮后的结果:');
  console.log('用户消息:', result.user_message);
  console.log('是否结束:', result.is_finished);
  console.log('');
}

// 运行所有示例
(async () => {
  try {
    await example1_firstMessage();
    await example2_secondMessage();
    await example3_withAnalysisResult();
    await example4_fullConversation();
    await example5_conversationEnding();
    
    console.log('✅ 所有示例运行完成');
  } catch (error) {
    console.error('❌ 示例运行失败:', error);
  }
})();
