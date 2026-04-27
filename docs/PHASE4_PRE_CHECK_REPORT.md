# 阶段4前检查报告

**检查时间**: 2026-04-16  
**检查范围**: 全项目旧字段依赖情况  
**检查目标**: 确认是否具备进入阶段4（清理旧字段兼容逻辑）的条件  

---

## 一、旧字段依赖清单

### 1. projectId 旧字段

| 文件路径 | 行号 | 使用方式 | 状态 | 说明 |
|---------|------|---------|------|------|
| `bot/telegram-bot.js` | 21 | `session.projectId` | ✅ 已迁移 | 入口层使用，同时提供 `project` 字段 |
| `bot/telegram-bot.js` | 84 | `session.projectId \|\| DEFAULT_PROJECT` | ✅ 已迁移 | 构建标准协议时使用 |
| `adapters/http/live-monitor-api.js` | 166 | `body.projectId \|\| body.project` | ✅ 已迁移 | buildProtocolInput 兼容层 |
| `adapters/http/live-monitor-api.js` | 281 | `result.projectId` | ⚠️ 输出层 | 告警日志输出（非入口） |
| `adapters/alerts/telegram-alert.js` | 138 | `result.projectId` | ⚠️ 输出层 | 告警消息格式化（非入口） |
| `core/analysis-pipeline.js` | 50, 486-489 | `input.projectId \|\| input.project` | ⚠️ 协议适配层 | 兼容逻辑 |
| `core/trainer.js` | 18, 110 | 文档注释 | ℹ️ 文档 | 说明支持旧字段 |
| `config/gray-release.js` | 102-104 | `isProjectAllowed(projectId)` | ⚠️ 配置层 | 灰度发布配置 |
| `core/training-workbench.js` | 34-48 | 查询参数 | ⚠️ 业务逻辑 | MySQL查询 |
| `archive/ce-training-workbench-old.js` | 32-215 | 多处使用 | ❌ 已废弃 | legacy文件，不影响 |
| `tests/analysis-pipeline.test.js` | 33, 80, 109, 152, 184 | 测试用例 | 🧪 测试 | 使用旧字段格式 |

**结论**: 
- ✅ 入口层（bot, adapters）已迁移到标准协议
- ⚠️ core层协议适配层保留兼容逻辑
- ⚠️ 测试用例仍使用旧字段
- ❌ archive目录有legacy代码（不影响）

---

### 2. currentReply 旧字段

| 文件路径 | 行号 | 使用方式 | 状态 | 说明 |
|---------|------|---------|------|------|
| `adapters/http/live-monitor-api.js` | 170 | `body.current_reply \|\| body.currentReply` | ✅ 已迁移 | buildProtocolInput 兼容层 |
| `core/analysis-pipeline.js` | 52, 502-505 | `input.currentReply \|\| input.current_reply` | ⚠️ 协议适配层 | 兼容逻辑 |
| `core/trainer.js` | 66-67, 228, 251-260 | 多处兼容 | ⚠️ 协议适配层 | 兼容逻辑 |
| `core/evaluator.js` | 22, 80 | 文档和输出 | ⚠️ 输出层 | 旧版evaluator |
| `archive/ce-alert-router-old.js` | 37 | `result.currentReply` | ❌ 已废弃 | legacy文件 |
| `examples/score-dialog.js` | 133, 153 | `evaluateTraining({userReply})` | ❌ 未迁移 | 示例脚本使用旧API |
| `tests/analysis-pipeline.test.js` | 38, 87, 157, 189 | 测试用例 | 🧪 测试 | 使用旧字段格式 |
| `tests/analyze-turn.spec.js` | 47 | 测试用例 | 🧪 测试 | 使用旧字段格式 |

**结论**: 
- ✅ 入口层已迁移
- ⚠️ core层保留兼容逻辑
- ❌ examples/score-dialog.js 未迁移（直接调用 core/trainer）
- 🧪 测试用例仍使用旧字段

---

### 3. sessionId 旧入口传入

| 文件路径 | 行号 | 使用方式 | 状态 | 说明 |
|---------|------|---------|------|------|
| `adapters/http/live-monitor-api.js` | 167 | `body.metadata?.session_id \|\| body.sessionId` | ✅ 已迁移 | buildProtocolInput 兼容层 |
| `core/trainer.js` | 120 | `metadata.session_id \|\| metadata.sessionId` | ⚠️ 协议适配层 | 兼容逻辑 |
| `scripts/test-live-monitor-closed-loop.js` | 138, 189 | `evalPayload.metadata.sessionId` | 🧪 测试脚本 | 测试用例 |

**结论**: 
- ✅ 入口层已迁移
- ⚠️ core层保留兼容逻辑
- 🧪 测试脚本仍使用旧字段

---

### 4. employeeId 旧字段

| 文件路径 | 行号 | 使用方式 | 状态 | 说明 |
|---------|------|---------|------|------|
| `adapters/http/live-monitor-api.js` | 134, 168, 228, 233 | 多处使用 | ✅ 已迁移 | 入口层兼容+alert上下文 |
| `core/trainer.js` | 110, 123 | `metadata.employeeId` | ⚠️ 协议适配层 | 兼容逻辑 |
| `core/alert-throttler.js` | 17, 25, 29, 63-116 | 大量使用 | ⚠️ 业务逻辑 | alert限流核心逻辑 |
| `core/gray-collector.js` | 97, 108 | 灰度收集 | ⚠️ 业务逻辑 | 灰度数据收集 |
| `core/review-record.js` | 66 | 复核记录 | ⚠️ 业务逻辑 | 复核数据结构 |
| `core/training-workbench.js` | 34-48 | 查询参数 | ⚠️ 业务逻辑 | MySQL查询 |
| `archive/ce-training-workbench-old.js` | 34-50 | 多处使用 | ❌ 已废弃 | legacy文件 |
| `config/gray-release.js` | 119-126 | `isEmployeeAllowed(employeeId)` | ⚠️ 配置层 | 灰度发布配置 |
| `tests/alert-throttling.test.js` | 18-158 | 大量使用 | 🧪 测试 | alert限流测试 |

**结论**: 
- ✅ 入口层已迁移（buildProtocolInput 转换为 agent_id）
- ⚠️ **core层业务逻辑仍大量使用 employeeId**（alert-throttler, gray-collector, review-record）
- ⚠️ 配置层使用 employeeId
- 🧪 测试用例使用 employeeId

---

### 5. agentId 旧入口口径

| 文件路径 | 行号 | 使用方式 | 状态 | 说明 |
|---------|------|---------|------|------|
| `adapters/http/live-monitor-api.js` | 168 | `body.metadata?.agent_id \|\| body.employeeId \|\| body.agentId` | ✅ 已迁移 | buildProtocolInput 兼容层 |

**结论**: 
- ✅ 仅1处使用，已在入口层兼容处理

---

### 6. metadata.channel 旧字段

| 文件路径 | 行号 | 使用方式 | 状态 | 说明 |
|---------|------|---------|------|------|
| 无使用 | - | - | ✅ 未使用 | 项目中未找到 metadata.channel 的使用 |

**结论**: 
- ✅ 无依赖

---

### 7. metadata.chatId 旧字段

| 文件路径 | 行号 | 使用方式 | 状态 | 说明 |
|---------|------|---------|------|------|
| 无使用 | - | - | ✅ 未使用 | 项目中未找到 metadata.chatId 的使用 |

**结论**: 
- ✅ 无依赖

---

## 二、调用方分类统计

### ✅ 已迁移的调用方（使用标准协议）

1. **bot/telegram-bot.js** - TG Bot入口
   - 构建标准协议输入结构
   - 使用 `project`, `conversation`, `current_reply`, `metadata`, `rules`
   
2. **adapters/http/live-monitor-api.js** - HTTP API入口
   - 新增 `buildProtocolInput()` 方法
   - 统一协议转换逻辑
   - 支持向后兼容

### ⚠️ 保留兼容逻辑的核心层

3. **core/trainer.js** - 协议适配层
   - `normalizeToProtocol()` 方法支持旧字段
   - 兼容 `projectId/mode/currentReply/userReply`
   
4. **core/analysis-pipeline.js** - 分析管道
   - 支持 `projectId/project`, `currentReply/current_reply`
   - 字段校验兼容旧格式
   
5. **services/evaluation-service.js** - 评估服务
   - 阶段2已做协议适配

### ❌ 未迁移的调用方（直接调用 core 层）

6. **examples/score-dialog.js** - 交互式评分示例
   - 直接调用 `evaluateTraining()` (core/trainer)
   - 使用旧字段：`scenarioId`, `userReply`
   - **影响**: 示例脚本，非生产代码
   
7. **index.js** - CLI入口
   - 直接调用 `evaluateTraining(input)`
   - 从JSON文件读取输入
   - **影响**: 本地调试工具

### 🧪 测试用例（使用旧字段）

8. **tests/analysis-pipeline.test.js** - 5个测试用例
   - 使用 `projectId`, `currentReply`
   
9. **tests/analyze-turn.spec.js** - 对话轮次测试
   - 使用 `currentReply`
   
10. **tests/alert-throttling.test.js** - 13个测试用例
    - 使用 `employeeId`
    
11. **tests/test-live-monitor-closed-loop.js** - 闭环测试
    - 使用 `metadata.sessionId`

---

## 三、依赖关系图

```
外部调用方
  │
  ├─ ✅ TG Bot (telegram-bot.js) ────→ 标准协议 ──→ services ──→ core
  ├─ ✅ HTTP API (live-monitor-api.js) ──→ 标准协议 ──→ services ──→ core
  │
  ├─ ❌ CLI工具 (index.js) ────────→ 直接调用 core/trainer (旧字段)
  ├─ ❌ 示例脚本 (score-dialog.js) ─→ 直接调用 core/trainer (旧字段)
  │
  └─ 🧪 测试用例 ─────────────────→ 混合使用旧字段和新协议
       │
       ├─ protocol-adapter.test.js ──→ ✅ 已使用标准协议
       ├─ analysis-pipeline.test.js ─→ ❌ 使用旧字段
       ├─ alert-throttling.test.js ──→ ❌ 使用 employeeId
       └─ 其他测试 ────────────────→ 混合

核心层兼容逻辑
  │
  ├─ core/trainer.js ────────────→ normalizeToProtocol() 兼容旧字段
  ├─ core/analysis-pipeline.js ──→ 兼容 projectId/project, currentReply/current_reply
  ├─ core/alert-throttler.js ────→ 业务逻辑使用 employeeId
  ├─ core/gray-collector.js ─────→ 业务逻辑使用 employeeId
  └─ core/review-record.js ──────→ 业务逻辑使用 employeeId
```

---

## 四、阶段4清理影响评估

### 如果进入阶段4（删除旧字段兼容逻辑），会影响：

#### 🔴 高风险（生产代码）

| 文件 | 影响 | 风险等级 | 说明 |
|------|------|---------|------|
| `core/trainer.js` | 删除 normalizeToProtocol 兼容逻辑 | 🔴 高 | 会破坏 index.js 和 score-dialog.js |
| `core/analysis-pipeline.js` | 删除旧字段支持 | 🔴 高 | 会破坏测试用例 |
| `adapters/http/live-monitor-api.js` | 删除 buildProtocolInput 兼容逻辑 | 🟡 中 | 外部调用方可能仍传旧字段 |

#### 🟡 中风险（测试代码）

| 文件 | 影响 | 风险等级 | 说明 |
|------|------|---------|------|
| `tests/analysis-pipeline.test.js` | 5个测试用例会失败 | 🟡 中 | 需要重写为标准协议格式 |
| `tests/analyze-turn.spec.js` | 测试用例会失败 | 🟡 中 | 需要重写 |
| `tests/alert-throttling.test.js` | 13个测试用例会失败 | 🟡 中 | 需要使用 agent_id |

#### 🟢 低风险（工具/示例）

| 文件 | 影响 | 风险等级 | 说明 |
|------|------|---------|------|
| `index.js` | CLI工具会失败 | 🟢 低 | 本地调试工具，可快速修复 |
| `examples/score-dialog.js` | 示例脚本会失败 | 🟢 低 | 示例代码，可快速修复 |

#### ⚪ 无风险（业务逻辑保留）

| 文件 | 说明 |
|------|------|
| `core/alert-throttler.js` | employeeId 是业务逻辑字段，不应删除 |
| `core/gray-collector.js` | employeeId 是业务逻辑字段，不应删除 |
| `core/review-record.js` | employeeId 是业务逻辑字段，不应删除 |
| `config/gray-release.js` | employeeId/projectId 是配置层字段，不应删除 |

---

## 五、关键发现

### 1. 外部调用方状态

| 调用方 | 是否已迁移 | 使用协议 | 影响范围 |
|--------|-----------|---------|---------|
| TG Bot | ✅ 是 | 标准协议 v1.0 | 生产环境 |
| HTTP API (live-monitor) | ✅ 是 | 标准协议 v1.0 | 生产环境 |
| CLI工具 (index.js) | ❌ 否 | 旧格式 | 本地调试 |
| 示例脚本 (score-dialog.js) | ❌ 否 | 旧格式 | 示例代码 |

### 2. 内部调用方状态

| 层级 | 是否保留兼容 | 说明 |
|------|-------------|------|
| 入口层 (bot/adapters) | ✅ 已迁移 | 使用标准协议 |
| 服务层 (services) | ⚠️ 保留兼容 | 阶段2的协议适配层 |
| 核心层 (core) | ⚠️ 保留兼容 | normalizeToProtocol 兼容逻辑 |
| 业务逻辑 | ❌ 不应清理 | employeeId 等业务字段需保留 |

### 3. 测试覆盖状态

| 测试文件 | 使用协议 | 需要更新 |
|---------|---------|---------|
| protocol-adapter.test.js | ✅ 标准协议 | ❌ 不需要 |
| analysis-pipeline.test.js | ❌ 旧字段 | ✅ 需要 |
| analyze-turn.spec.js | ❌ 旧字段 | ✅ 需要 |
| alert-throttling.test.js | ❌ employeeId | ✅ 需要 |
| 其他测试 | 混合 | 部分需要 |

---

## 六、是否具备进入阶段4的条件

### ✅ 具备条件

1. **入口层已完全迁移** - TG Bot 和 HTTP API 都使用标准协议
2. **协议适配层已稳定** - core/trainer.js 的 normalizeToProtocol 工作正常
3. **测试框架健全** - 48个测试通过，可作为回归基准
4. **文档完整** - 阶段1-3交付文档齐全

### ⚠️ 需要注意事项

1. **测试用例需要更新** - 约20个测试用例使用旧字段，需要同步修改
2. **工具脚本需要更新** - index.js 和 score-dialog.js 需要迁移
3. **业务逻辑字段不能删除** - employeeId 等是业务字段，不是入口协议字段
4. **外部调用方确认** - 需确认是否有外部系统调用 HTTP API 时仍传旧字段

### ❌ 不建议立即执行的原因

1. **测试用例未迁移** - 直接进入阶段4会导致测试失败
2. **工具脚本未迁移** - CLI工具和示例脚本会损坏
3. **缺少自动化迁移脚本** - 手动修改容易遗漏
4. **需要分步执行** - 应该先迁移测试和工具，再清理核心层兼容逻辑

---

## 七、建议的阶段4执行策略

### 阶段4-A：迁移测试和工具（安全）

**目标**: 将所有测试用例和工具脚本迁移到标准协议

**任务**:
1. 更新 tests/analysis-pipeline.test.js（5个测试）
2. 更新 tests/analyze-turn.spec.js
3. 更新 tests/alert-throttling.test.js（13个测试，使用 agent_id）
4. 更新 examples/score-dialog.js（使用标准协议）
5. 更新 index.js（使用标准协议）
6. 运行全量测试，确保48+个测试全部通过

**风险**: 🟢 低 - 不影响生产代码

---

### 阶段4-B：清理核心层兼容逻辑（破坏性）

**目标**: 删除 core/trainer.js 和 core/analysis-pipeline.js 的旧字段兼容

**任务**:
1. 删除 core/trainer.js 的旧字段映射（projectId → project）
2. 删除 core/analysis-pipeline.js 的旧字段支持
3. 保留 core/alert-throttler.js 等业务逻辑中的 employeeId
4. 运行全量测试，确保全部通过

**风险**: 🟡 中 - 需要确认外部调用方已迁移

---

### 阶段4-C：清理入口层兼容逻辑（可选）

**目标**: 删除 adapters/http/live-monitor-api.js 的 buildProtocolInput 兼容逻辑

**任务**:
1. 确认外部调用方已全部使用标准协议
2. 删除 buildProtocolInput 中的旧字段支持
3. 简化协议转换逻辑

**风险**: 🔴 高 - 可能破坏外部系统集成

---

## 八、结论

### 当前状态评估

| 维度 | 状态 | 说明 |
|------|------|------|
| 入口层迁移 | ✅ 完成 | TG Bot 和 HTTP API 已使用标准协议 |
| 核心层兼容 | ⚠️ 保留 | normalizeToProtocol 兼容旧字段 |
| 测试覆盖 | ⚠️ 部分 | 20个测试用例使用旧字段 |
| 工具脚本 | ❌ 未迁移 | index.js 和 score-dialog.js 使用旧字段 |
| 业务逻辑 | ✅ 正常 | employeeId 等业务字段正常工作 |

### 建议

**不建议立即进入阶段4-B（破坏性清理）**

**建议先执行阶段4-A（迁移测试和工具）**：
1. 风险低，不影响生产
2. 为阶段4-B建立回归基准
3. 确保所有内部调用方使用标准协议
4. 验证标准协议的完整性

**阶段4-B的进入条件**：
1. ✅ 阶段4-A完成，所有测试通过
2. ✅ 确认无外部调用方依赖旧字段
3. ✅ 有完整的回滚方案
4. ✅ 在低峰期执行

---

## 九、遗留问题清单

1. **外部调用方确认**: 是否有其他系统调用 live-monitor API 时仍传旧字段？
2. **employeeId 业务字段**: 是否需要统一为 agent_id？（这是业务逻辑重构，不是协议清理）
3. **archive目录清理**: 是否删除 archive/ 下的 legacy 文件？
4. **core/evaluator.js**: 是否仍在使用？是否需要清理？

---

**报告生成时间**: 2026-04-16  
**检查人**: AI Assistant  
**下一步**: 等待用户确认是否执行阶段4-A（迁移测试和工具）
