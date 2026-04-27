#!/usr/bin/env node
/**
 * 生成 Qwen3 Shadow 样本并分析
 */

require('dotenv').config();

// 设置环境变量
process.env.QWEN3_SHADOW_MODE_ENABLED = 'true';
process.env.QWEN3_SHADOW_TASK_TYPES = 'quality_evaluation';
process.env.QWEN3_SHADOW_ENTRY_WHITELIST = 'training';
process.env.QWEN3_SHADOW_SCENARIO_WHITELIST = 'transfer_not_received,withdraw_pending,payment_deducted_failed';
process.env.QWEN3_SHADOW_MAX_CONCURRENCY = '1';
process.env.QWEN3_SHADOW_TIMEOUT_MS = '30000';

const { runQwen3Shadow } = require('../services/local-model/qwen3-shadow-runner');

async function generateSamples() {
  console.log('开始生成 shadow 样本...\n');
  
  const samples = [
    {
      input: { conversationText: '用户：我转账成功了但对方没收到\n客服：您好，请提供转账凭证，我们帮您查询' },
      context: { taskType: 'quality_evaluation', entrySource: 'training', scenario: 'transfer_not_received' }
    },
    {
      input: { conversationText: '用户：提现一直没到账\n客服：请耐心等待' },
      context: { taskType: 'quality_evaluation', entrySource: 'training', scenario: 'withdraw_pending' }
    },
    {
      input: { conversationText: '用户：支付失败但被扣款了\n客服：我帮您核实一下' },
      context: { taskType: 'quality_evaluation', entrySource: 'training', scenario: 'payment_deducted_failed' }
    }
  ];
  
  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i];
    console.log(`生成样本 ${i + 1}/${samples.length}...`);
    await runQwen3Shadow(
      sample.input,
      sample.context,
      { success: true, source: 'original_logic' }
    );
  }
  
  console.log('\n样本生成完成！');
}

generateSamples().then(() => {
  console.log('\n现在运行分析脚本:');
  console.log('node scripts/analyze-qwen3-shadow-results.js\n');
}).catch(console.error);
