# Repositories 模块

## 负责什么
- 负责结构化数据的读写
- 负责训练记录、质检记录、审核记录、知识库记录等持久化
- 负责对数据库表进行存取封装

## 不负责什么
- 不负责业务解释
- 不负责分析逻辑
- 不负责用户可读反馈生成

## 输入 / 输出
- **输入**: 结构化数据对象、查询条件、更新条件
- **输出**: 写入结果、查询结果、更新结果

## Repository 接口层说明
本模块定义 Repository 接口，具体实现由 `infrastructure/persistence/` 提供：
- `evaluation-repository.js` - 评估记录存取
- `message-repository.js` - 消息记录存取
- `review-repository.js` - 审核记录存取
- `session-repository.js` - 会话记录存取
- `index.js` - Repository 工厂（根据配置返回 File/MySQL 实现）

## 职责边界
- 本模块仅负责数据存取，不包含业务逻辑
- 业务解释和数据分析应由 `core` 模块负责
- 服务编排应由 `services` 模块负责
