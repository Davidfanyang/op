/**
 * Trainer 主链测试
 * 验证：输入校验、场景加载、评分调用、错误处理
 */

const { evaluateTraining } = require('../core/trainer');

async function runTests() {
  console.log('=== Trainer 主链测试 ===\n');
  let passed = 0;
  let failed = 0;

  // 测试1: 正常输入
  console.log('测试1: 正常输入...');
  try {
    const result = await evaluateTraining({
      scenarioId: 'lanton_sms_code',
      userReply: '您好，请提供手机号，我们帮您申请验证码。'
    });
    if (result.score !== undefined && result.dimensionScores) {
      console.log('  ✓ 通过 - 分数:', result.score);
      passed++;
    } else {
      console.log('  ✗ 失败 - 返回结构不完整');
      failed++;
    }
  } catch (err) {
    console.log('  ✗ 失败:', err.message);
    failed++;
  }

  // 测试2: 缺少 scenarioId
  console.log('\n测试2: 缺少 scenarioId...');
  try {
    await evaluateTraining({
      userReply: '测试回复'
    });
    console.log('  ✗ 失败 - 应该抛出错误');
    failed++;
  } catch (err) {
    if (err.message.includes('scenarioId')) {
      console.log('  ✓ 通过 - 正确捕获错误');
      passed++;
    } else {
      console.log('  ✗ 失败 - 错误类型不对:', err.message);
      failed++;
    }
  }

  // 测试3: 缺少 userReply
  console.log('\n测试3: 缺少 userReply...');
  try {
    await evaluateTraining({
      scenarioId: 'lanton_sms_code'
    });
    console.log('  ✗ 失败 - 应该抛出错误');
    failed++;
  } catch (err) {
    if (err.message.includes('userReply')) {
      console.log('  ✓ 通过 - 正确捕获错误');
      passed++;
    } else {
      console.log('  ✗ 失败 - 错误类型不对:', err.message);
      failed++;
    }
  }

  // 测试4: 场景不存在
  console.log('\n测试4: 场景不存在...');
  try {
    await evaluateTraining({
      scenarioId: 'not_exist_scenario',
      userReply: '测试回复'
    });
    console.log('  ✗ 失败 - 应该抛出错误');
    failed++;
  } catch (err) {
    if (err.message.includes('未找到场景')) {
      console.log('  ✓ 通过 - 正确捕获错误');
      passed++;
    } else {
      console.log('  ✗ 失败 - 错误类型不对:', err.message);
      failed++;
    }
  }

  // 测试5: 空输入
  console.log('\n测试5: 空输入...');
  try {
    await evaluateTraining(null);
    console.log('  ✗ 失败 - 应该抛出错误');
    failed++;
  } catch (err) {
    console.log('  ✓ 通过 - 正确捕获错误');
    passed++;
  }

  console.log('\n=== 测试结果 ===');
  console.log(`通过: ${passed}`);
  console.log(`失败: ${failed}`);
  return failed === 0;
}

runTests().then(success => {
  process.exit(success ? 0 : 1);
});
