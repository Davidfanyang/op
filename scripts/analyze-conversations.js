#!/usr/bin/env node
/**
 * 会话运营指标分析脚本
 * 基于 conversations 表生成核心运营指标和员工维度统计
 */

const mysql = require('mysql2/promise');

async function runAnalysis() {
  const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'pai_dashboard',
    waitForConnections: true,
    connectionLimit: 5
  });

  try {
    console.log('='.repeat(80));
    console.log('📊 会话运营指标分析报告');
    console.log('='.repeat(80));
    console.log();

    // 1. 总览类指标
    console.log('【一、总览类指标】');
    console.log('-'.repeat(80));
    
    const [totalResult] = await pool.query(`
      SELECT 
        COUNT(*) as total_conversations,
        SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) as closed_count,
        SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) as open_count,
        SUM(CASE WHEN is_valid = 1 THEN 1 ELSE 0 END) as valid_count,
        SUM(CASE WHEN is_valid = 0 THEN 1 ELSE 0 END) as invalid_count
      FROM conversations
    `);
    
    const total = totalResult[0];
    console.log(`总会话数: ${total.total_conversations}`);
    console.log(`已关闭 (closed): ${total.closed_count} (${(total.closed_count/total.total_conversations*100).toFixed(1)}%)`);
    console.log(`进行中 (open): ${total.open_count} (${(total.open_count/total.total_conversations*100).toFixed(1)}%)`);
    console.log(`有效会话 (valid): ${total.valid_count} (${(total.valid_count/total.total_conversations*100).toFixed(1)}%)`);
    console.log(`无效会话 (invalid): ${total.invalid_count} (${(total.invalid_count/total.total_conversations*100).toFixed(1)}%)`);
    console.log();

    // 2. 效率类指标
    console.log('【二、效率类指标】');
    console.log('-'.repeat(80));
    
    const [efficiencyResult] = await pool.query(`
      SELECT 
        COUNT(first_response_seconds) as has_response_count,
        MIN(first_response_seconds) as min_response,
        MAX(first_response_seconds) as max_response,
        AVG(first_response_seconds) as avg_response,
        SUM(CASE WHEN first_response_sla_breached = 1 THEN 1 ELSE 0 END) as sla_breached_count
      FROM conversations
      WHERE first_response_seconds IS NOT NULL
    `);
    
    const [medianResult] = await pool.query(`
      SELECT 
        CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(
          GROUP_CONCAT(first_response_seconds ORDER BY first_response_seconds SEPARATOR ','),
          ',',
          CEIL(COUNT(*) * 0.5)
        ), ',', -1) AS SIGNED) as median_response,
        CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(
          GROUP_CONCAT(first_response_seconds ORDER BY first_response_seconds SEPARATOR ','),
          ',',
          CEIL(COUNT(*) * 0.9)
        ), ',', -1) AS SIGNED) as p90_response
      FROM conversations
      WHERE first_response_seconds IS NOT NULL
    `);
    
    const eff = efficiencyResult[0];
    const med = medianResult[0];
    
    console.log(`首响中位数: ${med.median_response} 秒 (${(med.median_response/60).toFixed(1)} 分钟)`);
    console.log(`首响 P90: ${med.p90_response} 秒 (${(med.p90_response/60).toFixed(1)} 分钟)`);
    console.log(`首响平均值: ${Math.round(eff.avg_response)} 秒 (${(eff.avg_response/60).toFixed(1)} 分钟)`);
    console.log(`首响最小值: ${eff.min_response} 秒`);
    console.log(`首响最大值: ${eff.max_response} 秒 (${(eff.max_response/3600).toFixed(1)} 小时)`);
    console.log(`SLA 超时数量: ${eff.sla_breached_count}`);
    console.log(`SLA 超时率: ${(eff.sla_breached_count/total.total_conversations*100).toFixed(1)}%`);
    console.log();

    // 3. 质量类指标
    console.log('【三、质量类指标】');
    console.log('-'.repeat(80));
    
    const [qualityResult] = await pool.query(`
      SELECT 
        SUM(CASE WHEN reopen_count > 0 THEN 1 ELSE 0 END) as reopened_count,
        SUM(CASE WHEN is_long = 1 THEN 1 ELSE 0 END) as long_conversation_count,
        AVG(message_count) as avg_message_count,
        MAX(message_count) as max_message_count
      FROM conversations
    `);
    
    const [highMessageResult] = await pool.query(`
      SELECT 
        COUNT(*) as high_message_count
      FROM conversations
      WHERE message_count > 50
    `);
    
    const qual = qualityResult[0];
    console.log(`Reopen 会话数: ${qual.reopened_count} (${(qual.reopened_count/total.total_conversations*100).toFixed(1)}%)`);
    console.log(`长会话数 (is_long=1): ${qual.long_conversation_count}`);
    console.log(`高消息会话数 (>50条): ${highMessageResult[0].high_message_count}`);
    console.log(`平均消息数: ${Math.round(qual.avg_message_count)} 条`);
    console.log(`最大消息数: ${qual.max_message_count} 条`);
    console.log();

    // 4. 员工维度统计 (按 agent_tag)
    console.log('【四、员工维度统计】');
    console.log('-'.repeat(80));
    
    const [agentResult] = await pool.query(`
      SELECT 
        agent_tag,
        COUNT(*) as total_sessions,
        ROUND(AVG(first_response_seconds)) as avg_first_response,
        SUM(CASE WHEN first_response_sla_breached = 1 THEN 1 ELSE 0 END) as sla_breached,
        SUM(CASE WHEN is_valid = 0 THEN 1 ELSE 0 END) as invalid_sessions,
        SUM(CASE WHEN reopen_count > 0 THEN 1 ELSE 0 END) as reopened_sessions,
        ROUND(AVG(message_count), 1) as avg_messages,
        SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) as open_sessions
      FROM conversations
      WHERE agent_tag IS NOT NULL
      GROUP BY agent_tag
      ORDER BY total_sessions DESC
    `);
    
    console.log('\n员工\t\t总会话\t平均首响(秒)\tSLA超时\t无效会话\tReopen\t未关闭\t平均消息');
    console.log('-'.repeat(120));
    
    agentResult.forEach(agent => {
      const tag = agent.agent_tag.padEnd(12, ' ');
      console.log(
        `${tag}\t${agent.total_sessions}\t\t` +
        `${agent.avg_first_response || 'N/A'}\t\t` +
        `${agent.sla_breached}\t\t` +
        `${agent.invalid_sessions}\t\t` +
        `${agent.reopened_sessions}\t\t` +
        `${agent.open_sessions}\t\t` +
        `${agent.avg_messages}`
      );
    });
    
    console.log();
    
    // 5. 异常值分析
    console.log('【五、异常值分析】');
    console.log('-'.repeat(80));
    
    const [anomalyResult] = await pool.query(`
      SELECT 
        id,
        agent_tag,
        first_response_seconds,
        message_count,
        status,
        is_valid,
        invalid_reason,
        reopen_count,
        start_time
      FROM conversations
      WHERE first_response_seconds > 3600 OR message_count > 100 OR reopen_count > 2
      ORDER BY first_response_seconds DESC
      LIMIT 10
    `);
    
    console.log('\n极端异常会话 Top 10:');
    console.log('ID\t\t员工\t\t首响(秒)\t消息数\t状态\t无效原因\tReopen');
    console.log('-'.repeat(120));
    
    anomalyResult.forEach(row => {
      const tag = (row.agent_tag || 'N/A').padEnd(12, ' ');
      const reason = (row.invalid_reason || '').padEnd(20, ' ');
      console.log(
        `${row.id}\t\t${tag}\t${row.first_response_seconds || 'N/A'}\t\t` +
        `${row.message_count}\t${row.status}\t${reason}\t${row.reopen_count}`
      );
    });
    
    console.log();
    console.log('='.repeat(80));
    console.log('✅ 分析完成');
    console.log('='.repeat(80));

  } catch (error) {
    console.error('❌ 分析失败:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

runAnalysis().catch(console.error);
