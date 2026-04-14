/**
 * Live Monitor MySQL 全链路流程测试
 * 
 * 测试目标：
 * 1. 输入监听消息 → session/message/evaluation/review 全写库
 * 2. submitReview 提交复核
 * 3. 查详情与统计
 * 
 * 这是第4阶段核心验收测试
 * 
 * 运行前提：MySQL 数据库已配置，schema.sql 已执行
 */

const assert = require('assert');

// 测试配置
const TEST_CONFIG = {
  host: process.env.MYSQL_HOST || 'localhost',
  port: parseInt(process.env.MYSQL_PORT || '3306'),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'trainer_core_test'
};

let testPassed = 0;
let testFailed = 0;

function shouldSkip() {
  if (!process.env.MYSQL_HOST && !process.env.MYSQL_PASSWORD) {
    console.log('\n⚠️  MySQL 环境未配置，跳过全链路测试');
    console.log('   设置环境变量 MYSQL_HOST / MYSQL_PASSWORD 以启用测试');
    return true;
  }
  return false;
}

/**
 * 模拟 Live Monitor 处理流程
 */
async function simulateLiveMonitorFlow(repos, params) {
  const { projectId, employeeId, customerId, userReply, customerMessage, scenarioId } = params;
  
  // Step 1: 创建/获取 session
  console.log('  Step 1: 创建 session...');
  const session = await repos.session.create({
    projectId,
    channel: 'telegram',
    mode: 'live_monitor',
    employeeId,
    customerId,
    startedAt: new Date()
  });
  console.log('    ✓ Session:', session.sessionId);
  
  // Step 2: 写入 message
  console.log('  Step 2: 写入 message...');
  const message = await repos.message.save({
    sessionId: session.sessionId,
    projectId,
    channel: 'telegram',
    senderRole: 'agent',
    senderId: employeeId,
    direction: 'outbound',
    content: userReply,
    timestamp: new Date(),
    rawPayload: {
      customerMessage,
      originalTimestamp: new Date().toISOString()
    }
  });
  console.log('    ✓ Message:', message.messageId);
  
  // Step 3: 模拟 AI 评估结果
  console.log('  Step 3: 写入 evaluation...');
  const evaluation = await repos.evaluation.save({
    projectId,
    sessionId: session.sessionId,
    messageId: message.messageId,
    mode: 'live_monitor',
    scenarioId: scenarioId || 'test_scenario',
    status: 'alert_triggered',
    evaluationStatus: 'alert_triggered',
    score: 35,
    alertLevel: 'warning',
    matchConfidence: 0.85,
    dimensionScores: {
      empathy: 30,
      process: 40,
      accuracy: 35,
      riskControl: 35
    },
    findings: [
      { code: 'MISSING_KEY_INFO', severity: 'high', description: '未主动要求订单号和付款时间' }
    ],
    suggestions: [
      '先确认订单号、付款时间和支付方式',
      '补充安抚句并说明核实路径'
    ],
    strengths: ['语气基本礼貌'],
    summary: '回复态度尚可，但关键核实信息缺失，存在明显流程风险',
    standardReply: '您好，这边马上帮您核实。请提供订单号、付款时间以及支付方式，我们核实后第一时间回复您处理结果。'
  });
  console.log('    ✓ Evaluation:', evaluation.evaluationId);
  console.log('    ✓ Score:', evaluation.score, '| Alert:', evaluation.alertLevel);
  
  // Step 4: 命中告警时创建 review
  console.log('  Step 4: 检查告警并创建 review...');
  let review = null;
  if (evaluation.alertLevel && evaluation.alertLevel !== 'none') {
    review = await repos.review.create({
      projectId,
      sessionId: session.sessionId,
      messageId: message.messageId,
      evaluationId: evaluation.evaluationId,
      channel: 'telegram',
      employeeId,
      customerId,
      alertLevel: evaluation.alertLevel,
      reviewStatus: 'pending'
    });
    console.log('    ✓ Review:', review.reviewId);
  } else {
    console.log('    - 无告警，跳过 review 创建');
  }
  
  return { session, message, evaluation, review };
}

async function runTests() {
  console.log('='.repeat(60));
  console.log('Live Monitor MySQL 全链路流程测试');
  console.log('='.repeat(60));
  console.log(`\n配置: ${TEST_CONFIG.host}:${TEST_CONFIG.port}/${TEST_CONFIG.database}`);
  
  if (shouldSkip()) {
    console.log('\n测试状态: SKIPPED (MySQL 未配置)');
    return;
  }
  
  const { createRepositoryFactory } = require('../repositories');
  const { ReviewServiceV2 } = require('../services/review-service-v2');
  
  let factory;
  let repos;
  let reviewService;
  
  // 初始化连接
  console.log('\n[初始化] 连接数据库...');
  try {
    factory = createRepositoryFactory({
      type: 'mysql',
      mysql: TEST_CONFIG
    });
    await factory.initialize();
    repos = factory.getAll();
    reviewService = new ReviewServiceV2(repos);
    console.log('✓ 数据库连接成功');
  } catch (err) {
    console.log('✗ 数据库连接失败:', err.message);
    testFailed++;
    return;
  }
  
  // ========== 主链路测试 ==========
  console.log('\n' + '='.repeat(60));
  console.log('主链路测试：Live Monitor → Evaluation → Review');
  console.log('='.repeat(60));
  
  // 测试 1: 完整链路写入
  console.log('\n[1] 测试完整链路写入...');
  let flowData;
  try {
    flowData = await simulateLiveMonitorFlow(repos, {
      projectId: 'flow_test_project',
      employeeId: 'emp_flow_001',
      customerId: 'cus_flow_001',
      customerMessage: '我转账显示成功但对方没收到',
      userReply: '请稍等一下，我们会处理。',
      scenarioId: 'withdraw_not_received'
    });
    
    assert(flowData.session, 'session should exist');
    assert(flowData.message, 'message should exist');
    assert(flowData.evaluation, 'evaluation should exist');
    assert(flowData.review, 'review should exist');
    
    console.log('✓ 完整链路写入成功');
    testPassed++;
  } catch (err) {
    console.log('✗ 链路写入失败:', err.message);
    testFailed++;
  }
  
  // 测试 2: 查询待复核列表
  console.log('\n[2] 测试查询待复核列表...');
  try {
    const pendingResult = await reviewService.getPendingReviews({
      projectId: 'flow_test_project',
      limit: 10,
      offset: 0
    });
    
    assert(pendingResult.items.length > 0, 'should have pending items');
    const item = pendingResult.items[0];
    assert(item.reviewId, 'reviewId should exist');
    assert(item.score !== undefined, 'score should exist');
    assert(item.coachSummary, 'coachSummary should exist');
    
    console.log('✓ 待复核列表查询成功');
    console.log('  找到', pendingResult.items.length, '条待复核记录');
    console.log('  第一条:', item.reviewId, '| Score:', item.score, '| Alert:', item.alertLevel);
    testPassed++;
  } catch (err) {
    console.log('✗ 待复核列表查询失败:', err.message);
    testFailed++;
  }
  
  // 测试 3: 查询复核详情
  console.log('\n[3] 测试查询复核详情...');
  try {
    const detail = await reviewService.getReviewDetail(flowData.review.reviewId);
    
    assert(detail.review, 'review should exist');
    assert(detail.evaluation, 'evaluation should exist');
    assert(detail.message, 'message should exist');
    assert(detail.session, 'session should exist');
    assert(detail.supervisorPayload, 'supervisorPayload should exist');
    assert(detail.actions, 'actions should exist');
    
    console.log('✓ 复核详情查询成功');
    console.log('  Review ID:', detail.review.reviewId);
    console.log('  Evaluation ID:', detail.evaluation.evaluationId);
    console.log('  Message ID:', detail.message.messageId);
    console.log('  Session ID:', detail.session.sessionId);
    console.log('  Supervisor Payload:');
    console.log('    - originalReply:', detail.supervisorPayload.originalReply?.substring(0, 50) + '...');
    console.log('    - score:', detail.supervisorPayload.score);
    console.log('    - alertLevel:', detail.supervisorPayload.alertLevel);
    console.log('    - findings:', detail.supervisorPayload.findings?.length, '条');
    console.log('    - suggestions:', detail.supervisorPayload.suggestions?.length, '条');
    testPassed++;
  } catch (err) {
    console.log('✗ 复核详情查询失败:', err.message);
    testFailed++;
  }
  
  // 测试 4: 提交复核
  console.log('\n[4] 测试提交复核...');
  try {
    const submitResult = await reviewService.submitReview(flowData.review.reviewId, {
      reviewedBy: 'sup_flow_test',
      reviewDecision: 'approved',
      reviewComment: '建议可采纳，优化回复已确认',
      optimizedReply: '您好，这边马上帮您核实。请提供订单号、付款时间以及支付方式，我们核实后第一时间回复您处理结果。',
      optimizedReplyApproved: true,
      isAdopted: true,
      closeReview: false
    });
    
    assert(submitResult.review, 'review result should exist');
    assert(submitResult.evaluation, 'evaluation result should exist');
    assert(submitResult.syncStatus.reviewUpdated, 'review should be updated');
    assert(submitResult.syncStatus.evaluationUpdated, 'evaluation should be updated');
    assert(submitResult.syncStatus.actionLogged, 'action should be logged');
    
    console.log('✓ 复核提交成功');
    console.log('  Review 状态:', submitResult.review.reviewStatus);
    console.log('  Review 决定:', submitResult.review.reviewDecision);
    console.log('  Evaluation finalAccepted:', submitResult.evaluation.finalAccepted);
    testPassed++;
  } catch (err) {
    console.log('✗ 复核提交失败:', err.message);
    testFailed++;
  }
  
  // 测试 5: 查询复核统计
  console.log('\n[5] 测试查询复核统计...');
  try {
    const stats = await reviewService.getReviewStats('flow_test_project');
    
    assert(stats.projectId === 'flow_test_project', 'projectId should match');
    assert(stats.summary, 'summary should exist');
    assert(stats.rates, 'rates should exist');
    
    console.log('✓ 复核统计查询成功');
    console.log('  Summary:', JSON.stringify(stats.summary));
    console.log('  Rates:', JSON.stringify(stats.rates));
    testPassed++;
  } catch (err) {
    console.log('✗ 复核统计查询失败:', err.message);
    testFailed++;
  }
  
  // 测试 6: 查询最近已处理记录
  console.log('\n[6] 测试查询最近已处理记录...');
  try {
    const recent = await reviewService.getRecentReviews('flow_test_project', 10);
    
    assert(recent.items, 'items should exist');
    
    console.log('✓ 最近已处理记录查询成功');
    console.log('  找到', recent.items.length, '条已处理记录');
    if (recent.items.length > 0) {
      const item = recent.items[0];
      console.log('  最近一条:', item.reviewId, '| 决定:', item.reviewDecision, '| 处理人:', item.reviewedBy);
    }
    testPassed++;
  } catch (err) {
    console.log('✗ 最近已处理记录查询失败:', err.message);
    testFailed++;
  }
  
  // 测试 7: 验证数据完整性
  console.log('\n[7] 测试验证数据完整性...');
  try {
    // 重新查询所有关联数据
    const session = await repos.session.findById(flowData.session.sessionId);
    const message = await repos.message.findById(flowData.message.messageId);
    const evaluation = await repos.evaluation.findById(flowData.evaluation.evaluationId);
    const review = await repos.review.findById(flowData.review.reviewId);
    const actions = await repos.review.getActionHistory(flowData.review.reviewId);
    
    assert(session, 'session should exist in DB');
    assert(message, 'message should exist in DB');
    assert(evaluation, 'evaluation should exist in DB');
    assert(review, 'review should exist in DB');
    assert(actions.items.length > 0, 'actions should exist in DB');
    
    // 验证关联关系
    assert(message.sessionId === session.sessionId, 'message should link to session');
    assert(evaluation.sessionId === session.sessionId, 'evaluation should link to session');
    assert(evaluation.messageId === message.messageId, 'evaluation should link to message');
    assert(review.evaluationId === evaluation.evaluationId, 'review should link to evaluation');
    
    console.log('✓ 数据完整性验证通过');
    console.log('  Session:', session.sessionId);
    console.log('  Message:', message.messageId, '→', session.sessionId);
    console.log('  Evaluation:', evaluation.evaluationId, '→', message.messageId);
    console.log('  Review:', review.reviewId, '→', evaluation.evaluationId);
    console.log('  Actions:', actions.items.length, '条');
    testPassed++;
  } catch (err) {
    console.log('✗ 数据完整性验证失败:', err.message);
    testFailed++;
  }
  
  // 清理
  console.log('\n[清理] 关闭数据库连接...');
  try {
    await factory.close();
    console.log('✓ 连接已关闭');
  } catch (err) {
    console.log('✗ 关闭连接失败:', err.message);
  }
  
  // 结果汇总
  console.log('\n' + '='.repeat(60));
  console.log(`全链路测试完成: ${testPassed} 通过, ${testFailed} 失败`);
  console.log('='.repeat(60));
  
  if (testFailed === 0) {
    console.log('\n🎉 第4阶段 MySQL 全链路验收通过！');
    console.log('\n数据落表样例:');
    console.log('---');
    console.log('Session:', flowData?.session?.sessionId);
    console.log('Message:', flowData?.message?.messageId);
    console.log('Evaluation:', flowData?.evaluation?.evaluationId);
    console.log('Review:', flowData?.review?.reviewId);
    console.log('---');
  }
  
  if (testFailed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('测试执行错误:', err);
  process.exit(1);
});
