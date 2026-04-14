# Telegram Bot Runbook

## 正式入口

| 文件 | 用途 | 是否正式入口 |
|------|------|-------------|
| `bot/telegram-bot.js` | Telegram Bot 主程序 | ✅ 唯一正式入口 |
| `start-bot.js` | Bot 启动器（含校验） | ✅ 推荐启动方式 |
| `scripts/smoke-test.js` | 冒烟测试脚本 | ❌ 仅测试用 |
| `tests/smoke-test.js` | 冒烟测试（已归档） | ❌ 仅测试用 |

## 启动命令

```bash
# 推荐方式（带环境校验）
node start-bot.js

# 使用 npm scripts
npm run tg          # 前台运行
npm run tg:start    # 带日志记录
npm run tg:clean    # 清理进程和锁文件

# 使用脚本
bash scripts/run-local.sh
```

## 运行产物

| 产物 | 路径 | 说明 |
|------|------|------|
| 日志 | `runtime/logs/telegram-bot.log` | 运行日志 |
| 锁文件 | `runtime/locks/telegram-bot.lock` | 进程锁 |

## 排查顺序

### 1. 检查 Bot 是否在线

```bash
curl "https://api.telegram.org/bot<TOKEN>/getMe"
```

### 2. 检查本地进程

```bash
# 查看是否有运行中的实例
pgrep -af 'node.*telegram-bot'

# 查看端口占用（如果使用 webhook）
lsof -i :3000
```

### 3. 检查锁文件

```bash
cat runtime/locks/telegram-bot.lock
```

### 4. 查看日志

```bash
# 实时查看
tail -f runtime/logs/telegram-bot.log

# 查看最后 100 行
tail -n 100 runtime/logs/telegram-bot.log
```

### 5. 检查环境变量

```bash
# 检查 token 是否设置
echo $TELEGRAM_BOT_TOKEN

# 检查 .env 文件
cat .env | grep TELEGRAM
```

## 常见问题

### Bot 不响应消息

1. 检查 token 是否正确
2. 检查网络连接
3. 查看日志是否有轮询错误
4. 确认没有其他实例在运行

### 启动失败

1. 检查 `.env` 文件是否存在
2. 检查 `TELEGRAM_BOT_TOKEN` 是否设置
3. 检查 Node.js 版本（需 v16+）
4. 检查端口是否被占用

## 运维规则

1. **单实例原则**：同一时间只允许一个正式 bot 实例
2. **统一入口**：所有正式启动统一走 `start-bot.js` 或 npm scripts
3. **禁止手工启动**：不要手工启动测试脚本作为正式服务
4. **日志检查**：启动后必须检查日志确认正常运行
5. **优雅退出**：使用 `Ctrl+C` 或 `npm run tg:clean` 停止，不要直接 kill -9
