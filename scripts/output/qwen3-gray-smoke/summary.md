# Qwen3 灰度冒烟测试报告

- 生成时间：2026-04-22T17:53:12.149Z
- 总场景数：5
- grayHit 次数：5
- qwen3 成功次数：4
- fallback 次数：1
- 高风险回复次数：0
- 脚本异常次数：0

## Route 统计

- qwen3_adapter: 4
- fallback_original: 1
- original_direct: 0
- unknown: 0

## 场景结果

| 场景 | grayHit | route | qwenSuccess | fallback | failureType | replyRisk |
|---|---:|---|---:|---:|---|---|
| 转账成功但对方未收到 | true | qwen3_adapter | true | false | - | no_obvious_risk |
| 提现一直没到账 | true | qwen3_adapter | true | false | - | no_obvious_risk |
| 支付失败但被扣款 | true | qwen3_adapter | true | false | - | no_obvious_risk |
| 客服回复敷衍 | true | fallback_original | false | true | risky_suggested_reply | - |
| 用户信息严重缺失 | true | qwen3_adapter | true | false | - | no_obvious_risk |

## 最终结论

✅ PASS
