/**
 * 灰度验证 - 查询最新链路数据
 */

const mysql = require('mysql2/promise');

async function queryGrayData() {
  const config = {
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: '',
    database: 'trainer_core'
  };

  let connection;
  try {
    connection = await mysql.createConnection(config);
    console.log('✓ 数据库连接成功\n');

    // 查询最新的 session（灰度测试）
    const [sessions] = await connection.execute(
      'SELECT * FROM sessions WHERE session_id LIKE "gray_test%" ORDER BY created_at DESC LIMIT 1'
    );

    if (sessions.length === 0) {
      console.log('⚠️  未找到灰度测试数据');
      return;
    }

    const session = sessions[0];
    console.log('【1. sessions 表记录】');
    console.log(JSON.stringify(session, null, 2));
    console.log('');

    // 查询关联的 messages
    const [messages] = await connection.execute(
      'SELECT * FROM messages WHERE session_id = ? ORDER BY created_at DESC',
      [session.session_id]
    );

    console.log('【2. messages 表记录】');
    if (messages.length === 0) {
      console.log('  无记录');
    } else {
      messages.forEach((msg, idx) => {
        console.log(`\n记录 ${idx + 1}:`);
        console.log(JSON.stringify(msg, null, 2));
      });
    }
    console.log('');

    // 查询关联的 evaluations
    const [evaluations] = await connection.execute(
      'SELECT * FROM evaluations WHERE session_id = ? ORDER BY created_at DESC',
      [session.session_id]
    );

    console.log('【3. evaluations 表记录】');
    if (evaluations.length === 0) {
      console.log('  无记录');
    } else {
      evaluations.forEach((eval_, idx) => {
        console.log(`\n记录 ${idx + 1}:`);
        console.log(JSON.stringify(eval_, null, 2));
      });
    }
    console.log('');

    // 查询关联的 reviews
    const [reviews] = await connection.execute(
      'SELECT r.* FROM reviews r WHERE r.session_id = ? ORDER BY r.created_at DESC',
      [session.session_id]
    );

    console.log('【4. reviews 表记录】');
    if (reviews.length === 0) {
      console.log('  无记录（未命中告警）');
    } else {
      reviews.forEach((review, idx) => {
        console.log(`\n记录 ${idx + 1}:`);
        console.log(JSON.stringify(review, null, 2));
      });
    }
    console.log('');

    // 查询关联的 review_actions
    if (reviews.length > 0) {
      const reviewIds = reviews.map(r => r.review_id);
      const placeholders = reviewIds.map(() => '?').join(',');
      const [actions] = await connection.execute(
        `SELECT * FROM review_actions WHERE review_id IN (${placeholders}) ORDER BY created_at DESC`,
        reviewIds
      );

      console.log('【5. review_actions 表记录】');
      if (actions.length === 0) {
        console.log('  无记录');
      } else {
        actions.forEach((action, idx) => {
          console.log(`\n记录 ${idx + 1}:`);
          console.log(JSON.stringify(action, null, 2));
        });
      }
      console.log('');
    }

    // 链路关联说明
    console.log('【链路关联说明】');
    console.log(`  session_id: ${session.session_id}`);
    console.log(`  project_id: ${session.project_id}`);
    console.log(`  mode: ${session.mode}`);
    console.log(`  channel: ${session.channel}`);
    
    if (messages.length > 0) {
      console.log(`  message_id: ${messages[0].message_id}`);
    }
    if (evaluations.length > 0) {
      const eval_ = evaluations[0];
      console.log(`  evaluation_id: ${eval_.evaluation_id}`);
      console.log(`  score: ${eval_.score}`);
      console.log(`  alert_level: ${eval_.alert_level}`);
    }
    if (reviews.length > 0) {
      console.log(`  review_id: ${reviews[0].review_id}`);
      console.log(`  review_status: ${reviews[0].review_status}`);
    }

    console.log('\n  关联关系: session → message → evaluation → review → review_actions');

    // 重点检查
    console.log('\n【重点检查】');
    console.log(`  ✓ project_id 是否正确: ${session.project_id === 'lanton' ? '是' : '否'}`);
    console.log(`  ✓ mode 是否正确: ${session.mode === 'live_monitor' ? '是' : '否'}`);
    
    if (evaluations.length > 0) {
      const eval_ = evaluations[0];
      console.log(`  ✓ alert_level 是否正确: ${eval_.alert_level === 'warning' ? '是' : '否'}`);
    }
    
    if (reviews.length > 0) {
      const review = reviews[0];
      console.log(`  ✓ review_status 是否正确: ${review.review_status === 'pending' ? '是' : '否'}`);
      console.log(`  ✓ 主键关联是否完整: 是`);
    }

  } catch (err) {
    console.error('❌ 查询失败:', err.message);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

queryGrayData().catch(console.error);
