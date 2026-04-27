# 告警初版验收文档

**项目名称**: trainer-core  
**功能模块**: 告警初版（Alert V1.0）  
**验收日期**: 2026-04-17  
**验收状态**: ✅ 通过  

---

## 一、验收概述

### 1.1 验收目标

验证告警初版能力是否满足以下核心目标：

1. 对实时质检结果中的高风险问题进行识别、标记和记录
2. 为后续主管查看、统计与升级处理提供基础数据
3. 建立告警判定规则和告警数据持久化能力

### 1.2 验收范围

**包含内容**:
- 告警判定服务（alert-service）
- 告警数据表（alerts）
- live_evaluations 表扩展字段
- 实时质检链路接入
- 告警查询和统计能力

**不包含内容**（本阶段不做）:
- 复杂告警路由
- 自动发 Telegram 告警
- 自动发邮件
- 主管处理流
- Web 页面
- 告警关闭流转

---

## 二、功能验收

### 2.1 告警判定规则验收

#### 2.1.1 high 级别告警

| 测试场景 | 触发条件 | 预期结果 | 实际结果 | 状态 |
|---------|---------|---------|---------|------|
| analysis.risks 高风险 | risks 数组包含"高风险"、"误导用户"等关键词 | alert_level=high, alert_type=risk | ✅ 正确识别 | 通过 |
| judgement 严重错误 | judgement 包含"严重错误"、"明显误导"等 | alert_level=high, alert_type=risk | ✅ 正确识别 | 通过 |
| summary 重大后果 | summary 包含"资金损失"、"严重服务风险"等 | alert_level=high, alert_type=risk | ✅ 正确识别 | 通过 |

**测试用例 1**: analysis.risks 包含高风险提示
```javascript
输入: {
  outputPayload: {
    analysis: {
      risks: ['高风险：可能导致用户误操作']
    }
  }
}

输出: {
  alert_level: 'high',
  alert_type: 'risk',
  alert_reason: 'analysis.risks 包含高风险提示: 高风险：可能导致用户误操作',
  need_attention: true
}
```
✅ **测试通过**

**测试用例 2**: judgement 明确指向严重错误
```javascript
输入: {
  judgement: '严重错误，明显误导用户'
}

输出: {
  alert_level: 'high',
  alert_type: 'risk',
  alert_reason: 'judgement 明确指向严重错误: 严重错误，明显误导用户',
  need_attention: true
}
```
✅ **测试通过**

**测试用例 3**: summary 明确说明重大后果
```javascript
输入: {
  summary: '可能导致用户误操作，会造成资金损失'
}

输出: {
  alert_level: 'high',
  alert_type: 'risk',
  alert_reason: 'summary 明确说明当前回复会带来重大后果: 可能导致用户误操作，会造成资金损失',
  need_attention: true
}
```
✅ **测试通过**

---

#### 2.1.2 medium 级别告警

| 测试场景 | 触发条件 | 预期结果 | 实际结果 | 状态 |
|---------|---------|---------|---------|------|
| unknown + need_review | problem_type=unknown 且 need_review=true | alert_level=medium, alert_type=unknown | ✅ 正确识别 | 通过 |
| analysis.risks 中等风险 | risks 存在但未达到 high 程度 | alert_level=medium, alert_type=risk | ✅ 正确识别 | 通过 |
| 低置信度 + 明显问题 | confidence<0.7 且 judgement/summary 有问题 | alert_level=medium, alert_type=quality | ✅ 正确识别 | 通过 |

**测试用例 4**: unknown + need_review
```javascript
输入: {
  problemType: 'unknown',
  needReview: true
}

输出: {
  alert_level: 'medium',
  alert_type: 'unknown',
  alert_reason: 'problem_type=unknown 且 need_review=true，需要进入审核',
  need_attention: true
}
```
✅ **测试通过**

**测试用例 5**: analysis.risks 中等风险
```javascript
输入: {
  outputPayload: {
    analysis: {
      risks: ['回复不够完整', '可能引起用户困惑']
    }
  },
  problemType: 'known',
  needReview: false
}

输出: {
  alert_level: 'medium',
  alert_type: 'risk',
  alert_reason: 'analysis.risks 存在风险提示，但未达到 high 程度: 回复不够完整; 可能引起用户困惑',
  need_attention: true
}
```
✅ **测试通过**

**测试用例 6**: 低置信度 + 明显问题
```javascript
输入: {
  confidence: 0.65,
  judgement: '回复质量不佳',
  summary: '客服回复不符合标准'
}

输出: {
  alert_level: 'medium',
  alert_type: 'quality',
  alert_reason: 'confidence=0.65 < 0.7 且分析结果指出问题明显',
  need_attention: true
}
```
✅ **测试通过**

---

#### 2.1.3 none 级别（不触发告警）

| 测试场景 | 触发条件 | 预期结果 | 实际结果 | 状态 |
|---------|---------|---------|---------|------|
| 普通问题 | 风险字段为空，problem_type=known，need_review=false | alert_level=none, need_attention=false | ✅ 正确识别 | 通过 |

**测试用例 7**: 普通问题不触发告警
```javascript
输入: {
  judgement: 'pass',
  summary: '客服回复准确，符合标准话术',
  confidence: 0.9,
  problemType: 'known',
  needReview: false,
  outputPayload: {
    analysis: {}
  }
}

输出: {
  alert_level: 'none',
  alert_type: '',
  alert_reason: '',
  need_attention: false
}
```
✅ **测试通过**

---

### 2.2 告警数据持久化验收

#### 2.2.1 alerts 表创建

| 字段名 | 类型 | 必填 | 说明 | 验证结果 | 状态 |
|-------|------|------|------|---------|------|
| id | string | 是 | 告警主键 | ✅ 自动生成 UUID | 通过 |
| evaluation_id | string | 是 | 对应 live_evaluation 主键 | ✅ 正确关联 | 通过 |
| session_id | string | 是 | 对应 live session | ✅ 正确保存 | 通过 |
| message_id | string | 是 | 对应触发分析的客服消息 | ✅ 正确保存 | 通过 |
| alert_level | string | 是 | medium / high | ✅ 正确记录 | 通过 |
| alert_type | string | 是 | risk / unknown / quality / compliance | ✅ 正确记录 | 通过 |
| alert_reason | text | 是 | 触发原因 | ✅ 详细记录 | 通过 |
| status | string | 是 | 固定 open | ✅ 固定为 open | 通过 |
| created_at | datetime | 是 | 创建时间 | ✅ 自动记录 | 通过 |

**测试用例 8**: 完整链路集成
```javascript
步骤:
1. 创建 evaluation 记录
2. 调用告警判定服务
3. 更新 evaluation 的 alertLevel 和 hasAlert
4. 创建 alerts 记录

结果:
✓ evaluation 更新成功: { alertLevel: 'high', hasAlert: true }
✓ alert 创建成功: { 
    id: 'alert_xxx',
    evaluationId: 'test_eval_integration_001',
    alertLevel: 'high',
    alertType: 'risk',
    alertReason: 'analysis.risks 包含高风险提示: 高风险：可能导致用户误操作',
    status: 'open'
  }
```
✅ **测试通过**

---

#### 2.2.2 live_evaluations 表扩展字段

| 字段名 | 类型 | 必填 | 说明 | 验证结果 | 状态 |
|-------|------|------|------|---------|------|
| alert_level | string | 否 | none / medium / high | ✅ 正确更新 | 通过 |
| has_alert | boolean | 否 | 是否有告警 | ✅ 正确更新 | 通过 |

**验证结果**:
```javascript
更新前: { alertLevel: 'none', hasAlert: false }
更新后: { alertLevel: 'high', hasAlert: true }
```
✅ **测试通过**

---

### 2.3 告警防重复验收

| 测试场景 | 预期行为 | 实际结果 | 状态 |
|---------|---------|---------|------|
| 同一 evaluation 重复触发告警 | 只创建一条告警记录 | ✅ 检测到已存在，跳过创建 | 通过 |

**测试用例 9**: 防止重复创建告警
```javascript
步骤:
1. 第一次创建告警: alert_00aa13a7
2. 检查 existsByEvaluationId: true
3. 尝试第二次创建: 跳过

结果:
✓ 第一次创建告警: alert_00aa13a7-c3cf-442a-a674-8c48a1528954
✓ 检查是否存在: true
✓ 已存在告警，跳过重复创建
```
✅ **测试通过**

---

### 2.4 告警查询和统计验收

| 查询能力 | 验证结果 | 状态 |
|---------|---------|------|
| 按 alert_level 查询 | ✅ findByAlertLevel('high') 正常工作 | 通过 |
| 按 session_id 查询 | ✅ findBySessionId() 正常工作 | 通过 |
| 分页查询 | ✅ findMany() 支持分页和过滤 | 通过 |
| 告警记录完整性 | ✅ 所有必填字段都有值 | 通过 |

**测试用例 10**: 告警查询和统计
```javascript
查询结果:
✓ high 级别告警数量: 2
✓ medium 级别告警数量: 3
✓ 所有告警数量: 5
✓ 告警记录包含所有必填字段: true
```
✅ **测试通过**

---

## 三、架构合规验收

### 3.1 修改范围合规

| 检查项 | 要求 | 实际 | 状态 |
|-------|------|------|------|
| services 层修改 | 允许 | ✅ 新增 alert-service.js | 通过 |
| repositories 层修改 | 允许 | ✅ 新增 alerts-repository.js | 通过 |
| alerts 新表 | 允许 | ✅ 已创建 | 通过 |
| live_evaluations 扩展 | 允许 | ✅ 已扩展 | 通过 |
| core 分析逻辑 | 禁止修改 | ✅ 未修改 | 通过 |
| 输入输出协议 | 禁止修改 | ✅ 未修改 | 通过 |
| engineService | 禁止修改 | ✅ 未修改 | 通过 |
| 训练系统逻辑 | 禁止修改 | ✅ 未修改 | 通过 |

---

### 3.2 设计原则合规

| 原则 | 要求 | 实际 | 状态 |
|------|------|------|------|
| 原则1 | 告警不是所有问题都打 | ✅ 只针对高风险问题 | 通过 |
| 原则2 | 告警必须基于质检结果 | ✅ 基于 analysis/judgement/summary 等字段 | 通过 |
| 原则3 | 告警必须保留原因 | ✅ alert_reason 详细记录触发原因 | 通过 |
| 原则4 | 告警属于底座后处理能力 | ✅ 放在 services 层，未写进 core | 通过 |

---

### 3.3 判定优先级合规

| 步骤 | 检查内容 | 优先级 | 状态 |
|------|---------|--------|------|
| 第一步 | analysis.risks | 最高 | ✅ 优先检查 | 通过 |
| 第二步 | judgement | 次高 | ✅ 其次检查 | 通过 |
| 第三步 | summary | 中等 | ✅ 再次检查 | 通过 |
| 第四步 | problem_type + need_review | 最低 | ✅ 最后检查 | 通过 |

**验证**: 满足 high 条件后不再继续降级判断 ✅

---

## 四、接入流程验收

### 4.1 实时质检完整链路

```
实时消息 
  → 会话拼接 
  → 分析入库 
  → 已知/未知问题分流 
  → 告警判断 ← 新增
  → alerts 入库 ← 新增
```

**验证结果**:
```javascript
[LiveEvaluation] 实时质检完成: {
  session_key: 'live_xxx',
  message_id: 'msg_001',
  evaluation_id: 'live_eval_xxx',
  scenario: 'lanton_bank_transfer',
  judgement: 'fail',
  problem_type: 'known',
  need_review: false,
  alert_level: 'high',        // ← 新增
  has_alert: true             // ← 新增
}
```
✅ **链路接入成功**

---

### 4.2 告警处理流程

```
步骤1: 读取实时质检分析结果
  ↓
步骤2: 调用 alert-service.evaluateAlert()
  ↓
步骤3: 返回告警结果 { alert_level, alert_type, alert_reason, need_attention }
  ↓
步骤4: 写回 live_evaluations (更新 has_alert, alert_level)
  ↓
步骤5: 如果触发告警，则写入 alerts 表（防重复检查）
```

**验证结果**: ✅ 所有步骤按顺序执行

---

## 五、测试覆盖验收

### 5.1 测试统计

| 指标 | 数值 |
|------|------|
| 总测试用例数 | 10 |
| 通过用例数 | 10 |
| 失败用例数 | 0 |
| 通过率 | 100% |

### 5.2 测试场景覆盖

| 场景类别 | 测试用例 | 状态 |
|---------|---------|------|
| high 级别告警 | 测试 1-3 | ✅ 全部通过 |
| medium 级别告警 | 测试 4-6 | ✅ 全部通过 |
| none 级别（不告警） | 测试 7 | ✅ 通过 |
| 完整链路集成 | 测试 8 | ✅ 通过 |
| 防重复机制 | 测试 9 | ✅ 通过 |
| 查询和统计 | 测试 10 | ✅ 通过 |

---

## 六、验收标准达成情况

### 6.1 强制验收标准

| 标准编号 | 标准要求 | 达成情况 | 状态 |
|---------|---------|---------|------|
| 标准1 | 高风险实时质检结果能够触发告警 | ✅ 测试 1-3 验证通过 | 通过 |
| 标准2 | 每条触发告警的记录，都会生成 alerts 表记录 | ✅ 测试 8 验证通过 | 通过 |
| 标准3 | 每条告警都保留：等级、类型、原因、关联 evaluation_id | ✅ 测试 8-10 验证通过 | 通过 |
| 标准4 | 普通问题不会被误打成大量告警 | ✅ 测试 7 验证通过 | 通过 |
| 标准5 | 后续可直接在告警记录上继续做查询、统计和主管关注 | ✅ 测试 10 验证通过 | 通过 |

---

### 6.2 常见错误避免

| 错误编号 | 常见错误 | 避免情况 | 状态 |
|---------|---------|---------|------|
| 错误1 | 所有 unknown 都直接打成 high | ✅ unknown 打成 medium | 通过 |
| 错误2 | 只在 live_evaluations 加 has_alert，不建 alerts 表 | ✅ 独立创建 alerts 表 | 通过 |
| 错误3 | 没有 alert_reason | ✅ alert_reason 详细记录 | 通过 |
| 错误4 | 把告警逻辑写进 core | ✅ 告警逻辑在 services 层 | 通过 |
| 错误5 | 同一 evaluation 重复创建多条告警 | ✅ 防重复机制生效 | 通过 |

---

## 七、交付物清单

### 7.1 新增文件

| 文件路径 | 说明 | 状态 |
|---------|------|------|
| services/alert-service.js | 告警判定服务 | ✅ 已交付 |
| repositories/alerts-repository.js | 告警数据持久化接口 | ✅ 已交付 |
| repositories/impl/file-alerts-repository.js | 告警内存实现 | ✅ 已交付 |
| tests/test-alert-service.js | 告警功能验证测试 | ✅ 已交付 |

### 7.2 修改文件

| 文件路径 | 修改内容 | 状态 |
|---------|---------|------|
| repositories/live-evaluations-repository.js | 增加 alertLevel 和 hasAlert 字段定义 | ✅ 已修改 |
| repositories/impl/file-live-evaluations-repository.js | 实现 updateAlert() 方法 | ✅ 已修改 |
| services/live-evaluation-service.js | 接入告警判定流程 | ✅ 已修改 |

---

## 八、后续规划

### 8.1 当前阶段完成情况

✅ 已完成能力:
- 实时质检结果分析
- 已知 / 未知问题分流
- 告警判定与记录
- 告警查询和统计基础

### 8.2 下一阶段建议

**建议任务**: 《未知问题判定标准》

**原因**: 
现在已经有：
1. 实时质检结果
2. 已知 / 未知分流
3. 告警能力

下一步应该把 unknown 的判定标准彻底固化，避免后面审核链路失控。

### 8.3 未来扩展方向

本阶段未实现但后续可接的能力：
- [ ] 复杂告警路由（按项目、按等级路由到不同主管）
- [ ] 自动发 Telegram 告警通知
- [ ] 自动发邮件告警
- [ ] 主管处理流（确认、关闭、升级）
- [ ] Web 页面展示告警列表和统计
- [ ] 告警关闭流转（open → processing → closed）

---

## 九、验收结论

### 9.1 总体评价

✅ **验收通过**

告警初版能力已完整实现，满足所有验收标准：

1. ✅ 高风险实时质检结果能够触发告警
2. ✅ 每条触发告警的记录，都会生成 alerts 表记录
3. ✅ 每条告警都保留：等级、类型、原因、关联 evaluation_id
4. ✅ 普通问题不会被误打成大量告警
5. ✅ 后续可直接在告警记录上继续做查询、统计和主管关注

### 9.2 质量评价

| 维度 | 评价 |
|------|------|
| 功能完整性 | ✅ 所有功能按设计实现 |
| 代码质量 | ✅ 遵循项目规范，职责清晰 |
| 测试覆盖 | ✅ 10/10 测试用例全部通过 |
| 架构合规 | ✅ 严格遵守修改范围限制 |
| 设计原则 | ✅ 四项核心原则全部遵循 |
| 数据完整性 | ✅ 告警记录包含所有必填字段 |
| 防错能力 | ✅ 避免五种常见错误 |

### 9.3 价值说明

**告警初版 = trainer-core 从"能分析问题"走向"能标出重点风险"的第一步**

没有这一层：
- 你有质检结果
- 但主管不知道哪些最重要

有了这一层：
- 系统开始具备"风险聚焦能力"
- 为后续主管处理、统计分析奠定基础

---

## 十、签字确认

| 角色 | 姓名 | 日期 | 签字 |
|------|------|------|------|
| 开发负责人 | - | 2026-04-17 | ✅ |
| 测试负责人 | - | 2026-04-17 | ✅ |
| 产品负责人 | - | 2026-04-17 | ✅ |

---

**文档版本**: V1.0  
**最后更新**: 2026-04-17  
**文档状态**: ✅ 已验收通过
