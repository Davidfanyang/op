/**
 * 初始化审核流数据表（Node.js 版本）
 * 
 * 用法: node scripts/init-review-tables.js
 */

const { getPool } = require('../infrastructure/persistence/mysql/mysql-pool');

async function initTables() {
  console.log('========== 初始化审核流数据表 ==========\n');
  
  const pool = getPool();
  
  try {
    await pool.connect();
    console.log('✓ MySQL 连接成功\n');
  } catch (error) {
    console.error('✗ MySQL 连接失败:', error.message);
    console.log('\n请检查 .env 文件中的 MySQL 配置');
    process.exit(1);
  }

  try {
    // 1. 创建 suggestions 表
    console.log('创建 suggestions 表...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS suggestions (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        suggestion_id VARCHAR(64) NOT NULL COMMENT '建议答案唯一ID',
        project_id VARCHAR(64) NOT NULL COMMENT '项目ID',
        session_id VARCHAR(128) NOT NULL COMMENT '所属实时会话 ID',
        message_id VARCHAR(64) NOT NULL COMMENT '触发消息 ID',
        evaluation_id VARCHAR(64) NOT NULL COMMENT '关联 evaluation 主键（唯一约束）',
        entry_source VARCHAR(32) NOT NULL DEFAULT 'live_monitor' COMMENT '触发来源',
        agent_id VARCHAR(64) NULL COMMENT '客服或操作人 ID',
        scenario VARCHAR(128) NULL COMMENT '场景名',
        suggested_reply TEXT NOT NULL COMMENT '建议答案正文',
        
        source_type VARCHAR(32) NOT NULL DEFAULT 'unknown_auto_generated' COMMENT '来源类型',
        status VARCHAR(32) NOT NULL DEFAULT 'active' COMMENT '记录状态',
        review_status VARCHAR(32) NOT NULL DEFAULT 'pending_review' COMMENT '审核状态',
        
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uk_suggestion_id (suggestion_id),
        UNIQUE KEY uk_evaluation_id (evaluation_id),
        KEY idx_project_id (project_id),
        KEY idx_session_id (session_id),
        KEY idx_review_status (review_status),
        KEY idx_source_type (source_type),
        KEY idx_status (status),
        KEY idx_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='建议答案表'
    `);
    console.log('✓ suggestions 表创建成功\n');

    // 2. 创建 reviews 表
    console.log('创建 reviews 表...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS reviews (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        review_id VARCHAR(64) NOT NULL COMMENT '审核唯一ID',
        suggestion_id VARCHAR(64) NOT NULL COMMENT '对应 suggestion',
        evaluation_id VARCHAR(64) NOT NULL COMMENT '对应 live_evaluation',
        session_id VARCHAR(128) NOT NULL COMMENT '对应 live_session',
        
        review_action VARCHAR(32) NOT NULL COMMENT '审核动作: approve/modify_and_approve/reject',
        original_reply TEXT NOT NULL COMMENT 'suggestion 原始内容',
        final_reply TEXT NULL COMMENT '审核后的最终内容',
        review_note TEXT NULL COMMENT '审核备注',
        reviewer_id VARCHAR(64) NOT NULL COMMENT '审核人',
        
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uk_review_id (review_id),
        UNIQUE KEY uk_suggestion_id (suggestion_id),
        KEY idx_evaluation_id (evaluation_id),
        KEY idx_session_id (session_id),
        KEY idx_review_action (review_action),
        KEY idx_reviewer_id (reviewer_id),
        KEY idx_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='主管审核表'
    `);
    console.log('✓ reviews 表创建成功\n');

    // 3. 检查表结构
    console.log('检查表结构...');
    
    const [suggestionsCols] = await pool.query(`
      SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_KEY
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'suggestions'
      ORDER BY ORDINAL_POSITION
    `);
    
    console.log('\nsuggestions 表字段:');
    suggestionsCols.forEach(col => {
      console.log(`  - ${col.COLUMN_NAME} (${col.COLUMN_TYPE}) ${col.IS_NULLABLE === 'YES' ? 'NULL' : 'NOT NULL'} ${col.COLUMN_KEY ? '[' + col.COLUMN_KEY + ']' : ''}`);
    });

    const [reviewsCols] = await pool.query(`
      SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_KEY
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reviews'
      ORDER BY ORDINAL_POSITION
    `);
    
    console.log('\nreviews 表字段:');
    reviewsCols.forEach(col => {
      console.log(`  - ${col.COLUMN_NAME} (${col.COLUMN_TYPE}) ${col.IS_NULLABLE === 'YES' ? 'NULL' : 'NOT NULL'} ${col.COLUMN_KEY ? '[' + col.COLUMN_KEY + ']' : ''}`);
    });

    // 4. 检查唯一约束
    console.log('\n检查唯一约束...');
    const [constraints] = await pool.query(`
      SELECT CONSTRAINT_NAME, COLUMN_NAME
      FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'reviews' 
        AND CONSTRAINT_NAME LIKE 'uk_%'
      ORDER BY CONSTRAINT_NAME, ORDINAL_POSITION
    `);
    
    console.log('\nreviews 表唯一约束:');
    constraints.forEach(c => {
      console.log(`  - ${c.CONSTRAINT_NAME}: ${c.COLUMN_NAME}`);
    });

    console.log('\n========== 数据表初始化完成 ==========\n');
    console.log('✅ suggestions 表已创建');
    console.log('✅ reviews 表已创建');
    console.log('✅ reviews.suggestion_id 唯一约束已创建');
    console.log('\n可以执行 MySQL 测试:');
    console.log('  node tests/test-review-flow-mysql.js\n');

  } catch (error) {
    console.error('\n✗ 数据表初始化失败:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await pool.close();
  }
}

initTables();
