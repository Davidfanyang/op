#!/usr/bin/env node
/**
 * 创建 Training 测试数据
 * 用于演示 training_queue 最小可用流程
 */

const mysql = require('mysql2/promise');

async function createTestData() {
  const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'pai_dashboard'
  });

  try {
    console.log('🔧 创建 Training 测试数据...\n');

    // 1. 确保 default 项目存在
    await pool.query(`
      INSERT INTO projects (project_id, project_name, status)
      VALUES ('default', 'Default Project', 'active')
      ON DUPLICATE KEY UPDATE updated_at = NOW()
    `);

    // 2. 创建测试 session
    const sessionId = `training_session_${Date.now()}`;
    await pool.query(`
      INSERT INTO sessions (
        session_id, project_id, channel, mode, 
        employee_id, customer_id, status, started_at
      ) VALUES (?, 'default', 'telegram', 'training', 'employee_001', 'customer_001', 'closed', NOW())
    `, [sessionId]);

    // 3. 创建测试 message
    const messageId = `training_msg_${Date.now()}`;
    await pool.query(`
      INSERT INTO messages (
        message_id, session_id, project_id, channel,
        sender_role, sender_id, message_direction, content, sent_at
      ) VALUES (?, ?, 'default', 'telegram', 'agent', 'employee_001', 'outbound', 
        '您好,有什么问题吗?', NOW())
    `, [messageId, sessionId]);

    // 4. 创建测试 evaluation (低分)
    const evaluationId = `eval_training_${Date.now()}`;
    await pool.query(`
      INSERT INTO evaluations (
        evaluation_id, project_id, session_id, message_id,
        mode, scenario_id, status, evaluation_status,
        score, alert_level,
        findings_json, suggestions_json, coach_summary, standard_reply,
        review_status, created_at
      ) VALUES (?, 'default', ?, ?, 'training', 'greeting_test', 'ok', 'completed',
        45.5, 'warning',
        ?, ?, ?, ?,
        'pending', NOW())
    `, [
      evaluationId,
      sessionId,
      messageId,
      JSON.stringify([
        { dimension: '礼貌程度', description: '回复过于生硬,缺少礼貌用语' },
        { dimension: '专业度', description: '没有使用标准服务话术' }
      ]),
      JSON.stringify([
        '使用更礼貌的开场白,如"您好,很高兴为您服务"',
        '主动询问客户需求,而不是等待客户提问'
      ]),
      '客服回复过于简短生硬,建议增加礼貌用语和主动服务意识',
      '您好,很高兴为您服务!请问有什么可以帮助您的吗?'
    ]);

    // 5. 创建 training review
    const reviewId = `review_training_${Date.now()}`;
    await pool.query(`
      INSERT INTO reviews (
        review_id, project_id, mode, session_id, message_id, evaluation_id,
        channel, employee_id, customer_id, alert_level,
        review_status, created_at
      ) VALUES (?, 'default', 'training', ?, ?, ?,
        'telegram', 'employee_001', 'customer_001', 'warning',
        'pending', NOW())
    `, [reviewId, sessionId, messageId, evaluationId]);

    console.log('✅ 测试数据创建成功!\n');
    console.log('Review ID:', reviewId);
    console.log('Evaluation ID:', evaluationId);
    console.log('Session ID:', sessionId);
    console.log('\n现在可以运行:');
    console.log('  node scripts/training-queue-processor.js list');
    console.log(`  node scripts/training-queue-processor.js detail ${reviewId}`);
    console.log(`  node scripts/training-queue-processor.js process ${reviewId} needs_training supervisor "回复太生硬,需补训"`);

  } catch (error) {
    console.error('❌ 创建失败:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

createTestData();
