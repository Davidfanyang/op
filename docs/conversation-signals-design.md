# Conversation Signals 接入设计

> 创建时间: 2026-04-11  
> 状态: ✅ 已完成基础层,待接入 supervisor/risk 层

---

## 一、定位与原则

### 1.1 战略定位

```
┌─────────────────────────────────────────┐
│   trainer-core 现有架构                 │
│   ┌───────────────────────────────┐    │
│   │ evaluation (AI语义评分)       │    │
│   │ review (主管复核)             │    │
│   │ feedback (反馈收集)           │    │
│   └───────────────┬───────────────┘    │
│                   │                     │
│          🆕 接入点                     │
│                   ▼                     │
│   ┌───────────────────────────────┐    │
│   │ Conversation Signals Layer    │    │
│   │ (会话过程风险信号)             │    │
│   └───────────────┬───────────────┘    │
│                   │                     │
│                   ▼                     │
│   pai_dashboard.conversations          │
│   (会话级事实表)                       │
└─────────────────────────────────────────┘
```

### 1.2 核心原则

✅ **DO**:
- 作为**独立监督信号层**,为 supervisor/review 提供辅助决策
- 关注**会话过程风险** (效率/合规/异常)
- 与 AI 语义评分**互补**,不替代

❌ **DON'T**:
- 不直接修改 training 评分 prompt
- 不改动 evaluation score 主链
- 不急于接入 NLP/语义分析

---

## 二、当前信号清单 (4个正式信号)

| 信号名 | 类型 | 判定规则 | 风险等级 | 业务含义 |
|--------|------|---------|---------|---------|
| `is_sla_risk` | 效率风险 | `first_response_sla_breached = 1` | 🔴 高 | 首响超时,违反SLA |
| `is_invalid_conversation` | 数据质量 | `is_valid = 0` | 🔴 高 | 会话数据无效,不应参与评估 |
| `is_unclosed_conversation` | 流程风险 | `status='open' AND end_time IS NULL` | ⚠️ 中 | 会话未正确关闭,需跟进 |
| `is_high_message_count` | 复杂度风险 | `message_count > 50` | ⚠️ 中 | 高复杂度会话,可能需主管复核 |

### 2.1 暂不启用的信号 (脏数据)

| 信号名 | 原因 | 状态 |
|--------|------|------|
| `is_reopened` | `reopen_count` 全为 0,疑似未计算 | ❌ 禁用 |
| `is_long_conversation` | `is_long` 全为 0,疑似未计算 | ❌ 禁用 |

> 📌 **后续方案**: 等 messages.sql 接入后,从消息流水重新计算这两个信号

---

## 三、已交付物

### 3.1 数据层

✅ **MySQL 视图**: `conversation_signals`
```sql
-- 位置: pai_dashboard.conversation_signals
-- 包含: 原始字段 + 4个信号字段 + conversation_duration_seconds
```

### 3.2 服务层

✅ **Node.js 模块**: [core/conversation-signals.js](file:///Users/adime/.openclaw/workspace/trainer-core/core/conversation-signals.js)

**核心方法**:
```javascript
class ConversationSignalsService {
  // 1. 获取单个会话信号
  async getSignalsByConversation(conversationId)
  
  // 2. 按客服统计 (支持单个/全部/时间范围)
  async getSignalsByAgent(agentTag, dateRange)
  
  // 3. 查询风险会话 (支持多信号过滤)
  async getRiskConversations(filters)
  
  // 4. 全局运营统计
  async getGlobalStats()
}
```

### 3.3 测试验证

✅ **测试脚本**: [scripts/test-conversation-signals.js](file:///Users/adime/.openclaw/workspace/trainer-core/scripts/test-conversation-signals.js)

**测试结果**: ✅ 全部通过
- 全局统计: 4,269 会话, 192 SLA风险, 94 高消息
- 单个会话: 正确返回 4 个信号
- 按客服统计: 12 名客服数据完整
- 风险查询: 正确过滤 SLA 风险会话

---

## 四、接入 supervisor/risk 层的设计

### 4.1 接入位置

**推荐接入点**: `core/ai-decision.js` 或新建 `core/risk-assessor.js`

```
supervisor-api.js
    ↓ 调用
risk-assessor.js (🆕 新增)
    ↓ 查询
conversation-signals.js (✅ 已完成)
    ↓ 读取
pai_dashboard.conversation_signals
```

### 4.2 接入方式示例

#### 方案 A: 在 supervisor review 时附加风险信号

```javascript
// core/risk-assessor.js
const ConversationSignalsService = require('./conversation-signals');

class RiskAssessor {
  constructor() {
    this.signalsService = new ConversationSignalsService();
  }

  /**
   * 在主管复核时,附加会话风险信号
   */
  async enrichReviewWithContext(reviewData) {
    const { conversation_id, agent_tag } = reviewData;
    
    // 获取会话信号
    const signals = await this.signalsService.getSignalsByConversation(conversation_id);
    
    // 获取客服历史统计
    const agentStats = await this.signalsService.getSignalsByAgent(agent_tag);
    
    // 附加到 review 上下文
    return {
      ...reviewData,
      conversation_signals: {
        is_sla_risk: signals?.is_sla_risk || 0,
        is_invalid: signals?.is_invalid_conversation || 0,
        is_unclosed: signals?.is_unclosed_conversation || 0,
        is_high_message: signals?.is_high_message_count || 0
      },
      agent_context: {
        total_sessions: agentStats?.total_conversations || 0,
        sla_risk_rate: agentStats?.sla_risk_count / agentStats?.total_conversations || 0,
        invalid_rate: agentStats?.invalid_count / agentStats?.total_conversations || 0
      }
    };
  }
}
```

#### 方案 B: 风险会话列表推送

```javascript
// 每日定时任务: 推送高风险会话给主管
async function pushDailyRiskReport() {
  const signalsService = new ConversationSignalsService();
  
  // 查询今日风险会话
  const today = new Date().toISOString().split('T')[0];
  const risks = await signalsService.getRiskConversations({
    dateRange: { start: `${today} 00:00:00`, end: `${today} 23:59:59` },
    limit: 50
  });
  
  // 按风险类型分组
  const grouped = {
    sla_risks: risks.filter(r => r.is_sla_risk),
    invalid: risks.filter(r => r.is_invalid_conversation),
    unclosed: risks.filter(r => r.is_unclosed_conversation),
    high_message: risks.filter(r => r.is_high_message_count)
  };
  
  // 发送给主管 (Telegram/邮件等)
  await sendRiskReportToSupervisor(grouped);
}
```

### 4.3 不修改的部分

❌ **以下模块保持不变**:
- `core/ai-evaluator.js` - AI 评分逻辑不动
- `core/evaluator.js` - 传统评分逻辑不动
- `core/trainer.js` - 训练模式逻辑不动
- evaluation prompt - 不加入 signals

---

## 五、运营统计输出 (最小可用)

### 5.1 SQL 直接查询

```sql
SELECT 
  agent_tag as '客服',
  COUNT(*) as '会话数',
  SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) as 'open数',
  SUM(CASE WHEN is_valid = 0 THEN 1 ELSE 0 END) as 'invalid数',
  SUM(CASE WHEN first_response_sla_breached = 1 THEN 1 ELSE 0 END) as 'SLA超时数',
  ROUND(AVG(first_response_seconds), 0) as '平均首响(秒)',
  SUM(CASE WHEN message_count > 50 THEN 1 ELSE 0 END) as '高消息会话数'
FROM conversations
WHERE agent_tag IS NOT NULL
GROUP BY agent_tag
ORDER BY COUNT(*) DESC;
```

### 5.2 Node.js 调用

```javascript
const signalsService = new ConversationSignalsService();

// 获取全部客服统计
const allAgents = await signalsService.getSignalsByAgent(null);

// 获取单个客服统计
const lingling = await signalsService.getSignalsByAgent('玲玲');
```

### 5.3 实际输出 (已验证)

| 客服 | 会话数 | open | invalid | SLA超时 | 高消息 | 平均首响 |
|------|--------|------|---------|---------|--------|----------|
| 玲玲 | 940 | 31 | 57 | 51 | 28 | 29,687s |
| 小艾 | 787 | 35 | 68 | 34 | 16 | 17,588s |
| 乐多 | 666 | 18 | 41 | 27 | 8 | 31,039s |
| 小玉 | 546 | 27 | 57 | 25 | 15 | 20,668s |
| 小明 | 284 | 14 | 28 | 7 | 5 | 22,536s |
| 小美 | 247 | 7 | 17 | 18 | 8 | 5,801s |
| 艾斯 | 194 | 14 | 20 | 10 | 5 | 1,070s |
| 小林 | 129 | 8 | 14 | 5 | 1 | 32,321s |
| 小熊 | 128 | 2 | 12 | 9 | 3 | 7,147s |
| 小凡 | 35 | 2 | 6 | 5 | 0 | 678s |
| 小派 | 33 | 1 | 3 | 1 | 0 | 30s |
| 豆包 | 2 | 0 | 0 | 0 | 0 | 85s |

---

## 六、下一步: messages.sql 接入设计

> 📌 **仅设计,不实施**

### 6.1 四表串联架构

```
┌──────────────────┐
│  conversations   │ 会话事实表 (✅ 已接入)
│  (会话级聚合)    │
└────────┬─────────┘
         │ 1:N (chat_id + 时间窗口)
         ▼
┌──────────────────┐
│    messages      │ 消息明细表 (🔄 待接入)
│  (消息流水)      │
└────────┬─────────┘
         │ N:1 (session_id 映射)
         ▼
┌──────────────────┐
│  evaluations     │ AI评估记录 (✅ 已存在)
│  (评分/发现)     │
└────────┬─────────┘
         │ 1:1 (evaluation_id)
         ▼
┌──────────────────┐
│    reviews       │ 主管复核记录 (✅ 已存在)
│  (复核/采纳)     │
└──────────────────┘
```

### 6.2 接入步骤

#### Step 1: 导入 messages.sql
```bash
mysql -u root --password='' pai_dashboard < /path/to/messages.sql
```

#### Step 2: 验证关联键
```sql
-- 检查 chat_id 覆盖度
SELECT 
  COUNT(DISTINCT c.chat_id) as conv_chat_ids,
  COUNT(DISTINCT m.chat_id) as msg_chat_ids,
  COUNT(DISTINCT CASE WHEN m.chat_id IN (SELECT chat_id FROM conversations) THEN m.chat_id END) as matched
FROM conversations c
CROSS JOIN messages m;

-- 检查时间窗口匹配
SELECT 
  c.id as conv_id,
  c.chat_id,
  c.start_time,
  c.end_time,
  COUNT(m.id) as msg_count_in_window
FROM conversations c
LEFT JOIN messages m 
  ON c.chat_id = m.chat_id 
  AND m.sent_at BETWEEN c.start_time AND COALESCE(c.end_time, NOW())
GROUP BY c.id
LIMIT 100;
```

#### Step 3: 增强 signals 层

**从 messages 表重新计算脏字段**:

```sql
CREATE OR REPLACE VIEW conversation_signals_enhanced AS
SELECT 
  cs.*,
  
  -- 从 messages 重新计算 is_long
  CASE WHEN cs.message_count > 100 THEN 1 ELSE 0 END as is_long_conversation_recalc,
  
  -- 从 messages 计算对话节奏信号
  (
    SELECT AVG(TIMESTAMPDIFF(SECOND, m1.sent_at, m2.sent_at))
    FROM messages m1
    JOIN messages m2 ON m1.id = m2.id - 1
    WHERE m1.chat_id = cs.chat_id 
    AND m1.sent_at BETWEEN cs.start_time AND COALESCE(cs.end_time, NOW())
  ) as avg_message_interval_seconds,
  
  -- 客户等待时间分布
  (
    SELECT PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY wait_time)
    FROM (
      SELECT TIMESTAMPDIFF(SECOND, m.sent_at, 
        LEAD(m.sent_at) OVER (ORDER BY m.sent_at)
      ) as wait_time
      FROM messages m
      WHERE m.chat_id = cs.chat_id
      AND m.sender_role = 'customer'
      AND m.sent_at BETWEEN cs.start_time AND COALESCE(cs.end_time, NOW())
    ) waits
  ) as customer_wait_p90

FROM conversation_signals cs;
```

#### Step 4: 完整链路查询示例

```sql
-- 从会话 → 消息 → 评估 → 复核 完整链路
SELECT 
  c.id as conversation_id,
  c.agent_tag,
  c.first_response_seconds,
  c.is_sla_risk,
  
  -- 消息层
  COUNT(DISTINCT m.id) as actual_message_count,
  SUM(CASE WHEN m.sender_role = 'customer' THEN 1 ELSE 0 END) as customer_msgs,
  SUM(CASE WHEN m.sender_role = 'agent' THEN 1 ELSE 0 END) as agent_msgs,
  
  -- 评估层
  AVG(e.score) as avg_ai_score,
  SUM(CASE WHEN e.alert_level = 'critical' THEN 1 ELSE 0 END) as critical_alerts,
  
  -- 复核层
  SUM(CASE WHEN r.is_adopted = 1 THEN 1 ELSE 0 END) as adopted_reviews,
  SUM(CASE WHEN r.review_decision = 'rejected' THEN 1 ELSE 0 END) as rejected_reviews

FROM conversations c
LEFT JOIN messages m 
  ON c.chat_id = m.chat_id 
  AND m.sent_at BETWEEN c.start_time AND COALESCE(c.end_time, NOW())
LEFT JOIN evaluations e ON c.id = e.session_id  -- 需建立映射关系
LEFT JOIN reviews r ON e.evaluation_id = r.evaluation_id

WHERE c.agent_tag = '玲玲'
GROUP BY c.id
ORDER BY c.start_time DESC;
```

#### Step 5: 输出综合运营报告

**新增指标**:
- 真实 reopen 率 (基于消息断裂/重连模式)
- 对话节奏异常 (消息间隔突增/突减)
- 客户等待时间 P90
- 消息数 vs 评估数 覆盖率
- 复核采纳率 vs 风险信号 关联性

---

## 七、当前完成度

| 模块 | 状态 | 文件 |
|------|------|------|
| conversations 导入 | ✅ 完成 | `pai_dashboard.conversations` |
| conversation_signals 视图 | ✅ 完成 | MySQL View |
| ConversationSignalsService | ✅ 完成 | [core/conversation-signals.js](file:///Users/adime/.openclaw/workspace/trainer-core/core/conversation-signals.js) |
| 测试验证 | ✅ 完成 | [scripts/test-conversation-signals.js](file:///Users/adime/.openclaw/workspace/trainer-core/scripts/test-conversation-signals.js) |
| 运营统计输出 | ✅ 完成 | 12名客服统计 |
| supervisor/risk 接入 | 🔄 待实施 | 需确定接入点 |
| messages.sql 接入 | 📋 设计中 | 等待数据源 |

---

## 八、建议下一步行动

### P0 (立即)
1. ✅ 已完成: 验真数据、创建 signals 层、最小统计输出
2. 确定 supervisor/risk 层具体接入位置 (方案 A 或 B)

### P1 (本周)
1. 实施 supervisor review 时附加风险信号
2. 建立每日风险会话推送机制

### P2 (下周)
1. 等待 messages.sql 数据源
2. 实施四表串联设计
3. 重新计算 `is_reopened` 和 `is_long_conversation`

---

**设计完成** ✅  
**定位清晰**: 会话过程风险信号,辅助 supervisor 决策  
**边界明确**: 不改 evaluation 主链,不碰 training prompt
