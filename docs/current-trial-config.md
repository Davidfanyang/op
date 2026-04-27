# 当前试运行配置（Current Trial Configuration）

> **版本**：v1.0  
> **创建时间**：2026-04-24  
> **状态**：已确认  
> **目的**：整理当前实际使用的配置项，明确关闭方式

---

## 一、环境变量配置

### 1.1 核心配置项

```bash
# ============================================
# 知识注入内部试运行配置
# ============================================

# 总开关（true=启用，false=关闭）
KNOWLEDGE_INJECTION_ENABLED=true

# 入口白名单（逗号分隔）
# - training: Telegram Bot 训练模式（唯一对外入口）
# - internal_trial: 预留入口（当前不使用）
KNOWLEDGE_INJECTION_ENTRY_WHITELIST=training,internal_trial

# 场景白名单（逗号分隔）
# 当前只允许 1 个场景：lanton_transfer_success_not_received
KNOWLEDGE_INJECTION_SCENARIO_WHITELIST=lanton_transfer_success_not_received

# 项目白名单（空表示不限制）
KNOWLEDGE_INJECTION_PROJECT_WHITELIST=

# 最大知识条数（每次检索最多返回几条知识）
KNOWLEDGE_INJECTION_MAX_ITEMS=3
```

### 1.2 配置说明

| 配置项 | 当前值 | 说明 | 是否必填 |
|--------|--------|------|---------|
| `KNOWLEDGE_INJECTION_ENABLED` | `true` | 总开关：控制知识注入是否启用 | ✅ 必填 |
| `KNOWLEDGE_INJECTION_ENTRY_WHITELIST` | `training,internal_trial` | 入口白名单：哪些入口可触发知识注入 | ✅ 必填 |
| `KNOWLEDGE_INJECTION_SCENARIO_WHITELIST` | `lanton_transfer_success_not_received` | 场景白名单：哪些场景可触发知识注入 | ✅ 必填 |
| `KNOWLEDGE_INJECTION_PROJECT_WHITELIST` | ``（空） | 项目白名单：空表示不限制 | ❌ 可选 |
| `KNOWLEDGE_INJECTION_MAX_ITEMS` | `3` | 最大知识条数：每次检索最多返回几条 | ✅ 必填 |

---

## 二、如何一键关闭

### 2.1 关闭所有知识注入

**方法 1：环境变量（推荐）**
```bash
# 1. 关闭总开关
export KNOWLEDGE_INJECTION_ENABLED=false

# 2. 重启服务
npm restart

# 3. 验证已关闭
tail -f runtime/logs/bot.log | grep KnowledgeInjectionTrial
# 应看到：未命中内部试运行: trial_disabled
```

**方法 2：修改 .env 文件**
```bash
# 1. 编辑 .env 文件
vim .env

# 2. 修改配置
KNOWLEDGE_INJECTION_ENABLED=false

# 3. 重启服务
npm restart
```

**效果**：
- ✅ 原链路不变（客服训练正常进行）
- ✅ 日志仍会记录未命中原因（`trial_disabled`）
- ❌ 不会输出知识增强建议答案

### 2.2 只关闭某个场景

**方法**：
```bash
# 1. 从场景白名单中移除该场景
export KNOWLEDGE_INJECTION_SCENARIO_WHITELIST=

# 或只保留其他场景
export KNOWLEDGE_INJECTION_SCENARIO_WHITELIST=other_scenario

# 2. 重启服务
npm restart

# 3. 验证该场景已不触发
# 选择该场景进行训练，应看不到知识增强建议答案
```

### 2.3 只保留日志、不输出建议答案

**方法**：
```bash
# 1. 关闭总开关
export KNOWLEDGE_INJECTION_ENABLED=false

# 2. 重启服务
npm restart

# 3. 继续观察日志
tail -f runtime/logs/bot.log | grep KnowledgeInjectionTrial
# 仍会记录未命中原因，但不输出知识增强建议答案
```

---

## 三、配置验证

### 3.1 验证配置生效

**查看当前配置**：
```bash
# 查看环境变量
echo $KNOWLEDGE_INJECTION_ENABLED
echo $KNOWLEDGE_INJECTION_ENTRY_WHITELIST
echo $KNOWLEDGE_INJECTION_SCENARIO_WHITELIST
echo $KNOWLEDGE_INJECTION_MAX_ITEMS
```

**查看代码中的配置**：
```javascript
// 在 Node.js 中查看
const { getTrialConfig } = require('./services/knowledge-injection-trial');
console.log(getTrialConfig());
```

### 3.2 验证开关生效

**测试开启状态**：
```bash
# 1. 确保总开关为 true
export KNOWLEDGE_INJECTION_ENABLED=true

# 2. 运行测试
node scripts/test-internal-trial-verification.js

# 3. 应看到知识增强建议答案输出
```

**测试关闭状态**：
```bash
# 1. 关闭总开关
export KNOWLEDGE_INJECTION_ENABLED=false

# 2. 运行测试
node scripts/test-internal-trial-verification.js

# 3. 应看不到知识增强建议答案输出
```

---

## 四、配置文件位置

### 4.1 环境变量文件

**文件路径**：`.env`

**说明**：
- 该文件包含所有环境变量配置
- 不在版本控制中（`.gitignore` 已忽略）
- 生产环境需手动配置

### 4.2 代码中的默认配置

**文件路径**：`services/knowledge-injection-trial.js`

**默认值**（第 24-39 行）：
```javascript
const TRIAL_CONFIG = {
  enabled: process.env.KNOWLEDGE_INJECTION_ENABLED === 'true',
  entryWhitelist: (process.env.KNOWLEDGE_INJECTION_ENTRY_WHITELIST || 'training,internal_trial').split(',').map(s => s.trim()),
  scenarioWhitelist: (process.env.KNOWLEDGE_INJECTION_SCENARIO_WHITELIST || 'transfer_not_received,withdraw_pending,payment_deducted_failed').split(',').map(s => s.trim()),
  projectWhitelist: (process.env.KNOWLEDGE_INJECTION_PROJECT_WHITELIST || '').split(',').map(s => s.trim()).filter(s => s),
  maxKnowledgeItems: parseInt(process.env.KNOWLEDGE_INJECTION_MAX_ITEMS || '3', 10)
};
```

**注意**：
- 环境变量优先级高于默认值
- 如未设置环境变量，将使用默认值
- **建议**：始终在 `.env` 中明确配置，不依赖默认值

---

## 五、配置变更历史

| 日期 | 变更内容 | 变更人 | 原因 |
|------|---------|--------|------|
| 2026-04-24 | 初始配置，场景白名单只保留 1 个 | 技术团队 | 主线收口，收紧范围 |

---

## 六、文档维护

| 版本 | 日期 | 修改内容 | 修改人 |
|------|------|---------|--------|
| v1.0 | 2026-04-24 | 初始版本，整理当前试运行配置 | 技术团队 |

---

## 附录：快速参考

### 一键关闭
```bash
export KNOWLEDGE_INJECTION_ENABLED=false
npm restart
```

### 一键开启
```bash
export KNOWLEDGE_INJECTION_ENABLED=true
npm restart
```

### 只保留一个场景
```bash
export KNOWLEDGE_INJECTION_SCENARIO_WHITELIST=lanton_transfer_success_not_received
npm restart
```

### 清空场景白名单
```bash
export KNOWLEDGE_INJECTION_SCENARIO_WHITELIST=
npm restart
```
