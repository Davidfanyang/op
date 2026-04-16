/**
 * Evaluation Service 测试
 * 验证：输入校验、错误状态、结果标准化
 * 
 * 协议版本: v1.0（标准协议）
 * - 使用 conversation 数组（必填）
 * - 使用 currentReply/current_reply 字段
 * - 输出结构使用 v5.1 格式
 */

const { evaluate } = require('../services/evaluation-service');

async function runTests() {
  console.log('=== Evaluation Service 测试 ===\n');
  let passed = 0;
  let failed = 0;

  // 测试1: 正常输入（使用标准协议格式）
  console.log('测试1: 正常输入...');
  const result1 = await evaluate({
    projectId: 'default',
    mode: 'training',
    scenarioId: 'lanton_sms_code',
    conversation: [
      { role: 'user', content: '怎么申请验证码' },
      { role: 'agent', content: '您好，请提供手机号。' }
    ],
    currentReply: '您好，请提供手机号。'
  });
  // v5.1 输出结构：status, evaluationStatus, alertLevel, reviewStatus, scenarioId, result, coachSummary, riskLevel
  if ((result1.status === 'ok' || result1.status === 'alert_triggered') && result1.scenarioId && result1.result) {
    console.log('  ✓ 通过 - status:', result1.status, '场景:', result1.scenarioId, '结果:', result1.result.level);
    passed++;
  } else {
    console.log('  ✗ 失败 - 结果异常:', result1.status, result1.coachSummary);
    failed++;
  }

  // 测试2: 缺少 projectId
  console.log('\n测试2: 缺少 projectId...');
  const result2 = await evaluate({
    mode: 'training',
    scenarioId: 'lanton_sms_code',
    conversation: [{ role: 'agent', content: '测试' }],
    currentReply: '测试'
  });
  if (result2.status === 'invalid_input') {
    console.log('  ✓ 通过 - 正确返回 invalid_input');
    passed++;
  } else {
    console.log('  ✗ 失败 - 状态不对:', result2.status);
    failed++;
  }

  // 测试3: 缺少 scenarioId
  console.log('\n测试3: 缺少 scenarioId...');
  const result3 = await evaluate({
    projectId: 'default',
    mode: 'training',
    conversation: [{ role: 'agent', content: '测试' }],
    currentReply: '测试'
  });
  if (result3.status === 'invalid_input') {
    console.log('  ✓ 通过 - 正确返回 invalid_input');
    passed++;
  } else {
    console.log('  ✗ 失败 - 状态不对:', result3.status);
    failed++;
  }

  // 测试4: 缺少 currentReply
  console.log('\n测试4: 缺少 currentReply...');
  const result4 = await evaluate({
    projectId: 'default',
    mode: 'training',
    scenarioId: 'lanton_sms_code',
    conversation: [{ role: 'agent', content: '测试' }]
  });
  if (result4.status === 'invalid_input') {
    console.log('  ✓ 通过 - 正确返回 invalid_input');
    passed++;
  } else {
    console.log('  ✗ 失败 - 状态不对:', result4.status);
    failed++;
  }

  // 测试5: 无效 mode
  console.log('\n测试5: 无效 mode...');
  const result5 = await evaluate({
    projectId: 'default',
    mode: 'invalid_mode',
    scenarioId: 'lanton_sms_code',
    conversation: [{ role: 'agent', content: '测试' }],
    currentReply: '测试'
  });
  if (result5.status === 'invalid_input') {
    console.log('  ✓ 通过 - 正确返回 invalid_input');
    passed++;
  } else {
    console.log('  ✗ 失败 - 状态不对:', result5.status);
    failed++;
  }

  // 测试6: 场景不存在
  console.log('\n测试6: 场景不存在...');
  const result6 = await evaluate({
    projectId: 'default',
    mode: 'training',
    scenarioId: 'not_exist',
    conversation: [
      { role: 'user', content: '测试' },
      { role: 'agent', content: '测试回复' }
    ],
    currentReply: '测试回复'
  });
  // v5.1 会使用兜底场景，不会返回 scenario_not_found
  if (result6.scenarioId && result6.result) {
    console.log('  ✓ 通过 - 使用兜底场景:', result6.scenarioId);
    passed++;
  } else {
    console.log('  ✗ 失败 - 状态不对:', result6.status);
    failed++;
  }

  // 测试7: 输出结构完整性
  console.log('\n测试7: 输出结构完整性...');
  const result7 = await evaluate({
    projectId: 'default',
    mode: 'training',
    scenarioId: 'lanton_sms_code',
    conversation: [
      { role: 'user', content: '测试' },
      { role: 'agent', content: '您好。' }
    ],
    currentReply: '您好。'
  });
  // v5.1 输出结构字段
  const requiredFields = ['status', 'evaluationStatus', 'alertLevel', 'reviewStatus', 'scenarioId', 'result', 'coachSummary', 'riskLevel', 'meta'];
  const missing = requiredFields.filter(f => result7[f] === undefined);
  if (missing.length === 0) {
    console.log('  ✓ 通过 - 所有必要字段存在');
    passed++;
  } else {
    console.log('  ✗ 失败 - 缺少字段:', missing.join(', '));
    failed++;
  }

  console.log('\n=== 测试结果 ===');
  console.log(`通过: ${passed}`);
  console.log(`失败: ${failed}`);
  return failed === 0;
}

runTests().then(success => {
  process.exit(success ? 0 : 1);
});
