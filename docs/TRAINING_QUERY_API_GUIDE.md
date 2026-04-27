# 训练记录查询接口使用指南

## 概述

训练记录查询接口提供对已入库的 TG 训练记录的只读查询能力，供后续 Web 页面、主管复盘和训练统计使用。

## API 端点

所有接口均通过 Live Monitor API 服务暴露，默认端口：`3001`

### 1. 查询训练会话列表

**端点**: `GET /training/sessions`

**查询参数**:
- `project` (可选): 项目标识
- `agent_id` (可选): 客服ID
- `scenario_id` (可选): 场景ID
- `status` (可选): 状态 (running/finished/cancelled)
- `start_time` (可选): 开始时间 (ISO 8601 格式)
- `end_time` (可选): 结束时间 (ISO 8601 格式)
- `page` (可选): 页码，从 1 开始，默认 1
- `page_size` (可选): 每页数量，最大 100，默认 20

**示例**:
```bash
# 查询所有训练会话
curl http://localhost:3001/training/sessions

# 分页查询
curl http://localhost:3001/training/sessions?page=1&page_size=10

# 按项目筛选
curl http://localhost:3001/training/sessions?project=default

# 按客服筛选
curl http://localhost:3001/training/sessions?agent_id=agent123

# 按状态筛选
curl http://localhost:3001/training/sessions?status=finished

# 按时间范围筛选
curl http://localhost:3001/training/sessions?start_time=2026-04-12T00:00:00Z&end_time=2026-04-19T23:59:59Z

# 组合筛选
curl http://localhost:3001/training/sessions?project=default&status=finished&page=1&page_size=20
```

**响应示例**:
```json
{
  "success": true,
  "code": "OK",
  "message": "ok",
  "data": {
    "items": [
      {
        "sessionId": "train_1713513600000_abc123",
        "project": "default",
        "scenarioId": "scenario_001",
        "scenarioTitle": "转账查询场景",
        "agentId": "agent123",
        "chatId": "123456789",
        "status": "finished",
        "totalRounds": 3,
        "startedAt": "2026-04-19T10:00:00.000Z",
        "finishedAt": "2026-04-19T10:15:00.000Z",
        "createdAt": "2026-04-19T10:00:00.000Z",
        "updatedAt": "2026-04-19T10:15:00.000Z"
      }
    ],
    "pagination": {
      "limit": 20,
      "offset": 0,
      "hasMore": false,
      "total": 1
    }
  },
  "meta": {
    "requestId": "req_1713513600000_xyz",
    "timestamp": "2026-04-19T10:20:00.000Z"
  }
}
```

### 2. 查询训练会话详情

**端点**: `GET /training/sessions/:session_id`

**路径参数**:
- `session_id`: 训练会话ID

**示例**:
```bash
curl http://localhost:3001/training/sessions/train_1713513600000_abc123
```

**响应示例**:
```json
{
  "success": true,
  "code": "OK",
  "message": "ok",
  "data": {
    "session": {
      "sessionId": "train_1713513600000_abc123",
      "project": "default",
      "scenarioId": "scenario_001",
      "scenarioTitle": "转账查询场景",
      "agentId": "agent123",
      "chatId": "123456789",
      "status": "finished",
      "totalRounds": 3,
      "startedAt": "2026-04-19T10:00:00.000Z",
      "finishedAt": "2026-04-19T10:15:00.000Z",
      "createdAt": "2026-04-19T10:00:00.000Z",
      "updatedAt": "2026-04-19T10:15:00.000Z"
    },
    "messages": [
      {
        "id": 1,
        "sessionId": "train_1713513600000_abc123",
        "round": 0,
        "role": "user",
        "content": "你好，我想查询一下我的转账记录",
        "source": "ai",
        "createdAt": "2026-04-19T10:00:05.000Z"
      },
      {
        "id": 2,
        "sessionId": "train_1713513600000_abc123",
        "round": 0,
        "role": "agent",
        "content": "您好，请问您的转账时间和金额是多少？",
        "source": "human",
        "createdAt": "2026-04-19T10:00:15.000Z"
      }
    ],
    "roundResults": [
      {
        "id": 1,
        "sessionId": "train_1713513600000_abc123",
        "round": 0,
        "scenarioId": "scenario_001",
        "scenarioTitle": "转账查询场景",
        "analysisRaw": {...},
        "feedbackText": "客服回复良好，但可以更主动...",
        "structuredFeedback": {...},
        "isFinished": false,
        "createdAt": "2026-04-19T10:01:00.000Z"
      }
    ],
    "feedbackText": "客服回复良好，但可以更主动...",
    "structuredFeedback": {...}
  },
  "meta": {
    "requestId": "req_1713513600000_xyz",
    "timestamp": "2026-04-19T10:20:00.000Z"
  }
}
```

### 3. 查询训练轮次结果

**端点**: `GET /training/sessions/:session_id/rounds`

**路径参数**:
- `session_id`: 训练会话ID

**示例**:
```bash
curl http://localhost:3001/training/sessions/train_1713513600000_abc123/rounds
```

**响应示例**:
```json
{
  "success": true,
  "code": "OK",
  "message": "ok",
  "data": {
    "session": {
      "sessionId": "train_1713513600000_abc123",
      "project": "default",
      "scenarioId": "scenario_001",
      "scenarioTitle": "转账查询场景",
      "agentId": "agent123",
      "chatId": "123456789",
      "status": "finished",
      "totalRounds": 3,
      "startedAt": "2026-04-19T10:00:00.000Z",
      "finishedAt": "2026-04-19T10:15:00.000Z",
      "createdAt": "2026-04-19T10:00:00.000Z",
      "updatedAt": "2026-04-19T10:15:00.000Z"
    },
    "roundResults": [
      {
        "id": 1,
        "sessionId": "train_1713513600000_abc123",
        "round": 0,
        "scenarioId": "scenario_001",
        "scenarioTitle": "转账查询场景",
        "analysisRaw": {...},
        "feedbackText": "客服回复良好，但可以更主动...",
        "structuredFeedback": {...},
        "isFinished": false,
        "createdAt": "2026-04-19T10:01:00.000Z"
      },
      {
        "id": 2,
        "sessionId": "train_1713513600000_abc123",
        "round": 1,
        "scenarioId": "scenario_001",
        "scenarioTitle": "转账查询场景",
        "analysisRaw": {...},
        "feedbackText": "客服 improved，回复更加专业...",
        "structuredFeedback": {...},
        "isFinished": false,
        "createdAt": "2026-04-19T10:05:00.000Z"
      },
      {
        "id": 3,
        "sessionId": "train_1713513600000_abc123",
        "round": 2,
        "scenarioId": "scenario_001",
        "scenarioTitle": "转账查询场景",
        "analysisRaw": {...},
        "feedbackText": "客服表现优秀，达到标准！",
        "structuredFeedback": {...},
        "isFinished": true,
        "createdAt": "2026-04-19T10:10:00.000Z"
      }
    ]
  },
  "meta": {
    "requestId": "req_1713513600000_xyz",
    "timestamp": "2026-04-19T10:20:00.000Z"
  }
}
```

### 4. 查询训练统计数据

**端点**: `GET /training/stats`

**查询参数**:
- `project` (可选): 项目标识
- `agent_id` (可选): 客服ID
- `scenario_id` (可选): 场景ID
- `start_time` (可选): 开始时间 (ISO 8601 格式)
- `end_time` (可选): 结束时间 (ISO 8601 格式)

**示例**:
```bash
# 查询总体统计
curl http://localhost:3001/training/stats

# 按项目筛选统计
curl http://localhost:3001/training/stats?project=default

# 按时间范围筛选统计
curl http://localhost:3001/training/stats?start_time=2026-04-12T00:00:00Z&end_time=2026-04-19T23:59:59Z
```

**响应示例**:
```json
{
  "success": true,
  "code": "OK",
  "message": "ok",
  "data": {
    "totalSessions": 50,
    "finishedSessions": 45,
    "runningSessions": 3,
    "cancelledSessions": 2,
    "avgRounds": 2.8,
    "maxRounds": 5,
    "byScenario": [
      {
        "scenario_id": "scenario_001",
        "scenario_title": "转账查询场景",
        "session_count": 20,
        "avg_rounds": 2.5
      },
      {
        "scenario_id": "scenario_002",
        "scenario_title": "投诉处理场景",
        "session_count": 15,
        "avg_rounds": 3.2
      }
    ],
    "byAgent": [
      {
        "agent_id": "agent123",
        "session_count": 10,
        "avg_rounds": 2.3,
        "finished_count": 9
      },
      {
        "agent_id": "agent456",
        "session_count": 8,
        "avg_rounds": 3.1,
        "finished_count": 7
      }
    ]
  },
  "meta": {
    "requestId": "req_1713513600000_xyz",
    "timestamp": "2026-04-19T10:20:00.000Z"
  }
}
```

## 启动服务

```bash
# 启动 Live Monitor 服务（包含 Training API）
node start-live-monitor.js
```

服务启动后，控制台会显示所有可用的 API 端点。

## 测试脚本

项目提供了测试脚本用于验证查询接口：

```bash
# 运行测试脚本
node scripts/test-training-query-api.js
```

测试脚本会依次测试：
1. 查询训练会话列表
2. 按条件筛选训练会话
3. 查看训练会话详情
4. 查看训练轮次结果
5. 查看训练统计数据

## 错误响应

所有接口在出错时返回统一格式的错误响应：

```json
{
  "success": false,
  "code": "TRAINING_SESSION_NOT_FOUND",
  "message": "training session not found",
  "data": null,
  "meta": {
    "requestId": "req_1713513600000_xyz",
    "timestamp": "2026-04-19T10:20:00.000Z"
  }
}
```

常见错误码：
- `NOT_FOUND`: 接口不存在
- `TRAINING_SESSION_NOT_FOUND`: 训练会话不存在
- `METHOD_NOT_ALLOWED`: 请求方法不允许（只支持 GET）
- `INTERNAL_ERROR`: 服务器内部错误

## 设计原则

1. **只读接口**: 所有接口均为只读，不修改任何数据
2. **数据隔离**: 不混入实时质检数据，仅返回训练相关数据
3. **字段标准化**: 不直接返回数据库原始字段，统一使用驼峰命名
4. **无影响**: 不影响训练主流程和 TG 实时监听链路
5. **分页限制**: page_size 最大为 100，防止一次性返回过多数据

## 后续扩展

本接口为后续功能提供数据支撑：
- Web 管理页面展示训练记录
- 主管复盘界面
- 训练统计报表
- 客服培训效果分析
