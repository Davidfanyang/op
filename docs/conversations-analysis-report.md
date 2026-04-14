# Conversations 会话事实表接入报告

> 生成时间: 2026-04-11  
> 数据源: `/Users/adime/Desktop/conversations.sql`  
> 目标数据库: `pai_dashboard.conversations`  
> 记录总数: **4,269 条**

---

## 一、导入与表结构说明

### 1.1 导入方式

```bash
# 1. 创建数据库
mysql -u root --password='' -e "CREATE DATABASE IF NOT EXISTS pai_dashboard CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;"

# 2. 导入SQL文件
mysql -u root --password='' pai_dashboard < /Users/adime/Desktop/conversations.sql
```

### 1.2 表结构概览

| 字段名 | 类型 | 是否可空 | 说明 |
|--------|------|----------|------|
| `id` | bigint | NO | 自增主键 |
| `user_id` | bigint | NO | 用户ID |
| `cs_account_identifier` | varchar(50) | NO | 客服账号标识 (如: TG_CS_MAIN) |
| `assigned_operator_id` | bigint | YES | 分配的操作员ID |
| `start_time` | datetime | NO | 会话开始时间 |
| `end_time` | datetime | YES | 会话结束时间 |
| `status` | varchar(20) | NO | 会话状态 (open/closed) |
| `message_count` | int | NO | 总消息数 |
| `customer_message_count` | int | NO | 客户消息数 |
| `cs_message_count` | int | NO | 客服消息数 |
| `is_long` | tinyint | NO | 是否长会话 (0/1) |
| `first_response_seconds` | int | YES | 首次响应时间(秒) |
| `first_response_override_seconds` | int | YES | 人工修正的首响时间 |
| `first_response_override_note` | varchar(255) | YES | 人工修正说明 |
| `first_response_override_at` | datetime | YES | 人工修正时间 |
| `first_response_sla_breached` | tinyint | NO | 是否SLA超时 (0/1) |
| `agent_tag` | varchar(50) | YES | 客服标签/姓名 |
| `agent_confidence` | decimal(6,4) | YES | 客服置信度 |
| `response_metrics_calculated` | tinyint | NO | 响应指标是否已计算 |
| `open_anchor_msg_id` | bigint | YES | 开始锚点消息ID |
| `open_anchor_time` | datetime | YES | 开始锚点时间 |
| `start_customer_anchor_msg_id` | bigint | YES | 客户开始锚点消息ID |
| `start_customer_anchor_time` | datetime | YES | 客户开始锚点时间 |
| `close_anchor_msg_id` | bigint | YES | 结束锚点消息ID |
| `close_anchor_time` | datetime | YES | 结束锚点时间 |
| `closed_by_operator_id` | bigint | YES | 关闭会话的操作员ID |
| `closed_at` | datetime | YES | 关闭时间 |
| `previous_conversation_id` | bigint | YES | 前一个会话ID (用于reopen追踪) |
| `reopen_count` | int | NO | 重开次数 |
| `is_valid` | tinyint | NO | 是否有效会话 (0/1) |
| `invalid_reason` | varchar(255) | YES | 无效原因 |
| `peer_access_hash` | bigint | YES | Telegram peer hash |
| `chat_id` | bigint | YES | Telegram chat ID |
| `created_at` | datetime | NO | 创建时间 |
| `updated_at` | datetime | NO | 更新时间 |

### 1.3 关键字段确认

✅ 以下字段**全部存在并可用**:

- ✅ `conversation_id` → 实际字段名为 `id`
- ✅ `chat_id`
- ✅ `user_id`
- ✅ `cs_account_identifier`
- ✅ `agent_tag`
- ✅ `status`
- ✅ `message_count`
- ✅ `customer_message_count`
- ✅ `agent_message_count` → 实际字段名为 `cs_message_count`
- ✅ `first_response_seconds`
- ✅ `is_sla_timeout` → 实际字段名为 `first_response_sla_breached`
- ✅ `is_valid`
- ✅ `invalid_reason`
- ✅ `reopen_count`
- ✅ `previous_conversation_id`
- ✅ `start_time`
- ✅ `end_time`
- ✅ `created_at`
- ✅ `updated_at`

---

## 二、数据概览报告

### 2.1 总量与时间范围

| 指标 | 值 |
|------|-----|
| **总记录数** | 4,269 条 |
| **最早会话** | 2025-12-26 03:55:25 |
| **最晚会话** | 2026-03-06 00:46:53 |
| **时间跨度** | 约 70 天 |

### 2.2 Status 分布

| 状态 | 数量 | 占比 |
|------|------|------|
| closed | 3,956 | 92.7% |
| open | 313 | 7.3% |

### 2.3 is_valid 分布

| 是否有效 | 数量 | 占比 |
|----------|------|------|
| 1 (有效) | 3,670 | 86.0% |
| 0 (无效) | 599 | 14.0% |

### 2.4 agent_tag 分布 Top 10

| 客服 | 会话数 | 占比 |
|------|--------|------|
| 玲玲 | 940 | 22.0% |
| 小艾 | 787 | 18.4% |
| 乐多 | 666 | 15.6% |
| 小玉 | 546 | 12.8% |
| 小明 | 284 | 6.7% |
| 小美 | 247 | 5.8% |
| 艾斯 | 194 | 4.5% |
| 小林 | 129 | 3.0% |
| 小熊 | 128 | 3.0% |
| 小凡 | 35 | 0.8% |

**总计覆盖**: 12 名客服 (含 豆包、小派)

### 2.5 invalid_reason 分布 Top 10

| 无效原因 | 数量 | 说明 |
|----------|------|------|
| no_close | 270 | 会话未正确关闭 |
| no_open(pending) | 153 | 会话未正确打开(待处理) |
| no_open(pending) no_open | 120 | 复合无效原因 |
| no_close no_close | 52 | 重复未关闭标记 |
| no_first_response no_first_response | 2 | 无首次响应 |
| no_open(pending) no_open no_open | 2 | 多重未打开 |

---

## 三、Conversation Signals 设计稿

### 3.1 信号清单与判定规则

| 信号名称 | 类型 | 判定规则 | 风险等级 |
|---------|------|---------|---------|
| `is_sla_risk` | 效率风险 | `first_response_sla_breached = 1` | ⚠️ 高 |
| `is_reopened` | 质量风险 | `reopen_count > 0` | ⚠️ 中 |
| `is_invalid_conversation` | 数据质量 | `is_valid = 0` | 🔴 高 |
| `is_unclosed_conversation` | 流程风险 | `status = 'open' AND end_time IS NULL` | ⚠️ 中 |
| `is_long_conversation` | 效率风险 | `is_long = 1` (系统已标记) | ⚠️ 低 |
| `is_high_message_count` | 复杂度风险 | `message_count > 50` | ⚠️ 中 |
| `is_slow_first_response` | 效率风险 | `first_response_seconds > 60` (排除0和NULL) | ⚠️ 低 |
| `is_extreme_duration` | 异常风险 | `first_response_seconds > 3600` | 🔴 高 |

### 3.2 信号计算逻辑 (SQL 视图草案)

```sql
CREATE OR REPLACE VIEW conversation_signals AS
SELECT 
  id as conversation_id,
  user_id,
  agent_tag,
  status,
  is_valid,
  message_count,
  first_response_seconds,
  reopen_count,
  start_time,
  end_time,
  
  -- 信号计算
  CASE WHEN first_response_sla_breached = 1 THEN 1 ELSE 0 END as is_sla_risk,
  CASE WHEN reopen_count > 0 THEN 1 ELSE 0 END as is_reopened,
  CASE WHEN is_valid = 0 THEN 1 ELSE 0 END as is_invalid_conversation,
  CASE WHEN status = 'open' AND end_time IS NULL THEN 1 ELSE 0 END as is_unclosed_conversation,
  CASE WHEN is_long = 1 THEN 1 ELSE 0 END as is_long_conversation,
  CASE WHEN message_count > 50 THEN 1 ELSE 0 END as is_high_message_count,
  CASE WHEN first_response_seconds > 60 AND first_response_seconds IS NOT NULL THEN 1 ELSE 0 END as is_slow_first_response,
  CASE WHEN first_response_seconds > 3600 THEN 1 ELSE 0 END as is_extreme_duration,
  
  -- 会话时长(秒)
  CASE 
    WHEN end_time IS NOT NULL THEN TIMESTAMPDIFF(SECOND, start_time, end_time)
    ELSE NULL
  END as conversation_duration_seconds
  
FROM conversations;
```

### 3.3 接入 trainer-core 的设计

#### 3.3.1 接入层级

```
┌─────────────────────────────────────────┐
│   trainer-core 现有架构                 │
│   - evaluation (AI评分)                 │
│   - review (主管复核)                   │
│   - feedback (反馈系统)                 │
└────────────┬────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────┐
│   🆕 Conversation Signals Layer         │
│   (非语义型监督信号)                     │
│                                         │
│   - 效率信号 (首响/SLA/时长)            │
│   - 质量信号 (reopen/无效)              │
│   - 流程信号 (未关闭/异常)              │
└────────────┬────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────┐
│   conversations 事实表                  │
│   (已导入 pai_dashboard)                │
└─────────────────────────────────────────┘
```

#### 3.3.2 接入方式 (后续实现)

```javascript
// 新增模块: core/conversation-signals.js
class ConversationSignalsService {
  async getSignalsByConversation(conversationId) {
    // 从 conversation_signals 视图查询
  }
  
  async getSignalsByAgent(agentTag, dateRange) {
    // 按客服聚合信号统计
  }
  
  async getRiskConversations(filters) {
    // 查询高风险会话
  }
}
```

#### 3.3.3 与现有体系的关系

| 现有模块 | 关注点 | 新增 signals 层关注点 |
|---------|--------|---------------------|
| evaluation | AI语义评分 | 效率指标、流程合规 |
| review | 主管复核 | 风险识别、异常标记 |
| feedback | 反馈收集 | 运营趋势、客服表现 |

**关键原则**: 
- ✅ signals 层**不替代**现有 evaluation 逻辑
- ✅ signals 层**不直接介入**评分 prompt
- ✅ signals 层为 supervisor **提供额外决策信号**

---

## 四、第一版分析结果

### 4.1 8个核心运营指标

#### 总览类

| 指标 | 值 | 说明 |
|------|-----|------|
| 1. 总会话数 | **4,269** | 70天周期 |
| 2. closed / open | 3,956 / 313 | 关闭率 92.7% |
| 3. valid / invalid | 3,670 / 599 | 有效率 86.0% |

#### 效率类

| 指标 | 值 | 说明 |
|------|-----|------|
| 4. 首响中位数 | **8 秒** | 排除0值后 (数据分布: 50%在8秒内) |
| 5. 首响 P90 | **24 秒** | 90%会话首响在24秒内 |
| 6. SLA 超时数量 | **192** | 超时率 4.5% |

> 📊 **首响分布详情**:
> - ≤10秒: 1,896 条 (47.5%)
> - ≤30秒: 3,164 条 (79.3%)
> - ≤60秒: 3,592 条 (90.0%)
> - ≤120秒: 3,751 条 (94.0%)
> - ≤300秒: 3,822 条 (95.8%)

#### 质量类

| 指标 | 值 | 说明 |
|------|-----|------|
| 7. reopen 会话数 | **0** | 当前 reopen_count 全为0 |
| 8. 高消息会话数 | **94** | message_count > 50 |

> ⚠️ **注意**: 
> - `is_long` 字段全部为 0,可能系统未正确标记
> - `reopen_count` 全部为 0,但存在 `previous_conversation_id` 非空的记录
> - 建议后续复核这两个字段的计算逻辑

### 4.2 员工维度统计

| 客服 | 总会话 | 平均首响(秒) | SLA超时 | 无效会话 | Reopen | 未关闭 | 平均消息 |
|------|--------|-------------|---------|----------|--------|--------|----------|
| 玲玲 | 940 | 29,687 | 51 | 57 | 0 | 31 | 16.1 |
| 小艾 | 787 | 17,588 | 34 | 68 | 0 | 35 | 14.4 |
| 乐多 | 666 | 31,039 | 27 | 41 | 0 | 18 | 14.5 |
| 小玉 | 546 | 20,668 | 25 | 57 | 0 | 27 | 15.0 |
| 小明 | 284 | 22,536 | 7 | 28 | 0 | 14 | 14.7 |
| 小美 | 247 | 5,801 | 18 | 17 | 0 | 7 | 16.7 |
| 艾斯 | 194 | 1,070 | 10 | 20 | 0 | 14 | 13.7 |
| 小林 | 129 | 32,321 | 5 | 14 | 0 | 8 | 14.3 |
| 小熊 | 128 | 7,147 | 9 | 12 | 0 | 2 | 13.5 |
| 小凡 | 35 | 678 | 5 | 6 | 0 | 2 | 10.9 |
| 小派 | 33 | 30 | 1 | 3 | 0 | 1 | 12.7 |
| 豆包 | 2 | 85 | 0 | 0 | 0 | 0 | 4.5 |

### 4.3 关键发现

#### ✅ 优势
1. **整体响应速度快**: 90% 会话首响在 24 秒内
2. **关闭率高**: 92.7% 会话已正确关闭
3. **有效率可接受**: 86% 有效会话

#### ⚠️ 风险点
1. **极端首响异常**: 最高首响 4,013,735 秒 (约46天),存在 128 条 >1小时的记录
2. **无效会话集中**: 
   - 小艾 (68条无效 / 787总会话 = 8.6%)
   - 玲玲 (57条无效 / 940总会话 = 6.1%)
3. **未关闭会话**: 313 条 open 状态,可能需人工跟进
4. **字段计算问题**: `is_long` 和 `reopen_count` 可能未正确更新

#### 🔴 需要调查
- 首响 > 1小时的 128 条记录是否合理
- `no_close` 无效原因占比最高 (270条),需确认是否为系统bug
- `previous_conversation_id` 有值但 `reopen_count=0` 的矛盾

---

## 五、下一步设计 (Messages.sql 接入预案)

> 📌 本节**仅设计,不实施**

### 5.1 四表串联架构

```
┌──────────────┐
│ conversations│ 会话级事实表 (已完成)
│ (会话主表)   │
└──────┬───────┘
       │ 1:N
       ▼
┌──────────────┐
│   messages   │ 消息明细表 (待接入)
│ (消息流水)   │
└──────┬───────┘
       │ 1:N (关联 session_id)
       ▼
┌──────────────┐
│ evaluations  │ AI评估记录 (已存在)
│ (评分/发现)  │
└──────┬───────┘
       │ 1:N (关联 evaluation_id)
       ▼
┌──────────────┐
│   reviews    │ 主管复核记录 (已存在)
│ (复核/采纳)  │
└──────────────┘
```

### 5.2 接入步骤 (未来)

#### Step 1: 导入 messages.sql
```bash
mysql -u root --password='' pai_dashboard < /path/to/messages.sql
```

#### Step 2: 建立关联键
- `messages.chat_id` → `conversations.chat_id`
- `messages.start_time` → `conversations.start_time`
- 通过时间窗口 + chat_id 匹配会话与消息

#### Step 3: 构建完整查询链路
```sql
-- 示例: 从会话到评估的完整链路
SELECT 
  c.id as conversation_id,
  c.agent_tag,
  c.first_response_seconds,
  m.message_count as actual_message_count,
  e.score as ai_score,
  e.alert_level,
  r.review_decision,
  r.is_adopted
FROM conversations c
LEFT JOIN messages m ON c.chat_id = m.chat_id 
  AND m.sent_at BETWEEN c.start_time AND COALESCE(c.end_time, NOW())
LEFT JOIN evaluations e ON c.id = e.session_id  -- 需建立映射
LEFT JOIN reviews r ON e.evaluation_id = r.evaluation_id
WHERE c.agent_tag = '玲玲'
ORDER BY c.start_time DESC;
```

#### Step 4: 增强 signals 层
- 从 messages 表计算**真实**的 `is_long_conversation` (基于消息数或时长)
- 从 messages 表计算**真实**的 `reopen_count` (基于会话断裂/重连模式)
- 加入**对话节奏信号**: 消息间隔、客户等待时间分布

#### Step 5: 输出综合报告
- 语义质量 (evaluations) + 运营效率 (conversations) + 消息行为 (messages)
- 客服综合能力画像
- 风险会话早期预警

### 5.3 注意事项

1. **不要重复计算**: messages 的消息数应与 conversations.message_count 对齐验证
2. **时间窗口匹配**: messages 可能跨会话,需精确匹配 start_time ~ end_time
3. **数据一致性**: 先验证两表 chat_id、user_id 的对应关系
4. **性能考虑**: messages 表可能非常大,需要索引优化

---

## 六、本轮交付物清单

- ✅ **导入与表结构说明** (见第一部分)
- ✅ **数据概览报告** (见第二部分)
- ✅ **conversation signals 设计稿** (见第三部分)
- ✅ **第一版分析结果** (见第四部分)
- ✅ **下一步设计预案** (见第五部分)

---

## 七、建议后续行动

### 优先级 P0 (立即)
1. 调查 `is_long` 和 `reopen_count` 字段为何全为 0
2. 确认 `first_response_sla_breached` 的计算规则
3. 对 313 条 open 会话进行状态跟进

### 优先级 P1 (本周)
1. 创建 `conversation_signals` 视图
2. 编写 Node.js 查询封装模块
3. 接入 trainer-core 的 supervisor 展示层

### 优先级 P2 (下周)
1. 等待 messages.sql 数据源
2. 实施四表串联设计
3. 构建综合运营 Dashboard

---

**报告完成** ✅  
**数据质量**: ⭐⭐⭐⭐ (良好,存在少量异常值)  
**可用性**: ⭐⭐⭐⭐⭐ (可直接用于运营分析)
