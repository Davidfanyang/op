/**
 * 测试告警消息格式
 */

require('dotenv').config();

const { TelegramAlerter } = require('./adapters/alerts/telegram-alert');

const alerter = new TelegramAlerter();

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

const message = alerter.formatAlertMessage(mockResult);

console.log('生成的告警消息:\n');
console.log(message);
console.log('\n\n消息长度:', message.length);
