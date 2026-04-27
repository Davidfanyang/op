const { evaluateReply } = require('./core/evaluator');
const scenarios = require('./data/scenarios.json');

// 测试用例
const testCases = [
  {
    name: '跨行转账维护 - 你的回复',
    scenarioId: 'lanton_maintenance',
    userReply: '目前柬埔寨境内跨行转账/银行间转账功能异常，影响范围涉及多家银行。因此，Lanton Pay发起的转出到其他银行交易可能暂时无法完成或会延迟。您的账户资金安全不受影响，我们正在持续跟进恢复情况。建议您先使用替代方式（如本平台内转、同银行转账或其他可用支付方式），恢复后我们会第一时间通知。'
  },
  {
    name: '跨行转账维护 - 标准回复',
    scenarioId: 'lanton_maintenance',
    userReply: '目前柬埔寨境内跨行转账功能异常，相关交易暂时延迟。建议您先使用本平台内转或其他支付方式，恢复后第一时间通知。'
  },
  {
    name: '注册验证码 - 良好回复',
    scenarioId: 'lanton_sms_code',
    userReply: '您好～😊 在注册 Lanton Pay 时收不到验证码，请您提供注册时使用的手机号，我们将为您申请验证码。'
  },
  {
    name: '注册验证码 - 差回复',
    scenarioId: 'lanton_sms_code',
    userReply: '不知道，自己解决'
  },
  {
    name: '转账未到账 - 完整回复',
    scenarioId: 'lanton_not_received',
    userReply: '您好：为了更好地协助您处理，麻烦您提供付款账单的截图和Lanton绑定的手机号，以便我们进一步查询交易状态。我们会尽快为您核查处理，谢谢！'
  }
];

function runTests() {
  console.log('=== 智能评分算法测试 ===\n');
  
  testCases.forEach((testCase, index) => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`测试 ${index + 1}: ${testCase.name}`);
    console.log('='.repeat(60));
    
    const scenario = scenarios.find(s => s.id === testCase.scenarioId);
    if (!scenario) {
      console.log(`❌ 未找到场景: ${testCase.scenarioId}`);
      return;
    }
    
    console.log(`\n场景: ${scenario.title}`);
    console.log(`用户问题: ${scenario.customerMessage}`);
    console.log(`\n客服回复: ${testCase.userReply.substring(0, 100)}${testCase.userReply.length > 100 ? '...' : ''}`);
    
    const result = evaluateReply(testCase.userReply, scenario);
    
    console.log(`\n--- 评分结果 ---`);
    console.log(`总分: ${result.score}/100`);
    console.log(`\n维度得分:`);
    console.log(`  态度礼貌性: ${result.dimensionScores.attitude}/20`);
    console.log(`  流程完整性: ${result.dimensionScores.process}/20`);
    console.log(`  信息收集: ${result.dimensionScores.information}/20`);
    console.log(`  安抚能力: ${result.dimensionScores.empathy}/20`);
    console.log(`  表达清晰度: ${result.dimensionScores.clarity}/20`);
    
    console.log(`\n优点:`);
    if (result.strengths.length > 0) {
      result.strengths.forEach(s => console.log(`  ✓ ${s}`));
    } else {
      console.log('  (无)');
    }
    
    console.log(`\n需要改进:`);
    result.findings.forEach(f => console.log(`  ⚠ ${f.message}`));
    
    console.log(`\n建议:`);
    result.suggestions.forEach(s => console.log(`  → ${s}`));
    
    // 打印详细分析
    if (result._raw) {
      console.log(`\n--- 详细分析 ---`);
      console.log(`态度检测:`, JSON.stringify(result._raw.attitude.details, null, 2));
      console.log(`流程相似度: ${(result._raw.process.similarity * 100).toFixed(1)}%`);
      console.log(`检测到的动作词: ${result._raw.process.actions?.join(', ') || '无'}`);
      console.log(`安抚表达:`, JSON.stringify(result._raw.empathy.details, null, 2));
      console.log(`清晰度:`, JSON.stringify(result._raw.clarity.details, null, 2));
    }
  });
  
  console.log(`\n${'='.repeat(60)}`);
  console.log('测试完成');
  console.log('='.repeat(60));
}

runTests();
