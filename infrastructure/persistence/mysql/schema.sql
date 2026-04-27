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

-- 5. reviews 主管审核/复核统一表
-- 用于保存 suggestion 审核结果和 evaluation 复核结果
CREATE TABLE IF NOT EXISTS reviews (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  review_id VARCHAR(64) NOT NULL COMMENT '审核/复核唯一ID',
  project_id VARCHAR(64) NOT NULL COMMENT '项目ID',
  mode VARCHAR(32) NOT NULL DEFAULT 'live_monitor' COMMENT '模式: training | live_monitor',
  session_id VARCHAR(128) NOT NULL COMMENT '会话ID',
  message_id VARCHAR(64) NOT NULL COMMENT '消息ID',
  evaluation_id VARCHAR(64) NOT NULL COMMENT '评估ID',
  suggestion_id VARCHAR(64) NULL COMMENT '对应 suggestion（suggestion 审核时必填）',
  
  channel VARCHAR(32) NULL COMMENT '渠道',
  employee_id VARCHAR(64) NULL COMMENT '客服ID',
  customer_id VARCHAR(64) NULL COMMENT '客户ID',
  alert_level VARCHAR(16) NULL COMMENT '告警级别',
  
  -- 审核/复核状态
  review_status VARCHAR(32) NOT NULL DEFAULT 'pending_review' COMMENT '状态: pending_review/approved/modified_approved/rejected',
  review_decision VARCHAR(32) NULL COMMENT '决定（旧版兼容）: approved/rejected/needs_edit',
  review_action VARCHAR(32) NULL COMMENT '审核动作: approve/modify_and_approve/reject',
  review_comment TEXT NULL COMMENT '复核意见（旧版兼容）',
  review_note TEXT NULL COMMENT '审核备注',
  
  -- 优化回复（旧版兼容）
  optimized_reply TEXT NULL COMMENT '优化后的回复',
  optimized_reply_approved TINYINT(1) NULL COMMENT '优化回复是否被批准',
  original_reply TEXT NULL COMMENT 'suggestion 原始内容',
  
  -- 采纳结果
  is_adopted TINYINT(1) NULL COMMENT '是否被采纳',
  final_reply_version TEXT NULL COMMENT '最终回复版本（旧版兼容）',
  final_reply TEXT NULL COMMENT '审核后的最终内容',
  
  -- 审核/复核人信息
  reviewed_by VARCHAR(64) NULL COMMENT '复核人ID（旧版兼容）',
  reviewer_id VARCHAR(64) NULL COMMENT '审核人',
  reviewed_at DATETIME NULL COMMENT '复核时间',
  
  -- 误报标记
  false_positive_reason VARCHAR(255) NULL COMMENT '误报原因',
  
  -- 优先级 (用于工作台排序)
  priority VARCHAR(16) NULL COMMENT '优先级: high/medium/low',
  problem_tags JSON NULL COMMENT '问题标签: ["话术问题","态度问题","流程问题"]',
  
  -- 知识沉淀标记
  knowledge_id VARCHAR(64) NULL COMMENT '已生成的知识 ID（沉淀后标记）',
  
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_review_id (review_id),
  UNIQUE KEY uk_evaluation_id (evaluation_id),
  UNIQUE KEY uk_suggestion_id (suggestion_id),
  KEY idx_project_id (project_id),
  KEY idx_project_status (project_id, review_status),
  KEY idx_project_alert (project_id, alert_level),
  KEY idx_mode_status (mode, review_status),
  KEY idx_priority_status (priority, review_status),
  KEY idx_employee_status (employee_id, review_status),
  KEY idx_session_id (session_id),
  KEY idx_message_id (message_id),
  KEY idx_review_action (review_action),
  KEY idx_reviewer_id (reviewer_id),
  KEY idx_reviewed_by (reviewed_by),
  KEY idx_knowledge_id (knowledge_id),
  KEY idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='主管审核/复核统一表';

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
-- 7. training_sessions 训练会话表
-- 用于存储 TG 训练过程的会话主记录
-- ============================================================
CREATE TABLE IF NOT EXISTS training_sessions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  session_id VARCHAR(64) NOT NULL COMMENT '训练会话唯一ID',
  project VARCHAR(64) NOT NULL DEFAULT 'default' COMMENT '项目标识',
  scenario_id VARCHAR(128) NOT NULL COMMENT '场景ID',
  scenario_title VARCHAR(256) NOT NULL COMMENT '场景标题',
  agent_id VARCHAR(64) NULL COMMENT '客服ID',
  chat_id VARCHAR(64) NOT NULL COMMENT 'Telegram chat ID',
  status VARCHAR(32) NOT NULL DEFAULT 'running' COMMENT '状态: running/finished/cancelled',
  total_rounds INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '总轮次',
  started_at DATETIME NOT NULL COMMENT '训练开始时间',
  finished_at DATETIME NULL COMMENT '训练结束时间',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_session_id (session_id),
  KEY idx_project (project),
  KEY idx_scenario_id (scenario_id),
  KEY idx_agent_id (agent_id),
  KEY idx_chat_id (chat_id),
  KEY idx_status (status),
  KEY idx_started_at (started_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='训练会话表';

-- ============================================================
-- 8. training_messages 训练消息表
-- 用于存储训练过程中的每条消息（用户和客服）
-- ============================================================
CREATE TABLE IF NOT EXISTS training_messages (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  session_id VARCHAR(64) NOT NULL COMMENT '所属训练会话ID',
  round INT UNSIGNED NOT NULL COMMENT '轮次（从0开始）',
  role VARCHAR(16) NOT NULL COMMENT '角色: user/agent',
  content TEXT NOT NULL COMMENT '消息内容',
  source VARCHAR(32) NOT NULL DEFAULT 'ai' COMMENT '来源: ai/human',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_session_id (session_id),
  KEY idx_session_round (session_id, round),
  KEY idx_role (role),
  KEY idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='训练消息表';

-- ============================================================
-- 9. training_round_results 训练轮次结果表
-- 用于存储每轮的分析结果和反馈结果
-- ============================================================
CREATE TABLE IF NOT EXISTS training_round_results (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  session_id VARCHAR(64) NOT NULL COMMENT '所属训练会话ID',
  round INT UNSIGNED NOT NULL COMMENT '轮次（从0开始）',
  scenario_id VARCHAR(128) NOT NULL COMMENT '场景ID',
  scenario_title VARCHAR(256) NOT NULL COMMENT '场景标题',
  analysis_raw JSON NOT NULL COMMENT '分析引擎原始输出JSON',
  feedback_text TEXT NOT NULL COMMENT '客服可读的反馈文本',
  structured_feedback JSON NOT NULL COMMENT '结构化反馈JSON（来自feedback-template-service）',
  is_finished TINYINT(1) NOT NULL DEFAULT 0 COMMENT '该轮是否为最后一轮: 0=否, 1=是',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_session_id (session_id),
  KEY idx_session_round (session_id, round),
  KEY idx_scenario_id (scenario_id),
  KEY idx_is_finished (is_finished),
  KEY idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='训练轮次结果表';

-- ============================================================
-- 8. live_sessions 实时会话表
-- 用于存储 TG 实时监听的会话主记录（与训练会话隔离）
-- ============================================================
CREATE TABLE IF NOT EXISTS live_sessions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  session_id VARCHAR(128) NOT NULL COMMENT '实时会话唯一ID（对应 session_key）',
  project VARCHAR(64) NOT NULL DEFAULT 'default' COMMENT '项目标识',
  chat_id VARCHAR(64) NOT NULL COMMENT 'Telegram 会话 ID',
  agent_id VARCHAR(64) NULL COMMENT '客服ID（首个 agent 消息的 sender_id）',
  status VARCHAR(32) NOT NULL DEFAULT 'active' COMMENT '状态: active/closed',
  started_at DATETIME NOT NULL COMMENT '会话开始时间',
  updated_at DATETIME NOT NULL COMMENT '最后更新时间',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_session_id (session_id),
  KEY idx_project (project),
  KEY idx_chat_id (chat_id),
  KEY idx_agent_id (agent_id),
  KEY idx_status (status),
  KEY idx_started_at (started_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='实时会话表';

-- ============================================================
-- 9. live_messages 实时消息表
-- 用于存储实时会话中的逐条消息（user 和 agent 都保存）
-- ============================================================
CREATE TABLE IF NOT EXISTS live_messages (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  message_id VARCHAR(64) NOT NULL COMMENT 'Telegram 消息 ID',
  session_id VARCHAR(128) NOT NULL COMMENT '所属实时会话 ID',
  role VARCHAR(16) NOT NULL COMMENT '消息角色: user/agent',
  sender_id VARCHAR(64) NOT NULL COMMENT '发送人 ID',
  sender_name VARCHAR(128) NULL COMMENT '发送人显示名',
  content TEXT NOT NULL COMMENT '消息内容',
  timestamp DATETIME NOT NULL COMMENT '消息时间',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_message_id (message_id),
  KEY idx_session_id (session_id),
  KEY idx_role (role),
  KEY idx_sender_id (sender_id),
  KEY idx_timestamp (timestamp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='实时消息表';

-- ============================================================
-- 10. live_evaluations 实时质检评估表
-- 用于存储实时质检分析结果（与训练评估隔离）
-- ============================================================
CREATE TABLE IF NOT EXISTS live_evaluations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  evaluation_id VARCHAR(64) NOT NULL COMMENT '评估唯一ID',
  session_id VARCHAR(128) NOT NULL COMMENT '所属实时会话 ID',
  message_id VARCHAR(64) NOT NULL COMMENT '当前触发分析的客服消息 ID',
  project VARCHAR(64) NOT NULL DEFAULT 'default' COMMENT '项目标识',
  current_reply TEXT NOT NULL COMMENT '当前被分析的客服回复',
  
  -- 引擎输入输出（完整保存）
  input_payload JSON NOT NULL COMMENT '调引擎时的输入对象（标准协议）',
  output_payload JSON NOT NULL COMMENT '引擎返回原始结果',
  
  -- 分析结果关键字段（便于查询）
  scenario VARCHAR(128) NULL COMMENT '场景识别结果',
  stage VARCHAR(64) NULL COMMENT '阶段判断结果',
  judgement TEXT NULL COMMENT '结论',
  summary TEXT NULL COMMENT '总结',
  confidence DECIMAL(5,2) NULL COMMENT '置信度',
  
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_evaluation_id (evaluation_id),
  UNIQUE KEY uk_message_id (message_id),
  KEY idx_session_id (session_id),
  KEY idx_project (project),
  KEY idx_scenario (scenario),
  KEY idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='实时质检评估表';

-- ============================================================
-- 11. suggestions 建议答案表
-- 用于存储 unknown 问题自动生成的建议答案草稿
-- ============================================================
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


-- ============================================================
-- 12. knowledge_base 知识库表
-- 用于存储审核通过后的 FAQ / 场景知识库记录
-- ============================================================
CREATE TABLE IF NOT EXISTS knowledge_base (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  knowledge_id VARCHAR(64) NOT NULL COMMENT '知识唯一ID',
  root_id VARCHAR(64) NOT NULL COMMENT '版本根ID，同一知识的所有版本共享相同的root_id',
  project_id VARCHAR(64) NOT NULL COMMENT '项目ID',
  scenario VARCHAR(128) NOT NULL COMMENT '场景名称',
  question_aliases JSON NOT NULL COMMENT '用户问题表达集合',
  standard_answer TEXT NOT NULL COMMENT '标准答案',
  rules JSON NOT NULL COMMENT '规则对象（keywords/required_info/forbidden）',
  
  -- 来源关系（完整追溯，人工创建时可为 NULL）
  source_review_id VARCHAR(64) DEFAULT NULL COMMENT '来源 review',
  source_suggestion_id VARCHAR(64) DEFAULT NULL COMMENT '来源 suggestion',
  source_evaluation_id VARCHAR(64) DEFAULT NULL COMMENT '来源 evaluation',
  source_session_id VARCHAR(128) DEFAULT NULL COMMENT '来源 session',
  
  -- 版本与状态
  version INT UNSIGNED NOT NULL DEFAULT 1 COMMENT '版本号',
  status VARCHAR(32) NOT NULL DEFAULT 'active' COMMENT '状态: active/deprecated',
  
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_knowledge_id (knowledge_id),
  KEY idx_root_id (root_id),
  KEY idx_project_id (project_id),
  KEY idx_project_scenario_status (project_id, scenario, status),
  KEY idx_scenario (scenario),
  KEY idx_status (status),
  KEY idx_source_evaluation_id (source_evaluation_id),
  KEY idx_source_session_id (source_session_id),
  KEY idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='FAQ/场景知识库表';

-- ============================================================
-- 13. training_data_pool 训练数据池表
-- 用于存储从知识库转换的结构化训练数据
-- ============================================================
CREATE TABLE IF NOT EXISTS training_data_pool (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  data_id VARCHAR(64) NOT NULL COMMENT '训练数据 ID',
  project_id VARCHAR(64) NOT NULL COMMENT '项目 ID',
  knowledge_id VARCHAR(64) NOT NULL COMMENT '来源知识 ID',
  scenario VARCHAR(128) NOT NULL COMMENT '场景',
  input_text TEXT NOT NULL COMMENT '用户问题表达',
  input_text_hash VARCHAR(64) NOT NULL COMMENT 'input_text 的 hash，用于去重',
  target_reply TEXT NOT NULL COMMENT '标准答案',
  rules JSON NOT NULL COMMENT '规则对象（keywords/required_info/forbidden）',
  
  -- 来源关系（完整追溯）
  source_review_id VARCHAR(64) NOT NULL COMMENT '来源 review',
  source_suggestion_id VARCHAR(64) NOT NULL COMMENT '来源 suggestion',
  source_evaluation_id VARCHAR(64) NOT NULL COMMENT '来源 evaluation',
  source_session_id VARCHAR(128) NOT NULL COMMENT '来源 session',
  
  -- 版本与状态
  knowledge_version INT UNSIGNED NOT NULL COMMENT '来源知识版本',
  data_version INT UNSIGNED NOT NULL DEFAULT 1 COMMENT '数据版本',
  status VARCHAR(32) NOT NULL DEFAULT 'ready' COMMENT '状态: ready/used/deprecated',
  
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_data_id (data_id),
  UNIQUE KEY uk_knowledge_input_version (knowledge_id, input_text_hash, knowledge_version),
  KEY idx_project_id (project_id),
  KEY idx_knowledge_id (knowledge_id),
  KEY idx_project_status (project_id, status),
  KEY idx_project_scenario_status (project_id, scenario, status),
  KEY idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='训练数据池表';

-- ============================================================
-- 14. alerts 告警表
-- 用于存储实时质检中触发的告警记录
-- ============================================================
CREATE TABLE IF NOT EXISTS alerts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  alert_id VARCHAR(64) NOT NULL COMMENT '告警唯一ID',
  evaluation_id VARCHAR(64) NOT NULL COMMENT '对应 live_evaluation 主键',
  session_id VARCHAR(128) NOT NULL COMMENT '对应 live session',
  message_id VARCHAR(64) NOT NULL COMMENT '对应触发分析的客服消息',
  project VARCHAR(64) NOT NULL DEFAULT 'default' COMMENT '项目标识',
  
  -- 告警核心字段
  alert_level VARCHAR(16) NOT NULL COMMENT '告警等级：medium / high',
  alert_type VARCHAR(32) NOT NULL COMMENT '告警类型：risk / unknown / quality / compliance',
  alert_reason TEXT NOT NULL COMMENT '触发原因',
  
  -- 状态
  status VARCHAR(32) NOT NULL DEFAULT 'open' COMMENT '状态：固定 open',
  
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_alert_id (alert_id),
  KEY idx_evaluation_id (evaluation_id),
  KEY idx_session_id (session_id),
  KEY idx_project (project),
  KEY idx_alert_level (alert_level),
  KEY idx_alert_type (alert_type),
  KEY idx_status (status),
  KEY idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='告警表';

-- ============================================================
-- 初始化默认项目数据
-- ============================================================
INSERT INTO projects (project_id, project_name, status, channel_config_json, bot_config_json, scoring_profile_json)
VALUES ('default', 'Default Project', 'active', '{}', '{}', '{}')
ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP;
