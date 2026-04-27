# Adapters 模块

## 负责什么
- 负责外部输入与 trainer-core 内部统一对象之间的适配转换
- 负责把 Telegram、后续 Web、脚本输入、接口请求转成内部可处理格式
- 负责处理不同来源消息结构差异

## 不负责什么
- 不负责业务判断
- 不负责场景识别、阶段判断、回复诊断
- 不负责生成训练反馈和质检结论

## 输入 / 输出
- **输入**: TG 消息、外部接口请求、事件回调、原始请求体
- **输出**: 统一内部请求对象，如 message、conversation、metadata、source、entryType

## 子模块说明
- `telegram/telegram-client.js` - Telegram API 客户端
- `alerts/telegram-alert.js` - 告警发送适配器
- `http/live-monitor-api.js` - HTTP 监听接口适配器
