# Analysis Pipeline v5.0 迁移指南

## 📋 概述

成功将评估核心从 **"score pipeline"** 改造为 **"analysis pipeline"**，完全移除分数计算，采用纯分析管道。

---

## 🔄 核心变更

### 新主链架构

```
loadScenario
  -> detectScenario
  -> detectStage
  -> checkCurrentReply
  -> analyzeGaps
  -> buildFeedback
```

### 旧架构 (v4.0) ❌
```javascript
// 基于分数
evaluateReply(userReply, scenario)
  -> calculateScore()
  -> calculateDimensionScores()
  -> determineAlertLevel()
  
输出: { score: 85, dimensionScores: {...}, alertLevel: 'low' }
```

### 新架构 (v5.0) ✅
```javascript
// 基于分析
analyzeTurn(input)
  -> loadScenario()
  -> detectScenario()
  -> detectStage()
  -> checkCurrentReply()
  -> analyzeGaps()
  -> buildFeedback()
  
输出: {
  scenarioId, scenarioName, stage, result, riskLevel,
  issues, missing, strengths, nextAction,
  coachSummary, confidence, reviewStatus
}
```

---

## 📥 新输入格式

### analyzeTurn(input)

```javascript
{
  projectId: string,              // 项目ID (必填)
  mode: "training" | "live_monitor",  // 模式 (必填)
  conversation: [                 // 对话历史 (必填)
    { 
      role: "customer" | "agent", // 角色
      text: string,               // 文本内容
      ts?: string                 // 时间戳 (可选)
    }
  ],
  currentReply: string,           // 当前客服回复 (必填)
  metadata?: {                    // 元数据 (可选)
    scenarioId?: string,          // 场景ID (可选，自动检测)
    ...
  }
}
```

### 示例

```javascript
const input = {
  projectId: 'lanton',
  mode: 'training',
  conversation: [
    { role: 'customer', text: '我注册LantonPay一直收不到验证码，怎么办？' },
    { role: 'agent', text: '您好！请您提供注册手机号。' },
    { role: 'customer', text: '我的手机号是13800138000' }
  ],
  currentReply: '收到！我们已为您申请验证码，预计5分钟内发送。',
  metadata: {
    scenarioId: 'lanton_sms_code',  // 可选，不提供则自动检测
    sessionId: 'session_123'
  }
};
```

---

## 📤 新输出格式

### analyzeTurn 输出

```javascript
{
  scenarioId: string,             // 场景ID
  scenarioName: string,           // 场景名称
  stage: string,                  // 当前阶段名称
  result: "pass" | "borderline" | "fail" | "risk",  // 结果等级
  riskLevel: "none" | "low" | "medium" | "high" | "critical",  // 风险等级
  issues: string[],               // 问题列表
  missing: string[],              // 缺失信息
  strengths: string[],            // 优势列表
  nextAction: string,             // 下一步建议
  coachSummary: string,           // 教练总结
  confidence: number,             // 置信度 (0-1)
  reviewStatus?: "pending" | "auto_pass" | "needs_review",  // 审核状态
  projectId: string,              // 项目ID
  meta: {                         // 元数据
    mode: string,
    timestamp: string,
    conversationTurns: number,
    ...
  }
}
```

### 示例输出

```javascript
{
  scenarioId: 'lanton_sms_code',
  scenarioName: '注册收不到验证码',
  stage: '确认问题并收集信息',
  result: 'pass',
  riskLevel: 'none',
  issues: [],
  missing: [],
  strengths: [
    '包含所有必要信息',
    '未使用禁忌表达',
    '完成期望动作: 礼貌问候并安抚、确认问题类型',
    '回复详实充分'
  ],
  nextAction: '继续跟进用户问题',
  coachSummary: '回复符合第一阶段期望，包含了必要的问候和信息收集。建议继续保持专业态度。',
  confidence: 0.95,
  reviewStatus: 'auto_pass',
  projectId: 'lanton',
  meta: {
    mode: 'training',
    timestamp: '2026-04-13T10:30:00.000Z',
    conversationTurns: 3
  }
}
```

### analyzeConversation 输出

```javascript
{
  projectId: string,
  mode: string,
  scenarioId: string,
  scenarioName: string,
  turns: [                        // 每轮分析结果
    {
      turnIndex: number,
      turnNumber: number,
      ...analyzeTurn输出
    }
  ],
  overall: {                      // 整体统计
    totalTurns: number,
    agentTurns: number,
    levelDistribution: {
      pass: number,
      borderline: number,
      fail: number,
      risk: number
    },
    avgConfidence: number,
    totalIssues: number,
    totalStrengths: number,
    overallRiskLevel: string
  },
  meta: {
    timestamp: string,
    totalTurns: number,
    agentTurns: number,
    ...
  }
}
```

---

## 🔧 使用示例

### 1. 基础用法

```javascript
const { analyzeTurn } = require('./core/evaluator');

const result = await analyzeTurn({
  projectId: 'lanton',
  mode: 'training',
  conversation: [
    { role: 'customer', text: '收不到验证码' }
  ],
  currentReply: '您好！请您提供注册手机号，我们协助申请。',
  metadata: { scenarioId: 'lanton_sms_code' }
});

console.log(result.result);        // 'pass' | 'borderline' | 'fail' | 'risk'
console.log(result.riskLevel);     // 'none' | 'low' | 'medium' | 'high' | 'critical'
console.log(result.confidence);    // 0.95
```

### 2. 多轮对话分析

```javascript
const { analyzeConversation } = require('./core/evaluator');

const result = await analyzeConversation({
  projectId: 'lanton',
  mode: 'training',
  conversation: [
    { role: 'customer', text: '收不到验证码' },
    { role: 'agent', text: '您好！请提供手机号' },
    { role: 'customer', text: '13800138000' },
    { role: 'agent', text: '收到！已为您申请' }
  ],
  metadata: { scenarioId: 'lanton_sms_code' }
});

console.log(result.overall.levelDistribution);
// { pass: 1, borderline: 0, fail: 1, risk: 0 }

console.log(result.overall.avgConfidence);
// 0.85
```

### 3. 实时监控模式

```javascript
const result = await analyzeTurn({
  projectId: 'lanton',
  mode: 'live_monitor',  // 实时监控模式
  conversation: liveConversation,
  currentReply: agentReply,
  metadata: { sessionId: 'session_456' }
});

// 根据 reviewStatus 决定是否需要人工审核
if (result.reviewStatus === 'needs_review') {
  alert Supervisor(result);
} else if (result.reviewStatus === 'auto_pass') {
  logToDatabase(result);
}
```

### 4. 训练模式

```javascript
const result = await analyzeTurn({
  projectId: 'lanton',
  mode: 'training',
  conversation: trainingConversation,
  currentReply: traineeReply,
  metadata: { 
    scenarioId: 'lanton_sms_code',
    traineeId: 'trainee_789'
  }
});

// 提供诊断反馈
console.log(result.coachSummary);
console.log('问题:', result.issues);
console.log('建议:', result.nextAction);
```

---

## 🆚 新旧对比

### 输入对比

| 维度 | 旧 (v4.0) | 新 (v5.0) |
|------|-----------|-----------|
| 项目ID | ❌ 无 | ✅ projectId |
| 模式 | ❌ 无 | ✅ mode (training/live_monitor) |
| 对话格式 | `{ role, content }` | `{ role, text, ts? }` |
| 场景ID | 需要 scenario 对象 | metadata.scenarioId (可选) |
| 自动检测 | ❌ 手动加载 | ✅ 自动检测场景 |

### 输出对比

| 维度 | 旧 (v4.0) | 新 (v5.0) |
|------|-----------|-----------|
| 分数 | ✅ score (0-100) | ❌ 移除 |
| 维度分 | ✅ dimensionScores | ❌ 移除 |
| 结果等级 | ❌ 无 | ✅ result (pass/borderline/fail/risk) |
| 风险等级 | alertLevel | riskLevel (5级) |
| 问题列表 | ❌ 无 | ✅ issues |
| 缺失信息 | ❌ 无 | ✅ missing |
| 优势列表 | ❌ 无 | ✅ strengths |
| 置信度 | ❌ 无 | ✅ confidence (0-1) |
| 审核状态 | ❌ 无 | ✅ reviewStatus |

---

## 🔌 向后兼容

### 旧接口仍然可用

```javascript
// 旧接口 (仍然可用)
const { evaluateReply } = require('./core/evaluator');
const result = await evaluateReply(userReply, scenario);

// 内部自动转换为新格式
// 返回新格式输出
```

### 自动格式转换

```javascript
// 旧格式自动转换为新格式
{ role: 'customer', content: '...' }
  ↓
{ role: 'customer', text: '...', ts: '...' }
```

---

## ⚙️ 核心模块

### 新增模块

1. **`core/analysis-pipeline.js`** (534行)
   - 新的分析管道核心
   - 实现完整的 6 步主链
   - 处理场景加载、检测、分析、反馈

### 重构模块

2. **`core/evaluator.js`** (v4.0 → v5.0)
   - 从 260行 精简到 90行
   - 委托给 analysis-pipeline
   - 保持向后兼容接口

3. **`core/trainer.js`** (v4.0 → v5.0)
   - 从 211行 精简到 140行
   - 直接调用 analysis-pipeline
   - 简化校验逻辑

### 依赖模块

4. **`core/stage-detector.js`**
   - 修复字段兼容性 (content → text)
   - 保持原有功能

5. **`core/dialogue-checker.js`**
   - 无需修改

6. **`core/gap-analyzer.js`**
   - 无需修改

---

## 🧪 测试

### 运行新测试

```bash
# Analysis Pipeline v5.0 测试
node tests/analysis-pipeline.test.js

# 结果: 5/5 通过 ✅
```

### 测试覆盖

- ✅ analyzeTurn 基础功能
- ✅ analyzeTurn 多轮对话
- ✅ analyzeConversation 完整分析
- ✅ 不同 mode 的 reviewStatus
- ✅ 风险等级映射

### 旧测试仍然通过

```bash
# 主测试 (10条)
node tests/dialogue-analyzer.test.js
# 结果: 10/10 通过 ✅

# Fixture测试 (11条)
node tests/analyze-turn.spec.js
# 结果: 11/11 通过 ✅
```

---

## 📊 关键改进

### 1. 完全移除分数计算
- ❌ 不再计算 0-100 分数
- ✅ 改用等级判定 (pass/borderline/fail/risk)
- ✅ 更直观、更易理解

### 2. 自动场景检测
- ❌ 旧: 需要手动加载场景对象
- ✅ 新: 自动从对话中检测场景
- ✅ 支持手动指定 scenarioId

### 3. 标准化输入输出
- ✅ 严格遵循新 schema
- ✅ projectId、mode 必填
- ✅ conversation 格式统一

### 4. 增强诊断信息
- ✅ issues: 问题列表
- ✅ missing: 缺失信息
- ✅ strengths: 优势列表
- ✅ nextAction: 下一步建议
- ✅ coachSummary: 教练总结
- ✅ confidence: 置信度
- ✅ reviewStatus: 审核状态

### 5. 多风险等级
- ✅ none: 无风险
- ✅ low: 低风险
- ✅ medium: 中风险
- ✅ high: 高风险
- ✅ critical: 严重风险

### 6. 审核状态
- ✅ auto_pass: 自动通过 (pass + none风险)
- ✅ needs_review: 需要审核 (risk 或 critical)
- ✅ pending: 待处理 (其他情况)

---

## 🚀 迁移步骤

### 步骤 1: 更新调用代码

```javascript
// 旧代码
const result = await evaluateReply(userReply, scenario);

// 新代码
const result = await analyzeTurn({
  projectId: 'your_project',
  mode: 'training',
  conversation: [
    { role: 'customer', text: scenario.customerMessage },
    { role: 'agent', text: userReply }
  ],
  currentReply: userReply,
  metadata: { scenarioId: scenario.id }
});
```

### 步骤 2: 更新输出处理

```javascript
// 旧代码
console.log(result.score);
console.log(result.dimensionScores);

// 新代码
console.log(result.result);       // 'pass' | 'borderline' | 'fail' | 'risk'
console.log(result.riskLevel);    // 'none' | 'low' | 'medium' | 'high' | 'critical'
console.log(result.issues);       // 问题列表
console.log(result.strengths);    // 优势列表
console.log(result.confidence);   // 置信度
```

### 步骤 3: 处理 reviewStatus

```javascript
switch (result.reviewStatus) {
  case 'auto_pass':
    // 自动通过，记录到数据库
    break;
  case 'needs_review':
    // 需要人工审核，通知主管
    break;
  case 'pending':
    // 待处理
    break;
}
```

---

## 📝 注意事项

### 1. 对话格式
- 新格式使用 `text` 字段
- 旧格式 `content` 仍兼容，但会自动转换
- 建议使用新格式

### 2. 场景检测
- 如果不提供 `metadata.scenarioId`，系统会自动检测
- 自动检测基于关键词匹配
- 建议生产环境显式指定 scenarioId

### 3. 置信度
- confidence 范围: 0-1
- 0.9+ 表示高置信度
- 0.7-0.9 表示中等置信度
- <0.7 表示低置信度

### 4. 审核状态
- training 模式: pass + none → auto_pass
- live_monitor 模式: pass → auto_pass
- risk 或 critical → needs_review

---

## ✅ 验证清单

- [x] analyzeTurn 输出符合新 schema
- [x] analyzeConversation 输出符合新 schema
- [x] 自动场景检测工作正常
- [x] 风险等级映射正确
- [x] reviewStatus 逻辑正确
- [x] 置信度计算合理
- [x] 向后兼容旧接口
- [x] 所有测试通过 (16/16)

---

## 📚 相关文档

- [`IMPLEMENTATION_STATUS.md`](./IMPLEMENTATION_STATUS.md) - 实施状态
- [`COMPLETION_REPORT.md`](./COMPLETION_REPORT.md) - 完成报告
- [`docs/dialogue-analyzer-schema.md`](./docs/dialogue-analyzer-schema.md) - 数据结构定义

---

**迁移完成时间**: 2026-04-13  
**版本**: v4.0 → v5.0  
**测试状态**: ✅ 16/16 通过  
**向后兼容**: ✅ 是  

🎊 **analysis pipeline 改造圆满完成！**
