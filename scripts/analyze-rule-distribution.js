/**
 * 分析 rule_score 分布集中的原因
 */

const fs = require('fs');
const path = require('path');

const recordsDir = path.join(__dirname, 'output/qwen3-shadow-mode/records');
const files = fs.readdirSync(recordsDir).filter(f => f.endsWith('.json'));

const samples = [];

for (const file of files) {
  const data = JSON.parse(fs.readFileSync(path.join(recordsDir, file)));
  if (data.dualScore && data.dualScore.ruleMeta) {
    samples.push({
      file,
      original: data.original_score,
      rule: data.rule_score,
      gap: data.original_score - data.rule_score,
      issues: data.dualScore.ruleMeta.meta?.issuesCount || 0,
      missing: data.dualScore.ruleMeta.meta?.missingInfoCount || 0,
      flags: data.dualScore.ruleMeta.meta?.detectedFlags || [],
      deductions: data.dualScore.ruleMeta.deductions || [],
      additions: data.dualScore.ruleMeta.additions || [],
      base_score: data.dualScore.ruleMeta.base_score
    });
  }
}

console.log(`\n总样本数: ${samples.length}`);

// 分析 rule_score 分布
const ranges = { '0-60': 0, '61-70': 0, '71-80': 0, '81-90': 0, '91-100': 0 };
samples.forEach(s => {
  if (s.rule <= 60) ranges['0-60']++;
  else if (s.rule <= 70) ranges['61-70']++;
  else if (s.rule <= 80) ranges['71-80']++;
  else if (s.rule <= 90) ranges['81-90']++;
  else ranges['91-100']++;
});

console.log('\nrule_score 分布:');
console.log(ranges);

// 分析 61-70 区间的样本特征
const midRange = samples.filter(s => s.rule >= 61 && s.rule <= 70);
console.log(`\n61-70 区间样本数: ${midRange.length}`);

if (midRange.length > 0) {
  console.log('\n61-70 区间样本特征分析:');
  
  // 统计 flags
  const flagCounts = {};
  midRange.forEach(s => {
    s.flags.forEach(f => {
      flagCounts[f] = (flagCounts[f] || 0) + 1;
    });
  });
  console.log('\n检测标志分布:');
  console.log(flagCounts);
  
  // 统计 issues 和 missing_info
  const issuesDist = {};
  const missingDist = {};
  midRange.forEach(s => {
    issuesDist[s.issues] = (issuesDist[s.issues] || 0) + 1;
    missingDist[s.missing] = (missingDist[s.missing] || 0) + 1;
  });
  console.log('\nissues 分布:', issuesDist);
  console.log('missing_info 分布:', missingDist);
  
  // 查看前3个样本的详细信息
  console.log('\n前3个样本详情:');
  midRange.slice(0, 3).forEach((s, i) => {
    console.log(`\n样本 ${i+1}:`);
    console.log(`  original: ${s.original}, rule: ${s.rule}, gap: ${s.gap}`);
    console.log(`  issues: ${s.issues}, missing: ${s.missing}`);
    console.log(`  flags: ${s.flags.join(', ') || '无'}`);
    console.log(`  deductions: ${s.deductions.map(d => `${d.reason}(-${d.points})`).join(', ') || '无'}`);
    console.log(`  additions: ${s.additions.map(a => `${a.reason}(+${a.points})`).join(', ') || '无'}`);
  });
}

// 分析好样本（original >= 75）为什么没被拉高
const goodOriginal = samples.filter(s => s.original >= 75);
console.log(`\noriginal >= 75 的样本数: ${goodOriginal.length}`);
if (goodOriginal.length > 0) {
  console.log('\n这些样本的 rule_score:');
  goodOriginal.forEach(s => {
    console.log(`  original: ${s.original}, rule: ${s.rule}, gap: ${s.gap}, flags: ${s.flags.join(', ') || '无'}`);
  });
}

// 分析差样本（original <= 65）为什么没被压低
const badOriginal = samples.filter(s => s.original <= 65);
console.log(`\noriginal <= 65 的样本数: ${badOriginal.length}`);
if (badOriginal.length > 0) {
  console.log('\n这些样本的 rule_score:');
  badOriginal.forEach(s => {
    console.log(`  original: ${s.original}, rule: ${s.rule}, gap: ${s.gap}, flags: ${s.flags.join(', ') || '无'}`);
  });
}
