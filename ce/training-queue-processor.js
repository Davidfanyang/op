#!/usr/bin/env node
/**
 * Training Queue 最小可用处理工具
 * 
 * 功能:
 * 1. 查询 training pending 列表
 * 2. 查看单条 training 记录详情
 * 3. 执行最小处理动作:
 *    - viewed (已看)
 *    - needs_training (需补训)  
 *    - passed (可放过)
 *    - needs_review (待复盘)
 */

const mysql = require('mysql2/promise');

// 数据库配置
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'pai_dashboard'
};

// 训练模式处理决定
const TRAINING_DECISIONS = ['viewed', 'needs_training', 'passed', 'needs_review'];

class TrainingQueueProcessor {
  constructor() {
    this.pool = mysql.createPool(dbConfig);
  }

  /**
   * 1. 查询 training pending 列表
   */
  async listPending(limit = 10) {
    const [rows] = await this.pool.query(`
      SELECT 
        r.review_id,
        r.session_id,
        r.employee_id,
        r.alert_level,
        r.created_at,
        e.score,
        e.scenario_id,
        e.mode
      FROM reviews r
      LEFT JOIN evaluations e ON r.evaluation_id = e.evaluation_id
      WHERE r.mode = 'training' 
        AND r.review_status = 'pending'
      ORDER BY r.created_at DESC
      LIMIT ?
    `, [limit]);

    return rows;
  }

  /**
   * 2. 查看单条 training 记录详情
   */
  async getDetail(reviewId) {
    const [reviewRows] = await this.pool.query(`
      SELECT * FROM reviews WHERE review_id = ?
    `, [reviewId]);

    if (reviewRows.length === 0) {
      throw new Error(`Training record not found: ${reviewId}`);
    }

    const review = reviewRows[0];

    const [evalRows] = await this.pool.query(`
      SELECT * FROM evaluations WHERE evaluation_id = ?
    `, [review.evaluation_id]);

    const evaluation = evalRows[0] || {};

    return {
      review_id: review.review_id,
      mode: review.mode,
      session_id: review.session_id,
      employee_id: review.employee_id,
      alert_level: review.alert_level,
      review_status: review.review_status,
      created_at: review.created_at,
      
      // 可见字段
      score: evaluation.score,
      scenario_id: evaluation.scenario_id,
      findings: this.safeParseJSON(evaluation.findings_json),
      suggestions: this.safeParseJSON(evaluation.suggestions_json),
      coach_summary: evaluation.coach_summary,
      standard_reply: evaluation.standard_reply
    };
  }

  /**
   * 安全解析 JSON
   */
  safeParseJSON(jsonStr) {
    if (!jsonStr) return [];
    try {
      const parsed = typeof jsonStr === 'string' ? JSON.parse(jsonStr) : jsonStr;
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      console.warn('[Warning] Failed to parse JSON:', jsonStr.substring(0, 50));
      return [];
    }
  }

  /**
   * 3. 执行处理动作
   */
  async process(reviewId, decision, reviewedBy, comment = '') {
    if (!TRAINING_DECISIONS.includes(decision)) {
      throw new Error(`Invalid decision: ${decision}. Must be one of: ${TRAINING_DECISIONS.join(', ')}`);
    }

    const now = new Date();
    const connection = await this.pool.getConnection();

    try {
      await connection.beginTransaction();

      // 1. 更新 reviews 表
      await connection.query(`
        UPDATE reviews 
        SET review_status = 'reviewed',
            review_decision = ?,
            reviewed_by = ?,
            reviewed_at = ?,
            review_comment = ?
        WHERE review_id = ?
      `, [decision, reviewedBy, now, comment, reviewId]);

      // 2. 同步更新 evaluations 表
      await connection.query(`
        UPDATE evaluations 
        SET review_status = 'reviewed',
            review_decision = ?,
            reviewed_by = ?,
            reviewed_at = ?
        WHERE evaluation_id = (
          SELECT evaluation_id FROM reviews WHERE review_id = ?
        )
      `, [decision, reviewedBy, now, reviewId]);

      // 3. 记录 review_action
      const actionId = `action_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const [reviewRows] = await connection.query(`
        SELECT project_id, evaluation_id FROM reviews WHERE review_id = ?
      `, [reviewId]);

      if (reviewRows.length > 0) {
        await connection.query(`
          INSERT INTO review_actions (
            action_id, review_id, project_id, action_type, 
            actor_id, action_comment, created_at
          ) VALUES (?, ?, ?, 'training_processed', ?, ?, ?)
        `, [
          actionId,
          reviewId,
          reviewRows[0].project_id,
          reviewedBy,
          `Training decision: ${decision}${comment ? ' - ' + comment : ''}`,
          now
        ]);
      }

      await connection.commit();

      return {
        review_id: reviewId,
        decision,
        reviewed_by: reviewedBy,
        reviewed_at: now,
        comment
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * 获取训练统计
   */
  async getStats() {
    const [rows] = await this.pool.query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN review_status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN review_status = 'reviewed' THEN 1 ELSE 0 END) as reviewed,
        SUM(CASE WHEN review_decision = 'viewed' THEN 1 ELSE 0 END) as viewed,
        SUM(CASE WHEN review_decision = 'needs_training' THEN 1 ELSE 0 END) as needs_training,
        SUM(CASE WHEN review_decision = 'passed' THEN 1 ELSE 0 END) as passed,
        SUM(CASE WHEN review_decision = 'needs_review' THEN 1 ELSE 0 END) as needs_review
      FROM reviews
      WHERE mode = 'training'
    `);

    return rows[0];
  }

  async close() {
    await this.pool.end();
  }
}

// CLI 交互
async function main() {
  const processor = new TrainingQueueProcessor();

  try {
    console.log('='.repeat(80));
    console.log('📋 Training Queue 最小可用工具');
    console.log('='.repeat(80));
    console.log();

    const args = process.argv.slice(2);
    const command = args[0];

    if (!command || command === 'help') {
      console.log('用法:');
      console.log('  node scripts/training-queue-processor.js list [limit]     - 查看 pending 列表');
      console.log('  node scripts/training-queue-processor.js detail <id>      - 查看详情');
      console.log('  node scripts/training-queue-processor.js process <id> <decision> [reviewer] [comment]');
      console.log('                                                            - 执行处理动作');
      console.log('  node scripts/training-queue-processor.js stats            - 查看统计');
      console.log();
      console.log('处理动作 (decision):');
      console.log('  viewed          - 已看');
      console.log('  needs_training  - 需补训');
      console.log('  passed          - 可放过');
      console.log('  needs_review    - 待复盘');
      console.log();
      return;
    }

    if (command === 'list') {
      const limit = parseInt(args[1]) || 10;
      const items = await processor.listPending(limit);

      if (items.length === 0) {
        console.log('✅ 当前没有待复核的训练记录');
        return;
      }

      console.log(`📋 Training Pending 列表 (共 ${items.length} 条)\n`);
      console.log('序号  Review ID                          场景              分数   告警级别   员工          创建时间');
      console.log('-'.repeat(120));

      items.forEach((item, index) => {
        const id = item.review_id.substring(0, 20).padEnd(36, ' ');
        const scenario = (item.scenario_id || 'N/A').substring(0, 16).padEnd(16, ' ');
        const score = (item.score !== null ? Number(item.score).toFixed(1) : 'N/A').padEnd(6, ' ');
        const alert = (item.alert_level || 'N/A').padEnd(10, ' ');
        const employee = (item.employee_id || 'N/A').padEnd(12, ' ');
        const time = new Date(item.created_at).toLocaleString('zh-CN');

        console.log(`${(index + 1).toString().padEnd(4, ' ')} ${id} ${scenario} ${score} ${alert} ${employee} ${time}`);
      });

      console.log();
      console.log('💡 使用 "detail <review_id>" 查看详情');
      console.log('💡 使用 "process <review_id> <decision> <reviewer>" 执行处理');
    }

    else if (command === 'detail') {
      const reviewId = args[1];
      if (!reviewId) {
        console.log('❌ 请提供 review_id');
        return;
      }

      const detail = await processor.getDetail(reviewId);

      console.log('\n📄 Training 记录详情\n');
      console.log('─'.repeat(80));
      console.log(`Review ID:     ${detail.review_id}`);
      console.log(`Session ID:    ${detail.session_id}`);
      console.log(`员工:          ${detail.employee_id || 'N/A'}`);
      console.log(`场景:          ${detail.scenario_id || 'N/A'}`);
      console.log(`状态:          ${detail.review_status}`);
      console.log('─'.repeat(80));
      console.log();

      console.log('【评估信息】');
      console.log(`  分数:        ${detail.score}`);
      console.log(`  告警级别:    ${detail.alert_level}`);
      console.log();

      if (detail.findings && detail.findings.length > 0) {
        console.log('【Findings】');
        detail.findings.forEach((f, i) => {
          console.log(`  ${i + 1}. ${f.dimension || 'N/A'}: ${f.description || f}`);
        });
        console.log();
      }

      if (detail.suggestions && detail.suggestions.length > 0) {
        console.log('【Suggestions】');
        detail.suggestions.forEach((s, i) => {
          console.log(`  ${i + 1}. ${s}`);
        });
        console.log();
      }

      if (detail.coach_summary) {
        console.log('【AI 教练总结】');
        console.log(`  ${detail.coach_summary}`);
        console.log();
      }

      if (detail.standard_reply) {
        console.log('【建议回复】');
        console.log(`  ${detail.standard_reply}`);
        console.log();
      }

      console.log('─'.repeat(80));
      console.log('💡 使用 "process <review_id> <decision> <reviewer> [comment]" 执行处理');
      console.log(`   可选 decision: viewed | needs_training | passed | needs_review`);
    }

    else if (command === 'process') {
      const reviewId = args[1];
      const decision = args[2];
      const reviewedBy = args[3] || 'supervisor';
      const comment = args.slice(4).join(' ');

      if (!reviewId || !decision) {
        console.log('❌ 用法: process <review_id> <decision> [reviewer] [comment]');
        return;
      }

      console.log(`\n🔄 执行处理...`);
      console.log(`   Review ID:  ${reviewId}`);
      console.log(`   决定:       ${decision}`);
      console.log(`   复核人:     ${reviewedBy}`);
      if (comment) console.log(`   备注:       ${comment}`);
      console.log();

      const result = await processor.process(reviewId, decision, reviewedBy, comment);

      console.log('✅ 处理成功!\n');
      console.log(`   Review ID:     ${result.review_id}`);
      console.log(`   处理决定:      ${result.decision}`);
      console.log(`   复核人:        ${result.reviewed_by}`);
      console.log(`   复核时间:      ${result.reviewed_at}`);
      if (result.comment) console.log(`   备注:          ${result.comment}`);
    }

    else if (command === 'stats') {
      const stats = await processor.getStats();

      console.log('\n📊 Training 统计\n');
      console.log(`  总计:         ${stats.total} 条`);
      console.log(`  待处理:       ${stats.pending} 条`);
      console.log(`  已处理:       ${stats.reviewed} 条`);
      console.log();
      console.log('  处理决定分布:');
      console.log(`    已看:         ${stats.viewed} 条`);
      console.log(`    需补训:       ${stats.needs_training} 条`);
      console.log(`    可放过:       ${stats.passed} 条`);
      console.log(`    待复盘:       ${stats.needs_review} 条`);
    }

    else {
      console.log(`❌ 未知命令: ${command}`);
      console.log('使用 "help" 查看用法');
    }

  } catch (error) {
    console.error('❌ 错误:', error.message);
    process.exit(1);
  } finally {
    await processor.close();
  }
}

main();
