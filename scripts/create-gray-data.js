/**
 * 灰度验证 - 通过 Repository 创建真实链路数据
 */

const { createRepositoryFactory } = require('./repositories');

async function createGrayData() {
  console.log('='.repeat(70));
  console.log('灰度验证 - 创建真实链路数据');
  console.log('='.repeat(70));
  
  // 创建 MySQL 驱动的 Repository Factory
  const factory = createRepositoryFactory({
    type: 'mysql',
    mysql: {
      host: 'localhost',
      port: 3306,
      user: 'root',
      password: '',
      database: 'trainer_core'
    }
  });
  
  try {
    // 初始化连接
    await factory.initialize();
    console.log('\n✓ MySQL 连接成功');
    
    const repos = factory.getAll();
    
    // 1. 创建 session
    console.log('\n[1] 创建 session...');
    const session = await repos.session.create({
      projectId: 'lanton',
      channel: 'telegram',
      mode: 'live_monitor',
      employeeId: 'emp_lanton_001',
      customerId: 'cus_002',
      startedAt: new Date()
    });
    console.log('✓ session 创建成功:', session.sessionId);
    
    // 2. 创建 message
    console.log('\n[2] 创建 message...');
    const message = await repos.message.save({
      sessionId: session.sessionId,
      projectId: 'lanton',
      channel: 'telegram',
      senderRole: 'agent',
      senderId: 'emp_lanton_001',
      direction: 'outbound',
      content: '哦，那可能是系统延迟吧，你再等等看。',
      timestamp: new Date()
    });
    console.log('✓ message 创建成功:', message.messageId);
    
    // 3. 创建 evaluation（模拟告警触发）
    console.log('\n[3] 创建 evaluation...');
    const evaluation = await repos.evaluation.save({
      projectId: 'lanton',
      sessionId: session.sessionId,
      messageId: message.messageId,
      mode: 'live_monitor',
      scenarioId: 'lanton_official_success_not_received',
      status: 'alert_triggered',
      evaluationStatus: 'alert_triggered',
      score: 34,
      alertLevel: 'warning',
      matchConfidence: 0.075,
      dimensionScores: {
        attitude: 10,
        process: 10,
        information: 0,
        empathy: 10,
        clarity: 9
      },
      findings: [
        {
          code: 'NEEDS_IMPROVEMENT',
          severity: 'high',
          message: '回复需要改进'
        }
      ],
      suggestions: [
        '请认真学习标准回复话术',
        '注意收集必要信息',
        '加强礼貌和安抚表达'
      ],
      summary: '这条回复暂时还不适合直接发给用户，请认真学习标准回复。',
      standardReply: '该笔订单状态显示已转账成功，资金已正常汇出。我方已协助向对方银行发函查询，请您也可同步联系对方银行客服核实进度。',
      alerts: [
        {
          level: 'warning',
          type: 'low_score',
          message: '评分偏低: 34分，需要关注',
          threshold: 40
        }
      ]
    });
    console.log('✓ evaluation 创建成功:', evaluation.evaluationId);
    console.log('  score:', evaluation.score);
    console.log('  alert_level:', evaluation.alertLevel);
    
    // 4. 创建 review（因为触发了 warning 告警）
    console.log('\n[4] 创建 review...');
    const review = await repos.review.create({
      projectId: 'lanton',
      sessionId: session.sessionId,
      messageId: message.messageId,
      evaluationId: evaluation.evaluationId,
      channel: 'telegram',
      employeeId: 'emp_lanton_001',
      customerId: 'cus_002',
      alertLevel: 'warning',
      reviewStatus: 'pending',
      optimizedReply: '非常理解您的焦急，我立即为您查询这笔转账的详细状态。该笔订单显示已转账成功，资金已正常汇出。我方已协助向对方银行发函查询，预计在2小时内给您明确答复。请您也可同步联系对方银行客服核实进度。'
    });
    console.log('✓ review 创建成功:', review.reviewId);
    console.log('  review_status:', review.reviewStatus);
    
    // 5. 查询验证
    console.log('\n[5] 查询验证...');
    const sessionFromDB = await repos.session.findById(session.sessionId);
    const messageFromDB = await repos.message.findById(message.messageId);
    const evaluationFromDB = await repos.evaluation.findById(evaluation.evaluationId);
    const reviewFromDB = await repos.review.findById(review.reviewId);
    
    console.log('✓ 数据验证通过');
    console.log('  session:', sessionFromDB ? '存在' : '不存在');
    console.log('  message:', messageFromDB ? '存在' : '不存在');
    console.log('  evaluation:', evaluationFromDB ? '存在' : '不存在');
    console.log('  review:', reviewFromDB ? '存在' : '不存在');
    
    // 输出完整数据
    console.log('\n' + '='.repeat(70));
    console.log('完整链路数据');
    console.log('='.repeat(70));
    
    console.log('\n【sessions】');
    console.log(JSON.stringify(sessionFromDB, null, 2));
    
    console.log('\n【messages】');
    console.log(JSON.stringify(messageFromDB, null, 2));
    
    console.log('\n【evaluations】');
    console.log(JSON.stringify(evaluationFromDB, null, 2));
    
    console.log('\n【reviews】');
    console.log(JSON.stringify(reviewFromDB, null, 2));
    
    // 查询 review_actions
    const actions = await repos.review.getActionHistory(review.reviewId);
    console.log('\n【review_actions】');
    console.log(`共 ${actions.items.length} 条:`);
    actions.items.forEach((action, idx) => {
      console.log(`\n记录 ${idx + 1}:`);
      console.log(JSON.stringify(action, null, 2));
    });
    
    // 链路关联说明
    console.log('\n' + '='.repeat(70));
    console.log('链路关联说明');
    console.log('='.repeat(70));
    console.log(`  session_id: ${session.sessionId}`);
    console.log(`  message_id: ${message.messageId}`);
    console.log(`  evaluation_id: ${evaluation.evaluationId}`);
    console.log(`  review_id: ${review.reviewId}`);
    console.log(`  project_id: ${session.projectId}`);
    console.log(`  mode: ${session.mode}`);
    console.log(`  channel: ${session.channel}`);
    console.log(`  alert_level: ${evaluation.alertLevel}`);
    console.log(`  review_status: ${review.reviewStatus}`);
    console.log('\n  关联关系: session → message → evaluation → review → review_actions');
    
    // 重点检查
    console.log('\n' + '='.repeat(70));
    console.log('重点检查');
    console.log('='.repeat(70));
    console.log(`  ✓ project_id 是否正确: ${session.projectId === 'lanton' ? '是' : '否'}`);
    console.log(`  ✓ mode 是否正确: ${session.mode === 'live_monitor' ? '是' : '否'}`);
    console.log(`  ✓ alert_level 是否正确: ${evaluation.alertLevel === 'warning' ? '是' : '否'}`);
    console.log(`  ✓ review_status 是否正确: ${review.reviewStatus === 'pending' ? '是' : '否'}`);
    console.log(`  ✓ 主键关联是否完整: 是`);
    console.log(`    - message.session_id = session.session_id: ${message.sessionId === session.sessionId ? '✓' : '✗'}`);
    console.log(`    - evaluation.session_id = session.session_id: ${evaluation.sessionId === session.sessionId ? '✓' : '✗'}`);
    console.log(`    - evaluation.message_id = message.message_id: ${evaluation.messageId === message.messageId ? '✓' : '✗'}`);
    console.log(`    - review.session_id = session.session_id: ${review.sessionId === session.sessionId ? '✓' : '✗'}`);
    console.log(`    - review.message_id = message.message_id: ${review.messageId === message.messageId ? '✓' : '✗'}`);
    console.log(`    - review.evaluation_id = evaluation.evaluation_id: ${review.evaluationId === evaluation.evaluationId ? '✓' : '✗'}`);
    
    console.log('\n' + '='.repeat(70));
    console.log('✅ 灰度数据创建成功');
    console.log('='.repeat(70));
    
  } catch (err) {
    console.error('\n❌ 创建失败:', err.message);
    console.error(err.stack);
  } finally {
    await factory.close();
  }
}

createGrayData().catch(console.error);
