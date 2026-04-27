# Core 模块 - 分析引擎层

## 模块定位
本模块是 trainer-core 项目的**分析引擎层**，负责所有业务分析和判断逻辑。

## 负责什么
- 负责分析引擎主逻辑
- 负责场景识别、阶段判断、当前回复检查、缺口分析、风险判断、结果生成
- 负责把多轮会话转成结构化分析结果

## 不负责什么
- 不负责 TG 接入
- 不负责 Web 接入
- 不负责数据库保存
- 不负责审核页面
- 不负责训练 Bot 承载
- 不负责统计查询接口

## 输入 / 输出
- **输入**: conversation、current_reply、metadata、rules
- **输出**: 结构化分析结果，包含 scenario、stage、judgement、analysis、summary、confidence

---

## 子模块分类

### 1. 分析主链（核心入口）
- `index.js` - 分析引擎主入口（AI 增强链）
- `trainer.js` - 对话分析主链 Orchestrator
- `analysis-pipeline.js` - 分析管道（串联场景识别→阶段检测→回复检查→缺口分析）

### 2. 场景与阶段识别
- `scenario-loader.js` - 场景加载与匹配
- `stage-detector.js` - 对话阶段检测

### 3. 回复检查与分析
- `evaluator.js` - 规则评分器
- `dialogue-checker.js` - 对话检查器
- `gap-analyzer.js` - 缺口分析器
- `conversation-signals.js` - 会话信号分析

### 4. AI 增强评估
- `ai-decision.js` - AI 触发决策
- `ai-coach.js` - AI 评估调用
- `ai-validator.js` - AI 输出校验
- `ai-evaluator.js` - AI 评分器
- `router-fallback.js` - 多模型 fallback 路由

### 5. 结果输出
- `feedback.js` - 诊断结果输出层（构建结构化反馈）

### 6. 告警与风险控制
- `alert-router.js` - 告警分流规则
- `alert-throttler.js` - 告警限流器

### 7. 灰度与统计
- `gray-collector.js` - 灰度数据收集器
- `gray-metrics.js` - 灰度指标统计
- `metrics.js` - 通用指标统计

### 8. 审核与复核
- `review-record.js` - 审核记录管理

### 9. 训练模式
- `training-workbench.js` - 训练工作台

### 10. 辅助模块
- `validation-kit-bridge.js` - 外部校验桥接

### 11. API 层（主管接口）
- `api/supervisor-api.js` - 主管 API
- `api/response.js` - 统一响应格式

### 12. 常量定义
- `constants/statuses.js` - 状态常量（AlertLevel、ReviewStatus 等）

---

## 职责边界（重要）

### Core 应该做：
1. ✅ 理解会话内容
2. ✅ 识别业务场景
3. ✅ 判断当前阶段
4. ✅ 检查当前回复质量
5. ✅ 输出问题点、缺失项、判断结果、总结结果
6. ✅ 产出结构化诊断对象

### Core 不应该做：
1. ❌ 直接连接 Telegram Bot（应由 bot/ 负责）
2. ❌ 直接连接数据库（应由 repositories/ 负责）
3. ❌ 管理会话上下文（应由 session/ 负责）
4. ❌ 编排业务流程（应由 services/ 负责）
5. ❌ 发送告警通知（应由 adapters/ 负责）
6. ❌ 提供 HTTP API 接口（应由 services/ + adapters/ 负责）

---

## 调用关系

```
services/ (业务编排)
    ↓ 调用
core/ (分析引擎)
    ↓ 输出结构化结果
services/ (继续处理：存储、通知、展示)
```

## 统一输入结构
```javascript
{
  projectId: string,           // 项目ID (必填)
  mode: string,                // 'training' | 'live_monitor' (必填)
  conversation: Array,         // 对话历史 [{ role, text, ts? }] (必填)
  currentReply: string,        // 当前客服回复 (必填)
  metadata: object             // 元数据 (可选)
}
```

## 统一输出结构
```javascript
{
  scenarioId: string,
  scenarioName: string,
  stage: string,
  result: "pass" | "borderline" | "fail" | "risk",
  riskLevel: "none" | "low" | "medium" | "high" | "critical",
  issues: string[],
  missing: string[],
  strengths: string[],
  nextAction: string,
  coachSummary: string,
  confidence: number,
  reviewStatus?: "pending" | "auto_pass" | "needs_review"
}
```
