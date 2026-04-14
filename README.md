# Trainer Core - 客服训练引擎

## 项目是什么

客服回复质量评估引擎，支持规则评分 + AI 增强评估，提供 Telegram Bot 交互界面。

## 当前能做什么

- 基于规则的客服回复评分
- AI 增强评估（低分/复杂场景自动触发）
- Telegram Bot 交互训练
- 多项目/多模式支持（training/live_monitor）

## 当前正式入口

| 入口 | 用途 | 命令 |
|------|------|------|
| `start-bot.js` | 启动 Telegram Bot | `node start-bot.js` |
| `index.js` | CLI 评估（单次） | `node index.js <input.json>` |
| `start-live-monitor.js` | 启动实时监听服务 | `node start-live-monitor.js` |

## 当前目录结构

```
bot/
  telegram-bot.js          # Telegram Bot 入口
adapters/
  telegram/
    telegram-client.js     # Telegram API 客户端
  alerts/
    telegram-alert.js      # 告警发送
app/
  telegram/
    commands.js            # 命令解析
    formatter.js           # 消息格式化
core/
  trainer.js               # 评估主链 (orchestrator)
  evaluator.js             # 规则评分器
  feedback.js              # 反馈构建
  scenario-loader.js       # 场景加载
  index.js                 # AI 增强链
  ai-decision.js           # AI 触发决策
  ai-coach.js              # AI 评估调用
  ai-validator.js          # AI 输出校验
  ai-evaluator.js          # AI 评分器
  router-fallback.js       # 多模型 fallback
  metrics.js               # 指标统计
  validation-kit-bridge.js # 外部校验桥接
services/
  evaluation-service.js    # 评估服务层
  project-service.js       # 项目服务（预留）
session/
  session-store.js         # 会话存储
  telegram-session.js      # Telegram 会话管理
data/
  scenarios.json           # 场景定义
  scenarios/               # 项目场景目录
  standards.json           # 评分标准
  standards/               # 标准细则
docs/
  architecture.md          # 架构文档
  runbook.md               # 运维手册
  scenario-schema.md       # 场景 schema
  telegram-flow.md         # Telegram 流程
examples/
  test-input.json          # 测试输入样例
  test-good.json           # 优秀回复样例
  test-bad.json            # 问题回复样例
  score-dialog.js          # 评分示例
  run-ai-chain.js          # AI 链示例
tests/
  smoke-test.js            # 冒烟测试
runtime/
  logs/                    # 日志目录
  locks/                   # 锁文件目录
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
