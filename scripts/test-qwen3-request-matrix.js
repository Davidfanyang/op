#!/usr/bin/env node
/**
 * @script test-qwen3-request-matrix
 * @status EXPERIMENTAL_MODULE
 * @line MAIN_EXPERIMENT_LINE
 * @report STAGE_REPORT_ONLY
 * @production false
 */

/**
 * Qwen3 请求机制矩阵验证测试
 * 
 * 目标：
 * 1. 系统性排除请求参数变量
 * 2. 找到是否有值得继续做 adapter 的配置组合
 * 3. 不做单点试错，必须矩阵对照
 * 4. 所有证据落盘，支持复盘
 * 
 * 使用方式：
 *   node scripts/test-qwen3-request-matrix.js
 * 
 * 输出目录：
 *   scripts/output/qwen3-request-matrix/
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { processQwenResponse } = require('../services/local-model/qwen3-json-utils');

// ========================
// 配置
// ========================

const MODEL_NAME = 'qwen3:4b';
const OLLAMA_HOST = 'localhost';
const OLLAMA_PORT = 11434;
const ROUNDS_PER_GROUP = 3; // 每组至少 3 轮

const OUTPUT_DIR = path.join(__dirname, 'output', 'qwen3-request-matrix');

// 固定测试场景
const TEST_SCENARIO = {
  user: '用户：我转账成功了，但是对方没收到。\n客服：你等等。'
};

// ========================
// Prompt 版本定义
// ========================

const PROMPTS = {
  // 完整规则版
  full: {
    system: `你是客服质量评估助手。请分析以下对话并以JSON格式输出评估结果。

输出JSON必须包含以下字段：
- score: 0-100的整数，表示客服回复质量评分
- problem_type: "known"或"unknown"，表示问题类型
- scenario: 字符串，表示识别到的场景
- issues: 数组，存在的问题列表
- missing_info: 数组，缺失的信息列表
- suggested_reply: 字符串，建议的客服回复
- confidence: 0.0-1.0的数字，表示评估置信度

严格要求：
1. 只输出合法JSON，不要任何解释、markdown或其他文本
2. 所有字段都必须存在且类型正确
3. score必须是整数
4. confidence必须在0到1之间`,
    user: TEST_SCENARIO.user
  },

  // 压缩规则版
  compact: {
    system: `你是客服质量评估助手。分析对话并输出JSON评估结果。

JSON格式：
{"score": 0-100整数, "problem_type": "known/unknown", "scenario": "字符串", "issues": [], "missing_info": [], "suggested_reply": "字符串", "confidence": 0.0-1.0}

要求：只输出JSON，不要任何解释。`,
    user: TEST_SCENARIO.user
  },

  // 极简版
  minimal: {
    system: `输出JSON格式评估结果：{"score": 整数, "problem_type": "known或unknown", "scenario": "字符串", "issues": [], "missing_info": [], "suggested_reply": "字符串", "confidence": 0-1数字}

只输出JSON，禁止任何解释。`,
    user: TEST_SCENARIO.user
  }
};

// ========================
// 测试矩阵配置
// ========================

const TEST_GROUPS = [
  // G1: 基准组 - 512 token
  {
    id: 'G1',
    numPredict: 512,
    format: null,
    promptVersion: 'full',
    messageMode: 'system_user',
    think: false
  },
  // G2: 增加 token 预算
  {
    id: 'G2',
    numPredict: 1024,
    format: null,
    promptVersion: 'full',
    messageMode: 'system_user',
    think: false
  },
  // G3: 进一步增加 token 预算
  {
    id: 'G3',
    numPredict: 2048,
    format: null,
    promptVersion: 'full',
    messageMode: 'system_user',
    think: false
  },
  // G4: 使用 format: "json"
  {
    id: 'G4',
    numPredict: 1024,
    format: 'json',
    promptVersion: 'full',
    messageMode: 'system_user',
    think: false
  },
  // G5: 压缩 prompt
  {
    id: 'G5',
    numPredict: 1024,
    format: null,
    promptVersion: 'compact',
    messageMode: 'system_user',
    think: false
  },
  // G6: 极简 prompt
  {
    id: 'G6',
    numPredict: 1024,
    format: null,
    promptVersion: 'minimal',
    messageMode: 'system_user',
    think: false
  },
  // G7: 单 user 消息结构
  {
    id: 'G7',
    numPredict: 1024,
    format: null,
    promptVersion: 'compact',
    messageMode: 'single_user',
    think: false
  },
  // G8: 不带 think 参数
  {
    id: 'G8',
    numPredict: 1024,
    format: null,
    promptVersion: 'compact',
    messageMode: 'system_user',
    think: null // 不设置 think 参数
  }
];

// ========================
// HTTP 请求
// ========================

function httpRequest(path, method = 'POST', data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: OLLAMA_HOST,
      port: OLLAMA_PORT,
      path: path,
      method: method,
      headers: {}
    };

    if (data) {
      const postData = JSON.stringify(data);
      options.headers['Content-Type'] = 'application/json';
      options.headers['Content-Length'] = Buffer.byteLength(postData);
      
      const req = http.request(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (error) {
            reject(new Error(`JSON parse failed: ${error.message}\nRaw: ${body}`));
          }
        });
      });

      req.on('error', reject);
      req.write(postData);
      req.end();
    } else {
      const req = http.request(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (error) {
            reject(new Error(`JSON parse failed: ${error.message}\nRaw: ${body}`));
          }
        });
      });

      req.on('error', reject);
      req.end();
    }
  });
}

// ========================
// Prompt 构造函数
// ========================

function buildPrompt(version, messageMode) {
  const prompt = PROMPTS[version];
  if (!prompt) {
    throw new Error(`Unknown prompt version: ${version}`);
  }

  if (messageMode === 'system_user') {
    return {
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user }
      ]
    };
  } else if (messageMode === 'single_user') {
    return {
      messages: [
        { role: 'user', content: prompt.system + '\n\n' + prompt.user }
      ]
    };
  } else {
    throw new Error(`Unknown message mode: ${messageMode}`);
  }
}

// ========================
// 构建请求数据
// ========================

function buildRequestData(groupConfig) {
  const promptData = buildPrompt(groupConfig.promptVersion, groupConfig.messageMode);
  
  const requestData = {
    model: MODEL_NAME,
    messages: promptData.messages,
    stream: false,
    options: {
      temperature: 0,
      num_predict: groupConfig.numPredict
    }
  };

  // 添加 format（如果指定）
  if (groupConfig.format) {
    requestData.format = groupConfig.format;
  }

  // 添加 think（如果不为 null）
  if (groupConfig.think !== null && groupConfig.think !== undefined) {
    requestData.think = groupConfig.think;
  }

  return requestData;
}

// ========================
// 单轮测试
// ========================

async function runSingleRound(groupConfig, roundIndex) {
  const roundData = {
    roundIndex,
    timestamp: new Date().toISOString(),
    request: null,
    response: null,
    result: null
  };

  try {
    // 1. 构建请求
    const requestData = buildRequestData(groupConfig);
    roundData.request = requestData;

    // 2. 调用模型
    const rawResponse = await httpRequest('/api/chat', 'POST', requestData);
    roundData.response = rawResponse;

    // 3. 处理响应
    const result = processQwenResponse(rawResponse);
    roundData.result = result;

    // 4. 判断结果类型
    const isParseSuccess = result.data !== null;
    const isValidSuccess = result.success === true;
    const isHighRisk = result.truncated && isParseSuccess;
    const isUsableSuccess = isValidSuccess && !result.truncated && result.replyRisk !== 'risky_reply_detected';

    return {
      ...roundData,
      isParseSuccess,
      isValidSuccess,
      isHighRisk,
      isUsableSuccess
    };

  } catch (error) {
    return {
      ...roundData,
      result: {
        success: false,
        failureType: 'request_failed',
        error: error.message,
        sourceTried: [],
        selectedSource: null,
        raw: null,
        cleaned: null,
        candidates: [],
        data: null,
        truncated: false,
        truncationReason: null,
        validationErrors: [],
        replyRisk: null,
        replyRiskDetails: []
      },
      isParseSuccess: false,
      isValidSuccess: false,
      isHighRisk: false,
      isUsableSuccess: false
    };
  }
}

// ========================
// 单组多轮执行
// ========================

async function runTestGroup(groupConfig, rounds) {
  console.log(`\n${'═'.repeat(80)}`);
  console.log(`【测试组 ${groupConfig.id}】`);
  console.log(`${'═'.repeat(80)}`);
  console.log(`参数配置:`);
  console.log(`  - num_predict: ${groupConfig.numPredict}`);
  console.log(`  - format: ${groupConfig.format || '无'}`);
  console.log(`  - promptVersion: ${groupConfig.promptVersion}`);
  console.log(`  - messageMode: ${groupConfig.messageMode}`);
  console.log(`  - think: ${groupConfig.think === null ? '不设置' : groupConfig.think}`);
  console.log(`  - 测试轮次: ${rounds}\n`);

  const roundResults = [];

  for (let i = 1; i <= rounds; i++) {
    console.log(`  【第 ${i} 轮】...`);
    
    const roundData = await runSingleRound(groupConfig, i);
    roundResults.push(roundData);

    // 输出本轮结果
    const r = roundData.result;
    console.log(`    - done_reason: ${roundData.response?.done_reason || 'unknown'}`);
    console.log(`    - truncated: ${r.truncated}`);
    console.log(`    - parse success: ${roundData.isParseSuccess}`);
    console.log(`    - valid success: ${roundData.isValidSuccess}`);
    console.log(`    - usable success: ${roundData.isUsableSuccess}`);
    console.log(`    - failureType: ${r.failureType || 'none'}`);

    // 轮次间隔
    if (i < rounds) {
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  }

  // 组级统计
  const groupStats = {
    groupId: groupConfig.id,
    config: groupConfig,
    totalRounds: rounds,
    parseSuccessCount: roundResults.filter(r => r.isParseSuccess).length,
    validSuccessCount: roundResults.filter(r => r.isValidSuccess).length,
    highRiskSuccessCount: roundResults.filter(r => r.isHighRisk).length,
    usableSuccessCount: roundResults.filter(r => r.isUsableSuccess).length,
    doneReasonLengthCount: roundResults.filter(r => r.response?.done_reason === 'length').length,
    truncatedCount: roundResults.filter(r => r.result?.truncated).length,
    failureTypeBreakdown: {},
    rounds: roundResults
  };

  // 统计失败类型分布
  for (const round of roundResults) {
    const ft = round.result?.failureType || 'success';
    groupStats.failureTypeBreakdown[ft] = (groupStats.failureTypeBreakdown[ft] || 0) + 1;
  }

  console.log(`\n  【组内统计】`);
  console.log(`    - parse success: ${groupStats.parseSuccessCount}/${rounds}`);
  console.log(`    - valid success: ${groupStats.validSuccessCount}/${rounds}`);
  console.log(`    - usable success: ${groupStats.usableSuccessCount}/${rounds}`);
  console.log(`    - done_reason=length: ${groupStats.doneReasonLengthCount}/${rounds}`);
  console.log(`    - truncated: ${groupStats.truncatedCount}/${rounds}`);

  return groupStats;
}

// ========================
// 保存组级证据
// ========================

function saveGroupArtifacts(outputDir, groupConfig, groupStats) {
  const groupDir = path.join(outputDir, groupConfig.id);
  
  if (!fs.existsSync(groupDir)) {
    fs.mkdirSync(groupDir, { recursive: true });
  }

  // 保存每轮证据
  for (const round of groupStats.rounds) {
    const roundIndex = round.roundIndex;
    
    // request
    fs.writeFileSync(
      path.join(groupDir, `round-${roundIndex}-request.json`),
      JSON.stringify(round.request, null, 2),
      'utf8'
    );

    // response
    fs.writeFileSync(
      path.join(groupDir, `round-${roundIndex}-response.json`),
      JSON.stringify(round.response, null, 2),
      'utf8'
    );

    // result
    fs.writeFileSync(
      path.join(groupDir, `round-${roundIndex}-result.json`),
      JSON.stringify(round.result, null, 2),
      'utf8'
    );
  }

  // 组级 summary
  const groupSummary = {
    groupId: groupStats.groupId,
    config: groupStats.config,
    totalRounds: groupStats.totalRounds,
    parseSuccessCount: groupStats.parseSuccessCount,
    validSuccessCount: groupStats.validSuccessCount,
    highRiskSuccessCount: groupStats.highRiskSuccessCount,
    usableSuccessCount: groupStats.usableSuccessCount,
    doneReasonLengthCount: groupStats.doneReasonLengthCount,
    truncatedCount: groupStats.truncatedCount,
    failureTypeBreakdown: groupStats.failureTypeBreakdown,
    timestamp: new Date().toISOString()
  };

  fs.writeFileSync(
    path.join(groupDir, 'summary.json'),
    JSON.stringify(groupSummary, null, 2),
    'utf8'
  );
}

// ========================
// 构建全局汇总
// ========================

function buildGlobalSummary(allGroupStats) {
  const summary = {
    timestamp: new Date().toISOString(),
    model: MODEL_NAME,
    totalGroups: allGroupStats.length,
    totalRounds: allGroupStats.reduce((sum, g) => sum + g.totalRounds, 0),
    scenario: TEST_SCENARIO.user,
    groups: [],
    bestGroup: null,
    bestGroupReason: null
  };

  // 组级结果
  for (const group of allGroupStats) {
    summary.groups.push({
      groupId: group.groupId,
      numPredict: group.config.numPredict,
      format: group.config.format,
      promptVersion: group.config.promptVersion,
      messageMode: group.config.messageMode,
      think: group.config.think,
      parseSuccessCount: group.parseSuccessCount,
      validSuccessCount: group.validSuccessCount,
      usableSuccessCount: group.usableSuccessCount,
      doneReasonLengthCount: group.doneReasonLengthCount,
      truncatedCount: group.truncatedCount,
      failureTypeBreakdown: group.failureTypeBreakdown
    });
  }

  // 找出最佳组（按 usable success 排序）
  const sorted = [...allGroupStats].sort((a, b) => {
    // 优先 usable success
    if (b.usableSuccessCount !== a.usableSuccessCount) {
      return b.usableSuccessCount - a.usableSuccessCount;
    }
    // 其次 valid success
    if (b.validSuccessCount !== a.validSuccessCount) {
      return b.validSuccessCount - a.validSuccessCount;
    }
    // 最后 parse success
    return b.parseSuccessCount - a.parseSuccessCount;
  });

  const best = sorted[0];
  summary.bestGroup = best.groupId;
  
  // 说明最佳组的表现
  summary.bestGroupReason = {
    usableSuccess: `${best.usableSuccessCount}/${best.totalRounds}`,
    validSuccess: `${best.validSuccessCount}/${best.totalRounds}`,
    parseSuccess: `${best.parseSuccessCount}/${best.totalRounds}`,
    doneReasonLengthRate: `${best.doneReasonLengthCount}/${best.totalRounds}`,
    truncatedRate: `${best.truncatedCount}/${best.totalRounds}`
  };

  return summary;
}

// ========================
// 生成 Markdown 报告
// ========================

function generateMarkdownSummary(globalSummary) {
  const timestamp = new Date(globalSummary.timestamp).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  
  // 判断最终结论
  let conclusion = '';
  const bestGroupStats = globalSummary.groups.find(g => g.groupId === globalSummary.bestGroup);
  
  if (bestGroupStats && bestGroupStats.usableSuccessCount >= 2) {
    conclusion = '当前请求机制验证通过，可进入下一步 adapter 设计';
  } else {
    conclusion = '当前请求机制验证不通过，qwen3 路线暂不继续推进';
  }

  let md = `# Qwen3 请求机制矩阵验证报告\n\n`;
  
  // A. 测试概述
  md += `## A. 测试概述\n\n`;
  md += `- 模型名称: ${globalSummary.model}\n`;
  md += `- 执行时间: ${timestamp}\n`;
  md += `- 总组数: ${globalSummary.totalGroups}\n`;
  md += `- 总轮次: ${globalSummary.totalRounds}\n`;
  md += `- 测试场景: ${globalSummary.scenario}\n\n`;

  // B. 参数矩阵表
  md += `## B. 参数矩阵配置\n\n`;
  md += `| 组别 | num_predict | format | prompt版本 | 消息结构 | think |\n`;
  md += `|------|-------------|--------|-----------|---------|-------|\n`;
  
  for (const group of globalSummary.groups) {
    md += `| ${group.groupId} | ${group.numPredict} | ${group.format || '无'} | ${group.promptVersion} | ${group.messageMode} | ${group.think === null ? '不设置' : group.think} |\n`;
  }

  // C. 每组统计结果表
  md += `\n## C. 每组统计结果\n\n`;
  md += `| 组别 | parse success | valid success | usable success | done_reason=length | truncated |\n`;
  md += `|------|--------------|--------------|----------------|-------------------|-----------|\n`;
  
  for (const group of globalSummary.groups) {
    md += `| ${group.groupId} | ${group.parseSuccessCount}/${group.parseSuccessCount + (group.doneReasonLengthCount || 0)} | ${group.validSuccessCount}/${group.validSuccessCount + (group.doneReasonLengthCount || 0)} | ${group.usableSuccessCount}/${group.usableSuccessCount + (group.doneReasonLengthCount || 0)} | ${group.doneReasonLengthCount} | ${group.truncatedCount} |\n`;
  }

  // D. 最佳组分析
  md += `\n## D. 最佳组分析\n\n`;
  md += `**最佳组别**: ${globalSummary.bestGroup}\n\n`;
  md += `表现：\n`;
  md += `- usable success: ${globalSummary.bestGroupReason.usableSuccess}\n`;
  md += `- valid success: ${globalSummary.bestGroupReason.validSuccess}\n`;
  md += `- parse success: ${globalSummary.bestGroupReason.parseSuccess}\n`;
  md += `- done_reason=length: ${globalSummary.bestGroupReason.doneReasonLengthRate}\n`;
  md += `- truncated: ${globalSummary.bestGroupReason.truncatedRate}\n\n`;

  if (bestGroupStats) {
    md += `分析：\n`;
    if (bestGroupStats.usableSuccessCount === 0) {
      md += `- 该组未产生任何可用成功样本\n`;
    }
    if (bestGroupStats.doneReasonLengthCount > bestGroupStats.totalRounds / 2) {
      md += `- done_reason=length 仍是主导失败原因\n`;
    }
    if (bestGroupStats.truncatedCount > bestGroupStats.totalRounds / 2) {
      md += `- 截断仍是主导失败原因\n`;
    }
    if (bestGroupStats.parseSuccessCount > 0) {
      md += `- 该组在 parse success 方面表现相对较好\n`;
    }
    md += `\n`;
  }

  // E. 最终结论
  md += `## E. 最终结论\n\n`;
  md += `${conclusion}\n\n`;

  md += `---\n`;
  md += `报告生成时间: ${timestamp}\n`;

  return md;
}

// ========================
// 写入汇总文件
// ========================

function writeGlobalSummary(outputDir, globalSummary) {
  // JSON
  fs.writeFileSync(
    path.join(outputDir, 'request-matrix-summary.json'),
    JSON.stringify(globalSummary, null, 2),
    'utf8'
  );

  // Markdown
  const mdContent = generateMarkdownSummary(globalSummary);
  fs.writeFileSync(
    path.join(outputDir, 'request-matrix-summary.md'),
    mdContent,
    'utf8'
  );
}

// ========================
// 主流程
// ========================

async function main() {
  console.log('='.repeat(80));
  console.log('Qwen3 请求机制矩阵验证测试');
  console.log('='.repeat(80));
  console.log(`\n模型: ${MODEL_NAME}`);
  console.log(`测试组数: ${TEST_GROUPS.length}`);
  console.log(`每组轮次: ${ROUNDS_PER_GROUP}`);
  console.log(`总轮次: ${TEST_GROUPS.length * ROUNDS_PER_GROUP}`);
  console.log(`输出目录: ${OUTPUT_DIR}\n`);

  // 确保输出目录存在
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // 前置检查：模型存在性
  console.log('【前置检查】模型存在性验证...');
  try {
    const tagsResponse = await httpRequest('/api/tags', 'GET');
    const modelExists = tagsResponse.models?.some(m => m.name === MODEL_NAME || m.name.startsWith(MODEL_NAME));
    
    if (!modelExists) {
      console.error(`❌ 模型不存在: ${MODEL_NAME}`);
      process.exit(1);
    }
    
    console.log(`✅ 模型存在: ${MODEL_NAME}\n`);
  } catch (error) {
    console.error('❌ Ollama 连接失败');
    console.error('错误:', error.message);
    process.exit(1);
  }

  // 执行所有测试组
  const allGroupStats = [];

  for (const groupConfig of TEST_GROUPS) {
    const groupStats = await runTestGroup(groupConfig, ROUNDS_PER_GROUP);
    allGroupStats.push(groupStats);

    // 保存组级证据
    saveGroupArtifacts(OUTPUT_DIR, groupConfig, groupStats);

    // 组间间隔
    if (groupConfig.id !== TEST_GROUPS[TEST_GROUPS.length - 1].id) {
      console.log('\n等待 2 秒后继续下一组...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  // 构建全局汇总
  console.log(`\n${'═'.repeat(80)}`);
  console.log('【全局汇总】');
  console.log(`${'═'.repeat(80)}\n`);

  const globalSummary = buildGlobalSummary(allGroupStats);
  writeGlobalSummary(OUTPUT_DIR, globalSummary);

  // 输出汇总信息
  console.log(`总组数: ${globalSummary.totalGroups}`);
  console.log(`总轮次: ${globalSummary.totalRounds}`);
  console.log(`最佳组: ${globalSummary.bestGroup}`);
  console.log(`最佳组表现:`);
  console.log(`  - usable success: ${globalSummary.bestGroupReason.usableSuccess}`);
  console.log(`  - valid success: ${globalSummary.bestGroupReason.validSuccess}`);
  console.log(`  - parse success: ${globalSummary.bestGroupReason.parseSuccess}`);
  console.log(`  - done_reason=length: ${globalSummary.bestGroupReason.doneReasonLengthRate}`);
  console.log(`  - truncated: ${globalSummary.bestGroupReason.truncatedRate}`);

  console.log(`\n📁 证据文件已保存到: ${OUTPUT_DIR}`);
  console.log(`   - {G1-G8}/ 每组独立目录`);
    console.log(`   - request-matrix-summary.json`);
  console.log(`   - request-matrix-summary.md`);

  // 输出最终结论
  console.log(`\n${'═'.repeat(80)}`);
  console.log('【最终结论】');
  console.log(`${'═'.repeat(80)}\n`);

  if (globalSummary.bestGroupReason.usableSuccess.startsWith('2') || 
      globalSummary.bestGroupReason.usableSuccess.startsWith('3')) {
    console.log('✅ 当前请求机制验证通过，可进入下一步 adapter 设计\n');
  } else {
    console.log('❌ 当前请求机制验证不通过，qwen3 路线暂不继续推进\n');
  }

  console.log('='.repeat(80));
}

// 执行
main().catch(error => {
  console.error('测试执行异常:', error);
  process.exit(1);
});
