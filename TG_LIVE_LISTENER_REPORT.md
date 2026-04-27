# TG 实时监听入口 - 实现报告

## 完成情况

✅ **所有任务已完成**

## 实现内容

### 1. 新增文件清单

| 文件路径 | 类型 | 行数 | 说明 |
|---------|------|------|------|
| `adapters/telegram/tg-live-listener.js` | 适配器 | 189 | TG实时监听适配器 |
| `services/live-message-ingestor.js` | 服务 | 116 | 实时监听入口服务 |
| `start-live-listener.js` | 启动入口 | 107 | 启动脚本 |
| `scripts/test-tg-live-simple.js` | 测试 | 108 | 简化测试脚本 |
| `.env.example` | 配置 | +5行 | 新增环境变量 |

### 2. 核心功能实现

#### 2.1 TG 实时监听适配器 (TGLiveListener)

**职责**：
- 接收 Telegram 真实消息（通过 long polling）
- 过滤无效消息
- 转换为统一内部对象

**实现的过滤规则**：
1. ✅ Bot 自己的消息（通过 botId 对比）
2. ✅ 系统消息（new_chat_members, left_chat_member 等9种系统事件）
3. ✅ 空消息（无 text 和 caption）
4. ✅ 无文本消息（纯图片、文件等）
5. ✅ 非指定群消息（通过 TG_LIVE_CHAT_IDS 配置）

**统一对象结构**：
```javascript
{
  source: 'telegram',           // 来源
  entry_type: 'live_monitor',   // 入口类型
  chat_id: '-1001234567890',    // 群ID（字符串）
  message_id: 1001,             // 消息ID（数字）
  sender_id: 12345,             // 发送者ID
  sender_name: 'test_user',     // 发送者名称
  message_text: '你好，我想咨询一下产品问题',  // 消息文本
  timestamp: '2026-04-17T12:00:00.000Z',       // ISO8601时间
  raw_event: {...}              // 原始Telegram事件
}
```

#### 2.2 实时监听入口服务 (LiveMessageIngestor)

**职责**：
- 接收统一对象
- 做最小校验
- 输出日志

**校验规则**：
1. ✅ 必填字段检查：source, entry_type, chat_id, message_id, message_text
2. ✅ 字段类型检查：chat_id必须是string，message_id必须是number
3. ✅ 字段值检查：message_text不能为空字符串

**处理链机制**：
- 支持通过 `onMessage(handler)` 注册多个处理器
- 本阶段处理器只做日志输出
- TODO: 后续接"真实会话拼接执行单"

#### 2.3 环境变量配置

新增3个配置项：

```bash
# TG 实时监听配置（可选，用于 npm run live)
TG_LIVE_ENABLED=false           # 是否启用实时监听
TG_LIVE_CHAT_IDS=               # 允许监听的群ID（逗号分隔，空表示不限制）
TG_IGNORE_BOT_SELF=true         # 是否过滤Bot自己的消息
```

### 3. 启动方式

```bash
# 方式1：使用启动脚本
TG_LIVE_ENABLED=true node start-live-listener.js

# 方式2：先设置环境变量
export TG_LIVE_ENABLED=true
export TG_LIVE_CHAT_IDS="-1001234567890,-1009876543210"
node start-live-listener.js
```

**启动输出示例**：
```
============================================================
TG 实时监听入口启动
============================================================
时间: 2026-04-17T12:00:00.000Z
Node 版本: v20.10.0
环境: development
============================================================
TG_LIVE_ENABLED: true
TG_LIVE_CHAT_IDS: -1001234567890, -1009876543210
TG_IGNORE_BOT_SELF: true
TELEGRAM_BOT_TOKEN: 1234567890...
============================================================

🚀 正在启动 TG 实时监听...
[TGLiveListener] Bot 已连接: @my_bot (ID: 99999)
[TGLiveListener] 开始轮询监听消息...
✅ TG 实时监听已启动
```

### 4. 运行日志示例

**收到有效消息**：
```
[TGLiveListener] 收到消息: { message_id: 1001, chat_id: -1001234567890, from: 'test_user' }
[TGLiveListener] 标准对象生成成功: { source: 'telegram', entry_type: 'live_monitor', chat_id: '-1001234567890', sender_id: 12345, message_text_length: 15 }
[LiveMessageIngestor] 消息进入实时监听入口: { source: 'telegram', entry_type: 'live_monitor', chat_id: '-1001234567890', message_id: 1001, sender_id: 12345, message_text_preview: '你好，我想咨询一下产品问题' }

============================================================
📨 [实时监听] 收到新消息
============================================================
来源: telegram
类型: live_monitor
群ID: -1001234567890
消息ID: 1001
发送者: test_user (ID: 12345)
时间: 2026-04-17T12:00:00.000Z
内容: 你好，我想咨询一下产品问题
============================================================
```

**过滤消息**：
```
[TGLiveListener] 收到消息: { message_id: 1002, chat_id: -1001234567890, from: 'my_bot' }
[TGLiveListener] 过滤：Bot 自己的消息

[TGLiveListener] 收到消息: { message_id: 1003, chat_id: -1001234567890, from: 'test_user' }
[TGLiveListener] 过滤：系统消息

[TGLiveListener] 收到消息: { message_id: 1004, chat_id: -1001234567890, from: 'test_user' }
[TGLiveListener] 过滤：空消息（无文本）

[TGLiveListener] 收到消息: { message_id: 1005, chat_id: -9999999999, from: 'test_user' }
[TGLiveListener] 过滤：非指定群消息 { chat_id: -9999999999, allowed: [ '-1001234567890' ] }
```

### 5. 测试用例

测试脚本 `scripts/test-tg-live-simple.js` 包含3个测试：

**测试1：消息过滤（5个用例）**
- ✅ 有效消息 - 应通过
- ✅ Bot消息 - 应过滤
- ✅ 系统消息 - 应过滤
- ✅ 空消息 - 应过滤
- ✅ 其他群消息 - 应过滤

**测试2：标准对象结构**
- ✅ 验证9个必填字段存在
- ✅ 验证字段值正确
- ✅ 验证timestamp格式为ISO8601
- ✅ 验证raw_event保留原始数据

**测试3：入口服务校验**
- ✅ 有效消息 - 应通过
- ✅ 空文本消息 - 应被拒绝
- ✅ 缺少字段消息 - 应被拒绝

### 6. 架构分离验证

**训练入口 vs 实时监听入口**：

| 维度 | 训练入口 | 实时监听入口 |
|------|---------|-------------|
| 启动脚本 | `start-bot.js` | `start-live-listener.js` |
| 入口类型 | training | live_monitor |
| 消息来源 | Bot主动模拟用户 | 真实群消息 |
| 处理流程 | training-orchestrator | live-message-ingestor |
| 配置项 | TELEGRAM_BOT_TOKEN | TG_LIVE_ENABLED + TG_LIVE_CHAT_IDS |
| 当前状态 | ✅ 已实现完整闭环 | ✅ 已实现入口接入 |

**完全分离**：
- 两个入口使用独立的启动脚本
- 两个入口使用不同的 entry_type 标识
- 两个入口走不同的处理链路
- 互不干扰，可独立启停

## 完成判定标准

✅ **真实 TG 消息能进入 trainer-core**
- TGLiveListener 通过 long polling 接收真实消息
- 消息经过5层过滤后转换为标准对象
- 标准对象传递给 LiveMessageIngestor

✅ **训练入口与实时监听入口已经分离**
- 训练入口：`start-bot.js` → `telegram-bot.js` → `training-orchestrator`
- 监听入口：`start-live-listener.js` → `tg-live-listener.js` → `live-message-ingestor`
- 两者完全独立，使用不同的环境变量和处理逻辑

✅ **后续可以继续接"真实会话拼接执行单"**
- LiveMessageIngestor 预留了处理链机制
- 当前处理器只做日志输出，留有清晰的 TODO 注释
- 标准对象结构已固定，后续可直接使用

## 下一步计划

本阶段只做入口接入，后续可继续：

1. **真实会话拼接执行单**
   - 创建或关联 session
   - 保存 message 到数据库
   - 按时间窗口拼接同一会话的多条消息

2. **实时质检链路**
   - 调用 evaluation-service 进行分析
   - 命中告警创建 review item
   - 输出主管可读 payload

3. **Webhook 模式支持**（可选）
   - 当前使用 long polling
   - 可切换为 webhook 模式提升实时性

## 文件结构

```
trainer-core/
├── adapters/telegram/
│   ├── telegram-client.js          # 现有：TG API客户端
│   └── tg-live-listener.js         # 新增：TG实时监听适配器
├── services/
│   ├── live-message-ingestor.js    # 新增：实时监听入口服务
│   ├── training-orchestrator.js    # 现有：训练编排器
│   └── ...
├── start-bot.js                    # 现有：训练Bot启动
├── start-live-listener.js          # 新增：实时监听启动
├── scripts/
│   └── test-tg-live-simple.js      # 新增：测试脚本
└── .env.example                    # 修改：新增3个环境变量
```

## 总结

TG 实时监听入口已成功实现，具备以下能力：

1. ✅ 接收真实 Telegram 消息
2. ✅ 5层消息过滤（Bot自身、系统、空消息、无文本、非指定群）
3. ✅ 转换为统一内部对象（9个标准字段）
4. ✅ 最小校验（必填字段、类型、值）
5. ✅ 完整日志输出（收到、过滤、标准对象、进入入口）
6. ✅ 配置项支持（TG_LIVE_ENABLED、TG_LIVE_CHAT_IDS、TG_IGNORE_BOT_SELF）
7. ✅ 与训练入口完全分离
8. ✅ 预留后续扩展接口

**本阶段"TG 实时监听入口"已闭环** ✅
