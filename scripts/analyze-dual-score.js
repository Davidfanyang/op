#!/usr/bin/env node
/**
 * 双轨评分分析脚本
 * 
 * 职责：
 * 1. 读取 shadow 记录
 * 2. 分析 original_score vs rule_score 差异
 * 3. 输出偏差分布、高风险分歧、平均偏差、相关系数
 * 
 * @author Qoder
 * @date 2026-04-22
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ========================
// 配置
// ========================

const SHADOW_OUTPUT_DIR = path.join(__dirname, 'output', 'qwen3-shadow-mode');
const RECORDS_DIR = path.join(SHADOW_OUTPUT_DIR, 'records');
const SUMMARY_DIR = path.join(SHADOW_OUTPUT_DIR, 'summary');

// ========================
// 工具函数
// ========================

/**
 * 读取所有 shadow 记录
 */
function loadAllRecords() {
  const allRecords = [];
  
  // 读取所有日期目录
  if (!fs.existsSync(RECORDS_DIR)) {
    console.error(`记录目录不存在: ${RECORDS_DIR}`);
    return [];
  }
  
  const dateDirs = fs.readdirSync(RECORDS_DIR).filter(d => 
    fs.statSync(path.join(RECORDS_DIR, d)).isDirectory()
  );
  
  for (const dateDir of dateDirs) {
    const datePath = path.join(RECORDS_DIR, dateDir);
    const files = fs.readdirSync(datePath).filter(f => f.endsWith('.json'));
    
    for (const file of files) {
      const filePath = path.join(datePath, file);
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const record = JSON.parse(content);
        allRecords.push(record);
      } catch (error) {
        console.error(`读取文件失败 ${filePath}:`, error.message);
      }
    }
  }
  
  return allRecords;
}

/**
 * 计算皮尔逊相关系数
 */
function pearsonCorrelation(x, y) {
  const n = x.length;
  if (n !== y.length || n === 0) return 0;
  
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
  const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
  const sumY2 = y.reduce((sum, yi) => sum + yi * yi, 0);
  
  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
  
  if (denominator === 0) return 0;
  return numerator / denominator;
}

// ========================
// 核心分析函数
// ========================

/**
 * 分析双轨评分
 */
function analyzeDualScore(records) {
  console.log('========================================');
  console.log('双轨评分分析');
  console.log('========================================\n');
  
  // 过滤有 dualScore 的记录
  const validRecords = records.filter(r => 
    r.dualScore && 
    r.dualScore.original_score != null && 
    r.dualScore.rule_score != null
  );
  
  console.log(`总共读取 ${records.length} 条记录`);
  console.log(`有效双轨记录: ${validRecords.length} / ${records.length}\n`);
  
  if (validRecords.length === 0) {
    console.error('❌ 没有有效的双轨记录');
    return null;
  }
  
  // 提取分数
  const originalScores = validRecords.map(r => r.dualScore.original_score);
  const ruleScores = validRecords.map(r => r.dualScore.rule_score);
  const qwenRawScores = validRecords.map(r => r.dualScore.qwen_raw_score);
  const gaps = validRecords.map(r => r.dualScore.score_gap_rule);
  const absGaps = gaps.map(g => Math.abs(g));
  
  // ========================
  // 1. 偏差分布
  // ========================
  console.log('【1. 偏差分布】(|rule - original|)');
  console.log('-'.repeat(50));
  
  const gapDistribution = {
    '≤5': absGaps.filter(g => g <= 5).length,
    '≤10': absGaps.filter(g => g > 5 && g <= 10).length,
    '≤20': absGaps.filter(g => g > 10 && g <= 20).length,
    '>20': absGaps.filter(g => g > 20).length
  };
  
  console.log('偏差范围        数量    占比');
  console.log(`≤5分            ${String(gapDistribution['≤5']).padStart(4)}      ${(gapDistribution['≤5'] / validRecords.length * 100).toFixed(1)}%`);
  console.log(`6-10分          ${String(gapDistribution['≤10']).padStart(4)}      ${(gapDistribution['≤10'] / validRecords.length * 100).toFixed(1)}%`);
  console.log(`11-20分         ${String(gapDistribution['≤20']).padStart(4)}      ${(gapDistribution['≤20'] / validRecords.length * 100).toFixed(1)}%`);
  console.log(`>20分           ${String(gapDistribution['>20']).padStart(4)}      ${(gapDistribution['>20'] / validRecords.length * 100).toFixed(1)}%`);
  console.log();
  
  // ========================
  // 2. 高风险分歧样本
  // ========================
  console.log('【2. 高风险分歧】(TOP 10)');
  console.log('-'.repeat(50));
  console.log('筛选条件: original >= 80 && rule < 60 或 original <= 60 && rule >= 80\n');
  
  const highRiskSamples = validRecords.filter(r => {
    const orig = r.dualScore.original_score;
    const rule = r.dualScore.rule_score;
    return (orig >= 80 && rule < 60) || (orig <= 60 && rule >= 80);
  });
  
  console.log(`高风险分歧样本数: ${highRiskSamples.length} / ${validRecords.length}`);
  console.log(`高风险分歧率: ${(highRiskSamples.length / validRecords.length * 100).toFixed(1)}%\n`);
  
  // 按偏差绝对值排序，取 TOP 10
  const topHighRisk = highRiskSamples
    .sort((a, b) => Math.abs(b.dualScore.score_gap_rule) - Math.abs(a.dualScore.score_gap_rule))
    .slice(0, 10);
  
  if (topHighRisk.length > 0) {
    console.log('TOP 10 高风险分歧样本:');
    console.log('序号    原系统分    规则分    差值    Qwen原始分');
    console.log('-'.repeat(60));
    topHighRisk.forEach((r, idx) => {
      const ds = r.dualScore;
      console.log(`${String(idx + 1).padStart(4)}      ${String(ds.original_score).padStart(7)}    ${String(ds.rule_score).padStart(6)}    ${String(ds.score_gap_rule > 0 ? '+' : '') + ds.score_gap_rule}      ${ds.qwen_raw_score ?? 'N/A'}`);
    });
    console.log();
  } else {
    console.log('✅ 未发现高风险分歧样本\n');
  }
  
  // ========================
  // 3. 平均偏差
  // ========================
  console.log('【3. 平均偏差】');
  console.log('-'.repeat(50));
  
  const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  const avgAbsGap = absGaps.reduce((a, b) => a + b, 0) / absGaps.length;
  const maxGap = Math.max(...absGaps);
  const minGap = Math.min(...absGaps);
  
  console.log(`平均偏差 (mean gap):        ${avgGap.toFixed(2)} 分`);
  console.log(`平均绝对偏差 (mean |gap|):  ${avgAbsGap.toFixed(2)} 分`);
  console.log(`最大偏差:                   ${maxGap} 分`);
  console.log(`最小偏差:                   ${minGap} 分`);
  console.log();
  
  // ========================
  // 4. 相关系数
  // ========================
  console.log('【4. 相关系数】');
  console.log('-'.repeat(50));
  
  const correlation = pearsonCorrelation(originalScores, ruleScores);
  console.log(`corr(rule_score, original_score): ${correlation.toFixed(3)}`);
  console.log();
  
  // ========================
  // 5. 分数分布对比
  // ========================
  console.log('【5. 分数分布对比】');
  console.log('-'.repeat(50));
  
  const ranges = ['0-60', '61-70', '71-80', '81-90', '91-100'];
  const rangeCounts = { original: {}, rule: {}, qwenRaw: {} };
  
  ranges.forEach(range => {
    const [min, max] = range.split('-').map(Number);
    rangeCounts.original[range] = originalScores.filter(s => s >= min && s <= max).length;
    rangeCounts.rule[range] = ruleScores.filter(s => s >= min && s <= max).length;
    rangeCounts.qwenRaw[range] = qwenRawScores.filter(s => s != null && s >= min && s <= max).length;
  });
  
  console.log('分数范围        原系统    规则化    Qwen原始');
  ranges.forEach(range => {
    console.log(`${range.padEnd(12)}  ${String(rangeCounts.original[range]).padStart(6)}      ${String(rangeCounts.rule[range]).padStart(6)}      ${String(rangeCounts.qwenRaw[range]).padStart(6)}`);
  });
  console.log();
  
  // ========================
  // 6. 验收标准
  // ========================
  console.log('【6. 验收标准】');
  console.log('-'.repeat(50));
  
  const metrics = {
    '样本数': { value: validRecords.length, target: '≥50', pass: validRecords.length >= 50 },
    'avg |gap|': { value: avgAbsGap.toFixed(2), target: '≤12', pass: avgAbsGap <= 12 },
    'correlation': { value: correlation.toFixed(3), target: '≥0.75', pass: correlation >= 0.75 },
    '高风险分歧率': { value: (highRiskSamples.length / validRecords.length * 100).toFixed(1) + '%', target: '≤5%', pass: highRiskSamples.length / validRecords.length <= 0.05 }
  };
  
  console.log('指标            实际值        目标        状态');
  console.log('-'.repeat(60));
  Object.entries(metrics).forEach(([name, { value, target, pass }]) => {
    const status = pass ? '✅' : '❌';
    console.log(`${name.padEnd(12)}  ${String(value).padStart(10)}      ${target.padStart(8)}    ${status}`);
  });
  console.log();
  
  // ========================
  // 最终结论
  // ========================
  console.log('========================================');
  console.log('最终结论');
  console.log('========================================');
  
  const allPassed = Object.values(metrics).every(m => m.pass);
  
  if (allPassed) {
    console.log('✅ 双轨评分达标，可以进入小流量灰度评分融合');
  } else {
    const failedMetrics = Object.entries(metrics)
      .filter(([, m]) => !m.pass)
      .map(([name]) => name);
    console.log('❌ 双轨评分未达标，继续调规则（不是调 prompt）');
    console.log('\n未达标项：');
    failedMetrics.forEach(name => {
      const m = metrics[name];
      console.log(`  - ${name}: ${m.value} (要求 ${m.target})`);
    });
  }
  
  // ========================
  // 保存报告
  // ========================
  const report = {
    timestamp: new Date().toISOString(),
    total: records.length,
    valid: validRecords.length,
    gapDistribution,
    highRiskSamples: {
      count: highRiskSamples.length,
      rate: highRiskSamples.length / validRecords.length,
      top10: topHighRisk.map(r => ({
        original_score: r.dualScore.original_score,
        rule_score: r.dualScore.rule_score,
        score_gap_rule: r.dualScore.score_gap_rule,
        qwen_raw_score: r.dualScore.qwen_raw_score
      }))
    },
    avgGap: avgGap,
    avgAbsGap: avgAbsGap,
    maxGap: maxGap,
    minGap: minGap,
    correlation: correlation,
    scoreRanges: rangeCounts,
    metrics: Object.fromEntries(
      Object.entries(metrics).map(([name, m]) => [name, { value: m.value, pass: m.pass }])
    )
  };
  
  // 保存 JSON 报告
  const jsonPath = path.join(SUMMARY_DIR, 'dual-score-analysis.json');
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  console.log(`\nJSON 报告已保存: ${jsonPath}`);
  
  // 保存 Markdown 报告
  const mdContent = generateMarkdownReport(report);
  const mdPath = path.join(SUMMARY_DIR, 'dual-score-analysis.md');
  fs.writeFileSync(mdPath, mdContent);
  console.log(`Markdown 报告已保存: ${mdPath}`);
  
  return report;
}

/**
 * 生成 Markdown 报告
 */
function generateMarkdownReport(report) {
  return `# 双轨评分分析报告

## 概要

- **分析时间**: ${report.timestamp}
- **总样本数**: ${report.total}
- **有效双轨记录**: ${report.valid}

## 偏差分布

| 偏差范围 | 数量 | 占比 |
|---------|------|------|
| ≤5分 | ${report.gapDistribution['≤5']} | ${(report.gapDistribution['≤5'] / report.valid * 100).toFixed(1)}% |
| 6-10分 | ${report.gapDistribution['≤10']} | ${(report.gapDistribution['≤10'] / report.valid * 100).toFixed(1)}% |
| 11-20分 | ${report.gapDistribution['≤20']} | ${(report.gapDistribution['≤20'] / report.valid * 100).toFixed(1)}% |
| >20分 | ${report.gapDistribution['>20']} | ${(report.gapDistribution['>20'] / report.valid * 100).toFixed(1)}% |

## 高风险分歧

- **样本数**: ${report.highRiskSamples.count} / ${report.valid}
- **分歧率**: ${(report.highRiskSamples.rate * 100).toFixed(1)}%

${report.highRiskSamples.top10.length > 0 ? `
### TOP 10 高风险分歧

| 序号 | 原系统分 | 规则分 | 差值 | Qwen原始分 |
|------|---------|-------|------|-----------|
${report.highRiskSamples.top10.map((s, i) => `| ${i + 1} | ${s.original_score} | ${s.rule_score} | ${s.score_gap_rule > 0 ? '+' : ''}${s.score_gap_rule} | ${s.qwen_raw_score ?? 'N/A'} |`).join('\n')}
` : '✅ 未发现高风险分歧样本'}

## 平均偏差

- **平均偏差 (mean gap)**: ${report.avgGap.toFixed(2)} 分
- **平均绝对偏差 (mean |gap|)**: ${report.avgAbsGap.toFixed(2)} 分
- **最大偏差**: ${report.maxGap} 分
- **最小偏差**: ${report.minGap} 分

## 相关系数

- **corr(rule_score, original_score)**: ${report.correlation.toFixed(3)}

## 分数分布对比

| 分数范围 | 原系统 | 规则化 | Qwen原始 |
|---------|-------|-------|---------|
${Object.entries(report.scoreRanges.original).map(([range, count]) => `| ${range} | ${count} | ${report.scoreRanges.rule[range]} | ${report.scoreRanges.qwenRaw[range]} |`).join('\n')}

## 验收标准

| 指标 | 实际值 | 目标 | 状态 |
|-----|-------|------|------|
| 样本数 | ${report.valid} | ≥50 | ${report.metrics['样本数'].pass ? '✅' : '❌'} |
| avg |gap| | ${report.metrics['avg |gap|'].value} | ≤12 | ${report.metrics['avg |gap|'].pass ? '✅' : '❌'} |
| correlation | ${report.metrics['correlation'].value} | ≥0.75 | ${report.metrics['correlation'].pass ? '✅' : '❌'} |
| 高风险分歧率 | ${report.metrics['高风险分歧率'].value} | ≤5% | ${report.metrics['高风险分歧率'].pass ? '✅' : '❌'} |

## 结论

${Object.values(report.metrics).every(m => m.pass) ? '✅ **双轨评分达标**，可以进入小流量灰度评分融合' : '❌ **双轨评分未达标**，继续调规则（不是调 prompt）'}
`;
}

// ========================
// 主函数
// ========================

function main() {
  try {
    const records = loadAllRecords();
    const report = analyzeDualScore(records);
    
    if (!report) {
      process.exit(1);
    }
  } catch (error) {
    console.error('分析失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
