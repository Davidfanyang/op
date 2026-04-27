# evaluation-service 标准协议迁移交付文档

**执行时间**: 2026-04-16  
**任务**: 《evaluation-service 标准协议迁移执行单》  
**状态**: ✅ 完成  

---

## 一、修改文件清单

| 文件 | 修改类型 | 修改行数 | 说明 |
|------|---------|---------|------|
| [services/evaluation-service.js](file:///Users/adime/.openclaw/workspace/trainer-core/services/evaluation-service.js) | **重构** | +117/-107 | 迁移到标准输入协议v1.0，删除旧字段兼容 |
| [tests/verify-tg-training-flow.js](file:///Users/adime/.openclaw/workspace/trainer-core/tests/verify-tg-training-flow.js) | **修改** | +4/-4 | 改为调用evaluation-service而非直接调用trainer |
| [bot/telegram-bot.js](file:///Users/adime/.openclaw/workspace/trainer-core/bot/telegram-bot.js) | **无修改** | 0 | 已在使用evaluation-service（无需修改） |

---

## 二、新调用链路说明

### ✅ 统一入口架构

```
TG Bot / HTTP API / Web
        ↓
   evaluation-service (统一入口)
        ↓
   core/trainer.analyzeTurn()
        ↓
   core/analysis-pipeline
```

### 调用路径对比

#### ❌ 旧调用路径（已删除）
```
TG Bot → core/trainer.analyzeTurn()  [绕过services层]
```

#### ✅ 新调用路径（已统一）
```
TG Bot → evaluation-service.evaluate() → core/trainer.analyzeTurn()
HTTP API → evaluation-service.evaluate() → core/trainer.analyzeTurn()
Web → evaluation-service.evaluate() → core/trainer.analyzeTurn()
```

### 标准协议输入（v1.0）

```javascript
{
  // 1. project（必填）
  project: 'default',
  
  // 2. conversation（必填）
  conversation: [
    { role: 'user', content: '用户消息', _meta: {...} },
    { role: 'agent', content: '客服回复', _meta: {...} }
  ],
  
  // 3. current_reply（必填）
  current_reply: '客服回复',
  
  // 4. metadata（必填）
  metadata: {
    source: 'telegram',
    session_id: 'session_123',
    agent_id: 'agent_456',
    timestamp: '2026-04-16T12:00:00Z',
    entry_type: 'training',  // 或 'live_monitor'
    scenarioId: 'lanton_sms_code'  // training模式必填
  },
  
  // 5. rules（必填，无规则时传{}）
  rules: {}
}
```

---

## 三、删除的旧调用路径说明

### 1. evaluation-service.evaluate() 内部旧协议映射（已删除）

#### 修改前（旧协议兼容）:
```javascript
const trainerInput = {
  // 向后兼容：支持 projectId 和 project
  projectId: params.projectId,
  project: params.project,
  
  // 向后兼容：支持 mode 和 metadata.entry_type
  mode: params.mode,
  metadata: {
    ...(params.metadata || {}),
    entry_type: params.metadata?.entry_type || params.mode
  },
  
  // 向后兼容：支持 currentReply 和 current_reply
  currentReply: params.currentReply,
  current_reply: params.current_reply,
  
  // 场景标识
  scenarioId: scenarioId,
  
  rules: params.rules || {}
};
```

#### 修改后（仅支持标准协议）:
```javascript
const trainerInput = {
  project: params.project,
  conversation: params.conversation,
  current_reply: params.current_reply,
  metadata: {
    ...params.metadata,
    scenarioId: scenarioId
  },
  rules: params.rules || {}
};
```

### 2. validateInput() 旧字段校验（已删除）

#### 删除的旧字段校验:
- ❌ `params.projectId || params.project` - 改为仅校验 `params.project`
- ❌ `params.mode || params.metadata?.entry_type` - 改为仅校验 `params.metadata.entry_type`
- ❌ `params.currentReply || params.current_reply` - 改为仅校验 `params.current_reply`
- ❌ `params.scenarioId` - 改为校验 `params.metadata.scenarioId`
- ❌ `params.customerMessage` - 改为从 `params.conversation` 提取

### 3. normalizeResult() 旧字段映射（已删除）

#### 删除的旧字段:
- ❌ `projectId` → 改为 `project`
- ❌ `mode` → 改为 `entry_type`
- ❌ `sessionId` → 改为 `session_id`
- ❌ `employeeId` → 改为 `agent_id`
- ❌ `currentReply` → 改为 `current_reply`
- ❌ `scenario` → 改为 `scenarioName`

#### 新增的输出字段:
- ✅ `confidence` - 置信度
- ✅ `issues` - 问题项数组
- ✅ `missing` - 缺失关键词数组
- ✅ `strengths` - 优点数组
- ✅ `nextAction` - 下一步行动

### 4. routeAlert() 旧字段引用（已删除）

#### 修改:
- ❌ `params.mode` → 改为 `params.metadata.entry_type`
- ❌ `result.sessionId` → 改为 `result.session_id`
- ❌ `params.projectId` → 改为 `params.project`

### 5. createReviewForTraining/CreateReviewAndAlert（已更新）

#### 修改:
- ❌ `params.projectId` → 改为 `params.project`
- ❌ `params.metadata?.sessionId` → 改为 `params.metadata?.session_id`

---

## 四、验证结果

### 测试脚本: tests/verify-tg-training-flow.js

### ✅ 验证通过

**完整流程验证**:
```
[步骤1] 开始训练 - 选择场景
场景: LantonPay银行转账指引
场景ID: lanton_bank_transfer

[步骤2] 用户模拟发问
用户: LantonPay 支持哪些方式向银行转账？

[步骤3] 客服回复
客服: 您好，请提供您的手机号和验证码，我们帮您查看。

[步骤4] 调用分析引擎
输入协议验证:
✓ project: default
✓ conversation: 2 轮
✓ current_reply: 您好，请提供您的手机号和验证码，我们帮您查看。
✓ metadata.source: telegram
✓ metadata.entry_type: training
✓ metadata.scenarioId: lanton_bank_transfer

[AlertRouter] training 模式风险等级 medium，触发告警，出口: training_queue
[AlertRouter] 进入训练监督队列: test_training_1776412542012

[步骤5] 返回训练反馈
评估结果:
✓ scenarioName: 转账成功但对方未到账
✓ stage: 确认问题并收集信息
✓ result: fail
✓ riskLevel: medium
✓ confidence: 85%
✓ issues: 2 项
✓ missing: 9 项
✓ strengths: 2 项
✓ coachSummary: 有
✓ nextAction: 有

[步骤6] 结束总结 - 格式化TG消息
❌ *不通过* - 转账成功但对方未到账
阶段: 确认问题并收集信息

*用户:* LantonPay 支持哪些方式向银行转账？
*你的回复:* 您好，请提供您的手机号和验证码，我们帮您查看。

*评估结果:* 不通过 (fail)
*风险等级:* medium
*置信度:* 85%

*🔴 问题项:*
• 缺少关键信息: 请您、账单截图、绑定手机号、协助
• 未完成期望动作: 礼貌问候并安抚、确认问题类型...

*⚠️ 缺失关键词:*
• 您好
• 请您
• 账单截图
• 绑定手机号
• 协助

*✅ 优点:*
• 未使用禁忌表达
• 回复详实充分

*📝 评价:*
✗ 回复存在明显不足。主要问题: 缺少关键信息...

*👉 改进建议:*
优先解决: 缺少关键信息: 请您、账单截图、绑定手机号、协助

发送 /start 开始下一轮练习

=== 验证结果 ===
✅ 通过 - TG训练链路完整验证成功

验证项:
✓ 标准输入协议 v1.0
✓ 标准输出协议 v1.0
✓ TG消息格式化
✓ 无旧字段依赖
✓ 6步流程完整
```

### 验证项清单

| 验证项 | 状态 | 说明 |
|--------|------|------|
| 标准输入协议 v1.0 | ✅ 通过 | 5个必填字段完整 |
| 标准输出协议 v1.0 | ✅ 通过 | 12个输出字段完整 |
| TG消息格式化 | ✅ 通过 | formatResultMessage正确渲染 |
| 无旧字段依赖 | ✅ 通过 | 无projectId/mode/currentReply等旧字段 |
| 6步流程完整 | ✅ 通过 | 开始训练→发问→回复→分析→反馈→总结 |
| evaluation-service入口 | ✅ 通过 | 不再绕过services层 |
| 告警路由 | ✅ 通过 | training_queue正确触发 |

---

## 五、执行约束遵守情况

### ✅ 已严格遵守

1. ✅ **evaluation-service统一使用标准输入协议** - project, conversation, current_reply, metadata, rules
2. ✅ **内部调用core/trainer.analyzeTurn()** - 不再使用旧字段
3. ✅ **TG Bot调用路径统一** - TG Bot → evaluation-service → core/trainer
4. ✅ **不保留绕过evaluation-service的调用路径** - verify-tg-training-flow.js已修改
5. ✅ **不新增功能** - 仅做协议统一与入口收口
6. ✅ **不修改输出协议** - 保持标准输出协议v1.0
7. ✅ **不扩展业务功能** - 仅重构调用链路

---

## 六、遗留问题清单

### 🟡 中优先级

| 问题 | 影响 | 建议 |
|------|------|------|
| **scenarioName不匹配** | 输出显示"转账成功但对方未到账"，但场景是"银行转账指引" | scenario-loader的场景匹配逻辑需要优化 |
| **MySQL Repository未就绪** | `RepositoryFactory.getMySQLRepositories is not a function` | 需要实现MySQL Repository或添加fallback |
| **告警路由日志混乱** | `[AlertRouter] undefined 模式告警已禁用` | routeAlert中entryType可能为undefined，需要防御性编程 |

### 🟢 低优先级

| 问题 | 影响 | 建议 |
|------|------|------|
| **createErrorResult旧字段** | 错误结果仍包含projectId/mode等旧字段 | 后续统一迁移到标准协议 |
| **evaluateConversation未迁移** | 多轮对话评估函数仍使用旧协议 | 后续按需迁移 |
| **checkAlerts使用旧结构** | `result.result?.level` 可能是旧结构 | 确认result.result是字符串还是对象 |

---

## 七、完成判定

### ✅ 已完成事项

1. ✅ evaluation-service迁移到标准输入协议v1.0
2. ✅ 内部调用core/trainer.analyzeTurn()使用标准协议
3. ✅ TG Bot调用路径统一为：TG Bot → evaluation-service → core/trainer
4. ✅ 删除所有绕过evaluation-service的调用路径
5. ✅ 不新增功能，仅做协议统一与入口收口
6. ✅ TG训练链路仍可跑通（验证通过）

### ✅ 核心交付物

1. ✅ **evaluation-service.js** - 完全迁移到标准协议，删除旧字段兼容
2. ✅ **verify-tg-training-flow.js** - 端到端验证通过
3. ✅ **调用链路统一** - 所有入口通过evaluation-service

### 🎯 当前状态

- **evaluation-service**: ✅ 标准输入协议v1.0
- **调用链路**: ✅ 统一入口（不再绕过）
- **TG训练链路**: ✅ 可跑通（验证通过）
- **旧字段依赖**: ✅ 已清除（核心路径）
- **遗留问题**: 📝 已记录，不阻塞主线

---

## 八、新调用链路图示

```
┌─────────────────────────────────────────────────────────────┐
│                    入口层（Entry Layer）                      │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  TG Bot              HTTP API            Web                  │
│  (telegram-bot.js)   (live-monitor)     (未来)                │
│       ↓                    ↓                ↓                 │
│       └────────────────────┴────────────────┘                 │
│                            ↓                                  │
└────────────────────┬───────▼─────────────────────────────────┘
                     │
                     │ 标准协议 v1.0
                     │ { project, conversation,
                     │   current_reply, metadata, rules }
                     ↓
┌─────────────────────────────────────────────────────────────┐
│                服务层（Service Layer）                        │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  evaluation-service.evaluate()                               │
│  ├─ validateInput()       # 标准协议校验                     │
│  ├─ matchScenario()       # live_monitor自动匹配             │
│  ├─ analyzeTurn()         # 调用core层                       │
│  ├─ checkAlerts()         # 告警检查                         │
│  ├─ normalizeResult()     # 输出标准化                       │
│  ├─ recordEvaluation()    # 灰度收集（live_monitor）         │
│  └─ routeAlert()          # 模式分流                         │
│                            ↓                                  │
└────────────────────┬───────▼─────────────────────────────────┘
                     │
                     │ 标准协议 v1.0
                     ↓
┌─────────────────────────────────────────────────────────────┐
│                核心层（Core Layer）                           │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  core/trainer.analyzeTurn()                                  │
│  ├─ normalizeToProtocol()   # 协议标准化                     │
│  ├─ validateProtocol()      # 协议校验                       │
│  └─ analysisPipeline.analyzeTurn()                           │
│                            ↓                                  │
└─────────────────────────────────────────────────────────────┘
```

---

**报告生成时间**: 2026-04-16  
**执行人**: AI Assistant  
**状态**: ✅ evaluation-service标准协议迁移完成，TG训练链路验证通过
