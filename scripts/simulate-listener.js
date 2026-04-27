#!/usr/bin/env node
/**
 * 真实客服监听模拟器
 * 
 * 基于 conversations.sql 的样本，批量驱动 qwen3 shadow 运行
 */

// 必须在 require 之前设置环境变量，否则 shadow runner 配置不会生效
process.env.QWEN3_SHADOW_MODE_ENABLED = process.env.QWEN3_SHADOW_MODE_ENABLED || 'true';
process.env.QWEN3_SHADOW_TASK_TYPES = process.env.QWEN3_SHADOW_TASK_TYPES || 'quality_evaluation';
process.env.QWEN3_SHADOW_ENTRY_WHITELIST = process.env.QWEN3_SHADOW_ENTRY_WHITELIST || 'training,test_entry';
process.env.QWEN3_SHADOW_SCENARIO_WHITELIST = process.env.QWEN3_SHADOW_SCENARIO_WHITELIST || 
  'transfer_not_received,withdraw_pending,payment_deducted_failed,service_response_poor,info_missing,complex_case';
process.env.QWEN3_SHADOW_MAX_CONCURRENCY = process.env.QWEN3_SHADOW_MAX_CONCURRENCY || '1';
process.env.QWEN3_SHADOW_TIMEOUT_MS = process.env.QWEN3_SHADOW_TIMEOUT_MS || '30000';

require('dotenv').config();

// 强制覆盖 .env 中的设置（确保测试使用正确的白名单）
process.env.QWEN3_SHADOW_ENTRY_WHITELIST = 'training,test_entry';

const fs = require('fs');
const path = require('path');
const { runQwen3Shadow } = require('../services/local-model/qwen3-shadow-runner');
const { filterConversations } = require('./filter-conversations');

/**
 * 生成模拟原系统分数
 */
function generateMockOriginalScore(conv) {
  const raw = conv._raw || {};
  // 基于会话特征生成分数
  let baseScore = 75;
  
  if (raw.first_response_sla_breached) baseScore -= 15;
  if (raw.reopen_count > 0) baseScore -= 10;
  if (raw.is_valid === 0) baseScore -= 20;
  if (raw.message_count > 15) baseScore -= 5;
  
  // 添加随机波动
  return Math.max(50, Math.min(95, baseScore + Math.floor(Math.random() * 20 - 10)));
}

/**
 * 生成模拟原系统问题类型
 */
function generateMockOriginalProblemType(conv) {
  const raw = conv._raw || {};
  
  if (raw.is_valid === 0) return 'unknown';
  if (raw.first_response_sla_breached) return 'known';
  if (raw.reopen_count > 0) return 'known';
  if (raw.message_count > 10) return 'known';
  
  return Math.random() > 0.2 ? 'known' : 'unknown';
}

/**
 * 生成模拟原系统风险等级
 */
function generateMockOriginalRiskLevel(conv) {
  const raw = conv._raw || {};
  
  if (raw.is_valid === 0) return 'high';
  if (raw.first_response_sla_breached) return 'medium';
  if (raw.reopen_count > 0) return 'medium';
  
  const rand = Math.random();
  if (rand > 0.7) return 'low';
  if (rand > 0.3) return 'medium';
  return 'low';
}

/**
 * 构造模拟对话（简化版本）
 */
function buildFakeConversation(conv) {
  const raw = conv._raw || {};
  
  let conversation = '';
  
  // 根据筛选条件构造不同的对话
  if (raw.first_response_sla_breached) {
    conversation = `用户：我已经等了很久了，怎么还没人回复？
客服：抱歉让您久等了，请问有什么问题？
用户：我的转账显示成功但对方没收到
客服：请稍等，我们帮您查询`;
  } else if (raw.reopen_count > 0) {
    conversation = `用户：我之前反馈的问题还没解决
客服：您好，请问是哪个问题？
用户：提现一直没到账，已经好几天了
客服：我帮您查看一下`;
  } else if (raw.is_valid === 0) {
    conversation = `用户：有问题
客服：什么问题？
用户：就是那个问题
客服：能具体说一下吗？`;
  } else if (raw.message_count > 10) {
    conversation = `用户：我需要帮助
客服：请问需要什么帮助？
用户：支付相关的问题
客服：请提供订单号
用户：订单号是 123456
客服：我查询一下`;
  } else {
    conversation = `用户：我转账成功了但对方没收到
客服：您好，请提供转账凭证，我们帮您查询`;
  }
  
  return conversation;
}

/**
 * 运行模拟监听
 */
async function simulateListener(sampleCount = 50) {
  console.log('\n' + '='.repeat(70));
  console.log('真实客服监听模拟器');
  console.log('='.repeat(70));
  console.log(`目标样本数: ${sampleCount}`);
  console.log('');
  
  // Step 1: 筛选样本
  console.log('Step 1: 筛选高价值样本...');
  let samples;
  
  // 尝试从缓存加载
  const cachePath = './scripts/output/conversations-samples.json';
  if (fs.existsSync(cachePath)) {
    console.log('从缓存加载样本...');
    samples = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
    console.log(`加载 ${samples.length} 条样本\n`);
  } else {
    samples = await filterConversations(sampleCount);
  }
  
  if (samples.length === 0) {
    console.error('❌ 没有可用样本，请先运行 filter-conversations.js');
    process.exit(1);
  }
  
  console.log(`Step 2: 开始模拟监听 (${samples.length} 条样本)\n`);
  
  // Step 2: 逐条运行 shadow
  const results = {
    total: samples.length,
    success: 0,
    failure: 0,
    errors: []
  };
  
  for (let i = 0; i < samples.length; i++) {
    const conv = samples[i];
    
    console.log(`[${i + 1}/${samples.length}] 处理会话 ${conv.conversation_id}...`);
    
    try {
      const input = {
        conversationText: buildFakeConversation(conv)
      };
      
      const context = {
        taskType: 'quality_evaluation',  // 强制使用白名单中的 taskType
        entrySource: 'test_entry',        // 强制使用白名单中的 entrySource（覆盖缓存数据）
        scenario: conv.scenario || 'transfer_not_received'
      };
      
      // 模拟原系统分析结果（用于后续对比）
      const originalResult = {
        success: true,
        source: 'mock_from_conversations',
        conversation_id: conv.conversation_id,
        // 模拟原系统的分析数据
        analysisResult: {
          score: generateMockOriginalScore(conv),
          problem_type: generateMockOriginalProblemType(conv),
          riskLevel: generateMockOriginalRiskLevel(conv)
        }
      };
      
      // 运行 shadow（等待完成并检查返回值）
      const shadowResult = await runQwen3Shadow(input, context, originalResult);
      
      if (shadowResult) {
        results.success++;
        console.log(`  ✓ 成功 (dualScore: ${shadowResult.dualScore ? '有' : '无'})`);
      } else {
        results.failure++;
        console.log(`  ✗ shadow 未返回数据`);
      }
      
    } catch (error) {
      results.failure++;
      results.errors.push({
        conversation_id: conv.conversation_id,
        error: error.message
      });
      console.log(`  ✗ 失败: ${error.message}`);
    }
    
    // 避免过快请求
    if (i < samples.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  // 输出总结
  console.log('\n' + '='.repeat(70));
  console.log('模拟监听完成');
  console.log('='.repeat(70));
  console.log(`总样本数: ${results.total}`);
  console.log(`成功: ${results.success}`);
  console.log(`失败: ${results.failure}`);
  console.log(`成功率: ${((results.success / results.total) * 100).toFixed(1)}%`);
  console.log('');
  
  if (results.errors.length > 0) {
    console.log('失败详情:');
    results.errors.slice(0, 5).forEach(err => {
      console.log(`  - 会话 ${err.conversation_id}: ${err.error}`);
    });
    if (results.errors.length > 5) {
      console.log(`  ... 还有 ${results.errors.length - 5} 个错误`);
    }
    console.log('');
  }
  
  console.log('下一步: 运行分析脚本');
  console.log('node scripts/analyze-qwen3-shadow-results.js');
  console.log('');
}

// 执行
if (require.main === module) {
  const sampleCount = parseInt(process.argv[2] || '50', 10);
  simulateListener(sampleCount)
    .then(() => {
      console.log('✅ 模拟监听完成');
    })
    .catch(error => {
      console.error('❌ 模拟监听失败:', error.message);
      console.error(error.stack);
      process.exit(1);
    });
}

module.exports = { simulateListener, buildFakeConversation };
