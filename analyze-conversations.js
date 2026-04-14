#!/usr/bin/env node
/**
 * 会话运营分析报告
 * 基于 conversations 事实表
 */

const mysql = require('mysql2/promise');

async function generateReport() {
  const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    database: 'conversations_db',
    charset: 'utf8mb4'
  });

  console.log('='.repeat(80));
  console.log('会话运营分析报告');
  console.log('='.repeat(80));
  console.log(`生成时间: ${new Date().toLocaleString('zh-CN')}\n`);

  // ========== 第一部分：总览类指标 ==========
  console.log('📊 第一部分：总览类指标\n');

  // 1. 总会话数
  const [totalRow] = await pool.query('SELECT COUNT(*) as total FROM conversations');
  console.log(`1. 总会话数: ${totalRow[0].total}`);

  // 2. closed / open 数量
  const [statusRows] = await pool.query(`
    SELECT status, COUNT(*) as count 
    FROM conversations 
    GROUP BY status
  `);
  console.log('2. 状态分布:');
  statusRows.forEach(row => {
    const pct = ((row.count / totalRow[0].total) * 100).toFixed(1);
    console.log(`   - ${row.status}: ${row.count} 条 (${pct}%)`);
  });

  // 3. valid / invalid 数量
  const [validRows] = await pool.query(`
    SELECT is_valid, COUNT(*) as count 
    FROM conversations 
    GROUP BY is_valid
  `);
  console.log('3. 有效性分布:');
  validRows.forEach(row => {
    const label = row.is_valid === 1 ? 'valid' : 'invalid';
    const pct = ((row.count / totalRow[0].total) * 100).toFixed(1);
    console.log(`   - ${label}: ${row.count} 条 (${pct}%)`);
  });

  // ========== 第二部分：效率类指标 ==========
  console.log('\n⚡ 第二部分：效率类指标\n');

  // 4. 首响中位数
  const [medianRows] = await pool.query(`
    SELECT first_response_seconds
    FROM (
      SELECT first_response_seconds,
             ROW_NUMBER() OVER (ORDER BY first_response_seconds) as rn,
             COUNT(*) OVER () as total
      FROM conversations
      WHERE first_response_seconds IS NOT NULL 
        AND first_response_seconds > 0
        AND first_response_seconds < 1000000
    ) t
    WHERE rn = total / 2
  `);
  console.log(`4. 首响中位数: ${medianRows[0]?.first_response_seconds || 'N/A'} 秒`);

  // 5. 首响 P90
  const [p90Rows] = await pool.query(`
    SELECT first_response_seconds
    FROM (
      SELECT first_response_seconds,
             ROW_NUMBER() OVER (ORDER BY first_response_seconds) as rn,
             COUNT(*) OVER () as total
      FROM conversations
      WHERE first_response_seconds IS NOT NULL 
        AND first_response_seconds > 0
        AND first_response_seconds < 1000000
    ) t
    WHERE rn = total * 9 / 10
  `);
  console.log(`5. 首响 P90: ${p90Rows[0]?.first_response_seconds || 'N/A'} 秒`);

  // 6. SLA 超时数量
  const [slaRow] = await pool.query(`
    SELECT 
      SUM(CASE WHEN first_response_sla_breached = 1 THEN 1 ELSE 0 END) as sla_breached_count
    FROM conversations
  `);
  console.log(`6. SLA 超时数量: ${slaRow[0].sla_breached_count} 条`);

  // ========== 第三部分：质量类指标 ==========
  console.log('\n🎯 第三部分：质量类指标\n');

  // 7. reopen 会话数
  const [reopenRow] = await pool.query(`
    SELECT COUNT(*) as reopen_count
    FROM conversations
    WHERE reopen_count > 0
  `);
  console.log(`7. Reopen 会话数: ${reopenRow[0].reopen_count} 条`);

  // 8. 长会话 / 高消息会话数
  const [longRow] = await pool.query(`
    SELECT 
      SUM(CASE WHEN is_long = 1 THEN 1 ELSE 0 END) as long_conversations,
      SUM(CASE WHEN message_count > 50 THEN 1 ELSE 0 END) as high_message_conversations
    FROM conversations
  `);
  console.log(`8. 长会话数 (is_long=1): ${longRow[0].long_conversations} 条`);
  console.log(`   高消息会话数 (message_count>50): ${longRow[0].high_message_conversations} 条`);

  // ========== 第四部分：员工维度统计 ==========
  console.log('\n👥 第四部分：员工维度统计 (Top 10)\n');

  const [agentRows] = await pool.query(`
    SELECT 
      agent_tag,
      COUNT(*) as total_conversations,
      ROUND(AVG(CASE WHEN first_response_seconds > 0 AND first_response_seconds < 1000000 THEN first_response_seconds END), 1) as avg_first_response,
      SUM(CASE WHEN first_response_sla_breached = 1 THEN 1 ELSE 0 END) as sla_breached_count,
      SUM(CASE WHEN is_valid = 0 THEN 1 ELSE 0 END) as invalid_count,
      SUM(CASE WHEN reopen_count > 0 THEN 1 ELSE 0 END) as reopen_count
    FROM conversations
    WHERE agent_tag IS NOT NULL
    GROUP BY agent_tag
    ORDER BY total_conversations DESC
    LIMIT 10
  `);

  console.log('员工统计:');
  console.log('─'.repeat(80));
  console.log('员工'.padEnd(10) + '总会话'.padEnd(10) + '平均首响(s)'.padEnd(15) + 'SLA超时'.padEnd(10) + '无效会话'.padEnd(10) + 'Reopen数'.padEnd(10));
  console.log('─'.repeat(80));
  
  agentRows.forEach(row => {
    console.log(
      (row.agent_tag || 'N/A').padEnd(10) +
      String(row.total_conversations).padEnd(10) +
      String(row.avg_first_response || 'N/A').padEnd(15) +
      String(row.sla_breached_count).padEnd(10) +
      String(row.invalid_count).padEnd(10) +
      String(row.reopen_count).padEnd(10)
    );
  });

  // ========== 第五部分：Conversation Signals 设计 ==========
  console.log('\n🔔 第五部分：Conversation Signals 设计\n');

  console.log('基础信号清单:');
  console.log('1. is_sla_risk: first_response_seconds > 60');
  console.log('2. is_reopened: reopen_count > 0');
  console.log('3. is_invalid_conversation: is_valid = 0');
  console.log('4. is_unclosed_conversation: status = "open" AND end_time IS NULL');
  console.log('5. is_high_message_count: message_count > 50');
  console.log('6. is_long_conversation: is_long = 1 或会话时长 > 3600秒');

  // 验证信号分布
  const [signalsRow] = await pool.query(`
    SELECT 
      SUM(CASE WHEN first_response_seconds > 60 THEN 1 ELSE 0 END) as is_sla_risk,
      SUM(CASE WHEN reopen_count > 0 THEN 1 ELSE 0 END) as is_reopened,
      SUM(CASE WHEN is_valid = 0 THEN 1 ELSE 0 END) as is_invalid_conversation,
      SUM(CASE WHEN status = 'open' AND end_time IS NULL THEN 1 ELSE 0 END) as is_unclosed_conversation,
      SUM(CASE WHEN message_count > 50 THEN 1 ELSE 0 END) as is_high_message_count,
      SUM(CASE WHEN is_long = 1 THEN 1 ELSE 0 END) as is_long_conversation
    FROM conversations
  `);

  console.log('\n信号分布:');
  console.log(`- is_sla_risk: ${signalsRow[0].is_sla_risk} 条`);
  console.log(`- is_reopened: ${signalsRow[0].is_reopened} 条`);
  console.log(`- is_invalid_conversation: ${signalsRow[0].is_invalid_conversation} 条`);
  console.log(`- is_unclosed_conversation: ${signalsRow[0].is_unclosed_conversation} 条`);
  console.log(`- is_high_message_count: ${signalsRow[0].is_high_message_count} 条`);
  console.log(`- is_long_conversation: ${signalsRow[0].is_long_conversation} 条`);

  console.log('\n' + '='.repeat(80));
  console.log('报告生成完成');
  console.log('='.repeat(80));

  await pool.end();
}

generateReport().catch(console.error);
