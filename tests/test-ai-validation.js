const { aiEvaluate } = require('./core/ai-evaluator');

async function runTests() {
  console.log('=== 测试AI评估验证功能 ===\n');

  // 测试1: 输入验证
  console.log('1. 测试输入验证...');
  try {
    await aiEvaluate('', {});
    console.log('❌ 应该抛出错误');
  } catch (error) {
    console.log('✅ 正确捕获输入错误:', error.message);
  }

  // 测试2: 场景验证
  console.log('\n2. 测试场景验证...');
  try {
    await aiEvaluate('测试回复', {});
    console.log('❌ 应该抛出错误');
  } catch (error) {
    console.log('✅ 正确捕获场景错误:', error.message);
  }

// 测试3: 结果验证函数
  console.log('\n3. 测试结果验证...');
  const { validateAiResult } = require('./core/ai-evaluator');

  // 测试有效结果
  try {
    const validResult = {
      enabled: true,
      insights: '测试评价',
      strengths: ['优点1'],
      weaknesses: ['缺点1'],
      dimensionScores: {
        attitude: 18,
        process: 15,
        information: 12,
        empathy: 16,
        clarity: 14
      }
    };
    validateAiResult(validResult);
    console.log('✅ 有效结果验证通过');
  } catch (error) {
    console.log('❌ 有效结果验证失败:', error.message);
  }

  // 测试无效分数
  try {
    const invalidResult = {
      enabled: true,
      insights: '测试评价',
      strengths: ['优点1'],
      weaknesses: ['缺点1'],
      dimensionScores: {
        attitude: 25, // 超出范围
        process: 15,
        information: 12,
        empathy: 16,
        clarity: 14
      }
    };
    validateAiResult(invalidResult);
    console.log('❌ 应该抛出分数范围错误');
  } catch (error) {
    console.log('✅ 正确捕获分数范围错误:', error.message);
  }

  console.log('\n=== AI评估验证测试完成 ===');
}

runTests().catch(console.error);
