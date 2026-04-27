#!/usr/bin/env node
/**
 * 筛选高价值会话样本
 * 
 * 从 conversations 表中筛选 5 类高价值样本：
 * 1. SLA 超时
 * 2. 多轮沟通
 * 3. 客户说话多
 * 4. 重开会话
 * 5. 无效会话
 */

const mysql = require('mysql2/promise');

// 数据库配置
const DB_CONFIG = {
  host: process.env.MYSQL_HOST || 'localhost',
  port: parseInt(process.env.MYSQL_PORT || '3306'),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'pai_dashboard'  // 使用 pai_dashboard
};

// 高价值筛选条件
const HIGH_VALUE_FILTERS = [
  // SLA超时
  "first_response_sla_breached = 1",
  // 多轮沟通
  "message_count > 10",
  // 客户说话多
  "customer_message_count > cs_message_count",
  // 重开
  "reopen_count > 0",
  // 无效会话
  "is_valid = 0"
];

/**
 * 筛选高价值会话
 */
async function filterConversations(limit = 50) {
  const pool = mysql.createPool(DB_CONFIG);
  
  try {
    // 检查表是否存在
    const [tables] = await pool.query(
      "SHOW TABLES LIKE 'conversations'"
    );
    
    if (tables.length === 0) {
      throw new Error(`数据库 ${DB_CONFIG.database} 中不存在 conversations 表`);
    }
    
    console.log('='.repeat(70));
    console.log('筛选高价值会话样本');
    console.log('='.repeat(70));
    console.log(`数据库: ${DB_CONFIG.database}`);
    console.log(`筛选条件: ${HIGH_VALUE_FILTERS.length} 类`);
    console.log(`目标样本数: ${limit}`);
    console.log('');
    
    // 构建 SQL
    const whereClause = HIGH_VALUE_FILTERS.join('\n  OR ');
    const sql = `
      SELECT 
        id as conversation_id,
        agent_tag,
        status,
        is_valid,
        message_count,
        customer_message_count,
        cs_message_count,
        first_response_sla_breached,
        reopen_count,
        first_response_seconds,
        start_time as created_at
      FROM conversations
      WHERE
        ${whereClause}
      LIMIT ${limit}
    `;
    
    console.log('执行 SQL:');
    console.log(sql);
    console.log('');
    
    const [rows] = await pool.query(sql);
    
    console.log(`筛选结果: ${rows.length} 条\n`);
    
    // 转换为 shadow 需要的格式
    const samples = rows.map(conv => ({
      conversation_id: conv.conversation_id,
      agent_tag: conv.agent_tag,
      scenario: mapScenario(conv),
      entrySource: 'training',
      taskType: 'quality_evaluation',
      // 保留原始数据用于分析
      _raw: {
        message_count: conv.message_count,
        first_response_sla_breached: conv.first_response_sla_breached,
        reopen_count: conv.reopen_count,
        is_valid: conv.is_valid,
        first_response_seconds: conv.first_response_seconds
      }
    }));
    
    // 统计分布
    const stats = {
      total: samples.length,
      by_scenario: {},
      by_filter: {
        sla_breached: 0,
        multi_turn: 0,
        customer_talks_more: 0,
        reopened: 0,
        invalid: 0
      }
    };
    
    samples.forEach(s => {
      // 场景分布
      stats.by_scenario[s.scenario] = (stats.by_scenario[s.scenario] || 0) + 1;
      
      // 筛选条件分布
      if (s._raw.first_response_sla_breached) stats.by_filter.sla_breached++;
      if (s._raw.message_count > 10) stats.by_filter.multi_turn++;
      if (s._raw.first_response_seconds > 60) stats.by_filter.customer_talks_more++;
      if (s._raw.reopen_count > 0) stats.by_filter.reopened++;
      if (s._raw.is_valid === 0) stats.by_filter.invalid++;
    });
    
    console.log('样本分布:');
    console.log('─'.repeat(70));
    console.log('场景分布:');
    Object.entries(stats.by_scenario).forEach(([scenario, count]) => {
      console.log(`  ${scenario}: ${count}`);
    });
    console.log('');
    console.log('筛选条件分布:');
    console.log(`  SLA超时: ${stats.by_filter.sla_breached}`);
    console.log(`  多轮沟通: ${stats.by_filter.multi_turn}`);
    console.log(`  客户说话多: ${stats.by_filter.customer_talks_more}`);
    console.log(`  重开会话: ${stats.by_filter.reopened}`);
    console.log(`  无效会话: ${stats.by_filter.invalid}`);
    console.log('');
    
    // 输出 JSON
    const outputPath = './scripts/output/conversations-samples.json';
    const fs = require('fs');
    const path = require('path');
    
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    fs.writeFileSync(outputPath, JSON.stringify(samples, null, 2));
    console.log(`样本已保存至: ${outputPath}`);
    console.log('');
    
    return samples;
    
  } finally {
    await pool.end();
  }
}

/**
 * 场景映射（核心逻辑）
 */
function mapScenario(conv) {
  if (conv.first_response_sla_breached) return 'service_response_poor';
  if (conv.reopen_count > 0) return 'service_response_poor';
  if (conv.is_valid === 0) return 'info_missing';
  if (conv.message_count > 10) return 'complex_case';
  return 'transfer_not_received';
}

// 执行
if (require.main === module) {
  const limit = parseInt(process.argv[2] || '50', 10);
  filterConversations(limit)
    .then(samples => {
      console.log('='.repeat(70));
      console.log(`✅ 筛选完成: ${samples.length} 条样本`);
      console.log('='.repeat(70));
    })
    .catch(error => {
      console.error('❌ 筛选失败:', error.message);
      process.exit(1);
    });
}

module.exports = { filterConversations, mapScenario };
