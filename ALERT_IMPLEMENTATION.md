# 告警初版实现说明

## 实现概述

已完成告警初版能力，实现了对实时质检结果中高风险问题的识别、标记和记录。

## 实现范围

### 新增文件
1. **services/alert-service.js** - 告警判定服务
2. **repositories/alerts-repository.js** - 告警数据持久化接口
3. **repositories/impl/file-alerts-repository.js** - 告警内存实现
4. **tests/test-alert-service.js** - 告警功能验证测试

### 修改文件
1. **repositories/live-evaluations-repository.js** - 增加 alertLevel 和 hasAlert 字段定义
2. **repositories/impl/file-live-evaluations-repository.js** - 实现告警字段更新方法
3. **services/live-evaluation-service.js** - 接入告警判定流程

## 告警判定规则

### high 级别（满足任一条件）
- analysis.risks 包含高风险关键词（高风险、误导用户、严重问题、资金风险等）
- judgement 明确指向严重错误（严重错误、明显误导、风险很高等）
- summary 明确说明重大后果（资金损失、严重服务风险等）

### medium 级别（满足任一条件，且未触发 high）
- problem_type = unknown 且 need_review = true
- analysis.risks 存在风险提示但未达到 high 程度
- confidence < 0.7 且分析结果指出问题明显

### none 级别
- 不满足上述任何条件

## 数据表结构

### alerts 表
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | 是 | 告警主键 |
| evaluation_id | string | 是 | 对应 live_evaluation 主键 |
| session_id | string | 是 | 对应 live session |
| message_id | string | 是 | 对应触发分析的客服消息 |
| alert_level | string | 是 | medium / high |
| alert_type | string | 是 | risk / unknown / quality / compliance |
| alert_reason | text | 是 | 触发原因 |
| status | string | 是 | 固定 open |
| created_at | datetime | 是 | 创建时间 |

### live_evaluations 表扩展字段
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| alert_level | string | 否 | none / medium / high |
| has_alert | boolean | 否 | 是否有告警 |

## 接入流程

实时质检完整链路现为：

```
实时消息 → 会话拼接 → 分析入库 → 已知/未知问题分流 → 告警判断 → alerts 入库
```

## 验收结果

✅ 所有测试通过（10/10）

1. ✓ 高风险实时质检结果能够触发告警
2. ✓ 每条触发告警的记录，都会生成 alerts 表记录
3. ✓ 每条告警都保留：等级、类型、原因、关联 evaluation_id
4. ✓ 普通问题不会被误打成大量告警
5. ✓ 后续可直接在告警记录上继续做查询、统计和主管关注

## 设计原则遵循

1. ✓ 告警不是所有问题都打 - 只针对高风险问题
2. ✓ 告警必须基于质检结果 - 不允许凭空生成
3. ✓ 告警必须保留原因 - 记录触发原因和风险类型
4. ✓ 告警属于底座后处理能力 - 未写进 core 分析引擎

## 下一步建议

根据任务规划，下一步应该实现：《未知问题判定标准》

因为现在已经有：
- 实时质检结果
- 已知 / 未知分流
- 告警能力

下一步就该把 unknown 的判定标准彻底固化，避免后面审核链路失控。
