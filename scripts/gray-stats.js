#!/usr/bin/env node
/**
 * 灰度统计查看脚本
 * 
 * 用法: node scripts/gray-stats.js
 */

const { getStatsSummary } = require('../core/gray-collector');

const stats = getStatsSummary();

console.log('\n========================================');
console.log('灰度期数据统计');
console.log('========================================\n');

console.log('📊 基本信息');
console.log(`  开始时间: ${stats.startDate}`);
console.log(`  运行天数: ${stats.summary.daysRunning}`);
console.log(`  总评估数: ${stats.totalEvaluations}`);
console.log(`  平均评分: ${stats.summary.avgScore}`);
console.log(`  告警率: ${stats.summary.alertRate}`);

console.log('\n📈 评分分布');
Object.entries(stats.scoreDistribution).forEach(([range, count]) => {
  const bar = '█'.repeat(Math.round(count / Math.max(stats.totalEvaluations, 1) * 30));
  console.log(`  ${range}: ${count.toString().padStart(4)} ${bar}`);
});

console.log('\n🚨 告警统计');
console.log(`  总告警数: ${stats.alertStats.total}`);
console.log(`  Critical: ${stats.alertStats.critical}`);
console.log(`  Medium:   ${stats.alertStats.medium}`);
console.log(`  Low:      ${stats.alertStats.low}`);

console.log('\n🤖 模型使用');
console.log(`  本地模型: ${stats.modelUsage.local}`);
console.log(`  OpenRouter: ${stats.modelUsage.openrouter}`);
console.log(`  Fallback: ${stats.modelUsage.fallback}`);

console.log('\n✨ AI 增强');
console.log(`  触发次数: ${stats.aiEnhancement.triggered}`);
console.log(`  成功: ${stats.aiEnhancement.success}`);
console.log(`  失败: ${stats.aiEnhancement.failed}`);

console.log('\n📝 复核状态');
console.log(`  待复核: ${stats.reviewStatus.pending}`);
console.log(`  已确认: ${stats.reviewStatus.confirmed}`);
console.log(`  误报: ${stats.reviewStatus.falsePositive}`);
console.log(`  已忽略: ${stats.reviewStatus.dismissed}`);

console.log('\n📅 每日统计');
Object.entries(stats.dailyStats).forEach(([date, data]) => {
  console.log(`  ${date}: 评估${data.evaluations}次, 告警${data.alerts}次, 均分${data.avgScore.toFixed(1)}`);
});

console.log('\n🏷️ 场景统计 (Top 5)');
const sortedScenarios = Object.entries(stats.scenarioStats)
  .sort((a, b) => b[1].count - a[1].count)
  .slice(0, 5);
sortedScenarios.forEach(([id, data]) => {
  console.log(`  ${id}: ${data.count}次, 均分${data.avgScore.toFixed(1)}, 告警${data.alerts}次`);
});

console.log('\n========================================\n');
