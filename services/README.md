# Services 模块

## 负责什么
- 负责业务服务编排
- 负责组织训练、监听、入库、审核等流程
- 负责调用 session、repositories、core、adapters 等模块完成业务链路

## 不负责什么
- 不负责模型内部分析过程
- 不负责数据库底层连接细节
- 不负责把分析逻辑散写在服务层内

## 输入 / 输出
- **输入**: 统一业务请求对象，如训练请求、监听请求、审核请求
- **输出**: 业务处理结果，如分析调用结果、入库结果、反馈结果、状态结果

## 服务模块说明
- `evaluation-service.js` - 评估服务（调用 core 进行分析，调用 repositories 存储结果）
- `live-monitor-service.js` - 实时监听服务（监听模式业务编排）
- `review-service.js` - 审核服务 v1（旧版）
- `review-service-v2.js` - 审核服务 v2（新版，支持三层状态体系）
- `user-simulator.js` - AI 用户模拟器（训练系统的用户角色扮演模块）

## 职责边界（重要）
### Services 应该做：
1. 接收外部业务请求
2. 调用 `session` 获取/创建会话上下文
3. 调用 `core` 执行分析（不自己写分析逻辑）
4. 调用 `repositories` 存储分析结果
5. 调用 `adapters` 发送通知/告警
6. 返回业务处理结果
7. 调用 `user-simulator` 生成训练用户消息（仅训练模式）

### Services 不应该做：
1. ❌ 场景识别逻辑（应由 core/scenario-loader 负责）
2. ❌ 阶段判断逻辑（应由 core/stage-detector 负责）
3. ❌ 回复质量诊断（应由 core/analysis-pipeline 负责）
4. ❌ 缺口分析（应由 core/gap-analyzer 负责）
5. ❌ 风险语义判断（应由 core 相关模块负责）

## TODO: 职责错位检查
需要检查以下文件是否包含应归属于 core 的分析逻辑：
- [ ] `evaluation-service.js` - 检查是否混入场景/阶段判断逻辑
- [ ] `live-monitor-service.js` - 检查是否混入告警分流逻辑（alert-router 已在 core 中）
