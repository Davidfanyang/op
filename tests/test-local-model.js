const { evaluateTraining } = require('./core/trainer');

// 测试用例
const testCases = [
  {
    name: '注册验证码 - 标准回复',
    input: {
      scenarioId: 'lanton_sms_code',
      userReply: '您好，请提供您的手机号，我们帮您申请验证码。'
    }
  },
  {
    name: '跨行转账维护 - 详细回复',
    input: {
      scenarioId: 'lanton_maintenance',
      userReply: '目前柬埔寨境内跨行转账/银行间转账功能异常，影响范围涉及多家银行。因此，Lanton Pay发起的转出到其他银行交易可能暂时无法完成或会延迟。您的账户资金安全不受影响，我们正在持续跟进恢复情况。建议您先使用替代方式（如本平台内转、同银行转账或其他可用支付方式），恢复后我们会第一时间通知。'
    }
  },
  {
    name: '转账未到账 - 完整回复',
    input: {
      scenarioId: 'lanton_not_received',
      userReply: '您好：为了更好地协助您处理，麻烦您提供付款账单的截图和Lanton绑定的手机号，以便我们进一步查询交易状态。我们会尽快为您核查处理，谢谢！'
    }
  }
];

async function runTests() {
  console.log('=== 本地模型 API 测试 ===\n');
  console.log('API 地址: http://localhost:8000/score\n');
  
  for (let i = 0; i < testCases.length; i++) {
    const testCase = testCases[i];
    console.log(`\n${'='.repeat(60)}`);
    console.log(`测试 ${i + 1}: ${testCase.name}`);
    console.log('='.repeat(60));
    
    try {
      const result = await evaluateTraining(testCase.input);
      
      console.log('\n✅ 测试成功!');
      console.log(`总分: ${result.score}/100`);
      console.log(`评价: ${result.coachSummary}`);
      console.log(`\n维度得分:`);
      console.log(`  态度礼貌性: ${result.dimensionScores.attitude}/20`);
      console.log(`  流程完整性: ${result.dimensionScores.process}/20`);
      console.log(`  信息收集: ${result.dimensionScores.information}/20`);
      console.log(`  安抚能力: ${result.dimensionScores.empathy}/20`);
      console.log(`  表达清晰度: ${result.dimensionScores.clarity}/20`);
      
      if (result.strengths && result.strengths.length > 0) {
        console.log(`\n优点:`);
        result.strengths.forEach(s => console.log(`  ✓ ${s}`));
      }
      
      if (result.findings && result.findings.length > 0) {
        console.log(`\n需要改进:`);
        result.findings.forEach(f => console.log(`  ⚠ ${f.message || f}`));
      }
      
      if (result.suggestions && result.suggestions.length > 0) {
        console.log(`\n建议:`);
        result.suggestions.forEach(s => console.log(`  → ${s}`));
      }
      
      console.log(`\n元数据:`);
      console.log(`  版本: ${result.meta?.evaluatorVersion}`);
      console.log(`  模式: ${result.meta?.mode}`);
      console.log(`  来源: ${result.meta?.source}`);
      
    } catch (error) {
      console.log('\n❌ 测试失败!');
      console.log(`错误: ${error.message}`);
      console.log('\n请检查:');
      console.log('  1. 本地模型服务是否已启动 (localhost:8000)');
      console.log('  2. API 地址是否正确');
      console.log('  3. 模型服务是否正常运行');
    }
  }
  
  console.log(`\n${'='.repeat(60)}`);
  console.log('测试完成');
  console.log('='.repeat(60));
}

runTests();
