/**
 * AI 用户模拟器集成示例
 * 
 * 演示如何在训练流程中使用 user-simulator 实现完整的多轮对话训练
 * 
 * 流程：
 * 1. 训练开始，选择场景
 * 2. userSimulator 发起第一轮用户问题
 * 3. 客服（真人）回复
 * 4. 调用分析引擎评估客服回复
 * 5. userSimulator 根据分析结果生成下一轮用户消息
 * 6. 重复步骤 3-5，直到满足结束条件
 * 7. 结束训练，输出总结
 */

const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const { generateUserMessage } = require('../services/user-simulator');
const { evaluate } = require('../services/evaluation-service');
const { getScenarioById } = require('../core/scenario-loader');
const { formatResultMessage } = require('../app/telegram/formatter');

console.log('=== AI 用户模拟器集成示例 ===\n');

/**
 * 模拟完整的训练流程（自动模式）
 * 
 * 注意：这是演示版本，实际使用时客服回复应该来自 Telegram 用户输入
 */
async function runTrainingDemo(scenarioId = 'register_flow') {
  console.log(`[训练开始] 场景: ${scenarioId}\n`);
  
  // 1. 加载场景
  const scenario = getScenarioById(scenarioId);
  if (!scenario) {
    console.error(`场景 ${scenarioId} 不存在`);
    return;
  }
  
  console.log(`[场景信息]`);
  console.log(`  标题: ${scenario.title}`);
  console.log(`  描述: ${scenario.description || '无'}`);
  console.log(`  阶段数: ${scenario.stages ? scenario.stages.length : '无阶段定义'}\n`);
  
  // 2. 初始化对话
  const conversation = [];
  let round = 0;
  const sessionId = `training_session_${Date.now()}`;
  
  console.log('='.repeat(60));
  console.log('[训练对话开始]\n');
  
  // 3. 多轮对话循环
  while (true) {
    // 3.1 生成用户消息
    const userInput = await generateUserMessage({
      project: 'default',
      scenario: scenario,
      conversation: conversation,
      round: round,
      analysisResult: null // 第一轮没有分析结果
    });
    
    // 检查是否应该结束
    if (userInput.is_finished) {
      console.log(`[用户] (对话已结束)`);
      break;
    }
    
    console.log(`[第${round + 1}轮] 用户: ${userInput.user_message}`);
    conversation.push({
      role: 'user',
      content: userInput.user_message,
      _meta: { turnIndex: conversation.length, ts: new Date().toISOString() }
    });
    
    // 3.2 模拟客服回复（实际应该来自 Telegram 用户输入）
    const agentReply = simulateAgentReply(userInput.user_message, round, scenario);
    console.log(`[第${round + 1}轮] 客服: ${agentReply}`);
    conversation.push({
      role: 'agent',
      content: agentReply,
      _meta: { turnIndex: conversation.length, ts: new Date().toISOString() }
    });
    
    // 3.3 调用分析引擎评估客服回复
    console.log(`[分析引擎] 评估客服回复...`);
    
    const analysisResult = await evaluate({
      project: 'default',
      conversation: conversation,
      current_reply: agentReply,
      metadata: {
        source: 'demo',
        session_id: sessionId,
        agent_id: 'demo_agent',
        timestamp: new Date().toISOString(),
        entry_type: 'training',
        scenarioId: scenario.id
      },
      rules: {}
    });
    
    console.log(`[分析结果] 等级: ${analysisResult.result?.level || 'unknown'}`);
    console.log(`[分析结果] 风险: ${analysisResult.riskLevel || 'none'}`);
    console.log(`[分析结果] 问题: ${(analysisResult.issues || []).length} 项`);
    console.log(`[分析结果] 缺失: ${(analysisResult.missing || []).length} 项\n`);
    
    // 3.4 准备下一轮
    round++;
    
    // 安全检查：最多 6 轮
    if (round >= 6) {
      console.log('[训练] 已达到最大轮数限制 (6轮)');
      break;
    }
    
    // 3.5 生成下一轮用户消息（基于分析结果）
    const nextUserInput = await generateUserMessage({
      project: 'default',
      scenario: scenario,
      conversation: conversation,
      round: round,
      analysisResult: analysisResult
    });
    
    if (nextUserInput.is_finished) {
      console.log(`[用户] (对话已结束)`);
      break;
    }
    
    // 添加短暂延迟，模拟真实对话节奏
    await sleep(500);
  }
  
  // 4. 训练总结
  console.log('\n' + '='.repeat(60));
  console.log('[训练结束]\n');
  console.log(`[总结]`);
  console.log(`  总轮数: ${round}`);
  console.log(`  对话长度: ${conversation.length} 条消息`);
  console.log(`  会话ID: ${sessionId}\n`);
}

/**
 * 模拟客服回复（演示用）
 * 
 * 实际使用时，这里应该替换为 Telegram 用户的真实输入
 */
function simulateAgentReply(userMessage, round, scenario) {
  // 简单模拟：根据不同轮次生成不同的客服回复
  const replies = {
    0: '您好！请问您已经下载LantonPay APP了吗？',
    1: '好的，第一步请打开APP，点击首页的"注册"按钮，然后输入您的手机号。',
    2: '收到验证码后，请填写验证码并设置支付密码。请注意保管好您的密码。',
    3: '恭喜您完成注册！现在您可以使用LantonPay的全部功能了。如有问题随时联系我们。',
    4: '好的，请您提供一下具体的错误提示截图，我们帮您查看。',
    5: '明白，已为您记录问题，预计2小时内会有专人跟进处理。'
  };
  
  return replies[round] || '好的，我们继续为您处理。';
}

/**
 * 延迟函数
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 运行演示
(async () => {
  try {
    // 可以选择不同的场景进行测试
    const scenarios = ['register_flow', 'lanton_sms_code', 'lanton_transfer_success_not_received'];
    const scenarioId = scenarios[0]; // 默认使用第一个
    
    await runTrainingDemo(scenarioId);
    
    console.log('\n✅ 演示完成');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ 演示失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
})();
