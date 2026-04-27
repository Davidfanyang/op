# Qwen3 JSON 输出隔离验证报告

## 基本信息

- 执行时间: 2026/4/22 18:03:41
- 模型名称: qwen3:4b
- 总轮次: 3
- 通过轮次: 0
- 失败轮次: 3
- 高风险轮次: 0

## 请求参数摘要

```json
{
  "model": "qwen3:4b",
  "think": false,
  "stream": false,
  "options": {
    "temperature": 0,
    "num_predict": 512
  }
}
```

## 测试结果

| 轮次 | done_reason | 来源 | 成功 | 失败类型 | 截断 | 字段错误 | 回复风险 |
|------|-------------|------|------|----------|------|----------|----------|
| 1 | length | - | ❌ | truncated_output | 是 | 0 | - |
| 2 | length | - | ❌ | truncated_output | 是 | 0 | - |
| 3 | length | - | ❌ | truncated_output | 是 | 0 | - |

## 统计指标

- done_reason=length 次数: 3
- truncated_output 次数: 3
- JSON parse 成功率: 0/3 (0%)
- 字段完整通过率: 0/3 (0%)

## 最终结论

❌ 隔离验证不通过，暂不允许进入主链路接入

---
报告生成时间: 2026/4/22 18:03:41
