# 训练记录查询接口 - 快速参考

## 已实现的功能

### API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/training/sessions` | 查询训练会话列表（支持筛选和分页） |
| GET | `/training/sessions/:session_id` | 查询训练会话详情（含 messages、round_results、feedback） |
| GET | `/training/sessions/:session_id/rounds` | 查询训练轮次结果列表 |
| GET | `/training/stats` | 查询训练统计数据 |

### 筛选参数

所有列表和统计接口支持以下筛选参数：

- `project` - 项目标识
- `agent_id` - 客服ID
- `scenario_id` - 场景ID
- `status` - 状态 (running/finished/cancelled)
- `start_time` - 开始时间 (ISO 8601)
- `end_time` - 结束时间 (ISO 8601)

### 分页参数

- `page` - 页码（从 1 开始，默认 1）
- `page_size` - 每页数量（最大 100，默认 20）

## 修改的文件

### Repository 层（3个文件）

1. **infrastructure/persistence/mysql/mysql-training-session-repository.js**
   - 新增 `countSessions(filters)` - 统计会话数量
   - 新增 `aggregateStats(filters)` - 聚合统计数据

2. **infrastructure/persistence/mysql/mysql-training-message-repository.js**
   - 新增 `findBySessionIdOrdered(sessionId)` - 按顺序查询消息

3. **infrastructure/persistence/mysql/mysql-training-round-result-repository.js**
   - 新增 `findBySessionIdOrdered(sessionId)` - 按顺序查询轮次结果

### Service 层（1个新文件）

4. **services/training-query-service.js** ✨ 新建
   - `findTrainingSessions(filters, pagination)` - 查询会话列表
   - `getTrainingSessionById(sessionId)` - 查询会话详情
   - `listTrainingRoundResultsBySessionId(sessionId)` - 查询轮次结果
   - `listTrainingMessagesBySessionId(sessionId)` - 查询消息列表
   - `aggregateTrainingStats(filters)` - 聚合统计数据

### API 层（2个文件）

5. **core/api/training-api.js** ✨ 新建
   - 路由处理和请求验证
   - 统一错误处理
   - CORS 支持

6. **adapters/http/live-monitor-api.js**
   - 注册 `/training/*` 路由
   - 导入 TrainingAPI 模块

### 测试和文档（2个新文件）

7. **scripts/test-training-query-api.js** ✨ 新建
   - 完整的接口测试脚本

8. **docs/TRAINING_QUERY_API_GUIDE.md** ✨ 新建
   - 详细的使用指南和示例

## 启动和测试

```bash
# 1. 启动服务
node start-live-monitor.js

# 2. 运行测试（另一个终端）
node scripts/test-training-query-api.js

# 3. 手动测试
curl http://localhost:3001/training/sessions
curl http://localhost:3001/training/sessions?page=1&page_size=10
curl http://localhost:3001/training/sessions?status=finished
curl http://localhost:3001/training/stats
```

## 设计保证

✅ 只读接口，不修改数据  
✅ 不返回数据库原始字段  
✅ 不混入实时质检数据  
✅ 不影响训练主流程  
✅ 不影响 TG 实时监听链路  
✅ page_size 最大限制 100  

## 完成判定

- ✅ 可查询训练记录列表
- ✅ 可按条件筛选（project、agent_id、scenario_id、status、时间范围）
- ✅ 可查看完整训练详情（session + messages + round_results + feedback）
- ✅ 可供后续 Web 直接承接
