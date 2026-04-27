# Qwen3 请求机制矩阵验证报告

## A. 测试概述

- 模型名称: qwen3:4b
- 执行时间: 2026/4/22 18:47:26
- 总组数: 8
- 总轮次: 24
- 测试场景: 用户：我转账成功了，但是对方没收到。
客服：你等等。

## B. 参数矩阵配置

| 组别 | num_predict | format | prompt版本 | 消息结构 | think |
|------|-------------|--------|-----------|---------|-------|
| G1 | 512 | 无 | full | system_user | false |
| G2 | 1024 | 无 | full | system_user | false |
| G3 | 2048 | 无 | full | system_user | false |
| G4 | 1024 | json | full | system_user | false |
| G5 | 1024 | 无 | compact | system_user | false |
| G6 | 1024 | 无 | minimal | system_user | false |
| G7 | 1024 | 无 | compact | single_user | false |
| G8 | 1024 | 无 | compact | system_user | 不设置 |

## C. 每组统计结果

| 组别 | parse success | valid success | usable success | done_reason=length | truncated |
|------|--------------|--------------|----------------|-------------------|-----------|
| G1 | 0/3 | 0/3 | 0/3 | 3 | 3 |
| G2 | 0/3 | 0/3 | 0/3 | 3 | 3 |
| G3 | 3/6 | 0/3 | 0/3 | 3 | 3 |
| G4 | 3/3 | 3/3 | 3/3 | 0 | 0 |
| G5 | 3/6 | 0/3 | 0/3 | 3 | 3 |
| G6 | 0/3 | 0/3 | 0/3 | 3 | 3 |
| G7 | 0/3 | 0/3 | 0/3 | 3 | 3 |
| G8 | 3/6 | 0/3 | 0/3 | 3 | 3 |

## D. 最佳组分析

**最佳组别**: G4

表现：
- usable success: 3/3
- valid success: 3/3
- parse success: 3/3
- done_reason=length: 0/3
- truncated: 0/3

分析：
- 该组在 parse success 方面表现相对较好

## E. 最终结论

当前请求机制验证通过，可进入下一步 adapter 设计

---
报告生成时间: 2026/4/22 18:47:26
