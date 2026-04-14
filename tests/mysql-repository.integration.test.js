/**
 * MySQL Repository 集成测试
 * 
 * 测试目标：
 * 1. schema 初始化后能连接
 * 2. CRUD 正常
 * 3. JSON 字段读写正常
 * 4. findById / findPending / getStats 正常
 * 
 * 运行前提：MySQL 数据库已配置，schema.sql 已执行
 */

const assert = require('assert');

// 测试配置 - 可以通过环境变量覆盖
const TEST_CONFIG = {
  host: process.env.MYSQL_HOST || 'localhost',
  port: parseInt(process.env.MYSQL_PORT || '3306'),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'trainer_core_test'
};

let testPassed = 0;
let testFailed = 0;

/**
 * 跳过测试（MySQL 未配置）
 */
function shouldSkip() {
  // 如果没有配置 MySQL，跳过测试
  if (!process.env.MYSQL_HOST && !process.env.MYSQL_PASSWORD) {
    console.log('\n⚠️  MySQL 环境未配置，跳过集成测试');
    console.log('   设置环境变量 MYSQL_HOST / MYSQL_PASSWORD 以启用测试');
    return true;
  }
  return false;
}

async function runTests() {
  console.log('='.repeat(60));
  console.log('MySQL Repository 集成测试');
  console.log('='.repeat(60));
  console.log(`\n配置: ${TEST_CONFIG.host}:${TEST_CONFIG.port}/${TEST_CONFIG.database}`);
  
  if (shouldSkip()) {
    console.log('\n测试状态: SKIPPED (MySQL 未配置)');
    return;
  }
  
  const { createRepositoryFactory } = require('../repositories');
  
  let factory;
  let repos;
  
  // 测试 1: 连接初始化
  console.log('\n[1] 测试数据库连接...');
  try {
    factory = createRepositoryFactory({
      type: 'mysql',
      mysql: TEST_CONFIG
    });
    await factory.initialize();
    console.log('✓ 数据库连接成功');
    testPassed++;
    
    repos = factory.getAll();
  } catch (err) {
    console.log('✗ 数据库连接失败:', err.message);
    testFailed++;
    console.log('\n后续测试跳过（需要数据库连接）');
    return;
  }
  
  // 测试 2: Session CRUD
  console.log('\n[2] 测试 Session Repository...');
  try {
    const sessionData = {
      projectId: 'test_project',
      channel: 'telegram',
      mode: 'live_monitor',
      employeeId: 'emp_001',
      customerId: 'cus_001',
      startedAt: new Date()
    };
    
    const session = await repos.session.create(sessionData);
    assert(session.sessionId, 'sessionId should exist');
    console.log('✓ Session 创建成功:', session.sessionId);
    
    const foundSession = await repos.session.findById(session.sessionId);
    assert(foundSession, 'should find session');
    assert(foundSession.projectId === 'test_project', 'projectId should match');
    console.log('✓ Session 查询成功');
    
    testPassed += 2;
  } catch (err) {
    console.log('✗ Session 测试失败:', err.message);
    testFailed++;
  }
  
  // 测试 3: Message CRUD
  console.log('\n[3] 测试 Message Repository...');
  try {
    // 先创建 session
    const session = await repos.session.create({
      projectId: 'test_project',
      channel: 'telegram',
      mode: 'live_monitor',
      startedAt: new Date()
    });
    
    const messageData = {
      sessionId: session.sessionId,
      projectId: 'test_project',
      channel: 'telegram',
      senderRole: 'agent',
      senderId: 'emp_001',
      direction: 'outbound',
      content: '测试消息内容',
      timestamp: new Date(),
      rawPayload: { original: 'data' }
    };
    
    const message = await repos.message.save(messageData);
    assert(message.messageId, 'messageId should exist');
    console.log('✓ Message 创建成功:', message.messageId);
    
    const foundMessage = await repos.message.findById(message.messageId);
    assert(foundMessage, 'should find message');
    assert(foundMessage.content === '测试消息内容', 'content should match');
    assert(foundMessage.rawPayload.original === 'data', 'rawPayload should be parsed');
    console.log('✓ Message 查询成功，JSON 字段正常');
    
    testPassed += 2;
  } catch (err) {
    console.log('✗ Message 测试失败:', err.message);
    testFailed++;
  }
  
  // 测试 4: Evaluation CRUD + JSON 字段
  console.log('\n[4] 测试 Evaluation Repository...');
  try {
    const session = await repos.session.create({
      projectId: 'test_project',
      channel: 'telegram',
      mode: 'live_monitor',
      startedAt: new Date()
    });
    
    const message = await repos.message.save({
      sessionId: session.sessionId,
      projectId: 'test_project',
      channel: 'telegram',
      senderRole: 'agent',
      direction: 'outbound',
      content: '测试',
      timestamp: new Date()
    });
    
    const evaluationData = {
      projectId: 'test_project',
      sessionId: session.sessionId,
      messageId: message.messageId,
      mode: 'live_monitor',
      status: 'ok',
      evaluationStatus: 'ok',
      score: 75,
      alertLevel: 'none',
      dimensionScores: { empathy: 80, process: 70 },
      findings: [{ code: 'TEST', severity: 'low', description: '测试发现' }],
      suggestions: ['建议1', '建议2'],
      strengths: ['优点1'],
      summary: '测试总结'
    };
    
    const evaluation = await repos.evaluation.save(evaluationData);
    assert(evaluation.evaluationId, 'evaluationId should exist');
    console.log('✓ Evaluation 创建成功:', evaluation.evaluationId);
    
    const found = await repos.evaluation.findById(evaluation.evaluationId);
    assert(found, 'should find evaluation');
    assert(found.dimensionScores.empathy === 80, 'dimensionScores should be parsed');
    assert(found.findings.length === 1, 'findings should be parsed');
    assert(found.suggestions.length === 2, 'suggestions should be parsed');
    console.log('✓ Evaluation JSON 字段读写正常');
    
    testPassed += 2;
  } catch (err) {
    console.log('✗ Evaluation 测试失败:', err.message);
    testFailed++;
  }
  
  // 测试 5: Review CRUD + 状态查询
  console.log('\n[5] 测试 Review Repository...');
  try {
    const session = await repos.session.create({
      projectId: 'test_project',
      channel: 'telegram',
      mode: 'live_monitor',
      startedAt: new Date()
    });
    
    const message = await repos.message.save({
      sessionId: session.sessionId,
      projectId: 'test_project',
      channel: 'telegram',
      senderRole: 'agent',
      direction: 'outbound',
      content: '测试',
      timestamp: new Date()
    });
    
    const evaluation = await repos.evaluation.save({
      projectId: 'test_project',
      sessionId: session.sessionId,
      messageId: message.messageId,
      mode: 'live_monitor',
      status: 'alert_triggered',
      evaluationStatus: 'alert_triggered',
      score: 35,
      alertLevel: 'warning'
    });
    
    const review = await repos.review.create({
      projectId: 'test_project',
      sessionId: session.sessionId,
      messageId: message.messageId,
      evaluationId: evaluation.evaluationId,
      channel: 'telegram',
      alertLevel: 'warning',
      reviewStatus: 'pending'
    });
    
    assert(review.reviewId, 'reviewId should exist');
    console.log('✓ Review 创建成功:', review.reviewId);
    
    // 测试 findPending
    const pending = await repos.review.findPending('test_project', {}, { page: 1, limit: 10 });
    assert(pending.items.length > 0, 'should have pending items');
    console.log('✓ findPending 查询成功，找到', pending.items.length, '条');
    
    // 测试 getStats
    const stats = await repos.review.getStats('test_project');
    assert(typeof stats.total === 'number', 'stats.total should be number');
    console.log('✓ getStats 查询成功:', JSON.stringify(stats));
    
    testPassed += 3;
  } catch (err) {
    console.log('✗ Review 测试失败:', err.message);
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
  
  // 结果
  console.log('\n' + '='.repeat(60));
  console.log(`测试完成: ${testPassed} 通过, ${testFailed} 失败`);
  console.log('='.repeat(60));
  
  if (testFailed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('测试执行错误:', err);
  process.exit(1);
});
