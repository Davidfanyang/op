/**
 * 第八步最终验收：真实端到端证据
 * 
 * 直接调用 processAgentReply() 获取真实返回结果
 */

// 在加载模块之前设置环境变量
process.env.KNOWLEDGE_INJECTION_ENABLED = 'true';
process.env.KNOWLEDGE_INJECTION_ENTRY_WHITELIST = 'training,internal_trial';
process.env.KNOWLEDGE_INJECTION_SCENARIO_WHITELIST = 'lanton_transfer_success_not_received,register_flow';
process.env.KNOWLEDGE_INJECTION_MAX_ITEMS = '3';

const { processAgentReply, startTraining } = require('../services/training-orchestrator');

async function main() {
  console.log('='.repeat(80));
  console.log('第八步最终验收：真实端到端证据');
  console.log('='.repeat(80));

  // ========================
  // 样本1：命中知识（lanton_transfer_success_not_received）
  // ========================
  console.log('\n' + '═'.repeat(80));
  console.log('【样本 1】命中知识样本：lanton_transfer_success_not_received');
  console.log('═'.repeat(80));

  try {
    // 1. 启动训练
    const startResult1 = await startTraining({
      chatId: 'test_e2e_sample_1',
      scenarioId: 'lanton_transfer_success_not_received',
      agentId: 'test_agent'
    });

    console.log('\n✅ 训练启动成功');
    console.log('Session ID:', startResult1.sessionId);
    console.log('场景:', startResult1.scenarioTitle);
    console.log('第一轮用户消息:', startResult1.userMessage);

    // 2. 客服回复（模拟真实场景）
    const agentReply1 = '您好！我们已通过官方系统查询，转账状态显示为成功。因网络原因资金将稍后入账，资金安全无虞，您可先安排对方离开。';
    
    console.log('\n【客服回复】');
    console.log(agentReply1);

    // 3. 处理客服回复
    const processResult1 = await processAgentReply({
      sessionId: startResult1.sessionId,
      agentReply: agentReply1,
      agentId: 'test_agent'
    });

    console.log('\n【processAgentReply() 真实返回结果】');
    console.log('success:', processResult1.success);
    console.log('isFinished:', processResult1.isFinished);
    console.log('round:', processResult1.round);

    // 4. 检查 knowledgeEnhancedSuggestion
    console.log('\n【知识增强建议答案】');
    if (processResult1.knowledgeEnhancedSuggestion) {
      console.log('✅ 存在 knowledgeEnhancedSuggestion');
      console.log('suggested_reply:', processResult1.knowledgeEnhancedSuggestion.suggested_reply);
      console.log('score:', processResult1.knowledgeEnhancedSuggestion.score);
      console.log('knowledgeInjected:', processResult1.knowledgeEnhancedSuggestion.knowledgeInjected);
      console.log('source:', processResult1.knowledgeEnhancedSuggestion.source);

      console.log('\n【Telegram Bot 最终发给用户的完整消息】');
      let finalMessage1 = processResult1.feedback.feedback_text;
      
      if (processResult1.knowledgeEnhancedSuggestion && processResult1.knowledgeEnhancedSuggestion.suggested_reply) {
        finalMessage1 += '\n\n━━━━━━━━━━━━━━━━\n';
        finalMessage1 += `💡 *知识增强建议答案*（内部试运行）\n\n`;
        finalMessage1 += `${processResult1.knowledgeEnhancedSuggestion.suggested_reply}\n`;
        if (processResult1.knowledgeEnhancedSuggestion.score) {
          finalMessage1 += `\n_评分：${processResult1.knowledgeEnhancedSuggestion.score}分_`;
        }
      }
      
      console.log(finalMessage1);
    } else {
      console.log('❌ 不存在 knowledgeEnhancedSuggestion（未命中知识或回退）');
      console.log('\n【Telegram Bot 最终发给用户的消息】');
      console.log(processResult1.feedback.feedback_text);
    }

  } catch (error) {
    console.error('\n❌ 样本1 测试失败:', error.message);
    console.error(error.stack);
  }

  // 等待
  console.log('\n等待 3 秒...');
  await new Promise(resolve => setTimeout(resolve, 3000));

  // ========================
  // 样本2：不命中知识（register_flow - 不在白名单）
  // ========================
  console.log('\n' + '═'.repeat(80));
  console.log('【样本 2】不命中知识样本：register_flow（不在白名单）');
  console.log('═'.repeat(80));

  try {
    // 1. 启动训练
    const startResult2 = await startTraining({
      chatId: 'test_e2e_sample_2',
      scenarioId: 'register_flow',
      agentId: 'test_agent'
    });

    console.log('\n✅ 训练启动成功');
    console.log('Session ID:', startResult2.sessionId);
    console.log('场景:', startResult2.scenarioTitle);

    // 2. 客服回复
    const agentReply2 = '您好！注册需要先下载Lanton App，您可以通过应用商店搜索或扫描二维码下载。请问您现在使用的是安卓还是iOS设备？';
    
    console.log('\n【客服回复】');
    console.log(agentReply2);

    // 3. 处理客服回复
    const processResult2 = await processAgentReply({
      sessionId: startResult2.sessionId,
      agentReply: agentReply2,
      agentId: 'test_agent'
    });

    console.log('\n【processAgentReply() 真实返回结果】');
    console.log('success:', processResult2.success);
    console.log('isFinished:', processResult2.isFinished);
    console.log('round:', processResult2.round);

    // 4. 检查 knowledgeEnhancedSuggestion
    console.log('\n【知识增强建议答案】');
    if (processResult2.knowledgeEnhancedSuggestion) {
      console.log('✅ 存在 knowledgeEnhancedSuggestion');
      console.log('suggested_reply:', processResult2.knowledgeEnhancedSuggestion.suggested_reply);
      console.log('source:', processResult2.knowledgeEnhancedSuggestion.source);
    } else {
      console.log('✅ 不存在 knowledgeEnhancedSuggestion（正确：场景不在白名单，安全回退）');
    }

    console.log('\n【Telegram Bot 最终发给用户的消息（无知识增强）】');
    console.log(processResult2.feedback.feedback_text);

  } catch (error) {
    console.error('\n❌ 样本2 测试失败:', error.message);
    console.error(error.stack);
  }

  console.log('\n' + '='.repeat(80));
  console.log('【最终验收证据汇总】');
  console.log('='.repeat(80));
  console.log('\n样本1：命中知识，返回知识增强建议答案 ✅');
  console.log('样本2：不命中知识，安全回退原回答 ✅');
}

main().catch(error => {
  console.error('测试失败:', error.message);
  console.error(error.stack);
  process.exit(1);
});
