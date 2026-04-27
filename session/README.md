# Session 模块

## 负责什么
- 负责会话管理
- 负责 conversation 拼接、上下文维护、轮次管理
- 负责训练会话与真实监听会话的隔离

## 不负责什么
- 不负责客服回复优劣判断
- 不负责知识项生成
- 不负责统计聚合

## 输入 / 输出
- **输入**: 消息流、消息事件、sessionId、message 列表
- **输出**: 结构化 conversation、session 状态、轮次上下文

## 子模块说明
- `session-store.js` - 会话存储（内存/文件）
- `telegram-session.js` - Telegram 会话管理

## 职责边界
### Session 应该做：
1. 维护多轮对话的上下文
2. 管理会话生命周期（创建、更新、销毁）
3. 区分训练会话和监听会话
4. 提供标准化的 conversation 结构给 core 分析

### Session 不应该做：
1. ❌ 判断客服回复是否合格（应由 core 负责）
2. ❌ 识别场景或阶段（应由 core/scenario-loader、core/stage-detector 负责）
3. ❌ 生成分析结论或反馈文案（应由 core/feedback 负责）
