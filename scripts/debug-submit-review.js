const { createRepositoryFactory } = require('../repositories');

async function test() {
  const factory = createRepositoryFactory({
    type: 'mysql',
    mysql: {
      host: '127.0.0.1',
      user: 'root',
      database: 'trainer_core_test'
    }
  });
  
  await factory.initialize();
  const repos = factory.getAll();
  
  // 创建测试数据
  const session = await repos.session.create({
    projectId: 'debug_test',
    channel: 'telegram',
    mode: 'live_monitor',
    startedAt: new Date()
  });
  
  const message = await repos.message.save({
    sessionId: session.sessionId,
    projectId: 'debug_test',
    channel: 'telegram',
    senderRole: 'agent',
    direction: 'outbound',
    content: 'test',
    timestamp: new Date()
  });
  
  const evaluation = await repos.evaluation.save({
    projectId: 'debug_test',
    sessionId: session.sessionId,
    messageId: message.messageId,
    mode: 'live_monitor',
    status: 'alert_triggered',
    evaluationStatus: 'alert_triggered',
    score: 35,
    alertLevel: 'warning'
  });
  
  const review = await repos.review.create({
    projectId: 'debug_test',
    sessionId: session.sessionId,
    messageId: message.messageId,
    evaluationId: evaluation.evaluationId,
    channel: 'telegram',
    alertLevel: 'warning',
    reviewStatus: 'pending'
  });
  
  console.log('Created review:', review.reviewId);
  console.log('Initial status:', review.reviewStatus);
  
  // 提交复核
  const result = await repos.review.submitReview(review.reviewId, {
    reviewedBy: 'sup_debug',
    reviewDecision: 'approved',
    reviewComment: 'test',
    reviewStatus: 'reviewed'
  });
  
  console.log('After submitReview:', JSON.stringify(result, null, 2));
  
  // 再次查询
  const reloaded = await repos.review.findById(review.reviewId);
  console.log('Reloaded:', JSON.stringify(reloaded, null, 2));
  
  await factory.close();
}

test().catch(e => console.error('Error:', e));
