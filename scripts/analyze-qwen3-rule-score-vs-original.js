/**
 * Qwen3 规则化评分与原系统对比分析脚本
 * 
 * 对比维度：
 * A. 原系统 vs qwen 原始 score
 * B. 原系统 vs 规则化 rule_score
 * C. qwen 原始 score vs rule_score
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

const RECORDS_DIR = path.join(__dirname, 'output/qwen3-shadow-mode/records');
const OUTPUT_DIR = path.join(__dirname, 'output/qwen3-shadow-mode/summary');

// ========================
// 工具函数
// ========================

function getAllRecords() {
  const records = [];
  
  // 读取所有日期的记录文件
  const dateDirs = fs.readdirSync(RECORDS_DIR).filter(f => 
    fs.statSync(path.join(RECORDS_DIR, f)).isDirectory()
  );
  
  dateDirs.forEach(dateDir => {
    const dirPath = path.join(RECORDS_DIR, dateDir);
    const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.json'));
    
    files.forEach(file => {
      const filePath = path.join(dirPath, file);
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const record = JSON.parse(content);
        records.push(record);
      } catch (error) {
        console.error(`Error reading ${filePath}: ${error.message}`);
      }
    });
  });
  
  return records;
}

function pearsonCorrelation(x, y) {
  const n = x.length;
  if (n !== y.length || n === 0) return NaN;
  
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((total, xi, i) => total + xi * y[i], 0);
  const sumX2 = x.reduce((total, xi) => total + xi * xi, 0);
  const sumY2 = y.reduce((total, yi) => total + yi * yi, 0);
  
  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
  
  if (denominator === 0) return NaN;
  return numerator / denominator;
}

// ========================
// 主逻辑
// ========================

function runAnalysis() {
  console.log('========================================');
  console.log('Qwen3 规则化评分对比分析');
  console.log('========================================\n');
  
  // 1. 读取所有记录
  const allRecords = getAllRecords();
  console.log(`总共读取 ${allRecords.length} 条记录\n`);
  
  if (allRecords.length === 0) {
    console.error('没有记录可供分析');
    process.exit(1);
  }
  
  // 2. 过滤有完整对比数据的记录
  // 必须同时有：original.analysisResult、data.score、ruleScore.rule_score
  const validRecords = allRecords.filter(r => 
    r.original && r.original.analysisResult && 
    r.data && r.data.score != null && r.data.problem_type != null &&
    r.ruleScore && r.ruleScore.rule_score != null
  );
  
  console.log(`有效对比记录: ${validRecords.length} / ${allRecords.length}\n`);
  
  if (validRecords.length < 10) {
    console.error('有效记录太少，无法进行有意义的对比分析');
    process.exit(1);
  }
  
  // 3. 提取数据
  const originalScores = validRecords.map(r => r.original.analysisResult.score);
  const qwenRawScores = validRecords.map(r => r.data.score);
  const ruleScores = validRecords.map(r => r.ruleScore.rule_score);
  
  const originalProblemTypes = validRecords.map(r => r.original.analysisResult.problem_type);
  const qwenProblemTypes = validRecords.map(r => r.data.problem_type);
  
  // 4. 计算 problem_type 一致率
  let problemTypeAgree = 0;
  let problemTypeDisagree = 0;
  const confusionMatrix = {};
  
  validRecords.forEach((r, i) => {
    const original = originalProblemTypes[i];
    const qwen = qwenProblemTypes[i];
    const key = `${original}->${qwen}`;
    
    if (!confusionMatrix[key]) {
      confusionMatrix[key] = 0;
    }
    confusionMatrix[key]++;
    
    if (original === qwen) {
      problemTypeAgree++;
    } else {
      problemTypeDisagree++;
    }
  });
  
  const problemTypeAgreementRate = problemTypeAgree / validRecords.length;
  
  console.log('【Problem Type 一致率】');
  console.log(`  一致: ${problemTypeAgree}`);
  console.log(`  不一致: ${problemTypeDisagree}`);
  console.log(`  一致率: ${(problemTypeAgreementRate * 100).toFixed(1)}%\n`);
  console.log('混淆矩阵:', JSON.stringify(confusionMatrix, null, 2));
  console.log('');
  
  // 5. 计算分数统计 - A. 原系统 vs qwen 原始 score
  const qwenRawDiffs = originalScores.map((orig, i) => Math.abs(orig - qwenRawScores[i]));
  const qwenRawMeanDiff = qwenRawDiffs.reduce((a, b) => a + b, 0) / qwenRawDiffs.length;
  const qwenRawCorrelation = pearsonCorrelation(originalScores, qwenRawScores);
  
  console.log('【A. 原系统 vs Qwen 原始 Score】');
  console.log(`  原系统平均分: ${(originalScores.reduce((a, b) => a + b, 0) / originalScores.length).toFixed(2)}`);
  console.log(`  Qwen 原始平均分: ${(qwenRawScores.reduce((a, b) => a + b, 0) / qwenRawScores.length).toFixed(2)}`);
  console.log(`  平均绝对偏差: ${qwenRawMeanDiff.toFixed(2)} 分`);
  console.log(`  相关系数: ${qwenRawCorrelation.toFixed(3)}\n`);
  
  // 6. 计算分数统计 - B. 原系统 vs 规则化 rule_score
  const ruleDiffs = originalScores.map((orig, i) => Math.abs(orig - ruleScores[i]));
  const ruleMeanDiff = ruleDiffs.reduce((a, b) => a + b, 0) / ruleDiffs.length;
  const ruleCorrelation = pearsonCorrelation(originalScores, ruleScores);
  
  console.log('【B. 原系统 vs 规则化 Rule Score】');
  console.log(`  原系统平均分: ${(originalScores.reduce((a, b) => a + b, 0) / originalScores.length).toFixed(2)}`);
  console.log(`  规则化平均分: ${(ruleScores.reduce((a, b) => a + b, 0) / ruleScores.length).toFixed(2)}`);
  console.log(`  平均绝对偏差: ${ruleMeanDiff.toFixed(2)} 分`);
  console.log(`  相关系数: ${ruleCorrelation.toFixed(3)}\n`);
  
  // 7. 计算分数统计 - C. qwen 原始 vs rule_score
  const qwenVsRuleDiffs = qwenRawScores.map((qwen, i) => Math.abs(qwen - ruleScores[i]));
  const qwenVsRuleMeanDiff = qwenVsRuleDiffs.reduce((a, b) => a + b, 0) / qwenVsRuleDiffs.length;
  const qwenVsRuleCorrelation = pearsonCorrelation(qwenRawScores, ruleScores);
  
  console.log('【C. Qwen 原始 Score vs 规则化 Rule Score】');
  console.log(`  Qwen 原始平均分: ${(qwenRawScores.reduce((a, b) => a + b, 0) / qwenRawScores.length).toFixed(2)}`);
  console.log(`  规则化平均分: ${(ruleScores.reduce((a, b) => a + b, 0) / ruleScores.length).toFixed(2)}`);
  console.log(`  平均绝对偏差: ${qwenVsRuleMeanDiff.toFixed(2)} 分`);
  console.log(`  相关系数: ${qwenVsRuleCorrelation.toFixed(3)}\n`);
  
  // 8. 计算高分错判率（原系统 >= 80 但 rule_score < 70）
  let highScoreMisjudgeCount = 0;
  let highScoreTotal = 0;
  
  validRecords.forEach((r, i) => {
    if (originalScores[i] >= 80) {
      highScoreTotal++;
      if (ruleScores[i] < 70) {
        highScoreMisjudgeCount++;
      }
    }
  });
  
  const highScoreMisjudgeRate = highScoreTotal > 0 ? highScoreMisjudgeCount / highScoreTotal : 0;
  
  console.log('【高分错判率】（原系统 >= 80 但 Rule Score < 70）');
  console.log(`  原系统高分总数: ${highScoreTotal}`);
  console.log(`  错判数量: ${highScoreMisjudgeCount}`);
  console.log(`  错判率: ${(highScoreMisjudgeRate * 100).toFixed(1)}%\n`);
  
  // 9. 分数分布对比
  const scoreRanges = {
    '0-60': { original: 0, qwen: 0, rule: 0 },
    '61-70': { original: 0, qwen: 0, rule: 0 },
    '71-80': { original: 0, qwen: 0, rule: 0 },
    '81-90': { original: 0, qwen: 0, rule: 0 },
    '91-100': { original: 0, qwen: 0, rule: 0 }
  };
  
  validRecords.forEach((r, i) => {
    function getRange(score) {
      if (score <= 60) return '0-60';
      if (score <= 70) return '61-70';
      if (score <= 80) return '71-80';
      if (score <= 90) return '81-90';
      return '91-100';
    }
    
    scoreRanges[getRange(originalScores[i])].original++;
    scoreRanges[getRange(qwenRawScores[i])].qwen++;
    scoreRanges[getRange(ruleScores[i])].rule++;
  });
  
  console.log('【分数分布对比】');
  console.log('分数范围\t原系统\tQwen原始\t规则化');
  Object.entries(scoreRanges).forEach(([range, counts]) => {
    console.log(`${range}\t\t${counts.original}\t\t${counts.qwen}\t\t${counts.rule}`);
  });
  console.log('');
  
  // 10. 生成总结
  const summary = {
    total: validRecords.length,
    problemType: {
      agreementRate: problemTypeAgreementRate,
      agree: problemTypeAgree,
      disagree: problemTypeDisagree,
      confusionMatrix: confusionMatrix
    },
    qwenRawScore: {
      originalAvg: originalScores.reduce((a, b) => a + b, 0) / originalScores.length,
      qwenAvg: qwenRawScores.reduce((a, b) => a + b, 0) / qwenRawScores.length,
      meanDiff: qwenRawScores.reduce((a, b) => a + b, 0) / qwenRawScores.length - originalScores.reduce((a, b) => a + b, 0) / originalScores.length,
      meanAbsDiff: qwenRawMeanDiff,
      maxDiff: Math.max(...qwenRawDiffs),
      stdDiff: Math.sqrt(qwenRawDiffs.reduce((sq, d) => sq + Math.pow(d - qwenRawMeanDiff, 2), 0) / qwenRawDiffs.length),
      correlation: qwenRawCorrelation
    },
    ruleScore: {
      originalAvg: originalScores.reduce((a, b) => a + b, 0) / originalScores.length,
      ruleAvg: ruleScores.reduce((a, b) => a + b, 0) / ruleScores.length,
      meanDiff: ruleScores.reduce((a, b) => a + b, 0) / ruleScores.length - originalScores.reduce((a, b) => a + b, 0) / originalScores.length,
      meanAbsDiff: ruleMeanDiff,
      maxDiff: Math.max(...ruleDiffs),
      stdDiff: Math.sqrt(ruleDiffs.reduce((sq, d) => sq + Math.pow(d - ruleMeanDiff, 2), 0) / ruleDiffs.length),
      correlation: ruleCorrelation
    },
    qwenVsRule: {
      meanDiff: qwenVsRuleMeanDiff,
      correlation: qwenVsRuleCorrelation
    },
    highScoreMisjudge: {
      count: highScoreMisjudgeCount,
      rate: highScoreMisjudgeRate,
      total: highScoreTotal
    },
    scoreRanges: scoreRanges
  };
  
  // 11. 输出结果
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  
  // JSON 输出
  const jsonPath = path.join(OUTPUT_DIR, 'qwen3-rule-score-vs-original.json');
  fs.writeFileSync(jsonPath, JSON.stringify(summary, null, 2));
  console.log(`JSON 报告已保存: ${jsonPath}\n`);
  
  // Markdown 输出
  const mdPath = path.join(OUTPUT_DIR, 'qwen3-rule-score-vs-original.md');
  const mdContent = `# Qwen3 规则化评分对比分析报告

## 概要

- **对比时间**: ${new Date().toISOString()}
- **总样本数**: ${validRecords.length}

## 核心指标

### Problem Type 一致率

- **一致率**: ${(summary.problemType.agreementRate * 100).toFixed(1)}% (${summary.problemType.agree}/${validRecords.length})
- **混淆矩阵**: ${JSON.stringify(summary.problemType.confusionMatrix)}

### 评分对比

| 对比维度 | 平均绝对偏差 | 相关系数 | 平均分差异 |
|---------|------------|---------|-----------|
| 原系统 vs Qwen原始 | ${summary.qwenRawScore.meanAbsDiff.toFixed(2)} | ${summary.qwenRawScore.correlation.toFixed(3)} | ${summary.qwenRawScore.meanDiff.toFixed(2)} |
| **原系统 vs 规则化** | **${summary.ruleScore.meanAbsDiff.toFixed(2)}** | **${summary.ruleScore.correlation.toFixed(3)}** | **${summary.ruleScore.meanDiff.toFixed(2)}** |
| Qwen原始 vs 规则化 | ${summary.qwenVsRule.meanDiff.toFixed(2)} | ${summary.qwenVsRule.correlation.toFixed(3)} | - |

### 高分错判率

- **错判数量**: ${summary.highScoreMisjudge.count}/${summary.highScoreMisjudge.total}
- **错判率**: ${(summary.highScoreMisjudge.rate * 100).toFixed(1)}%

## 分数分布

| 分数范围 | 原系统 | Qwen原始 | 规则化 |
|---------|-------|---------|-------|
${Object.entries(summary.scoreRanges).map(([range, counts]) => 
  `| ${range} | ${counts.original} | ${counts.qwen} | ${counts.rule} |`
).join('\n')}

## 验收标准

| 指标 | 标准 | 实际 | 状态 |
|-----|------|------|------|
| problem_type 一致率 | ≥90% | ${(summary.problemType.agreementRate * 100).toFixed(1)}% | ${summary.problemType.agreementRate >= 0.9 ? '✅' : '❌'} |
| rule_score 平均绝对偏差 | ≤12 | ${summary.ruleScore.meanAbsDiff.toFixed(2)} | ${summary.ruleScore.meanAbsDiff <= 12 ? '✅' : '❌'} |
| rule_score 相关系数 | ≥0.75 | ${summary.ruleScore.correlation.toFixed(3)} | ${summary.ruleScore.correlation >= 0.75 ? '✅' : '❌'} |
| 高分错判率 | ≤5% | ${(summary.highScoreMisjudge.rate * 100).toFixed(1)}% | ${summary.highScoreMisjudge.rate <= 0.05 ? '✅' : '❌'} |

## 结论

${summary.problemType.agreementRate >= 0.9 && summary.ruleScore.meanAbsDiff <= 12 && summary.ruleScore.correlation >= 0.75 && summary.highScoreMisjudge.rate <= 0.05
  ? '✅ **规则化评分通过**，可作为候选评分链路继续观察'
  : '❌ **规则化评分不通过**，暂不进入评分链路'}
`;
  
  fs.writeFileSync(mdPath, mdContent);
  console.log(`Markdown 报告已保存: ${mdPath}\n`);
  
  // 12. 输出最终结论
  console.log('========================================');
  console.log('最终结论');
  console.log('========================================');
  
  const passed = summary.problemType.agreementRate >= 0.9 && 
                 summary.ruleScore.meanAbsDiff <= 12 && 
                 summary.ruleScore.correlation >= 0.75 && 
                 summary.highScoreMisjudge.rate <= 0.05;
  
  if (passed) {
    console.log('✅ 规则化评分通过，可作为候选评分链路继续观察\n');
  } else {
    console.log('❌ 规则化评分不通过，暂不进入评分链路\n');
    
    console.log('未达标项：');
    if (summary.problemType.agreementRate < 0.9) {
      console.log(`  - problem_type 一致率: ${(summary.problemType.agreementRate * 100).toFixed(1)}% (要求 ≥90%)`);
    }
    if (summary.ruleScore.meanAbsDiff > 12) {
      console.log(`  - rule_score 平均绝对偏差: ${summary.ruleScore.meanAbsDiff.toFixed(2)} (要求 ≤12)`);
    }
    if (summary.ruleScore.correlation < 0.75) {
      console.log(`  - rule_score 相关系数: ${summary.ruleScore.correlation.toFixed(3)} (要求 ≥0.75)`);
    }
    if (summary.highScoreMisjudge.rate > 0.05) {
      console.log(`  - 高分错判率: ${(summary.highScoreMisjudge.rate * 100).toFixed(1)}% (要求 ≤5%)`);
    }
    console.log('');
  }
}

// 运行分析
runAnalysis();
