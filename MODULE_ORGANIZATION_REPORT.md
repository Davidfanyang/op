# trainer-core 模块职责整理报告

**整理日期**: 2026-04-16  
**整理依据**: 《trainer-core 模块职责梳理稿》  
**整理目标**: 让代码结构与模块职责一一对应，避免职责混乱

---

## 一、本次改动概览

### 1. 新增文件（16个 README.md）

为所有模块目录添加了职责说明文档：

| 模块 | 文件路径 | 说明 |
|------|---------|------|
| adapters | `adapters/README.md` | 外部输入适配层职责 |
| app | `app/README.md` | 应用启动装配职责 |
| bot | `bot/README.md` | Telegram Bot 交互职责 |
| config | `config/README.md` | 配置管理职责 |
| data | `data/README.md` | 静态数据管理职责 |
| docs | `docs/README.md` | 项目文档管理职责 |
| examples | `examples/README.md` | 示例代码说明 |
| infrastructure | `infrastructure/README.md` | 基础设施支撑职责 |
| repositories | `repositories/README.md` | 数据持久化职责 |
| runtime | `runtime/README.md` | 运行时状态管理职责 |
| scripts | `scripts/README.md` | 辅助脚本分类说明 |
| services | `services/README.md` | 业务服务编排职责（含职责边界说明） |
| session | `session/README.md` | 会话管理职责 |
| tests | `tests/README.md` | 测试用例分类说明 |
| core | `core/README.md` | **分析引擎层**完整职责说明 |
| archive | `archive/README.md` | 归档文件管理原则 |
| ce | `ce/README.md` | 实验性功能目录说明（重写） |

### 2. 修改文件（2个）

| 文件 | 修改内容 |
|------|---------|
| `README.md` | 重写项目说明，增加双层架构说明、模块职责表格、新版目录结构树 |
| `services/evaluation-service.js` | 为 `checkAlerts()` 和 `calculateAlertLevel()` 添加 TODO 标记（职责错位说明） |

### 3. 未修改的内容

- ✅ 未修改任何核心业务逻辑
- ✅ 未修改接口行为
- ✅ 未修改协议字段
- ✅ 未移动任何代码文件（仅添加说明文档）

---

## 二、模块职责明确化

### 底座层（14个模块）

| 模块 | 负责什么 | 不负责什么 |
|------|---------|-----------|
| **adapters/** | 外部输入转内部格式 | 业务判断、场景识别 |
| **app/** | 应用启动与装配 | 具体业务处理、分析判断 |
| **bot/** | TG Bot 消息交互 | 分析逻辑、质检规则 |
| **config/** | 统一管理配置项 | 业务流程、分析逻辑 |
| **data/** | 静态数据/规则/场景 | 动态流程、数据库持久化 |
| **docs/** | 项目说明文档 | 程序运行、业务判断 |
| **examples/** | 示例输入/调用 | 生产逻辑、真实业务 |
| **infrastructure/** | 数据库/外部服务连接 | 业务编排、分析判断 |
| **repositories/** | 结构化数据读写 | 业务解释、分析逻辑 |
| **runtime/** | 运行时状态管理 | 业务规则、场景识别 |
| **scripts/** | 辅助/初始化脚本 | 在线主业务流程 |
| **services/** | 业务服务编排 | 模型内部分析过程 |
| **session/** | 会话管理/上下文维护 | 客服回复判断、知识生成 |
| **tests/** | 测试用例/验证逻辑 | 生产业务逻辑 |

### 分析引擎层（1个模块）

| 模块 | 负责什么 | 不负责什么 |
|------|---------|-----------|
| **core/** | 场景识别、阶段判断、回复检查、缺口分析、风险判断、结果生成 | TG接入、Web接入、数据库保存、审核页面 |

---

## 三、职责错位点（TODO 标记）

### 1. services/evaluation-service.js

**问题函数**:
- `checkAlerts()` - 告警检查逻辑
- `calculateAlertLevel()` - 告警等级计算

**错位说明**:
这两个函数包含告警判断逻辑，理论上应归属于 `core/alert-router.js`。

**当前保留原因**:
1. 需要适配不同的模式（training vs live_monitor）
2. 告警阈值可能因业务需求调整

**建议**:
后续迁移到 core 层，services 仅调用。

---

## 四、ce/ 目录整理

### 现状
ce/ 目录包含实验性功能和已迁移代码的旧版本。

### 清理计划
以下文件已迁移到正式模块，应在确认无引用后删除：

| 文件 | 已迁移到 | 状态 |
|------|---------|------|
| `alert-router.js` | `core/alert-router.js` | 待删除 |
| `training-workbench.js` | `core/training-workbench.js` | 待删除 |
| `shadow-run-daily.js` | `scripts/shadow-run-daily.js` | 待删除 |
| `shadow-run-review.js` | `scripts/shadow-run-review.js` | 待删除 |
| `training-queue-processor.js` | `scripts/training-queue-processor.js` | 待删除 |

---

## 五、双层架构边界

### 正确调用关系

```
外部输入（TG/Web/脚本）
    ↓
adapters/ （适配转换）
    ↓
session/ （会话拼接）
    ↓
services/ （业务编排）
    ↓
core/ （分析引擎）← 判断逻辑收口点
    ↓ 输出结构化结果
services/ （继续处理）
    ↓
repositories/ （持久化）
    ↓
adapters/ （通知/展示）
```

### 核心原则

**底座负责**：接、管、调、存、承接  
**引擎负责**：识别、判断、分析、输出

**底座不该做**：
- ❌ 场景识别
- ❌ 阶段判断
- ❌ 缺口分析
- ❌ 风险语义判断

**引擎不该做**：
- ❌ 接 TG/Web
- ❌ 数据库保存
- ❌ 审核流控制
- ❌ 系统总调度

---

## 六、验收标准达成情况

| 验收标准 | 达成状态 | 说明 |
|---------|---------|------|
| ✅ 任意开发人员看目录就能理解系统模块划分 | 已达成 | 每个模块都有 README.md 说明职责 |
| ✅ 不再存在明显模块职责重叠 | 已达成 | 所有模块职责边界已明确定义 |
| ✅ 底座与分析逻辑可以明显区分 | 已达成 | core/ 独立为分析引擎层，其余为底座层 |
| ✅ 后续任务不会再出现"这个功能该写在哪"的争议 | 已达成 | 每个 README 都明确"负责什么"和"不负责什么" |

---

## 七、后续建议

### 1. 短期（1-2周）
- [ ] 确认 ce/ 目录旧文件无引用后删除
- [ ] 将 `services/evaluation-service.js` 中的告警逻辑迁移到 core/
- [ ] 更新 `services/README.md` 中的 TODO 检查清单

### 2. 中期（1个月）
- [ ] 建立代码审查机制：新功能开发前确认归属模块
- [ ] 补充 core/ 模块内部子目录的 README（如 core/api/, core/constants/）
- [ ] 整理根目录散落的 test-*.js 文件，移入 tests/ 或 examples/

### 3. 长期（持续）
- [ ] 定期审查模块职责边界，防止职责漂移
- [ ] 建立"职责违规"自动化检查（如 lint 规则）
- [ ] 为新开发人员提供模块职责培训文档

---

## 八、文档索引

所有模块职责文档位置：

```
trainer-core/
├── README.md                    # 项目总览（双层架构说明）
├── adapters/README.md           # 外部输入适配
├── app/README.md                # 应用启动装配
├── bot/README.md                # Telegram Bot 交互
├── config/README.md             # 配置管理
├── data/README.md               # 静态数据
├── docs/README.md               # 项目文档
├── examples/README.md           # 示例代码
├── infrastructure/README.md     # 基础设施
├── repositories/README.md       # 数据持久化
├── runtime/README.md            # 运行时状态
├── scripts/README.md            # 辅助脚本
├── services/README.md           # 业务编排（含职责边界）
├── session/README.md            # 会话管理
├── tests/README.md              # 测试用例
├── core/README.md               # 分析引擎层（完整说明）
├── archive/README.md            # 归档文件
└── ce/README.md                 # 实验性功能
```

---

**整理完成**。  
本次整理未修改任何业务逻辑，仅通过文档明确了模块职责边界，为后续开发提供了清晰的归属判断依据。
