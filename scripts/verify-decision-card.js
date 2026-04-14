#!/usr/bin/env node
/**
 * 主管判读模板验收测试
 * 5条真实案例验证决策卡是否实用
 */

console.log('='.repeat(120));
console.log('📋 主管判读模板验收测试 (5条案例)');
console.log('='.repeat(120));
console.log();

const testCases = [
  // 案例1: Training - needs_training
  {
    mode: 'training',
    score: 22,
    findings: [
      { dimension: '服务态度', description: '客服回复"不知道",态度敷衍' }
    ],
    userReply: '不知道',
    expected: 'needs_training',
    description: 'Training低分+态度问题'
  },
  
  // 案例2: Training - passed (AI误判)
  {
    mode: 'training',
    score: 55,
    findings: [
      { dimension: '礼貌程度', description: '回复轻微简短,但无明显问题' }
    ],
    userReply: '好的,我帮您查一下,请稍等',
    expected: 'passed',
    description: 'Training中分+轻微话术(可接受)'
  },
  
  // 案例3: Training - needs_review (流程问题)
  {
    mode: 'training',
    score: 38,
    findings: [
      { dimension: '流程规范', description: '未按标准流程核实客户身份' },
      { dimension: '风险控制', description: '缺少关键信息确认步骤' }
    ],
    userReply: '您说下订单号我查下',
    expected: 'needs_review',
    description: 'Training中低分+流程缺陷'
  },
  
  // 案例4: Live Monitor - approved (确认告警)
  {
    mode: 'live_monitor',
    score: 15,
    alertLevel: 'critical',
    routing: 'supervisor_review',
    findings: [
      { dimension: '服务态度', description: '客服直接回复"不关我事",严重态度问题' }
    ],
    userReply: '不关我事,你找别人吧',
    customerMessage: '我的钱怎么还没到账?',
    expected: 'approved',
    description: 'Live Monitor critical+态度恶劣'
  },
  
  // 案例5: Live Monitor - rejected (AI误判)
  {
    mode: 'live_monitor',
    score: 42,
    alertLevel: 'warning',
    routing: 'supervisor_review',
    findings: [
      { dimension: '礼貌程度', description: '回复较短' }
    ],
    userReply: '收到,马上处理',
    customerMessage: '请尽快处理我的申请',
    expected: 'rejected',
    description: 'Live Monitor warning但客服实际没问题'
  }
];

let passCount = 0;

testCases.forEach((tc, index) => {
  console.log(`【案例 ${index + 1}】${tc.description}`);
  console.log('-'.repeat(120));
  console.log(`  模式:        ${tc.mode}`);
  console.log(`  分数:        ${tc.score}`);
  if (tc.alertLevel) console.log(`  告警级别:    ${tc.alertLevel}`);
  if (tc.routing) console.log(`  路由结果:    ${tc.routing}`);
  console.log(`  客服回复:    "${tc.userReply}"`);
  if (tc.customerMessage) console.log(`  客户消息:    "${tc.customerMessage}"`);
  console.log(`  问题发现:`);
  tc.findings.forEach(f => {
    console.log(`    - ${f.dimension}: ${f.description}`);
  });
  console.log();
  
  // 应用判读规则
  let decision;
  let reason;
  
  if (tc.mode === 'training') {
    // Training判读逻辑
    if (tc.score < 30) {
      if (tc.findings.some(f => f.dimension === '服务态度')) {
        decision = 'needs_training';
        reason = '分数<30+态度问题 → 需立即辅导';
      } else if (tc.findings.some(f => f.dimension.includes('流程') || f.dimension.includes('风险'))) {
        decision = 'needs_review';
        reason = '分数<30+流程问题 → 需复盘SOP';
      } else {
        decision = 'needs_training';
        reason = '分数<30 → 需专项训练';
      }
    } else if (tc.score < 50) {
      // 30-50分: 区分话术和流程
      if (tc.findings.some(f => f.dimension.includes('流程') || f.dimension.includes('风险'))) {
        decision = 'needs_review';
        reason = '分数30-50+流程问题 → 需复盘SOP';
      } else {
        decision = 'needs_training';
        reason = '分数30-50+话术问题 → 需改进训练';
      }
    } else {
      if (tc.findings.length === 1 && tc.findings[0].description?.includes('轻微')) {
        decision = 'passed';
        reason = '分数>50+轻微问题 → 可接受/误判';
      } else {
        decision = 'viewed';
        reason = '分数>50 → 记录备案';
      }
    }
  } else {
    // Live Monitor判读逻辑
    if (tc.routing === 'supervisor_review') {
      if (tc.score < 20 || tc.findings.some(f => f.dimension === '服务态度' && f.description?.includes('严重'))) {
        decision = 'approved';
        reason = 'critical告警+态度问题 → 确认有效';
      } else if (tc.findings.length === 1 && tc.findings[0].description?.includes('较短') && !tc.findings[0].description?.includes('严重')) {
        decision = 'rejected';
        reason = 'warning但客服回复正常 → AI误判';
      } else {
        decision = 'approved';
        reason = '告警有效 → 确认';
      }
    } else {
      decision = 'rejected';
      reason = '非主管流 → 不处理';
    }
  }
  
  const matched = decision === tc.expected ? '✅' : '❌';
  if (decision === tc.expected) passCount++;
  
  console.log(`  判读结果:    ${matched} ${decision}`);
  console.log(`  判读理由:    ${reason}`);
  console.log(`  预期结果:    ${tc.expected}`);
  console.log(`  匹配:        ${matched} ${decision === tc.expected ? '正确' : '错误'}`);
  console.log();
});

console.log('='.repeat(120));
console.log('📊 判读模板验证结果');
console.log('='.repeat(120));
console.log(`  总案例数:  ${testCases.length}`);
console.log(`  正确判读:  ${passCount}`);
console.log(`  错误判读:  ${testCases.length - passCount}`);
console.log(`  准确率:    ${((passCount / testCases.length) * 100).toFixed(1)}%`);
console.log();

if (passCount === testCases.length) {
  console.log('✅ 判读模板验证通过! 可以指导实际决策');
} else {
  console.log('⚠️  判读模板需要优化');
}
console.log();
