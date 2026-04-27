# 训练反馈模板服务

## 概述

训练反馈模板服务负责将每轮分析结果转换为客服可直接阅读的训练反馈，并在 Telegram 中返回。

## 文件位置

- **服务模块**: `services/feedback-template-service.js`
- **单元测试**: `tests/test-feedback-template.js`
- **集成测试**: `tests/test-feedback-integration.js`

## 职责

1. 接收分析结果
2. 生成客服可读的 `feedback_text`（用于 TG 消息）
3. 生成 `structured_feedback`（用于后续入库）

## 反馈内容

反馈模板必须包含以下内容：

- ✅ 场景
- ✅ 当前轮次
- ✅ 本轮做得好的地方
- ✅ 本轮存在的问题
- ✅ 本轮缺失项
- ✅ 下一步建议
- ✅ 训练状态（继续训练 / 本轮结束）

## 字段来源

| 反馈字段 | 数据来源 |
|---------|---------|
| 场景 | `scenario.title` |
| 当前轮次 | `round` |
| 做得好的地方 | `analysis.strengths` |
| 存在的问题 | `analysis.problems` / `analysis.issues` |
| 缺失项 | `analysis.missing` |
| 下一步建议 | 基于问题、缺失项自动生成 |
| 训练状态 | `is_finished` |

## 使用示例

```javascript
const { generateFeedback } = require('./services/feedback-template-service');

// 在训练流程中调用
const feedback = generateFeedback({
  scenario: session.scenario,
  round: session.round,
  analysis: analysisResult,
  isFinished: shouldEndTraining(session, analysisResult)
});

// feedback 包含两个字段：
// 1. feedback_text - 客服可读的文本（用于 TG 消息）
// 2. structured_feedback - 结构化数据（用于入库）

console.log(feedback.feedback_text);
// 输出示例：
// 📋 *训练反馈 - 第 1 轮*
//
// *场景：* 注册流程指引
//
// ✅ *本轮做得好的地方：*
// • 态度友善，使用了礼貌用语
// • 及时回应了客户的问题
//
// 🔴 *本轮存在的问题：*
// • 没有验证客户身份
// • 回复语气过于生硬
//
// ⚠️ *本轮缺失项：*
// • 缺少身份验证步骤
// • 没有确认手机号码
//
// 💡 *下一步建议：*
// • 注意补充验证客户身份。
// • 注意调整语气，使用更友善、专业的表达方式。
// • 请先验证客户身份，确认关键信息后再进行操作。
//
// 🔄 *训练状态：* 继续训练
//
// _请继续回复用户消息_

console.log(feedback.structured_feedback);
// 输出示例：
// {
//   "scenario_id": "register_flow",
//   "scenario_title": "注册流程指引",
//   "round": 1,
//   "strengths": ["态度友善，使用了礼貌用语", "及时回应了客户的问题"],
//   "problems": ["没有验证客户身份", "回复语气过于生硬"],
//   "missing": ["缺少身份验证步骤", "没有确认手机号码"],
//   "suggestions": [
//     "注意补充验证客户身份。",
//     "注意调整语气，使用更友善、专业的表达方式。",
//     "请先验证客户身份，确认关键信息后再进行操作。"
//   ],
//   "is_finished": false,
//   "status": "continuing",
//   "generated_at": "2026-04-17T10:50:44.140Z"
// }
```

## 严格要求

### feedback_text

- ✅ 返回内容必须是**人话**
- ❌ 不能直接返回 JSON
- ❌ 不能直接返回技术日志

### 建议生成

- ✅ 建议必须**可执行**
- ❌ 不能只是重复问题

示例：

```
❌ 错误示例：问题是"没有验证身份"
✅ 正确示例：建议是"请先验证客户身份，确认关键信息后再进行操作。"
```

## 接入训练流程

### 流程说明

```
客服回复 → 分析引擎 → 生成反馈 → 返回 TG
                                ↓
                         structured_feedback → 后续入库
```

### 代码位置

1. **训练编排服务** (`services/training-orchestrator.js`):
   - 每轮分析完成后立即调用 `generateFeedback`
   - 将 `feedback` 添加到返回结果中

2. **Telegram Bot** (`bot/telegram-bot.js`):
   - 使用 `result.feedback.feedback_text` 发送消息给客服
   - 在训练继续和结束时都发送反馈

3. **后续入库**:
   - 使用 `result.feedback.structured_feedback` 存储到数据库

## 测试

### 运行单元测试

```bash
node tests/test-feedback-template.js
```

### 运行集成测试

```bash
node tests/test-feedback-integration.js
```

### 测试覆盖

- ✅ 正常分析结果（有问题、缺失、优点）
- ✅ 优秀表现（没有问题和缺失）
- ✅ 边界情况（空分析结果）
- ✅ 分析结果字段是对象数组
- ✅ 完整训练流程中的反馈生成
- ✅ 反馈建议的可执行性

## 设计原则

1. **客服友好**: 反馈内容必须是客服能看懂的人话
2. **结构化**: 同时输出结构化数据供后续使用
3. **可执行**: 建议必须具体可执行，不能只是重复问题
4. **稳定性**: 每轮反馈都能稳定生成
5. **可扩展**: 后续训练记录入库可直接复用 structured_feedback

## 变更历史

- **2026-04-17**: 初始版本，实现反馈模板服务并接入训练流程
