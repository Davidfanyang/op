/**
 * 持久化字段测试
 * 验证返回结果包含所有必要字段，便于数据库存储
 */

const { evaluate } = require('../services/evaluation-service');

async function runTests() {
  console.log('=== 持久化字段测试 ===\n');
  let passed = 0;
  let failed = 0;

  // 定义期望的持久化字段
  const requiredFields = [
    'projectId',           // 项目ID
    'mode',                // 模式
    'sessionId',           // 会话ID（从metadata中提取）
    'scenarioId',          // 场景ID
    'customerMessage',     // 客户消息
    'userReply',           // 客服回复
    'matchedScenarioId',   // 匹配的场景ID
    'matchConfidence',     // 匹配置信度
    'score',               // 总分
    'dimensionScores',     // 维度得分
    'findings',            // 发现问题
    'alertLevel',          // 告警级别
    'status',              // 状态
    'createdAt'            // 创建时间
  ];

  console.log('测试1: live_monitor 正常响应字段完整性...');
  const result1 = await evaluate({
    projectId: 'lanton',
    mode: 'live_monitor',
    customerMessage: '我注册 Lanton Pay 一直收不到验证码',
    userReply: '您好，请提供手机号',
    metadata: {
      sessionId: 'sess_123',
      employeeId: 'emp_456',
      customerMessage: '我注册 Lanton Pay 一直收不到验证码'
    }
  });

  // 检查字段存在性
  const fieldChecks = {
    projectId: result1.projectId !== undefined,
    mode: result1.mode !== undefined,
    sessionId: result1.sessionId !== undefined,
    scenarioId: result1.scenarioId !== undefined,
    customerMessage: result1.customerMessage !== undefined,
    userReply: result1.userReply !== undefined,
    matchedScenarioId: result1.matchedScenario?.id !== undefined,
    matchConfidence: result1.matchConfidence !== undefined,
    score: result1.score !== undefined,
    dimensionScores: result1.dimensionScores !== undefined,
    findings: result1.findings !== undefined,
    alertLevel: result1.alerts !== undefined,
    status: result1.status !== undefined,
    createdAt: result1.meta?.timestamp !== undefined,
    employeeId: result1.employeeId !== undefined
  };

  const missingFields = Object.keys(fieldChecks).filter(k => !fieldChecks[k]);
  
  if (missingFields.length === 0) {
    console.log('  ✓ 通过 - 所有必要字段存在');
    passed++;
  } else {
    console.log('  ✗ 失败 - 缺少字段:', missingFields.join(', '));
    failed++;
  }

  // 打印实际返回的字段用于调试
  console.log('\n  实际返回的关键字段:');
  console.log(`    projectId: ${result1.projectId}`);
  console.log(`    mode: ${result1.mode}`);
  console.log(`    scenarioId: ${result1.scenarioId}`);
  console.log(`    matchedScenario.id: ${result1.matchedScenario?.id}`);
  console.log(`    matchConfidence: ${result1.matchConfidence}`);
  console.log(`    score: ${result1.score}`);
  console.log(`    status: ${result1.status}`);
  console.log(`    alerts数量: ${result1.alerts?.length || 0}`);

  console.log('\n测试2: 错误响应字段完整性...');
  const result2 = await evaluate({
    projectId: 'lanton',
    mode: 'live_monitor',
    customerMessage: '随便说点什么无关的',  // 低置信度
    userReply: '您好'
  });

  // 错误状态也应该有基本字段
  const errorFieldChecks = {
    projectId: result2.projectId !== undefined,
    mode: result2.mode !== undefined,
    status: result2.status !== undefined,
    score: result2.score !== undefined,  // 错误时为 null
    findings: result2.findings !== undefined
  };

  const missingErrorFields = Object.keys(errorFieldChecks).filter(k => !errorFieldChecks[k]);
  
  if (missingErrorFields.length === 0) {
    console.log('  ✓ 通过 - 错误响应字段完整');
    passed++;
  } else {
    console.log('  ✗ 失败 - 缺少字段:', missingErrorFields.join(', '));
    failed++;
  }

  console.log(`\n  错误响应状态: ${result2.status}`);
  console.log(`  错误信息: ${result2.findings?.[0]?.message}`);

  console.log('\n测试3: 字段类型检查...');
  const typeChecks = [
    { field: 'score', type: 'number', value: result1.score },
    { field: 'matchConfidence', type: 'number', value: result1.matchConfidence },
    { field: 'status', type: 'string', value: result1.status },
    { field: 'alerts', type: 'array', value: result1.alerts },
    { field: 'dimensionScores', type: 'object', value: result1.dimensionScores }
  ];

  let typeCheckPass = true;
  for (const check of typeChecks) {
    const actualType = Array.isArray(check.value) ? 'array' : typeof check.value;
    if (actualType !== check.type) {
      console.log(`  ✗ ${check.field} 类型错误: 期望 ${check.type}, 实际 ${actualType}`);
      typeCheckPass = false;
    }
  }

  if (typeCheckPass) {
    console.log('  ✓ 通过 - 字段类型正确');
    passed++;
  } else {
    failed++;
  }

  console.log('\n测试4: dimensionScores 结构...');
  const ds = result1.dimensionScores || {};
  const dsFields = ['attitude', 'process', 'information', 'empathy', 'clarity'];
  const dsComplete = dsFields.every(f => typeof ds[f] === 'number');
  
  if (dsComplete) {
    console.log('  ✓ 通过 - 维度得分结构完整');
    console.log(`    attitude: ${ds.attitude}, process: ${ds.process}, information: ${ds.information}`);
    passed++;
  } else {
    console.log('  ✗ 失败 - 维度得分结构不完整');
    failed++;
  }

  console.log('\n测试5: alerts 结构...');
  if (result1.alerts && result1.alerts.length > 0) {
    const alert = result1.alerts[0];
    const alertFields = ['level', 'type', 'message'];
    const alertComplete = alertFields.every(f => alert[f] !== undefined);
    
    if (alertComplete) {
      console.log('  ✓ 通过 - 告警结构完整');
      console.log(`    level: ${alert.level}, type: ${alert.type}`);
      passed++;
    } else {
      console.log('  ✗ 失败 - 告警结构不完整');
      failed++;
    }
  } else {
    console.log('  ⚠ 跳过 - 无告警数据');
    passed++; // 无告警也算正常
  }

  console.log('\n=== 测试结果 ===');
  console.log(`通过: ${passed}`);
  console.log(`失败: ${failed}`);
  
  if (failed > 0) {
    console.log('\n⚠️ 持久化字段存在问题！');
  } else {
    console.log('\n✅ 持久化字段验证通过');
    console.log('\n建议的数据库表结构:');
    console.log('  - projectId: VARCHAR(50)');
    console.log('  - mode: VARCHAR(20)');
    console.log('  - sessionId: VARCHAR(100)');
    console.log('  - scenarioId: VARCHAR(100)');
    console.log('  - customerMessage: TEXT');
    console.log('  - userReply: TEXT');
    console.log('  - matchedScenarioId: VARCHAR(100)');
    console.log('  - matchConfidence: FLOAT');
    console.log('  - score: INT');
    console.log('  - dimensionScores: JSON');
    console.log('  - findings: JSON');
    console.log('  - alerts: JSON');
    console.log('  - status: VARCHAR(50)');
    console.log('  - createdAt: TIMESTAMP');
  }
  
  return failed === 0;
}

runTests().then(success => {
  process.exit(success ? 0 : 1);
});
