# 未知问题判定标准验收文档

**项目名称**: trainer-core  
**功能模块**: 未知问题判定标准（Problem Classifier V2.0）  
**验收日期**: 2026-04-17  
**验收状态**: ✅ 首版通过（阶段性通过）

---

## 一、验收概述

### 1.1 验收目标

验证未知问题判定标准是否满足以下核心目标：

1. 明确什么样的实时质检结果应被认定为 unknown
2. 明确什么样的实时质检结果应被认定为 known
3. 避免 unknown 失控（不能把大量普通问题都打成 unknown）
4. 为后续"建议答案生成 → 主管审核 → 知识库沉淀"提供入口

### 1.2 验收范围

**包含内容**:
- unknown 判定条件（场景/完整性/confidence/规则）
- known 判定条件（必须同时满足）
- 判定优先级（固定顺序）
- 判定结果字段（problem_type / need_review / classify_reason）
- problem-classifier-service 固化实现

**不包含内容**（本阶段不做）:
- 建议答案生成
- 审核页面
- FAQ 沉淀
- 训练数据池
- Web 页面

---

## 二、功能验收

### 2.1 known 判定验收

#### 2.1.1 标准定义

**known 代表**：系统当前已稳定覆盖该问题，可以直接用于普通质检与统计。

**必须同时满足**：
1. 场景识别明确（scenario 非空、非 unknown/other、在有效场景集）
2. 分析结果完整（judgement/summary/analysis 都有值）
3. confidence 达标（>= 0.7）
4. 规则可承接（如已实现）

#### 2.1.2 测试用例

| 测试场景 | 输入条件 | 预期输出 | 实际结果 | 状态 |
|---------|---------|---------|---------|------|
| 所有条件都满足 | scenario=lanton_bank_transfer, judgement/summary/analysis 完整, confidence=0.92 | problem_type=known, need_review=false | ✅ 符合 | ✅ 通过 |
| confidence 边界值 | scenario 明确, analysis 完整, confidence=0.7 | problem_type=known, need_review=false | ✅ 符合 | ✅ 通过 |

**验收结论**: ✅ known 判定标准正确，必须同时满足所有条件

---

### 2.2 unknown 判定验收

#### 2.2.1 标准定义

**unknown 代表**：系统当前未稳定覆盖该问题，需要后续人工关注。

**满足任一条件即可**：
1. 场景无法识别（scenario 为空/unknown/other/不在有效场景集）
2. 分析结果不完整（judgement/summary/analysis 缺失或为空）
3. confidence 不达标（< 0.7）
4. 规则无法承接（如已实现）

#### 2.2.2 测试用例

| 测试场景 | 输入条件 | 预期输出 | 实际结果 | 状态 |
|---------|---------|---------|---------|------|
| 场景为空 | scenario=null | problem_type=unknown, classify_reason=场景无法识别 | ✅ 符合 | ✅ 通过 |
| 场景为 unknown | scenario='unknown' | problem_type=unknown, classify_reason=场景无法识别 | ✅ 符合 | ✅ 通过 |
| 场景为 other | scenario='other' | problem_type=unknown, classify_reason=场景无法识别 | ✅ 符合 | ✅ 通过 |
| 场景不在有效场景集 | scenario='invalid_xyz' | problem_type=unknown, classify_reason=场景不在当前项目有效场景范围内 | ✅ 符合 | ✅ 通过 |
| judgement 为空 | judgement='' | problem_type=unknown, classify_reason=缺少 judgement 核心信息 | ✅ 符合 | ✅ 通过 |
| summary 为空 | summary=null | problem_type=unknown, classify_reason=缺少 summary 核心信息 | ✅ 符合 | ✅ 通过 |
| analysis 为空对象 | analysis={} | problem_type=unknown, classify_reason=analysis 为空或缺失 | ✅ 符合 | ✅ 通过 |
| analysis 仅有空数组 | analysis={risks: [], suggestions: []} | problem_type=unknown | ✅ 符合 | ✅ 通过 |
| confidence < 0.7 | confidence=0.65 | problem_type=unknown, classify_reason=置信度不足 | ✅ 符合 | ✅ 通过 |
| 多个条件同时失败 | scenario='', confidence=0.5 | problem_type=unknown, classify_reason=场景无法识别（优先级正确） | ✅ 符合 | ✅ 通过 |
| 场景明确但 analysis 不完整 | scenario 明确, summary='', confidence=0.9 | problem_type=unknown, classify_reason=缺少 summary 核心信息（优先级正确） | ✅ 符合 | ✅ 通过 |

**验收结论**: ✅ unknown 判定标准正确，满足任一条件即可判定

---

### 2.3 判定优先级验收

#### 2.3.1 固定顺序

**标准要求**（必须按顺序）：
1. 第一步：场景是否明确
2. 第二步：分析结果是否完整
3. 第三步：confidence 是否达标
4. 第四步：规则是否可承接

**关键要求**：只要前面任一关键条件失败，直接归为 unknown。

#### 2.3.2 测试验证

| 测试场景 | 失败条件 | 预期返回原因 | 实际返回 | 状态 |
|---------|---------|-------------|---------|------|
| 场景空 + confidence 低 | 场景失败（优先） | 场景无法识别 | ✅ 场景无法识别 | ✅ 通过 |
| 场景明确 + summary 空 + confidence 低 | 分析完整性失败（优先） | 缺少 summary 核心信息 | ✅ 缺少 summary 核心信息 | ✅ 通过 |

**验收结论**: ✅ 判定优先级正确，early-return 机制生效

---

### 2.4 输出结构验收

#### 2.4.1 固定输出格式

**标准要求**：

```json
// known 输出
{
  "problem_type": "known",
  "need_review": false,
  "classify_reason": "场景明确，分析结果完整，置信度达标"
}

// unknown 输出
{
  "problem_type": "unknown",
  "need_review": true,
  "classify_reason": "具体失败原因"
}
```

#### 2.4.2 字段验证

| 字段 | 类型 | 是否必填 | 验证结果 | 状态 |
|-----|------|---------|---------|------|
| problem_type | string | 是 | ✅ 所有用例都返回 known/unknown | ✅ 通过 |
| need_review | boolean | 是 | ✅ unknown 自动 true，known 自动 false | ✅ 通过 |
| classify_reason | text | 是 | ✅ 所有用例都包含具体原因 | ✅ 通过 |

**验收结论**: ✅ 输出结构固定且一致

---

## 三、架构合规验收

### 3.1 修改范围合规

| 检查项 | 要求 | 实际 | 状态 |
|-------|------|------|------|
| services/problem-classifier-service.js | 允许修改 | ✅ 已固化 | ✅ 通过 |
| repositories | 允许修改 | ✅ 未修改（字段已存在） | ✅ 通过 |
| core 分析逻辑 | 禁止修改 | ✅ 未修改 | ✅ 通过 |
| 输入输出协议 | 禁止修改 | ✅ 未修改 | ✅ 通过 |
| engineService | 禁止修改 | ✅ 未修改 | ✅ 通过 |
| 训练系统逻辑 | 禁止修改 | ✅ 未修改 | ✅ 通过 |

### 3.2 设计原则合规

| 原则 | 要求 | 验证结果 | 状态 |
|-----|------|---------|------|
| 原则1 | unknown 代表"系统未稳定覆盖"，不是"客服说得差" | ✅ 判定基于场景/完整性/confidence，不基于客服质量 | ✅ 通过 |
| 原则2 | 必须多维判断，不能只靠一个字段 | ✅ 综合判断场景、完整性、confidence、规则 | ✅ 通过 |
| 原则3 | 优先保证 unknown 的质量，标准偏保守 | ✅ 任一条件失败即判定 unknown | ✅ 通过 |
| 原则4 | 判定必须可解释 | ✅ 所有结果都带 classify_reason | ✅ 通过 |

### 3.3 判定优先级合规

| 检查项 | 要求 | 实际 | 状态 |
|-------|------|------|------|
| 第一步 | 先判断场景是否明确 | ✅ _isScenarioClear() | ✅ 通过 |
| 第二步 | 再判断分析结果是否完整 | ✅ _isAnalysisComplete() | ✅ 通过 |
| 第三步 | 再判断 confidence 是否达标 | ✅ _isConfidencePass() | ✅ 通过 |
| 第四步 | 最后判断规则是否可承接 | ⚠️ _checkRulesMatch() 预留，未真实生效 | ⚠️ 未闭环 |
| early-return | 关键条件失败直接归 unknown | ✅ 立即返回 unknown | ✅ 通过 |

---

## 四、接入流程验收

### 4.1 实时质检完整链路

**当前链路**：

```
实时消息 → 会话拼接 → 分析入库 → 已知/未知问题分流 → 告警判断 → alerts 入库
```

**验收点**：

| 检查项 | 要求 | 实际 | 状态 |
|-------|------|------|------|
| 输入来源 | 使用 live_evaluation.output_payload | ✅ 从 evaluationRecord 提取扁平化字段 | ✅ 通过 |
| 读取字段 | scenario/judgement/summary/analysis/confidence | ✅ 全部读取 | ✅ 通过 |
| 调用分类服务 | problem-classifier-service | ✅ live-evaluation-service 调用 defaultClassifier | ✅ 通过 |
| 写回数据库 | problem_type/need_review/classify_reason | ✅ _classifyProblem() 写回 live_evaluations | ✅ 通过 |
| 后续接入告警 | 分类结果用于告警判断 | ✅ updatedEvaluation 传递给 _processAlert() | ✅ 通过 |

### 4.2 live-evaluation-service 接入验证

```javascript
// 步骤 6: 已知/未知问题分流
const { classificationResult, updatedEvaluation } = await this._classifyProblem(evaluationRecord);

// 步骤 7: 告警判断与入库
const { alertResult, alertRecord } = await this._processAlert(updatedEvaluation);
```

**验收结论**: ✅ 接入位置正确，流程完整

---

## 五、测试覆盖验收

### 5.1 测试用例统计

| 测试类别 | 用例数 | 通过数 | 失败数 | 通过率 |
|---------|--------|--------|--------|--------|
| known 判定 | 2 | 2 | 0 | 100% |
| unknown 判定 - 场景 | 4 | 4 | 0 | 100% |
| unknown 判定 - 完整性 | 4 | 4 | 0 | 100% |
| unknown 判定 - confidence | 2 | 2 | 0 | 100% |
| 优先级验证 | 2 | 2 | 0 | 100% |
| 输出结构验证 | 1 | 1 | 0 | 100% |
| **总计** | **15** | **15** | **0** | **100%** |

### 5.2 测试文件

- **测试脚本**: [tests/test-problem-classifier-standard.js](file:///Users/adime/.openclaw/workspace/trainer-core/tests/test-problem-classifier-standard.js)
- **测试输出**: 10.3 KB 完整日志，所有用例通过

---

## 六、验收标准达成情况

### 6.1 强制标准

| 标准 | 要求 | 验证结果 | 状态 |
|-----|------|---------|------|
| 标准1 | 每条实时质检结果都能得到明确的 problem_type | ✅ 15/15 用例都返回 problem_type | ✅ 达到 |
| 标准2 | unknown 的判定标准固定且一致 | ✅ 同一输入始终返回相同结果 | ✅ 达到 |
| 标准3 | 所有 unknown 都自动带 need_review=true | ✅ 所有 unknown 用例 need_review=true | ✅ 达到 |
| 标准4 | 所有分类结果都带 classify_reason | ✅ 15/15 用例都包含 classify_reason | ✅ 达到 |
| 标准5 | 后续可直接基于 unknown 接建议答案生成 | ✅ unknown 记录完整，可直接查询 | ✅ 达到 |

### 6.2 常见错误避免

| 错误 | 后果 | 避免措施 | 验证结果 | 状态 |
|-----|------|---------|---------|------|
| 错误1 | 把"客服回复差"直接判成 unknown | ✅ 判定基于系统能力，不基于客服质量 | ✅ 未发生 | ✅ 避免 |
| 错误2 | 只看 confidence | ✅ 综合判断场景、完整性、confidence | ✅ 未发生 | ✅ 避免 |
| 错误3 | 只看 scenario | ✅ 必须同时满足场景、完整性、confidence | ✅ 未发生 | ✅ 避免 |
| 错误4 | 没有 classify_reason | ✅ 所有结果都包含具体原因 | ✅ 未发生 | ✅ 避免 |
| 错误5 | 标准写成开放式、模糊式 | ✅ 标准固定、明确、可执行 | ✅ 未发生 | ✅ 避免 |

---

## 七、交付物清单

### 7.1 修改文件

| 文件 | 修改内容 | 行数变化 |
|-----|---------|---------|
| [services/problem-classifier-service.js](file:///Users/adime/.openclaw/workspace/trainer-core/services/problem-classifier-service.js) | 固化判定标准、优先级、原因构建 | +131 / -48 |

### 7.2 新增文件

| 文件 | 用途 | 行数 |
|-----|------|------|
| [tests/test-problem-classifier-standard.js](file:///Users/adime/.openclaw/workspace/trainer-core/tests/test-problem-classifier-standard.js) | 未知问题判定标准验证测试 | 581 |
| [CLASSIFIER_V2_ACCEPTANCE.md](file:///Users/adime/.openclaw/workspace/trainer-core/CLASSIFIER_V2_ACCEPTANCE.md) | 本验收文档 | - |

### 7.3 关键改进

1. **判定优先级固化**
   - 从综合判定改为 early-return 机制
   - 严格按照场景 → 完整性 → confidence → 规则顺序判断
   - 关键条件失败立即返回 unknown

2. **原因构建精确化**
   - 新增 `_getScenarioFailureReason()` 方法
   - 新增 `_getAnalysisFailureReason()` 方法
   - 每个失败点都有具体原因说明

3. **分析完整性判断增强**
   - 增加空数组检测（analysis 仅有空数组视为不完整）
   - 增加有效内容检测（至少一个字段有实际内容）

4. **预留规则接口**
   - 明确 TODO 标记
   - 预留后续规则命中判断逻辑位
   - ⚠️ 当前未真实生效，属于未闭环项

---

## 八、后续规划

### 8.1 下一阶段任务

**《未知问题建议答案生成执行单》**

**前提条件**：✅ unknown 已能被稳定识别

**目标**：
- 对 unknown 问题生成候选答案
- 交给主管审核
- 审核通过后沉淀到知识库

### 8.2 后续优化建议

1. **规则命中机制实现**（⚠️ 未闭环项）
   - 当前 `_checkRulesMatch()` 返回 true（预留）
   - **未闭环原因**：规则承接维度尚未真实生效
   - 后续需要实现真正的规则匹配逻辑
   - **影响**：当前 known 判定缺少规则承接验证，可能将规则未覆盖的问题误判为 known

2. **confidence 阈值调优**（⚠️ 经验值）
   - 当前固定 0.7
   - **未闭环原因**：阈值仍属经验值，未基于实际数据校准
   - 后续可根据实际数据调整

3. **场景集动态加载**（⚠️ 静态加载）
   - 当前从 scenarios.json 静态加载
   - **未闭环原因**：场景集仍为静态加载，不支持动态更新
   - 后续可能需要支持动态更新

---

## 九、验收结论

### 9.1 总体评价

✅ **首版通过（阶段性通过）**

未知问题判定标准已实现首版固化，**可进入下一任务**，但存在未闭环项。

**首版通过范围**：
1. ✅ known / unknown 基础判定标准明确且一致
2. ✅ 判定优先级固定（场景 → 完整性 → confidence → 规则）
3. ✅ 所有分类结果都包含可解释的原因
4. ✅ unknown 自动标记 need_review=true
5. ✅ 15/15 测试用例全部通过
6. ✅ 架构合规，未修改核心分析逻辑
7. ✅ 后续可直接接入建议答案生成

**未完全通过范围**（未闭环项）：
1. ⚠️ 规则承接维度尚未真实生效（_checkRulesMatch() 仍为预留）
2. ⚠️ confidence 阈值仍属经验值（未基于实际数据校准）
3. ⚠️ 场景集仍为静态加载（不支持动态更新）

### 9.2 质量评价

| 维度 | 评分 | 说明 |
|-----|------|------|
| 功能完整性 | ⭐⭐⭐⭐☆ | 基础判定条件完整实现，规则承接维度未闭环 |
| 标准一致性 | ⭐⭐⭐⭐⭐ | 同一输入始终返回相同结果 |
| 可解释性 | ⭐⭐⭐⭐⭐ | 所有结果都带具体原因 |
| 架构合规 | ⭐⭐⭐⭐⭐ | 严格遵守修改范围限制 |
| 测试覆盖 | ⭐⭐⭐⭐⭐ | 15 个用例覆盖所有场景（除规则承接） |
| 代码质量 | ⭐⭐⭐⭐⭐ | 清晰的优先级和 early-return |

### 9.3 未闭环项（必须后续补强）

⚠️ **未闭环项 1：规则命中机制未实现**（优先级：高）

- **当前状态**：`_checkRulesMatch()` 固定返回 true（预留接口）
- **未闭环原因**：规则承接维度尚未真实生效
- **影响范围**：
  - 当前 known 判定缺少规则承接验证
  - 可能将规则未覆盖的问题误判为 known
  - 四维判定实际只有三维生效（场景、完整性、confidence）
- **后续要求**：
  - 实现真正的规则匹配逻辑
  - 检查 scenario 是否在 rules 中有定义
  - 检查当前分析结果是否命中有效规则
  - 检查规则与识别场景是否矛盾
- **建议优先级**：在《未知问题建议答案生成执行单》之前或同步完成

⚠️ **未闭环项 2：confidence 阈值仍属经验值**（优先级：中）

- **当前状态**：固定阈值 0.7
- **未闭环原因**：未基于实际数据校准
- **影响范围**：
  - 可能导致部分边界案例判定不准确
  - 过严：增加 unknown 数量，审核链路压力增大
  - 过宽：降低 unknown 质量，后续审核价值下降
- **后续要求**：
  - 收集实际运行数据
  - 分析 known/unknown 分布比例
  - 根据审核反馈调整阈值
- **建议时机**：运行 1-2 周后根据数据调优

⚠️ **未闭环项 3：场景集静态加载**（优先级：低）

- **当前状态**：从 scenarios.json 静态加载
- **未闭环原因**：不支持动态更新场景
- **影响范围**：
  - 新增场景需要修改文件并重启服务
  - 不支持运行时场景热更新
- **后续要求**：
  - 支持场景集动态加载（如从数据库读取）
  - 支持场景集运行时更新
- **建议时机**：场景数量快速增长或有动态更新需求时

---

## 十、签字确认

| 角色 | 姓名 | 日期 | 签字 |
|-----|------|------|------|
| 开发 | Qoder AI | 2026-04-17 | ✅ |
| 验收 | 用户 | 2026-04-17 | 待确认 |

---

**文档版本**: v1.1  
**最后更新**: 2026-04-17  
**状态**: ✅ 首版通过（阶段性通过）  
**验收结论**: 可进入下一任务，但保留 3 个未闭环项
