#!/usr/bin/env node
/**
 * 影子运行数据收集 - 日报
 * 
 * 范围:
 * - 1个项目: default
 * - 1个training场景: greeting_test
 * - 1个live_monitor入口: telegram
 * - 1位主管: supervisor_001
 * 
 * 每天运行1次,记录6个核心指标
 */

const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'pai_dashboard'
});

async function generateDailyReport(date = null) {
  const targetDate = date || new Date().toISOString().split('T')[0];
  const startOfDay = `${targetDate} 00:00:00`;
  const endOfDay = `${targetDate} 23:59:59`;

  console.log('='.repeat(100));
  console.log(`📊 影子运行日报 - ${targetDate}`);
  console.log('='.repeat(100));
  console.log();

  try {
    // ===== Training 指标 =====
    console.log('【Training 指标】');
    console.log('-'.repeat(100));

    // 1. 新增待处理数
    const [trainingNew] = await pool.query(`
      SELECT COUNT(*) as count
      FROM reviews r
      WHERE r.mode = 'training'
        AND r.project_id = 'default'
        AND DATE(r.created_at) = ?
    `, [targetDate]);

    console.log(`  新增待处理数: ${trainingNew[0].count}`);

    // 2. high/medium/low 分布
    const [priorityDist] = await pool.query(`
      SELECT 
        r.priority,
        COUNT(*) as count,
        AVG(e.score) as avg_score
      FROM reviews r
      LEFT JOIN evaluations e ON r.evaluation_id = e.evaluation_id
      WHERE r.mode = 'training'
        AND r.project_id = 'default'
        AND DATE(r.created_at) = ?
      GROUP BY r.priority
      ORDER BY FIELD(r.priority, 'high', 'medium', 'low')
    `, [targetDate]);

    console.log('  优先级分布:');
    const priorities = { high: 0, medium: 0, low: 0 };
    priorityDist.forEach(row => {
      priorities[row.priority] = Number(row.count);
      console.log(`    - ${row.priority}: ${row.count}条 (平均分: ${row.avg_score ? Number(row.avg_score).toFixed(1) : 'N/A'})`);
    });

    // 3. 真正被主管判为需补训的数量
    const [trainingDecisions] = await pool.query(`
      SELECT 
        r.review_decision,
        COUNT(*) as count
      FROM reviews r
      WHERE r.mode = 'training'
        AND r.project_id = 'default'
        AND DATE(r.reviewed_at) = ?
      GROUP BY r.review_decision
    `, [targetDate]);

    console.log('  主管处理决定:');
    const decisions = { needs_training: 0, needs_review: 0, passed: 0, viewed: 0 };
    trainingDecisions.forEach(row => {
      decisions[row.review_decision] = Number(row.count);
      console.log(`    - ${row.review_decision}: ${row.count}条`);
    });

    console.log();

    // ===== Live Monitor 指标 =====
    console.log('【Live Monitor 指标】');
    console.log('-'.repeat(100));

    // 4. 进入主管流数量 (supervisor_review)
    // 注: 这里通过 alert_level 和 score 模拟分流结果
    const [supervisorFlow] = await pool.query(`
      SELECT COUNT(*) as count
      FROM reviews r
      LEFT JOIN evaluations e ON r.evaluation_id = e.evaluation_id
      WHERE r.mode = 'live_monitor'
        AND r.project_id = 'default'
        AND DATE(r.created_at) = ?
        AND (
          e.score < 20  -- critical
          OR e.alert_level = 'critical'
        )
    `, [targetDate]);

    console.log(`  进入主管流数量: ${supervisorFlow[0].count}`);

    // 5. 被主管判为有效的数量
    const [lmApproved] = await pool.query(`
      SELECT COUNT(*) as count
      FROM reviews r
      WHERE r.mode = 'live_monitor'
        AND r.project_id = 'default'
        AND DATE(r.reviewed_at) = ?
        AND r.review_decision = 'approved'
    `, [targetDate]);

    console.log(`  被主管判为有效 (approved): ${lmApproved[0].count}`);

    // 6. 被主管判为误报的数量
    const [lmRejected] = await pool.query(`
      SELECT COUNT(*) as count
      FROM reviews r
      WHERE r.mode = 'live_monitor'
        AND r.project_id = 'default'
        AND DATE(r.reviewed_at) = ?
        AND r.review_decision = 'rejected'
    `, [targetDate]);

    console.log(`  被主管判为误报 (rejected): ${lmRejected[0].count}`);

    console.log();

    // ===== 汇总统计 =====
    console.log('【汇总统计】');
    console.log('-'.repeat(100));
    console.log(`  Training:`);
    console.log(`    - 新增: ${trainingNew[0].count}条`);
    console.log(`    - 高优: ${priorities.high}条, 中优: ${priorities.medium}条, 低优: ${priorities.low}条`);
    console.log(`    - 需补训: ${decisions.needs_training}条`);
    console.log(`  Live Monitor:`);
    console.log(`    - 进入主管流: ${supervisorFlow[0].count}条`);
    console.log(`    - 确认有效: ${lmApproved[0].count}条`);
    console.log(`    - 标记误报: ${lmRejected[0].count}条`);

    if (lmApproved[0].count + lmRejected[0].count > 0) {
      const total = lmApproved[0].count + lmRejected[0].count;
      const accuracy = ((lmApproved[0].count / total) * 100).toFixed(1);
      console.log(`    - 告警准确率: ${accuracy}%`);
    }

    console.log();
    console.log('='.repeat(100));

    // 返回数据供后续分析使用
    return {
      date: targetDate,
      training: {
        new_count: trainingNew[0].count,
        priority_distribution: priorities,
        decisions: decisions
      },
      live_monitor: {
        supervisor_flow: supervisorFlow[0].count,
        approved: lmApproved[0].count,
        rejected: lmRejected[0].count
      }
    };

  } catch (error) {
    console.error('❌ 生成日报失败:', error.message);
    throw error;
  }
}

// 如果直接运行,生成今天或指定日期的日报
if (require.main === module) {
  const dateArg = process.argv[2];
  
  (async () => {
    try {
      const report = await generateDailyReport(dateArg);
      
      // 保存到文件
      const fs = require('fs');
      const path = require('path');
      const reportDir = path.join(__dirname, '..', 'runtime', 'shadow-run');
      
      if (!fs.existsSync(reportDir)) {
        fs.mkdirSync(reportDir, { recursive: true });
      }
      
      const reportFile = path.join(reportDir, `daily-report-${report.date}.json`);
      fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
      
      console.log(`💾 日报已保存: ${reportFile}`);
      
    } catch (error) {
      console.error('❌ 执行失败:', error.message);
      process.exit(1);
    } finally {
      await pool.end();
    }
  })();
}

module.exports = { generateDailyReport };
