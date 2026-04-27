# 向上游要数的标准需求单：历史私聊消息正文

**需求单编号**: REQ-2026-0423-001  
**需求提出方**: trainer-core项目组  
**需求日期**: 2026-04-23  
**期望交付日期**: 收到需求后5个工作日内（样本）  
**数据用途**: 客服训练引擎历史数据接入

---

## 一、数据用途说明

### 1.1 项目背景

我们正在建设一个**客服训练引擎**（trainer-core），用于：
- 客服话术质量评估
- 客服响应时间监控
- 客服培训与考核
- FAQ知识库沉淀
- AI模型训练

### 1.2 为什么需要历史私聊消息正文

当前我们已经获得了**会话元数据**（conversations.sql，4269条会话），包含：
- 会话ID、chat_id、user_id
- 会话开始/结束时间
- 消息数量统计
- 客服标签（艾斯、乐多、小美等）

但**缺少消息正文**，导致无法：
- ❌ 审核客服回复质量
- ❌ 沉淀FAQ知识库
- ❌ 训练AI评估模型
- ❌ 分析对话内容

因此，需要向上游获取**历史私聊消息正文**，使历史数据从"元数据层"升级为"完整对话数据"。

---

## 二、为什么现有 conversations.sql 不够

### 2.1 conversations.sql 包含的字段

```sql
-- 仅包含会话级统计信息
id, user_id, cs_account_identifier, status, 
start_time, end_time, message_count, 
customer_message_count, cs_message_count, 
agent_tag, agent_confidence, ...
```

### 2.2 conversations.sql 缺少的核心字段

```
❌ content（消息正文）
❌ sender_role（发送者角色：用户/客服）
❌ message_id（消息唯一标识）
❌ sender_id（发送者ID）
```

### 2.3 举例说明

**conversations.sql 告诉我们：**
```
会话ID=44, chat_id=7604636317, 时间=2025-12-26 23:49~00:01, 消息数=4, 客服=艾斯
```

**但我们看不到：**
```
用户: "你好，我转账成功了，但是对方没收到钱，帮我查一下"
艾斯: "您好，为了帮您进一步核查，请您提供付款截图和绑定手机号，我们会尽快为您处理。"
用户: "好的，我发给你"
艾斯: "收到，我帮您查询中，请稍候..."
```

**没有消息正文，我们无法：**
- 判断艾斯的回复是否规范
- 提取FAQ："转账成功但对方没收到钱怎么办"
- 训练AI识别客服话术质量

---

## 三、本次只需要历史私聊正文，不要泛数据

### 3.1 我们明确不要的数据

- ❌ 群聊消息（如"pai财务运营群"）
- ❌ 内部员工讨论记录
- ❌ 系统通知/机器人消息
- ❌ 与客服会话无关的数据

### 3.2 我们明确需要的数据

- ✅ **Telegram私聊消息**（1对1客服会话）
- ✅ **chat_id对应historical_conversations中的chat_id**
- ✅ **时间在2025-12-26 ~ 2026-01-30范围内**
- ✅ **cs_account_identifier = TG_CS_MAIN**

---

## 四、最小字段清单

### 4.1 必须字段（缺失则无法使用）

| 序号 | 字段名 | 类型 | 说明 | 示例值 | 为什么必须 |
|------|--------|------|------|--------|-----------|
| 1 | **chat_id** | BIGINT | Telegram聊天ID | 7604636317 | 与historical_conversations关联的主键 |
| 2 | **message_time** | DATETIME | 消息发送时间 | 2025-12-26 23:49:21 | 时间范围匹配、消息排序 |
| 3 | **content** | TEXT | 消息正文 | "你好，转账收不到钱" | 核心数据，审核/FAQ/训练必需 |

### 4.2 强烈建议字段（缺失会影响数据质量）

| 序号 | 字段名 | 类型 | 说明 | 示例值 | 为什么建议 |
|------|--------|------|------|--------|-----------|
| 4 | message_id | VARCHAR(64) | 消息唯一ID | msg_123456 | 去重、追溯 |
| 5 | sender_id | VARCHAR(64) | 发送者ID | user7604636317 | 区分用户/客服 |
| 6 | sender_name | VARCHAR(128) | 发送者名称 | "张三" | 展示、分析 |
| 7 | sender_role | VARCHAR(32) | 发送者角色 | user / agent | 区分消息方向 |
| 8 | user_id | BIGINT | 用户ID | 5 | 辅助关联 |

### 4.3 如有则更好字段（可选）

| 序号 | 字段名 | 类型 | 说明 | 示例值 | 用途 |
|------|--------|------|------|--------|------|
| 9 | original_conversation_id | BIGINT | 原始会话ID | 44 | 直接关联historical_conversations |
| 10 | project | VARCHAR(64) | 项目标识 | pai | 多项目隔离 |
| 11 | source_channel | VARCHAR(32) | 来源渠道 | telegram | 多渠道支持 |
| 12 | raw_payload | JSON | 原始Telegram payload | {...} | 完整追溯、调试 |

---

## 五、推荐导出格式

### 5.1 首选格式：CSV

**优势：**
- 最容易交付与核对
- 可用Excel打开
- 通用性强

**要求：**
- UTF-8编码
- 第一行为字段名
- 内容中的逗号用双引号包裹
- 换行符用\n

**示例：**

```csv
message_id,chat_id,user_id,sender_id,sender_name,sender_role,content,message_time,original_conversation_id
msg_001,7604636317,5,user7604636317,,user,"你好，转账收不到钱",2025-12-26 23:49:21,44
msg_002,7604636317,5,agent001,艾斯,agent,"您好，请提供付款截图",2025-12-26 23:50:15,44
msg_003,7604636317,5,user7604636317,,user,"好的，我发给你",2025-12-26 23:51:02,44
msg_004,7604636317,5,agent001,艾斯,agent,"收到，我帮您查询中",2025-12-26 23:52:30,44
```

### 5.2 备选格式：JSONL

**优势：**
- 支持复杂结构
- 适合程序导入
- 逐行可读

**示例：**

```json
{"message_id":"msg_001","chat_id":7604636317,"user_id":5,"sender_id":"user7604636317","sender_name":"","sender_role":"user","content":"你好，转账收不到钱","message_time":"2025-12-26 23:49:21","original_conversation_id":44}
{"message_id":"msg_002","chat_id":7604636317,"user_id":5,"sender_id":"agent001","sender_name":"艾斯","sender_role":"agent","content":"您好，请提供付款截图","message_time":"2025-12-26 23:50:15","original_conversation_id":44}
```

### 5.3 备选格式：SQL

**优势：**
- 标准INSERT语句
- 可直接导入MySQL

**示例：**

```sql
INSERT INTO messages (message_id, chat_id, user_id, sender_id, sender_name, sender_role, content, message_time, original_conversation_id) VALUES
('msg_001', 7604636317, 5, 'user7604636317', '', 'user', '你好，转账收不到钱', '2025-12-26 23:49:21', 44),
('msg_002', 7604636317, 5, 'agent001', '艾斯', 'agent', '您好，请提供付款截图', '2025-12-26 23:50:15', 44);
```

---

## 六、时间范围要求

### 6.1 主要时间范围

| 字段 | 值 | 说明 |
|------|-----|------|
| **起始日期** | 2025-12-26 00:00:00 | historical_conversations最早会话时间 |
| **结束日期** | 2026-01-30 23:59:59 | historical_conversations最晚会话时间 |
| **时区** | Asia/Bangkok (UTC+7) | 与historical_conversations一致 |

### 6.2 数据筛选条件

```sql
-- 建议的SQL筛选条件
WHERE message_time >= '2025-12-26 00:00:00'
  AND message_time <= '2026-01-30 23:59:59'
  AND cs_account_identifier = 'TG_CS_MAIN'
  AND chat_type = 'private'  -- 仅私聊，不要群聊
```

### 6.3 如果数据量过大

**建议分批交付：**

| 批次 | 时间范围 | 预计会话数 | 预计消息数 |
|------|---------|-----------|-----------|
| 第1批（样本） | 任意5条完整会话 | 5 | ~100 |
| 第2批 | 2025-12-26 ~ 2026-01-05 | ~1000 | ~20000 |
| 第3批 | 2026-01-06 ~ 2026-01-15 | ~1000 | ~20000 |
| 第4批 | 2026-01-16 ~ 2026-01-30 | ~2269 | ~45000 |

---

## 七、关联键要求

### 7.1 必须满足的关联方式（至少一种）

**方式1：original_conversation_id（推荐）**

```sql
-- 消息表通过original_conversation_id关联historical_conversations.original_id
SELECT m.*, hc.agent_tag, hc.status
FROM messages m
JOIN historical_conversations hc ON m.original_conversation_id = hc.original_id
WHERE hc.chat_id = 7604636317;
```

**方式2：chat_id + message_time范围（备用）**

```sql
-- 消息表通过chat_id + 时间范围关联
SELECT m.*, hc.agent_tag, hc.status
FROM messages m
JOIN historical_conversations hc 
  ON m.chat_id = hc.chat_id
  AND m.message_time >= hc.start_time - INTERVAL 30 MINUTE
  AND m.message_time <= hc.end_time + INTERVAL 30 MINUTE
WHERE hc.chat_id = 7604636317;
```

### 7.2 关联键优先级

| 优先级 | 关联键 | 稳定性 | 推荐度 |
|--------|--------|--------|--------|
| 1 | original_conversation_id | ⭐⭐⭐⭐⭐ | 最稳定，直接关联 |
| 2 | chat_id + message_time | ⭐⭐⭐⭐ | 稳定，需时间准确 |
| 3 | user_id + message_time | ⭐⭐⭐ | 可用，但同一用户可能多会话 |

---

## 八、隐私与安全说明

### 8.1 数据使用范围

**本数据仅用于：**
- ✅ 客服话术质量评估
- ✅ 内部培训与考核
- ✅ FAQ知识库沉淀
- ✅ AI模型训练（内部使用）

**本数据不会：**
- ❌ 对外公开
- ❌ 用于商业营销
- ❌ 分享给第三方
- ❌ 用于用户画像

### 8.2 脱敏要求

**如果消息中包含以下敏感信息，建议脱敏：**

| 敏感信息类型 | 脱敏方式 | 示例 |
|------------|---------|------|
| 手机号 | 保留前3后4，中间* | 138****5678 |
| 银行卡号 | 保留前4后4，中间* | 6222 **** **** 1234 |
| 身份证号 | 保留前3后4，中间* | 110****1234 |
| 邮箱地址 | 保留前2后@后全部 | ad****@example.com |
| 真实姓名 | 用客服标签替代 | 艾斯、乐多 |

**如果不方便脱敏：**
- 请明确告知
- 我们会在内网环境处理，不会外传

### 8.3 数据保留期限

- 原始数据导入后，导出文件将删除
- 导入后的数据保留期限：按公司数据保留政策执行
- 如需提前删除，可联系trainer-core项目组

---

## 九、验收方式

### 9.1 样本验证（第1批）

**交付物：** 5条完整会话 或 50条消息

**验收标准：**

| 检查项 | 标准 | 验证方式 |
|--------|------|---------|
| 字段完整性 | 必须字段（chat_id, message_time, content）全部存在 | 打开CSV检查表头 |
| chat_id匹配 | 样本chat_id能在historical_conversations中找到 | SQL关联查询 |
| 时间范围 | message_time在2025-12-26 ~ 2026-01-30内 | SQL范围查询 |
| 消息完整性 | 每条会话的消息数与historical_conversations.message_count一致 | COUNT对比 |
| 编码正确 | 中文显示正常，无乱码 | 打开CSV检查内容 |
| 角色区分 | 能区分user和agent消息 | 检查sender_role字段 |

**验收通过后，才会请求全量数据。**

### 9.2 全量验收（第2-4批）

**交付物：** 完整历史消息数据

**验收标准：**

| 检查项 | 标准 |
|--------|------|
| 数据量 | 消息总数与historical_conversations的SUM(message_count)匹配（允许±5%误差） |
| 关联成功率 | ≥95%的消息能通过关联键匹配到historical_conversations |
| 时间覆盖率 | ≥95%的historical_conversations有对应消息 |
| 字段完整率 | ≥98%的记录包含必须字段 |

---

## 十、交付方式

### 10.1 样本数据（第1批）

**推荐方式：**
- 📧 邮件附件（CSV文件）
- 💬 钉钉/飞书文件传输
- 📎 微信文件传输

**文件命名规范：**
```
historical_messages_sample_5sessions_YYYYMMDD.csv
```

### 10.2 全量数据（第2-4批）

**推荐方式（按优先级）：**

1. **对象存储下载链接**
   - AWS S3 / 阿里云OSS / 腾讯云COS
   - 提供临时下载链接（有效期7天）
   - 文件按批次分片

2. **邮件附件**
   - 适用于单文件<25MB
   - 多文件需压缩

3. **数据库只读账号**
   - 提供MySQL只读账号
   - 我们自行导出

4. **FTP/SFTP**
   - 提供服务器地址和账号
   - 我们自行下载

---

## 十一、联系方式

**需求提出方：** trainer-core项目组  
**技术联系人：** [待填写]  
**业务联系人：** [待填写]  
**期望交付日期：** 收到需求后5个工作日内（样本）

**问题反馈：**
- 如对本需求单有疑问，请先联系技术联系人
- 如字段含义不明确，可参考本文档"字段清单"部分
- 如导出数据有问题，可提供样本先验证

---

## 十二、附录

### 12.1 historical_conversations 表结构参考

```sql
CREATE TABLE historical_conversations (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  original_id BIGINT NOT NULL,              -- 原始conversations表的主键
  chat_id BIGINT NULL,                       -- Telegram chat ID（关联键）
  user_id BIGINT NOT NULL,                   -- 原始用户ID
  cs_account_identifier VARCHAR(50) NOT NULL, -- 客服账号标识（如TG_CS_MAIN）
  agent_tag VARCHAR(50) NULL,                -- 客服标签（如艾斯/乐多/小美）
  start_time DATETIME NOT NULL,              -- 会话开始时间
  end_time DATETIME NULL,                    -- 会话结束时间
  message_count INT NOT NULL DEFAULT 0,      -- 消息总数
  customer_message_count INT NOT NULL,       -- 用户消息数
  cs_message_count INT NOT NULL,             -- 客服消息数
  ...
);
```

### 12.2 示例关联查询

```sql
-- 查询chat_id=7604636317的完整会话
SELECT 
  hc.id as conversation_id,
  hc.agent_tag,
  hc.start_time,
  hc.end_time,
  m.message_id,
  m.sender_role,
  m.sender_name,
  m.content,
  m.message_time
FROM historical_conversations hc
LEFT JOIN messages m 
  ON m.chat_id = hc.chat_id
  AND m.message_time >= hc.start_time - INTERVAL 30 MINUTE
  AND m.message_time <= hc.end_time + INTERVAL 30 MINUTE
WHERE hc.chat_id = 7604636317
ORDER BY m.message_time ASC;
```

### 12.3 数据统计参考

```sql
-- historical_conversations 当前统计
SELECT 
  COUNT(*) as total_conversations,
  MIN(start_time) as earliest,
  MAX(end_time) as latest,
  SUM(message_count) as total_messages,
  AVG(message_count) as avg_messages_per_conversation
FROM historical_conversations;

-- 结果：
-- total_conversations: 50 (样本) / 4269 (全量)
-- earliest: 2025-12-26 03:55:25
-- latest: 2026-01-30 22:18:22
-- total_messages: ~85,000 (预估)
-- avg_messages_per_conversation: ~20
```

---

**需求单结束。感谢配合！**
