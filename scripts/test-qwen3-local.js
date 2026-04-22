#!/usr/bin/env node
/**
 * @script test-qwen3-local
 * @status EXPERIMENTAL_MODULE
 * @line MAIN_EXPERIMENT_LINE
 * @report STAGE_REPORT_ONLY
 * @production false
 */

/**
 * Qwen3 JSON 输出隔离验证测试 - 修正版
 * 
 * 目标：
 * 1. 先让验证器本身合格
 * 2. 多轮测试得出稳定性结论
 * 3. 完整证据落盘，支持复盘
 * 4. 失败可归因，不提前下结论
 * 
 * 使用方式：
 *   node scripts/test-qwen3-local.js
 * 
 * 输出目录：
 *   scripts/output/qwen3-local-test/
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
const TOTAL_ROUNDS = 3; // 至少 3 轮测试

const OUTPUT_DIR = path.join(__dirname, 'output', 'qwen3-local-test');

const TEST_CASE = {
  system: '你是客服质量评估助手。请分析以下对话并以JSON格式输出评估结果。只输出JSON，不要任何解释。',
  user: '用户：我转账成功了，但是对方没收到。\n客服：你等等。'
};

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
// 构建请求数据
// ========================

function buildRequestData() {
  return {
    model: MODEL_NAME,
    messages: [
      { role: 'system', content: TEST_CASE.system },
      { role: 'user', content: TEST_CASE.user }
    ],
    think: false,
    stream: false,
    options: {
      temperature: 0,
      num_predict: 512
    }
  };
}

// ========================
// 单轮测试
// ========================

async function runSingleRound(roundIndex) {
  console.log(`\n${'═'.repeat(80)}`);
  console.log(`【第 ${roundIndex} 轮测试】`);
  console.log(`${'═'.repeat(80)}\n`);

  const roundData = {
    roundIndex,
    timestamp: new Date().toISOString(),
    request: null,
    response: null,
    result: null
  };

  try {
    // 1. 构建请求
    const requestData = buildRequestData();
    roundData.request = requestData;

    console.log('【步骤 1】调用模型...');
    const rawResponse = await httpRequest('/api/chat', 'POST', requestData);
    roundData.response = rawResponse;
    console.log('✅ 模型调用成功');

    // 2. 分析原始响应
    console.log('\n【步骤 2】原始响应分析...');
    const doneReason = rawResponse.done_reason || 'unknown';
    const contentLength = rawResponse.message?.content?.length || 0;
    console.log(`- done: ${rawResponse.done}`);
    console.log(`- done_reason: ${doneReason}`);
    console.log(`- message.content 长度: ${contentLength}`);

    // 3. 处理响应
    console.log('\n【步骤 3】处理响应...');
    const result = processQwenResponse(rawResponse);
    roundData.result = result;

    // 4. 输出详细结果
    console.log('处理结果:');
    console.log(`- success: ${result.success}`);
    console.log(`- failureType: ${result.failureType || 'none'}`);
    console.log(`- error: ${result.error || 'none'}`);
    console.log(`- sourceTried: ${result.sourceTried.join(', ') || 'none'}`);
    console.log(`- selectedSource: ${result.selectedSource || 'none'}`);
    console.log(`- truncated: ${result.truncated}`);
    console.log(`- truncationReason: ${result.truncationReason || 'none'}`);
    console.log(`- candidates count: ${result.candidates.length}`);
    console.log(`- validationErrors: ${result.validationErrors.length}`);
    console.log(`- replyRisk: ${result.replyRisk || 'none'}`);

    if (result.data) {
      console.log('\n✅ JSON 解析成功:');
      console.log(`  - score: ${result.data.score}`);
      console.log(`  - problem_type: ${result.data.problem_type}`);
      console.log(`  - scenario: ${result.data.scenario}`);
      console.log(`  - issues: ${result.data.issues?.length || 0} 项`);
      console.log(`  - missing_info: ${result.data.missing_info?.length || 0} 项`);
      console.log(`  - suggested_reply: ${(result.data.suggested_reply || '').substring(0, 50)}...`);
      console.log(`  - confidence: ${result.data.confidence}`);
    }

    if (result.validationErrors.length > 0) {
      console.log('\n❌ 字段校验失败:');
      result.validationErrors.forEach(err => console.log(`  - ${err}`));
    }

    if (result.replyRiskDetails.length > 0) {
      console.log('\n⚠️ 回复风险:');
      result.replyRiskDetails.forEach(risk => console.log(`  - ${risk}`));
    }

    // 5. 判断本轮结果
    const isParseSuccess = result.data !== null;
    const isValidSuccess = result.success === true;
    const isHighRisk = result.truncated && isParseSuccess;

    console.log('\n【步骤 4】本轮结论:');
    console.log(`- parse success: ${isParseSuccess}`);
    console.log(`- valid success: ${isValidSuccess}`);
    console.log(`- high-risk success: ${isHighRisk}`);

    if (isValidSuccess) {
      console.log('✅ 本轮通过');
    } else if (isHighRisk) {
      console.log('⚠️ 本轮高风险成功（不计入正式样本）');
    } else {
      console.log(`❌ 本轮失败: ${result.failureType}`);
    }

    return roundData;

  } catch (error) {
    console.error(`\n❌ 第 ${roundIndex} 轮测试异常:`, error.message);
    roundData.result = {
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
    };
    return roundData;
  }
}

// ========================
// 保存单轮证据
// ========================

function saveRoundArtifacts(outputDir, roundIndex, roundData) {
  const roundDir = outputDir;
  
  // 保存请求
  const requestFile = path.join(roundDir, `request.json`);
  if (!fs.existsSync(requestFile)) {
    fs.writeFileSync(requestFile, JSON.stringify(roundData.request, null, 2), 'utf8');
  }

  // 保存响应
  const responseFile = path.join(roundDir, `round-${roundIndex}-response.json`);
  fs.writeFileSync(responseFile, JSON.stringify(roundData.response, null, 2), 'utf8');

  // 保存结果
  const resultFile = path.join(roundDir, `round-${roundIndex}-result.json`);
  fs.writeFileSync(resultFile, JSON.stringify(roundData.result, null, 2), 'utf8');
}

// ========================
// 构建汇总
// ========================

function buildSummary(roundResults) {
  const summary = {
    timestamp: new Date().toISOString(),
    model: MODEL_NAME,
    totalRounds: roundResults.length,
    successRounds: 0,
    failureRounds: 0,
    highRiskRounds: 0,
    doneReasonLengthCount: 0,
    truncatedOutputCount: 0,
    jsonParseSuccessCount: 0,
    fieldValidPassCount: 0,
    rounds: []
  };

  for (const round of roundResults) {
    const result = round.result;
    const isParseSuccess = result.data !== null;
    const isValidSuccess = result.success === true;
    const isHighRisk = result.truncated && isParseSuccess;

    const roundSummary = {
      round: round.roundIndex,
      timestamp: round.timestamp,
      doneReason: round.response?.done_reason || 'unknown',
      sourceTried: result.sourceTried,
      selectedSource: result.selectedSource,
      success: isValidSuccess,
      failureType: result.failureType,
      truncated: result.truncated,
      parseSuccess: isParseSuccess,
      highRisk: isHighRisk,
      fieldErrors: result.validationErrors.length,
      replyRisk: result.replyRisk
    };

    summary.rounds.push(roundSummary);

    if (isValidSuccess) {
      summary.successRounds++;
    } else if (isHighRisk) {
      summary.highRiskRounds++;
    } else {
      summary.failureRounds++;
    }

    if (round.response?.done_reason === 'length') {
      summary.doneReasonLengthCount++;
    }

    if (result.truncated) {
      summary.truncatedOutputCount++;
    }

    if (isParseSuccess) {
      summary.jsonParseSuccessCount++;
    }

    if (isValidSuccess) {
      summary.fieldValidPassCount++;
    }
  }

  return summary;
}

// ========================
// 写入汇总文件
// ========================

function writeSummaryFiles(outputDir, summary) {
  // JSON 格式
  const jsonFile = path.join(outputDir, 'summary.json');
  fs.writeFileSync(jsonFile, JSON.stringify(summary, null, 2), 'utf8');

  // Markdown 格式
  const mdContent = generateMarkdownSummary(summary);
  const mdFile = path.join(outputDir, 'summary.md');
  fs.writeFileSync(mdFile, mdContent, 'utf8');
}

function generateMarkdownSummary(summary) {
  const timestamp = new Date(summary.timestamp).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  
  const conclusion = summary.successRounds === summary.totalRounds
    ? '✅ 隔离验证通过，允许进入下一步 adapter 开发'
    : '❌ 隔离验证不通过，暂不允许进入主链路接入';

  let md = `# Qwen3 JSON 输出隔离验证报告\n\n`;
  md += `## 基本信息\n\n`;
  md += `- 执行时间: ${timestamp}\n`;
  md += `- 模型名称: ${summary.model}\n`;
  md += `- 总轮次: ${summary.totalRounds}\n`;
  md += `- 通过轮次: ${summary.successRounds}\n`;
  md += `- 失败轮次: ${summary.failureRounds}\n`;
  md += `- 高风险轮次: ${summary.highRiskRounds}\n\n`;

  md += `## 请求参数摘要\n\n`;
  md += '```json\n';
  md += JSON.stringify({
    model: MODEL_NAME,
    think: false,
    stream: false,
    options: {
      temperature: 0,
      num_predict: 512
    }
  }, null, 2);
  md += '\n```\n\n';

  md += `## 测试结果\n\n`;
  md += `| 轮次 | done_reason | 来源 | 成功 | 失败类型 | 截断 | 字段错误 | 回复风险 |\n`;
  md += `|------|-------------|------|------|----------|------|----------|----------|\n`;

  for (const round of summary.rounds) {
    md += `| ${round.round} | ${round.doneReason} | ${round.selectedSource || '-'} | ${round.success ? '✅' : '❌'} | ${round.failureType || '-'} | ${round.truncated ? '是' : '否'} | ${round.fieldErrors} | ${round.replyRisk || '-'} |\n`;
  }

  md += `\n## 统计指标\n\n`;
  md += `- done_reason=length 次数: ${summary.doneReasonLengthCount}\n`;
  md += `- truncated_output 次数: ${summary.truncatedOutputCount}\n`;
  md += `- JSON parse 成功率: ${summary.jsonParseSuccessCount}/${summary.totalRounds} (${Math.round(summary.jsonParseSuccessCount / summary.totalRounds * 100)}%)\n`;
  md += `- 字段完整通过率: ${summary.fieldValidPassCount}/${summary.totalRounds} (${Math.round(summary.fieldValidPassCount / summary.totalRounds * 100)}%)\n\n`;

  md += `## 最终结论\n\n`;
  md += `${conclusion}\n\n`;

  md += `---\n`;
  md += `报告生成时间: ${timestamp}\n`;

  return md;
}

// ========================
// 主流程
// ========================

async function main() {
  console.log('='.repeat(80));
  console.log('Qwen3 JSON 输出隔离验证测试 - 修正版');
  console.log('='.repeat(80));
  console.log(`\n模型: ${MODEL_NAME}`);
  console.log(`总轮次: ${TOTAL_ROUNDS}`);
  console.log(`输出目录: ${OUTPUT_DIR}\n`);

  // 确保输出目录存在
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // 测试 1: 模型存在性检查
  console.log('\n【前置检查】模型存在性验证...');
  try {
    const tagsResponse = await httpRequest('/api/tags', 'GET');
    const modelExists = tagsResponse.models?.some(m => m.name === MODEL_NAME || m.name.startsWith(MODEL_NAME));
    
    if (!modelExists) {
      console.error(`❌ 模型不存在: ${MODEL_NAME}`);
      console.error('请先执行: ollama pull qwen3:4b');
      process.exit(1);
    }
    
    console.log(`✅ 模型存在: ${MODEL_NAME}`);
  } catch (error) {
    console.error('❌ Ollama 连接失败');
    console.error('错误:', error.message);
    console.error('请确保 Ollama 服务已启动: ollama serve');
    process.exit(1);
  }

  // 测试 2: 连续执行多轮测试
  const roundResults = [];
  
  for (let i = 1; i <= TOTAL_ROUNDS; i++) {
    const roundData = await runSingleRound(i);
    roundResults.push(roundData);
    
    // 保存证据
    saveRoundArtifacts(OUTPUT_DIR, i, roundData);
    
    // 轮次间隔
    if (i < TOTAL_ROUNDS) {
      console.log('\n等待 2 秒后继续下一轮...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  // 测试 3: 汇总结果
  console.log(`\n${'═'.repeat(80)}`);
  console.log('【汇总结果】');
  console.log(`${'═'.repeat(80)}\n`);

  const summary = buildSummary(roundResults);
  writeSummaryFiles(OUTPUT_DIR, summary);

  console.log(`总轮次: ${summary.totalRounds}`);
  console.log(`成功轮次: ${summary.successRounds}`);
  console.log(`失败轮次: ${summary.failureRounds}`);
  console.log(`高风险轮次: ${summary.highRiskRounds}`);
  console.log(`done_reason=length 次数: ${summary.doneReasonLengthCount}`);
  console.log(`truncated_output 次数: ${summary.truncatedOutputCount}`);
  console.log(`JSON parse 成功率: ${summary.jsonParseSuccessCount}/${summary.totalRounds} (${Math.round(summary.jsonParseSuccessCount / summary.totalRounds * 100)}%)`);
  console.log(`字段完整通过率: ${summary.fieldValidPassCount}/${summary.totalRounds} (${Math.round(summary.fieldValidPassCount / summary.totalRounds * 100)}%)`);

  console.log(`\n📁 证据文件已保存到: ${OUTPUT_DIR}`);
  console.log(`   - request.json`);
  console.log(`   - round-{1,2,3}-response.json`);
  console.log(`   - round-{1,2,3}-result.json`);
  console.log(`   - summary.json`);
  console.log(`   - summary.md`);

  // 测试 4: 最终结论
  console.log(`\n${'═'.repeat(80)}`);
  console.log('【最终结论】');
  console.log(`${'═'.repeat(80)}\n`);

  if (summary.successRounds === summary.totalRounds) {
    console.log('✅ 隔离验证通过，允许进入下一步 adapter 开发\n');
  } else {
    console.log('❌ 隔离验证不通过，暂不允许进入主链路接入\n');
  }

  console.log('='.repeat(80));
}

// 执行
main().catch(error => {
  console.error('测试执行异常:', error);
  process.exit(1);
});
