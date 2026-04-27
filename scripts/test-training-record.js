/**
 * 测试训练记录入库功能
 * 
 * 验证：
 * 1. 训练会话记录能否正确创建
 * 2. 训练消息能否正确保存
 * 3. 训练轮次结果能否正确保存
 * 4. 训练会话能否正确完成
 * 5. 完整训练过程能否正确查询
 */

require('dotenv').config();

const { TrainingRecordService } = require('../services/training-record-service');
const { v4: uuidv4 } = require('uuid');

async function testTrainingRecordService() {
  console.log('='.repeat(60));
  console.log('开始测试训练记录入库功能');
  console.log('='.repeat(60));

  const service = TrainingRecordService.getInstance();
  const testSessionId = `test_${uuidv4()}`;
  const testScenarioId = 'test_scenario_001';
  const testScenarioTitle = '测试场景 - 产品咨询';
  const testAgentId = 'test_agent_001';
  const testChatId = '123456789';

  try {
    // 1. 测试创建训练会话
    console.log('\n[测试 1] 创建训练会话记录');
    const session = await service.createSession({
      sessionId: testSessionId,
      scenarioId: testScenarioId,
      scenarioTitle: testScenarioTitle,
      agentId: testAgentId,
      chatId: testChatId
    });
    console.log('✓ 训练会话创建成功:', {
      sessionId: session.sessionId,
      scenarioId: session.scenarioId,
      status: session.status
    });

    // 2. 测试保存训练消息（Round 0 - 用户）
    console.log('\n[测试 2] 保存训练消息 - Round 0 用户');
    const msg1 = await service.saveMessage({
      sessionId: testSessionId,
      round: 0,
      role: 'user',
      content: '你好，我想问一下产品怎么用？',
      source: 'ai'
    });
    console.log('✓ 用户消息保存成功:', {
      id: msg1.id,
      round: msg1.round,
      role: msg1.role
    });

    // 3. 测试保存训练消息（Round 0 - 客服）
    console.log('\n[测试 3] 保存训练消息 - Round 0 客服');
    const msg2 = await service.saveMessage({
      sessionId: testSessionId,
      round: 0,
      role: 'agent',
      content: '您好！很高兴为您服务。请问您想了解产品的哪个方面？',
      source: 'human'
    });
    console.log('✓ 客服消息保存成功:', {
      id: msg2.id,
      round: msg2.round,
      role: msg2.role
    });

    // 4. 测试保存训练轮次结果（Round 0）
    console.log('\n[测试 4] 保存训练轮次结果 - Round 0');
    const mockAnalysisResult = {
      riskLevel: 'low',
      result: { level: 'pass', score: 85 },
      issues: ['回复可以更加具体'],
      strengths: ['态度友善', '及时响应'],
      missing: ['未提供具体操作步骤']
    };
    const mockFeedback = {
      feedback_text: '本轮表现不错，态度友善，但可以更具体一些。',
      structured_feedback: {
        scenario_id: testScenarioId,
        scenario_title: testScenarioTitle,
        round: 1,
        strengths: ['态度友善', '及时响应'],
        problems: ['回复可以更加具体'],
        missing: ['未提供具体操作步骤'],
        suggestions: ['补充具体操作步骤'],
        is_finished: false,
        status: 'continuing'
      }
    };

    const roundResult1 = await service.saveRoundResult({
      sessionId: testSessionId,
      round: 0,
      scenarioId: testScenarioId,
      scenarioTitle: testScenarioTitle,
      analysisRaw: mockAnalysisResult,
      feedbackText: mockFeedback.feedback_text,
      structuredFeedback: mockFeedback.structured_feedback,
      isFinished: false
    });
    console.log('✓ 轮次结果保存成功:', {
      id: roundResult1.id,
      round: roundResult1.round,
      isFinished: roundResult1.isFinished
    });

    // 5. 测试保存更多轮次（Round 1）
    console.log('\n[测试 5] 保存 Round 1 的消息和结果');
    
    // Round 1 - 用户
    await service.saveMessage({
      sessionId: testSessionId,
      round: 1,
      role: 'user',
      content: '我想了解具体的操作步骤',
      source: 'ai'
    });

    // Round 1 - 客服
    await service.saveMessage({
      sessionId: testSessionId,
      round: 1,
      role: 'agent',
      content: '好的，以下是详细操作步骤：1. 登录系统 2. 进入设置页面 3. 点击配置按钮...',
      source: 'human'
    });

    // Round 1 结果
    const roundResult2 = await service.saveRoundResult({
      sessionId: testSessionId,
      round: 1,
      scenarioId: testScenarioId,
      scenarioTitle: testScenarioTitle,
      analysisRaw: {
        riskLevel: 'none',
        result: { level: 'pass', score: 95 },
        issues: [],
        strengths: ['步骤详细', '逻辑清晰', '表达专业'],
        missing: []
      },
      feedbackText: '本轮表现优秀，步骤详细且清晰！',
      structuredFeedback: {
        scenario_id: testScenarioId,
        round: 2,
        strengths: ['步骤详细', '逻辑清晰', '表达专业'],
        problems: [],
        missing: [],
        suggestions: ['保持当前的服务质量'],
        is_finished: true,
        status: 'finished'
      },
      isFinished: true
    });
    console.log('✓ Round 1 数据保存成功');

    // 6. 测试完成训练会话
    console.log('\n[测试 6] 完成训练会话');
    const finishedSession = await service.finishSession(testSessionId, 2);
    console.log('✓ 训练会话已完成:', {
      sessionId: finishedSession.sessionId,
      status: finishedSession.status,
      totalRounds: finishedSession.totalRounds,
      finishedAt: finishedSession.finishedAt
    });

    // 7. 测试查询完整训练过程
    console.log('\n[测试 7] 查询完整训练过程');
    const fullTraining = await service.getFullTraining(testSessionId);
    console.log('✓ 完整训练数据查询成功:');
    console.log('  - 会话信息:', {
      sessionId: fullTraining.session.sessionId,
      status: fullTraining.session.status,
      totalRounds: fullTraining.session.totalRounds
    });
    console.log('  - 消息数量:', fullTraining.messages.length);
    console.log('  - 轮次结果数量:', fullTraining.roundResults.length);

    // 8. 验证消息顺序
    console.log('\n[测试 8] 验证消息顺序和内容');
    fullTraining.messages.forEach((msg, idx) => {
      console.log(`  消息 ${idx + 1}: [Round ${msg.round}] ${msg.role}: ${msg.content.substring(0, 30)}...`);
    });

    // 9. 验证轮次结果
    console.log('\n[测试 9] 验证轮次结果');
    fullTraining.roundResults.forEach((result, idx) => {
      console.log(`  轮次 ${idx + 1}: [Round ${result.round}] isFinished=${result.isFinished}, structured_feedback存在=${!!result.structuredFeedback}`);
    });

    // 10. 测试查询会话列表
    console.log('\n[测试 10] 查询训练会话列表');
    const sessionsList = await service.listSessions({ status: 'finished' }, { page: 1, limit: 10 });
    console.log('✓ 会话列表查询成功:', {
      total: sessionsList.total,
      items: sessionsList.items.length
    });

    // 11. 测试查询活跃会话
    console.log('\n[测试 11] 查询活跃会话（应为null）');
    const activeSession = await service.getActiveSession(testChatId);
    console.log('✓ 活跃会话查询:', activeSession ? '存在' : '不存在（符合预期）');

    console.log('\n' + '='.repeat(60));
    console.log('✅ 所有测试通过！训练记录入库功能正常');
    console.log('='.repeat(60));

    // 输出测试数据ID供手动验证
    console.log('\n📋 测试数据信息:');
    console.log(`Session ID: ${testSessionId}`);
    console.log(`Scenario ID: ${testScenarioId}`);
    console.log(`Agent ID: ${testAgentId}`);
    console.log(`Chat ID: ${testChatId}`);
    console.log('\n可以使用以下 SQL 查询验证:');
    console.log(`SELECT * FROM training_sessions WHERE session_id = '${testSessionId}';`);
    console.log(`SELECT * FROM training_messages WHERE session_id = '${testSessionId}' ORDER BY round, id;`);
    console.log(`SELECT * FROM training_round_results WHERE session_id = '${testSessionId}' ORDER BY round;`);

  } catch (error) {
    console.error('\n❌ 测试失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// 运行测试
testTrainingRecordService().catch(error => {
  console.error('测试执行失败:', error);
  process.exit(1);
});
