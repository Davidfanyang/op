/**
 * Feedback 反馈构建测试
 * 验证：输出结构、字段完整性、边界值处理
 */

const { buildDiagnosticFeedback } = require('../core/feedback');

// 模拟场景
const mockScenario = {
  id: 'test_scenario',
  title: '测试场景',
  standardReply: '标准回复话术'
};

async function runTests() {
  console.log('=== Feedback 反馈构建测试 ===\n');
  let passed = 0;
  let failed = 0;

  // 测试1: 正常结果 (pass)
  console.log('测试1: pass 等级结果...');
  const result1 = buildDiagnosticFeedback({
    result: {
      level: 'pass',
      issues: [],
      missing: [],
      strengths: ['表达清晰', '流程完整'],
      nextAction: '可以发送'
    },
    coachSummary: '回复质量优秀',
    riskLevel: 'none',
    confidence: 0.9,
    stage: {
      id: 'greeting',
      name: '问候阶段',
      description: '初步接触客户'
    }
  }, mockScenario);
  
  if (result1.result.level === 'pass' && 
      result1.coachSummary && 
      result1.meta &&
      result1.riskLevel === 'none') {
    console.log('  ✓ 通过 - 结构完整');
    passed++;
  } else {
    console.log('  ✗ 失败 - 结构不完整');
    failed++;
  }

  // 测试2: borderline 等级
  console.log('\n测试2: borderline 等级...');
  const result2 = buildDiagnosticFeedback({
    result: {
      level: 'borderline',
      issues: [{ message: '缺少安抚表达', severity: 'medium' }],
      missing: ['风险提示'],
      strengths: [],
      nextAction: '建议补充缺失内容'
    },
    coachSummary: '回复基本合格',
    riskLevel: 'low',
    confidence: 0.7,
    stage: {
      id: 'solution',
      name: '解决方案阶段',
      description: '提供解决方案'
    }
  }, mockScenario);
  
  if (result2.result.level === 'borderline' && 
      result2.result.missing.length > 0 &&
      result2.result.missing[0].explanation) {
    console.log('  ✓ 通过 - borderline 反馈正确');
    passed++;
  } else {
    console.log('  ✗ 失败 - 反馈内容不完整');
    failed++;
  }

  // 测试3: fail 等级
  console.log('\n测试3: fail 等级...');
  const result3 = buildDiagnosticFeedback({
    result: {
      level: 'fail',
      issues: [
        { message: '未验证身份', severity: 'high' },
        { message: '流程错误', severity: 'medium' }
      ],
      missing: ['身份验证', '问题确认'],
      strengths: [],
      nextAction: '需要改进'
    },
    coachSummary: '回复存在不足',
    riskLevel: 'medium',
    confidence: 0.8
  }, mockScenario);
  
  if (result3.result.level === 'fail' && 
      result3.result.issues.length === 2 &&
      result3.result.issues[0].explanation) {
    console.log('  ✓ 通过 - fail 反馈正确');
    passed++;
  } else {
    console.log('  ✗ 失败 - 反馈内容:', result3.coachSummary);
    failed++;
  }

  // 测试4: risk 等级
  console.log('\n测试4: risk 等级...');
  const result4 = buildDiagnosticFeedback({
    result: {
      level: 'risk',
      issues: [
        { message: '包含风险关键词', severity: 'critical' }
      ],
      missing: [],
      strengths: [],
      nextAction: '不建议发送'
    },
    coachSummary: '回复存在风险',
    riskLevel: 'high',
    confidence: 0.95
  }, mockScenario);
  
  if (result4.result.level === 'risk' && 
      result4.riskLevel === 'high' &&
      result4.result.issues[0].severity === 'critical') {
    console.log('  ✓ 通过 - risk 反馈正确');
    passed++;
  } else {
    console.log('  ✗ 失败 - 反馈内容:', result4.coachSummary);
    failed++;
  }

  // 测试5: 空结果
  console.log('\n测试5: 空结果...');
  const result5 = buildDiagnosticFeedback({}, mockScenario);
  
  if (result5.result.level === 'fail' && 
      result5.result.issues && 
      Array.isArray(result5.result.issues) &&
      result5.scenario.id === 'test_scenario') {
    console.log('  ✓ 通过 - 空结果处理正确');
    passed++;
  } else {
    console.log('  ✗ 失败 - 空结果处理异常');
    failed++;
  }

  // 测试6: 输出字段完整性
  console.log('\n测试6: 输出字段完整性...');
  const result6 = buildDiagnosticFeedback({
    result: {
      level: 'pass',
      issues: [],
      missing: [],
      strengths: ['表达清晰']
    },
    stage: {
      id: 'greeting',
      name: '问候阶段'
    }
  }, mockScenario);
  
  const requiredFields = [
    'scenario', 'stage', 'result', 'coachSummary', 
    'riskLevel', 'confidence', 'meta'
  ];
  const missingFields = requiredFields.filter(f => result6[f] === undefined);
  
  if (missingFields.length === 0) {
    console.log('  ✓ 通过 - 所有字段存在');
    passed++;
  } else {
    console.log('  ✗ 失败 - 缺少字段:', missingFields.join(', '));
    failed++;
  }

  // 测试7: result 子字段完整性
  console.log('\n测试7: result 子字段完整性...');
  const resultFields = ['level', 'issues', 'missing', 'strengths', 'nextAction'];
  const missingResultFields = resultFields.filter(f => result6.result[f] === undefined);
  
  if (missingResultFields.length === 0) {
    console.log('  ✓ 通过 - result 字段完整');
    passed++;
  } else {
    console.log('  ✗ 失败 - result 缺少字段:', missingResultFields.join(', '));
    failed++;
  }

  // 测试8: meta字段
  console.log('\n测试8: meta字段...');
  if (result6.meta.analyzerVersion && result6.meta.mode && result6.meta.timestamp) {
    console.log('  ✓ 通过 - meta字段完整');
    passed++;
  } else {
    console.log('  ✗ 失败 - meta字段不完整');
    failed++;
  }

  // 测试9: 问题解释增强
  console.log('\n测试9: 问题解释增强...');
  const result9 = buildDiagnosticFeedback({
    result: {
      level: 'fail',
      issues: [
        { message: '未验证身份', severity: 'high' }
      ],
      missing: [],
      strengths: []
    }
  }, mockScenario);
  
  if (result9.result.issues[0].explanation && 
      result9.result.issues[0].explanation.includes('重要问题')) {
    console.log('  ✓ 通过 - 问题解释已增强');
    passed++;
  } else {
    console.log('  ✗ 失败 - 问题解释缺失');
    failed++;
  }

  // 测试10: 缺失项解释增强
  console.log('\n测试10: 缺失项解释增强...');
  const result10 = buildDiagnosticFeedback({
    result: {
      level: 'borderline',
      issues: [],
      missing: ['身份验证'],
      strengths: []
    },
    stage: {
      name: '问题确认阶段'
    }
  }, mockScenario);
  
  if (result10.result.missing[0].explanation && 
      result10.result.missing[0].suggestion) {
    console.log('  ✓ 通过 - 缺失项解释已增强');
    passed++;
  } else {
    console.log('  ✗ 失败 - 缺失项解释缺失');
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
