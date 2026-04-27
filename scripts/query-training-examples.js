/**
 * 训练记录查询示例
 * 
 * 演示如何使用 TrainingRecordService 进行各种查询
 */

require('dotenv').config();

const { TrainingRecordService } = require('../services/training-record-service');

async function queryExamples() {
  console.log('='.repeat(60));
  console.log('训练记录查询示例');
  console.log('='.repeat(60));

  const service = TrainingRecordService.getInstance();

  try {
    // 示例 1: 查询最近的训练会话
    console.log('\n[示例 1] 查询最近 10 个已完成的训练会话');
    const recentSessions = await service.listSessions(
      { status: 'finished' },
      { page: 1, limit: 10 }
    );
    console.log(`找到 ${recentSessions.total} 个会话，显示前 ${recentSessions.items.length} 个:`);
    recentSessions.items.forEach(session => {
      console.log(`  - ${session.sessionId} | ${session.scenarioTitle} | ${session.totalRounds}轮 | ${session.finishedAt}`);
    });

    // 示例 2: 查询某个客服的训练记录
    console.log('\n[示例 2] 查询特定客服的所有训练记录');
    const agentSessions = await service.listSessions(
      { agentId: 'test_agent_001' },
      { page: 1, limit: 20 }
    );
    console.log(`该客服共有 ${agentSessions.total} 次训练记录`);

    // 示例 3: 查询某个场景的训练效果
    console.log('\n[示例 3] 查询特定场景的训练统计');
    const scenarioSessions = await service.listSessions(
      { scenarioId: 'test_scenario_001' },
      { page: 1, limit: 100 }
    );
    if (scenarioSessions.total > 0) {
      const avgRounds = scenarioSessions.items.reduce((sum, s) => sum + s.totalRounds, 0) / scenarioSessions.items.length;
      console.log(`场景: ${scenarioSessions.items[0].scenarioTitle}`);
      console.log(`训练次数: ${scenarioSessions.total}`);
      console.log(`平均轮次: ${avgRounds.toFixed(1)}`);
    }

    // 示例 4: 查询完整训练过程（用于复盘）
    console.log('\n[示例 4] 查询完整训练过程（需提供 sessionId）');
    console.log('提示: 需要先运行 test-training-record.js 创建测试数据');
    
    // 这里需要替换为实际的 sessionId
    const testSessionId = process.env.TEST_SESSION_ID || 'your-session-id-here';
    
    if (testSessionId && testSessionId !== 'your-session-id-here') {
      const fullTraining = await service.getFullTraining(testSessionId);
      
      if (fullTraining) {
        console.log('\n会话信息:');
        console.log(`  场景: ${fullTraining.session.scenarioTitle}`);
        console.log(`  状态: ${fullTraining.session.status}`);
        console.log(`  总轮次: ${fullTraining.session.totalRounds}`);
        
        console.log('\n训练过程:');
        fullTraining.messages.forEach(msg => {
          const roleLabel = msg.role === 'user' ? '👤 用户' : '👨‍💼 客服';
          console.log(`\n[Round ${msg.round}] ${roleLabel}:`);
          console.log(`  ${msg.content}`);
          
          // 查找对应的轮次结果
          const roundResult = fullTraining.roundResults.find(r => r.round === msg.round && msg.role === 'agent');
          if (roundResult) {
            console.log(`\n  📊 分析结果:`);
            console.log(`     反馈: ${roundResult.feedbackText.substring(0, 100)}...`);
            console.log(`     结构化反馈: ${JSON.stringify(roundResult.structuredFeedback, null, 2)}`);
          }
        });
      } else {
        console.log(`未找到 sessionId 为 ${testSessionId} 的训练记录`);
      }
    } else {
      console.log('跳过此示例（未设置 TEST_SESSION_ID 环境变量）');
    }

    // 示例 5: 统计训练数据
    console.log('\n[示例 5] 训练数据统计');
    const allSessions = await service.listSessions({}, { page: 1, limit: 1000 });
    
    const stats = {
      total: allSessions.total,
      finished: 0,
      running: 0,
      cancelled: 0,
      totalRounds: 0
    };
    
    allSessions.items.forEach(session => {
      if (session.status === 'finished') stats.finished++;
      if (session.status === 'running') stats.running++;
      if (session.status === 'cancelled') stats.cancelled++;
      stats.totalRounds += session.totalRounds;
    });
    
    console.log('训练统计:');
    console.log(`  总训练次数: ${stats.total}`);
    console.log(`  已完成: ${stats.finished}`);
    console.log(`  进行中: ${stats.running}`);
    console.log(`  已取消: ${stats.cancelled}`);
    console.log(`  总轮次: ${stats.totalRounds}`);
    if (stats.finished > 0) {
      console.log(`  平均轮次: ${(stats.totalRounds / stats.finished).toFixed(1)}`);
    }

    console.log('\n' + '='.repeat(60));
    console.log('查询示例完成');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('\n❌ 查询失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

queryExamples();
