# 训练记录入库功能 - 快速上手指南

## 🚀 5分钟快速验证

### 第一步：创建数据库表

```bash
# 确保 MySQL 已启动并创建了 trainer_core 数据库
mysql -u root -p trainer_core < infrastructure/persistence/mysql/schema.sql
```

### 第二步：验证表创建

```bash
node scripts/verify-training-tables.js
```

**预期输出：**
```
============================================================
验证训练记录数据表
============================================================

✓ MySQL连接成功

[检查 1] training_sessions 表
✓ training_sessions 表已存在
  表字段:
    - id (bigint unsigned) NOT NULL
    - session_id (varchar(64)) NOT NULL
    - project (varchar(64)) NOT NULL
    ...（省略其他字段）

[检查 2] training_messages 表
✓ training_messages 表已存在

[检查 3] training_round_results 表
✓ training_round_results 表已存在

============================================================
验证完成
============================================================
```

### 第三步：测试训练记录入库

```bash
node scripts/test-training-record.js
```

**预期输出：**
```
============================================================
开始测试训练记录入库功能
============================================================

[测试 1] 创建训练会话记录
✓ 训练会话创建成功: { sessionId: 'train_xxx', ... }

[测试 2] 保存训练消息 - Round 0 用户
✓ 用户消息保存成功: { id: 1, round: 0, role: 'user' }

[测试 3] 保存训练消息 - Round 0 客服
✓ 客服消息保存成功: { id: 2, round: 0, role: 'agent' }

[测试 4] 保存训练轮次结果 - Round 0
✓ 轮次结果保存成功: { id: 1, round: 0, isFinished: false }

[测试 5] 保存 Round 1 的消息和结果
✓ Round 1 数据保存成功

[测试 6] 完成训练会话
✓ 训练会话已完成: { sessionId: 'train_xxx', status: 'finished', totalRounds: 2 }

[测试 7] 查询完整训练过程
✓ 完整训练数据查询成功:
  - 会话信息: { ... }
  - 消息数量: 4
  - 轮次结果数量: 2

...（省略其他测试）

============================================================
✅ 所有测试通过！训练记录入库功能正常
============================================================
```

### 第四步：查看查询示例

```bash
node scripts/query-training-examples.js
```

**预期输出：**
```
============================================================
训练记录查询示例
============================================================

[示例 1] 查询最近 10 个已完成的训练会话
找到 1 个会话，显示前 1 个:
  - train_xxx | 测试场景 - 产品咨询 | 2轮 | 2026-04-17T10:30:00.000Z

[示例 2] 查询特定客服的所有训练记录
该客服共有 1 次训练记录

[示例 3] 查询特定场景的训练统计
场景: 测试场景 - 产品咨询
训练次数: 1
平均轮次: 2.0

...（省略其他示例）

============================================================
查询示例完成
============================================================
```

## 🔍 手动验证（可选）

### 查看数据库中的训练记录

```sql
-- 查看所有训练会话
SELECT session_id, scenario_title, status, total_rounds, started_at 
FROM training_sessions 
ORDER BY started_at DESC 
LIMIT 10;

-- 查看某个会话的完整消息
SELECT m.round, m.role, m.content, m.source
FROM training_messages m
WHERE m.session_id = 'train_xxx'  -- 替换为实际的 sessionId
ORDER BY m.round ASC, m.id ASC;

-- 查看某个会话的分析结果
SELECT r.round, r.feedback_text, 
       JSON_EXTRACT(r.structured_feedback, '$.strengths') as strengths,
       JSON_EXTRACT(r.structured_feedback, '$.problems') as problems
FROM training_round_results r
WHERE r.session_id = 'train_xxx'  -- 替换为实际的 sessionId
ORDER BY r.round ASC;
```

## 📝 在实际训练中使用

训练记录功能已经集成到 `training-orchestrator.js` 中，**无需额外配置**。

当你通过 TG Bot 开始训练时，数据会自动入库：

```
用户发送: /train scenario_001
  ↓
TrainingOrchestrator.startTraining()
  ↓
自动创建 training_sessions 记录 ✅
  ↓
生成用户消息
  ↓
自动保存到 training_messages ✅
  ↓
客服回复
  ↓
自动保存到 training_messages ✅
  ↓
分析 + 反馈
  ↓
自动保存到 training_round_results ✅
  ↓
训练结束
  ↓
自动更新 training_sessions 状态 ✅
```

## 🛠️ 常见问题

### Q1: MySQL 连接失败

**错误信息：**
```
[MySQLPool] Connection failed: connect ECONNREFUSED 127.0.0.1:3306
```

**解决方案：**
1. 检查 MySQL 是否启动：`mysql.server status`
2. 启动 MySQL：`mysql.server start`
3. 检查 .env 中的 MySQL 配置（如果有自定义配置）

### Q2: 数据库不存在

**错误信息：**
```
[MySQLPool] Connection failed: Unknown database 'trainer_core'
```

**解决方案：**
```bash
# 创建数据库
mysql -u root -p -e "CREATE DATABASE trainer_core CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# 然后执行 schema.sql
mysql -u root -p trainer_core < infrastructure/persistence/mysql/schema.sql
```

### Q3: 表已存在

**错误信息：**
```
Table 'training_sessions' already exists
```

**解决方案：**
这是因为 schema.sql 使用了 `CREATE TABLE IF NOT EXISTS`，所以这个错误不会影响功能。
如果想重新创建表，可以先删除：

```sql
DROP TABLE IF EXISTS training_round_results;
DROP TABLE IF EXISTS training_messages;
DROP TABLE IF EXISTS training_sessions;
```

然后重新执行 schema.sql。

### Q4: 测试脚本报错

**错误信息：**
```
Cannot find module 'mysql2'
```

**解决方案：**
```bash
# 安装依赖
npm install mysql2

# 或者安装所有依赖
npm install
```

## 📚 相关文档

- [完整实现说明](TRAINING_RECORD_IMPLEMENTATION.md) - 详细的设计文档和API说明
- [完成总结](TRAINING_RECORD_SUMMARY.md) - 验收清单和统计数据
- [数据库Schema](infrastructure/persistence/mysql/schema.sql) - 表结构定义

## 🎯 下一步

1. **查看完整训练过程**
   ```bash
   # 设置测试 sessionId
   export TEST_SESSION_ID="train_xxx"  # 替换为实际的 sessionId
   
   # 运行查询示例
   node scripts/query-training-examples.js
   ```

2. **开发 Web 查询接口**
   - 基于 `TrainingRecordService` 开发 REST API
   - 实现训练列表、详情、统计等接口

3. **集成到现有系统**
   - 训练记录功能已自动集成
   - 无需额外修改代码

## 💡 提示

- 所有训练数据都是**自动入库**的，无需手动调用
- 使用 `getFullTraining(sessionId)` 可以查询完整训练过程
- structured_feedback 直接复用 feedback-template-service 的输出
- 训练数据与实时监听数据完全隔离（使用独立的 training_* 表）

---

**恭喜！你已经完成了训练记录入库功能的验证！** 🎉
