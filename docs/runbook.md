# Telegram Bot Runbook

## 正式入口
- 唯一正式 Telegram 入口：`bot/telegram-bot.js`
- 实验脚本：`scripts/smoke-test.js`（不可作为正式入口）

## 常用命令
- 清理实例：`npm run tg:clean`
- 启动正式 bot：`npm run tg:start`
- 前台运行正式 bot：`npm run tg`

## 运行产物
- 日志：`runtime/logs/telegram-bot.log`
- 锁文件：`runtime/locks/telegram-bot.lock`

## 排查顺序
1. 看 API 是否通：检查 bot token / getMe
2. 看实例是否存在：`pgrep -af 'node bot/telegram-bot.js'`
3. 看锁文件：`cat runtime/locks/telegram-bot.lock`
4. 看日志：`tail -n 100 runtime/logs/telegram-bot.log`

## 规则
- 同一时间只允许一个正式 bot 实例
- 不要手工启动实验脚本作为正式服务
- 所有正式启动统一走 package.json scripts
