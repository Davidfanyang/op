#!/usr/bin/env node
/**
 * @script analyze-qwen3-vs-original
 * @status EXPERIMENTAL_MODULE
 * @line MAIN_EXPERIMENT_LINE
 * @report STAGE_REPORT_ONLY
 * @production false
 *
 * 用途：
 * 对比 qwen3 与原系统分析结果，输出：
 * - problem_type 一致率
 * - score 偏差统计
 * - 高分错判统计
 * - 风险等级对比
 *
 * 运行方式：
 * cd /Users/adime/.openclaw/workspace/trainer-core
 * node scripts/analyze-qwen3-vs-original.js
 */

const path = require('path');
const fs = require('fs');
const {
  getAllRecords,
  DEFAULT_OUTPUT_DIR
} = require('../services/local-model/qwen3-shadow-logger');

/**
 * 主分析函数
 */
function main() {
  console.log('=== Qwen3 vs Original 对比分析 ===\n');
  
  // 1. 读取所有记录
  const records = getAllRecords();
  console.log(`总 shadow 样本数: ${records.length}`);
  
  if (records.length === 0) {
    console.log('\n暂无 shadow 记录，请先运行 simulate-listener.js');
    process.exit(0);
  }
  
  // 2. 过滤有完整对比数据的记录
  // 修改：不再要求 qwen3.success，只要有 data 就可以对比
  // 因为即使 suggested_reply 有风险，评分和问题分类仍然有效
  // 但必须确保 data.score 和 data.problem_type 都存在
  const validRecords = records.filter(r => 
    r.original && r.original.analysisResult && 
    r.data && r.data.score != null && r.data.problem_type != null &&
    r.qwen3
  );
  
  console.log(`有效对比样本数: ${validRecords.length}\n`);
  
  if (validRecords.length === 0) {
    console.log('⚠️  没有完整的对比数据（original.analysisResult 或 qwen3.data 缺失）');
    process.exit(0);
  }
  
  // 3. 统计分析
  const stats = {
    total: validRecords.length,
    problemType: analyzeProblemType(validRecords),
    score: analyzeScore(validRecords),
    riskLevel: analyzeRiskLevel(validRecords),
    highScoreMisjudge: analyzeHighScoreMisjudge(validRecords)
  };
  
  // 4. 生成报告
  const summaryMd = generateSummaryMd(stats);
  const summaryJson = generateSummaryJson(stats);
  
  // 5. 保存报告
  const summaryDir = path.join(DEFAULT_OUTPUT_DIR, 'summary');
  if (!fs.existsSync(summaryDir)) {
    fs.mkdirSync(summaryDir, { recursive: true });
  }
  
  const jsonPath = path.join(summaryDir, 'qwen3-vs-original.json');
  const mdPath = path.join(summaryDir, 'qwen3-vs-original.md');
  
  fs.writeFileSync(jsonPath, JSON.stringify(summaryJson, null, 2), 'utf8');
  fs.writeFileSync(mdPath, summaryMd, 'utf8');
  
  console.log(`\n摘要已保存至:`);
  console.log(`  JSON: ${jsonPath}`);
  console.log(`  Markdown: ${mdPath}`);
  
  // 6. 输出关键指标
  console.log('\n--- 关键指标 ---');
  console.log(`problem_type 一致率: ${(stats.problemType.agreementRate * 100).toFixed(1)}%`);
  console.log(`score 平均偏差: ${stats.score.meanAbsDiff.toFixed(2)} 分`);
  console.log(`score 相关系数: ${stats.score.correlation.toFixed(3)}`);
  console.log(`risk_level 一致率: ${(stats.riskLevel.agreementRate * 100).toFixed(1)}%`);
  console.log(`高分错判次数: ${stats.highScoreMisjudge.count} / ${stats.highScoreMisjudge.total} (${(stats.highScoreMisjudge.rate * 100).toFixed(1)}%)`);
  
  console.log('\n=== 分析完成 ===');
}

/**
 * 分析 problem_type 一致率
 */
function analyzeProblemType(records) {
  let agree = 0;
  let disagree = 0;
  const confusion = {};
  
  records.forEach(r => {
    const original = r.original.analysisResult.problem_type;
    const qwen3 = r.data.problem_type;
    const key = `${original}->${qwen3}`;
    
    confusion[key] = (confusion[key] || 0) + 1;
    
    if (original === qwen3) {
      agree++;
    } else {
      disagree++;
    }
  });
  
  return {
    total: records.length,
    agree,
    disagree,
    agreementRate: agree / records.length,
    confusionMatrix: confusion
  };
}

/**
 * 分析 score 偏差
 */
function analyzeScore(records) {
  const diffs = [];
  const originalScores = [];
  const qwen3Scores = [];
  
  records.forEach(r => {
    const original = r.original.analysisResult.score;
    const qwen3 = r.data.score;
    const diff = qwen3 - original;
    
    diffs.push(diff);
    originalScores.push(original);
    qwen3Scores.push(qwen3);
  });
  
  // 计算统计指标
  const meanDiff = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  const meanAbsDiff = diffs.map(d => Math.abs(d)).reduce((a, b) => a + b, 0) / diffs.length;
  const maxDiff = Math.max(...diffs.map(d => Math.abs(d)));
  const stdDiff = Math.sqrt(diffs.map(d => Math.pow(d - meanDiff, 2)).reduce((a, b) => a + b, 0) / diffs.length);
  
  // 计算相关系数
  const correlation = calculateCorrelation(originalScores, qwen3Scores);
  
  // 分数段分布
  const scoreRanges = {
    '0-60': { original: 0, qwen3: 0 },
    '61-70': { original: 0, qwen3: 0 },
    '71-80': { original: 0, qwen3: 0 },
    '81-90': { original: 0, qwen3: 0 },
    '91-100': { original: 0, qwen3: 0 }
  };
  
  records.forEach(r => {
    const original = r.original.analysisResult.score;
    const qwen3 = r.data.score;
    
    scoreRanges[getScoreRange(original)].original++;
    scoreRanges[getScoreRange(qwen3)].qwen3++;
  });
  
  return {
    total: records.length,
    meanDiff: Math.round(meanDiff * 100) / 100,
    meanAbsDiff: Math.round(meanAbsDiff * 100) / 100,
    maxDiff,
    stdDiff: Math.round(stdDiff * 100) / 100,
    correlation: Math.round(correlation * 1000) / 1000,
    originalAvg: Math.round(originalScores.reduce((a, b) => a + b, 0) / originalScores.length * 100) / 100,
    qwen3Avg: Math.round(qwen3Scores.reduce((a, b) => a + b, 0) / qwen3Scores.length * 100) / 100,
    scoreRanges
  };
}

/**
 * 分析 risk_level 一致率
 */
function analyzeRiskLevel(records) {
  let agree = 0;
  let disagree = 0;
  const confusion = {};
  
  records.forEach(r => {
    const original = r.original.analysisResult.riskLevel;
    const qwen3 = r.qwen3.replyRisk || 'unknown';
    const key = `${original}->${qwen3}`;
    
    confusion[key] = (confusion[key] || 0) + 1;
    
    if (original === qwen3) {
      agree++;
    } else {
      disagree++;
    }
  });
  
  return {
    total: records.length,
    agree,
    disagree,
    agreementRate: agree / records.length,
    confusionMatrix: confusion
  };
}

/**
 * 分析高分错判（原系统高分但 qwen3 低分）
 */
function analyzeHighScoreMisjudge(records) {
  const HIGH_THRESHOLD = 80;
  const LOW_THRESHOLD = 70;
  
  let count = 0;
  const cases = [];
  
  records.forEach(r => {
    const original = r.original.analysisResult.score;
    const qwen3 = r.data.score;
    
    // 原系统高分（>= 80），但 qwen3 低分（< 70）
    if (original >= HIGH_THRESHOLD && qwen3 < LOW_THRESHOLD) {
      count++;
      cases.push({
        original,
        qwen3,
        diff: qwen3 - original,
        scenario: r.scenario,
        problem_type: {
          original: r.original.analysisResult.problem_type,
          qwen3: r.data.problem_type
        }
      });
    }
  });
  
  return {
    total: records.length,
    count,
    rate: count / records.length,
    cases: cases.slice(0, 10) // 最多显示 10 个案例
  };
}

/**
 * 计算皮尔逊相关系数
 */
function calculateCorrelation(x, y) {
  const n = x.length;
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((total, xi, i) => total + xi * y[i], 0);
  const sumX2 = x.reduce((total, xi) => total + xi * xi, 0);
  const sumY2 = y.reduce((total, yi) => total + yi * yi, 0);
  
  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
  
  return denominator === 0 ? 0 : numerator / denominator;
}

/**
 * 获取分数段
 */
function getScoreRange(score) {
  if (score <= 60) return '0-60';
  if (score <= 70) return '61-70';
  if (score <= 80) return '71-80';
  if (score <= 90) return '81-90';
  return '91-100';
}

/**
 * 生成 Markdown 报告
 */
function generateSummaryMd(stats) {
  return `# Qwen3 vs Original 对比分析报告

## A. 总体概览

- 分析时间：${new Date().toISOString()}
- 总样本数：${stats.total}
- 有效对比样本：${stats.total}

## B. Problem Type 一致率

- 一致数：${stats.problemType.agree}
- 不一致数：${stats.problemType.disagree}
- **一致率：${(stats.problemType.agreementRate * 100).toFixed(1)}%**

### 混淆矩阵

| 转换 | 数量 |
|------|------|
${Object.entries(stats.problemType.confusionMatrix)
  .map(([key, count]) => `| ${key} | ${count} |`)
  .join('\n')}

## C. Score 偏差分析

- 原系统平均分：${stats.score.originalAvg}
- Qwen3 平均分：${stats.score.qwen3Avg}
- 平均偏差：${stats.score.meanDiff} 分
- 平均绝对偏差：${stats.score.meanAbsDiff} 分
- 最大偏差：${stats.score.maxDiff} 分
- 偏差标准差：${stats.score.stdDiff}
- **相关系数：${stats.score.correlation}**

### 分数段分布

| 分数段 | 原系统 | Qwen3 |
|--------|--------|-------|
${Object.entries(stats.score.scoreRanges)
  .map(([range, counts]) => `| ${range} | ${counts.original} | ${counts.qwen3} |`)
  .join('\n')}

## D. Risk Level 一致率

- 一致数：${stats.riskLevel.agree}
- 不一致数：${stats.riskLevel.disagree}
- **一致率：${(stats.riskLevel.agreementRate * 100).toFixed(1)}%**

### 混淆矩阵

| 转换 | 数量 |
|------|------|
${Object.entries(stats.riskLevel.confusionMatrix)
  .map(([key, count]) => `| ${key} | ${count} |`)
  .join('\n')}

## E. 高分错判统计

- 错判次数：${stats.highScoreMisjudge.count} / ${stats.highScoreMisjudge.total}
- 错判率：${(stats.highScoreMisjudge.rate * 100).toFixed(1)}%

${stats.highScoreMisjudge.cases.length > 0 ? `
### 错判案例（Top 10）

| 场景 | 原系统分数 | Qwen3分数 | 偏差 | 原问题类型 | Qwen3问题类型 |
|------|-----------|-----------|------|-----------|--------------|
${stats.highScoreMisjudge.cases.map(c => 
  `| ${c.scenario} | ${c.original} | ${c.qwen3} | ${c.diff} | ${c.problem_type.original} | ${c.problem_type.qwen3} |`
).join('\n')}
` : ''}

## F. 结论

${generateConclusion(stats)}
`;
}

/**
 * 生成结论
 */
function generateConclusion(stats) {
  const conclusions = [];
  
  // problem_type 一致率评价
  if (stats.problemType.agreementRate >= 0.9) {
    conclusions.push('✅ problem_type 一致率极高（≥90%），qwen3 问题分类能力可靠');
  } else if (stats.problemType.agreementRate >= 0.7) {
    conclusions.push('⚠️  problem_type 一致率中等（70-90%），需要进一步优化分类逻辑');
  } else {
    conclusions.push('❌ problem_type 一致率较低（<70%），分类能力需要重大改进');
  }
  
  // score 相关性评价
  if (stats.score.correlation >= 0.8) {
    conclusions.push('✅ score 相关系数极高（≥0.8），qwen3 评分趋势与原系统高度一致');
  } else if (stats.score.correlation >= 0.6) {
    conclusions.push('⚠️  score 相关系数中等（0.6-0.8），评分趋势基本一致但有偏差');
  } else {
    conclusions.push('❌ score 相关系数较低（<0.6），评分趋势与原系统差异较大');
  }
  
  // 平均偏差评价
  if (stats.score.meanAbsDiff <= 5) {
    conclusions.push('✅ score 平均偏差极小（≤5分），评分精度高');
  } else if (stats.score.meanAbsDiff <= 10) {
    conclusions.push('⚠️  score 平均偏差中等（5-10分），评分可接受但有优化空间');
  } else {
    conclusions.push('❌ score 平均偏差较大（>10分），需要调整评分逻辑');
  }
  
  // 高分错判评价
  if (stats.highScoreMisjudge.rate <= 0.05) {
    conclusions.push('✅ 高分错判率极低（≤5%），不会出现严重误判');
  } else if (stats.highScoreMisjudge.rate <= 0.1) {
    conclusions.push('⚠️  高分错判率中等（5-10%），需要关注极端案例');
  } else {
    conclusions.push('❌ 高分错判率较高（>10%），存在严重误判风险');
  }
  
  return conclusions.join('\n');
}

/**
 * 生成 JSON 报告
 */
function generateSummaryJson(stats) {
  return {
    generatedAt: new Date().toISOString(),
    total: stats.total,
    problemType: {
      agreementRate: stats.problemType.agreementRate,
      agree: stats.problemType.agree,
      disagree: stats.problemType.disagree,
      confusionMatrix: stats.problemType.confusionMatrix
    },
    score: {
      originalAvg: stats.score.originalAvg,
      qwen3Avg: stats.score.qwen3Avg,
      meanDiff: stats.score.meanDiff,
      meanAbsDiff: stats.score.meanAbsDiff,
      maxDiff: stats.score.maxDiff,
      stdDiff: stats.score.stdDiff,
      correlation: stats.score.correlation,
      scoreRanges: stats.score.scoreRanges
    },
    riskLevel: {
      agreementRate: stats.riskLevel.agreementRate,
      agree: stats.riskLevel.agree,
      disagree: stats.riskLevel.disagree,
      confusionMatrix: stats.riskLevel.confusionMatrix
    },
    highScoreMisjudge: {
      count: stats.highScoreMisjudge.count,
      rate: stats.highScoreMisjudge.rate,
      total: stats.highScoreMisjudge.total
    }
  };
}

main();
