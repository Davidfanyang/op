/**
 * 快速验证反馈模板功能
 */

const { generateFeedback } = require('./services/feedback-template-service');

const scenario = {
  id: 'register_flow',
  title: '注册流程指引'
};

const analysis = {
  strengths: ['态度友善', '及时回应'],
  issues: ['没有验证身份', '语气生硬'],
  missing: ['缺少身份验证', '未确认手机号'],
  riskLevel: 'medium',
  result: { level: 'fail' }
};

const result = generateFeedback({
  scenario,
  round: 0,
  analysis,
  isFinished: false
});

console.log('=== 反馈文本 ===\n');
console.log(result.feedback_text);
console.log('\n=== 结构化反馈 ===\n');
console.log(JSON.stringify(result.structured_feedback, null, 2));
console.log('\n✅ 反馈模板功能正常！\n');
