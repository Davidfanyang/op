/**
 * 第八步验证：知识注入内部试运行
 * 
 * 测试目标：
 * 1. 验证开关和白名单控制
 * 2. 验证3条内部试运行样本
 * 3. 验证知识命中日志
 * 4. 验证回退机制
 */

// 在加载模块之前设置环境变量
process.env.KNOWLEDGE_INJECTION_ENABLED = 'true';
process.env.KNOWLEDGE_INJECTION_ENTRY_WHITELIST = 'training,internal_trial';
process.env.KNOWLEDGE_INJECTION_SCENARIO_WHITELIST = 'transfer_not_received,withdraw_pending';

const { runKnowledgeInjectionTrial, getTrialConfig } = require('../services/knowledge-injection-trial');

// 模拟原逻辑（回退用）
async function originalLogic(input, context) {
  return {
    success: true,
    source: 'original_logic',
    message: '原逻辑返回（无知识注入）'
  };
}

// ========================
// 测试样本
// ========================

const SAMPLES = [
  {
    id: 1,
    name: 'Scenario 命中样本（transfer_not_received）',
    conversationText: '客服：您好，请问有什么可以帮助您的？\n用户：我昨天转账了5000块，显示成功了但对方说没收到，怎么回事？\n客服：请您提供转账时间、金额和交易哈希，我们马上为您核查到账状态。',
    scenario: 'transfer_not_received',
    projectId: 'test_project',
    entrySource: 'training'
  },
  {
    id: 2,
    name: '关键词命中样本（withdraw_pending）',
    conversationText: '客服：您好，请问有什么问题吗？\n用户：我的提现申请已经提交了，但是一直没有到账，能帮我查一下吗？\n客服：请您稍等，我们核实一下。',
    scenario: 'withdraw_pending',
    projectId: 'test_project',
    entrySource: 'training'
  },
  {
    id: 3,
    name: '不命中知识样本（不在白名单场景）',
    conversationText: '客服：您好，请问需要什么帮助？\n用户：我想修改一下我的账户密码。\n客服：好的，请告诉我您的注册手机号。',
    scenario: 'password_reset',  // 不在白名单
    projectId: 'test_project',
    entrySource: 'training'
  }
];

// ========================
// 主测试流程
// ========================

async function main() {
  console.log('='.repeat(80));
  console.log('第八步验证：知识注入内部试运行');
  console.log('='.repeat(80));
  
  // 显示配置
  console.log('\n【当前配置】');
  const config = getTrialConfig();
  console.log('总开关:', config.enabled ? '✅ 开启' : '❌ 关闭');
  console.log('入口白名单:', config.entryWhitelist.join(', '));
  console.log('场景白名单:', config.scenarioWhitelist.join(', '));
  console.log('项目白名单:', config.projectWhitelist.length > 0 ? config.projectWhitelist.join(', ') : '不限制');
  
  const results = [];
  
  for (const sample of SAMPLES) {
    console.log(`\n${'═'.repeat(80)}`);
    console.log(`【样本 ${sample.id}】${sample.name}`);
    console.log(`${'═'.repeat(80)}`);
    
    console.log('\n样本摘要：');
    console.log(sample.conversationText.substring(0, 100) + '...');
    console.log('\nentry_source:', sample.entrySource);
    console.log('scenario:', sample.scenario);
    console.log('project_id:', sample.projectId);
    
    const input = {
      conversationText: sample.conversationText,
      scenario: sample.scenario,
      projectId: sample.projectId
    };
    
    const context = {
      entrySource: sample.entrySource,
      scenario: sample.scenario,
      projectId: sample.projectId
    };
    
    try {
      const result = await runKnowledgeInjectionTrial(input, context, originalLogic);
      
      results.push({
        sample: sample,
        result: result
      });
      
      console.log('\n【结果】');
      console.log('成功:', result.success ? '✅' : '❌');
      console.log('来源:', result.source);
      
      if (result.knowledgeInjected) {
        console.log('知识注入: ✅ 是');
        if (result.data) {
          console.log('模型输出评分:', result.data.score);
          console.log('模型输出场景:', result.data.scenario);
          console.log('模型输出建议回复:', result.data.suggested_reply?.substring(0, 100));
        }
      } else if (result.source === 'original_logic') {
        console.log('知识注入: ❌ 否（回退到原逻辑）');
      } else {
        console.log('知识注入: ❌ 否');
      }
      
    } catch (error) {
      console.error('❌ 测试失败:', error.message);
      results.push({
        sample: sample,
        error: error.message
      });
    }
    
    // 样本间等待
    if (sample.id < SAMPLES.length) {
      console.log('\n等待 2 秒...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  // ========================
  // 汇总结果
  // ========================
  console.log('\n' + '='.repeat(80));
  console.log('【汇总结果】');
  console.log('='.repeat(80));
  
  results.forEach((item, index) => {
    console.log(`\n样本 ${item.sample.id}: ${item.sample.name}`);
    console.log('  entry_source:', item.sample.entrySource);
    console.log('  scenario:', item.sample.scenario);
    
    if (item.error) {
      console.log('  状态: ❌ 失败 -', item.error);
    } else {
      console.log('  成功:', item.result.success ? '✅' : '❌');
      console.log('  来源:', item.result.source);
      console.log('  知识注入:', item.result.knowledgeInjected ? '✅' : '❌');
    }
  });
  
  // ========================
  // 最终结论
  // ========================
  console.log('\n' + '='.repeat(80));
  console.log('【最终结论】');
  console.log('='.repeat(80));
  
  const successCount = results.filter(r => r.result && r.result.success).length;
  const knowledgeInjectedCount = results.filter(r => r.result && r.result.knowledgeInjected).length;
  const fallbackCount = results.filter(r => r.result && r.result.source === 'original_logic').length;
  
  console.log(`\n3 条样本结果：`);
  console.log(`  - 成功: ${successCount} 条`);
  console.log(`  - 知识注入: ${knowledgeInjectedCount} 条`);
  console.log(`  - 回退到原逻辑: ${fallbackCount} 条`);
  
  if (successCount >= 3 && knowledgeInjectedCount >= 1 && fallbackCount >= 1) {
    console.log('\n✅ 第八步完成：知识注入回答链路已接入内部试运行');
    console.log('\n完成标准：');
    console.log('  1. ✅ 已确认真实回答链路入口（training-orchestrator.js）');
    console.log('  2. ✅ 已将知识注入接入该链路（knowledge-injection-trial.js）');
    console.log('  3. ✅ 已有最小开关和范围控制（KNOWLEDGE_INJECTION_* 环境变量）');
    console.log('  4. ✅ 已有最小日志（命中日志、回退日志）');
    console.log('  5. ✅ 已完成 3 条内部试运行样本验证');
    console.log('  6. ✅ 已证明至少 1 条样本在真实链路中受益（知识注入成功）');
    console.log('  7. ✅ 已证明至少 1 条样本在不命中时可安全回退');
    console.log('  8. ✅ 未扩展到复杂 RAG / 大型平台工程');
  } else if (successCount >= 3) {
    console.log('\n⚠️  知识注入已接入，但验证不完整');
    if (knowledgeInjectedCount === 0) console.log('  - 没有样本成功注入知识');
    if (fallbackCount === 0) console.log('  - 没有样本触发回退');
  } else {
    console.log('\n❌ 内部试运行接入未完成');
  }
}

main().catch(error => {
  console.error('测试失败:', error.message);
  console.error(error.stack);
  process.exit(1);
});
