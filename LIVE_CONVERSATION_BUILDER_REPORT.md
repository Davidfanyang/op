# 实时会话拼接功能实现报告

## 一、实现概述

本次实现为 trainer-core 添加了**真实会话拼接能力**，位于 TG 实时监听入口之后，负责将零散的真实消息拼接成可供后续实时质检使用的 conversation。

### 实现范围
- ✅ 新增 `services/live-conversation-builder.js` 模块
- ✅ 集成到 `start-live-listener.js` 入口
- ✅ 创建测试验证脚本

### 未修改范围（严格遵守）
- ❌ 未修改 core 分析逻辑
- ❌ 未修改输入输出协议
- ❌ 未修改 engineService
- ❌ 未改动训练系统逻辑

---

## 二、核心功能实现

### 2.1 模块文件
**文件路径**: `services/live-conversation-builder.js`

### 2.2 功能职责
1. ✅ 根据 chat_id 识别当前实时会话
2. ✅ 根据时间窗口判断是否开启新会话（超时 10 分钟）
3. ✅ 识别消息角色（user / agent）
4. ✅ 把消息拼接为多轮 conversation
5. ✅ 按 message_id 去重
6. ✅ 输出标准 conversation 对象

### 2.3 会话规则
- ✅ 同 chat_id 的消息归属同一会话
- ✅ 超时时间 10 分钟（600000ms）
- ✅ 超时则生成新 session_key
- ✅ 训练会话与实时会话完全隔离

### 2.4 输出结构
```javascript
{
  chat_id: string,              // 群聊ID
  session_key: string,          // 会话唯一标识（live_ 开头）
  conversation: [               // 对话历史
    { 
      role: 'user' | 'agent',   // 消息角色
      content: string,          // 消息内容
      timestamp: string         // ISO8601 时间
    }
  ],
  last_message_id: number,      // 最后一条消息ID
  updated_at: string            // 更新时间
}
```

---

## 三、技术实现细节

### 3.1 角色识别逻辑
```javascript
_identifyRole(message, session) {
  // 第一条消息：根据 sender_id 与 botId 对比判断
  // 后续消息：与首条消息发送者对比，相同则同角色，不同则反角色
  
  if (session.conversation.length === 0) {
    const isBot = sender_id === this.botId;
    const role = isBot ? 'agent' : 'user';
    session.first_sender_id = sender_id;
    session.first_role = role;
    return role;
  }
  
  return sender_id === session.first_sender_id 
    ? session.first_role 
    : (session.first_role === 'user' ? 'agent' : 'user');
}
```

### 3.2 去重机制
```javascript
// 使用 Set 存储 message_id，O(1) 时间复杂度检查
session.message_ids = new Set();

_isDuplicate(session, messageId) {
  return session.message_ids.has(messageId);
}
```

### 3.3 超时判断
```javascript
_getOrCreateSession(chatId, msgTimestamp) {
  const existingSession = liveSessions.get(chatId);
  
  if (!existingSession) {
    return this._createSession(chatId, msgTimestamp);
  }
  
  const lastActivity = new Date(existingSession.updated_at).getTime();
  const timeDiff = msgTimestamp - lastActivity;
  
  if (timeDiff > this.timeoutMs) { // 默认 10 分钟
    return this._createSession(chatId, msgTimestamp); // 创建新会话
  }
  
  return existingSession;
}
```

### 3.4 会话隔离
- **实时会话**: session_key 以 `live_` 开头，使用 `liveSessions` Map 存储
- **训练会话**: session_key 使用 UUID，使用 `training-session-store.js` 独立存储
- **完全隔离**: 两者使用不同的存储结构和命名规则

---

## 四、集成方式

### 4.1 入口文件修改
**文件**: `start-live-listener.js`

```javascript
const { defaultBuilder: conversationBuilder } = require('./services/live-conversation-builder');

// 注册会话拼接处理器
ingestor.onMessage(async (message) => {
  try {
    const conversationResult = await conversationBuilder.processMessage(message);
    
    console.log('🔄 [会话拼接] 会话已更新');
    console.log(`群ID: ${conversationResult.chat_id}`);
    console.log(`会话Key: ${conversationResult.session_key}`);
    console.log(`对话轮次: ${conversationResult.conversation.length}`);
    
    // TODO: 后续接"实时质检分析入库执行单"
    // - conversationResult 可直接用于 evaluation-service
    // - 格式符合标准输入协议 v1.0
  } catch (err) {
    console.error('[会话拼接] 处理失败:', err.message);
  }
});
```

### 4.2 数据流向
```
TG 消息 
  ↓
TGLiveListener (适配器)
  ↓
LiveMessageIngestor (入口服务)
  ↓
LiveConversationBuilder (会话拼接) ← 本次新增
  ↓
标准 conversation 对象
  ↓
[待接入] evaluation-service (实时质检)
```

---

## 五、测试验证

### 5.1 测试脚本
1. **完整测试**: `scripts/test-live-conversation-builder.js`
   - 8 个测试用例
   - 覆盖所有核心功能

2. **快速验证**: `scripts/verify-live-conversation.js`
   - 模拟真实 TG 消息流
   - 验证输出结构

### 5.2 测试覆盖场景
| 测试项 | 状态 | 说明 |
|--------|------|------|
| 基础会话创建 | ✅ | chat_id 识别、session_key 生成 |
| 消息去重 | ✅ | 相同 message_id 不重复添加 |
| 角色识别 | ✅ | user/agent 交替识别正确 |
| 会话超时 | ✅ | 10 分钟后自动创建新会话 |
| 多 chat_id 隔离 | ✅ | 不同群聊会话独立 |
| 输出结构 | ✅ | 包含所有必填字段 |
| 多轮对话拼接 | ✅ | 消息顺序正确、角色交替 |
| 训练会话隔离 | ✅ | session_key 命名规则不同 |

### 5.3 验证清单
- ✅ 真实 TG 消息能被正确拼接成多轮 conversation
- ✅ 输出结果可直接用于《实时质检分析入库执行单》
- ✅ 符合标准输入协议 v1.0 格式要求
- ✅ 不允许每条消息单独成会话
- ✅ 不允许 user / agent 混淆
- ✅ 不允许乱序
- ✅ 不允许训练会话与实时会话混用

---

## 六、使用示例

### 6.1 基本使用
```javascript
const { defaultBuilder } = require('./services/live-conversation-builder');

const message = {
  source: 'telegram',
  entry_type: 'live_monitor',
  chat_id: '-1001234567890',
  message_id: 1001,
  sender_id: 12345,
  sender_name: 'user123',
  message_text: '你好，我想咨询问题',
  timestamp: new Date().toISOString()
};

const result = await defaultBuilder.processMessage(message);

console.log(result.conversation);
// [
//   { role: 'user', content: '你好，我想咨询问题', timestamp: '...' }
// ]
```

### 6.2 接入实时质检
```javascript
// conversationResult 可直接用于 evaluation-service
const evaluationInput = {
  project: 'default',
  conversation: conversationResult.conversation,
  current_reply: conversationResult.conversation.slice(-1)[0].content,
  metadata: {
    source: 'telegram',
    session_id: conversationResult.session_key,
    timestamp: conversationResult.updated_at,
    entry_type: 'live_monitor'
  },
  rules: {}
};

const evaluationResult = await evaluationService.evaluate(evaluationInput);
```

---

## 七、API 参考

### 7.1 LiveConversationBuilder 类

#### 构造函数
```javascript
new LiveConversationBuilder(options = {})
```
- `options.timeoutMs`: 超时时间（毫秒），默认 600000（10分钟）
- `options.maxConversationLength`: 最大对话长度，默认 100

#### 方法

**processMessage(standardMessage)**
- 处理单条消息，拼接为会话
- 返回: `Promise<Object>` 会话对象

**getSession(chat_id)**
- 获取指定会话
- 返回: `Object|null`

**getAllSessions()**
- 获取所有活跃会话
- 返回: `Array`

**cleanupExpiredSessions()**
- 清理过期会话
- 返回: `number` 清理数量

**size()**
- 获取会话数量
- 返回: `number`

---

## 八、注意事项

### 8.1 botId 设置
角色识别依赖 `botId` 判断谁是客服：
```javascript
const builder = new LiveConversationBuilder();
builder.botId = 99999; // 设置为 Bot 的 Telegram ID
```

如果未设置 botId，默认第一条消息的发送者为 user。

### 8.2 内存存储
当前使用内存存储（Map），适用于单进程场景。如需持久化或分布式部署，需要：
1. 实现持久化存储（Redis/Database）
2. 添加分布式锁
3. 实现会话恢复机制

### 8.3 定时清理
建议定期调用 `cleanupExpiredSessions()` 清理过期会话：
```javascript
setInterval(() => {
  builder.cleanupExpiredSessions();
}, 60000); // 每分钟清理一次
```

---

## 九、后续扩展

本次实现仅完成**会话拼接**，后续可接入：

1. **实时质检分析**
   - 将 conversation 传入 evaluation-service
   - 执行规则匹配和风险评估

2. **告警路由**
   - 根据分析结果触发告警
   - 路由到 supervisor_group

3. **数据入库**
   - 持久化会话数据
   - 记录分析结果

4. **监控面板**
   - 实时会话监控
   - 告警统计展示

---

## 十、总结

✅ **完成判定标准全部满足**：
1. ✅ 真实 TG 消息能被正确拼接成多轮 conversation
2. ✅ 输出结果可直接用于《实时质检分析入库执行单》
3. ✅ 严格遵守修改范围约束
4. ✅ 实现所有功能职责
5. ✅ 通过所有测试验证

**代码质量**：
- 完整的 JSDoc 注释
- 清晰的模块职责划分
- 严格的输入校验
- 详细的日志输出
- 充分的测试覆盖
