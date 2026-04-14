#!/usr/bin/env node
/**
 * 测试 training 模式统一 schema 和模式分流
 */

require('dotenv').config();

const { evaluate } = require('./services/evaluation-service');

async function testTrainingMode() {
  console.log('=== 测试 Training 模式 ===\n');
  
  // 测试 1: 低分（应该触发 alert）
  console.log('测试 1: 低分 (14分)');
  const result1 = await evaluate({
    projectId: 'lanton',
    mode: 'training',
    scenarioId: 'lanton_sms_code',
    userReply: '等',
    metadata: {
      channel: 'telegram',
      chatId: 'test',
      sessionId: 'training_test_001'
    }
  });
  
  console.log(`  evaluationStatus: ${result1.evaluationStatus}`);
  console.log(`  alertLevel: ${result1.alertLevel}`);
  console.log(`  reviewStatus: ${result1.reviewStatus}`);
  console.log(`  score: ${result1.score}`);
  console.log(`  alerts: ${JSON.stringify(result1.alerts, null, 2)}\n`);
  
  // 测试 2: 中等分数
  console.log('测试 2: 中等分数 (45分)');
  const result2 = await evaluate({
    projectId: 'lanton',
    mode: 'training',
    scenarioId: 'lanton_sms_code',
    userReply: '好的，请稍等，我帮您查一下',
    metadata: {
      channel: 'telegram',
      chatId: 'test',
      sessionId: 'training_test_002'
    }
  });
  
  console.log(`  evaluationStatus: ${result2.evaluationStatus}`);
  console.log(`  alertLevel: ${result2.alertLevel}`);
  console.log(`  score: ${result2.score}\n`);
  
  // 测试 3: live_monitor 对比
  console.log('测试 3: Live Monitor 模式对比 (45分)');
  const result3 = await evaluate({
    projectId: 'lanton',
    mode: 'live_monitor',
    customerMessage: '我没收到验证码',
    userReply: '好的，请稍等，我帮您查一下',
    metadata: {
      channel: 'telegram',
      chatId: 'test',
      sessionId: 'live_monitor_test_001'
    }
  });
  
  console.log(`  evaluationStatus: ${result3.evaluationStatus}`);
  console.log(`  alertLevel: ${result3.alertLevel}`);
  console.log(`  score: ${result3.score}`);
  console.log(`  alerts: ${JSON.stringify(result3.alerts, null, 2)}\n`);
  
  console.log('=== 测试完成 ===');
}

testTrainingMode().catch(console.error);
