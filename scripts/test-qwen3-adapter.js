#!/usr/bin/env node
/**
 * @script test-qwen3-adapter
 * @status EXPERIMENTAL_MODULE
 * @line MAIN_EXPERIMENT_LINE
 * @report STAGE_REPORT_ONLY
 * @production false
 */

/**
 * Qwen3 Adapter 隔离验证测试
 * 
 * 目标：
 * 1. 验证 adapter 接口合格
 * 2. 验证 G4 配置被正确固化
 * 3. 验证多场景下有稳定成功样本
 * 4. 验证失败结果可解释
 * 5. 验证没有明显高风险输出
 * 
 * 使用方式：
 *   node scripts/test-qwen3-adapter.js
 * 
 * 输出目录：
 *   scripts/output/qwen3-adapter-test/
 */

const fs = require('fs');
const path = require('path');
const { evaluateWithQwen3Adapter } = require('../services/local-model/qwen3-adapter');

// ========================
// 配置
// ========================

const OUTPUT_DIR = path.join(__dirname, 'output', 'qwen3-adapter-test');
const ROUNDS_PER_SCENE = 2; // 每场景至少 2 轮

// 5 个固定测试场景
const TEST_SCENES = [
  {
    id: 'scene_1',
    name: '转账成功但对方未收到',
    conversationText: '用户：我转账成功了，但是对方没收到。\n客服：你等等。'
  },
  {
    id: 'scene_2',
    name: '提现一直没到账',
    conversationText: '用户：我提现已经两个小时了，还没到账，怎么回事？\n客服：请稍等。'
  },
  {
    id: 'scene_3',
    name: '支付失败但被扣款',
    conversationText: '用户：我支付失败了，但是银行卡被扣款了！\n客服：您提供一下订单号。'
  },
  {
    id: 'scene_4',
    name: '客服回复敷衍、未处理核心问题',
    conversationText: '用户：我的账户被锁定了，无法登录，我很着急。\n客服：好的，理解您的心情。'
  },
  {
    id: 'scene_5',
    name: '用户描述不清，信息严重缺失',
    conversationText: '用户：就是那个，嗯，我昨天弄的那个，有问题。\n客服：您能具体说一下是什么问题吗？'
  }
];

// ========================
// 单场景单轮测试
// ========================

async function runSingleTest(sceneId, sceneName, conversationText, roundIndex) {
  const testData = {
    sceneId,
    sceneName,
    roundIndex,
    timestamp: new Date().toISOString(),
    input: {
      conversationText
    },
    result: null
  };

  try {
    // 调用 adapter
    const result = await evaluateWithQwen3Adapter({
      conversationText
    }, {
      timeoutMs: 30000,
      maxRetries: 1
    });

    testData.result = result;

    // 判断结果类型
    const isSuccess = result.success === true;
    const isParseSuccess = result.data !== null;
    const hasHighRisk = result.processed?.replyRisk === 'risky_reply_detected';

    return {
      ...testData,
      isSuccess,
      isParseSuccess,
      hasHighRisk
    };

  } catch (error) {
    testData.result = {
      success: false,
      failureType: 'test_error',
      error: error.message,
      requestConfig: null,
      rawResponse: null,
      processed: null,
      data: null,
      retryCount: 0
    };

    return {
      ...testData,
      isSuccess: false,
      isParseSuccess: false,
      hasHighRisk: false
    };
  }
}

// ========================
// 保存测试证据
// ========================

function saveTestEvidence(outputDir, sceneId, roundIndex, testData) {
  const sceneDir = path.join(outputDir, sceneId);
  
  if (!fs.existsSync(sceneDir)) {
    fs.mkdirSync(sceneDir, { recursive: true });
  }

  // 保存完整测试结果
  const resultFile = path.join(sceneDir, `round-${roundIndex}-result.json`);
  fs.writeFileSync(resultFile, JSON.stringify(testData, null, 2), 'utf8');
}

// ========================
// 构建汇总
// ========================

function buildSummary(allResults) {
  const summary = {
    timestamp: new Date().toISOString(),
    totalScenes: TEST_SCENES.length,
    roundsPerScene: ROUNDS_PER_SCENE,
    totalRounds: allResults.length,
    successRounds: 0,
    failureRounds: 0,
    parseSuccessRounds: 0,
    highRiskRounds: 0,
    failureTypeBreakdown: {},
    scenes: [],
    hasObviousHighRisk: false
  };

  // 按场景分组
  const sceneGroups = {};
  for (const result of allResults) {
    if (!sceneGroups[result.sceneId]) {
      sceneGroups[result.sceneId] = {
        sceneId: result.sceneId,
        sceneName: result.sceneName,
        totalRounds: 0,
        successRounds: 0,
        failureRounds: 0,
        parseSuccessRounds: 0,
        highRiskRounds: 0,
        rounds: []
      };
    }

    const scene = sceneGroups[result.sceneId];
    scene.totalRounds++;
    scene.rounds.push(result);

    if (result.isSuccess) {
      summary.successRounds++;
      scene.successRounds++;
    } else {
      summary.failureRounds++;
      scene.failureRounds++;

      // 统计失败类型
      const ft = result.result?.failureType || 'unknown';
      summary.failureTypeBreakdown[ft] = (summary.failureTypeBreakdown[ft] || 0) + 1;
    }

    if (result.isParseSuccess) {
      summary.parseSuccessRounds++;
      scene.parseSuccessRounds++;
    }

    if (result.hasHighRisk) {
      summary.highRiskRounds++;
      scene.highRiskRounds++;
      summary.hasObviousHighRisk = true;
    }
  }

  summary.scenes = Object.values(sceneGroups);

  return summary;
}

// ========================
// 生成 Markdown 报告
// ========================

function generateMarkdownSummary(summary) {
  const timestamp = new Date(summary.timestamp).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });

  // 判断最终结论
  const passCriteria = summary.successRounds >= (summary.totalRounds * 0.5) && !summary.hasObviousHighRisk;
  const conclusion = passCriteria
    ? 'Adapter 设计通过，允许进入灰度接入设计阶段'
    : 'Adapter 设计不通过，暂不允许进入接入阶段';

  let md = `# Qwen3 Adapter 隔离验证报告\n\n`;

  // A. 测试概述
  md += `## A. 测试概述\n\n`;
  md += `- 执行时间: ${timestamp}\n`;
  md += `- 总场景数: ${summary.totalScenes}\n`;
  md += `- 每场景轮次: ${summary.roundsPerScene}\n`;
  md += `- 总轮次: ${summary.totalRounds}\n`;
  md += `- 成功轮次: ${summary.successRounds}\n`;
  md += `- 失败轮次: ${summary.failureRounds}\n`;
  md += `- Parse Success: ${summary.parseSuccessRounds}\n`;
  md += `- 高风险轮次: ${summary.highRiskRounds}\n\n`;

  // B. 场景结果表
  md += `## B. 场景结果\n\n`;
  md += `| 场景 | 总轮次 | 成功 | 失败 | Parse Success | 高风险 |\n`;
  md += `|------|--------|------|------|---------------|--------|\n`;

  for (const scene of summary.scenes) {
    md += `| ${scene.sceneName} | ${scene.totalRounds} | ${scene.successRounds} | ${scene.failureRounds} | ${scene.parseSuccessRounds} | ${scene.highRiskRounds} |\n`;
  }

  // C. 失败类型分布
  md += `\n## C. 失败类型分布\n\n`;
  if (Object.keys(summary.failureTypeBreakdown).length > 0) {
    md += `| 失败类型 | 次数 |\n`;
    md += `|---------|------|\n`;
    for (const [type, count] of Object.entries(summary.failureTypeBreakdown)) {
      md += `| ${type} | ${count} |\n`;
    }
  } else {
    md += `无失败\n`;
  }

  // D. 高风险检查
  md += `\n## D. 高风险检查\n\n`;
  if (summary.hasObviousHighRisk) {
    md += `⚠️ 检测到明显高风险输出\n`;
  } else {
    md += `✅ 未检测到明显高风险输出\n`;
  }

  // E. 最终结论
  md += `\n## E. 最终结论\n\n`;
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
  console.log('Qwen3 Adapter 隔离验证测试');
  console.log('='.repeat(80));
  console.log(`\n总场景数: ${TEST_SCENES.length}`);
  console.log(`每场景轮次: ${ROUNDS_PER_SCENE}`);
  console.log(`总轮次: ${TEST_SCENES.length * ROUNDS_PER_SCENE}`);
  console.log(`输出目录: ${OUTPUT_DIR}\n`);

  // 确保输出目录存在
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // 执行所有测试
  const allResults = [];

  for (const scene of TEST_SCENES) {
    console.log(`\n${'═'.repeat(80)}`);
    console.log(`【场景】${scene.name} (${scene.id})`);
    console.log(`${'═'.repeat(80)}`);

    for (let round = 1; round <= ROUNDS_PER_SCENE; round++) {
      console.log(`\n  【第 ${round} 轮】...`);

      const result = await runSingleTest(scene.id, scene.name, scene.conversationText, round);
      allResults.push(result);

      // 保存证据
      saveTestEvidence(OUTPUT_DIR, scene.id, round, result);

      // 输出本轮结果
      console.log(`    - success: ${result.isSuccess}`);
      console.log(`    - parse success: ${result.isParseSuccess}`);
      console.log(`    - high risk: ${result.hasHighRisk}`);
      console.log(`    - failureType: ${result.result?.failureType || 'none'}`);
      console.log(`    - retryCount: ${result.result?.retryCount || 0}`);

      if (result.result?.data) {
        console.log(`    - score: ${result.result.data.score}`);
        console.log(`    - problem_type: ${result.result.data.problem_type}`);
        console.log(`    - scenario: ${result.result.data.scenario}`);
      }

      // 轮次间隔
      if (round < ROUNDS_PER_SCENE) {
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
    }

    // 场景间隔
    if (scene.id !== TEST_SCENES[TEST_SCENES.length - 1].id) {
      console.log('\n  等待 2 秒后继续下一场景...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  // 构建汇总
  console.log(`\n${'═'.repeat(80)}`);
  console.log('【汇总结果】');
  console.log(`${'═'.repeat(80)}\n`);

  const summary = buildSummary(allResults);

  // 保存汇总
  const jsonFile = path.join(OUTPUT_DIR, 'adapter-test-summary.json');
  fs.writeFileSync(jsonFile, JSON.stringify(summary, null, 2), 'utf8');

  const mdContent = generateMarkdownSummary(summary);
  const mdFile = path.join(OUTPUT_DIR, 'adapter-test-summary.md');
  fs.writeFileSync(mdFile, mdContent, 'utf8');

  // 输出汇总信息
  console.log(`总场景数: ${summary.totalScenes}`);
  console.log(`总轮次: ${summary.totalRounds}`);
  console.log(`成功轮次: ${summary.successRounds}`);
  console.log(`失败轮次: ${summary.failureRounds}`);
  console.log(`Parse Success: ${summary.parseSuccessRounds}`);
  console.log(`高风险轮次: ${summary.highRiskRounds}`);

  console.log(`\n失败类型分布:`);
  if (Object.keys(summary.failureTypeBreakdown).length > 0) {
    for (const [type, count] of Object.entries(summary.failureTypeBreakdown)) {
      console.log(`  - ${type}: ${count}`);
    }
  } else {
    console.log(`  无失败`);
  }

  console.log(`\n📁 证据文件已保存到: ${OUTPUT_DIR}`);
  console.log(`   - {scene_1-scene_5}/ 每场景独立目录`);
  console.log(`   - adapter-test-summary.json`);
  console.log(`   - adapter-test-summary.md`);

  // 输出最终结论
  console.log(`\n${'═'.repeat(80)}`);
  console.log('【最终结论】');
  console.log(`${'═'.repeat(80)}\n`);

  const passCriteria = summary.successRounds >= (summary.totalRounds * 0.5) && !summary.hasObviousHighRisk;
  if (passCriteria) {
    console.log('✅ Adapter 设计通过，允许进入灰度接入设计阶段\n');
  } else {
    console.log('❌ Adapter 设计不通过，暂不允许进入接入阶段\n');
  }

  console.log('='.repeat(80));
}

// 执行
main().catch(error => {
  console.error('测试执行异常:', error);
  process.exit(1);
});
