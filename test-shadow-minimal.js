#!/usr/bin/env node
/**
 * 最小化测试 shadow runner
 */

require('dotenv').config();

process.env.QWEN3_SHADOW_MODE_ENABLED = 'true';

const { runQwen3Shadow } = require('./services/local-model/qwen3-shadow-runner');

async function test() {
  console.log('测试 shadow runner...');
  
  const input = {
    conversationText: '用户：我转账成功了但对方没收到\n客服：您好，请提供转账凭证'
  };
  
  const context = {
    taskType: 'quality_evaluation',
    entrySource: 'test_entry',
    scenario: 'transfer_not_received'
  };
  
  const originalResult = {
    success: true,
    source: 'test',
    analysisResult: {
      score: 75,
      problem_type: 'known',
      riskLevel: 'medium'
    }
  };
  
  console.log('调用 runQwen3Shadow...');
  const result = await runQwen3Shadow(input, context, originalResult);
  
  console.log('返回结果:', result ? '有数据' : 'undefined');
  if (result) {
    console.log('dualScore:', result.dualScore);
  }
}

test().catch(console.error);
