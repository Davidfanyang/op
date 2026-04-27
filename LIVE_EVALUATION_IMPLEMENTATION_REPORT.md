# 实时质检分析入库能力实现报告

## 一、实现概述

本次实现为 trainer-core 添加了**实时质检分析入库能力**，将真实会话 conversation 正式送入分析链路，拿到结构化分析结果，并将"会话 + 分析结果"统一入库。

### 实现范围
- ✅ 新增 `services/live-evaluation-service.js` 实时质检服务
- ✅ 新增 3 张 live 数据表（live_sessions, live_messages, live_evaluations）
- ✅ 新增 Repository 层（接口 + 内存实现）
- ✅ 集成到 `start-live-listener.js` 实时链路
- ✅ 创建验证脚本

### 未修改范围（严格遵守）
- ❌ 未修改 core 分析逻辑
- ❌ 未修改输入输出协议定义
- ❌ 未修改 engineService 对外协议
- ❌ 未改动训练系统逻辑
- ❌ 未修改审核流逻辑
- ❌ 未修改知识库逻辑
- ❌ 未修改 Web 相关模块

---

## 二、核心架构

### 2.1 数据流向
```
TG 消息
  ↓
TGLiveListener (适配器)
  ↓
LiveMessageIngestor (入口服务)
  ↓
LiveConversationBuilder (会话拼接)
  ↓
LiveEvaluationService (实时质检) ← 本次新增
  ↓
统一引擎入口 (evaluation-service)
  ↓
分析结果
  ↓
live_sessions / live_messages / live_evaluations (入库)
```

### 2.2 核心设计原则

#### 原则1：必须复用统一输入协议 ✅
```javascript
{
  project: 'default',
  conversation: [...],
  current_reply: '客服回复内容',
  metadata: {
    source: 'tg_live',
    session_id: 'live_xxx',
    agent_id: '123456',
    timestamp: '2026-04-17T...',
    entry_type: 'live_monitor',
    chat_id: '-100xxxx',
    message_id: '1001',
    sender_name: 'agent001'
  },
  rules: {}
}
```

#### 原则2：必须走统一引擎调用入口 ✅
```javascript
// 通过 evaluation-service.evaluate() 统一入口
const analysisResult = await evaluate(analysisInput);
```

#### 原则3：必须保存"原始会话 + 分析结果" ✅
- ✅ 保存原始 conversation（live_messages 表）
- ✅ 保存当前客服回复（live_evaluations.current_reply）
- ✅ 保存引擎输入对象（live_evaluations.input_payload）
- ✅ 保存引擎输出对象（live_evaluations.output_payload）
- ✅ 保存关键分析字段（scenario, stage, judgement, summary, confidence）

#### 原则4：实时数据必须与训练数据隔离 ✅
- ✅ 独立的 live_sessions 表（不与 sessions 混用）
- ✅ 独立的 live_messages 表（不与 messages 混用）
- ✅ 独立的 live_evaluations 表（不与 evaluations 混用）
- ✅ session_key 以 `live_` 开头，明确区分

#### 原则5：分析触发对象必须是"当前客服回复" ✅
```javascript
_shouldTriggerAnalysis(currentMessage, conversationResult) {
  // 条件 1: 必须是 agent 消息
  if (role !== 'agent') return false;
  
  // 条件 2: 不能重复分析
  if (analyzedMessageIds.has(message_id)) return false;
  
  // 条件 3: current_reply 不能为空
  if (!message_text || message_text.trim() === '') return false;
  
  // 条件 4: conversation 必须非空
  if (!conversation || conversation.length === 0) return false;
  
  return true;
}
```

---

## 三、数据库表设计

### 3.1 live_sessions（实时会话表）
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | BIGINT | 是 | 自增主键 |
| session_id | VARCHAR(128) | 是 | 唯一键（对应 session_key） |
| project | VARCHAR(64) | 是 | 项目标识 |
| chat_id | VARCHAR(64) | 是 | Telegram 会话 ID |
| agent_id | VARCHAR(64) | 否 | 客服ID |
| status | VARCHAR(32) | 是 | active/closed |
| started_at | DATETIME | 是 | 会话开始时间 |
| updated_at | DATETIME | 是 | 最后更新时间 |
| created_at | DATETIME | 是 | 创建时间 |

### 3.2 live_messages（实时消息表）
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | BIGINT | 是 | 自增主键 |
| message_id | VARCHAR(64) | 是 | 唯一键（Telegram 消息 ID） |
| session_id | VARCHAR(128) | 是 | 所属实时会话 ID |
| role | VARCHAR(16) | 是 | user/agent |
| sender_id | VARCHAR(64) | 是 | 发送人 ID |
| sender_name | VARCHAR(128) | 否 | 发送人显示名 |
| content | TEXT | 是 | 消息内容 |
| timestamp | DATETIME | 是 | 消息时间 |
| created_at | DATETIME | 是 | 入库时间 |

### 3.3 live_evaluations（实时质检评估表）
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | BIGINT | 是 | 自增主键 |
| evaluation_id | VARCHAR(64) | 是 | 唯一键 |
| session_id | VARCHAR(128) | 是 | 所属实时会话 ID |
| message_id | VARCHAR(64) | 是 | 唯一键（触发分析的客服消息 ID） |
| project | VARCHAR(64) | 是 | 项目标识 |
| current_reply | TEXT | 是 | 当前被分析的客服回复 |
| input_payload | JSON | 是 | 调引擎时的输入对象 |
| output_payload | JSON | 是 | 引擎返回原始结果 |
| scenario | VARCHAR(128) | 否 | 场景识别结果 |
| stage | VARCHAR(64) | 否 | 阶段判断结果 |
| judgement | TEXT | 否 | 结论 |
| summary | TEXT | 否 | 总结 |
| confidence | DECIMAL(5,2) | 否 | 置信度 |
| created_at | DATETIME | 是 | 创建时间 |

---

## 四、核心功能实现

### 4.1 实时质检服务（LiveEvaluationService）

#### 主入口：processConversation()
```javascript
async processConversation(conversationResult, currentMessage) {
  // 步骤 1: 确定当前消息是否需要分析
  const shouldAnalyze = this._shouldTriggerAnalysis(currentMessage, conversationResult);
  
  if (!shouldAnalyze) {
    // 仅入库消息
    await this._saveSessionAndMessages(conversationResult, currentMessage);
    return { success: true, analyzed: false };
  }

  // 步骤 2: 写入 live_sessions 和 live_messages
  await this._saveSessionAndMessages(conversationResult, currentMessage);

  // 步骤 3: 组装标准分析输入对象
  const analysisInput = this._buildAnalysisInput(conversationResult, currentMessage);

  // 步骤 4: 调用统一引擎入口
  const analysisResult = await this._callAnalysisEngine(analysisInput);

  // 步骤 5: 承接分析结果并入库
  const evaluationRecord = await this._saveEvaluation(
    session_key,
    message_id,
    analysisInput,
    analysisResult
  );

  return { success: true, analyzed: true, evaluation: evaluationRecord };
}
```

#### 触发规则判断
```javascript
_shouldTriggerAnalysis(currentMessage, conversationResult) {
  const { role, message_id, message_text } = currentMessage;
  const { conversation } = conversationResult;

  // 条件 1: 必须是 agent 消息
  if (role !== 'agent') return false;

  // 条件 2: 不能重复分析
  if (this.analyzedMessageIds.has(String(message_id))) return false;

  // 条件 3: current_reply 不能为空
  if (!message_text || message_text.trim() === '') return false;

  // 条件 4: conversation 必须非空
  if (!conversation || conversation.length === 0) return false;

  return true;
}
```

#### 标准输入协议组装
```javascript
_buildAnalysisInput(conversationResult, currentMessage) {
  return {
    project: this.project,
    conversation: conversationResult.conversation.map(msg => ({
      role: msg.role,
      content: msg.content,
      timestamp: msg.timestamp
    })),
    current_reply: currentMessage.message_text,
    metadata: {
      source: 'tg_live',
      session_id: conversationResult.session_key,
      agent_id: String(currentMessage.sender_id),
      timestamp: currentMessage.timestamp,
      entry_type: 'live_monitor',
      chat_id: conversationResult.chat_id,
      message_id: String(currentMessage.message_id),
      sender_name: currentMessage.sender_name || 'unknown'
    },
    rules: this.rules
  };
}
```

### 4.2 Repository 层

#### 接口定义
- `LiveSessionsRepository` - 实时会话数据持久化抽象
- `LiveMessagesRepository` - 实时消息数据持久化抽象
- `LiveEvaluationsRepository` - 实时质检评估数据持久化抽象

#### 内存实现（用于开发和测试）
- `FileLiveSessionsRepository` - 内存存储
- `FileLiveMessagesRepository` - 内存存储
- `FileLiveEvaluationsRepository` - 内存存储

#### 核心方法
```javascript
// Sessions
createLiveSession(data)
updateLiveSession(sessionId, data)
getLiveSessionById(sessionId)

// Messages
createLiveMessage(data)
existsLiveMessage(messageId)
listLiveMessagesBySession(sessionId)

// Evaluations
createLiveEvaluation(data)
existsLiveEvaluationByMessageId(messageId)
listLiveEvaluationsBySession(sessionId)
```

---

## 五、入库关系

### 5.1 live_sessions
- 一段会话对应一条主记录
- 用 session_key 作为唯一键
- 首次出现创建，后续更新 updated_at

### 5.2 live_messages
- 每条进入 conversation 的真实消息都要写入
- **不能只写客服消息**
- **用户消息也必须保存**
- 按 message_id 去重

### 5.3 live_evaluations
- 每次客服消息触发分析时，写入一条
- **一条客服消息最多对应一次实时分析记录**
- 按 message_id 去重（UNIQUE 约束）

---

## 六、触发时机

### 6.1 触发条件（必须同时满足）
1. ✅ 当前消息角色为 agent
2. ✅ 该消息已成功拼入 conversation
3. ✅ 当前 conversation 非空
4. ✅ 当前消息未被重复分析

### 6.2 不触发的情况
- ❌ 当前消息是 user
- ❌ 当前消息为空
- ❌ 当前消息重复
- ❌ 当前 conversation 结构异常
- ❌ 当前会话未完成最小拼接要求

---

## 七、测试验证

### 7.1 验证脚本
**文件**: `scripts/verify-live-evaluation.js`

### 7.2 测试场景
| 场景 | 状态 | 说明 |
|------|------|------|
| 用户消息不触发分析 | ✅ | 仅 agent 消息触发 |
| 客服消息触发分析 | ✅ | 正确调用引擎 |
| 标准输入协议完整 | ✅ | 5 个必填字段完整 |
| 分析结果保存 | ✅ | output_payload 完整 |
| 重复消息不重复分析 | ✅ | 去重机制生效 |
| 多轮对话多次分析 | ✅ | 每次客服消息独立分析 |
| 数据隔离 | ✅ | live 表独立 |
| 完整会话还原 | ✅ | session/messages/evaluations 可查询 |

### 7.3 验收口径验证

| 标准 | 状态 | 说明 |
|------|------|------|
| 标准1: 真实 conversation 可以被成功送入分析链路 | ✅ | 通过 |
| 标准2: 分析调用使用统一输入协议，字段完整 | ✅ | 5 个字段完整 |
| 标准3: 分析调用通过统一引擎入口完成 | ✅ | 调用 evaluate() |
| 标准4: live_sessions/messages/evaluations 正确入库 | ✅ | 三类数据完整 |
| 标准5: 同一条客服消息不会重复分析入库 | ✅ | 去重机制生效 |
| 标准6: 基于 session_id 可还原完整数据 | ✅ | getSessionDetail() |

---

## 八、常见错误避免

### ❌ 错误1：只存分析结果，不存原始消息
**本次实现**：✅ 已避免
- live_messages 表保存所有消息（user + agent）
- live_evaluations.input_payload 保存完整输入

### ❌ 错误2：用户消息也触发分析
**本次实现**：✅ 已避免
- `_shouldTriggerAnalysis()` 严格判断 `role === 'agent'`

### ❌ 错误3：live 链路自己组一套私有输入结构
**本次实现**：✅ 已避免
- 严格复用统一输入协议 v1.0
- 5 个必填字段完全一致

### ❌ 错误4：同一 message_id 被重复分析
**本次实现**：✅ 已避免
- 内存去重：`analyzedMessageIds` Set
- 数据库去重：`message_id` UNIQUE 约束

### ❌ 错误5：训练表和 live 表混用
**本次实现**：✅ 已避免
- 独立的 live_sessions 表
- 独立的 live_messages 表
- 独立的 live_evaluations 表

---

## 九、接入点

### 9.1 修改前
```
TG 消息 → TGLiveListener → LiveMessageIngestor → LiveConversationBuilder → 标准 conversation 对象
```

### 9.2 修改后
```
TG 消息 
  → TGLiveListener 
  → LiveMessageIngestor 
  → LiveConversationBuilder 
  → LiveEvaluationService ← 新增
  → 统一引擎调用入口
  → 分析结果
  → live_sessions / live_messages / live_evaluations
```

---

## 十、后续扩展

本次实现仅完成**实时质检分析入库**，后续可接入：

1. **已知/未知问题分流**
   - 根据 analysisResult 进行分类
   - 已知问题 → 知识库匹配
   - 未知问题 → 审核队列

2. **告警路由**
   - 根据 riskLevel 触发告警
   - 路由到 supervisor_group

3. **统计面板**
   - 实时质检统计
   - 客服质量排行
   - 问题分布分析

4. **MySQL 持久化**
   - 替换内存 Repository 为 MySQL 实现
   - 实现数据持久化
   - 支持分布式部署

---

## 十一、注意事项

### 11.1 Repository 实现
当前使用**内存实现**（FileLiveXxxRepository），适用于：
- 开发和测试
- 单进程场景
- 临时验证

**生产环境必须**：
- 实现 MySQL Repository
- 创建表结构（schema.sql 已包含）
- 实现事务控制

### 11.2 去重机制
当前使用内存 Set 去重：
```javascript
this.analyzedMessageIds = new Set();
```

**生产环境建议**：
- 使用 Redis Set
- 设置 TTL（如 24 小时）
- 支持分布式去重

### 11.3 规则加载
当前 rules 传空对象 `{}`：
```javascript
this.rules = options.rules || {};
```

**后续需要**：
- 从 rule-loader 加载规则
- 根据 project 加载对应规则
- 支持规则热更新

---

## 十二、总结

✅ **完成判定标准全部满足**：

1. ✅ 真实 conversation 可以被成功送入分析链路
2. ✅ 分析调用使用统一输入协议，字段完整
3. ✅ 分析调用通过统一引擎入口完成，不绕开统一入口
4. ✅ live_sessions、live_messages、live_evaluations 三类数据都能正确入库
5. ✅ 同一条客服消息不会重复分析入库
6. ✅ 后续可以基于 session_id 还原原始会话、当前客服回复、分析结果

**代码质量**：
- 完整的设计原则遵循
- 清晰的模块职责划分
- 严格的输入校验和去重
- 详细的日志输出
- 充分的测试覆盖

**架构约束**：
- ✅ 不修改 core 分析逻辑
- ✅ 不修改输入输出协议
- ✅ 不修改 engineService
- ✅ 不改动训练系统逻辑
- ✅ 实时数据与训练数据完全隔离

---

## 十三、下一步

**《已知/未知问题分流执行单》**

因为实时质检结果已经出来了，下一步就该决定：
- 哪些是已知问题
- 哪些是未知问题
- 哪些要进入后续审核与知识闭环
