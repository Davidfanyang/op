# 小范围试运行建议

> 目标:在最小范围内验证 training / live_monitor / supervisor 三条主链的完整闭环,确认流程顺畅后再扩大范围。

---

## 一、试运行范围

### 1.1 限定条件

| 维度 | 范围 | 说明 |
|------|------|------|
| **项目** | 1 个项目 | `default` 项目 |
| **训练场景** | 1 个场景 | `greeting_test` (问候语场景) |
| **实时监听入口** | 1 个入口 | Telegram Bot (live_monitor API) |
| **参与人员** | 2-3 名客服 + 1 名主管 | 小团队测试 |
| **测试周期** | 1-2 周 | 足够收集数据,又不会太长 |

### 1.2 为什么选这个范围?

✅ **最小可用**: 一个场景就能验证完整流程  
✅ **快速反馈**: 小团队沟通成本低,问题能快速定位  
✅ **风险可控**: 即使出问题影响面也很小  
✅ **可扩展**: 验证通过后,逐步增加场景和项目  

---

## 二、试运行环境准备

### 2.1 环境检查清单

- [ ] MySQL 数据库运行正常 (`pai_dashboard`)
- [ ] Schema 已执行 (`schema.sql`)
- [ ] Live Monitor API 服务运行 (`localhost:3001`)
- [ ] Telegram Bot 已配置 (token + chat_id)
- [ ] 测试数据已准备 (至少 5 条 training + 5 条 live_monitor)

### 2.2 关键配置

```bash
# .env 文件检查
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_NAME=pai_dashboard

TELEGRAM_BOT_TOKEN=<your_bot_token>
TELEGRAM_ALERT_CHAT_ID=<alert_chat_id>

LIVE_MONITOR_PORT=3001
```

### 2.3 数据准备脚本

```bash
# 创建 training 测试数据
node scripts/create-training-test-data.js

# 运行 live_monitor 闭环测试
node scripts/test-live-monitor-closed-loop.js
```

---

## 三、试运行流程

### 3.1 Training 模式测试 (第 1-3 天)

#### Day 1: 基础流程验证

**目标**: 验证 training 评估 → pending → 主管处理 完整流程

**步骤**:
1. 客服通过 Telegram Bot 发送 `/score` 开始训练
2. 客服回复问候语场景 (如 "有什么问题?")
3. 系统评估并生成 training review
4. 主管查询 pending: `node scripts/training-queue-processor.js list`
5. 主管查看详情: `node scripts/training-queue-processor.js detail <id>`
6. 主管执行处理: `node scripts/training-queue-processor.js process <id> needs_training supervisor "话术不规范"`

**验证点**:
- [ ] 评估正常执行
- [ ] Review 正确生成
- [ ] Pending 列表可查询
- [ ] 详情字段完整 (score/findings/suggestions/coach_summary)
- [ ] 处理动作成功执行
- [ ] review_actions 正确落库

#### Day 2: 不同场景测试

**目标**: 测试不同类型的低分情况

**测试用例**:
| 测试用例 | 预期分数 | 预期决定 | 说明 |
|---------|---------|---------|------|
| 礼貌缺失 | 40-50 | needs_training | 话术问题 |
| 流程错误 | 30-40 | needs_review | 流程问题 |
| 态度敷衍 | <30 | needs_training | 严重问题 |
| 标准回复 | >70 | passed | 误判/正常 |

#### Day 3: 主管判读训练

**目标**: 让主管熟悉判读规则和工具

**活动**:
1. 阅读 [主管判读规则指南](./supervisor-decision-guide.md)
2. 实际处理 5-10 条 training review
3. 记录判读过程中的疑问
4. 调整判读规则 (如有需要)

---

### 3.2 Live Monitor 模式测试 (第 4-7 天)

#### Day 4: 实时评估验证

**目标**: 验证 live_monitor 评估 → 告警 → review 生成

**步骤**:
1. 发送 POST 请求到 `/evaluate`:
```bash
curl -X POST http://localhost:3001/evaluate \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "default",
    "mode": "live_monitor",
    "customerMessage": "我转账成功但对方没收到",
    "userReply": "不知道",
    "metadata": {
      "channel": "telegram",
      "sessionId": "test_session_001",
      "messageId": "test_msg_001",
      "employeeId": "employee_001",
      "customerId": "customer_001"
    }
  }'
```

2. 确认返回结果包含告警
3. 检查数据库 review 是否生成
4. 查询 pending review

**验证点**:
- [ ] 评估返回正确 (score/alertLevel/status)
- [ ] 告警触发正常 (critical/warning)
- [ ] Review 记录写入数据库
- [ ] review_status = 'pending'

#### Day 5-6: 真实对话测试

**目标**: 使用真实客服对话数据测试

**数据来源**:
- 从历史对话中抽取 5-10 条真实案例
- 包含不同场景和质量水平

**测试流程**:
1. 批量发送真实对话到 `/evaluate`
2. 记录评估结果和告警
3. 主管逐条复核
4. 记录误报和漏报

#### Day 7: Supervisor 复核闭环

**目标**: 验证完整的主管复核流程

**测试用例**:
| 场景 | 告警级别 | 预期决定 | 说明 |
|------|---------|---------|------|
| 客服回复"不知道" | critical | approved | 态度问题 |
| 话术不规范 | warning | approved | 需改进 |
| 特殊情况 | warning | rejected | 情有可原 |
| AI 误判 | observation | rejected | 模型问题 |

**验证点**:
- [ ] 主管能正确判断告警有效性
- [ ] 复核决定正确记录
- [ ] review_actions 完整记录操作链
- [ ] 统计数据准确

---

### 3.3 综合验证 (第 8-10 天)

#### Day 8-9: 混合模式测试

**目标**: training 和 live_monitor 同时运行,验证模式分流

**测试**:
1. 同时发送 training 和 live_monitor 评估请求
2. 确认 review 的 mode 字段正确
3. 分别查询 training 和 live_monitor 的 pending
4. 确认统计分开计算

**验证 SQL**:
```sql
-- 查看 mode 分布
SELECT mode, COUNT(*) as count, review_status
FROM reviews
GROUP BY mode, review_status;

-- 查看 training 统计
SELECT review_decision, COUNT(*) as count
FROM reviews
WHERE mode = 'training'
GROUP BY review_decision;

-- 查看 live_monitor 统计
SELECT review_decision, COUNT(*) as count
FROM reviews
WHERE mode = 'live_monitor'
GROUP BY review_decision;
```

#### Day 10: 数据回顾和问题修复

**目标**: 回顾试运行数据,修复发现的问题

**活动**:
1. 导出所有 review 数据
2. 分析以下指标:
   - 评估总量
   - 告警率 (告警数/评估数)
   - 误报率 (rejected 数/告警数)
   - 平均处理时效
3. 识别高频问题
4. 修复代码/配置/规则问题

---

## 四、成功标准

### 4.1 技术指标

| 指标 | 目标值 | 说明 |
|------|-------|------|
| **评估成功率** | >95% | 评估服务正常返回结果 |
| **Review 生成率** | 100% | 有告警就生成 review |
| **数据落库率** | 100% | review + action 都正确写入 |
| **查询响应时间** | <500ms | pending/detail 查询快速 |
| **系统可用性** | >99% | 服务稳定运行 |

### 4.2 业务指标

| 指标 | 目标值 | 说明 |
|------|-------|------|
| **主管处理率** | >90% | pending 的 review 被及时处理 |
| **平均处理时效** | <24 小时 | 从生成到处理的时间 |
| **误报率** | <20% | rejected / 总告警数 |
| **主管满意度** | >7/10 | 主管对工具的满意度评分 |

### 4.3 流程指标

| 流程 | 是否跑通 | 说明 |
|------|---------|------|
| training 评估 → pending → 处理 | ✅ | 完整流程 |
| live_monitor 评估 → 告警 → review → 复核 | ✅ | 完整流程 |
| review_actions 记录 | ✅ | 操作链完整 |
| 统计数据准确性 | ✅ | stats 查询正确 |

---

## 五、风险管控

### 5.1 技术风险

| 风险 | 概率 | 影响 | 应对措施 |
|------|------|------|---------|
| MySQL 连接失败 | 低 | 高 | 监控连接池,自动重连 |
| API 服务崩溃 | 中 | 高 | 进程守护,自动重启 |
| 评估结果异常 | 中 | 中 | 记录日志,人工复核 |
| 数据不一致 | 低 | 高 | 事务保护,定期校验 |

### 5.2 业务风险

| 风险 | 概率 | 影响 | 应对措施 |
|------|------|------|---------|
| 误报率过高 | 中 | 中 | 调整阈值,优化规则 |
| 主管不熟悉工具 | 中 | 中 | 培训 + 文档支持 |
| 客服抵触情绪 | 低 | 中 | 强调培训目的,非考核工具 |
| 流程卡顿 | 低 | 高 | 及时响应,快速修复 |

### 5.3 应急预案

**场景 1: 评估服务不可用**
- 临时方案: 记录原始消息,服务恢复后补评估
- 通知: 立即通知技术团队

**场景 2: 误报率突然飙升**
- 临时方案: 暂停告警推送,只记录不通知
- 动作: 分析误报原因,调整阈值

**场景 3: 数据库异常**
- 临时方案: 切换到 file 模式 (如已实现)
- 动作: 修复数据库,数据同步

---

## 六、试运行检查清单

### 6.1 启动前

- [ ] 环境配置完成
- [ ] 数据库 schema 执行
- [ ] 测试数据准备
- [ ] 主管培训完成
- [ ] 判读规则文档阅读
- [ ] 应急方案确认

### 6.2 每日检查

- [ ] 服务运行正常 (health check)
- [ ] 数据库连接正常
- [ ] 评估结果正常返回
- [ ] Review 生成正常
- [ ] Pending 数量合理
- [ ] 无异常日志

### 6.3 结束后

- [ ] 数据导出备份
- [ ] 指标统计完成
- [ ] 问题清单整理
- [ ] 改进建议汇总
- [ ] 试运行报告撰写
- [ ] 下一阶段计划制定

---

## 七、试运行后下一步

### 7.1 如果成功 (达到成功标准)

**扩大范围**:
1. 增加训练场景 (3-5 个)
2. 增加参与客服 (5-10 人)
3. 增加 live_monitor 入口 (如 web chat)
4. 接入 conversations.sql 做运营分析

**功能增强**:
1. 评估结果自动持久化到 MySQL
2. Telegram Bot 集成 training 命令
3. 主管 dashboard (可选)
4. 自动报告生成

### 7.2 如果未成功 (未达标准)

**问题定位**:
1. 技术指标未达标 → 优化代码/架构
2. 业务指标未达标 → 调整规则/阈值
3. 流程指标未达标 → 优化流程/工具

**迭代改进**:
1. 修复关键问题
2. 重新测试验证
3. 再次试运行

---

## 八、联系和支持

### 8.1 技术支持

- **代码问题**: 查看项目文档和日志
- **数据库问题**: 检查 MySQL 连接和 schema
- **API 问题**: 测试 `/health` 和 `/evaluate` 端点

### 8.2 业务支持

- **判读规则**: 参考 [主管判读规则指南](./supervisor-decision-guide.md)
- **操作工具**: 使用 `scripts/training-queue-processor.js`
- **数据分析**: 运行 SQL 查询或统计脚本

### 8.3 常用命令

```bash
# 查看 training pending
node scripts/training-queue-processor.js list

# 查看详情
node scripts/training-queue-processor.js detail <review_id>

# 执行处理
node scripts/training-queue-processor.js process <review_id> <decision> <reviewer> [comment]

# 查看统计
node scripts/training-queue-processor.js stats

# 运行 live_monitor 闭环测试
node scripts/test-live-monitor-closed-loop.js

# 检查服务健康
curl http://localhost:3001/health
```

---

**文档版本**: v1.0  
**最后更新**: 2026-04-11  
**适用范围**: 小范围试运行 (1 项目 / 1 场景 / 1 入口)
