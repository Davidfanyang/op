#!/usr/bin/env node
/**
 * @status EXPERIMENTAL_MODULE
 * @line MAIN_EXPERIMENT_LINE
 * @stage CURRENT_STAGE_TARGET
 * @production false
 * @scope qwen3 local experiment only
 */

/**
 * Qwen3 Shadow Mode Logger - 影子模式日志记录器
 * 
 * 职责：
 * 1. 将每次 shadow 结果保存到本地目录
 * 2. 按日期组织记录文件
 * 3. 生成最新统计摘要（summary.json / summary.md）
 * 4. 支持查询历史 shadow 记录
 * 
 * 设计原则：
 * - 只记录，不参与业务决策
 * - 失败不影响主流程
 * - 结构化存储，便于后续分析
 */

const fs = require('fs');
const path = require('path');

// 默认输出目录
const DEFAULT_OUTPUT_DIR = path.join(
  __dirname,
  '../../scripts/output/qwen3-shadow-mode'
);

// 记录计数器（用于生成文件名）
let recordCounter = 0;

/**
 * 确保目录存在
 */
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * 获取今日记录目录
 */
function getTodayRecordsDir(baseDir) {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return path.join(baseDir, 'records', today);
}

/**
 * 获取摘要目录
 */
function getSummaryDir(baseDir) {
  return path.join(baseDir, 'summary');
}

/**
 * 生成记录文件名
 */
function generateRecordFileName() {
  recordCounter++;
  const timestamp = Date.now();
  return `shadow-${String(recordCounter).padStart(3, '0')}-${timestamp}.json`;
}

/**
 * 保存单条 shadow 记录
 * 
 * @param {Object} shadowRecord - shadow 记录对象
 * @param {string} baseDir - 基础输出目录
 * @returns {string} 保存的文件路径
 */
function saveShadowRecord(shadowRecord, baseDir = DEFAULT_OUTPUT_DIR) {
  try {
    const todayDir = getTodayRecordsDir(baseDir);
    ensureDir(todayDir);
    
    const fileName = generateRecordFileName();
    const filePath = path.join(todayDir, fileName);
    
    fs.writeFileSync(filePath, JSON.stringify(shadowRecord, null, 2), 'utf8');
    
    return filePath;
  } catch (error) {
    // logger 异常不抛出，仅记录到控制台
    console.error('[Qwen3ShadowLogger] Failed to save record:', error.message);
    return null;
  }
}

/**
 * 读取今日所有 shadow 记录
 */
function getTodayRecords(baseDir = DEFAULT_OUTPUT_DIR) {
  try {
    const todayDir = getTodayRecordsDir(baseDir);
    if (!fs.existsSync(todayDir)) {
      return [];
    }
    
    const files = fs.readdirSync(todayDir).filter(f => f.endsWith('.json'));
    const records = [];
    
    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(todayDir, file), 'utf8');
        records.push(JSON.parse(content));
      } catch (error) {
        console.error(`[Qwen3ShadowLogger] Failed to read ${file}:`, error.message);
      }
    }
    
    return records;
  } catch (error) {
    console.error('[Qwen3ShadowLogger] Failed to get today records:', error.message);
    return [];
  }
}

/**
 * 读取所有历史 shadow 记录
 */
function getAllRecords(baseDir = DEFAULT_OUTPUT_DIR) {
  try {
    const recordsDir = path.join(baseDir, 'records');
    if (!fs.existsSync(recordsDir)) {
      return [];
    }
    
    const dates = fs.readdirSync(recordsDir).filter(d => {
      const datePath = path.join(recordsDir, d);
      return fs.statSync(datePath).isDirectory();
    });
    
    const records = [];
    
    for (const date of dates) {
      const dateDir = path.join(recordsDir, date);
      const files = fs.readdirSync(dateDir).filter(f => f.endsWith('.json'));
      
      for (const file of files) {
        try {
          const content = fs.readFileSync(path.join(dateDir, file), 'utf8');
          records.push(JSON.parse(content));
        } catch (error) {
          console.error(`[Qwen3ShadowLogger] Failed to read ${date}/${file}:`, error.message);
        }
      }
    }
    
    return records;
  } catch (error) {
    console.error('[Qwen3ShadowLogger] Failed to get all records:', error.message);
    return [];
  }
}

/**
 * 统计分析 shadow 记录
 */
function analyzeRecords(records) {
  const total = records.length;
  if (total === 0) {
    return {
      total: 0,
      message: 'No shadow records found'
    };
  }
  
  // 基础统计
  let qwen3Called = 0;
  let qwen3Success = 0;
  let qwen3Failure = 0;
  let totalDuration = 0;
  let riskyReplyCount = 0;
  
  // 失败类型分布
  const failureTypeCounts = {};
  
  // 场景分布
  const scenarioCounts = {};
  const scenarioSuccessCounts = {};
  
  // 日期范围
  let earliestDate = null;
  let latestDate = null;
  
  for (const record of records) {
    // 日期范围
    const timestamp = record.timestamp;
    if (timestamp) {
      if (!earliestDate || timestamp < earliestDate) earliestDate = timestamp;
      if (!latestDate || timestamp > latestDate) latestDate = timestamp;
    }
    
    // qwen3 调用统计
    if (record.qwen3 && record.qwen3.called) {
      qwen3Called++;
      
      if (record.qwen3.success) {
        qwen3Success++;
      } else {
        qwen3Failure++;
      }
      
      // 耗时统计
      if (record.qwen3.durationMs) {
        totalDuration += record.qwen3.durationMs;
      }
      
      // 失败类型
      if (record.qwen3.failureType) {
        const ft = record.qwen3.failureType;
        failureTypeCounts[ft] = (failureTypeCounts[ft] || 0) + 1;
      }
      
      // 风险回复
      if (record.qwen3.replyRisk === 'risky_reply_detected') {
        riskyReplyCount++;
      }
    }
    
    // 场景统计
    const scenario = record.scenario || 'unknown';
    scenarioCounts[scenario] = (scenarioCounts[scenario] || 0) + 1;
    
    if (record.qwen3 && record.qwen3.success) {
      scenarioSuccessCounts[scenario] = (scenarioSuccessCounts[scenario] || 0) + 1;
    }
  }
  
  // 计算成功率
  const successRate = qwen3Called > 0 ? qwen3Success / qwen3Called : 0;
  const avgDuration = qwen3Called > 0 ? totalDuration / qwen3Called : 0;
  
  // 计算各场景成功率
  const scenarioSuccessRates = {};
  for (const scenario of Object.keys(scenarioCounts)) {
    const successCount = scenarioSuccessCounts[scenario] || 0;
    const totalCount = scenarioCounts[scenario];
    scenarioSuccessRates[scenario] = totalCount > 0 ? successCount / totalCount : 0;
  }
  
  return {
    timeRange: {
      earliest: earliestDate,
      latest: latestDate
    },
    total,
    qwen3Called,
    qwen3Success,
    qwen3Failure,
    successRate,
    avgDurationMs: avgDuration,
    riskyReplyCount,
    failureTypeCounts,
    scenarioCounts,
    scenarioSuccessRates
  };
}

/**
 * 生成 JSON 格式摘要
 */
function generateSummaryJson(records) {
  const analysis = analyzeRecords(records);
  
  return {
    generatedAt: new Date().toISOString(),
    ...analysis
  };
}

/**
 * 生成 Markdown 格式摘要
 */
function generateSummaryMd(records) {
  const analysis = analyzeRecords(records);
  
  const lines = [];
  
  // A. 总体概览
  lines.push('# Qwen3 Shadow Mode 统计摘要');
  lines.push('');
  lines.push('## A. 总体概览');
  lines.push('');
  
  if (analysis.total === 0) {
    lines.push('- 暂无 shadow 记录');
    lines.push('');
    return lines.join('\n');
  }
  
  lines.push(`- 时间范围：${analysis.timeRange.earliest || '-'} ~ ${analysis.timeRange.latest || '-'}`);
  lines.push(`- 总样本数：${analysis.total}`);
  lines.push(`- qwen3 调用次数：${analysis.qwen3Called}`);
  lines.push(`- qwen3 成功次数：${analysis.qwen3Success}`);
  lines.push(`- qwen3 失败次数：${analysis.qwen3Failure}`);
  lines.push(`- 调用成功率：${(analysis.successRate * 100).toFixed(1)}%`);
  lines.push(`- 平均耗时：${analysis.avgDurationMs.toFixed(0)}ms`);
  lines.push(`- 高风险回复次数：${analysis.riskyReplyCount}`);
  lines.push('');
  
  // B. 失败类型分布
  lines.push('## B. 失败类型分布');
  lines.push('');
  
  if (Object.keys(analysis.failureTypeCounts).length === 0) {
    lines.push('- 无失败记录');
  } else {
    lines.push('| 失败类型 | 次数 |');
    lines.push('|---------|------|');
    for (const [type, count] of Object.entries(analysis.failureTypeCounts)) {
      lines.push(`| ${type} | ${count} |`);
    }
  }
  lines.push('');
  
  // C. 场景统计
  lines.push('## C. 场景统计');
  lines.push('');
  lines.push('| 场景 | 总数 | 成功数 | 成功率 |');
  lines.push('|------|------|--------|--------|');
  
  for (const [scenario, count] of Object.entries(analysis.scenarioCounts)) {
    const successCount = analysis.scenarioSuccessRates[scenario] ? 
      Math.round(analysis.scenarioSuccessRates[scenario] * count) : 0;
    const rate = (analysis.scenarioSuccessRates[scenario] * 100).toFixed(1);
    lines.push(`| ${scenario} | ${count} | ${successCount} | ${rate}% |`);
  }
  lines.push('');
  
  // D. 风险统计
  lines.push('## D. 风险统计');
  lines.push('');
  lines.push(`- risky_suggested_reply: ${analysis.riskyReplyCount}`);
  lines.push(`- invalid_fields: ${analysis.failureTypeCounts.invalid_fields || 0}`);
  lines.push(`- truncated_output: ${analysis.failureTypeCounts.truncated_output || 0}`);
  lines.push('');
  
  // E. 结论
  lines.push('## E. 结论');
  lines.push('');
  
  if (analysis.qwen3Called === 0) {
    lines.push('- 当前 shadow 结果不足，需继续观察');
  } else if (analysis.successRate >= 0.8) {
    lines.push('- ✅ 当前 shadow 结果可继续观察');
  } else {
    lines.push('- ⚠️ 当前 shadow 结果不具备扩大范围条件');
  }
  lines.push('');
  
  return lines.join('\n');
}

/**
 * 更新摘要文件
 */
function updateSummary(records, baseDir = DEFAULT_OUTPUT_DIR) {
  try {
    const summaryDir = getSummaryDir(baseDir);
    ensureDir(summaryDir);
    
    // 生成 JSON 摘要
    const summaryJson = generateSummaryJson(records);
    const jsonPath = path.join(summaryDir, 'latest-summary.json');
    fs.writeFileSync(jsonPath, JSON.stringify(summaryJson, null, 2), 'utf8');
    
    // 生成 Markdown 摘要
    const summaryMd = generateSummaryMd(records);
    const mdPath = path.join(summaryDir, 'latest-summary.md');
    fs.writeFileSync(mdPath, summaryMd, 'utf8');
    
    return {
      jsonPath,
      mdPath
    };
  } catch (error) {
    console.error('[Qwen3ShadowLogger] Failed to update summary:', error.message);
    return null;
  }
}

/**
 * 完整的 shadow 记录流程
 * 
 * @param {Object} shadowRecord - shadow 记录对象
 * @param {string} baseDir - 基础输出目录
 * @returns {Object} 保存结果
 */
function logShadowRecord(shadowRecord, baseDir = DEFAULT_OUTPUT_DIR) {
  const result = {
    recordSaved: false,
    recordPath: null,
    summaryUpdated: false,
    summaryPaths: null
  };
  
  try {
    // 1. 保存记录
    const recordPath = saveShadowRecord(shadowRecord, baseDir);
    if (recordPath) {
      result.recordSaved = true;
      result.recordPath = recordPath;
    }
    
    // 2. 更新摘要
    const allRecords = getAllRecords(baseDir);
    const summaryPaths = updateSummary(allRecords, baseDir);
    if (summaryPaths) {
      result.summaryUpdated = true;
      result.summaryPaths = summaryPaths;
    }
    
    return result;
  } catch (error) {
    console.error('[Qwen3ShadowLogger] Failed to log shadow record:', error.message);
    return result;
  }
}

// 导出
module.exports = {
  saveShadowRecord,
  getTodayRecords,
  getAllRecords,
  analyzeRecords,
  generateSummaryJson,
  generateSummaryMd,
  updateSummary,
  logShadowRecord,
  DEFAULT_OUTPUT_DIR
};
