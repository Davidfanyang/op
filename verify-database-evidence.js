/**
 * 数据库实证验收脚本
 * 直接查询 MySQL 数据库，获取真实表数据
 */

const mysql = require('mysql2/promise');

async function runDatabaseVerification() {
  console.log('='.repeat(60));
  console.log('数据库实证验收 - 真实数据查询');
  console.log('='.repeat(60));
  
  // 数据库配置
  const config = {
    host: process.env.MYSQL_HOST || 'localhost',
    port: parseInt(process.env.MYSQL_PORT || '3306'),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'trainer_core',
    waitForConnections: true,
    connectionLimit: 1,
    connectTimeout: 10000
  };

  console.log(`\n数据库配置: ${config.host}:${config.port}/${config.database}`);
  
  let connection;
  try {
    // 创建连接
    connection = await mysql.createConnection(config);
    console.log('✓ 数据库连接成功');
    
    // 1. 查询最近一条完整链路
    console.log('\n' + '='.repeat(60));
    console.log('一、真实链路落表样例');
    console.log('='.repeat(60));
    
    // 查询最新的 session
    const [sessions] = await connection.execute(
      'SELECT * FROM sessions ORDER BY created_at DESC LIMIT 1'
    );
    
    if (sessions.length === 0) {
      console.log('\n⚠️  sessions 表为空，无真实数据');
      console.log('请先运行 live-monitor 服务产生真实数据');
      return;
    }
    
    const session = sessions[0];
    console.log('\n【sessions 表记录】');
    console.log(JSON.stringify(session, null, 2));
    
    // 查询关联的 messages
    const [messages] = await connection.execute(
      'SELECT * FROM messages WHERE session_id = ? ORDER BY created_at DESC LIMIT 1',
      [session.session_id]
    );
    
    if (messages.length > 0) {
      const message = messages[0];
      console.log('\n【messages 表记录】');
      console.log(JSON.stringify(message, null, 2));
      
      // 查询关联的 evaluations
      const [evaluations] = await connection.execute(
        'SELECT * FROM evaluations WHERE message_id = ? ORDER BY created_at DESC LIMIT 1',
        [message.message_id]
      );
      
      if (evaluations.length > 0) {
        const evaluation = evaluations[0];
        console.log('\n【evaluations 表记录】');
        console.log(JSON.stringify(evaluation, null, 2));
        
        // 查询关联的 reviews
        const [reviews] = await connection.execute(
          'SELECT * FROM reviews WHERE evaluation_id = ? ORDER BY created_at DESC LIMIT 1',
          [evaluation.evaluation_id]
        );
        
        if (reviews.length > 0) {
          const review = reviews[0];
          console.log('\n【reviews 表记录】');
          console.log(JSON.stringify(review, null, 2));
          
          // 查询关联的 review_actions
          const [reviewActions] = await connection.execute(
            'SELECT * FROM review_actions WHERE review_id = ? ORDER BY created_at DESC',
            [review.review_id]
          );
          
          if (reviewActions.length > 0) {
            console.log('\n【review_actions 表记录】');
            reviewActions.forEach((action, idx) => {
              console.log(`\n记录 ${idx + 1}:`);
              console.log(JSON.stringify(action, null, 2));
            });
          } else {
            console.log('\n⚠️  该 review 无关联的 review_actions');
          }
          
          // 链路关联说明
          console.log('\n【链路关联说明】');
          console.log(`session_id: ${session.session_id}`);
          console.log(`message_id: ${message.message_id}`);
          console.log(`evaluation_id: ${evaluation.evaluation_id}`);
          console.log(`review_id: ${review.review_id}`);
          console.log(`project_id: ${session.project_id}`);
          console.log(`关联关系: session → message → evaluation → review → review_actions`);
        } else {
          console.log('\n⚠️  该 evaluation 无关联的 review 记录');
        }
      } else {
        console.log('\n⚠️  该 message 无关联的 evaluation 记录');
      }
    } else {
      console.log('\n⚠️  该 session 无关联的 message 记录');
    }
    
    // 2. submitReview 前后对比测试
    console.log('\n' + '='.repeat(60));
    console.log('二、submitReview 前后对比');
    console.log('='.repeat(60));
    
    // 查找 pending 状态的 review
    const [pendingReviews] = await connection.execute(
      'SELECT * FROM reviews WHERE review_status = "pending" LIMIT 1'
    );
    
    if (pendingReviews.length > 0) {
      const pendingReview = pendingReviews[0];
      console.log('\n找到 pending 状态的 review:');
      console.log(`review_id: ${pendingReview.review_id}`);
      console.log(`review_status: ${pendingReview.review_status}`);
      console.log(`evaluation_id: ${pendingReview.evaluation_id}`);
      
      // 这里需要你手动调用 submitReview 接口
      console.log('\n⚠️  请调用 submitReview 接口完成提交:');
      console.log(`POST http://localhost:3001/api/reviews/${pendingReview.review_id}/submit`);
      console.log('Body: { "decision": "approved", "comment": "数据库实证验收测试" }');
      console.log('\n提交后再次运行此脚本查看对比结果');
    } else {
      console.log('\n⚠️  未找到 pending 状态的 review');
      console.log('所有 review 都已完成或无数据');
    }
    
    // 3. 故障回滚结果检查
    console.log('\n' + '='.repeat(60));
    console.log('三、故障回滚结果检查');
    console.log('='.repeat(60));
    
    // 检查孤儿 review_actions
    const [orphanActions] = await connection.execute(`
      SELECT ra.* 
      FROM review_actions ra 
      LEFT JOIN reviews r ON ra.review_id = r.review_id 
      WHERE r.review_id IS NULL
    `);
    
    console.log('\n【孤儿 review_actions 检查】');
    if (orphanActions.length === 0) {
      console.log('✓ 无孤儿 review_actions');
    } else {
      console.log(`⚠️  发现 ${orphanActions.length} 个孤儿 review_actions:`);
      orphanActions.forEach((action, idx) => {
        console.log(`\n孤儿记录 ${idx + 1}:`);
        console.log(JSON.stringify(action, null, 2));
      });
    }
    
    // 检查状态一致性
    const [inconsistentRecords] = await connection.execute(`
      SELECT r.*, e.review_status as eval_review_status, e.review_decision as eval_review_decision
      FROM reviews r 
      LEFT JOIN evaluations e ON r.evaluation_id = e.evaluation_id 
      WHERE r.review_status != e.review_status 
         OR (r.review_decision != e.review_decision AND (r.review_decision IS NOT NULL OR e.review_decision IS NOT NULL))
    `);
    
    console.log('\n【状态一致性检查】');
    if (inconsistentRecords.length === 0) {
      console.log('✓ reviews 和 evaluations 状态一致');
    } else {
      console.log(`⚠️  发现 ${inconsistentRecords.length} 条状态不一致记录:`);
      inconsistentRecords.forEach((record, idx) => {
        console.log(`\n不一致记录 ${idx + 1}:`);
        console.log(`review_id: ${record.review_id}`);
        console.log(`reviews.review_status: ${record.review_status}`);
        console.log(`evaluations.review_status: ${record.eval_review_status}`);
        console.log(`reviews.review_decision: ${record.review_decision}`);
        console.log(`evaluations.review_decision: ${record.eval_review_decision}`);
      });
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('实证验收完成');
    console.log('='.repeat(60));
    
  } catch (err) {
    console.error('❌ 数据库操作失败:', err.message);
    if (err.code === 'ECONNREFUSED') {
      console.log('\n可能原因:');
      console.log('1. MySQL 服务未启动');
      console.log('2. 数据库配置不正确');
      console.log('3. 数据库不存在');
      console.log('\n请检查:');
      console.log('- MySQL 服务状态: brew services list | grep mysql');
      console.log('- 数据库配置: .env 文件中的 MYSQL_* 环境变量');
      console.log('- 数据库是否存在: mysql -u root -p -e "SHOW DATABASES;"');
    }
  } finally {
    if (connection) {
      await connection.end();
      console.log('\n数据库连接已关闭');
    }
  }
}

// 运行验证
runDatabaseVerification().catch(console.error);