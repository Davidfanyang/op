/**
 * 误报控制测试套件 - 6类边界用例
 * 
 * 测试目标：验证 live_monitor 模式不会对这些合理回复产生误告警
 * 红线：没有误报控制测试结果前，不能把 live_monitor 结果直接当质检结论
 */

const { evaluate } = require('../services/evaluation-service');

// 测试场景配置
const TEST_SCENARIO = {
  id: 'lanton_sms_code',
  title: '注册收不到验证码',
  projectId: 'lanton'
};

// 6类边界测试用例
// 注意：本地模型评分较严格，正常回复通常在 20-80 分区间
const FALSE_POSITIVE_TEST_CASES = [
  // ========== 类别1: 礼貌但简短 ==========
  {
    id: 'FP-001',
    category: 'polite_but_short',
    name: '礼貌简短确认',
    customerMessage: '我收不到验证码，怎么办',
    userReply: '好的，我来帮您查看一下',
    acceptableScores: { min: 15, max: 50 }, // 本地模型对简短回复评分较低
    shouldAlert: false,
    reason: '礼貌回应并承诺处理，虽简短但合理'
  },
  {
    id: 'FP-002',
    category: 'polite_but_short',
    name: '简短安抚',
    customerMessage: '验证码一直没来',
    userReply: '请稍等，我帮您核实',
    acceptableScores: { min: 15, max: 50 },
    shouldAlert: false,
    reason: '标准安抚话术，不应判为敷衍'
  },
  {
    id: 'FP-003',
    category: 'polite_but_short',
    name: '感谢语',
    customerMessage: '谢谢',
    userReply: '不客气，有问题随时联系',
    acceptableScores: { min: 20, max: 60 },
    shouldAlert: false,
    reason: '正常结束语，不应触发告警'
  },

  // ========== 类别2: 正常追问信息 ==========
  {
    id: 'FP-004',
    category: 'normal_inquiry',
    name: '询问手机号',
    customerMessage: '我收不到验证码',
    userReply: '您好，请问您注册时使用的手机号是多少呢？',
    acceptableScores: { min: 40, max: 80 },
    shouldAlert: false,
    reason: '主动收集必要信息，标准流程'
  },
  {
    id: 'FP-005',
    category: 'normal_inquiry',
    name: '询问具体现象',
    customerMessage: '验证码有问题',
    userReply: '请问您是收不到验证码，还是收到了但无法通过验证呢？',
    acceptableScores: { min: 45, max: 80 },
    shouldAlert: false,
    reason: '精准定位问题，高质量追问'
  },
  {
    id: 'FP-006',
    category: 'normal_inquiry',
    name: '确认时间范围',
    customerMessage: '验证码没收到',
    userReply: '请问您是什么时候开始尝试获取验证码的呢？',
    acceptableScores: { min: 30, max: 70 },
    shouldAlert: false,
    reason: '收集时间信息，有助于排查'
  },

  // ========== 类别3: 标准模板回复 ==========
  {
    id: 'FP-007',
    category: 'standard_template',
    name: '完整标准回复',
    customerMessage: '收不到验证码',
    userReply: '您好，验证码发送后一般1-5分钟内到达。如果未收到，请检查：1. 手机信号是否正常 2. 是否被拦截到垃圾短信 3. 手机号是否输入正确。如仍有问题，请提供手机号我帮您查询。',
    acceptableScores: { min: 60, max: 90 },
    shouldAlert: false,
    reason: '完整标准回复，应得高分'
  },
  {
    id: 'FP-008',
    category: 'standard_template',
    name: '分步骤指引',
    customerMessage: '验证码收不到',
    userReply: '请您按以下步骤排查：\n1. 检查手机信号\n2. 查看垃圾短信箱\n3. 确认手机号无误\n4. 等待60秒后重试\n如仍有问题请联系我',
    acceptableScores: { min: 50, max: 85 },
    shouldAlert: false,
    reason: '结构清晰，步骤明确'
  },

  // ========== 类别4: 半完整回复 ==========
  {
    id: 'FP-009',
    category: 'semi_complete',
    name: '部分解决方案',
    customerMessage: '验证码没收到',
    userReply: '请您先检查一下垃圾短信箱，有时候验证码会被拦截。如果找到了请告诉我。',
    acceptableScores: { min: 35, max: 75 },
    shouldAlert: false,
    reason: '提供了部分解决方案，虽不完整但有用'
  },
  {
    id: 'FP-010',
    category: 'semi_complete',
    name: '等待用户反馈',
    customerMessage: '还是收不到',
    userReply: '我这边帮您刷新了一下，请您现在重新点击获取验证码试试？',
    acceptableScores: { min: 30, max: 70 },
    shouldAlert: false,
    reason: '已采取行动并引导用户验证'
  },

  // ========== 类别5: 明显敷衍/风险话术（应触发告警） ==========
  {
    id: 'FP-011',
    category: 'risky_response',
    name: '推诿责任',
    customerMessage: '验证码收不到',
    userReply: '这是运营商的问题，我们没办法',
    acceptableScores: { min: 0, max: 30 },
    shouldAlert: true,
    reason: '推诿责任，未提供任何帮助'
  },
  {
    id: 'FP-012',
    category: 'risky_response',
    name: '冷漠回应',
    customerMessage: '急用，验证码一直不来',
    userReply: '等着吧，会来的',
    acceptableScores: { min: 0, max: 25 },
    shouldAlert: true,
    reason: '态度冷漠，无实质帮助'
  },
  {
    id: 'FP-013',
    category: 'risky_response',
    name: '错误引导',
    customerMessage: '验证码收不到',
    userReply: '你用别人的手机试试',
    acceptableScores: { min: 0, max: 30 },
    shouldAlert: true,
    reason: '引导用户使用非本人手机，有安全风险'
  },

  // ========== 类别6: 低置信度错配边界输入 ==========
  {
    id: 'FP-014',
    category: 'low_confidence_match',
    name: '无关闲聊',
    customerMessage: '今天天气不错',
    userReply: '是的，适合出去走走',
    acceptableScores: { min: 0, max: 100 }, // 应返回低置信度匹配失败
    shouldAlert: false,
    expectedStatus: 'scenario_match_low_confidence',
    reason: '与业务场景无关，应触发低置信度匹配'
  },
  {
    id: 'FP-015',
    category: 'low_confidence_match',
    name: '模糊咨询',
    customerMessage: '你们这个怎么用',
    userReply: '请问您具体想了解哪方面的功能呢？',
    acceptableScores: { min: 0, max: 100 },
    shouldAlert: false,
    expectedStatus: 'scenario_match_low_confidence',
    reason: '问题过于宽泛，无法匹配具体场景'
  },
  {
    id: 'FP-016',
    category: 'low_confidence_match',
    name: '其他业务',
    customerMessage: '我要转账',
    userReply: '好的，请问您要转账到哪个账户？',
    acceptableScores: { min: 0, max: 100 },
    shouldAlert: false,
    // 可能匹配到其他场景或低置信度
    reason: '可能是其他业务场景'
  }
];

/**
 * 运行单条测试
 */
async function runTest(testCase) {
  const startTime = Date.now();
  
  try {
    const result = await evaluate({
      projectId: TEST_SCENARIO.projectId,
      mode: 'live_monitor',
      customerMessage: testCase.customerMessage,
      userReply: testCase.userReply,
      metadata: {
        sessionId: `test-${testCase.id}`,
        employeeId: 'test-employee',
        testCase: testCase.id
      }
    });

    const duration = Date.now() - startTime;
    
    // 分析结果
    const analysis = analyzeResult(result, testCase);
    
    return {
      ...testCase,
      result,
      duration,
      analysis,
      passed: analysis.passed
    };
  } catch (error) {
    return {
      ...testCase,
      error: error.message,
      duration: Date.now() - startTime,
      passed: false
    };
  }
}

/**
 * 分析测试结果
 */
function analyzeResult(result, testCase) {
  const issues = [];
  
  // 检查状态码
  if (testCase.expectedStatus) {
    if (result.status !== testCase.expectedStatus) {
      issues.push(`期望状态 ${testCase.expectedStatus}，实际 ${result.status}`);
    }
    return { passed: issues.length === 0, issues };
  }
  
  // 检查评分范围
  if (testCase.acceptableScores) {
    const score = result.score;
    if (score < testCase.acceptableScores.min || score > testCase.acceptableScores.max) {
      issues.push(`评分 ${score} 不在期望范围 [${testCase.acceptableScores.min}, ${testCase.acceptableScores.max}]`);
    }
  }
  
  // 检查告警
  const hasAlert = (result.alerts || []).length > 0;
  if (testCase.shouldAlert && !hasAlert) {
    issues.push('期望触发告警但未触发');
  }
  if (!testCase.shouldAlert && hasAlert) {
    const alertTypes = (result.alerts || []).map(a => a.type).join(', ');
    issues.push(`不应触发告警但触发了: ${alertTypes}`);
  }
  
  return { passed: issues.length === 0, issues };
}

/**
 * 运行全部测试
 */
async function runAllTests() {
  console.log('========================================');
  console.log('误报控制测试套件 - False Positive Control');
  console.log('========================================\n');
  
  const results = [];
  const categories = {};
  
  for (const testCase of FALSE_POSITIVE_TEST_CASES) {
    process.stdout.write(`测试 ${testCase.id}: ${testCase.name} ... `);
    const result = await runTest(testCase);
    results.push(result);
    
    // 按类别统计
    if (!categories[testCase.category]) {
      categories[testCase.category] = { total: 0, passed: 0 };
    }
    categories[testCase.category].total++;
    if (result.passed) categories[testCase.category].passed++;
    
    console.log(result.passed ? '✅ 通过' : '❌ 失败');
    if (!result.passed && result.analysis?.issues) {
      result.analysis.issues.forEach(issue => console.log(`   - ${issue}`));
    }
    if (result.error) {
      console.log(`   - 错误: ${result.error}`);
    }
  }
  
  // 输出统计
  console.log('\n========================================');
  console.log('测试结果统计');
  console.log('========================================');
  
  const total = results.length;
  const passed = results.filter(r => r.passed).length;
  const failed = total - passed;
  
  console.log(`\n总体: ${passed}/${total} 通过 (${((passed/total)*100).toFixed(1)}%)`);
  
  console.log('\n按类别统计:');
  Object.entries(categories).forEach(([cat, stats]) => {
    const catName = getCategoryName(cat);
    console.log(`  ${catName}: ${stats.passed}/${stats.total} 通过`);
  });
  
  // 误报率统计
  const falsePositives = results.filter(r => 
    !r.shouldAlert && r.result?.alerts?.length > 0
  ).length;
  const falseNegatives = results.filter(r => 
    r.shouldAlert && (!r.result?.alerts || r.result.alerts.length === 0)
  ).length;
  
  console.log('\n误报统计:');
  console.log(`  误报数 (不应告警但告警): ${falsePositives}`);
  console.log(`  漏报数 (应告警但未告警): ${falseNegatives}`);
  
  // 灰度建议
  console.log('\n========================================');
  console.log('灰度接入建议');
  console.log('========================================');
  
  if (falsePositives > 3) {
    console.log('⚠️  误报率较高，建议调整告警阈值后再灰度');
  } else if (falseNegatives > 1) {
    console.log('⚠️  漏报率较高，建议检查风险话术识别逻辑');
  } else {
    console.log('✅ 误报控制良好，可以进行灰度接入');
  }
  
  return {
    total,
    passed,
    failed,
    falsePositives,
    falseNegatives,
    categories,
    details: results
  };
}

function getCategoryName(cat) {
  const names = {
    polite_but_short: '礼貌但简短',
    normal_inquiry: '正常追问信息',
    standard_template: '标准模板回复',
    semi_complete: '半完整回复',
    risky_response: '明显敷衍/风险话术',
    low_confidence_match: '低置信度错配边界'
  };
  return names[cat] || cat;
}

// 如果直接运行此文件
if (require.main === module) {
  runAllTests().then(report => {
    // 保存详细报告
    const fs = require('fs');
    const reportPath = './runtime/logs/false-positive-report.json';
    fs.mkdirSync('./runtime/logs', { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n详细报告已保存: ${reportPath}`);
    
    process.exit(report.failed > 0 ? 1 : 0);
  });
}

module.exports = {
  FALSE_POSITIVE_TEST_CASES,
  runTest,
  runAllTests
};
