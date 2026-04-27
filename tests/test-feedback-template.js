/**
 * 训练反馈模板测试
 * 
 * 测试目标：
 * 1. 验证 feedback-template-service 能正确生成反馈
 * 2. 验证 feedback_text 是人话，不是 JSON 或技术日志
 * 3. 验证 structured_feedback 包含所有必要字段
 * 4. 验证建议是可执行的，不是重复问题
 */

const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const { generateFeedback } = require('../services/feedback-template-service');
const { getScenarioById } = require('../core/scenario-loader');

console.log('=== 训练反馈模板测试 ===\n');

// 测试用例 1: 正常的分析结果（有问题、缺失、优点）
function testNormalFeedback() {
  console.log('[测试 1] 正常分析结果 - 包含问题、缺失、优点\n');
  
  const scenario = getScenarioById('register_flow') || {
    id: 'register_flow',
    title: '账户注册流程'
  };
  
  const analysis = {
    strengths: [
      '态度友善，使用了礼貌用语',
      '及时回应了客户的问题'
    ],
    issues: [
      '没有验证客户身份',
      '回复语气过于生硬'
    ],
    missing: [
      '缺少身份验证步骤',
      '没有确认手机号码'
    ],
    riskLevel: 'medium',
    result: {
      level: 'fail'
    }
  };
  
  const result = generateFeedback({
    scenario,
    round: 0,
    analysis,
    isFinished: false
  });
  
  console.log('--- feedback_text ---');
  console.log(result.feedback_text);
  console.log('\n--- structured_feedback ---');
  console.log(JSON.stringify(result.structured_feedback, null, 2));
  console.log('\n');
  
  // 验证
  const checks = [
    {
      name: 'feedback_text 包含场景',
      pass: result.feedback_text.includes('注册流程指引')
    },
    {
      name: 'feedback_text 包含轮次',
      pass: result.feedback_text.includes('第 1 轮')
    },
    {
      name: 'feedback_text 包含优点',
      pass: result.feedback_text.includes('态度友善')
    },
    {
      name: 'feedback_text 包含问题',
      pass: result.feedback_text.includes('身份')
    },
    {
      name: 'feedback_text 包含缺失项',
      pass: result.feedback_text.includes('手机号码')
    },
    {
      name: 'feedback_text 包含建议',
      pass: result.feedback_text.includes('建议') || result.feedback_text.includes('注意')
    },
    {
      name: 'feedback_text 包含训练状态',
      pass: result.feedback_text.includes('继续训练')
    },
    {
      name: 'structured_feedback 包含所有字段',
      pass: result.structured_feedback.scenario_id && 
            result.structured_feedback.scenario_title && 
            result.structured_feedback.round &&
            result.structured_feedback.strengths &&
            result.structured_feedback.problems &&
            result.structured_feedback.missing &&
            result.structured_feedback.suggestions &&
            result.structured_feedback.is_finished !== undefined &&
            result.structured_feedback.status &&
            result.structured_feedback.generated_at
    },
    {
      name: '建议是可执行的（不是简单重复问题）',
      pass: result.structured_feedback.suggestions.some(s => 
        s.includes('注意') || s.includes('请') || s.includes('确保') || s.includes('补充')
      )
    }
  ];
  
  printTestResults('测试 1', checks);
  return checks.every(c => c.pass);
}

// 测试用例 2: 优秀表现（没有问题）
function testExcellentFeedback() {
  console.log('[测试 2] 优秀表现 - 没有问题和缺失\n');
  
  const scenario = getScenarioById('register_flow') || {
    id: 'register_flow',
    title: '账户注册流程'
  };
  
  const analysis = {
    strengths: [
      '完美执行了所有步骤',
      '态度专业，语气友善',
      '信息完整准确'
    ],
    issues: [],
    missing: [],
    riskLevel: 'none',
    result: {
      level: 'pass'
    }
  };
  
  const result = generateFeedback({
    scenario,
    round: 2,
    analysis,
    isFinished: true
  });
  
  console.log('--- feedback_text ---');
  console.log(result.feedback_text);
  console.log('\n');
  
  // 验证
  const checks = [
    {
      name: 'feedback_text 包含轮次',
      pass: result.feedback_text.includes('第 3 轮')
    },
    {
      name: 'feedback_text 显示训练结束',
      pass: result.feedback_text.includes('本轮结束')
    },
    {
      name: 'feedback_text 包含优点',
      pass: result.feedback_text.includes('完美执行')
    },
    {
      name: '没有问题时显示鼓励',
      pass: result.feedback_text.includes('没有发现明显问题') || result.feedback_text.includes('做得很好')
    },
    {
      name: '没有缺失时显示鼓励',
      pass: result.feedback_text.includes('没有遗漏') || result.feedback_text.includes('继续保持')
    },
    {
      name: '建议是正面的',
      pass: result.structured_feedback.suggestions.some(s => 
        s.includes('保持') || s.includes('继续')
      )
    }
  ];
  
  printTestResults('测试 2', checks);
  return checks.every(c => c.pass);
}

// 测试用例 3: 边界情况（空分析结果）
function testEmptyAnalysis() {
  console.log('[测试 3] 边界情况 - 空分析结果\n');
  
  const scenario = {
    id: 'test_scenario',
    title: '测试场景'
  };
  
  const analysis = {
    strengths: [],
    issues: [],
    missing: [],
    riskLevel: 'none',
    result: {
      level: 'pass'
    }
  };
  
  const result = generateFeedback({
    scenario,
    round: 0,
    analysis,
    isFinished: false
  });
  
  console.log('--- feedback_text ---');
  console.log(result.feedback_text);
  console.log('\n');
  
  // 验证
  const checks = [
    {
      name: 'feedback_text 正常生成',
      pass: result.feedback_text && result.feedback_text.length > 0
    },
    {
      name: '包含场景信息',
      pass: result.feedback_text.includes('测试场景')
    },
    {
      name: '包含轮次',
      pass: result.feedback_text.includes('第 1 轮')
    },
    {
      name: '包含训练状态',
      pass: result.feedback_text.includes('继续训练')
    },
    {
      name: 'structured_feedback 正常生成',
      pass: result.structured_feedback && 
            result.structured_feedback.scenario_id === 'test_scenario' &&
            result.structured_feedback.round === 1
    }
  ];
  
  printTestResults('测试 3', checks);
  return checks.every(c => c.pass);
}

// 测试用例 4: 分析结果字段是对象数组
function testObjectArrays() {
  console.log('[测试 4] 分析结果字段是对象数组\n');
  
  const scenario = {
    id: 'test_scenario',
    title: '测试场景'
  };
  
  const analysis = {
    strengths: [
      { text: '态度友善', score: 0.9 },
      { message: '及时回应', score: 0.8 }
    ],
    issues: [
      { message: '没有验证身份', severity: 'high' },
      { text: '语气生硬', severity: 'medium' }
    ],
    missing: [
      { message: '缺少身份验证', type: 'required' },
      { text: '未确认手机号', type: 'optional' }
    ],
    riskLevel: 'high',
    result: {
      level: 'risk'
    }
  };
  
  const result = generateFeedback({
    scenario,
    round: 1,
    analysis,
    isFinished: false
  });
  
  console.log('--- feedback_text ---');
  console.log(result.feedback_text);
  console.log('\n');
  
  // 验证
  const checks = [
    {
      name: '正确提取对象数组中的 strengths',
      pass: result.structured_feedback.strengths.includes('态度友善') &&
            result.structured_feedback.strengths.includes('及时回应')
    },
    {
      name: '正确提取对象数组中的 problems',
      pass: result.structured_feedback.problems.includes('没有验证身份') &&
            result.structured_feedback.problems.includes('语气生硬')
    },
    {
      name: '正确提取对象数组中的 missing',
      pass: result.structured_feedback.missing.includes('缺少身份验证') &&
            result.structured_feedback.missing.includes('未确认手机号')
    },
    {
      name: 'feedback_text 包含提取的内容',
      pass: result.feedback_text.includes('态度友善') &&
            result.feedback_text.includes('没有验证身份') &&
            result.feedback_text.includes('缺少身份验证')
    }
  ];
  
  printTestResults('测试 4', checks);
  return checks.every(c => c.pass);
}

// 打印测试结果
function printTestResults(testName, checks) {
  console.log(`${'='.repeat(60)}`);
  console.log(`[结果] ${testName}`);
  console.log(`${'='.repeat(60)}`);
  
  let passCount = 0;
  checks.forEach(check => {
    const status = check.pass ? '✅' : '❌';
    console.log(`${status} ${check.name}`);
    if (check.pass) passCount++;
  });
  
  console.log(`\n总计: ${passCount}/${checks.length} 通过\n`);
}

// 运行所有测试
async function runAllTests() {
  const results = [];
  
  results.push(testNormalFeedback());
  results.push(testExcellentFeedback());
  results.push(testEmptyAnalysis());
  results.push(testObjectArrays());
  
  console.log(`${'='.repeat(60)}`);
  console.log('[总结] 所有测试');
  console.log(`${'='.repeat(60)}`);
  
  const passCount = results.filter(r => r).length;
  console.log(`\n总计: ${passCount}/${results.length} 测试通过\n`);
  
  if (passCount === results.length) {
    console.log('🎉 所有测试通过！反馈模板服务正常工作。\n');
    process.exit(0);
  } else {
    console.log('❌ 部分测试失败，请检查实现。\n');
    process.exit(1);
  }
}

// 执行测试
runAllTests().catch(error => {
  console.error('测试执行失败:', error);
  process.exit(1);
});
