# Trainer Core - 客服训练引擎

## 项目定位

trainer-core 采用**双层架构**：
- **底座层**：负责接入、会话管理、服务编排、调用引擎、结果存储与展示
- **分析引擎层**：负责场景识别、阶段判断、缺口分析、风险判断及结构化诊断结果生成

**核心边界原则**：底座不负责判断，引擎不负责承载。

---

## 当前能做什么

- 基于规则的客服回复评分
- AI 增强评估（低分/复杂场景自动触发）
- Telegram Bot 交互训练
- 多项目/多模式支持（training/live_monitor）
- 实时监听与告警分流

---

## 模块职责说明

### 底座层（承载层）

| 模块 | 职责 | 详细说明 |
|------|------|---------|
| `adapters/` | 外部输入适配 | TG、Web、接口请求转内部格式 |
| `app/` | 应用启动装配 | 配置、服务、适配器组织 |
| `bot/` | TG Bot 交互 | 训练场景对话入口与消息收发 |
| `config/` | 配置管理 | 环境变量、服务地址、数据库配置 |
| `data/` | 静态数据 | 场景、规则、模板文件 |
| `docs/` | 项目文档 | 架构、运维、接口说明 |
| `examples/` | 示例代码 | 测试样例、演示脚本 |
| `infrastructure/` | 基础设施 | 数据库连接、外部服务接入 |
| `repositories/` | 数据持久化 | 训练、质检、审核记录存取 |
| `runtime/` | 运行时状态 | 日志、锁、上下文管理 |
| `scripts/` | 辅助脚本 | 导入、初始化、批处理 |
| `services/` | 业务编排 | 训练、监听、审核流程组织 |
| `session/` | 会话管理 | conversation 拼接、上下文维护 |
| `tests/` | 测试验证 | 单元测试、集成测试 |

### 分析引擎层

| 模块 | 职责 | 详细说明 |
|------|------|---------|
| `core/` | 分析引擎主逻辑 | 场景识别、阶段判断、回复检查、缺口分析 |

详细职责边界请查看各模块 README.md。

---

## 当前正式入口

| 入口 | 用途 | 命令 |
|------|------|------|
| `start-bot.js` | 启动 Telegram Bot | `node start-bot.js` |
| `index.js` | CLI 评估（单次） | `node index.js <input.json>` |
| `start-live-monitor.js` | 启动实时监听服务 | `node start-live-monitor.js` |

## 目录结构

```
trainer-core/
├── 📦 底座层（承载层）
│   ├── adapters/           # 外部输入适配（TG/Web/API）
│   ├── app/                # 应用启动装配
│   ├── bot/                # Telegram Bot 交互
│   ├── config/             # 配置管理
│   ├── data/               # 静态数据（场景/规则/模板）
│   ├── infrastructure/     # 基础设施（数据库连接）
│   ├── repositories/       # 数据持久化接口层
│   ├── runtime/            # 运行时状态（日志/锁/上下文）
│   ├── scripts/            # 辅助脚本工具
│   ├── services/           # 业务服务编排
│   ├── session/            # 会话管理
│   └── tests/              # 测试用例
│
├── 🧠 分析引擎层
│   └── core/               # 分析引擎主逻辑
│       ├── 场景与阶段识别：scenario-loader, stage-detector
│       ├── 回复检查分析：evaluator, dialogue-checker, gap-analyzer
│       ├── AI 增强评估：ai-coach, ai-evaluator, ai-validator
│       ├── 告警与风控：alert-router, alert-throttler
│       └── 结果输出：feedback
│
├── 📚 文档与示例
│   ├── docs/               # 项目文档
│   ├── examples/           # 示例代码
│   └── archive/            # 归档文件（历史版本）
│
├── 🧪 实验性功能
│   └── ce/                 # 实验性/独立工具脚本
│
└── 🚀 入口文件
    ├── start-bot.js        # 启动 Telegram Bot
    ├── start-live-monitor.js  # 启动实时监听
    └── index.js            # CLI 评估入口
```

## 如何本地启动

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env，添加 TELEGRAM_BOT_TOKEN
```

### 3. 启动 Bot

```bash
# 方式1: 直接启动
node start-bot.js

# 方式2: 使用脚本
bash scripts/run-local.sh

# 方式3: 使用 npm
npm run tg
```

### 4. CLI 测试

```bash
node index.js examples/test-input.json
```

## 环境变量

| 变量 | 必填 | 说明 |
|------|------|------|
| TELEGRAM_BOT_TOKEN | 是 | Telegram Bot Token |
| TELEGRAM_ALERT_CHAT_ID | 否 | 告警群组 ID |
| OPENROUTER_API_KEY | 否 | AI 评估 API Key |
| GRAY_RELEASE_ENABLED | 否 | 灰度模式开关 |
| LOCAL_SCORING_API | 否 | 本地评分服务地址 |

## 命令参考

| 命令 | 说明 |
|------|------|
| /start, /score | 开始训练 |
| /cancel | 取消当前会话 |
| /help | 显示帮助 |
