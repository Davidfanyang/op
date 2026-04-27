#!/usr/bin/env node
/**
 * 历史会话元数据导入脚本
 * 
 * 用途: 从 conversations.sql 导入历史会话元数据到 historical_conversations 表
 * 
 * 特性:
 * - 只导入元数据，不创建 placeholder 消息
 * - 保留完整的原始字段，保证可追溯
 * - 小批量导入验证（默认50条）
 * - 不进入训练/审核/FAQ主链路
 * 
 * 用法:
 *   node scripts/import-historical-conversations.js [limit]
 *   node scripts/import-historical-conversations.js 50  # 导入50条
 *   node scripts/import-historical-conversations.js     # 默认50条
 */

const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

// ============================================
// 配置
// ============================================

const SQL_FILE = process.env.HISTORICAL_SQL_FILE 
  || '/Users/adime/Desktop/conversations.sql';

const LIMIT = parseInt(process.argv[2] || process.env.IMPORT_LIMIT || '50');

const DB_CONFIG = {
  host: process.env.MYSQL_HOST || 'localhost',
  port: parseInt(process.env.MYSQL_PORT || '3306'),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'trainer_core',
};

const IMPORT_BATCH = `batch_${Date.now()}`;

// ============================================
// 工具函数
// ============================================

/**
 * 解析 SQL 文件中的 INSERT 语句
 * 使用更简单的方法：直接提取 VALUES 部分
 */
function parseInsertStatements(sqlContent, tableName) {
  const records = [];
  
  // 找到 INSERT INTO 语句
  const tablePattern = 'INSERT INTO `' + tableName + '`';
  let pos = 0;
  
  while (true) {
    const insertPos = sqlContent.indexOf(tablePattern, pos);
    if (insertPos === -1) break;
    
    // 找到列定义
    const colStart = sqlContent.indexOf('(', insertPos);
    const colEnd = sqlContent.indexOf(')', colStart);
    const columnsStr = sqlContent.substring(colStart + 1, colEnd);
    const columns = columnsStr.split(',').map(c => c.trim().replace(/`/g, ''));
    
    // 找到 VALUES
    const valuesStart = sqlContent.indexOf('VALUES', colEnd);
    const parenStart = sqlContent.indexOf('(', valuesStart);
    
    // 找到匹配的闭合括号（处理嵌套和引号）
    let depth = 0;
    let inString = false;
    let escapeNext = false;
    let parenEnd = -1;
    
    for (let i = parenStart; i < sqlContent.length; i++) {
      const char = sqlContent[i];
      
      if (escapeNext) {
        escapeNext = false;
        continue;
      }
      
      if (char === '\\') {
        escapeNext = true;
        continue;
      }
      
      if (char === "'") {
        inString = !inString;
        continue;
      }
      
      if (!inString) {
        if (char === '(') depth++;
        if (char === ')') {
          depth--;
          if (depth === 0) {
            parenEnd = i;
            break;
          }
        }
      }
    }
    
    if (parenEnd === -1) break;
    
    const valuesStr = sqlContent.substring(parenStart + 1, parenEnd);
    const values = parseValues(valuesStr);
    
    if (columns.length === values.length) {
      const record = {};
      columns.forEach((col, idx) => {
        record[col] = values[idx];
      });
      records.push(record);
    }
    
    pos = parenEnd + 1;
  }
  
  return records;
}

/**
 * 解析 SQL VALUES 字符串
 * 处理: NULL, 数字, '字符串'（包括转义）
 */
function parseValues(valuesStr) {
  const values = [];
  let current = '';
  let inString = false;
  let escapeNext = false;
  
  for (let i = 0; i < valuesStr.length; i++) {
    const char = valuesStr[i];
    
    if (escapeNext) {
      current += char;
      escapeNext = false;
      continue;
    }
    
    if (char === '\\') {
      escapeNext = true;
      current += char;
      continue;
    }
    
    if (char === "'") {
      inString = !inString;
      current += char;
      continue;
    }
    
    if (char === ',' && !inString) {
      values.push(parseValue(current.trim()));
      current = '';
      continue;
    }
    
    current += char;
  }
  
  // 最后一个值
  if (current.trim()) {
    values.push(parseValue(current.trim()));
  }
  
  return values;
}

/**
 * 解析单个 SQL 值
 */
function parseValue(val) {
  if (val === 'NULL') {
    return null;
  }
  
  // 字符串（去掉引号）
  if (val.startsWith("'") && val.endsWith("'")) {
    return val.slice(1, -1).replace(/\\'/g, "'");
  }
  
  // 数字
  const num = Number(val);
  if (!isNaN(num)) {
    return num;
  }
  
  return val;
}

/**
 * 连接到数据库
 */
async function connectDB() {
  console.log(`\n连接数据库: ${DB_CONFIG.host}:${DB_CONFIG.port}/${DB_CONFIG.database}`);
  const connection = await mysql.createConnection(DB_CONFIG);
  console.log('✓ 数据库连接成功\n');
  return connection;
}

/**
 * 创建 historical_conversations 表
 */
async function createTable(connection) {
  console.log('创建 historical_conversations 表...');
  
  const schemaSQL = fs.readFileSync(
    path.join(__dirname, '../infrastructure/persistence/mysql/schema-historical-conversations.sql'),
    'utf8'
  );
  
  await connection.query(schemaSQL);
  console.log('✓ 表创建成功（或已存在）\n');
}

/**
 * 获取当前表中的记录数
 */
async function getCount(connection) {
  const [rows] = await connection.query(
    'SELECT COUNT(*) as count FROM historical_conversations'
  );
  return rows[0].count;
}

/**
 * 导入记录到 historical_conversations
 */
async function importRecords(connection, records, batchId) {
  console.log(`开始导入 ${records.length} 条记录 (批次: ${batchId})...\n`);
  
  const insertSQL = `
    INSERT INTO historical_conversations (
      original_id,
      original_table,
      source_file,
      user_id,
      chat_id,
      peer_access_hash,
      cs_account_identifier,
      status,
      start_time,
      end_time,
      closed_at,
      agent_tag,
      agent_confidence,
      assigned_operator_id,
      closed_by_operator_id,
      message_count,
      customer_message_count,
      cs_message_count,
      is_long,
      first_response_seconds,
      first_response_override_seconds,
      first_response_override_note,
      first_response_override_at,
      first_response_sla_breached,
      open_anchor_msg_id,
      open_anchor_time,
      start_customer_anchor_msg_id,
      start_customer_anchor_time,
      close_anchor_msg_id,
      close_anchor_time,
      previous_conversation_id,
      reopen_count,
      is_valid,
      invalid_reason,
      response_metrics_calculated,
      import_batch,
      original_created_at,
      original_updated_at
    ) VALUES ?
  `;
  
  const values = records.map(r => [
    r.id,                                    // original_id
    'conversations',                         // original_table
    'conversations.sql',                     // source_file
    r.user_id,
    r.chat_id,
    r.peer_access_hash,
    r.cs_account_identifier,
    r.status,
    r.start_time,
    r.end_time,
    r.closed_at,
    r.agent_tag,
    r.agent_confidence,
    r.assigned_operator_id,
    r.closed_by_operator_id,
    r.message_count,
    r.customer_message_count,
    r.cs_message_count,
    r.is_long,
    r.first_response_seconds,
    r.first_response_override_seconds,
    r.first_response_override_note,
    r.first_response_override_at,
    r.first_response_sla_breached,
    r.open_anchor_msg_id,
    r.open_anchor_time,
    r.start_customer_anchor_msg_id,
    r.start_customer_anchor_time,
    r.close_anchor_msg_id,
    r.close_anchor_time,
    r.previous_conversation_id,
    r.reopen_count,
    r.is_valid,
    r.invalid_reason,
    r.response_metrics_calculated,
    batchId,                                 // import_batch
    r.created_at,                            // original_created_at
    r.updated_at                             // original_updated_at
  ]);
  
  await connection.query(insertSQL, [values]);
  console.log(`✓ 成功导入 ${records.length} 条记录\n`);
}

/**
 * 随机抽样展示
 */
async function showSamples(connection, count = 3) {
  console.log(`\n随机抽样 ${count} 条记录:\n`);
  console.log('='.repeat(80));
  
  const [rows] = await connection.query(`
    SELECT 
      id,
      original_id,
      user_id,
      chat_id,
      agent_tag,
      status,
      message_count,
      customer_message_count,
      cs_message_count,
      start_time,
      end_time,
      import_batch,
      imported_at
    FROM historical_conversations
    ORDER BY RAND()
    LIMIT ?
  `, [count]);
  
  rows.forEach((row, idx) => {
    console.log(`\n【样本 ${idx + 1}】`);
    console.log(`  系统ID:              ${row.id}`);
    console.log(`  原始ID:              ${row.original_id}`);
    console.log(`  用户ID:              ${row.user_id}`);
    console.log(`  Chat ID:             ${row.chat_id}`);
    console.log(`  客服标签:            ${row.agent_tag || '(无)'}`);
    console.log(`  状态:                ${row.status}`);
    console.log(`  消息统计:            总${row.message_count} / 客户${row.customer_message_count} / 客服${row.cs_message_count}`);
    console.log(`  开始时间:            ${row.start_time}`);
    console.log(`  结束时间:            ${row.end_time || '(未结束)'}`);
    console.log(`  导入批次:            ${row.import_batch}`);
    console.log(`  导入时间:            ${row.imported_at}`);
  });
  
  console.log('\n' + '='.repeat(80));
}

/**
 * 统计信息
 */
async function showStatistics(connection) {
  console.log('\n导入统计:\n');
  
  // 总数
  const [totalRows] = await connection.query(
    'SELECT COUNT(*) as count FROM historical_conversations'
  );
  console.log(`  总记录数:            ${totalRows[0].count}`);
  
  // 按状态
  const [statusRows] = await connection.query(`
    SELECT status, COUNT(*) as count 
    FROM historical_conversations 
    GROUP BY status
  `);
  console.log('\n  按状态分布:');
  statusRows.forEach(row => {
    console.log(`    ${row.status}: ${row.count}`);
  });
  
  // 按客服
  const [agentRows] = await connection.query(`
    SELECT agent_tag, COUNT(*) as count 
    FROM historical_conversations 
    WHERE agent_tag IS NOT NULL
    GROUP BY agent_tag
    ORDER BY count DESC
    LIMIT 10
  `);
  console.log('\n  按客服分布 (TOP 10):');
  agentRows.forEach(row => {
    console.log(`    ${row.agent_tag}: ${row.count}`);
  });
  
  // 消息统计
  const [msgStats] = await connection.query(`
    SELECT 
      AVG(message_count) as avg_msgs,
      MAX(message_count) as max_msgs,
      MIN(message_count) as min_msgs,
      SUM(message_count) as total_msgs
    FROM historical_conversations
  `);
  console.log('\n  消息统计:');
  console.log(`    平均消息数:        ${parseFloat(msgStats[0].avg_msgs).toFixed(1)}`);
  console.log(`    最大消息数:        ${msgStats[0].max_msgs}`);
  console.log(`    最小消息数:        ${msgStats[0].min_msgs}`);
  console.log(`    总消息数:          ${msgStats[0].total_msgs}`);
  
  // 有效性
  const [validRows] = await connection.query(`
    SELECT is_valid, COUNT(*) as count 
    FROM historical_conversations 
    GROUP BY is_valid
  `);
  console.log('\n  数据有效性:');
  validRows.forEach(row => {
    console.log(`    ${row.is_valid ? '有效' : '无效'}: ${row.count}`);
  });
}

// ============================================
// 主流程
// ============================================

async function main() {
  console.log('='.repeat(80));
  console.log('历史会话元数据导入脚本');
  console.log('='.repeat(80));
  console.log(`SQL 文件:  ${SQL_FILE}`);
  console.log(`导入限制:  ${LIMIT} 条`);
  console.log(`导入批次:  ${IMPORT_BATCH}`);
  
  let connection;
  
  try {
    // 1. 连接数据库
    connection = await connectDB();
    
    // 2. 创建表
    await createTable(connection);
    
    // 3. 获取导入前数量
    const countBefore = await getCount(connection);
    console.log(`导入前记录数: ${countBefore}\n`);
    
    // 4. 解析 SQL 文件
    console.log(`解析 SQL 文件: ${SQL_FILE}`);
    const sqlContent = fs.readFileSync(SQL_FILE, 'utf8');
    const allRecords = parseInsertStatements(sqlContent, 'conversations');
    console.log(`✓ 解析完成，共 ${allRecords.length} 条记录\n`);
    
    // 5. 截取前 LIMIT 条
    const recordsToImport = allRecords.slice(0, LIMIT);
    console.log(`将导入前 ${recordsToImport.length} 条记录\n`);
    
    // 6. 导入数据
    await importRecords(connection, recordsToImport, IMPORT_BATCH);
    
    // 7. 获取导入后数量
    const countAfter = await getCount(connection);
    console.log(`导入后记录数: ${countAfter}`);
    console.log(`实际新增:     ${countAfter - countBefore} 条\n`);
    
    // 8. 展示样本
    await showSamples(connection, 3);
    
    // 9. 展示统计
    await showStatistics(connection);
    
    // 10. 最终结论
    console.log('\n' + '='.repeat(80));
    console.log('最终结论');
    console.log('='.repeat(80));
    console.log(`
✅ 小批量导入成功 (导入 ${countAfter - countBefore} 条记录)

📊 数据定位:
   - 当前数据为"历史会话元数据层"
   - 仅包含会话级别的统计信息
   - ❌ 不包含消息内容
   - ❌ 不能进入训练闭环
   - ❌ 不能进入审核闭环
   - ❌ 不能进入 FAQ 注入

🔧 后续可选操作:
   1. 如有配套消息 SQL，可导入到 historical_messages 表
   2. 可将元数据作为索引池，关联其他系统获取完整数据
   3. 可用于统计分析（客服绩效、响应时间等）

⚠️  限制说明:
   - 此表不参与 live_sessions / live_messages 质检链路
   - 此表不参与 training_sessions / training_messages 训练链路
   - 此表仅作为历史数据的元数据索引和统计用途
    `);
    
    console.log('='.repeat(80));
    console.log('导入完成 ✓');
    console.log('='.repeat(80) + '\n');
    
  } catch (error) {
    console.error('\n❌ 导入失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('数据库连接已关闭\n');
    }
  }
}

// 运行
main();
