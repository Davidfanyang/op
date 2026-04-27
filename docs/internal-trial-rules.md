# 内部试运行规则说明（Internal Trial Rules）

> **版本**：v1.0  
> **创建时间**：2026-04-24  
> **状态**：小范围启用阶段  
> **维护人**：主管 + 技术负责人

---

## 一、当前内部试运行目标

### 1.1 核心目标

把已打通的知识增强链路从"技术可跑"升级为"内部可控试运行"，在最小范围内验证：

- **知识命中准确性**：检索到的 FAQ 是否真正帮助客服回答
- **建议答案质量**：Qwen3 生成的知识增强建议答案是否专业、可用
- **回退机制可靠性**：未命中知识或失败时，是否安全回退原逻辑
- **日志可观察性**：能否清晰看到知识注入的命中/失败/回退全链路

### 1.2 不包含的目标

- ❌ 不追求全量客服使用
- ❌ 不做复杂 RAG / 向量检索工程
- ❌ 不做完整前端大页面
- ❌ 不做复杂权限系统
- ❌ 不修改评分逻辑
- ❌ 不碰历史正文补齐支线

---

## 二、当前试运行入口

### 2.1 主要入口

**入口名称**：Telegram Bot 训练模式（training）

**入口路径**：
```
客服 → Telegram Bot → /start_training → 选择场景 → 进入训练对话
```

**代码入口**：
- `bot/telegram-bot.js` → `handleTrainingReply()`
- `services/training-orchestrator.js` → `processAgentReply()`
- `services/knowledge-injection-trial.js` → `runKnowledgeInjectionTrial()`

### 2.2 备用入口（预留）

**入口名称**：内部试运行模式（internal_trial）

**说明**：当前代码已预留 `internal_trial` 入口，但尚未接入实际 bot 命令。后续如需独立试运行入口，可基于此扩展。

---

## 三、当前启用范围

### 3.1 入口白名单

**当前配置**：
```
KNOWLEDGE_INJECTION_ENTRY_WHITELIST=training,internal_trial
```

**含义**：
- ✅ `training`：Telegram Bot 训练模式可触发知识注入
- ✅ `internal_trial`：预留入口，暂不使用
- ❌ 其他入口（如 live-monitor、api 等）**不触发**知识注入

### 3.2 场景白名单

**当前配置**：
```
KNOWLEDGE_INJECTION_SCENARIO_WHITELIST=lanton_transfer_success_not_received
```

**含义**：
- ✅ `lanton_transfer_success_not_received`（转账成功但对方未到账）：**唯一启用场景**
- ❌ 其他场景（如 `register_flow`、`lanton_sms_code`）**不触发**知识注入

**选择理由**：
- 已在第八步验证中证明可稳定命中知识
- 场景知识质量已通过第七步验证
- 建议答案专业度高（评分 65 分）

### 3.3 人员范围

**当前允许参与人员**：
- ✅ 主管本人（测试 + 观察）
- ✅ 1~2 名指定内部测试客服（需经过培训）
- ❌ **不允许**全员客服使用
- ❌ **不允许**外部用户接触

---

## 四、当前启用场景

### 4.1 已启用场景详情

**场景 ID**：`lanton_transfer_success_not_received`

**场景标题**：转账成功但对方未到账

**场景描述**：用户发起转账后显示成功但收款方未收到资金的处理流程

**知识覆盖**：
- ✅ 已有 FAQ 沉淀（knowledge_base 中有相关条目）
- ✅ 已验证知识可命中（第八步证据：knowledge_hit_count = 1）
- ✅ 已验证建议答案质量（评分 65 分，建议回复专业）

**用户消息示例**：
```
我这边显示转账成功了，但是对方一直没收到钱，这是怎么回事？
```

**知识增强建议答案示例**：
```
您好，请提供转账时间、金额和交易哈希，我们马上为您核查到账状态。
```

### 4.2 候选场景（后续可扩展）

**场景 ID**：`register_flow`（注册流程指引）

**当前状态**：❌ 未启用（不在白名单）

**原因**：
- 知识库中注册相关 FAQ 质量待验证
- 需主管确认是否值得扩展

---

## 五、当前开关配置

### 5.1 环境变量清单

| 环境变量 | 当前值 | 说明 | 必填 |
|---------|--------|------|------|
| `KNOWLEDGE_INJECTION_ENABLED` | `true` | **总开关**：控制知识注入是否启用 | ✅ |
| `KNOWLEDGE_INJECTION_ENTRY_WHITELIST` | `training,internal_trial` | **入口白名单**：哪些入口可触发知识注入 | ✅ |
| `KNOWLEDGE_INJECTION_SCENARIO_WHITELIST` | `lanton_transfer_success_not_received` | **场景白名单**：哪些场景可触发知识注入 | ✅ |
| `KNOWLEDGE_INJECTION_PROJECT_WHITELIST` | ``（空） | **项目白名单**：空表示不限制 | ❌ |
| `KNOWLEDGE_INJECTION_MAX_ITEMS` | `3` | **最大知识条数**：每次检索最多返回几条知识 | ✅ |

### 5.2 一键关闭方式

**关闭知识注入（保留日志）**：
```bash
# 方法 1：设置总开关为 false
export KNOWLEDGE_INJECTION_ENABLED=false

# 方法 2：修改 .env 文件
KNOWLEDGE_INJECTION_ENABLED=false

# 重启服务
npm restart
```

**效果**：
- ✅ 原链路不变（客服训练正常进行）
- ✅ 日志仍会记录未命中原因（`trial_disabled`）
- ❌ 不会输出知识增强建议答案

**只关闭某个场景**：
```bash
# 从场景白名单中移除该场景
export KNOWLEDGE_INJECTION_SCENARIO_WHITELIST=

# 或只保留其他场景
export KNOWLEDGE_INJECTION_SCENARIO_WHITELIST=other_scenario
```

**只保留日志、不输出建议答案**：
```bash
# 方法：关闭总开关 + 观察日志
export KNOWLEDGE_INJECTION_ENABLED=false
```

---

## 六、当前日志观察方式

### 6.1 日志位置

**主要日志文件**：
- `runtime/logs/bot.log` - Telegram Bot 运行日志（包含知识注入日志）
- `runtime/logs/telegram-bot.log` - Bot 详细日志

**实时查看**：
```bash
# 实时查看日志
tail -f runtime/logs/bot.log | grep KnowledgeInjectionTrial

# 只看知识命中日志
tail -f runtime/logs/bot.log | grep "命中日志"

# 只看回退日志
tail -f runtime/logs/bot.log | grep "回退日志"
```

### 6.2 关键日志格式

**未命中日志**（场景不在白名单）：
```json
[KnowledgeInjectionTrial] 未命中内部试运行: scenario_not_whitelisted, context: {"entrySource":"training","scenario":"register_flow","projectId":"default"}
```

**命中日志**（成功触发知识注入）：
```json
[KnowledgeInjectionTrial] 命中内部试运行: trial_hit
[KnowledgeInjectionTrial] 命中日志: {
  "timestamp":"2026-04-24T11:48:05.890Z",
  "entry_source":"training",
  "scenario":"lanton_transfer_success_not_received",
  "project_id":"default",
  "knowledge_hit_count":1,
  "knowledge_ids":[69],
  "injected":true,
  "fallback":false,
  "duration_ms":10109,
  "success":true,
  "failure_type":null
}
```

**回退日志**（知识注入失败）：
```json
[KnowledgeInjectionTrial] 知识注入失败，回退到原逻辑: qwen_api_timeout
[KnowledgeInjectionTrial] 回退日志: {
  "timestamp":"...",
  "entry_source":"training",
  "scenario":"lanton_transfer_success_not_received",
  "knowledge_hit_count":1,
  "injected":false,
  "fallback":true,
  "fallback_reason":"qwen_api_timeout"
}
```

### 6.3 关键指标解读

| 字段 | 含义 | 正常值 | 异常值 |
|------|------|--------|--------|
| `knowledge_hit_count` | 命中知识条数 | `>= 1` | `0`（应命中但未命中） |
| `injected` | 是否成功注入知识 | `true` | `false` |
| `fallback` | 是否触发回退 | `false` | `true`（频繁回退需关注） |
| `success` | 知识注入是否成功 | `true` | `false` |
| `duration_ms` | 耗时（毫秒） | `< 15000` | `> 30000`（超时需关注） |

---

## 七、当前回退机制

### 7.1 回退触发条件

以下情况会触发安全回退（不影响主流程）：

1. **总开关关闭**：`KNOWLEDGE_INJECTION_ENABLED=false`
2. **入口不在白名单**：`entrySource` 不在 `KNOWLEDGE_INJECTION_ENTRY_WHITELIST` 中
3. **场景不在白名单**：`scenario` 不在 `KNOWLEDGE_INJECTION_SCENARIO_WHITELIST` 中
4. **知识检索失败**：`KnowledgeRetrievalService` 返回空或异常
5. **Qwen3 调用失败**：API 超时、网络错误、返回格式错误
6. **建议答案标记为 risky**：Qwen3 返回 `risky_suggested_reply = true`
7. **任何未捕获异常**：`catch (error)` 块统一回退

### 7.2 回退行为

**回退后行为**：
- ✅ 返回原逻辑结果（`originalLogic()`）
- ✅ 不影响训练主流程
- ✅ 不输出 `knowledgeEnhancedSuggestion` 字段
- ✅ Telegram Bot 正常显示训练反馈（无知识增强部分）
- ✅ 记录回退日志（包含 `fallback: true`）

**代码示例**：
```javascript
// knowledge-injection-trial.js 第 149-164 行
if (qwenResult.success) {
  return {
    success: true,
    source: 'knowledge_injection_trial',
    data: qwenResult.data,
    knowledgeInjected: true,
    durationMs
  };
}

// 如果失败，回退到原逻辑
if (originalLogic) {
  return await originalLogic(input, context);
}
```

### 7.3 回退验证

**第八步已验证回退机制**：
- ✅ 样本2（`register_flow`，不在白名单）：成功回退，主流程正常
- ✅ 日志输出：`[KnowledgeInjectionTrial] 未命中内部试运行: scenario_not_whitelisted`
- ✅ Telegram Bot 消息无知识增强部分

---

## 八、内部人员使用注意事项

### 8.1 参与试运行的主管/客服须知

**使用前确认**：
1. ✅ 已了解知识增强建议答案的展示形式
2. ✅ 知道如何识别知识增强是否生效
3. ✅ 知道如何记录问题（命中错知识、建议答案偏题等）
4. ✅ 知道异常情况如何处理（关闭开关、反馈问题）

**使用中注意**：
- ⚠️ 知识增强建议答案仅供参考，**不代替客服判断**
- ⚠️ 如发现建议答案不准确，**仍需按原流程回复**
- ⚠️ 遇到问题立即反馈，不要自行修改配置

### 8.2 知识增强建议答案展示形式

**Telegram Bot 最终消息格式**：
```
📋 *训练反馈 - 第 1 轮*

*场景：* 转账成功但对方未到账

✅ *本轮做得好的地方：*
• 未使用禁忌表达
• 回复详实充分

🔴 *本轮存在的问题：*
• 缺少关键信息: 请您、账单截图、绑定手机号、协助

💡 *下一步建议：*
• 确保回复包含所有必要信息，避免遗漏关键步骤。

🔄 *训练状态：* 继续训练

━━━━━━━━━━━━━━━━
💡 *知识增强建议答案*（内部试运行）

您好，请提供转账时间、金额和交易哈希，我们马上为您核查到账状态。

_评分：65分_
```

**关键识别点**：
- 📍 看到 `💡 知识增强建议答案（内部试运行）` = 知识增强已生效
- 📍 没有该部分 = 未命中知识或触发回退（正常行为）

---

## 九、什么情况下暂停试运行

### 9.1 立即暂停条件

出现以下情况时，**立即关闭总开关**：

1. **频繁命中错知识**（> 20% 样本命中错误/过时知识）
2. **建议答案严重偏题**（> 30% 建议答案与场景无关）
3. **触发 risky_suggested_reply**（Qwen3 标记建议答案有风险）
4. **频繁回退**（> 50% 样本触发回退，说明知识检索不稳定）
5. **客服反馈强烈不满**（> 3 名客服反馈建议答案误导）
6. **系统性能严重下降**（平均耗时 > 30 秒，影响正常训练）

### 9.2 暂停操作

**一键暂停**：
```bash
# 关闭总开关
export KNOWLEDGE_INJECTION_ENABLED=false

# 重启服务
npm restart
```

**暂停后验证**：
```bash
# 查看日志确认已关闭
tail -f runtime/logs/bot.log | grep KnowledgeInjectionTrial
# 应看到：未命中内部试运行: trial_disabled
```

---

## 十、什么情况下允许扩大范围

### 10.1 扩大场景条件

满足以下条件时，可考虑增加场景白名单：

1. ✅ 当前场景稳定运行 > 7 天
2. ✅ 知识命中准确率 > 80%
3. ✅ 建议答案主管认可率 > 70%
4. ✅ 回退率 < 20%
5. ✅ 无明显错知识/偏题问题
6. ✅ 主管明确同意扩展

### 10.2 扩大人员条件

满足以下条件时，可考虑增加参与人员：

1. ✅ 当前人员反馈积极
2. ✅ 无明显问题或问题已解决
3. ✅ 已有完整问题记录和反馈机制
4. ✅ 主管明确同意扩大

### 10.3 扩大操作流程

**增加场景**：
```bash
# 修改场景白名单（追加新场景）
export KNOWLEDGE_INJECTION_SCENARIO_WHITELIST=lanton_transfer_success_not_received,new_scenario

# 重启服务
npm restart

# 观察新场景日志
tail -f runtime/logs/bot.log | grep new_scenario
```

**增加人员**：
- 通知新参与人员使用方式
- 提供问题反馈渠道
- 持续观察日志 3 天

---

## 十一、文档维护记录

| 版本 | 日期 | 修改内容 | 修改人 |
|------|------|---------|--------|
| v1.0 | 2026-04-24 | 初始版本，整理内部试运行规则 | 技术团队 |

---

## 附录：快速参考

### 开关速查表

| 操作 | 命令 | 效果 |
|------|------|------|
| **一键关闭** | `export KNOWLEDGE_INJECTION_ENABLED=false` | 所有知识注入停止 |
| **一键开启** | `export KNOWLEDGE_INJECTION_ENABLED=true` | 恢复知识注入 |
| **只保留一个场景** | `export KNOWLEDGE_INJECTION_SCENARIO_WHITELIST=lanton_transfer_success_not_received` | 其他场景不触发 |
| **清空场景白名单** | `export KNOWLEDGE_INJECTION_SCENARIO_WHITELIST=` | 所有场景不触发 |
| **只保留日志** | 关闭总开关 + 观察日志 | 不输出建议答案 |

### 日志速查命令

```bash
# 实时查看所有知识注入日志
tail -f runtime/logs/bot.log | grep KnowledgeInjectionTrial

# 只看命中成功的
tail -f runtime/logs/bot.log | grep "命中内部试运行"

# 只看回退的
tail -f runtime/logs/bot.log | grep "回退"

# 统计今天命中次数
grep "命中日志" runtime/logs/bot.log | grep $(date +%Y-%m-%d) | wc -l
```
