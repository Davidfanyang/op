#!/usr/bin/env node
/**
 * start-bot.js - Bot 正式入口
 * 
 * 职责：
 * 1. 加载环境变量
 * 2. 校验必要配置
 * 3. 启动 Telegram Bot
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');

// 确保运行时目录存在
const runtimeDirs = [
  path.resolve(__dirname, 'runtime', 'logs'),
  path.resolve(__dirname, 'runtime', 'locks')
];

runtimeDirs.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// 校验必要环境变量
const requiredEnvVars = ['TELEGRAM_BOT_TOKEN'];
const missing = requiredEnvVars.filter(key => !process.env[key]);

if (missing.length > 0) {
  console.error('[启动失败] 缺少必要环境变量:');
  missing.forEach(key => console.error(`  - ${key}`));
  console.error('\n请检查 .env 文件或环境变量配置');
  process.exit(1);
}

// 输出启动信息
console.log('='.repeat(50));
console.log('客服训练 Bot 启动');
console.log('='.repeat(50));
console.log(`时间: ${new Date().toISOString()}`);
console.log(`Node 版本: ${process.version}`);
console.log(`环境: ${process.env.NODE_ENV || 'development'}`);
console.log(`Token: ${process.env.TELEGRAM_BOT_TOKEN.substring(0, 10)}...`);
console.log('='.repeat(50));

// 启动 Bot
try {
  const { pollLoop } = require('./bot/telegram-bot.js');
  pollLoop();
} catch (err) {
  console.error('[启动失败]', err.message);
  process.exit(1);
}
