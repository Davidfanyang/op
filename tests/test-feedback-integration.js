/**
 * 训练反馈模板集成测试
 * 
 * 验证 feedback-template-service 在实际训练流程中的集成效果
 */

const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const {
  startTraining,
  processAgentReply,
  stopTraining,
  getTrainingStatus
} = require('../services/training-orchestrator');

const { getScenarioById } = require('../core/scenario-loader');

console.log('=== 训练反馈模板集成测试 ===\n');

/**
 * 测试：完整训练流程中的反馈生成
 */
async function testFeedbackInTrainingFlow() {
  console.log('[测试] 完整训练流程中的反馈生成\n');
  
  const chatId = 'test_chat_feedback_integration';
  const scenarioId = 'register_flow';
  const agentId = 'test_agent';
  
  try {
    // 1. 启动训练
    console.log('📍 步骤 1: 启动训练');
    const startResult = await startTraining({
      chatId,
      scenarioId,
      agentId
    });
    
    console.log(`✅ 训练启动成功`);
    console.log(`   Session ID: ${startResult.sessionId}`);
    console.log(`   场景: ${startResult.scenarioTitle}`);
    console.log(`   第一轮用户消息: ${startResult.userMessage}\n`);
    
    // 2. 模拟客服回复（第 1 轮）
    console.log('📍 步骤 2: 第 1 轮客服回复');
    const agentReply1 = '您好！注册很简单，请提供您的手机号码。';
    
    const result1 = await processAgentReply({
      sessionId: startResult.sessionId,
      agentReply: agentReply1,
      agentId
    });
    
    // 验证反馈生成
    if (!result1.feedback) {
      throw new Error('第 1 轮反馈未生成');
    }
    
    console.log('✅ 第 1 轮反馈生成成功');
    console.log(`   feedback_text 长度: ${result1.feedback.feedback_text.length} 字符`);
    console.log(`   structured_feedback 字段数: ${Object.keys(result1.feedback.structured_feedback).length}`);
    console.log(`   训练状态: ${result1.feedback.structured_feedback.status}\n`);
    
    // 验证 feedback_text 内容
    const feedbackTextChecks = [
      {
        name: 'feedback_text 包含场景名称',
        pass: result1.feedback.feedback_text.includes('注册流程指引')
      },
      {
        name: 'feedback_text 包含轮次',
        pass: result1.feedback.feedback_text.includes('第 1 轮')
      },
      {
        name: 'feedback_text 包含优点部分',
        pass: result1.feedback.feedback_text.includes('本轮做得好的地方')
      },
      {
        name: 'feedback_text 包含问题部分',
        pass: result1.feedback.feedback_text.includes('本轮存在的问题')
      },
      {
        name: 'feedback_text 包含缺失项部分',
        pass: result1.feedback.feedback_text.includes('本轮缺失项')
      },
      {
        name: 'feedback_text 包含建议部分',
        pass: result1.feedback.feedback_text.includes('下一步建议')
      },
      {
        name: 'feedback_text 包含训练状态',
        pass: result1.feedback.feedback_text.includes('训练状态')
      },
      {
        name: 'feedback_text 是人话（不包含 JSON）',
        pass: !result1.feedback.feedback_text.includes('{') && 
              !result1.feedback.feedback_text.includes('}')
      }
    ];
    
    // 验证 structured_feedback 内容
    const structuredFeedbackChecks = [
      {
        name: 'structured_feedback 包含 scenario_id',
        pass: result1.feedback.structured_feedback.scenario_id === 'register_flow'
      },
      {
        name: 'structured_feedback 包含 scenario_title',
        pass: result1.feedback.structured_feedback.scenario_title === '注册流程指引'
      },
      {
        name: 'structured_feedback 包含 round',
        pass: result1.feedback.structured_feedback.round === 1
      },
      {
        name: 'structured_feedback 包含 strengths 数组',
        pass: Array.isArray(result1.feedback.structured_feedback.strengths)
      },
      {
        name: 'structured_feedback 包含 problems 数组',
        pass: Array.isArray(result1.feedback.structured_feedback.problems)
      },
      {
        name: 'structured_feedback 包含 missing 数组',
        pass: Array.isArray(result1.feedback.structured_feedback.missing)
      },
      {
        name: 'structured_feedback 包含 suggestions 数组',
        pass: Array.isArray(result1.feedback.structured_feedback.suggestions)
      },
      {
        name: 'structured_feedback 包含 is_finished',
        pass: typeof result1.feedback.structured_feedback.is_finished === 'boolean'
      },
      {
        name: 'structured_feedback 包含 status',
        pass: ['continuing', 'finished'].includes(result1.feedback.structured_feedback.status)
      },
      {
        name: 'structured_feedback 包含 generated_at',
        pass: typeof result1.feedback.structured_feedback.generated_at === 'string'
      }
    ];
    
    // 打印验证结果
    console.log(`${'='.repeat(60)}`);
    console.log('[验证结果] feedback_text');
    console.log(`${'='.repeat(60)}`);
    
    let passCount = 0;
    feedbackTextChecks.forEach(check => {
      const status = check.pass ? '✅' : '❌';
      console.log(`${status} ${check.name}`);
      if (check.pass) passCount++;
    });
    console.log(`\nfeedback_text: ${passCount}/${feedbackTextChecks.length} 通过\n`);
    
    console.log(`${'='.repeat(60)}`);
    console.log('[验证结果] structured_feedback');
    console.log(`${'='.repeat(60)}`);
    
    let structuredPassCount = 0;
    structuredFeedbackChecks.forEach(check => {
      const status = check.pass ? '✅' : '❌';
      console.log(`${status} ${check.name}`);
      if (check.pass) structuredPassCount++;
    });
    console.log(`\nstructured_feedback: ${structuredPassCount}/${structuredFeedbackChecks.length} 通过\n`);
    
    // 3. 模拟第 2 轮客服回复
    console.log('📍 步骤 3: 第 2 轮客服回复');
    const agentReply2 = '好的，请按以下步骤操作：1. 打开APP 2. 点击注册 3. 输入手机号';
    
    const result2 = await processAgentReply({
      sessionId: startResult.sessionId,
      agentReply: agentReply2,
      agentId
    });
    
    if (!result2.feedback) {
      throw new Error('第 2 轮反馈未生成');
    }
    
    console.log('✅ 第 2 轮反馈生成成功');
    console.log(`   轮次: ${result2.feedback.structured_feedback.round}`);
    console.log(`   训练状态: ${result2.feedback.structured_feedback.status}\n`);
    
    // 4. 停止训练
    console.log('📍 步骤 4: 停止训练');
    const stopResult = await stopTraining(startResult.sessionId);
    
    console.log('✅ 训练已停止\n');
    
    // 总结
    const allChecks = [...feedbackTextChecks, ...structuredFeedbackChecks];
    const totalPass = allChecks.filter(c => c.pass).length;
    
    console.log(`${'='.repeat(60)}`);
    console.log('[总结] 集成测试');
    console.log(`${'='.repeat(60)}`);
    console.log(`\n总计: ${totalPass}/${allChecks.length} 验证通过\n`);
    
    if (totalPass === allChecks.length) {
      console.log('🎉 集成测试通过！反馈模板在训练流程中正常工作。\n');
      return true;
    } else {
      console.log('❌ 集成测试失败，部分验证未通过。\n');
      return false;
    }
    
  } catch (error) {
    console.error('❌ 集成测试失败:', error.message);
    console.error(error.stack);
    return false;
  }
}

/**
 * 测试：反馈建议的可执行性
 */
function testSuggestionExecutability() {
  console.log('\n[测试] 反馈建议的可执行性\n');
  
  const { generateFeedback } = require('../services/feedback-template-service');
  
  const scenario = {
    id: 'test_scenario',
    title: '测试场景'
  };
  
  // 测试不同问题类型的建议生成
  const testCases = [
    {
      name: '语气问题',
      issues: ['语气过于生硬'],
      expectedKeywords: ['语气', '友善', '专业']
    },
    {
      name: '信息完整性问题',
      issues: ['信息不完整'],
      expectedKeywords: ['信息', '必要', '关键']
    },
    {
      name: '流程问题',
      issues: ['没有按照流程操作'],
      expectedKeywords: ['流程', '步骤', '标准']
    },
    {
      name: '身份验证问题',
      issues: ['没有验证客户身份'],
      expectedKeywords: ['身份', '验证', '确认']
    },
    {
      name: '解决方案问题',
      issues: ['没有提供解决方案'],
      expectedKeywords: ['方案', '解决', '明确']
    }
  ];
  
  let allPassed = true;
  
  testCases.forEach(testCase => {
    const analysis = {
      strengths: [],
      issues: testCase.issues,
      missing: [],
      riskLevel: 'medium',
      result: { level: 'fail' }
    };
    
    const result = generateFeedback({
      scenario,
      round: 0,
      analysis,
      isFinished: false
    });
    
    // 验证建议是否包含可执行的关键词
    const hasExecutableSuggestion = result.structured_feedback.suggestions.some(suggestion => {
      return testCase.expectedKeywords.some(keyword => 
        suggestion.includes(keyword)
      );
    });
    
    const status = hasExecutableSuggestion ? '✅' : '❌';
    console.log(`${status} ${testCase.name}: ${result.structured_feedback.suggestions[0] || '无建议'}`);
    
    if (!hasExecutableSuggestion) {
      allPassed = false;
    }
  });
  
  console.log('');
  
  if (allPassed) {
    console.log('🎉 建议可执行性测试通过！\n');
    return true;
  } else {
    console.log('❌ 建议可执行性测试失败！\n');
    return false;
  }
}

// 运行所有测试
async function runAllTests() {
  const results = [];
  
  results.push(await testFeedbackInTrainingFlow());
  results.push(testSuggestionExecutability());
  
  console.log(`${'='.repeat(60)}`);
  console.log('[总结] 所有集成测试');
  console.log(`${'='.repeat(60)}`);
  
  const passCount = results.filter(r => r).length;
  console.log(`\n总计: ${passCount}/${results.length} 测试通过\n`);
  
  if (passCount === results.length) {
    console.log('🎉 所有集成测试通过！反馈模板服务已正确接入训练流程。\n');
    process.exit(0);
  } else {
    console.log('❌ 部分集成测试失败，请检查实现。\n');
    process.exit(1);
  }
}

// 执行测试
runAllTests().catch(error => {
  console.error('测试执行失败:', error);
  process.exit(1);
});
