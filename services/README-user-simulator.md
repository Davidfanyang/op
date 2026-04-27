# AI 用户模拟器 - User Simulator

## 概述

AI 用户模拟器是 trainer-core 训练系统的核心组件，用于模拟真实用户与客服进行多轮对话训练。

### 设计目标

- ✅ 让训练系统可以模拟真实用户多轮对话，而不是单轮 FAQ 问答
- ✅ 用户表达必须自然，贴近真实用户行为
- ✅ 不允许一次性说完所有信息，要逐步透露
- ✅ 必须贴合场景和当前对话阶段
- ✅ 控制对话轮数在 3~6 轮之间
- ✅ 支持智能结束判断

## 文件位置

```
services/user-simulator.js          # 主模块
tests/test-user-simulator.js        # 单元测试
scripts/demo-user-simulator.js      # 集成演示
```

## 快速开始

### 1. 基本使用

```javascript
const { generateUserMessage } = require('./services/user-simulator');

// 第一轮：生成用户初始问题
const firstMessage = await generateUserMessage({
  project: 'default',
  scenario: scenario,      // 场景对象
  conversation: [],        // 空对话历史
  round: 0                 // 第0轮
});

console.log(firstMessage.user_message);  // "我想注册LantonPay，怎么操作？"
console.log(firstMessage.is_finished);   // false
```

### 2. 多轮对话

```javascript
const conversation = [
  { role: 'user', content: '我想注册LantonPay，怎么操作？' },
  { role: 'agent', content: '您好！请问您已经下载APP了吗？' }
];

// 第二轮：基于上下文生成用户回复
const secondMessage = await generateUserMessage({
  project: 'default',
  scenario: scenario,
  conversation: conversation,
  round: 1,
  analysisResult: analysisResult  // 上一轮的分析结果（可选）
});

console.log(secondMessage.user_message);  // "有点复杂，能再说详细点吗？"
```

### 3. 完整训练流程

```bash
# 运行集成演示
node scripts/demo-user-simulator.js
```

## 输入协议

```javascript
{
  project: string,           // 项目标识（必填）
  scenario: object,          // 场景对象（必填）
  conversation: array,       // 对话历史（必填）
  round: number,             // 当前轮次（必填，从0开始）
  analysisResult: object     // 上一轮分析结果（可选）
}
```

### scenario 对象结构

```javascript
{
  id: string,                // 场景ID
  title: string,             // 场景标题
  description: string,       // 场景描述
  customerMessage: string,   // 初始用户问题
  stages: array              // 阶段定义（可选）
}
```

### conversation 数组结构

```javascript
[
  {
    role: 'user',            // 角色：'user' 或 'agent'
    content: string,         // 消息内容
    _meta: {                 // 元数据（可选）
      turnIndex: number,
      ts: string
    }
  }
]
```

## 输出协议

```javascript
{
  user_message: string,      // 生成的用户消息
  is_finished: boolean       // 是否应该结束对话
}
```

当 `is_finished` 为 `true` 时，`user_message` 为 `null`。

## 核心功能

### 1. 第一轮消息生成

- 优先使用场景的 `customerMessage`
- 如果没有，则根据场景标题和描述生成自然开场白
- 确保表达自然、口语化

### 2. 后续消息生成

支持两种模式：

#### 模式A：本地模型生成（推荐）

当 `USE_LOCAL_MODEL=true` 时，使用本地 AI 模型生成：

- 基于完整对话上下文
- 考虑当前所处阶段
- 根据客服回复质量调整用户反应
- 表达更加自然和多样化

#### 模式B：规则版生成（降级方案）

当本地模型不可用时，自动降级到规则版：

- 基于场景阶段生成
- 根据分析结果调整（追问/抱怨/确认）
- 保证基本的对话逻辑

### 3. 结束判断

对话结束的条件（满足任一即可）：

1. **最少轮数**：少于3轮不会结束
2. **最多轮数**：达到6轮强制结束
3. **问题已解决**：客服表现优秀（pass）且无问题/缺失，至少3轮后可结束
4. **阶段完成**：场景的所有阶段已完成，至少3轮后可结束

### 4. 用户表达控制

确保用户表达自然的原则：

- ✅ 口语化、简洁
- ✅ 可能有错别字或不完整句子
- ✅ 根据客服回复做出反应
- ✅ 逐步透露信息，不一口气说完
- ❌ 不使用敬语或过于正式的表达
- ❌ 不像客服或AI的语气
- ❌ 长度控制在 10-50 字

## 测试

### 运行单元测试

```bash
node tests/test-user-simulator.js
```

测试覆盖：

1. ✅ 生成第一轮用户问题
2. ✅ 模拟3轮完整对话
3. ✅ 对话结束判断（6轮限制）
4. ✅ 用户表达自然度检查

### 运行集成演示

```bash
node scripts/demo-user-simulator.js
```

演示完整的训练流程：

1. 加载场景
2. 用户模拟器发起问题
3. 模拟客服回复
4. 调用分析引擎评估
5. 基于分析结果生成下一轮用户消息
6. 循环直到满足结束条件
7. 输出训练总结

## 接入训练流程

### 当前状态

用户模拟器已实现并可独立运行，但尚未完全接入 Telegram Bot 训练流程。

### 接入步骤（待实现）

1. **修改 Telegram Bot**
   - 训练开始时调用 `generateUserMessage` 发起第一句
   - 收到客服回复后，调用分析引擎
   - 基于分析结果调用 `generateUserMessage` 生成下一句
   - 循环直到 `is_finished` 为 true

2. **Session 状态管理**
   - 在 session 中保存 `conversation` 和 `round`
   - 保存 `analysisResult` 用于下一轮生成

3. **结束处理**
   - 当 `is_finished` 为 true 时，发送训练总结
   - 重置 session 状态

### 示例伪代码

```javascript
// 在 telegram-bot.js 中
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const session = getSession(chatId);
  
  if (session.mode === 'training') {
    // 客服回复
    const agentReply = msg.text;
    
    // 添加到对话历史
    session.conversation.push({
      role: 'agent',
      content: agentReply
    });
    
    // 调用分析引擎
    const analysisResult = await evaluate({
      project: session.project,
      conversation: session.conversation,
      current_reply: agentReply,
      metadata: {
        source: 'telegram',
        session_id: session.id,
        agent_id: chatId,
        timestamp: new Date().toISOString(),
        entry_type: 'training',
        scenarioId: session.scenario.id
      },
      rules: {}
    });
    
    // 生成下一轮用户消息
    const userInput = await generateUserMessage({
      project: session.project,
      scenario: session.scenario,
      conversation: session.conversation,
      round: session.round,
      analysisResult: analysisResult
    });
    
    if (userInput.is_finished) {
      // 结束训练
      await telegram.sendMessage(chatId, '训练已结束！');
      clearSession(chatId);
    } else {
      // 发送用户消息
      await telegram.sendMessage(chatId, userInput.user_message);
      session.conversation.push({
        role: 'user',
        content: userInput.user_message
      });
      session.round++;
    }
  }
});
```

## 配置

### 环境变量

```bash
# 使用本地模型生成用户消息（推荐）
USE_LOCAL_MODEL=true

# 本地模型 API 地址
LOCAL_MODEL_URL=http://localhost:8001/score
```

如果不配置或本地模型不可用，会自动降级到规则版。

## 架构设计

### 职责边界

**用户模拟器负责：**
- ✅ 生成用户消息
- ✅ 控制对话轮数
- ✅ 判断对话结束
- ✅ 保持用户表达自然

**用户模拟器不负责：**
- ❌ 分析客服回复质量（由 core/analysis-pipeline 负责）
- ❌ 评估训练结果（由 services/evaluation-service 负责）
- ❌ 发送 Telegram 消息（由 bot/telegram-bot.js 负责）
- ❌ 管理 session 状态（由 session/session-store.js 负责）

### 依赖关系

```
user-simulator.js
  ├── 依赖：场景数据（scenario）
  ├── 依赖：对话历史（conversation）
  ├── 依赖：分析结果（analysisResult，可选）
  └── 输出：用户消息（user_message）+ 结束标志（is_finished）
```

## 未来优化方向

1. **AI 模型增强**
   - 训练专门的用户模拟模型
   - 支持多种用户性格（急躁/温和/健忘等）
   - 支持多种表达风格

2. **场景规则完善**
   - 为每个场景定义详细的用户行为路径
   - 定义用户在每个阶段的期望反应
   - 定义用户的"满意度"判断标准

3. **真实数据学习**
   - 从历史真实对话中学习用户表达模式
   - 提取常见的用户追问模式
   - 学习用户的不满表达方式

4. **多样化控制**
   - 支持设置用户"难度等级"
   - 支持设置用户"配合度"
   - 支持设置对话"最短/最长轮数"

## 问题排查

### 本地模型调用失败

**现象：** 日志显示 `[UserSimulator] 本地模型调用失败: fetch failed`

**原因：** 本地模型服务未启动或地址不正确

**解决：**
1. 检查本地模型服务是否运行：`curl http://localhost:8001/score`
2. 如果不使用本地模型，可忽略（会自动降级到规则版）
3. 或设置 `USE_LOCAL_MODEL=false`

### 用户消息重复

**现象：** 连续几轮生成的用户消息相似

**原因：** 规则版的随机性有限

**解决：**
1. 启用本地模型：`USE_LOCAL_MODEL=true`
2. 或等待后续优化增加更多变化

### 对话过早结束

**现象：** 不到3轮就结束了

**原因：** 不应该发生，代码已强制最少3轮

**解决：** 检查是否有其他代码干预了结束判断

## 版本历史

- **v1.0** (2026-04-17)
  - 初始版本
  - 支持规则版用户消息生成
  - 支持本地模型生成（可选）
  - 支持 3~6 轮对话控制
  - 支持智能结束判断
