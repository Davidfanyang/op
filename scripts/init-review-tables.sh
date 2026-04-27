#!/bin/bash

# 执行 schema.sql 创建数据表
# 用法: ./scripts/init-review-tables.sh

echo "========== 初始化审核流数据表 =========="

# 读取 .env 文件中的 MySQL 配置
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

MYSQL_HOST=${MYSQL_HOST:-localhost}
MYSQL_PORT=${MYSQL_PORT:-3306}
MYSQL_USER=${MYSQL_USER:-root}
MYSQL_PASSWORD=${MYSQL_PASSWORD:-}
MYSQL_DATABASE=${MYSQL_DATABASE:-trainer_core}

echo "MySQL 配置:"
echo "  Host: $MYSQL_HOST"
echo "  Port: $MYSQL_PORT"
echo "  User: $MYSQL_USER"
echo "  Database: $MYSQL_DATABASE"
echo ""

# 执行 schema.sql 中的 suggestions 和 reviews 表创建语句
echo "创建 suggestions 表..."
mysql -h $MYSQL_HOST -P $MYSQL_PORT -u $MYSQL_USER -p$MYSQL_PASSWORD $MYSQL_DATABASE <<EOF

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
  
  -- 固定值字段
  source_type VARCHAR(32) NOT NULL DEFAULT 'unknown_auto_generated' COMMENT '来源类型（固定 unknown_auto_generated）',
  status VARCHAR(32) NOT NULL DEFAULT 'active' COMMENT '记录状态（固定 active）',
  review_status VARCHAR(32) NOT NULL DEFAULT 'pending_review' COMMENT '审核状态（pending_review/approved/modified_approved/rejected）',
  
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='建议答案表';

EOF

if [ $? -eq 0 ]; then
    echo "✓ suggestions 表创建成功"
else
    echo "✗ suggestions 表创建失败"
    exit 1
fi

echo ""
echo "创建 reviews 表..."
mysql -h $MYSQL_HOST -P $MYSQL_PORT -u $MYSQL_USER -p$MYSQL_PASSWORD $MYSQL_DATABASE <<EOF

CREATE TABLE IF NOT EXISTS reviews (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  review_id VARCHAR(64) NOT NULL COMMENT '审核唯一ID',
  suggestion_id VARCHAR(64) NOT NULL COMMENT '对应 suggestion',
  evaluation_id VARCHAR(64) NOT NULL COMMENT '对应 live_evaluation',
  session_id VARCHAR(128) NOT NULL COMMENT '对应 live_session',
  
  -- 审核动作与结果
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='主管审核表';

EOF

if [ $? -eq 0 ]; then
    echo "✓ reviews 表创建成功"
else
    echo "✗ reviews 表创建失败"
    exit 1
fi

echo ""
echo "========== 数据表初始化完成 =========="
echo ""
echo "已创建的表："
mysql -h $MYSQL_HOST -P $MYSQL_PORT -u $MYSQL_USER -p$MYSQL_PASSWORD $MYSQL_DATABASE -e "SHOW TABLES LIKE 'suggestions'; SHOW TABLES LIKE 'reviews';"
