-- ============================================================
-- trainer-core 第4阶段数据表设计（MySQL版）
-- 支撑链路: live_monitor → evaluation → review item → supervisor submitReview → evaluation回写
-- ============================================================

-- 1. projects 项目表
-- 项目隔离的第一维度
CREATE TABLE IF NOT EXISTS projects (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id VARCHAR(64) NOT NULL COMMENT '项目唯一标识',
  project_name VARCHAR(128) NOT NULL COMMENT '项目名称',
  status VARCHAR(32) NOT NULL DEFAULT 'active' COMMENT '状态: active/inactive/archived',
  channel_config_json JSON NULL COMMENT '渠道配置JSON',
  bot_config_json JSON NULL COMMENT 'Bot配置JSON',
  scoring_profile_json JSON NULL COMMENT '评分配置JSON',
  knowledge_base_ref VARCHAR(128) NULL COMMENT '知识库引用',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_project_id (project_id),
  KEY idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='项目表';

-- 2. sessions 会话主表
CREATE TABLE IF NOT EXISTS sessions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  session_id VARCHAR(64) NOT NULL COMMENT '会话唯一ID',
  project_id VARCHAR(64) NOT NULL COMMENT '项目ID',
  channel VARCHAR(32) NOT NULL COMMENT '渠道: telegram/whatsapp/web',
  mode VARCHAR(32) NOT NULL COMMENT '模式: training/live_monitor/supervisor_review/knowledge_update',
  employee_id VARCHAR(64) NULL COMMENT '客服ID',
  customer_id VARCHAR(64) NULL COMMENT '客户ID',
  source_type VARCHAR(32) NULL COMMENT '来源类型',
  status VARCHAR(32) NOT NULL DEFAULT 'active' COMMENT '状态: active/closed/pending',
  started_at DATETIME NOT NULL COMMENT '会话开始时间',
  ended_at DATETIME NULL COMMENT '会话结束时间',
  metadata_json JSON NULL COMMENT '扩展元数据',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_session_id (session_id),
  KEY idx_project_mode (project_id, mode),
  KEY idx_project_channel (project_id, channel),
  KEY idx_employee (employee_id),
  KEY idx_customer (customer_id),
  KEY idx_status (status),
  KEY idx_started_at (started_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='会话主表';

-- 3. messages 消息表
-- 必须保留原始痕迹
CREATE TABLE IF NOT EXISTS messages (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  message_id VARCHAR(64) NOT NULL COMMENT '消息唯一ID',
  session_id VARCHAR(64) NOT NULL COMMENT '所属会话ID',
  project_id VARCHAR(64) NOT NULL COMMENT '项目ID',
  channel VARCHAR(32) NOT NULL COMMENT '渠道',
  sender_role VARCHAR(32) NOT NULL COMMENT '发送者角色: customer/agent/supervisor/system/bot',
  sender_id VARCHAR(64) NULL COMMENT '发送者ID',
  message_direction VARCHAR(16) NOT NULL COMMENT '方向: inbound/outbound',
  content TEXT NOT NULL COMMENT '消息内容',
  message_type VARCHAR(32) DEFAULT 'text' COMMENT '消息类型: text/image/file',
  raw_payload_json JSON NULL COMMENT '原始payload JSON',
  normalized_intent VARCHAR(128) NULL COMMENT '标准化意图',
  normalized_event VARCHAR(128) NULL COMMENT '标准化事件',
  sent_at DATETIME NOT NULL COMMENT '消息发送时间',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_message_id (message_id),
  KEY idx_session_id (session_id),
  KEY idx_project_channel (project_id, channel),
  KEY idx_sender_id (sender_id),
  KEY idx_sent_at (sent_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='消息表';

-- 4. evaluations AI评估主记录表
CREATE TABLE IF NOT EXISTS evaluations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  evaluation_id VARCHAR(64) NOT NULL COMMENT '评估唯一ID',
  project_id VARCHAR(64) NOT NULL COMMENT '项目ID',
  session_id VARCHAR(64) NOT NULL COMMENT '会话ID',
  message_id VARCHAR(64) NOT NULL COMMENT '消息ID',
  mode VARCHAR(32) NOT NULL COMMENT '模式: training/live_monitor',
  scenario_id VARCHAR(128) NULL COMMENT '场景ID',
  
  -- AI评估核心字段
  status VARCHAR(32) NOT NULL COMMENT '状态: ok/alert_triggered/error',
  evaluation_status VARCHAR(32) NOT NULL COMMENT '评估状态',
  score DECIMAL(5,2) NOT NULL DEFAULT 0.00 COMMENT '总分',
  alert_level VARCHAR(16) NULL COMMENT '告警级别: none/observation/warning/critical',
  match_confidence DECIMAL(5,2) NULL COMMENT '场景匹配置信度',
  
  -- AI输出（JSON字段）
  dimension_scores_json JSON NULL COMMENT '维度得分JSON',
  findings_json JSON NULL COMMENT '发现的问题JSON',
  suggestions_json JSON NULL COMMENT '建议JSON',
  strengths_json JSON NULL COMMENT '优点JSON',
  alerts_json JSON NULL COMMENT '告警列表JSON',
  coach_summary TEXT NULL COMMENT 'AI教练总结',
  standard_reply TEXT NULL COMMENT '标准回复',
  meta_json JSON NULL COMMENT '扩展元数据',
  
  -- 主管复核回写字段
  review_status VARCHAR(32) NOT NULL DEFAULT 'pending' COMMENT '复核状态: pending/reviewed/closed',
  review_decision VARCHAR(32) NULL COMMENT '复核决定: approved/rejected/needs_edit',
  reviewed_by VARCHAR(64) NULL COMMENT '复核人ID',
  reviewed_at DATETIME NULL COMMENT '复核时间',
  final_accepted TINYINT(1) NULL COMMENT '最终是否采纳',
  final_reply_version TEXT NULL COMMENT '最终回复版本',
  
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_evaluation_id (evaluation_id),
  KEY idx_project_mode (project_id, mode),
  KEY idx_project_review_status (project_id, review_status),
  KEY idx_session_id (session_id),
  KEY idx_message_id (message_id),
  KEY idx_review_status (review_status),
  KEY idx_alert_level (alert_level),
  KEY idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='AI评估主记录表';

-- 5. reviews 主管复核主表
CREATE TABLE IF NOT EXISTS reviews (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  review_id VARCHAR(64) NOT NULL COMMENT '复核唯一ID',
  project_id VARCHAR(64) NOT NULL COMMENT '项目ID',
  mode VARCHAR(32) NOT NULL DEFAULT 'live_monitor' COMMENT '模式: training | live_monitor',
  session_id VARCHAR(64) NOT NULL COMMENT '会话ID',
  message_id VARCHAR(64) NOT NULL COMMENT '消息ID',
  evaluation_id VARCHAR(64) NOT NULL COMMENT '评估ID',
  
  channel VARCHAR(32) NOT NULL COMMENT '渠道',
  employee_id VARCHAR(64) NULL COMMENT '客服ID',
  customer_id VARCHAR(64) NULL COMMENT '客户ID',
  alert_level VARCHAR(16) NOT NULL COMMENT '告警级别',
  
  -- 复核状态
  review_status VARCHAR(32) NOT NULL DEFAULT 'pending' COMMENT '状态: pending/reviewed/closed',
  review_decision VARCHAR(32) NULL COMMENT '决定: approved/rejected/needs_edit',
  review_comment TEXT NULL COMMENT '复核意见',
  
  -- 优化回复
  optimized_reply TEXT NULL COMMENT '优化后的回复',
  optimized_reply_approved TINYINT(1) NULL COMMENT '优化回复是否被批准',
  
  -- 采纳结果
  is_adopted TINYINT(1) NULL COMMENT '是否被采纳',
  final_reply_version TEXT NULL COMMENT '最终回复版本',
  
  -- 复核人信息
  reviewed_by VARCHAR(64) NULL COMMENT '复核人ID',
  reviewed_at DATETIME NULL COMMENT '复核时间',
  
  -- 误报标记
  false_positive_reason VARCHAR(255) NULL COMMENT '误报原因',
  
  -- 优先级 (用于工作台排序)
  priority VARCHAR(16) NULL COMMENT '优先级: high/medium/low',
  problem_tags JSON NULL COMMENT '问题标签: ["话术问题","态度问题","流程问题"]',
  
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_review_id (review_id),
  UNIQUE KEY uk_evaluation_id (evaluation_id),
  KEY idx_project_status (project_id, review_status),
  KEY idx_project_alert (project_id, alert_level),
  KEY idx_mode_status (mode, review_status),
  KEY idx_priority_status (priority, review_status),
  KEY idx_employee_status (employee_id, review_status),
  KEY idx_session_id (session_id),
  KEY idx_message_id (message_id),
  KEY idx_reviewed_by (reviewed_by),
  KEY idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='主管复核主表';

-- 6. review_actions 复核动作历史表
-- 用于追溯每次复核操作
CREATE TABLE IF NOT EXISTS review_actions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  action_id VARCHAR(64) NOT NULL COMMENT '动作唯一ID',
  review_id VARCHAR(64) NOT NULL COMMENT '复核ID',
  project_id VARCHAR(64) NOT NULL COMMENT '项目ID',
  action_type VARCHAR(32) NOT NULL COMMENT '动作类型: created/approved/rejected/needs_edit/closed/reopened',
  actor_id VARCHAR(64) NOT NULL COMMENT '执行者ID',
  action_comment TEXT NULL COMMENT '动作备注',
  payload_json JSON NULL COMMENT '动作详细数据',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_action_id (action_id),
  KEY idx_review_id (review_id),
  KEY idx_project_id (project_id),
  KEY idx_actor_id (actor_id),
  KEY idx_action_type (action_type),
  KEY idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='复核动作历史表';

-- ============================================================
-- 初始化默认项目数据
-- ============================================================
INSERT INTO projects (project_id, project_name, status, channel_config_json, bot_config_json, scoring_profile_json)
VALUES ('default', 'Default Project', 'active', '{}', '{}', '{}')
ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP;
