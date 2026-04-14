/**
 * 模式隔离测试
 * 验证 training 和 live_monitor 两条链完全分流，不互相污染
 */

const { evaluate } = require('../services/evaluation-service');

async function runTests() {
  console.log('=== 模式隔离测试 ===\n');
  let passed = 0;
  let failed = 0;

  // 测试1: training 模式必须提供 scenarioId
  console.log('测试1: training 模式缺少 scenarioId...');
  const result1 = await evaluate({
    projectId: 'default',
    mode: 'training',
    userReply: '测试回复'
  });
  if (result1.status === 'invalid_input') {
    console.log('  ✓ 通过 - training 强制要求 scenarioId');
    passed++;
  } else {
    console.log('  ✗ 失败 - 应该拒绝:', result1.status);
    failed++;
  }

  // 测试2: training 模式不走自动匹配
  console.log('\n测试2: training 模式忽略 customerMessage...');
  const result2 = await evaluate({
    projectId: 'default',
    mode: 'training',
    scenarioId: 'lanton_sms_code',
    customerMessage: '我转账没到账',  // 这个应该被忽略
    userReply: '您好，请提供手机号'
  });
  if (result2.status === 'ok' && result2.scenarioId === 'lanton_sms_code') {
    console.log('  ✓ 通过 - training 使用固定 scenarioId，忽略 customerMessage');
    passed++;
  } else {
    console.log('  ✗ 失败:', result2.status);
    failed++;
  }

  // 测试3: live_monitor 模式不强依赖 scenarioId
  console.log('\n测试3: live_monitor 模式通过 customerMessage 自动匹配...');
  const result3 = await evaluate({
    projectId: 'lanton',
    mode: 'live_monitor',
    customerMessage: '我转账显示成功但对方没收到',
    userReply: '请稍等，我们帮您查询'
  });
  // 验证自动匹配功能：有 matchedScenario 且状态有效（ok 或 alert_triggered 都是有效状态）
  const validStatus3 = result3.status === 'ok' || result3.status === 'alert_triggered';
  if (validStatus3 && result3.matchedScenario) {
    console.log('  ✓ 通过 - live_monitor 自动匹配场景:', result3.matchedScenario.id, '状态:', result3.status);
    passed++;
  } else {
    console.log('  ✗ 失败:', result3.status, result3.matchedScenario);
    failed++;
  }

  // 测试4: live_monitor 模式指定 scenarioId 优先
  console.log('\n测试4: live_monitor 模式指定 scenarioId 优先于自动匹配...');
  const result4 = await evaluate({
    projectId: 'lanton',
    mode: 'live_monitor',
    scenarioId: 'lanton_sms_code',  // 明确指定
    customerMessage: '我转账显示成功但对方没收到',  // 这个应该被忽略
    userReply: '请提供手机号'
  });
  // 验证指定 scenarioId 优先：scenarioId 正确且状态有效
  const validStatus4 = result4.status === 'ok' || result4.status === 'alert_triggered';
  if (validStatus4 && result4.scenarioId === 'lanton_sms_code') {
    console.log('  ✓ 通过 - 指定 scenarioId 优先, 状态:', result4.status);
    passed++;
  } else {
    console.log('  ✗ 失败 - scenarioId:', result4.scenarioId, 'status:', result4.status);
    failed++;
  }

  // 测试5: 两条链返回结构一致性
  console.log('\n测试5: 两条链返回结构一致性...');
  const trainingResult = await evaluate({
    projectId: 'default',
    mode: 'training',
    scenarioId: 'lanton_sms_code',
    userReply: '您好'
  });
  const monitorResult = await evaluate({
    projectId: 'lanton',
    mode: 'live_monitor',
    scenarioId: 'lanton_sms_code',
    userReply: '您好'
  });
  
  const baseFields = ['status', 'projectId', 'mode', 'scenarioId', 'score', 'dimensionScores', 'findings', 'suggestions', 'summary', 'meta'];
  const trainingHasAll = baseFields.every(f => trainingResult[f] !== undefined);
  const monitorHasAll = baseFields.every(f => monitorResult[f] !== undefined);
  
  if (trainingHasAll && monitorHasAll) {
    console.log('  ✓ 通过 - 两条链基础字段一致');
    passed++;
  } else {
    console.log('  ✗ 失败 - training:', trainingHasAll, 'monitor:', monitorHasAll);
    failed++;
  }

  // 测试6: live_monitor 特有字段
  console.log('\n测试6: live_monitor 特有字段...');
  if (monitorResult.alerts !== undefined && monitorResult.matchedScenario !== undefined) {
    console.log('  ✓ 通过 - live_monitor 包含 alerts 和 matchedScenario');
    passed++;
  } else {
    console.log('  ✗ 失败 - 缺少特有字段');
    failed++;
  }

  // 测试7: training 不应有 live_monitor 特有字段
  console.log('\n测试7: training 不应有 alerts...');
  if (trainingResult.alerts === undefined) {
    console.log('  ✓ 通过 - training 模式无 alerts');
    passed++;
  } else {
    console.log('  ✗ 失败 - training 不应有 alerts');
    failed++;
  }

  console.log('\n=== 测试结果 ===');
  console.log(`通过: ${passed}`);
  console.log(`失败: ${failed}`);
  
  if (failed > 0) {
    console.log('\n⚠️ 模式隔离存在问题，需要修复！');
  } else {
    console.log('\n✅ 模式隔离验证通过');
  }
  
  return failed === 0;
}

runTests().then(success => {
  process.exit(success ? 0 : 1);
});
