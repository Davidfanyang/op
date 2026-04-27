/**
 * 灰度验证 - 执行主管复核
 */

const mysql = require('mysql2/promise');

async function submitReview() {
  console.log('='.repeat(70));
  console.log('灰度验证 - 主管复核操作');
  console.log('='.repeat(70));
  
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
    console.log('\n✓ 数据库连接成功');
    
    // 1. 查找 pending review
    console.log('\n[1] 查找 pending review...');
    const [pendingReviews] = await connection.execute(
      'SELECT * FROM reviews WHERE review_status = "pending" AND project_id = "lanton" ORDER BY created_at DESC LIMIT 1'
    );
    
    if (pendingReviews.length === 0) {
      console.log('⚠️  未找到 pending review');
      return;
    }
    
    const review = pendingReviews[0];
    console.log('✓ 找到 pending review:', review.review_id);
    console.log('  evaluation_id:', review.evaluation_id);
    console.log('  alert_level:', review.alert_level);
    
    // 2. 查询提交前状态
    console.log('\n' + '='.repeat(70));
    console.log('提交前状态');
    console.log('='.repeat(70));
    
    const [reviewBefore] = await connection.execute(
      'SELECT * FROM reviews WHERE review_id = ?',
      [review.review_id]
    );
    console.log('\n【reviews 记录】');
    console.log(JSON.stringify(reviewBefore[0], null, 2));
    
    const [evalBefore] = await connection.execute(
      'SELECT * FROM evaluations WHERE evaluation_id = ?',
      [review.evaluation_id]
    );
    console.log('\n【evaluations 记录】');
    console.log(JSON.stringify(evalBefore[0], null, 2));
    
    const [actionsBefore] = await connection.execute(
      'SELECT * FROM review_actions WHERE review_id = ? ORDER BY created_at',
      [review.review_id]
    );
    console.log('\n【review_actions 记录】');
    console.log(`共 ${actionsBefore.length} 条`);
    actionsBefore.forEach((action, idx) => {
      console.log(`\n记录 ${idx + 1}:`);
      console.log(JSON.stringify(action, null, 2));
    });
    
    // 3. 执行 submitReview（approved 场景）
    console.log('\n' + '='.repeat(70));
    console.log('执行 submitReview (approved)');
    console.log('='.repeat(70));
    
    const reviewId = review.review_id;
    const evaluationId = review.evaluation_id;
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const actionId = 'action_submit_' + Date.now();
    
    // 使用事务
    await connection.beginTransaction();
    try {
      // 更新 reviews
      await connection.execute(
        `UPDATE reviews 
         SET review_status = 'reviewed', 
             review_decision = 'approved',
             review_comment = '灰度验证 - 主管复核通过',
             optimized_reply_approved = 1,
             is_adopted = 1,
             reviewed_by = 'supervisor_gray_test',
             reviewed_at = ?,
             updated_at = ?
         WHERE review_id = ?`,
        [now, now, reviewId]
      );
      console.log('\n✓ reviews 更新成功');
      
      // 更新 evaluations
      await connection.execute(
        `UPDATE evaluations 
         SET review_status = 'reviewed',
             review_decision = 'approved',
             reviewed_by = 'supervisor_gray_test',
             reviewed_at = ?,
             final_accepted = 1,
             updated_at = ?
         WHERE evaluation_id = ?`,
        [now, now, evaluationId]
      );
      console.log('✓ evaluations 更新成功');
      
      // 插入 review_action
      const actionPayload = JSON.stringify({
        optimized_reply_approved: true,
        is_adopted: true,
        review_comment: '灰度验证 - 主管复核通过'
      });
      
      await connection.execute(
        `INSERT INTO review_actions (action_id, review_id, project_id, action_type, actor_id, action_comment, payload_json, created_at)
         VALUES (?, ?, 'lanton', 'approved', 'supervisor_gray_test', '灰度验证 - 主管复核通过', ?, ?)`,
        [actionId, reviewId, actionPayload, now]
      );
      console.log('✓ review_action 插入成功');
      
      await connection.commit();
      console.log('\n✅ 事务提交成功');
      
    } catch (err) {
      await connection.rollback();
      console.log('\n❌ 事务回滚:', err.message);
      throw err;
    }
    
    // 4. 查询提交后状态
    console.log('\n' + '='.repeat(70));
    console.log('提交后状态');
    console.log('='.repeat(70));
    
    const [reviewAfter] = await connection.execute(
      'SELECT * FROM reviews WHERE review_id = ?',
      [reviewId]
    );
    console.log('\n【reviews 记录】');
    console.log(JSON.stringify(reviewAfter[0], null, 2));
    
    const [evalAfter] = await connection.execute(
      'SELECT * FROM evaluations WHERE evaluation_id = ?',
      [evaluationId]
    );
    console.log('\n【evaluations 记录】');
    console.log(JSON.stringify(evalAfter[0], null, 2));
    
    const [actionsAfter] = await connection.execute(
      'SELECT * FROM review_actions WHERE review_id = ? ORDER BY created_at',
      [reviewId]
    );
    console.log('\n【review_actions 记录】');
    console.log(`共 ${actionsAfter.length} 条`);
    actionsAfter.forEach((action, idx) => {
      console.log(`\n记录 ${idx + 1}:`);
      console.log(JSON.stringify(action, null, 2));
    });
    
    // 5. 字段变化总结
    console.log('\n' + '='.repeat(70));
    console.log('字段变化总结');
    console.log('='.repeat(70));
    
    console.log('\n【reviews 表变化】');
    console.log(`  review_status: "${reviewBefore[0].review_status}" → "${reviewAfter[0].review_status}"`);
    console.log(`  review_decision: ${reviewBefore[0].review_decision} → "${reviewAfter[0].review_decision}"`);
    console.log(`  optimized_reply_approved: ${reviewBefore[0].optimized_reply_approved} → ${reviewAfter[0].optimized_reply_approved}`);
    console.log(`  is_adopted: ${reviewBefore[0].is_adopted} → ${reviewAfter[0].is_adopted}`);
    console.log(`  reviewed_by: ${reviewBefore[0].reviewed_by} → "${reviewAfter[0].reviewed_by}"`);
    console.log(`  reviewed_at: ${reviewBefore[0].reviewed_at} → "${reviewAfter[0].reviewed_at}"`);
    console.log(`  review_comment: ${reviewBefore[0].review_comment} → "${reviewAfter[0].review_comment}"`);
    
    console.log('\n【evaluations 表变化】');
    console.log(`  review_status: "${evalBefore[0].review_status}" → "${evalAfter[0].review_status}"`);
    console.log(`  review_decision: ${evalBefore[0].review_decision} → "${evalAfter[0].review_decision}"`);
    console.log(`  reviewed_by: ${evalBefore[0].reviewed_by} → "${evalAfter[0].reviewed_by}"`);
    console.log(`  reviewed_at: ${evalBefore[0].reviewed_at} → "${evalAfter[0].reviewed_at}"`);
    console.log(`  final_accepted: ${evalBefore[0].final_accepted} → ${evalAfter[0].final_accepted}`);
    
    console.log('\n【review_actions 表变化】');
    console.log(`  新增 1 条 approved 动作记录`);
    console.log(`  action_id: ${actionId}`);
    console.log(`  action_type: approved`);
    console.log(`  actor_id: supervisor_gray_test`);
    
    console.log('\n' + '='.repeat(70));
    console.log('✅ 主管复核完成');
    console.log('='.repeat(70));
    
  } catch (err) {
    console.error('\n❌ 复核失败:', err.message);
    console.error(err.stack);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

submitReview().catch(console.error);
