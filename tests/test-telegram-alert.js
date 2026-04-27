/**
 * 测试 Telegram 告警发送
 */

require('dotenv').config();

const { TelegramAlerter } = require('./adapters/alerts/telegram-alert');

async function test() {
  console.log('测试 Telegram 告警发送...\n');
  
  const alerter = new TelegramAlerter();
  
  console.log('配置信息:');
  console.log('  token:', alerter.token ? '已配置' : '未配置');
  console.log('  chatId:', alerter.chatId);
  console.log('  testChatId:', alerter.testChatId);
  console.log('  isGrayMode:', alerter.isGrayMode);
  console.log('');
  
  // 模拟一个 warning 告警
  const mockResult = {
    alertLevel: 'warning',
    evaluationStatus: 'alert_triggered',
    reviewStatus: 'pending',
    projectId: 'lanton',
    scenarioId: 'lanton_official_success_not_received',
    matchedScenario: {
      title: '官网转账成功，收款银行未到账'
    },
    score: 34,
    dimensionScores: {
      attitude: 10,
      process: 10,
      information: 0,
      empathy: 10,
      clarity: 9
    },
    alerts: [
      {
        level: 'warning',
        type: 'low_score',
        message: '评分偏低: 34分，需要关注',
        threshold: 40
      }
    ],
    sessionId: 'test_session_001',
    grayRelease: {
      isGrayMode: true,
      phase: 'pilot',
      disclaimer: '灰度测试数据，不作为处罚依据'
    }
  };
  
  console.log('发送告警...');
  try {
    await alerter.sendAlert(mockResult);
    console.log('✅ 告警发送成功');
  } catch (err) {
    console.error('❌ 告警发送失败:', err.message);
  }
}

test().catch(console.error);
