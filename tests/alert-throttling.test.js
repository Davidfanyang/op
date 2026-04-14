/**
 * 告警限流测试
 * 验证：同一会话去重、员工限流、场景匹配失败不告警
 */

const { AlertThrottler } = require('../core/alert-throttler');

async function runTests() {
  console.log('=== 告警限流测试 ===\n');
  let passed = 0;
  let failed = 0;

  // 测试1: 场景匹配失败不触发告警
  console.log('测试1: 场景匹配失败不触发告警...');
  const throttler1 = new AlertThrottler();
  const result1 = throttler1.shouldSendAlert(
    { type: 'scenario_match_failed', level: 'critical', message: '匹配失败' },
    { sessionId: 'sess_1', employeeId: 'emp_1' }
  );
  if (!result1.shouldSend && result1.throttled) {
    console.log('  ✓ 通过 - 场景匹配失败被正确拦截');
    passed++;
  } else {
    console.log('  ✗ 失败 - 应该拦截场景匹配失败告警');
    failed++;
  }

  // 测试2: 同一会话相同类型告警去重
  console.log('\n测试2: 同一会话相同类型告警去重...');
  const throttler2 = new AlertThrottler({ sessionDedupWindow: 5000 }); // 5秒窗口
  
  // 第一次告警
  const r2a = throttler2.shouldSendAlert(
    { type: 'low_score', level: 'critical', message: '评分低' },
    { sessionId: 'sess_2', employeeId: 'emp_2' }
  );
  
  // 第二次相同告警（应该被限流）
  const r2b = throttler2.shouldSendAlert(
    { type: 'low_score', level: 'critical', message: '评分低' },
    { sessionId: 'sess_2', employeeId: 'emp_2' }
  );
  
  if (r2a.shouldSend && !r2b.shouldSend && r2b.throttled) {
    console.log('  ✓ 通过 - 同一会话重复告警被限流');
    passed++;
  } else {
    console.log('  ✗ 失败 - 第一次:', r2a.shouldSend, '第二次:', r2b.shouldSend);
    failed++;
  }

  // 测试3: 同一会话不同类型告警可以通过
  console.log('\n测试3: 同一会话不同类型告警可以通过...');
  const throttler3 = new AlertThrottler({ sessionDedupWindow: 5000 });
  
  const r3a = throttler3.shouldSendAlert(
    { type: 'low_score', level: 'critical', message: '评分低' },
    { sessionId: 'sess_3', employeeId: 'emp_3' }
  );
  
  const r3b = throttler3.shouldSendAlert(
    { type: 'poor_attitude', level: 'critical', message: '态度差' },
    { sessionId: 'sess_3', employeeId: 'emp_3' }
  );
  
  if (r3a.shouldSend && r3b.shouldSend) {
    console.log('  ✓ 通过 - 不同类型告警正常通过');
    passed++;
  } else {
    console.log('  ✗ 失败 - 不同类型应该都能通过');
    failed++;
  }

  // 测试4: 员工 critical 告警限流
  console.log('\n测试4: 员工 critical 告警限流...');
  const throttler4 = new AlertThrottler({ 
    employeeRateWindow: 5000,
    employeeCriticalLimit: 2 
  });
  
  // 发送3条 critical 告警
  const r4a = throttler4.shouldSendAlert(
    { type: 'low_score', level: 'critical', message: '1' },
    { sessionId: 'sess_4a', employeeId: 'emp_4' }
  );
  const r4b = throttler4.shouldSendAlert(
    { type: 'low_score', level: 'critical', message: '2' },
    { sessionId: 'sess_4b', employeeId: 'emp_4' }
  );
  const r4c = throttler4.shouldSendAlert(
    { type: 'low_score', level: 'critical', message: '3' },
    { sessionId: 'sess_4c', employeeId: 'emp_4' }
  );
  
  if (r4a.shouldSend && r4b.shouldSend && !r4c.shouldSend && r4c.throttled) {
    console.log('  ✓ 通过 - 第3条 critical 被限流');
    passed++;
  } else {
    console.log('  ✗ 失败 - 1:', r4a.shouldSend, '2:', r4b.shouldSend, '3:', r4c.shouldSend);
    failed++;
  }

  // 测试5: warning 级别不计入员工限流
  console.log('\n测试5: warning 级别不计入员工限流...');
  const throttler5 = new AlertThrottler({ 
    employeeRateWindow: 5000,
    employeeCriticalLimit: 1 
  });
  
  // 先发一条 warning
  const r5a = throttler5.shouldSendAlert(
    { type: 'medium_score', level: 'warning', message: '一般' },
    { sessionId: 'sess_5a', employeeId: 'emp_5' }
  );
  // 再发一条 critical
  const r5b = throttler5.shouldSendAlert(
    { type: 'low_score', level: 'critical', message: '严重' },
    { sessionId: 'sess_5b', employeeId: 'emp_5' }
  );
  
  if (r5a.shouldSend && r5b.shouldSend) {
    console.log('  ✓ 通过 - warning 不计入限流');
    passed++;
  } else {
    console.log('  ✗ 失败 - warning 应该不影响 critical 限流');
    failed++;
  }

  // 测试6: 不同员工互不影响
  console.log('\n测试6: 不同员工互不影响...');
  const throttler6 = new AlertThrottler({ 
    employeeRateWindow: 5000,
    employeeCriticalLimit: 1 
  });
  
  const r6a = throttler6.shouldSendAlert(
    { type: 'low_score', level: 'critical', message: '员工A' },
    { sessionId: 'sess_6a', employeeId: 'emp_A' }
  );
  const r6b = throttler6.shouldSendAlert(
    { type: 'low_score', level: 'critical', message: '员工B' },
    { sessionId: 'sess_6b', employeeId: 'emp_B' }
  );
  
  if (r6a.shouldSend && r6b.shouldSend) {
    console.log('  ✓ 通过 - 不同员工独立限流');
    passed++;
  } else {
    console.log('  ✗ 失败 - 不同员工应该互不影响');
    failed++;
  }

  // 测试7: 统计信息
  console.log('\n测试7: 统计信息...');
  const throttler7 = new AlertThrottler();
  throttler7.shouldSendAlert(
    { type: 'low_score', level: 'critical', message: '测试' },
    { sessionId: 'sess_7', employeeId: 'emp_7' }
  );
  const stats = throttler7.getStats();
  if (stats.sessionAlertCount > 0 && stats.employeeAlertCount > 0) {
    console.log('  ✓ 通过 - 统计信息正确');
    passed++;
  } else {
    console.log('  ✗ 失败 - 统计信息异常');
    failed++;
  }

  console.log('\n=== 测试结果 ===');
  console.log(`通过: ${passed}`);
  console.log(`失败: ${failed}`);
  
  if (failed > 0) {
    console.log('\n⚠️ 告警限流存在问题！');
  } else {
    console.log('\n✅ 告警限流验证通过');
  }
  
  return failed === 0;
}

runTests().then(success => {
  process.exit(success ? 0 : 1);
});
