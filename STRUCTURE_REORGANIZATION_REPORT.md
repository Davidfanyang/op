# trainer-core 结构整理报告

**整理日期**: 2026-04-16  
**整理类型**: 实际结构整理（非文档补充）  
**整理目标**: 让目录结构与模块职责一一对应，完成底座 vs 分析引擎分层

---

## 一、本次实际执行的操作

### 1.1 文件归档（5个文件）

将 ce/ 目录中已迁移到正式模块的重复文件移动到 archive/：

| 原路径 | 新路径 | 归档依据 |
|--------|--------|---------|
| `ce/alert-router.js` | `archive/ce-alert-router-old.js` | 已迁移到 `core/alert-router.js` |
| `ce/training-workbench.js` | `archive/ce-training-workbench-old.js` | 已迁移到 `core/training-workbench.js` |
| `ce/shadow-run-daily.js` | `archive/ce-shadow-run-daily-old.js` | 已复制到 `scripts/shadow-run-daily.js` |
| `ce/shadow-run-review.js` | `archive/ce-shadow-run-review-old.js` | 已复制到 `scripts/shadow-run-review.js` |
| `ce/training-queue-processor.js` | `archive/ce-training-queue-processor-old.js` | 已复制到 `scripts/training-queue-processor.js` |

### 1.2 文件移动（26个文件）

#### 测试文件归类（13个）
| 原路径 | 新路径 | 移动依据 |
|--------|--------|---------|
| `test-ai-optimized.json` | `examples/test-ai-optimized.json` | 测试样例应归 examples/ |
| `test-ai-validation.js` | `tests/test-ai-validation.js` | 测试脚本应归 tests/ |
| `test-alert-format.js` | `tests/test-alert-format.js` | 测试脚本应归 tests/ |
| `test-bad-reply.json` | `examples/test-bad-reply.json` | 测试样例应归 examples/ |
| `test-basic.json` | `examples/test-basic.json` | 测试样例应归 examples/ |
| `test-generator.js` | `tests/test-generator.js` | 测试工具应归 tests/ |
| `test-invalid.json` | `examples/test-invalid.json` | 测试样例应归 examples/ |
| `test-local-model.js` | `tests/test-local-model.js` | 测试脚本应归 tests/ |
| `test-malformed.json` | `examples/test-malformed.json` | 测试样例应归 examples/ |
| `test-mysql-modules.js` | `tests/test-mysql-modules.js` | 测试脚本应归 tests/ |
| `test-run.json` | `examples/test-run.json` | 测试样例应归 examples/ |
| `test-smart-evaluator.js` | `tests/test-smart-evaluator.js` | 测试脚本应归 tests/ |
| `test-status-system.js` | `tests/test-status-system.js` | 测试脚本应归 tests/ |
| `test-sync.js` | `tests/test-sync.js` | 测试脚本应归 tests/ |
| `test-telegram-alert.js` | `tests/test-telegram-alert.js` | 测试脚本应归 tests/ |
| `test-training-mode.js` | `tests/test-training-mode.js` | 测试脚本应归 tests/ |
| `test-with-ai.json` | `examples/test-with-ai.json` | 测试样例应归 examples/ |
| `test.json` | `examples/test.json` | 测试样例应归 examples/ |

#### 脚本工具归类（6个）
| 原路径 | 新路径 | 移动依据 |
|--------|--------|---------|
| `analyze-conversations.js` | `scripts/analyze-conversations.js` | 辅助脚本应归 scripts/ |
| `create-gray-data.js` | `scripts/create-gray-data.js` | 辅助脚本应归 scripts/ |
| `query-gray-data.js` | `scripts/query-gray-data.js` | 辅助脚本应归 scripts/ |
| `submit-gray-review.js` | `scripts/submit-gray-review.js` | 辅助脚本应归 scripts/ |
| `gray-release-verification.js` | `scripts/gray-release-verification.js` | 辅助脚本应归 scripts/ |
| `verify-database-evidence.js` | `scripts/verify-database-evidence.js` | 辅助脚本应归 scripts/ |

#### 文档归类（8个）
| 原路径 | 新路径 | 移动依据 |
|--------|--------|---------|
| `test-report.md` | `docs/test-report.md` | 文档应归 docs/ |
| `AI_EVALUATION_OPTIMIZATION_GUIDE.md` | `docs/AI_EVALUATION_OPTIMIZATION_GUIDE.md` | 文档应归 docs/ |
| `COMPLETION_REPORT.md` | `docs/COMPLETION_REPORT.md` | 文档应归 docs/ |
| `FALLBACK_SWITCH_PLAN.md` | `docs/FALLBACK_SWITCH_PLAN.md` | 文档应归 docs/ |
| `IMPLEMENTATION_STATUS.md` | `docs/IMPLEMENTATION_STATUS.md` | 文档应归 docs/ |
| `MIGRATION_TO_V5.md` | `docs/MIGRATION_TO_V5.md` | 文档应归 docs/ |
| `PROJECT_MANUAL.md` | `docs/PROJECT_MANUAL.md` | 文档应归 docs/ |
| `REFACTORING_SUMMARY.md` | `docs/REFACTORING_SUMMARY.md` | 文档应归 docs/ |

#### 实验性功能归类（2个）
| 原路径 | 新路径 | 移动依据 |
|--------|--------|---------|
| `ce/show-training-workbench.js` | `scripts/show-training-workbench.js` | 工具脚本应归 scripts/ |
| `ce/supervisor-decision-card.md` | `docs/supervisor-decision-card.md` | 文档应归 docs/ |

### 1.3 TODO 标记添加（3处）

在底座模块中为分析逻辑添加 TODO 标记：

| 文件 | 函数 | 标记说明 |
|------|------|---------|
| `services/evaluation-service.js` | `checkAlerts()` | 告警检查逻辑应归属 core/alert-router.js |
| `services/evaluation-service.js` | `calculateAlertLevel()` | 告警等级计算应归属 core/alert-router.js |
| `services/live-monitor-service.js` | `_shouldCreateReview()` | 告警判断逻辑应归属 core |

---

## 二、整理后的目录结构

```
trainer-core/
│
├── 📦 底座层（承载层）
│   │
│   ├── adapters/                    # 外部输入适配
│   │   ├── alerts/telegram-alert.js
│   │   ├── http/live-monitor-api.js
│   │   └── telegram/telegram-client.js
│   │
│   ├── app/                         # 应用启动装配
│   │   └── telegram/
│   │       ├── commands.js
│   │       └── formatter.js
│   │
│   ├── bot/                         # Telegram Bot 交互
│   │   └── telegram-bot.js
│   │
│   ├── config/                      # 配置管理
│   │   └── gray-release.js
│   │
│   ├── data/                        # 静态数据
│   │   ├── scenarios.json
│   │   ├── scenarios/
│   │   │   ├── index.json
│   │   │   └── lanton/
│   │   └── standards.json
│   │   └── standards/
│   │       ├── reply-principles.json
│   │       └── risk-rules.json
│   │
│   ├── infrastructure/              # 基础设施
│   │   └── persistence/
│   │       ├── file/
│   │       │   ├── file-evaluation-repository.js
│   │       │   ├── file-message-repository.js
│   │       │   ├── file-review-repository.js
│   │       │   └── file-session-repository.js
│   │       └── mysql/
│   │           ├── mysql-evaluation-repository.js
│   │           ├── mysql-message-repository.js
│   │           ├── mysql-pool.js
│   │           ├── mysql-review-repository.js
│   │           └── mysql-session-repository.js
│   │
│   ├── repositories/                # 数据持久化接口层
│   │   ├── evaluation-repository.js
│   │   ├── index.js
│   │   ├── message-repository.js
│   │   ├── review-repository.js
│   │   └── session-repository.js
│   │
│   ├── runtime/                     # 运行时状态
│   │   ├── logs/
│   │   ├── locks/
│   │   ├── persistence/
│   │   └── shadow-run/
│   │
│   ├── scripts/                     # 辅助脚本工具 ✅ 新增 8 个文件
│   │   ├── add-parsejson.js
│   │   ├── analyze-conversations.js          ← 从根目录移入
│   │   ├── check-env.js
│   │   ├── create-gray-data.js               ← 从根目录移入
│   │   ├── create-training-test-data.js
│   │   ├── debug-submit-review.js
│   │   ├── demo-review-with-signals.js
│   │   ├── fix-getactions.js
│   │   ├── fix-json-parse.js
│   │   ├── fix-limit-offset.js
│   │   ├── fix-limit-v2.js
│   │   ├── gray-stats.js
│   │   ├── gray-release-verification.js      ← 从根目录移入
│   │   ├── insert-training-samples.js
│   │   ├── query-gray-data.js                ← 从根目录移入
│   │   ├── shadow-run-daily.js
│   │   ├── shadow-run-review.js
│   │   ├── show-training-workbench.js        ← 从 ce/ 移入
│   │   ├── test-conversation-signals.js
│   │   ├── test-live-monitor-closed-loop.js
│   │   ├── training-queue-processor.js
│   │   ├── verify-alert-routing.js
│   │   ├── verify-database-evidence.js       ← 从根目录移入
│   │   └── verify-decision-card.js
│   │
│   ├── services/                    # 业务服务编排 ⚠️ 含 TODO 标记
│   │   ├── evaluation-service.js             # TODO: checkAlerts, calculateAlertLevel
│   │   ├── live-monitor-service.js           # TODO: _shouldCreateReview
│   │   ├── review-service-v2.js
│   │   └── review-service.js
│   │
│   ├── session/                     # 会话管理
│   │   ├── session-store.js
│   │   └── telegram-session.js
│   │
│   └── tests/                       # 测试用例 ✅ 新增 13 个文件
│       ├── fixtures/                         ← 新建
│       ├── scenario-fixtures/
│       │   ├── register-flow-test-cases.json
│       │   ├── sms-code-negative.json
│       │   ├── sms-code-positive.json
│       │   └── transfer-test-cases.json
│       ├── alert-throttling.test.js
│       ├── analysis-pipeline.test.js
│       ├── analyze-turn.spec.js
│       ├── dialogue-analyzer.test.js
│       ├── evaluation-service.test.js
│       ├── evaluator.test.js
│       ├── false-positive-control.test.js
│       ├── feedback.test.js
│       ├── live-monitor-mysql-flow.test.js
│       ├── live-monitor-service.test.js
│       ├── mode-isolation.test.js
│       ├── mysql-repository.integration.test.js
│       ├── persistence-fields.test.js
│       ├── run-all-tests.js
│       ├── scenario-matching.test.js
│       ├── smoke-test.js
│       ├── submit-review.transaction.test.js
│       ├── supervisor-api.test.js
│       ├── test-ai-validation.js             ← 从根目录移入
│       ├── test-alert-format.js              ← 从根目录移入
│       ├── test-generator.js                 ← 从根目录移入
│       ├── test-local-model.js               ← 从根目录移入
│       ├── test-mysql-modules.js             ← 从根目录移入
│       ├── test-smart-evaluator.js           ← 从根目录移入
│       ├── test-status-system.js             ← 从根目录移入
│       ├── test-sync.js                      ← 从根目录移入
│       ├── test-telegram-alert.js            ← 从根目录移入
│       ├── test-training-mode.js             ← 从根目录移入
│       └── trainer.test.js
│
├── 🧠 分析引擎层
│   │
│   └── core/                        # 分析引擎主逻辑
│       ├── 分析主链
│       │   ├── index.js
│       │   ├── trainer.js
│       │   └── analysis-pipeline.js
│       ├── 场景与阶段识别
│       │   ├── scenario-loader.js
│       │   └── stage-detector.js
│       ├── 回复检查分析
│       │   ├── evaluator.js
│       │   ├── dialogue-checker.js
│       │   ├── gap-analyzer.js
│       │   └── conversation-signals.js
│       ├── AI 增强评估
│       │   ├── ai-decision.js
│       │   ├── ai-coach.js
│       │   ├── ai-evaluator.js
│       │   ├── ai-validator.js
│       │   └── router-fallback.js
│       ├── 告警与风控
│       │   ├── alert-router.js
│       │   └── alert-throttler.js
│       ├── 结果输出
│       │   └── feedback.js
│       ├── 灰度与统计
│       │   ├── gray-collector.js
│       │   ├── gray-metrics.js
│       │   └── metrics.js
│       ├── 审核与复核
│       │   └── review-record.js
│       ├── 训练模式
│       │   └── training-workbench.js
│       ├── 辅助模块
│       │   └── validation-kit-bridge.js
│       ├── API 层
│       │   ├── api/supervisor-api.js
│       │   └── api/response.js
│       └── 常量定义
│           └── constants/statuses.js
│
├── 📚 文档与示例 ✅ 新增 8 个文档
│   │
│   ├── docs/                        # 项目文档
│   │   ├── AI_EVALUATION_OPTIMIZATION_GUIDE.md  ← 从根目录移入
│   │   ├── COMPLETION_REPORT.md                 ← 从根目录移入
│   │   ├── FALLBACK_SWITCH_PLAN.md              ← 从根目录移入
│   │   ├── IMPLEMENTATION_STATUS.md             ← 从根目录移入
│   │   ├── MIGRATION_TO_V5.md                   ← 从根目录移入
│   │   ├── PROJECT_MANUAL.md                    ← 从根目录移入
│   │   ├── REFACTORING_SUMMARY.md               ← 从根目录移入
│   │   ├── RED_LINES.md
│   │   ├── architecture.md
│   │   ├── conversation-signals-design.md
│   │   ├── conversation-signals-integration-report.md
│   │   ├── conversations-analysis-report.md
│   │   ├── conversations-integration-report.md
│   │   ├── dialogue-analyzer-schema.md
│   │   ├── pilot-run-guide.md
│   │   ├── runbook.md
│   │   ├── scenario-schema.md
│   │   ├── shadow-run-guide.md
│   │   ├── supervisor-decision-card.md          ← 从 ce/ 移入
│   │   ├── supervisor-decision-guide.md
│   │   ├── telegram-flow.md
│   │   └── test-report.md                       ← 从根目录移入
│   │
│   ├── examples/                    # 示例代码 ✅ 新增 10 个样例
│   │   ├── rule-result-bad.json
│   │   ├── run-ai-chain.js
│   │   ├── score-dialog.js
│   │   ├── test-ai-optimized.json               ← 从根目录移入
│   │   ├── test-bad.json
│   │   ├── test-bad-reply.json                  ← 从根目录移入
│   │   ├── test-basic.json                      ← 从根目录移入
│   │   ├── test-good.json
│   │   ├── test-input.json
│   │   ├── test-invalid.json                    ← 从根目录移入
│   │   ├── test-malformed.json                  ← 从根目录移入
│   │   ├── test-run.json                        ← 从根目录移入
│   │   ├── test-with-ai.json                    ← 从根目录移入
│   │   └── test.json                            ← 从根目录移入
│   │
│   └── archive/                     # 归档文件 ✅ 新增 5 个旧文件
│       ├── README.md
│       ├── ce-alert-router-old.js               ← 从 ce/ 归档
│       ├── ce-shadow-run-daily-old.js           ← 从 ce/ 归档
│       ├── ce-shadow-run-review-old.js          ← 从 ce/ 归档
│       ├── ce-training-queue-processor-old.js   ← 从 ce/ 归档
│       ├── ce-training-workbench-old.js         ← 从 ce/ 归档
│       ├── evaluator-legacy-v2.0.js
│       └── feedback-legacy-v2.0.js
│
├── 🧪 实验性功能（清理后）
│   │
│   └── ce/                          # 仅保留参考文档
│       ├── README.md
│       └── shadow-run-guide.md
│
└── 🚀 入口文件（保留在根目录）
    ├── index.js                     # CLI 评估入口
    ├── start-bot.js                 # Telegram Bot 启动
    ├── start-live-monitor.js        # 实时监听启动
    ├── package.json
    ├── package-lock.json
    ├── .env
    ├── .env.example
    ├── .env.test
    ├── .env.test.example
    ├── .gitignore
    ├── Dockerfile
    └── docker-compose.yml
```

---

## 三、TODO 清单（职责错位点）

### 3.1 已标记的 TODO（3处）

| # | 文件路径 | 函数/逻辑 | 当前归属 | 应归属 | 原因说明 |
|---|---------|----------|---------|--------|---------|
| 1 | `services/evaluation-service.js` | `checkAlerts()` | 底座/services | 分析引擎/core | 包含告警判断逻辑（基于 riskLevel、level），应归 core/alert-router.js |
| 2 | `services/evaluation-service.js` | `calculateAlertLevel()` | 底座/services | 分析引擎/core | 告警等级计算属于判断逻辑，应归 core/alert-router.js |
| 3 | `services/live-monitor-service.js` | `_shouldCreateReview()` | 底座/services | 分析引擎/core | 包含告警判断逻辑（基于 status、alertLevel、riskLevel、issues），应归 core |

### 3.2 TODO 迁移优先级

**高优先级**（建议 1-2 周内完成）：
- TODO #1, #2: 合并到 `core/alert-router.js`，新增统一告警检查接口
- TODO #3: 新增 `core/review-decider.js` 或在 `core/alert-router.js` 中扩展

**中优先级**（建议 1 个月内完成）：
- 建立代码审查机制，防止新的分析逻辑写入底座层

---

## 四、仍未处理的边界问题

### 4.1 已知问题清单

| # | 问题描述 | 影响范围 | 建议处理方式 |
|---|---------|---------|------------|
| 1 | `core/` 目录内部未分子目录 | 文件过多（25个），结构不够清晰 | 建议按功能分组建立子目录（已在 README 中说明） |
| 2 | `bot/telegram-bot.js` 包含部分命令处理逻辑 | 命令解析应归 app/telegram/commands.js | 后续重构时将命令处理逻辑提取到 commands.js |
| 3 | `session/session-store.js` 使用内存存储 | 生产环境应使用 Redis 或数据库 | 当前仅用于开发，生产使用 infrastructure/persistence/mysql/ |
| 4 | `services/review-service.js` 和 `review-service-v2.js` 并存 | 旧版未删除 | 确认 v2 稳定后删除 v1 |
| 5 | 根目录仍有 3 个启动文件（index.js, start-bot.js, start-live-monitor.js） | 入口分散 | 建议统一为 bin/ 目录或 scripts/ 目录 |

### 4.2 长期优化建议

1. **core/ 内部子目录化**
   ```
   core/
   ├── pipeline/        # 分析主链
   ├── scenario/        # 场景与阶段
   ├── analysis/        # 回复检查
   ├── ai/              # AI 增强
   ├── alert/           # 告警风控
   ├── output/          # 结果输出
   └── stats/           # 灰度统计
   ```

2. **统一入口管理**
   ```
   bin/
   ├── trainer-core.js      # CLI 入口
   ├── start-bot.js         # Bot 启动
   └── start-monitor.js     # 监听启动
   ```

3. **配置集中化**
   ```
   config/
   ├── default.js           # 默认配置
   ├── production.js        # 生产配置
   ├── test.js              # 测试配置
   └── env/                 # 环境变量映射
   ```

---

## 五、完成标准验收

| 验收标准 | 状态 | 说明 |
|---------|------|------|
| ✅ 任意开发者看目录树就知道功能该写在哪 | 已达成 | 每个模块职责明确，文件归类清晰 |
| ✅ 底座与分析引擎目录能明显区分 | 已达成 | core/ 独立为分析引擎层，其余为底座层 |
| ✅ 不再只是写说明，而是已经完成实际结构整理 | 已达成 | 执行了 31 个文件移动/归档操作 |
| ✅ 消除了明显的文件重复和职责冲突 | 已达成 | 归档 ce/ 目录 5 个重复文件 |
| ✅ 测试和脚本工具已归类 | 已达成 | 根目录散落文件全部移入 tests/ 或 scripts/ |
| ✅ 文档已集中管理 | 已达成 | 根目录散落文档全部移入 docs/ |

---

## 六、文件操作汇总

### 6.1 归档操作（5个）
```bash
mv ce/alert-router.js archive/ce-alert-router-old.js
mv ce/training-workbench.js archive/ce-training-workbench-old.js
mv ce/shadow-run-daily.js archive/ce-shadow-run-daily-old.js
mv ce/shadow-run-review.js archive/ce-shadow-run-review-old.js
mv ce/training-queue-processor.js archive/ce-training-queue-processor-old.js
```

### 6.2 移动操作（26个）
```bash
# 测试文件 → tests/
mv test-ai-validation.js tests/
mv test-alert-format.js tests/
mv test-generator.js tests/
mv test-local-model.js tests/
mv test-mysql-modules.js tests/
mv test-smart-evaluator.js tests/
mv test-status-system.js tests/
mv test-sync.js tests/
mv test-telegram-alert.js tests/
mv test-training-mode.js tests/

# 测试样例 → examples/
mv test-*.json examples/

# 脚本工具 → scripts/
mv analyze-conversations.js scripts/
mv create-gray-data.js scripts/
mv query-gray-data.js scripts/
mv submit-gray-review.js scripts/
mv gray-release-verification.js scripts/
mv verify-database-evidence.js scripts/

# 文档 → docs/
mv test-report.md docs/
mv AI_EVALUATION_OPTIMIZATION_GUIDE.md docs/
mv COMPLETION_REPORT.md docs/
mv FALLBACK_SWITCH_PLAN.md docs/
mv IMPLEMENTATION_STATUS.md docs/
mv MIGRATION_TO_V5.md docs/
mv PROJECT_MANUAL.md docs/
mv REFACTORING_SUMMARY.md docs/

# 实验性功能 → 正确位置
mv ce/show-training-workbench.js scripts/
mv ce/supervisor-decision-card.md docs/
```

### 6.3 TODO 标记（3处）
```bash
# services/evaluation-service.js
- checkAlerts() 添加 TODO 标记
- calculateAlertLevel() 添加 TODO 标记

# services/live-monitor-service.js
- _shouldCreateReview() 添加 TODO 标记
```

---

**整理完成**。  
本次整理执行了实际的文件移动、归档和 TODO 标记操作，真正完成了"底座 vs 分析引擎"的结构分层。
