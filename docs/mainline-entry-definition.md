# 主线入口定义（Mainline Entry Definition）

> **版本**：v1.0  
> **创建时间**：2026-04-24  
> **状态**：已收口  
> **目的**：明确唯一试运行入口，禁止模糊和多头入口

---

## 一、最终结论（定死）

**客服试运行唯一入口**：Telegram Bot `/train` 命令（training 模式）

**主管审核入口**：Telegram Bot `/review` 命令 + Web 后台审核页面（待验收）

**FAQ 沉淀来源**：`reviews` 表（主管打标确认） → `knowledge_base` 表（知识沉淀）

**Shadow 链路定位**：仅观察，不对外，不输出给用户

**Training 链路定位**：客服训练 + 知识注入试运行唯一入口

**Internal Trial 定位**：预留入口，当前不使用

**禁止给客服直接使用的入口**：
- ❌ Shadow Mode（`qwen3-shadow-runner`）
- ❌ Internal Trial（`internal_trial`）
- ❌ Live Monitor（`live-monitor-api`）
- ❌ 任何 API 直接调用

---

## 二、当前唯一试运行入口

### 2.1 客服试用入口

**入口名称**：Telegram Bot Training 模式

**入口路径**：
```
客服 → Telegram Bot → /train <scenarioId> → 训练对话 → 知识增强建议答案
```

**代码入口**：
- `bot/telegram-bot.js` → `handleTrainCommand()` → `handleTrainingReply()`
- `services/training-orchestrator.js` → `processAgentReply()`
- `services/knowledge-injection-trial.js` → `runKnowledgeInjectionTrial()`

**触发条件**：
1. 环境变量 `KNOWLEDGE_INJECTION_ENABLED=true`
2. 入口在白名单中：`KNOWLEDGE_INJECTION_ENTRY_WHITELIST=training`
3. 场景在白名单中：`KNOWLEDGE_INJECTION_SCENARIO_WHITELIST=lanton_transfer_success_not_received`

**输出形式**：
- Telegram Bot 消息中包含 `💡 知识增强建议答案（内部试运行）`
- 仅作为参考，不代替客服判断

### 2.2 主管审核入口

**入口名称**：Telegram Bot Review 命令 + Web 后台

**入口路径 1（Telegram）**：
```
主管 → Telegram Bot → /review confirmed/false_positive/dismissed → 更新审核状态
```

**入口路径 2（Web）**：
```
主管 → Web 后台 → /reviews → 查看审核列表 → 审核操作
```

**代码入口**：
- `bot/telegram-bot.js` → `handleReviewCommand()`
- `web/reviews.js` → Web 审核页面（待验收）
- `services/review-service.js` → 审核逻辑

**审核结果流向**：
- 确认（confirmed）→ 可沉淀为 FAQ
- 误报（false_positive）→ 不沉淀，标记原因
- 忽略（dismissed）→ 不沉淀

### 2.3 FAQ 沉淀来源

**数据来源**：
1. `reviews` 表（主管打标确认的审核记录）
2. `training_sessions` 表（训练会话记录）
3. `evaluations` 表（质检评估记录）

**沉淀流程**：
```
真实对话 → Qwen3 分析 → 主管打标（reviews）→ FAQ 沉淀（knowledge_base）
```

**代码入口**：
- `services/knowledge-retrieval-service.js` → 知识检索
- `repositories/knowledge-repository.js` → 知识入库
- 手动沉淀脚本（待完善）

**当前状态**：
- ✅ 知识可检索和注入
- ⚠️ 自动沉淀流程待完善（当前主要靠手动）

---

## 三、Shadow 链路定位

### 3.1 Shadow Mode 是什么

**定义**：Qwen3 影子运行模式，在后台旁路执行评估，不影响主流程

**目的**：
- 观察 Qwen3 与原系统的差异
- 收集对比数据
- 不对外输出，不展示给用户

**代码入口**：
- `services/local-model/qwen3-shadow-runner.js` → `runQwen3Shadow()`
- `services/training-orchestrator.js` → 第 179-195 行（旁路调用）

**执行时机**：
- 在 `processAgentReply()` 中，分析引擎完成后旁路触发
- 使用 `catch()` 吞掉所有异常，绝不影响主流程

**输出形式**：
- ❌ **不输出给用户**
- ❌ **不输出到 Telegram Bot**
- ✅ 仅记录到日志（`runtime/logs/gray-evaluation.log`）

### 3.2 Shadow 与 Training 的区别

| 维度 | Shadow Mode | Training Mode |
|------|-------------|---------------|
| **定位** | 观察、对比 | 客服训练 + 知识注入 |
| **是否对外** | ❌ 否 | ✅ 是 |
| **是否影响主流程** | ❌ 否 | ✅ 是（知识增强建议答案） |
| **输出形式** | 仅日志 | Telegram Bot 消息 |
| **白名单控制** | Shadow 独立白名单 | `KNOWLEDGE_INJECTION_*` 环境变量 |
| **使用人员** | 技术负责人 | 客服 + 主管 |

**最终结论**：
- Shadow Mode 仅供技术团队观察使用，**禁止给客服或主管直接使用**
- Training Mode 是唯一对外试运行入口

---

## 四、Internal Trial 定位

### 4.1 什么是 Internal Trial

**定义**：内部试运行模式（预留入口）

**当前状态**：❌ **未启用**

**代码位置**：
- `services/knowledge-injection-trial.js` → 入口白名单包含 `internal_trial`
- 但没有任何 Bot 命令或 API 接入该入口

### 4.2 为什么不使用

**原因**：
1. Training Mode 已满足试用需求
2. 避免多头入口，增加管理复杂度
3. 当前阶段不需要独立内部试运行入口

**未来可能使用场景**：
- 需要在独立环境测试新知识
- 需要与 Training Mode 隔离
- 需要特殊权限控制

**最终结论**：
- Internal Trial 仅作为代码预留，**当前不使用**
- 所有试运行统一走 Training Mode

---

## 五、禁止给客服使用的入口

### 5.1 明确禁止清单

| 入口 | 原因 | 代码位置 |
|------|------|---------|
| **Shadow Mode** | 仅观察，不对外 | `services/local-model/qwen3-shadow-runner.js` |
| **Internal Trial** | 预留，未启用 | `services/knowledge-injection-trial.js` |
| **Live Monitor API** | 实时质检，非训练 | `api/live-monitor-api.js` |
| **直接 API 调用** | 无权限控制 | `api/*.js` |
| **Qwen3 直接调用** | 无知识注入逻辑 | `services/local-model/qwen3-adapter.js` |

### 5.2 如何防止误用

**技术措施**：
1. 环境变量白名单控制（`KNOWLEDGE_INJECTION_ENTRY_WHITELIST`）
2. 场景白名单控制（`KNOWLEDGE_INJECTION_SCENARIO_WHITELIST`）
3. 日志监控（异常入口调用会记录日志）

**管理措施**：
1. 明确告知客服唯一入口是 `/train`
2. 主管定期检查日志，发现异常入口调用
3. 发现误用立即上报技术负责人

---

## 六、主线流程图

```
┌─────────────────────────────────────────────────────┐
│                  唯一试运行入口                       │
│          Telegram Bot /train <scenarioId>            │
└──────────────────┬──────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────┐
│           Training Orchestrator                      │
│  processAgentReply()                                 │
└──────────────────┬──────────────────────────────────┘
                   │
        ┌──────────┴──────────┐
        ▼                     ▼
┌───────────────┐    ┌──────────────────────┐
│ 分析引擎       │    │ 知识注入内部试运行    │
│ (evaluate)    │    │ (runKnowledgeInj...) │
└───────┬───────┘    └──────────┬───────────┘
        │                       │
        │              ┌────────┴────────┐
        │              ▼                 ▼
        │      命中知识？          未命中/失败
        │      ✅ 是               ❌ 否
        │              │                 │
        │              ▼                 ▼
        │      生成建议答案        安全回退原逻辑
        │              │                 │
        └──────────┬──┘                 │
                   │                    │
                   ▼                    ▼
┌─────────────────────────────────────────────────────┐
│           Telegram Bot 反馈消息                      │
│  训练反馈 + 💡 知识增强建议答案（如果命中）           │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│              旁路：Shadow Mode（仅观察）              │
│  runQwen3Shadow() → 日志，不对外                     │
└─────────────────────────────────────────────────────┘
```

---

## 七、总结

### 7.1 一句话定死

**客服试运行唯一入口**：Telegram Bot `/train` 命令（training 模式）

**主管审核入口**：Telegram Bot `/review` 命令 + Web 后台审核页面

**FAQ 沉淀来源**：`reviews` 表（主管打标） → `knowledge_base` 表

**Shadow 链路**：仅观察，不对外

**Training 链路**：唯一对外试运行入口

**Internal Trial**：预留，当前不使用

### 7.2 禁止事项

- ❌ 禁止给客服开放 Shadow Mode
- ❌ 禁止给客服开放 Internal Trial
- ❌ 禁止给客服开放 Live Monitor API
- ❌ 禁止直接调用 Qwen3 API
- ❌ 禁止绕过白名单控制

### 7.3 文档维护

| 版本 | 日期 | 修改内容 | 修改人 |
|------|------|---------|--------|
| v1.0 | 2026-04-24 | 初始版本，明确唯一试运行入口 | 技术团队 |
