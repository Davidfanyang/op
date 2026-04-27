# 训练记录入库功能实现说明

## 功能概述

本次实现为 trainer-core 添加了完整的训练记录入库能力，将 TG 训练过程中的会话、消息、每轮分析结果、每轮反馈结果全部结构化保存到 MySQL 数据库。

## 实现内容

### 1. 新增数据表（3张）

#### training_sessions - 训练会话表
存储训练会话的主记录，包含：
- `session_id`: 训练会话唯一ID
- `project`: 项目标识（默认 'default'）
- `scenario_id`: 场景ID
- `scenario_title`: 场景标题
- `agent_id`: 客服ID
- `chat_id`: Telegram chat ID
- `status`: 状态（running/finished/cancelled）
- `total_rounds`: 总轮次
- `started_at`: 训练开始时间
- `finished_at`: 训练结束时间

#### training_messages - 训练消息表
存储训练过程中的每条消息，包含：
- `session_id`: 所属训练会话ID
- `round`: 轮次（从0开始）
- `role`: 角色（user/agent）
- `content`: 消息内容
- `source`: 来源（ai/human）

#### training_round_results - 训练轮次结果表
存储每轮的分析结果和反馈结果，包含：
- `session_id`: 所属训练会话ID
- `round`: 轮次（从0开始）
- `scenario_id`: 场景ID
- `scenario_title`: 场景标题
- `analysis_raw`: 分析引擎原始输出JSON
- `feedback_text`: 客服可读的反馈文本
- `structured_feedback`: 结构化反馈JSON（来自feedback-template-service）
- `is_finished`: 该轮是否为最后一轮

### 2. Repository 层（6个文件）

**接口定义**（repositories/）：
- `training-session-repository.js` - 训练会话接口
- `training-message-repository.js` - 训练消息接口
- `training-round-result-repository.js` - 训练轮次结果接口

**MySQL实现**（infrastructure/persistence/mysql/）：
- `mysql-training-session-repository.js`
- `mysql-training-message-repository.js`
- `mysql-training-round-result-repository.js`

### 3. Service 层（1个文件）

- `services/training-record-service.js` - 训练记录服务
  - 封装所有训练数据的入库逻辑
  - 提供统一的查询接口
  - 支持按 session_id 还原完整训练过程

### 4. 集成到训练流程

修改了 `services/training-orchestrator.js`，在以下关键节点接入训练记录入库：

1. **训练开始时**：创建 training_sessions 记录
2. **userSimulator 发言后**：写入 training_messages（role=user）
3. **客服回复后**：写入 training_messages（role=agent）
4. **每轮分析与反馈完成后**：写入 training_round_results
5. **训练结束时**：更新 training_sessions 状态与总轮次
6. **训练取消时**：更新 training_sessions 状态

## 数据入库流程

```
训练开始
  ↓
创建 training_sessions 记录（status=running）
  ↓
生成用户消息（Round 0）
  ↓
写入 training_messages（role=user, round=0）
  ↓
等待客服回复...
  ↓
收到客服回复
  ↓
写入 training_messages（role=agent, round=0）
  ↓
调用分析引擎 → 生成反馈
  ↓
写入 training_round_results（round=0, 含analysis_raw + feedback_text + structured_feedback）
  ↓
判断是否结束？
  ├─ 否：round+1，继续下一轮
  └─ 是：更新 training_sessions（status=finished, total_rounds=N）
```

## 部署步骤

### 1. 创建数据库表

```bash
# 确保 MySQL 已启动并且数据库已创建
mysql -u root -p trainer_core < infrastructure/persistence/mysql/schema.sql
```

### 2. 验证表创建

```bash
node scripts/verify-training-tables.js
```

### 3. 测试训练记录入库

```bash
node scripts/test-training-record.js
```

## 查询示例

### 查询完整训练过程

```javascript
const { TrainingRecordService } = require('./services/training-record-service');

const service = TrainingRecordService.getInstance();
const fullTraining = await service.getFullTraining('your-session-id');

console.log('会话信息:', fullTraining.session);
console.log('所有消息:', fullTraining.messages);
console.log('所有轮次结果:', fullTraining.roundResults);
```

### SQL 查询示例

```sql
-- 查询某个会话的完整训练过程
SELECT * FROM training_sessions WHERE session_id = 'xxx';

-- 查询某个会话的所有消息（按轮次排序）
SELECT * FROM training_messages 
WHERE session_id = 'xxx' 
ORDER BY round ASC, id ASC;

-- 查询某个会话的所有轮次结果
SELECT * FROM training_round_results 
WHERE session_id = 'xxx' 
ORDER BY round ASC;

-- 查询某个客服的所有训练记录
SELECT * FROM training_sessions WHERE agent_id = 'xxx' ORDER BY started_at DESC;

-- 统计训练数据
SELECT 
  COUNT(*) as total_sessions,
  SUM(CASE WHEN status = 'finished' THEN 1 ELSE 0 END) as finished_sessions,
  AVG(total_rounds) as avg_rounds
FROM training_sessions;
```

## 关键设计决策

### 1. 训练数据与实时监听数据完全隔离
- 使用独立的数据表（training_*）
- 不使用 sessions/messages/evaluations 等通用表
- 避免数据混淆和查询冲突

### 2. structured_feedback 直接复用 feedback-template-service
- 不重新生成或转换
- 保证数据一致性
- 减少维护成本

### 3. 每轮都保存，不只存最终结果
- training_messages 保存每轮的用户和客服消息
- training_round_results 保存每轮的分析结果和反馈
- 支持完整的训练过程回放

### 4. 支持按 session_id 还原完整训练过程
- 提供 `getFullTraining(sessionId)` 方法
- 一次性返回 session + messages + roundResults
- 方便 Web 端展示和复盘

## 文件清单

### 新增文件（11个）

**数据表定义**：
- `infrastructure/persistence/mysql/schema.sql`（已更新，新增3张表）

**Repository 接口**（3个）：
- `repositories/training-session-repository.js`
- `repositories/training-message-repository.js`
- `repositories/training-round-result-repository.js`

**Repository MySQL实现**（3个）：
- `infrastructure/persistence/mysql/mysql-training-session-repository.js`
- `infrastructure/persistence/mysql/mysql-training-message-repository.js`
- `infrastructure/persistence/mysql/mysql-training-round-result-repository.js`

**Service**（1个）：
- `services/training-record-service.js`

**测试脚本**（2个）：
- `scripts/verify-training-tables.js`
- `scripts/test-training-record.js`

### 修改文件（1个）

- `services/training-orchestrator.js` - 接入训练记录入库逻辑

## 验收标准

✅ 训练数据可完整入库
- training_sessions 记录训练会话
- training_messages 记录每轮消息
- training_round_results 记录每轮分析和反馈

✅ 每轮消息、分析、反馈都可追溯
- 按 session_id + round 可查询任意轮次数据
- analysis_raw 保存完整的分析引擎输出
- structured_feedback 保存结构化的反馈数据

✅ 后续 Web 查询和统计可直接承接
- 提供完整的查询接口
- 支持按 session/agent/scenario 等多维度查询
- 支持统计分析和报表生成

## 后续扩展建议

1. **增加索引优化**：根据实际查询模式增加复合索引
2. **数据归档**：定期归档已完成的训练记录
3. **统计分析**：基于训练数据生成客服能力画像
4. **对比分析**：对比同一客服多次训练的表现变化
5. **场景效果分析**：统计不同场景的训练难度和通过率
