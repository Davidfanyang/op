/**
 * 启动 Live Monitor 服务
 * 
 * 用法: node start-live-monitor.js
 * 
 * 环境变量:
 *   TELEGRAM_BOT_TOKEN - Telegram Bot Token
 *   TELEGRAM_ALERT_CHAT_ID - 告警群组ID
 *   LIVE_MONITOR_PORT - 服务端口 (默认 3001)
 */

// 加载 .env 文件
require('dotenv').config();

const { LiveMonitorAPI } = require('./adapters/http/live-monitor-api');
const { TelegramAlerter } = require('./adapters/alerts/telegram-alert');

// 创建 API 服务
const api = new LiveMonitorAPI({
  port: process.env.LIVE_MONITOR_PORT || 3001
});

// 创建 Telegram 告警器
const alerter = new TelegramAlerter();

// 注册告警处理器
api.onAlert(async (result) => {
  // 1. 控制台输出
  console.log('[ALERT] 检测到告警:', {
    projectId: result.projectId,
    scenarioId: result.scenarioId,
    score: result.score,
    alerts: result.alerts?.map(a => ({ level: a.level, message: a.message }))
  });

  // 2. Telegram 通知
  await alerter.sendAlert(result);
});

// 启动服务
api.start();

console.log('\n========================================');
console.log('Live Monitor 服务已启动');
console.log('========================================');
console.log('\nAPI 端点:');
console.log('  GET  /health    - 健康检查');
console.log('  GET  /projects  - 项目列表');
console.log('  POST /evaluate  - 实时评估');
console.log('\n示例请求:');
console.log(`  curl -X POST http://localhost:${api.port}/evaluate \\
    -H "Content-Type: application/json" \\
    -d '{
      "projectId": "lanton",
      "customerMessage": "我转账显示成功但对方没收到",
      "userReply": "请稍等，我们帮您查询"
    }'`);
console.log('\n按 Ctrl+C 停止服务');
console.log('========================================\n');

// 优雅退出
process.on('SIGINT', () => {
  console.log('\n正在停止服务...');
  api.stop();
  process.exit(0);
});
