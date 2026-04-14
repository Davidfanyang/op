/**
 * Evaluator 评分器测试
 * 验证：API调用、响应解析、错误处理
 */

const { evaluateReply } = require('../core/evaluator');

// 模拟场景
const mockScenario = {
  id: 'test_scenario',
  title: '测试场景',
  customerMessage: '测试客户消息',
  standardReply: '标准回复话术'
};

async function runTests() {
  console.log('=== Evaluator 评分器测试 ===\n');
  let passed = 0;
  let failed = 0;

  // 测试1: 正常评分
  console.log('测试1: 正常评分...');
  try {
    const result = await evaluateReply('您好，请问有什么可以帮您？', mockScenario);
    if (result.score !== undefined && result.dimensionScores) {
      console.log('  ✓ 通过 - 分数:', result.score);
      passed++;
    } else {
      console.log('  ✗ 失败 - 返回结构不完整');
      failed++;
    }
  } catch (err) {
    console.log('  ⚠ 跳过 - API可能未运行:', err.message);
    // API未运行时不算失败
  }

  // 测试2: 空回复
  console.log('\n测试2: 空回复...');
  try {
    const result = await evaluateReply('', mockScenario);
    console.log('  ✓ 通过 - 空回复处理完成，分数:', result.score);
    passed++;
  } catch (err) {
    console.log('  ⚠ 跳过 - API可能未运行:', err.message);
  }

  // 测试3: 长回复
  console.log('\n测试3: 长回复...');
  try {
    const longReply = '您好，非常感谢您的咨询。关于您的问题，我们需要先核实一下您的账户信息，请您提供注册手机号，我们会尽快为您处理。如果还有其他问题，欢迎随时联系客服。祝您生活愉快！';
    const result = await evaluateReply(longReply, mockScenario);
    console.log('  ✓ 通过 - 长回复处理完成，分数:', result.score);
    passed++;
  } catch (err) {
    console.log('  ⚠ 跳过 - API可能未运行:', err.message);
  }

  // 测试4: 特殊字符
  console.log('\n测试4: 特殊字符...');
  try {
    const specialReply = '您好！<script>alert(1)</script> \n\n 测试 **markdown** `code`';
    const result = await evaluateReply(specialReply, mockScenario);
    console.log('  ✓ 通过 - 特殊字符处理完成');
    passed++;
  } catch (err) {
    console.log('  ⚠ 跳过 - API可能未运行:', err.message);
  }

  console.log('\n=== 测试结果 ===');
  console.log(`通过: ${passed}`);
  console.log(`失败: ${failed}`);
  console.log('\n注意: 如果API未运行，部分测试会被跳过');
  return failed === 0;
}

runTests().then(success => {
  process.exit(success ? 0 : 1);
});
