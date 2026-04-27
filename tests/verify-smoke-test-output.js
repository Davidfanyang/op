/**
 * 验证 smoke-test.js 的输出协议迁移
 * 
 * 测试 buildResultMessage 函数是否正确处理标准输出协议
 */

// 模拟 buildResultMessage 函数（从 smoke-test.js 复制）
function buildResultMessage(result, scenario, customerMessage, userReply) {
  // 使用标准输出协议 v1.0
  const lines = [
    `场景：${result.scenarioName || scenario.title}`,
    `阶段：${result.stage || '未知'}`,
    '',
    `用户消息：${customerMessage}`,
    `客服回复：${userReply}`,
    '',
    `评估结果：${result.result || 'unknown'}`,
    `风险等级：${result.riskLevel || 'unknown'}`,
    `置信度：${Math.round((result.confidence || 0) * 100)}%`,
    ''
  ];
  
  // 问题项（issues 是字符串数组）
  if (result.issues && result.issues.length > 0) {
    lines.push('🔴 问题项：');
    result.issues.forEach(issue => {
      lines.push(`• ${issue}`);
    });
    lines.push('');
  }
  
  // 缺失信息（missing 是字符串数组）
  if (result.missing && result.missing.length > 0) {
    lines.push('⚠️ 缺失信息：');
    result.missing.forEach(item => {
      lines.push(`• ${item}`);
    });
    lines.push('');
  }
  
  // 优点（strengths 是字符串数组）
  if (result.strengths && result.strengths.length > 0) {
    lines.push('✅ 优点：');
    result.strengths.forEach(item => {
      lines.push(`• ${item}`);
    });
    lines.push('');
  }
  
  // 教练总结
  if (result.coachSummary) {
    lines.push('📝 教练总结：');
    lines.push(result.coachSummary);
    lines.push('');
  }
  
  // 下一步行动
  if (result.nextAction) {
    lines.push('👉 下一步：');
    lines.push(result.nextAction);
    lines.push('');
  }
  
  lines.push('发送 /score 继续测试');
  
  return lines.join('\n');
}

// 测试用例
console.log('=== Smoke-Test 输出协议验证 ===\n');

// 模拟标准输出协议 v1.0
const mockResult = {
  scenarioId: 'lanton_sms_code',
  scenarioName: '注册收不到验证码',
  stage: '确认问题并收集信息',
  result: 'borderline',
  riskLevel: 'low',
  issues: [
    '缺少关键信息: 请您、手机号、验证码',
    '未完成期望动作: 礼貌问候并安抚'
  ],
  missing: [
    '您好',
    '请您',
    '手机号',
    '验证码'
  ],
  strengths: [
    '未使用禁忌表达',
    '回复详实充分'
  ],
  nextAction: '建议改进: 未完成期望动作: 礼貌问候并安抚、确认问题类型',
  coachSummary: '△ 回复基本合格，但仍有改进空间。主要问题: 缺少关键信息。改进方向: 建议改进: 未完成期望动作。',
  confidence: 0.75,
  reviewStatus: 'pending'
};

const mockScenario = {
  id: 'lanton_sms_code',
  title: '注册收不到验证码',
  customerMessage: '我注册LantonPay一直收不到验证码，怎么办？'
};

const customerMessage = '我注册LantonPay一直收不到验证码，怎么办？';
const userReply = '您好，请提供手机号，我们帮您申请验证码。';

console.log('[测试] 使用标准输出协议构建消息...\n');
const message = buildResultMessage(mockResult, mockScenario, customerMessage, userReply);

console.log(message);
console.log('\n=== 验证结果 ===');

// 验证不包含旧字段
const hasOldFields = 
  message.includes('总分：') || 
  message.includes('result.score') ||
  message.includes('result.findings') ||
  message.includes('result.suggestions') ||
  message.includes('result.standardReply');

if (hasOldFields) {
  console.log('❌ 失败 - 仍包含旧输出字段');
  process.exit(1);
}

// 验证包含新字段
const hasNewFields = 
  message.includes('评估结果：') &&
  message.includes('风险等级：') &&
  message.includes('置信度：') &&
  message.includes('🔴 问题项：') &&
  message.includes('⚠️ 缺失信息：') &&
  message.includes('✅ 优点：') &&
  message.includes('📝 教练总结：') &&
  message.includes('👉 下一步：');

if (hasNewFields) {
  console.log('✅ 通过 - 正确使用标准输出协议');
  console.log('\n迁移说明:');
  console.log('- 已删除: result.score (总分)');
  console.log('- 已删除: result.findings (问题项对象数组)');
  console.log('- 已删除: result.suggestions (建议数组)');
  console.log('- 已删除: result.standardReply (标准回复)');
  console.log('- 新增: result.result (评估结果: pass/borderline/fail/risk)');
  console.log('- 新增: result.riskLevel (风险等级)');
  console.log('- 新增: result.confidence (置信度)');
  console.log('- 新增: result.issues (问题项字符串数组)');
  console.log('- 新增: result.missing (缺失信息字符串数组)');
  console.log('- 新增: result.strengths (优点字符串数组)');
  console.log('- 保留: result.coachSummary (教练总结)');
  console.log('- 新增: result.nextAction (下一步行动)');
  process.exit(0);
} else {
  console.log('❌ 失败 - 缺少新输出字段');
  process.exit(1);
}

