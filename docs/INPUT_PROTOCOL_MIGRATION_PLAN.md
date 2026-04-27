# 分析引擎输入协议迁移计划

**协议版本**: v1.0  
**制定日期**: 2026-04-16  
**迁移目标**: 将当前代码的输入结构统一为《分析引擎输入协议定义稿》规定的标准

---

## 一、当前代码 vs 标准协议差异分析

### 1.1 字段名称差异

| 标准协议字段 | 当前代码字段 | 差异类型 | 影响范围 |
|------------|------------|---------|---------|
| `project` | `projectId` | 字段名不一致 | 所有调用入口 |
| `current_reply` | `currentReply` | 字段名不一致（驼峰vs下划线） | 所有调用入口 |
| `metadata.source` | 缺失 | 字段缺失 | 需要新增 |
| `metadata.session_id` | `metadata.sessionId` | 字段名不一致 | 需要统一 |
| `metadata.agent_id` | `metadata.employeeId` | 字段名不一致 | 需要统一 |
| `metadata.entry_type` | `mode` | 字段位置+名称都不一致 | 需要迁移 |
| `rules` | 缺失 | 字段缺失 | 需要新增 |

### 1.2 conversation 子项结构差异

| 标准协议 | 当前代码 | 差异说明 |
|---------|---------|---------|
| `role: "user"` | `role: "customer"` | 角色名不一致 |
| `role: "agent"` | `role: "agent"` | ✅ 一致 |
| `content` | `text` 或 `content` | 字段名不统一 |
| 无 `turnIndex` | 有 `turnIndex` | 当前代码有额外字段 |
| 无 `ts` | 有 `ts` 或 `timestamp` | 当前代码有额外字段 |

### 1.3 metadata 字段差异

| 标准协议必填字段 | 当前代码状态 | 说明 |
|----------------|------------|------|
| `source` | ❌ 缺失 | 需要新增（tg_training/tg_live） |
| `session_id` | ⚠️ 存在但命名不同 | `sessionId` → `session_id` |
| `agent_id` | ⚠️ 存在但命名不同 | `employeeId` → `agent_id` |
| `timestamp` | ⚠️ 部分存在 | 需要确保所有入口都传递 |
| `entry_type` | ❌ 缺失（当前用顶层 `mode`） | 需要移入 metadata |

### 1.4 缺失的顶层字段

| 标准协议字段 | 当前代码状态 | 迁移难度 |
|------------|------------|---------|
| `rules` | ❌ 完全缺失 | 中（需要规则加载逻辑） |

---

## 二、迁移方案设计

### 2.1 迁移策略：渐进式迁移（向后兼容）

**原则**：
1. 新增标准协议字段，不立即删除旧字段
2. 在 `trainer.js` 入口层做字段映射（兼容旧调用方）
3. 分析引擎内部逐步切换到新字段名
4. 确认所有调用方迁移完成后，再删除旧字段兼容逻辑

**阶段划分**：
- **阶段1**（本周）：在 `trainer.js` 新增字段映射层
- **阶段2**（下周）：迁移所有 services 层调用
- **阶段3**（2周内）：迁移 bot 和 adapters 层
- **阶段4**（1个月内）：删除旧字段兼容逻辑

---

## 三、具体迁移步骤

### 3.1 阶段1：在 core/trainer.js 新增协议适配层

**目标文件**: `core/trainer.js`

**新增函数**: `normalizeToProtocol(input)`

```javascript
/**
 * 将旧输入结构转换为标准协议结构
 * 向后兼容：同时支持旧字段名和新字段名
 */
function normalizeToProtocol(input) {
  return {
    // 1. project (projectId → project)
    project: input.project || input.projectId || 'default',
    
    // 2. conversation (标准化 role 和 content)
    conversation: normalizeConversation(input.conversation),
    
    // 3. current_reply (currentReply → current_reply)
    current_reply: input.current_reply || input.currentReply,
    
    // 4. metadata (标准化字段名)
    metadata: normalizeMetadata(input.metadata, input.mode),
    
    // 5. rules (新增，允许空对象)
    rules: input.rules || {}
  };
}

/**
 * 标准化 conversation
 * - role: "customer" → "user"
 * - text → content
 */
function normalizeConversation(conversation) {
  if (!Array.isArray(conversation)) {
    return [];
  }
  
  return conversation.map((turn, index) => ({
    role: turn.role === 'customer' ? 'user' : turn.role,
    content: turn.content || turn.text || ''
    // 移除 turnIndex, ts 等额外字段（或保留在 _meta 中）
  }));
}

/**
 * 标准化 metadata
 * - 补充缺失的 source
 * - sessionId → session_id
 * - employeeId → agent_id
 * - mode → entry_type (移入 metadata)
 */
function normalizeMetadata(metadata = {}, mode) {
  return {
    // 新增 source（根据 entry_type 推断）
    source: metadata.source || inferSource(metadata.entry_type || mode),
    
    // 字段名统一
    session_id: metadata.session_id || metadata.sessionId || '',
    agent_id: metadata.agent_id || metadata.employeeId || '',
    
    // timestamp 确保存在
    timestamp: metadata.timestamp || new Date().toISOString(),
    
    // entry_type 从 mode 迁移过来
    entry_type: metadata.entry_type || mode || 'training',
    
    // 保留其他扩展字段
    ...metadata
  };
}

/**
 * 根据 entry_type 推断 source
 */
function inferSource(entryType) {
  if (entryType === 'training') return 'tg_training';
  if (entryType === 'live_monitor') return 'tg_live';
  return 'unknown';
}
```

**修改 `analyzeTurn` 函数**:

```javascript
async function analyzeTurn(input) {
  // 1. 基础校验（支持旧字段）
  validateInput(input);

  // 2. 转换为标准协议
  const protocolInput = normalizeToProtocol(input);
  
  // 3. 校验标准协议
  validateProtocol(protocolInput);

  // 4. 调用 analysis pipeline（传入标准协议）
  return analysisPipeline.analyzeTurn(protocolInput);
}
```

### 3.2 阶段2：迁移 services 层调用

#### 3.2.1 services/evaluation-service.js

**当前调用方式**:
```javascript
const trainerInput = {
  projectId: params.projectId,
  mode: params.mode,
  scenarioId: scenarioId,
  conversation: params.conversation,
  currentReply: params.currentReply,
  metadata: params.metadata || {}
};
```

**迁移后调用方式**:
```javascript
const trainerInput = {
  project: params.projectId,  // 或直接传 params.project
  conversation: params.conversation,
  current_reply: params.currentReply,
  metadata: {
    source: params.metadata?.source || 'tg_training',
    session_id: params.metadata?.sessionId,
    agent_id: params.metadata?.employeeId,
    timestamp: params.metadata?.timestamp || new Date().toISOString(),
    entry_type: params.mode,
    ...params.metadata
  },
  rules: params.rules || loadRules(params.projectId)  // 新增规则加载
};
```

#### 3.2.2 services/live-monitor-service.js

类似迁移，确保 `_analyzeMessage` 方法使用标准协议。

### 3.3 阶段3：迁移 bot 和 adapters 层

#### 3.3.1 bot/telegram-bot.js

**当前调用**:
```javascript
const result = await evaluate({
  projectId: session.projectId || DEFAULT_PROJECT,
  mode: session.mode || DEFAULT_MODE,
  scenarioId: session.scenario.id,
  userReply: normalized,
  metadata: {
    channel: 'telegram',
    chatId: chatId.toString(),
    sessionId: `${chatId}_${Date.now()}`
  }
});
```

**迁移后调用**:
```javascript
const result = await evaluate({
  project: session.projectId || DEFAULT_PROJECT,
  conversation: buildConversation(session),  // 需要先拼接对话
  current_reply: normalized,
  metadata: {
    source: 'tg_training',
    session_id: session.sessionId || `${chatId}_${Date.now()}`,
    agent_id: session.agentId || chatId.toString(),
    timestamp: new Date().toISOString(),
    entry_type: 'training',
    chat_id: chatId.toString()
  },
  rules: loadRules(session.projectId)
});
```

### 3.4 阶段4：删除旧字段兼容逻辑

在确认所有调用方都迁移到标准协议后：
1. 删除 `normalizeToProtocol` 函数
2. 删除 `validateInput` 中的旧字段校验
3. 更新所有注释和文档

---

## 四、校验规则实现

### 4.1 标准协议校验函数

**新增文件**: `core/protocol-validator.js`

```javascript
/**
 * 校验分析引擎输入协议
 */
function validateProtocol(input) {
  const errors = [];
  
  // 1. 顶层结构校验
  if (!input || typeof input !== 'object') {
    throw new Error('INVALID_PROTOCOL: input 必须是对象');
  }
  
  // 2. project 校验
  if (!input.project || typeof input.project !== 'string') {
    errors.push('project 必须为非空字符串');
  }
  
  // 3. conversation 校验
  if (!Array.isArray(input.conversation) || input.conversation.length === 0) {
    errors.push('conversation 必须为非空数组');
  } else {
    input.conversation.forEach((turn, index) => {
      if (!turn.role || !['user', 'agent'].includes(turn.role)) {
        errors.push(`conversation[${index}].role 必须是 "user" 或 "agent"`);
      }
      if (!turn.content || typeof turn.content !== 'string') {
        errors.push(`conversation[${index}].content 必须为非空字符串`);
      }
    });
  }
  
  // 4. current_reply 校验
  if (!input.current_reply || typeof input.current_reply !== 'string') {
    errors.push('current_reply 必须为非空字符串');
  }
  
  // 5. metadata 校验
  if (!input.metadata || typeof input.metadata !== 'object') {
    errors.push('metadata 必须为对象');
  } else {
    const requiredMetadata = ['source', 'session_id', 'agent_id', 'timestamp', 'entry_type'];
    requiredMetadata.forEach(field => {
      if (!input.metadata[field]) {
        errors.push(`metadata.${field} 为必填字段`);
      }
    });
    
    if (!['training', 'live_monitor'].includes(input.metadata.entry_type)) {
      errors.push('metadata.entry_type 必须是 "training" 或 "live_monitor"');
    }
  }
  
  // 6. rules 校验
  if (typeof input.rules !== 'object') {
    errors.push('rules 必须为对象（无规则时传 {}）');
  }
  
  // 7. 逻辑一致性校验
  if (input.metadata && input.metadata.entry_type === 'training' && !input.project) {
    errors.push('training 模式必须提供 project');
  }
  
  if (errors.length > 0) {
    throw new Error(`INVALID_PROTOCOL: ${errors.join('; ')}`);
  }
}
```

---

## 五、rules 加载方案

### 5.1 规则加载入口

**新增文件**: `core/rule-loader.js`

```javascript
const fs = require('fs');
const path = require('path');

/**
 * 加载项目规则
 * 当前从 data/standards/ 读取，后续改为从 Web API 或数据库读取
 */
function loadRules(projectId) {
  const rules = {
    must_ask: [],
    must_include: [],
    forbidden: [],
    stage_rules: {}
  };
  
  try {
    // 1. 加载通用规则
    const standardsPath = path.resolve(__dirname, '../data/standards.json');
    if (fs.existsSync(standardsPath)) {
      const standards = JSON.parse(fs.readFileSync(standardsPath, 'utf8'));
      rules.must_include = standards.mustInclude || [];
      rules.forbidden = standards.forbidden || [];
    }
    
    // 2. 加载项目特定规则（如果存在）
    const projectRulesPath = path.resolve(__dirname, `../data/standards/${projectId}.json`);
    if (fs.existsSync(projectRulesPath)) {
      const projectRules = JSON.parse(fs.readFileSync(projectRulesPath, 'utf8'));
      Object.assign(rules, projectRules);
    }
  } catch (err) {
    console.error(`[RuleLoader] 加载规则失败 (${projectId}):`, err.message);
  }
  
  return rules;
}

module.exports = { loadRules };
```

### 5.2 规则注入点

在 `services/evaluation-service.js` 的 `evaluate` 函数中：

```javascript
async function evaluate(params) {
  // ... 前置校验
  
  // 加载规则并注入
  const rules = params.rules || loadRules(params.projectId || params.project);
  
  const trainerInput = {
    project: params.projectId || params.project,
    conversation: params.conversation,
    current_reply: params.currentReply || params.current_reply,
    metadata: normalizeMetadata(params.metadata, params.mode),
    rules: rules  // 注入规则
  };
  
  // ... 调用分析引擎
}
```

---

## 六、迁移检查清单

### 6.1 阶段1检查清单（core/trainer.js 适配层）

- [ ] 新增 `normalizeToProtocol` 函数
- [ ] 新增 `normalizeConversation` 函数
- [ ] 新增 `normalizeMetadata` 函数
- [ ] 新增 `validateProtocol` 函数
- [ ] 修改 `analyzeTurn` 调用协议适配
- [ ] 修改 `analyzeConversation` 调用协议适配
- [ ] 编写单元测试验证向后兼容性
- [ ] 运行现有测试确保无破坏

### 6.2 阶段2检查清单（services 层迁移）

- [ ] 迁移 `services/evaluation-service.js`
- [ ] 迁移 `services/live-monitor-service.js`
- [ ] 新增 `core/rule-loader.js`
- [ ] 在 evaluate 函数中注入 rules
- [ ] 更新 services 层注释说明使用标准协议
- [ ] 编写集成测试验证协议传递

### 6.3 阶段3检查清单（bot/adapters 层迁移）

- [ ] 迁移 `bot/telegram-bot.js`
- [ ] 迁移 `adapters/http/live-monitor-api.js`
- [ ] 确保所有入口都传递完整的 metadata
- [ ] 确保所有入口都加载并传递 rules
- [ ] 端到端测试验证

### 6.4 阶段4检查清单（清理旧字段）

- [ ] 确认所有调用方已迁移
- [ ] 删除 `normalizeToProtocol` 函数
- [ ] 删除旧字段兼容逻辑
- [ ] 更新所有文档
- [ ] 发布 Breaking Change 通知

---

## 七、风险评估

### 7.1 高风险项

| 风险项 | 影响 | 缓解措施 |
|--------|------|---------|
| conversation 字段名变更（text→content） | 可能导致分析引擎内部读取失败 | 在 normalizeConversation 中同时兼容 text 和 content |
| metadata 字段名变更 | 可能导致入库字段不匹配 | 在 repositories 层做字段映射 |
| rules 字段新增 | 当前无规则文件 | 允许传空对象 {}，后续逐步补充规则 |

### 7.2 中风险项

| 风险项 | 影响 | 缓解措施 |
|--------|------|---------|
| role 值变更（customer→user） | 可能影响场景匹配逻辑 | 在 scenario-loader 中兼容两种 role 值 |
| mode 移入 metadata | 可能影响模式判断逻辑 | 在 validateProtocol 中保留 mode 的向后兼容 |

### 7.3 低风险项

| 风险项 | 影响 | 缓解措施 |
|--------|------|---------|
| 新增 project 字段 | projectId 已有，影响小 | 同时支持 project 和 projectId |
| 新增 current_reply 字段 | currentReply 已有，影响小 | 同时支持两种命名 |

---

## 八、验收标准

### 8.1 功能验收

- [ ] 所有训练模式调用使用标准协议
- [ ] 所有实时监听调用使用标准协议
- [ ] protocol-validator 校验通过
- [ ] rules 字段正确加载并传递
- [ ] metadata 包含所有必填字段
- [ ] conversation 格式符合标准（role: user/agent, content）

### 8.2 兼容性验收

- [ ] 旧调用方式仍然有效（向后兼容）
- [ ] 新旧调用方式可混用
- [ ] 所有现有测试通过

### 8.3 文档验收

- [ ] 更新 core/README.md 说明标准协议
- [ ] 更新 services/README.md 说明调用方式
- [ ] 更新 bot/README.md 说明调用方式
- [ ] 生成协议迁移指南文档

---

## 九、时间计划

| 阶段 | 时间 | 负责人 | 交付物 |
|------|------|--------|--------|
| 阶段1 | 第1周 | Qoder | core/trainer.js 适配层 + 单元测试 |
| 阶段2 | 第2周 | Qoder | services 层迁移 + rule-loader |
| 阶段3 | 第3周 | Qoder | bot/adapters 层迁移 + 端到端测试 |
| 阶段4 | 第4周 | Qoder | 清理旧字段 + 文档更新 |

---

**文档版本**: v1.0  
**最后更新**: 2026-04-16  
**审批状态**: 待审批
