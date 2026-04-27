-- ============================================================
-- historical_conversations 历史会话元数据表
-- 用途: 存储从外部系统导入的历史会话元数据
-- 特点: 
--   1. 只保存元数据，不保存消息内容
--   2. 保留完整的原始字段，保证可追溯
--   3. 作为历史数据索引池，不进入训练/审核主链路
-- ============================================================

CREATE TABLE IF NOT EXISTS historical_conversations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '系统主键',
  
  -- 原始数据引用（可追溯）
  original_id BIGINT NOT NULL COMMENT '原始conversations表的主键ID',
  original_table VARCHAR(64) NOT NULL DEFAULT 'conversations' COMMENT '原始表名',
  source_file VARCHAR(256) NOT NULL DEFAULT 'conversations.sql' COMMENT '来源SQL文件',
  
  -- 会话标识
  user_id BIGINT NOT NULL COMMENT '原始用户ID',
  chat_id BIGINT NULL COMMENT 'Telegram chat ID',
  peer_access_hash BIGINT NULL COMMENT 'Telegram peer access hash',
  cs_account_identifier VARCHAR(50) NOT NULL COMMENT '客服账号标识 (如: TG_CS_MAIN)',
  
  -- 会话状态与时间
  status VARCHAR(20) NOT NULL DEFAULT 'open' COMMENT '会话状态: open/closed',
  start_time DATETIME NOT NULL COMMENT '会话开始时间',
  end_time DATETIME NULL COMMENT '会话结束时间',
  closed_at DATETIME NULL COMMENT '关闭时间',
  
  -- 客服信息
  agent_tag VARCHAR(50) NULL COMMENT '客服标签 (如: 艾斯/乐多/小美)',
  agent_confidence DECIMAL(6,4) NULL COMMENT '客服置信度',
  assigned_operator_id BIGINT NULL COMMENT '分配的操作员ID',
  closed_by_operator_id BIGINT NULL COMMENT '关闭会话的操作员ID',
  
  -- 消息统计
  message_count INT NOT NULL DEFAULT 0 COMMENT '总消息数',
  customer_message_count INT NOT NULL DEFAULT 0 COMMENT '客户消息数',
  cs_message_count INT NOT NULL DEFAULT 0 COMMENT '客服消息数',
  is_long TINYINT NOT NULL DEFAULT 0 COMMENT '是否长会话: 0=否, 1=是',
  
  -- 首次响应指标
  first_response_seconds INT NULL COMMENT '首次响应秒数',
  first_response_override_seconds INT NULL COMMENT '覆盖的首次响应秒数',
  first_response_override_note VARCHAR(255) NULL COMMENT '覆盖说明',
  first_response_override_at DATETIME NULL COMMENT '覆盖时间',
  first_response_sla_breached TINYINT NOT NULL DEFAULT 0 COMMENT 'SLA是否 breached',
  
  -- 锚点消息引用
  open_anchor_msg_id BIGINT NULL COMMENT '开场锚点消息ID',
  open_anchor_time DATETIME NULL COMMENT '开场锚点时间',
  start_customer_anchor_msg_id BIGINT NULL COMMENT '客户起始锚点消息ID',
  start_customer_anchor_time DATETIME NULL COMMENT '客户起始锚点时间',
  close_anchor_msg_id BIGINT NULL COMMENT '关闭锚点消息ID',
  close_anchor_time DATETIME NULL COMMENT '关闭锚点时间',
  
  -- 会话关联
  previous_conversation_id BIGINT NULL COMMENT '前一个会话ID（会话关联）',
  reopen_count INT NOT NULL DEFAULT 0 COMMENT '重开次数',
  
  -- 数据质量
  is_valid TINYINT NOT NULL DEFAULT 1 COMMENT '是否有效: 0=无效, 1=有效',
  invalid_reason VARCHAR(255) NULL COMMENT '无效原因',
  
  -- 响应指标计算状态
  response_metrics_calculated TINYINT NOT NULL DEFAULT 0 COMMENT '响应指标是否已计算',
  
  -- 导入元数据
  imported_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '导入时间',
  import_batch VARCHAR(64) NULL COMMENT '导入批次标识',
  
  -- 原始时间戳
  original_created_at DATETIME NOT NULL COMMENT '原始created_at',
  original_updated_at DATETIME NOT NULL COMMENT '原始updated_at',
  
  PRIMARY KEY (id),
  UNIQUE KEY uk_original_id (original_id),
  KEY idx_user_id (user_id),
  KEY idx_chat_id (chat_id),
  KEY idx_status (status),
  KEY idx_agent_tag (agent_tag),
  KEY idx_start_time (start_time),
  KEY idx_is_valid (is_valid),
  KEY idx_imported_at (imported_at),
  KEY idx_import_batch (import_batch)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci 
COMMENT='历史会话元数据表（外部导入，仅元数据层）';
