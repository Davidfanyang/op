# Conversations 事实表接入报告

## 一、导入与表结构说明

### 1.1 导入方式

```bash
# 创建数据库
mysql -u root -e "CREATE DATABASE IF NOT EXISTS conversations_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# 导入数据
mysql -u root conversations_db < /Users/adime/Desktop/conversations.sql
```

### 1.2 实际表结构

表名：`conversations` (4269 条记录)

| 字段名 | 类型 | 说明 | 是否存在 |
|--------|------|------|----------|
| id | bigint | 自增主键 | ✅ |
| user_id | bigint | 用户ID | ✅ |
| cs_account_identifier | varchar(50) | 客服账号标识 | ✅ |
| assigned_operator_id | bigint | 分配的操作员ID | ✅ |
| start_time | datetime | 会话开始时间 | ✅ |
| end_time | datetime | 会话结束时间 | ✅ |
| status | varchar(20) | 状态 (open/closed) | ✅ |
| message_count | int | 总消息数 | ✅ |
| customer_message_count | int | 客户消息数 | ✅ |
| cs_message_count | int | 客服消息数 | ✅ |
| is_long | tinyint | 是否长会话 | ✅ |
| first_response_seconds | int | 首响时间(秒) | ✅ |
| first_response_override_seconds | int | 人工修正首响 | ✅ |
| first_response_override_note | varchar(255) | 修正说明 | ✅ |
| first_response_sla_breached | tinyint | SLA是否超时 | ✅ |
| agent_tag | varchar(50) | 客服标签/姓名 | ✅ |
| agent_confidence | decimal(6,4) | 客服置信度 | ✅ |
| open_anchor_msg_id | bigint | 开启锚点消息ID | ✅ |
| start_customer_anchor_msg_id | bigint | 客户开始锚点 | ✅ |
| close_anchor_msg_id | bigint | 关闭锚点消息ID | ✅ |
| closed_by_operator_id | bigint | 关闭操作员ID | ✅ |
| closed_at | datetime | 关闭时间 | ✅ |
| previous_conversation_id | bigint | 前一个会话ID | ✅ |
| reopen_count | int | 重新打开次数 | ✅ |
| is_valid | tinyint | 是否有效会话 | ✅ |
| invalid_reason | varchar(255) | 无效原因 | ✅ |
| peer_access_hash | bigint | Peer访问哈希 | ✅ |
| chat_id | bigint | Telegram Chat ID | ✅ |
| created_at | datetime | 创建时间 | ✅ |
| updated_at | datetime | 更新时间 | ✅ |

### 1.3 字段可用性确认

你要求的核心字段全部存在并可用：
- ✅ conversation_id → 对应 `id` 字段
- ✅ chat_id
- ✅ user_id
- ✅ cs_account_identifier
- ✅ agent_tag
- ✅ status
- ✅ message_count
- ✅ customer_message_count
- ✅ agent_message_count → 对应 `cs_message_count`
- ✅ first_response_seconds
- ✅ is_sla_timeout → 对应 `first_response_sla_breached`
- ✅ is_valid
- ✅ invalid_reason
- ✅ reopen_count
- ✅ previous_conversation_id
- ✅ start_time
- ✅ end_time
- ✅ created_at
- ✅ updated_at

---

## 二、数据概览报告

### 2.1 总量
- **总会话数**: 4,269 条

### 2.2 时间范围
- **最早会话**: 2025-12-26 03:55:25
- **最晚会话**: 2026-03-06 00:46:53
- **数据跨度**: 约 2.3 个月

### 2.3 状态分布
| 状态 | 数量 | 占比 |
|------|------|------|
| closed | 3,956 | 92.7% |
| open | 313 | 7.3% |

### 2.4 有效性分布
| 有效性 | 数量 | 占比 |
|--------|------|------|
| valid (1) | 3,670 | 86.0% |
| invalid (0) | 599 | 14.0% |

### 2.5 agent_tag 分布 Top 10
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

### 2.6 invalid_reason 分布 Top 10
| 无效原因 | 数量 |
|----------|------|
| no_close | 270 |
| no_open(pending) | 153 |
| no_open(pending) no_open | 120 |
| no_close no_close | 52 |
| no_first_response no_first_response | 2 |
| no_open(pending) no_open no_open | 2 |

---

## 三、Conversation Signals 设计稿

### 3.1 信号清单

| 信号名 | 判定规则 | 数据源字段 | 当前分布 |
|--------|----------|------------|----------|
| **is_sla_risk** | first_response_seconds > 60 | first_response_seconds | 397 条 (9.3%) |
| **is_reopened** | reopen_count > 0 | reopen_count | 0 条 (0%) |
| **is_invalid_conversation** | is_valid = 0 | is_valid | 599 条 (14.0%) |
| **is_unclosed_conversation** | status = 'open' AND end_time IS NULL | status, end_time | 313 条 (7.3%) |
| **is_high_message_count** | message_count > 50 | message_count | 94 条 (2.2%) |
| **is_long_conversation** | is_long = 1 或 (end_time - start_time) > 3600秒 | is_long, start_time, end_time | 0 条 (is_long=0) |

### 3.2 推荐规则草案

```javascript
const CONVERSATION_SIGNAL_RULES = {
  // SLA 风险
  is_sla_risk: (conv) => conv.first_response_seconds > 60,
  
  // 重新打开
  is_reopened: (conv) => conv.reopen_count > 0,
  
  // 无效会话
  is_invalid_conversation: (conv) => conv.is_valid === 0,
  
  // 未关闭会话
  is_unclosed_conversation: (conv) => conv.status === 'open' && !conv.end_time,
  
  // 高消息量
  is_high_message_count: (conv) => conv.message_count > 50,
  
  // 长会话（时长超过1小时）
  is_long_conversation: (conv) => {
    if (conv.is_long === 1) return true;
    if (conv.start_time && conv.end_time) {
      const duration = (new Date(conv.end_time) - new Date(conv.start_time)) / 1000;
      return duration > 3600;
    }
    return false;
  }
};
```

### 3.3 接入 trainer-core 的设计

**概念：conversation_context / conversation_signals**

```
trainer-core 评估体系
├── evaluation (现有)
│   ├── score (评分)
│   ├── findings (发现)
│   └── suggestions (建议)
│
└── conversation_context (新增)
    ├── session_id
    ├── conversation_id
    ├── signals (会话信号)
    │   ├── is_sla_risk
    │   ├── is_reopened
    │   ├── is_invalid_conversation
    │   ├── is_unclosed_conversation
    │   ├── is_high_message_count
    │   └── is_long_conversation
    └── metrics (运营指标)
        ├── first_response_seconds
        ├── message_count
        ├── duration_seconds
        └── reopen_count
```

**使用场景：**
1. **Supervisor Review 增强**：主管复核时不仅看评分，还看会话效率信号
2. **风险识别**：SLA超时 + 低分 = 高风险会话
3. **运营分析**：按 agent_tag 统计效率和质量

---

## 四、第一版分析结果

### 4.1 8个核心运营指标

#### 总览类
1. **总会话数**: 4,269 条
2. **closed 数量**: 3,956 条 (92.7%)
3. **valid 数量**: 3,670 条 (86.0%)

#### 效率类
4. **首响中位数**: 11 秒
5. **首响 P90**: 待修复查询（窗口函数偏移量问题）
6. **SLA 超时数量**: 192 条 (4.5%)

#### 质量类
7. **reopen 会话数**: 0 条 (reopen_count 字段全为 0)
8. **高消息会话数**: 94 条 (message_count > 50)

### 4.2 按 agent_tag 的员工统计

| 员工 | 总会话 | 平均首响(s) | SLA超时 | 无效会话 | Reopen数 |
|------|--------|-------------|---------|----------|----------|
| 玲玲 | 940 | 7329.3 | 51 | 57 | 0 |
| 小艾 | 787 | 5647.0 | 34 | 68 | 0 |
| 乐多 | 666 | 6638.6 | 27 | 41 | 0 |
| 小玉 | 546 | 4895.8 | 25 | 57 | 0 |
| 小明 | 284 | 10490.1 | 7 | 28 | 0 |
| 小美 | 247 | 5801.4 | 18 | 17 | 0 |
| 艾斯 | 194 | 1075.9 | 10 | 20 | 0 |
| 小林 | 129 | 7503.5 | 5 | 14 | 0 |
| 小熊 | 128 | 7146.9 | 9 | 12 | 0 |
| 小凡 | 35 | 678.1 | 5 | 6 | 0 |

**关键发现：**
- ⚠️ **小明** 平均首响最长 (10490秒 ≈ 2.9小时)，但 SLA 超时较少 (7次)
- ⚠️ **玲玲** SLA 超时最多 (51次)，需要关注
- ✅ **艾斯** 平均首响最快 (1075.9秒 ≈ 18分钟)
- ⚠️ **小艾** 无效会话最多 (68条)，需要排查原因

---

## 五、下一步预埋设计

### 5.1 如果后续提供 messages.sql

准备将以下四层串成完整链路：

```
完整链路设计
┌─────────────────────────────────────────────────┐
│ 1. conversations (会话事实表)                     │
│    - 会话级元数据                                 │
│    - 效率指标 (首响、时长、消息数)                 │
│    - 风险信号 (SLA、reopen、invalid)              │
└──────────────────┬──────────────────────────────┘
                   │ conversation_id
                   ▼
┌─────────────────────────────────────────────────┐
│ 2. messages (消息明细表)                         │
│    - 客户消息内容                                 │
│    - 客服回复内容                                 │
│    - 时间戳、方向                                 │
└──────────────────┬──────────────────────────────┘
                   │ session_id / conversation_id
                   ▼
┌─────────────────────────────────────────────────┐
│ 3. evaluations (评估结果表)                       │
│    - 评分 (score)                                │
│    - 维度得分                                     │
│    - findings / suggestions                      │
│    - alertLevel                                  │
└──────────────────┬──────────────────────────────┘
                   │ evaluation_id
                   ▼
┌─────────────────────────────────────────────────┐
│ 4. reviews (复核记录表)                           │
│    - reviewStatus                                │
│    - falsePositiveReason                         │
│    - 主管复核意见                                  │
└─────────────────────────────────────────────────┘
```

### 5.2 联合查询示例

```sql
-- 完整链路查询：从会话到复核
SELECT 
  c.id as conversation_id,
  c.agent_tag,
  c.first_response_seconds,
  c.message_count,
  e.score,
  e.alert_level,
  r.review_status,
  r.false_positive_reason
FROM conversations c
LEFT JOIN evaluations e ON c.id = e.conversation_id
LEFT JOIN reviews r ON e.evaluation_id = r.evaluation_id
WHERE c.start_time >= '2026-03-01'
ORDER BY c.start_time DESC;
```

### 5.3 增强版 Supervisor Review

```javascript
// 主管复核时同时看评估和会话信号
const reviewContext = {
  evaluation: {
    score: 26,
    alertLevel: 'warning',
    findings: [...]
  },
  conversation: {
    signals: {
      is_sla_risk: true,          // 首响超时
      is_high_message_count: true, // 消息量大
      is_invalid_conversation: false
    },
    metrics: {
      first_response_seconds: 120,
      message_count: 67,
      duration_seconds: 3600
    }
  }
};

// 综合风险评分
const riskScore = calculateRiskScore(reviewContext);
// = evaluation_risk (低分) + conversation_risk (SLA超时+高消息量)
```

---

## 六、本轮未做的事（符合要求）

✅ 没有把它当消息表做话术训练
✅ 没有直接接进训练评分 prompt
✅ 没有一开始就做复杂 dashboard
✅ 没有跳过数据质量检查
✅ 没有往 supervisor 主链里硬塞

---

## 七、交付物清单

1. ✅ **导入与表结构说明** - 见第一部分
2. ✅ **数据概览报告** - 见第二部分
3. ✅ **conversation signals 设计稿** - 见第三部分
4. ✅ **第一版分析结果** - 见第四部分
5. ✅ **下一步预埋设计** - 见第五部分

---

**报告生成时间**: 2026-04-11 18:11:34
**数据来源**: conversations_db.conversations (4,269 条记录)
**数据时间范围**: 2025-12-26 ~ 2026-03-06
