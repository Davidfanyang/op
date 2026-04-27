/**
 * 验证训练记录数据库表是否已创建
 */

require('dotenv').config();

const { getPool } = require('../infrastructure/persistence/mysql/mysql-pool');

async function verifyTables() {
  console.log('='.repeat(60));
  console.log('验证训练记录数据表');
  console.log('='.repeat(60));

  const pool = getPool();

  try {
    // 连接MySQL
    await pool.connect();
    console.log('\n✓ MySQL连接成功');

    // 检查 training_sessions 表
    console.log('\n[检查 1] training_sessions 表');
    const [sessionsExists] = await pool.query(
      "SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'training_sessions'"
    );
    
    if (sessionsExists[0].count > 0) {
      console.log('✓ training_sessions 表已存在');
      
      // 查询表结构
      const [columns] = await pool.query(
        "SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'training_sessions' ORDER BY ORDINAL_POSITION"
      );
      console.log('  表字段:');
      columns.forEach(col => {
        console.log(`    - ${col.COLUMN_NAME} (${col.COLUMN_TYPE}) ${col.IS_NULLABLE === 'YES' ? 'NULL' : 'NOT NULL'}`);
      });
    } else {
      console.log('✗ training_sessions 表不存在，需要执行 schema.sql 创建');
    }

    // 检查 training_messages 表
    console.log('\n[检查 2] training_messages 表');
    const [messagesExists] = await pool.query(
      "SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'training_messages'"
    );
    
    if (messagesExists[0].count > 0) {
      console.log('✓ training_messages 表已存在');
      
      const [columns] = await pool.query(
        "SELECT COLUMN_NAME, COLUMN_TYPE FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'training_messages' ORDER BY ORDINAL_POSITION"
      );
      console.log('  表字段:');
      columns.forEach(col => {
        console.log(`    - ${col.COLUMN_NAME} (${col.COLUMN_TYPE})`);
      });
    } else {
      console.log('✗ training_messages 表不存在，需要执行 schema.sql 创建');
    }

    // 检查 training_round_results 表
    console.log('\n[检查 3] training_round_results 表');
    const [resultsExists] = await pool.query(
      "SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'training_round_results'"
    );
    
    if (resultsExists[0].count > 0) {
      console.log('✓ training_round_results 表已存在');
      
      const [columns] = await pool.query(
        "SELECT COLUMN_NAME, COLUMN_TYPE FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'training_round_results' ORDER BY ORDINAL_POSITION"
      );
      console.log('  表字段:');
      columns.forEach(col => {
        console.log(`    - ${col.COLUMN_NAME} (${col.COLUMN_TYPE})`);
      });
    } else {
      console.log('✗ training_round_results 表不存在，需要执行 schema.sql 创建');
    }

    console.log('\n' + '='.repeat(60));
    console.log('验证完成');
    console.log('='.repeat(60));

    // 如果表不存在，提供创建指令
    if (sessionsExists[0].count === 0 || messagesExists[0].count === 0 || resultsExists[0].count === 0) {
      console.log('\n📋 请使用以下命令创建表:');
      console.log('mysql -u root -p trainer_core < infrastructure/persistence/mysql/schema.sql');
    }

  } catch (error) {
    console.error('\n❌ 验证失败:', error.message);
    console.error('请检查:');
    console.error('1. MySQL 是否已启动');
    console.error('2. .env 中的 MySQL 配置是否正确');
    console.error('3. 数据库 trainer_core 是否已创建');
    process.exit(1);
  } finally {
    await pool.close();
  }
}

verifyTables();
