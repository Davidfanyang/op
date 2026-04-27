# Trainer-Core 重构总结 v4.0

## 重构目标

将 trainer-core 从**"客服回复评分器"**重构为**"多轮对话过程分析器"**。

### 核心变更
- **旧**: 基于标准答案相似度评分 (cosine similarity)
- **新**: 基于对话阶段规则分析回复合理性、完整性、推进能力

---

## 已完成的重构内容

### 1. 数据结构定义 ✅
**文件**: `docs/dialogue-analyzer-schema.md`

定义了完整的 v4.0 schema:
- 输入: `ConversationTurn[]` + `currentReply`
- 输出: `scenario / stage / result / issues / missing / nextAction / coachSummary / riskLevel`
- 等级: `pass / borderline / fail / risk` (替代 0-100 分)

### 2. 场景规则文件 ✅
**目录**: `data/scenarios/lanton/`

创建了 3 个完整场景的 stages[] 规则:
- `register-flow.json` - 注册流程指引 (4 stages)
- `sms-code.json` - 注册收不到验证码 (3 stages)  
- `transfer-success-not-received.json` - 转账成功但未到账 (3 stages)

每个场景包含:
- 阶段触发条件 (turnIndex / customerIntent)
- 期望动作 (expectedActions)
- 必须包含信息 (mustInclude)
- 禁忌内容 (mustAvoid)
- 完成标准 (completionCriteria)
- 全局规则 (globalRules)

### 3. 核心评估器重构 ✅

#### 3.1 Stage Detector (阶段检测器)
**文件**: `core/stage-detector.js`
- 基于 turnIndex 匹配阶段
- 基于客户意图关键词匹配
- 判断阶段转换条件

#### 3.2 Dialogue Checker (对话检查器)
**文件**: `core/dialogue-checker.js`
- 检查 mustInclude 信息
- 检查 mustAvoid 禁忌内容
- 检查全局规则
- 检查期望动作执行情况

#### 3.3 Gap Analyzer (差距分析器)
**文件**: `core/gap-analyzer.js`
- 综合分析问题列表
- 确定最终等级 (pass/borderline/fail/risk)
- 识别缺失信息
- 生成下一步行动建议
- 生成教练式总结

#### 3.4 Evaluator v4.0 (统一入口)
**文件**: `core/evaluator.js`
- 整合上述三个组件
- 提供 `analyzeTurn()` 单轮分析
- 提供 `analyzeConversation()` 多轮分析
- 保持向后兼容 `evaluateReply()`

### 4. Trainer 主链重构 ✅
**文件**: `core/trainer.js`

- 新增 `analyzeTurn()` 主入口
- 新增 `analyzeConversation()` 完整对话分析
- 保持向后兼容 `evaluateTraining()`

### 5. Feedback 重构 ✅
**文件**: `core/feedback.js`

- 新增 `buildDiagnosticFeedback()` 输出诊断结果
- 移除分数反馈逻辑
- 保持向后兼容 `buildFeedback()`

### 6. Evaluation Service 重构 ✅
**文件**: `services/evaluation-service.js`

- 改为对话分析入口
- 支持 conversation 上下文
- 告警基于 riskLevel 而非 score
- 新增 `evaluateConversation()` 接口

### 7. Live Monitor Service 重构 ✅
**文件**: `services/live-monitor-service.js`

- 基于完整 conversation 上下文分析
- 构建对话历史 `_buildConversationHistory()`
- 告警判断基于 riskLevel + issues

### 8. 场景加载器升级 ✅
**文件**: `core/scenario-loader.js`

- 支持新旧两种格式
- 从 `data/scenarios/index.json` + 分文件加载
- 兼容旧版 `data/scenarios.json`

### 9. 测试 ✅
**文件**: `tests/dialogue-analyzer.test.js`

创建了 10 条测试用例:
- 4 条 lanton_sms_code 场景测试
- 3 条 transfer 场景测试
- 3 条 register_flow 场景测试
- 包含正例和反例
- 测试多轮对话上下文

---

## 重构原则遵守情况

### ✅ 已遵守
- [x] 先改评估协议层，没动 Telegram UI
- [x] 没先改工作台
- [x] 没先调模型参数
- [x] services/evaluation-service.js 改为对话分析入口
- [x] services/live-monitor-service.js 基于 conversation 分析
- [x] core/trainer.js 改成 analyzeTurn / analyzeConversation
- [x] core/evaluator.js 拆成三个组件
- [x] core/feedback.js 输出诊断结果
- [x] data/scenarios/*.json 升级为 stages[] 规则
- [x] 不再围绕 cosine similarity 做微调
- [x] 不是旧 score 外包解释层
- [x] 没动 bot 展示层
- [x] 没深改 review 工作台
- [x] 先用规则链跑通，没追求复杂 AI

### ⚠️ 待完善
- [ ] JSON 格式修复 (scenarios.json 引号问题)
- [ ] 测试通过率提升 (当前 5/10)
- [ ] 阶段检测算法优化 (目前基于简单关键词)
- [ ] 添加更多场景规则

---

## 新的评估流程

```
用户输入 (conversation + currentReply)
    ↓
Evaluation Service (入口)
    ↓
Trainer.analyzeTurn() (主链)
    ↓
Evaluator.analyzeTurn() (协调器)
    ↓
┌─────────────────────────────────┐
│ Stage Detector (检测当前阶段)    │
│ Dialogue Checker (检查回复质量)  │
│ Gap Analyzer (分析差距)          │
└─────────────────────────────────┘
    ↓
Feedback (诊断输出)
    ↓
结果: { scenario, stage, result, coachSummary, riskLevel }
```

---

## 关键文件清单

### 新增文件
- `docs/dialogue-analyzer-schema.md` - 数据结构定义
- `data/scenarios/lanton/register-flow.json` - 注册流程规则
- `core/stage-detector.js` - 阶段检测器
- `core/dialogue-checker.js` - 对话检查器
- `core/gap-analyzer.js` - 差距分析器
- `tests/dialogue-analyzer.test.js` - 测试文件
- `debug-scenario-load.js` - 调试脚本

### 重构文件
- `data/scenarios/lanton/sms-code.json` - 升级为 stages[]
- `data/scenarios/lanton/transfer-success-not-received.json` - 升级为 stages[]
- `data/scenarios/index.json` - 添加新场景索引
- `data/scenarios.json` - 移除重复场景
- `core/scenario-loader.js` - 支持新格式加载
- `core/evaluator.js` - 重构为 v4.0 分析器
- `core/trainer.js` - 重构为 analyzeTurn 主链
- `core/feedback.js` - 重构为诊断输出
- `services/evaluation-service.js` - 重构为对话分析入口
- `services/live-monitor-service.js` - 重构为基于 conversation

---

## 下一步建议

1. **修复测试**: 解决 5 个失败测试，提升通过率到 100%
2. **优化阶段检测**: 引入更智能的意图识别
3. **扩展场景**: 添加更多业务场景的 stages 规则
4. **AI 增强**: 在规则链跑通后，引入 AI 辅助判断
5. **文档完善**: 补充使用指南和 API 文档

---

## 核心设计理念

### 从"评分"到"诊断"
- **旧思维**: 你的回复得了多少分？
- **新思维**: 你的回复在当前对话阶段下是否合理？缺什么？下一步该做什么？

### 从"标准答案对比"到"阶段规则验证"
- **旧方法**: 和标准答案像不像？
- **新方法**: 当前阶段要求什么？你做到了吗？有没有违反禁忌？

### 从"单轮判断"到"多轮上下文"
- **旧模式**: 只看 customerMessage + agentReply
- **新模式**: 基于完整对话历史判断当前回复

---

**重构完成度**: 约 85%
**规则链已跑通**: ✅
**可投入使用**: ⚠️ 需要修复测试后
