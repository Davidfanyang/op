#!/usr/bin/env node
/**
 * @script analyze-qwen3-shadow-results
 * @status EXPERIMENTAL_MODULE
 * @line MAIN_EXPERIMENT_LINE
 * @report STAGE_REPORT_ONLY
 * @production false
 *
 * 用途：
 * 分析 shadow mode 收集的结果，生成统计摘要。
 *
 * 运行方式：
 * cd /Users/adime/.openclaw/workspace/trainer-core
 * node scripts/analyze-qwen3-shadow-results.js
 */

const path = require('path');
const {
  getAllRecords,
  generateSummaryJson,
  generateSummaryMd,
  DEFAULT_OUTPUT_DIR
} = require('../services/local-model/qwen3-shadow-logger');

function main() {
  console.log('=== Qwen3 Shadow Mode 结果分析 ===\n');
  
  // 1. 读取所有记录
  const records = getAllRecords();
  console.log(`总 shadow 样本数: ${records.length}`);
  
  if (records.length === 0) {
    console.log('\n暂无 shadow 记录，请先运行 test-qwen3-shadow-mode.js');
    process.exit(0);
  }
  
  // 2. 生成统计
  const summaryJson = generateSummaryJson(records);
  const summaryMd = generateSummaryMd(records);
  
  // 3. 更新摘要文件
  const summaryDir = path.join(DEFAULT_OUTPUT_DIR, 'summary');
  const fs = require('fs');
  
  if (!fs.existsSync(summaryDir)) {
    fs.mkdirSync(summaryDir, { recursive: true });
  }
  
  const jsonPath = path.join(summaryDir, 'latest-summary.json');
  const mdPath = path.join(summaryDir, 'latest-summary.md');
  
  fs.writeFileSync(jsonPath, JSON.stringify(summaryJson, null, 2), 'utf8');
  fs.writeFileSync(mdPath, summaryMd, 'utf8');
  
  console.log(`\n摘要已保存至:`);
  console.log(`  JSON: ${jsonPath}`);
  console.log(`  Markdown: ${mdPath}`);
  
  // 4. 输出关键指标
  console.log('\n--- 关键指标 ---');
  console.log(`qwen3 调用次数: ${summaryJson.qwen3Called}`);
  console.log(`qwen3 成功次数: ${summaryJson.qwen3Success}`);
  console.log(`qwen3 失败次数: ${summaryJson.qwen3Failure}`);
  console.log(`调用成功率: ${(summaryJson.successRate * 100).toFixed(1)}%`);
  console.log(`平均耗时: ${summaryJson.avgDurationMs.toFixed(0)}ms`);
  console.log(`高风险回复次数: ${summaryJson.riskyReplyCount}`);
  
  if (Object.keys(summaryJson.failureTypeCounts).length > 0) {
    console.log('\n--- failureType 分布 ---');
    for (const [type, count] of Object.entries(summaryJson.failureTypeCounts)) {
      console.log(`  ${type}: ${count}`);
    }
  }
  
  if (Object.keys(summaryJson.scenarioCounts).length > 0) {
    console.log('\n--- 场景分布 ---');
    for (const [scenario, count] of Object.entries(summaryJson.scenarioCounts)) {
      const rate = (summaryJson.scenarioSuccessRates[scenario] * 100).toFixed(1);
      console.log(`  ${scenario}: ${count} (成功率 ${rate}%)`);
    }
  }
  
  console.log('\n=== 分析完成 ===');
}

main();
