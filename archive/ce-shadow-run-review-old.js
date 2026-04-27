#!/usr/bin/env node
/**
 * 影子运行复盘分析 - 3天后执行
 * 
 * 分析内容:
 * 1. priority 是否经常被主管认可
 * 2. problem_tags 哪些最容易打偏
 * 3. 哪些告警本来不该进主管流
 * 4. 哪些真正该进主管流的被漏掉了
 */

const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'pai_dashboard'
});

async function analyzeShadowRun(startDate, endDate) {
  console.log('='.repeat(120));
  console.log(`🔍 影子运行复盘分析 (${startDate} ~ ${endDate})`);
  console.log('='.repeat(120));
  console.log();

  try {
    // ===== 1. Priority 认可度分析 =====
    console.log('【1】Priority 认可度分析');
    console.log('-'.repeat(120));

    const [priorityAnalysis] = await pool.query(`
      SELECT 
        r.priority,
        COUNT(*) as total,
        SUM(CASE WHEN r.review_decision IN ('needs_training', 'approved') THEN 1 ELSE 0 END) as confirmed,
        SUM(CASE WHEN r.review_decision IN ('passed', 'rejected') THEN 1 ELSE 0 END) as rejected,
        AVG(e.score) as avg_score
      FROM reviews r
      LEFT JOIN evaluations e ON r.evaluation_id = e.evaluation_id
      WHERE r.mode IN ('training', 'live_monitor')
        AND r.project_id = 'default'
        AND DATE(r.created_at) BETWEEN ? AND ?
        AND r.review_status = 'reviewed'
      GROUP BY r.priority
      ORDER BY FIELD(r.priority, 'high', 'medium', 'low')
    `, [startDate, endDate]);

    console.log('优先级  总数  主管认可  主管驳回  平均分  认可率');
    console.log('-'.repeat(120));
    priorityAnalysis.forEach(row => {
      const rate = row.confirmed > 0 ? ((row.confirmed / row.total) * 100).toFixed(1) + '%' : 'N/A';
      console.log(
        `${row.priority.padEnd(8, ' ')} ` +
        `${String(row.total).padEnd(6, ' ')} ` +
        `${String(row.confirmed).padEnd(10, ' ')} ` +
        `${String(row.rejected).padEnd(10, ' ')} ` +
        `${(row.avg_score ? Number(row.avg_score).toFixed(1) : 'N/A').padEnd(8, ' ')} ` +
        `${rate}`
      );
    });
    console.log();

    // ===== 2. Problem Tags 准确率分析 =====
    console.log('【2】Problem Tags 准确率分析');
    console.log('-'.repeat(120));

    const [tagsAnalysis] = await pool.query(`
      SELECT 
        r.problem_tags,
        r.review_decision,
        e.findings_json,
        e.score,
        r.review_comment
      FROM reviews r
      LEFT JOIN evaluations e ON r.evaluation_id = e.evaluation_id
      WHERE r.mode = 'training'
        AND r.project_id = 'default'
        AND DATE(r.created_at) BETWEEN ? AND ?
        AND r.problem_tags IS NOT NULL
        AND r.review_status = 'reviewed'
    `, [startDate, endDate]);

    const tagAccuracy = {
      '态度问题': { total: 0, correct: 0, wrong: 0, examples: [] },
      '话术问题': { total: 0, correct: 0, wrong: 0, examples: [] },
      '流程问题': { total: 0, correct: 0, wrong: 0, examples: [] }
    };

    tagsAnalysis.forEach(row => {
      try {
        const tags = typeof row.problem_tags === 'string' ? JSON.parse(row.problem_tags) : row.problem_tags;
        if (!Array.isArray(tags)) return;

        tags.forEach(tag => {
          if (tagAccuracy[tag]) {
            tagAccuracy[tag].total++;
            
            // 判断是否打偏: 如果主管驳回(passed/rejected),说明可能打偏
            if (row.review_decision === 'passed' || row.review_decision === 'rejected') {
              tagAccuracy[tag].wrong++;
              tagAccuracy[tag].examples.push({
                score: row.score,
                decision: row.review_decision,
                comment: row.review_comment,
                findings: row.findings_json
              });
            } else {
              tagAccuracy[tag].correct++;
            }
          }
        });
      } catch (e) {
        // ignore
      }
    });

    console.log('问题标签  总数  准确  打偏  准确率  典型打偏案例');
    console.log('-'.repeat(120));
    Object.entries(tagAccuracy).forEach(([tag, data]) => {
      if (data.total === 0) return;
      const accuracy = ((data.correct / data.total) * 100).toFixed(1) + '%';
      const wrongExample = data.examples.length > 0 
        ? `分数${data.examples[0].score}, 主管判${data.examples[0].decision}`
        : '无';
      console.log(
        `${tag.padEnd(10, ' ')} ` +
        `${String(data.total).padEnd(6, ' ')} ` +
        `${String(data.correct).padEnd(6, ' ')} ` +
        `${String(data.wrong).padEnd(6, ' ')} ` +
        `${accuracy.padEnd(8, ' ')} ` +
        `${wrongExample}`
      );
    });
    console.log();

    // ===== 3. 不该进主管流的告警 =====
    console.log('【3】不该进主管流的告警 (误报分析)');
    console.log('-'.repeat(120));

    const [falseAlarms] = await pool.query(`
      SELECT 
        r.review_id,
        e.score,
        e.alert_level,
        e.findings_json,
        r.review_decision,
        r.review_comment,
        r.created_at
      FROM reviews r
      LEFT JOIN evaluations e ON r.evaluation_id = e.evaluation_id
      WHERE r.mode = 'live_monitor'
        AND r.project_id = 'default'
        AND DATE(r.created_at) BETWEEN ? AND ?
        AND r.review_decision = 'rejected'
      ORDER BY r.created_at
    `, [startDate, endDate]);

    if (falseAlarms.length === 0) {
      console.log('  ✅ 无误报案例');
    } else {
      console.log(`  共 ${falseAlarms.length} 条误报:`);
      console.log();
      falseAlarms.forEach((alarm, index) => {
        console.log(`  ${index + 1}. Review: ${alarm.review_id.substring(0, 30)}...`);
        console.log(`     分数: ${alarm.score}, 告警级别: ${alarm.alert_level}`);
        console.log(`     主管判定: ${alarm.review_decision}`);
        if (alarm.review_comment) {
          console.log(`     备注: ${alarm.review_comment}`);
        }
        console.log();
      });
    }
    console.log();

    // ===== 4. 该进主管流但被漏掉的 =====
    console.log('【4】该进主管流但被漏掉的告警 (漏报分析)');
    console.log('-'.repeat(120));

    // 查找 observation 级别但主管认为应该处理的案例
    const [missedAlarms] = await pool.query(`
      SELECT 
        r.review_id,
        e.score,
        e.alert_level,
        e.findings_json,
        r.review_decision,
        r.review_comment,
        r.created_at
      FROM reviews r
      LEFT JOIN evaluations e ON r.evaluation_id = e.evaluation_id
      WHERE r.mode = 'live_monitor'
        AND r.project_id = 'default'
        AND DATE(r.created_at) BETWEEN ? AND ?
        AND r.alert_level IN ('warning', 'observation')
        AND r.review_decision = 'approved'
      ORDER BY r.created_at
    `, [startDate, endDate]);

    if (missedAlarms.length === 0) {
      console.log('  ✅ 无漏报案例');
    } else {
      console.log(`  共 ${missedAlarms.length} 条漏报:`);
      console.log();
      missedAlarms.forEach((alarm, index) => {
        console.log(`  ${index + 1}. Review: ${alarm.review_id.substring(0, 30)}...`);
        console.log(`     分数: ${alarm.score}, 告警级别: ${alarm.alert_level}`);
        console.log(`     主管判定: ${alarm.review_decision} (本应进入主管流)`);
        if (alarm.review_comment) {
          console.log(`     备注: ${alarm.review_comment}`);
        }
        console.log();
      });
    }
    console.log();

    // ===== 5. 综合建议 =====
    console.log('【5】综合建议');
    console.log('-'.repeat(120));

    // Priority 建议
    const highPriority = priorityAnalysis.find(p => p.priority === 'high');
    if (highPriority) {
      const highRate = (highPriority.confirmed / highPriority.total) * 100;
      if (highRate < 70) {
        console.log(`  ⚠️  High priority 认可率仅${highRate.toFixed(1)}%, 建议调整阈值或标签逻辑`);
      } else {
        console.log(`  ✅ High priority 认可率${highRate.toFixed(1)}%, 表现良好`);
      }
    }

    // Tags 建议
    Object.entries(tagAccuracy).forEach(([tag, data]) => {
      if (data.total > 0) {
        const accuracy = data.correct / data.total;
        if (accuracy < 0.7) {
          console.log(`  ⚠️  "${tag}" 准确率仅${(accuracy * 100).toFixed(1)}%, 建议优化识别规则`);
        }
      }
    });

    // 误报建议
    if (falseAlarms.length > 0) {
      const falseRate = falseAlarms.length / (falseAlarms.length + missedAlarms.length) * 100;
      console.log(`  ⚠️  误报率${falseRate.toFixed(1)}%, 建议调整分流规则`);
    }

    console.log();
    console.log('='.repeat(120));

    return {
      priority_analysis: priorityAnalysis,
      tag_accuracy: tagAccuracy,
      false_alarms: falseAlarms,
      missed_alarms: missedAlarms
    };

  } catch (error) {
    console.error('❌ 分析失败:', error.message);
    throw error;
  }
}

// 如果直接运行,分析最近3天
if (require.main === module) {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 3);

  const startStr = startDate.toISOString().split('T')[0];
  const endStr = endDate.toISOString().split('T')[0];

  (async () => {
    try {
      await analyzeShadowRun(startStr, endStr);
    } catch (error) {
      console.error('❌ 执行失败:', error.message);
      process.exit(1);
    } finally {
      await pool.end();
    }
  })();
}

module.exports = { analyzeShadowRun };
