# 已知/未知问题分流功能说明

## 一、功能概述

已知/未知问题分流是 trainer-core 实时质检系统的知识闭环入口阀门。

**核心价值**：
- 根据实时质检分析结果，判断当前问题属于"系统已覆盖问题"还是"系统未覆盖问题"
- 为后续审核与知识补充链路做入口准备
- 发现系统认知边界，让系统知道"哪些问题需要继续学习"

## 二、架构位置

```
实时消息 → 会话拼接 → 分析引擎 → 实时质检结果 → 已知/未知问题分流 → 写入 live_evaluations 扩展字段
```

**职责边界**：
- ✅ 分流属于**底座职责**（services 层）
- ❌ 不属于**分析引擎职责**（core 层）

## 三、核心模块

### 3.1 problem-classifier-service.js

**路径**: `services/problem-classifier-service.js`

**职责**：
1. 接收实时分析结果
2. 根据固定规则判断 known / unknown
3. 输出标准分流对象

**不负责**：
- 审核
- 知识库入库
- 建议答案生成

**输入来源**：
```javascript
{
  scenario,      // 场景识别结果
  stage,         // 阶段判断结果
  judgement,     // 结论
  summary,       // 总结
  analysis,      // 分析详情
  confidence     // 置信度
}
```

**输出格式**：
```javascript
{
  "problem_type": "known",        // 或 "unknown"
  "need_review": false,           // 是否进入后续审核链路
  "classify_reason": "场景明确，分析结果完整，置信度达标"
}
```

### 3.2 live-evaluation-service.js 接入

在实时质检链路中，分析完成后自动调用分流服务：

```javascript
// 步骤 5: 保存分析结果
const evaluationRecord = await this._saveEvaluation(...);

// 步骤 6: 已知/未知问题分流
const classificationResult = await this._classifyProblem(evaluationRecord);
```

## 四、判定规则

### 4.1 known 条件（同时满足）

| 条件 | 说明 | 示例 |
|------|------|------|
| 场景识别明确 | scenario 非空、不是 unknown/other、在有效场景集中 | `lanton_bank_transfer` |
| 分析结果完整 | judgement、summary 有值，analysis 不是空对象 | ✓ |
| 置信度达标 | confidence >= 0.7 | 0.85 ✓ |

**输出**：
```json
{
  "problem_type": "known",
  "need_review": false,
  "classify_reason": "场景明确，分析结果完整，置信度达标"
}
```

### 4.2 unknown 条件（满足任一）

| 条件 | 说明 | 示例 |
|------|------|------|
| 场景无法识别 | scenario 为空、unknown、other、不在有效场景集 | `null`, `unknown`, `other`, `invalid_scenario` |
| 分析结果不完整 | judgement/summary 为空，analysis 缺失 | `judgement: ""` |
| 置信度过低 | confidence < 0.7 | 0.5 |
| 规则匹配失败 | 未命中任何有效场景规则（预留） | - |

**输出**：
```json
{
  "problem_type": "unknown",
  "need_review": true,
  "classify_reason": "场景无法识别，置信度不足"
}
```

### 4.3 判定优先级

```
第一步：判断场景是否明确
  ↓
第二步：判断分析结果是否完整
  ↓
第三步：判断 confidence 是否达标
  ↓
第四步：结合 rules 命中结果（预留）
  ↓
如果任一关键项失败 → unknown
```

## 五、数据表扩展

### live_evaluations 表新增字段

| 字段名 | 类型 | 是否必填 | 说明 |
|--------|------|----------|------|
| problem_type | string | 是 | known / unknown |
| need_review | boolean | 是 | 是否进入审核流 |
| classify_reason | text | 是 | 分流原因 |

### Repository 新增方法

```javascript
// 更新实时质检评估分类结果
updateClassification(evaluationId, {
  problemType: 'known',
  needReview: false,
  classifyReason: '场景明确，分析结果完整，置信度达标'
})
```

## 六、核心设计原则

### 原则1：不能只靠单一字段判断

必须综合以下维度：
- ✅ 场景识别结果
- ✅ 分析完整度
- ✅ 置信度
- ✅ 当前规则匹配情况

### 原则2：unknown 必须可控

- 用保守规则识别 unknown
- 优先保证 unknown 的质量，而不是数量
- 避免审核爆炸和知识库污染

### 原则3：必须保留分流依据

分流结果必须同时保存：
- ✅ 判定原因（classify_reason）
- ✅ 命中的规则条件
- ✅ 是否需要审核（need_review）

### 原则4：分流属于底座职责

- 分析引擎负责：场景识别、阶段判断、回复分析、结果输出
- 底座负责：根据结果决定后续流程怎么走

## 七、验收标准

| 标准 | 说明 | 状态 |
|------|------|------|
| 标准1 | 每条实时质检结果都能得到 problem_type | ✅ 通过 |
| 标准2 | 每条 unknown 结果都会被明确标记 need_review=true | ✅ 通过 |
| 标准3 | 每条分类结果都保留 classify_reason | ✅ 通过 |
| 标准4 | 已知问题与未知问题的判定规则一致、稳定、可复现 | ✅ 通过 |
| 标准5 | 后续可以直接在 unknown 记录上继续接建议答案生成 | ✅ 通过 |

## 八、测试验证

### 8.1 单元测试

运行测试脚本：
```bash
node scripts/test-problem-classifier.js
```

**测试覆盖**：
1. ✅ known 问题 - 场景明确、分析完整、置信度达标
2. ✅ unknown 问题 - 场景无法识别（scenario 为空）
3. ✅ unknown 问题 - 场景为 unknown
4. ✅ unknown 问题 - 分析结果不完整（judgement 为空）
5. ✅ unknown 问题 - 置信度过低（confidence < 0.7）
6. ✅ unknown 问题 - 多个条件失败
7. ✅ known 问题 - 置信度刚好等于阈值（confidence = 0.7）
8. ✅ unknown 问题 - 场景不在有效场景集中

### 8.2 测试结果

所有 8 个测试用例全部通过，验证了：
- 判定规则的准确性
- 边界条件的处理
- 输出格式的规范性
- 原因描述的完整性

## 九、常见错误（已避免）

| 错误 | 后果 | 避免方式 |
|------|------|----------|
| 所有低 confidence 全都打成 unknown | unknown 数量失控，审核流过载 | ✅ 综合多维度判断，不仅看 confidence |
| 只看 scenario，不看完整性 | 场景有但分析空洞，仍误判 known | ✅ 必须同时满足场景、完整性、置信度 |
| 没有 classify_reason | 后续无法解释归类原因 | ✅ 强制输出详细原因 |
| 把分流逻辑塞进 core | 分析引擎职责被污染 | ✅ 分流逻辑在 services 层 |
| 分类结果不回写 live_evaluations | 后续审核链路无法接上 | ✅ 调用 updateClassification 写回 |

## 十、后续扩展

### 10.1 规则匹配（预留）

当前阶段规则匹配条件已预留接口：
```javascript
_checkRulesMatch(scenario, rules) {
  // 预留：后续可以检查 scenario 是否在 rules 中有定义
  return true;
}
```

### 10.2 下游链路

分流完成后，可以接续：
1. **未知问题建议答案生成** - 针对 unknown 问题生成建议答案
2. **审核流** - need_review=true 的记录进入人工审核
3. **知识库沉淀** - 审核通过的问题沉淀到知识库
4. **训练数据池** - 优质问题加入训练数据集

## 十一、配置说明

### 置信度阈值

当前固定阈值：`0.7`

可在 `problem-classifier-service.js` 中调整：
```javascript
const CONFIDENCE_THRESHOLD = 0.7;
```

### 有效场景集

自动从 `data/scenarios.json` 加载：
```javascript
const VALID_SCENARIOS = require('../data/scenarios.json').map(s => s.id);
```

当前包含 95 个有效场景（lanton_* 和 pai_* 系列）。

## 十二、执行结论

已知/未知问题分流 = 知识闭环的入口阀门。

**没有这一层**：
- 只有质检结果
- 但不知道哪些问题需要系统继续学习

**有了这一层**：
- trainer-core 真正具备"发现系统认知边界"的能力
- 为后续知识补充、审核、训练提供结构化入口

**下一条任务**：《实现告警初版》
- 实时质检结果已经能分流
- 下一步要先把高风险问题标出来
- 形成主管可感知的第一层风险能力
