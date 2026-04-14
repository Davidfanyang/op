#!/usr/bin/env node
/**
 * 环境变量检查脚本
 * 启动前运行：node scripts/check-env.js
 */

// 加载 .env 文件
require('dotenv').config();

const requiredVars = [
  { name: 'TELEGRAM_BOT_TOKEN', critical: true, desc: 'Telegram Bot Token' },
  { name: 'TELEGRAM_ALERT_CHAT_ID', critical: false, desc: '告警群ID（正式群）' },
  { name: 'LOCAL_MODEL_URL', critical: true, desc: '本地模型服务地址', default: 'http://localhost:8001/score' },
  { name: 'LIVE_MONITOR_PORT', critical: false, desc: 'Live Monitor 端口', default: '3001' }
];

const grayVars = [
  { name: 'GRAY_RELEASE_ENABLED', critical: true, desc: '是否启用灰度', default: 'false' },
  { name: 'GRAY_TEST_CHAT_ID', critical: true, desc: '灰度测试群ID（P0关键）' },
  { name: 'GRAY_PROJECT_ID', critical: false, desc: '灰度项目限制', default: 'lanton' },
  { name: 'GRAY_MAX_DAILY', critical: false, desc: '每日最大评估数', default: '1000' }
];

console.log('========================================');
console.log('环境变量检查');
console.log('========================================\n');

let hasCriticalError = false;
let hasWarning = false;

// 检查必需变量
console.log('【基础配置】');
requiredVars.forEach(v => {
  const value = process.env[v.name];
  const isSet = value && value.trim() !== '';
  
  if (isSet) {
    const displayValue = v.name.includes('TOKEN') || v.name.includes('KEY') 
      ? value.substring(0, 10) + '...' 
      : value;
    console.log(`  ✅ ${v.name}: ${displayValue}`);
  } else if (v.default) {
    console.log(`  ⚠️  ${v.name}: 未设置（将使用默认值: ${v.default}）`);
    hasWarning = true;
  } else if (v.critical) {
    console.log(`  ❌ ${v.name}: 未设置（${v.desc}）**关键**`);
    hasCriticalError = true;
  } else {
    console.log(`  ⚠️  ${v.name}: 未设置（${v.desc}）`);
    hasWarning = true;
  }
});

console.log('\n【灰度配置】');
grayVars.forEach(v => {
  const value = process.env[v.name];
  const isSet = value && value.trim() !== '';
  
  if (isSet) {
    console.log(`  ✅ ${v.name}: ${value}`);
  } else if (v.default) {
    console.log(`  ⚠️  ${v.name}: 未设置（将使用默认值: ${v.default}）`);
    hasWarning = true;
  } else if (v.critical) {
    console.log(`  ❌ ${v.name}: 未设置（${v.desc}）**关键**`);
    hasCriticalError = true;
  } else {
    console.log(`  ⚠️  ${v.name}: 未设置（${v.desc}）`);
    hasWarning = true;
  }
});

// 灰度模式特殊检查
const grayEnabled = process.env.GRAY_RELEASE_ENABLED === 'true';
if (grayEnabled) {
  console.log('\n【灰度模式检查】');
  console.log('  灰度模式: 已启用');
  
  const testChatId = process.env.GRAY_TEST_CHAT_ID;
  const prodChatId = process.env.TELEGRAM_ALERT_CHAT_ID;
  
  if (!testChatId) {
    console.log('  ❌ GRAY_TEST_CHAT_ID 必须设置（灰度期间告警发测试群）');
    hasCriticalError = true;
  } else {
    console.log(`  ✅ 测试群: ${testChatId}`);
  }
  
  if (prodChatId && testChatId !== prodChatId) {
    console.log('  ✅ 正式群与测试群分离（安全）');
  } else if (prodChatId && testChatId === prodChatId) {
    console.log('  ⚠️  测试群与正式群相同（灰度期建议分开）');
    hasWarning = true;
  }
} else {
  console.log('\n【灰度模式检查】');
  console.log('  灰度模式: 未启用（全量模式）');
  if (!process.env.TELEGRAM_ALERT_CHAT_ID) {
    console.log('  ❌ TELEGRAM_ALERT_CHAT_ID 必须设置（全量模式告警目标）');
    hasCriticalError = true;
  }
}

// 总结
console.log('\n========================================');
if (hasCriticalError) {
  console.log('❌ 检查失败：存在关键配置缺失');
  console.log('========================================');
  process.exit(1);
} else if (hasWarning) {
  console.log('⚠️  检查通过：存在警告，但可以启动');
  console.log('========================================');
  process.exit(0);
} else {
  console.log('✅ 检查通过：所有配置正常');
  console.log('========================================');
  process.exit(0);
}
