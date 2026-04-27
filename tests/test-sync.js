const { evaluateTrainingSync } = require('./core/trainer');

// 测试同步评估
console.log('=== 测试同步评估功能 ===');

try {
  const testInput = {
    scenarioId: "lanton_sms_code",
    userReply: "您好，请您提供注册时使用的手机号，我们将为您申请验证码。"
  };
  
  const result = evaluateTrainingSync(testInput);
  console.log('同步评估结果:');
  console.log(JSON.stringify(result, null, 2));
  console.log('\n✅ 同步评估功能正常');
} catch (error) {
  console.error('❌ 同步评估失败:', error.message);
}
