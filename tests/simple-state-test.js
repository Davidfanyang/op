/**
 * 简单测试：验证状态流转
 */
const { startTraining, stopTraining } = require('../services/training-orchestrator');
const { getTrainingSession, getAllSessions, size } = require('../session/training-session-store');

async function test() {
  console.log('=== 简单状态流转测试 ===\n');
  console.log('当前 sessions 数量:', size());
  
  const chatId = 'simple_test_' + Date.now();
  
  try {
    console.log('\n启动训练...');
    const result = await startTraining({
      chatId,
      scenarioId: 'register_flow',
      agentId: 'test'
    });
    
    console.log('✅ 启动成功!');
    console.log('Session ID:', result.sessionId);
    console.log('状态:', getTrainingSession(result.sessionId).status);
    
    await stopTraining(result.sessionId);
    console.log('\n✅ 测试通过!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ 测试失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

test();
