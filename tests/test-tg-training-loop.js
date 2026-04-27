/**
 * TG 训练闭环端到端测试
 * 
 * 测试目标：
 * 1. 启动训练 (/train)
 * 2. AI 用户发问
 * 3. 客服回复
 * 4. 自动触发分析
 * 5. 自动生成下一轮用户问题
 * 6. 持续 3-6 轮
 * 7. 自动结束并输出总结
 * 8. 测试 /status 命令
 * 9. 测试 /stop 命令
 */

const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const {
  startTraining,
  processAgentReply,
  stopTraining,
  getTrainingStatus,
  formatTrainingSummaryMessage,
  formatCancelMessage
} = require('../services/training-orchestrator');

const { getScenarioById } = require('../core/scenario-loader');

console.log('=== TG 训练闭环端到端测试 ===\n');

// 模拟客服回复（用于测试）
const sampleAgentReplies = [
  '您好！注册账户很简单，请提供您的手机号码。',
  '好的，请按照以下步骤操作：1. 打开APP 2. 点击注册 3. 输入手机号 4. 填写验证码',
  '如果遇到验证码收不到的问题，请检查手机信号和垃圾短信拦截设置。',
  '注册成功后，您可以设置密码和个人资料。',
  '还有其他问题吗？随时联系我！'
];

/**
 * 测试1: 完整训练流程（自动运行到结束）
 */
async function testFullTrainingFlow() {
  console.log('\n' + '='.repeat(60));
  console.log('[测试1] 完整训练流程 - 自动运行到结束');
  console.log('='.repeat(60) + '\n');

  const chatId = 'test_chat_001';
  const scenarioId = 'register_flow';
  const scenario = getScenarioById(scenarioId);

  if (!scenario) {
    console.error('❌ 场景不存在，跳过测试');
    return false;
  }

  console.log(`场景: ${scenario.title}`);
  console.log(`描述: ${scenario.description}\n`);

  try {
    // 步骤1: 启动训练
    console.log('📍 步骤 1: 启动训练');
    const startResult = await startTraining({
      chatId,
      scenarioId,
      agentId: 'test_agent'
    });

    console.log(`✅ 训练启动成功`);
    console.log(`   Session ID: ${startResult.sessionId}`);
    console.log(`   第一轮用户消息: ${startResult.userMessage}\n`);

    // 步骤2-6: 模拟多轮对话
    let round = 0;
    let isFinished = false;
    let lastResult = startResult;

    while (!isFinished && round < 10) { // 最多 10 轮防止死循环
      round++;

      // 模拟客服回复
      const agentReply = sampleAgentReplies[(round - 1) % sampleAgentReplies.length];
      console.log(`📍 步骤 ${round + 1}: 客服回复 (Round ${round})`);
      console.log(`   客服: ${agentReply}\n`);

      // 处理客服回复
      const result = await processAgentReply({
        sessionId: startResult.sessionId,
        agentReply,
        agentId: 'test_agent'
      });

      if (result.isFinished) {
        isFinished = true;
        lastResult = result;

        console.log(`📍 训练结束`);
        console.log(`   结束原因: ${result.finishReason}`);
        console.log(`   总轮数: ${result.summary.totalRounds}\n`);

        // 打印总结
        console.log('📊 训练总结:');
        console.log('-'.repeat(60));
        const summaryMessage = formatTrainingSummaryMessage(result.summary);
        console.log(summaryMessage);
        console.log('-'.repeat(60) + '\n');

        break;
      } else {
        console.log(`   ✅ 分析完成，继续下一轮`);
        console.log(`   用户消息: ${result.userMessage}\n`);
        lastResult = result;
      }
    }

    if (!isFinished) {
      console.error('❌ 训练未在预期轮数内结束');
      return false;
    }

    console.log('✅ 测试1 通过: 完整训练流程成功\n');
    return true;

  } catch (error) {
    console.error('❌ 测试1 失败:', error.message);
    console.error(error.stack);
    return false;
  }
}

/**
 * 测试2: /status 命令
 */
async function testStatusCommand() {
  console.log('\n' + '='.repeat(60));
  console.log('[测试2] /status 命令 - 查看训练状态');
  console.log('='.repeat(60) + '\n');

  const chatId = 'test_chat_002';
  const scenarioId = 'register_flow';

  try {
    // 启动训练
    console.log('📍 启动训练...');
    const startResult = await startTraining({
      chatId,
      scenarioId,
      agentId: 'test_agent'
    });

    // 查询状态
    console.log('📍 查询训练状态...');
    const status = getTrainingStatus(chatId);

    console.log('状态信息:');
    console.log(`  - 有活跃 session: ${status.hasActiveSession}`);
    console.log(`  - Session ID: ${status.sessionId}`);
    console.log(`  - 场景: ${status.scenarioTitle}`);
    console.log(`  - 当前轮次: ${status.round + 1}`);
    console.log(`  - 状态: ${status.status}\n`);

    if (!status.hasActiveSession) {
      console.error('❌ 测试2 失败: 应该检测到活跃 session');
      return false;
    }

    console.log('✅ 测试2 通过: /status 命令正常\n');

    // 清理：停止训练
    await stopTraining(startResult.sessionId);
    return true;

  } catch (error) {
    console.error('❌ 测试2 失败:', error.message);
    return false;
  }
}

/**
 * 测试3: /stop 命令
 */
async function testStopCommand() {
  console.log('\n' + '='.repeat(60));
  console.log('[测试3] /stop 命令 - 强制停止训练');
  console.log('='.repeat(60) + '\n');

  const chatId = 'test_chat_003';
  const scenarioId = 'register_flow';

  try {
    // 启动训练
    console.log('📍 启动训练...');
    const startResult = await startTraining({
      chatId,
      scenarioId,
      agentId: 'test_agent'
    });

    // 强制停止
    console.log('📍 强制停止训练...');
    const stopResult = await stopTraining(startResult.sessionId);

    console.log('停止结果:');
    console.log(`  - 成功: ${stopResult.success}`);
    console.log(`  - 已取消: ${stopResult.isCancelled}`);
    console.log(`  - 已完成轮数: ${stopResult.summary.totalRounds}\n`);

    // 验证状态
    const status = getTrainingStatus(chatId);
    console.log('📍 验证状态...');
    console.log(`  - 有活跃 session: ${status.hasActiveSession}\n`);

    if (status.hasActiveSession) {
      console.error('❌ 测试3 失败: 停止后不应有活跃 session');
      return false;
    }

    console.log('✅ 测试3 通过: /stop 命令正常\n');
    return true;

  } catch (error) {
    console.error('❌ 测试3 失败:', error.message);
    return false;
  }
}

/**
 * 测试4: 状态机流转验证
 */
async function testStateMachine() {
  console.log('\n' + '='.repeat(60));
  console.log('[测试4] 状态机流转验证');
  console.log('='.repeat(60) + '\n');

  const chatId = 'test_chat_004';
  const scenarioId = 'register_flow';

  try {
    const { getTrainingSession, TrainingSessionStatus } = require('../session/training-session-store');

    // 启动训练
    console.log('📍 启动训练...');
    const startResult = await startTraining({
      chatId,
      scenarioId,
      agentId: 'test_agent'
    });

    let session = getTrainingSession(startResult.sessionId);
    console.log(`初始状态: ${session.status}`);
    console.log(`期望状态: ${TrainingSessionStatus.WAITING_AGENT_REPLY}\n`);

    if (session.status !== TrainingSessionStatus.WAITING_AGENT_REPLY) {
      console.error('❌ 测试4 失败: 初始状态不正确');
      return false;
    }

    // 模拟一轮对话
    console.log('📍 模拟一轮对话...');
    const result = await processAgentReply({
      sessionId: startResult.sessionId,
      agentReply: '这是测试回复',
      agentId: 'test_agent'
    });

    session = getTrainingSession(startResult.sessionId);
    console.log(`对话后状态: ${session.status}`);
    console.log(`期望状态: ${TrainingSessionStatus.WAITING_AGENT_REPLY}\n`);

    if (!result.isFinished && session.status !== TrainingSessionStatus.WAITING_AGENT_REPLY) {
      console.error('❌ 测试4 失败: 对话后状态不正确');
      return false;
    }

    console.log('✅ 测试4 通过: 状态机流转正常\n');

    // 清理
    await stopTraining(startResult.sessionId);
    return true;

  } catch (error) {
    console.error('❌ 测试4 失败:', error.message);
    return false;
  }
}

/**
 * 运行所有测试
 */
async function runAllTests() {
  console.log('\n开始运行 TG 训练闭环测试...\n');

  const results = {
    test1: await testFullTrainingFlow(),
    test2: await testStatusCommand(),
    test3: await testStopCommand(),
    test4: await testStateMachine()
  };

  console.log('\n' + '='.repeat(60));
  console.log('测试结果汇总');
  console.log('='.repeat(60) + '\n');

  const testNames = {
    test1: '完整训练流程',
    test2: '/status 命令',
    test3: '/stop 命令',
    test4: '状态机流转'
  };

  let passed = 0;
  let failed = 0;

  for (const [key, result] of Object.entries(results)) {
    const status = result ? '✅ 通过' : '❌ 失败';
    console.log(`${testNames[key]}: ${status}`);
    if (result) passed++;
    else failed++;
  }

  console.log('\n' + '-'.repeat(60));
  console.log(`总计: ${passed} 通过, ${failed} 失败`);
  console.log('-'.repeat(60) + '\n');

  if (failed === 0) {
    console.log('🎉 所有测试通过！TG 训练闭环已就绪！\n');
    return true;
  } else {
    console.log('⚠️ 部分测试失败，请检查错误信息\n');
    return false;
  }
}

// 运行测试
runAllTests().then(success => {
  process.exit(success ? 0 : 1);
}).catch(error => {
  console.error('测试运行异常:', error);
  process.exit(1);
});
