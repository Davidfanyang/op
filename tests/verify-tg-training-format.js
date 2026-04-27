/**
 * 验证 TG 训练链路输出格式化
 * 
 * 测试 formatResultMessage 函数是否正确处理标准输出协议 v1.0
 */

const path = require('path');
const { formatResultMessage } = require('../app/telegram/formatter');

console.log('=== TG 训练链路输出格式验证 ===\n');

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
  nextAction: '建议改进: 添加礼貌问候语，确认问题类型后再提供解决方案',
  coachSummary: '△ 回复基本合格，但仍有改进空间。主要问题: 缺少关键信息。改进方向: 建议添加礼貌问候和安抚表达。',
  confidence: 0.78,
  reviewStatus: 'pending'
};

const mockScenario = {
  id: 'lanton_sms_code',
  title: '注册收不到验证码',
  customerMessage: '我注册LantonPay一直收不到验证码，怎么办？'
};

const customerMessage = '我注册LantonPay一直收不到验证码，怎么办？';
const userReply = '您好，请提供手机号，我们帮您申请验证码。';

console.log('[测试] 使用标准输出协议格式化TG消息...\n');
const message = formatResultMessage(mockResult, mockScenario, customerMessage, userReply);

console.log(message);
console.log('\n=== 验证结果 ===');

// 验证不包含旧字段
const hasOldFields = 
  message.includes('result.findings') ||
  message.includes('result.suggestions') ||
  message.includes('result.standardReply') ||
  message.includes('result.result.level');

if (hasOldFields) {
  console.log('❌ 失败 - 仍包含旧输出字段');
  process.exit(1);
}

// 验证包含新字段
const hasNewFields = 
  message.includes('评估结果:') &&
  message.includes('风险等级:') &&
  message.includes('置信度:') &&
  message.includes('🔴 问题项:') &&
  message.includes('⚠️ 缺失关键词:') &&
  message.includes('✅ 优点:') &&
  message.includes('📝 评价:') &&
  message.includes('👉 改进建议:');

if (hasNewFields) {
  console.log('✅ 通过 - 正确使用标准输出协议 v1.0');
  console.log('\n迁移说明:');
  console.log('- 已删除: result.findings (旧问题项)');
  console.log('- 已删除: result.suggestions (旧建议)');
  console.log('- 已删除: result.standardReply (旧标准回复)');
  console.log('- 已删除: result.result.level (旧等级结构)');
  console.log('- 新增: result.result (评估等级字符串)');
  console.log('- 新增: result.riskLevel (风险等级)');
  console.log('- 新增: result.confidence (置信度)');
  console.log('- 新增: result.issues (问题项字符串数组)');
  console.log('- 新增: result.missing (缺失关键词数组)');
  console.log('- 新增: result.strengths (优点数组)');
  console.log('- 新增: result.nextAction (改进建议)');
  console.log('- 保留: result.coachSummary (教练评价)');
  console.log('- 保留: result.scenarioName (场景名称)');
  console.log('- 保留: result.stage (对话阶段)');
  process.exit(0);
} else {
  console.log('❌ 失败 - 缺少新输出字段');
  process.exit(1);
}

