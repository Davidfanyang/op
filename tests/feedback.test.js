/**
 * Feedback 反馈构建测试
 * 验证：输出结构、字段完整性、边界值处理
 */

const { buildFeedback } = require('../core/feedback');

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

  // 测试1: 正常结果
  console.log('测试1: 正常结果...');
  const result1 = buildFeedback({
    score: 85,
    dimensionScores: {
      attitude: 90,
      process: 80,
      information: 85,
      empathy: 85,
      clarity: 85
    },
    findings: [{ code: 'GOOD', message: '表现良好' }],
    suggestions: ['继续保持'],
    _source: 'local-model'
  }, mockScenario);
  
  if (result1.score === 85 && result1.coachSummary && result1.meta) {
    console.log('  ✓ 通过 - 结构完整');
    passed++;
  } else {
    console.log('  ✗ 失败 - 结构不完整');
    failed++;
  }

  // 测试2: 高分结果
  console.log('\n测试2: 高分结果 (95分)...');
  const result2 = buildFeedback({
    score: 95,
    dimensionScores: { attitude: 95, process: 95, information: 95, empathy: 95, clarity: 95 },
    _source: 'local-model'
  }, mockScenario);
  
  if (result2.score === 95 && result2.coachSummary.includes('优秀')) {
    console.log('  ✓ 通过 - 高分反馈正确');
    passed++;
  } else {
    console.log('  ✗ 失败 - 反馈内容:', result2.coachSummary);
    failed++;
  }

  // 测试3: 低分结果
  console.log('\n测试3: 低分结果 (30分)...');
  const result3 = buildFeedback({
    score: 30,
    dimensionScores: { attitude: 30, process: 30, information: 30, empathy: 30, clarity: 30 },
    _source: 'local-model'
  }, mockScenario);
  
  if (result3.score === 30 && result3.coachSummary.includes('不适合')) {
    console.log('  ✓ 通过 - 低分反馈正确');
    passed++;
  } else {
    console.log('  ✗ 失败 - 反馈内容:', result3.coachSummary);
    failed++;
  }

  // 测试4: 空结果
  console.log('\n测试4: 空结果...');
  const result4 = buildFeedback({}, mockScenario);
  
  if (result4.score === 0 && result4.dimensionScores) {
    console.log('  ✓ 通过 - 空结果处理正确');
    passed++;
  } else {
    console.log('  ✗ 失败 - 空结果处理异常');
    failed++;
  }

  // 测试5: 输出字段完整性
  console.log('\n测试5: 输出字段完整性...');
  const result5 = buildFeedback({
    score: 75,
    dimensionScores: { attitude: 75, process: 75, information: 75, empathy: 75, clarity: 75 },
    _source: 'local-model'
  }, mockScenario);
  
  const requiredFields = ['score', 'maxScore', 'coachSummary', 'dimensionScores', 'strengths', 'findings', 'suggestions', 'standardReply', 'scenario', 'meta'];
  const missing = requiredFields.filter(f => result5[f] === undefined);
  
  if (missing.length === 0) {
    console.log('  ✓ 通过 - 所有字段存在');
    passed++;
  } else {
    console.log('  ✗ 失败 - 缺少字段:', missing.join(', '));
    failed++;
  }

  // 测试6: meta字段
  console.log('\n测试6: meta字段...');
  if (result5.meta.evaluatorVersion && result5.meta.mode && result5.meta.source) {
    console.log('  ✓ 通过 - meta字段完整');
    passed++;
  } else {
    console.log('  ✗ 失败 - meta字段不完整');
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
