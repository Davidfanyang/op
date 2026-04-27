#!/usr/bin/env node
/**
 * @script test-qwen3-gray-smoke
 * @status EXPERIMENTAL_MODULE
 * @line MAIN_EXPERIMENT_LINE
 * @report STAGE_REPORT_ONLY
 * @production false
 *
 * 用途：
 * 1. 用多个低风险场景验证 qwen3 灰度是否真正命中
 * 2. 验证 route / grayHit / fallback / failureType 是否正常
 * 3. 输出清晰的汇总结果，便于人工验收
 *
 * 运行方式：
 * cd /Users/adime/.openclaw/workspace/trainer-core
 * export QWEN3_ADAPTER_ENABLED=true
 * export QWEN3_ADAPTER_TASK_TYPES=quality_evaluation
 * export QWEN3_ADAPTER_ENTRY_WHITELIST=test_entry
 * export QWEN3_ADAPTER_SCENARIO_WHITELIST=transfer_not_received,withdraw_pending,payment_deducted_failed,service_response_poor,info_missing
 * export QWEN3_ADAPTER_SAMPLE_RATE=0
 * node scripts/test-qwen3-gray-smoke.js
 */

const fs = require('fs');
const path = require('path');
const {
  callQwen3AdapterWithFallback,
} = require('../services/local-model/qwen3-gray-route');

const OUTPUT_DIR = path.join(
  __dirname,
  'output',
  'qwen3-gray-smoke'
);

const TEST_CASES = [
  {
    id: 'scene_1',
    name: '转账成功但对方未收到',
    context: {
      taskType: 'quality_evaluation',
      entrySource: 'test_entry',
      scenario: 'transfer_not_received',
    },
    input: {
      conversationText: `用户：我转账成功了，但是对方没收到。
客服：你等等。`,
    },
  },
  {
    id: 'scene_2',
    name: '提现一直没到账',
    context: {
      taskType: 'quality_evaluation',
      entrySource: 'test_entry',
      scenario: 'withdraw_pending',
    },
    input: {
      conversationText: `用户：我昨晚提现到现在都没到账。
客服：再等等。`,
    },
  },
  {
    id: 'scene_3',
    name: '支付失败但被扣款',
    context: {
      taskType: 'quality_evaluation',
      entrySource: 'test_entry',
      scenario: 'payment_deducted_failed',
    },
    input: {
      conversationText: `用户：显示支付失败，但是钱被扣了。
客服：这个我也不清楚。`,
    },
  },
  {
    id: 'scene_4',
    name: '客服回复敷衍',
    context: {
      taskType: 'quality_evaluation',
      entrySource: 'test_entry',
      scenario: 'service_response_poor',
    },
    input: {
      conversationText: `用户：你们到底什么时候处理？
客服：等等看。`,
    },
  },
  {
    id: 'scene_5',
    name: '用户信息严重缺失',
    context: {
      taskType: 'quality_evaluation',
      entrySource: 'test_entry',
      scenario: 'info_missing',
    },
    input: {
      conversationText: `用户：有问题。
客服：什么问题？`,
    },
  },
];

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function writeText(filePath, text) {
  fs.writeFileSync(filePath, text, 'utf8');
}

async function originalLogic(input, context) {
  return {
    success: true,
    source: 'original_mock',
    input,
    context,
  };
}

function extractFailureType(result) {
  if (!result) return null;
  if (result.qwenFailure && result.qwenFailure.failureType) {
    return result.qwenFailure.failureType;
  }
  if (result.result && result.result.failureType) {
    return result.result.failureType;
  }
  return null;
}

function extractFallbackUsed(result) {
  return result && result.route === 'fallback_original';
}

function extractQwenSuccess(result) {
  return !!(
    result &&
    result.route === 'qwen3_adapter' &&
    result.result &&
    result.result.success === true
  );
}

function extractReplyRisk(result) {
  if (
    result &&
    result.result &&
    result.result.processed &&
    typeof result.result.processed.replyRisk === 'string'
  ) {
    return result.result.processed.replyRisk;
  }
  return null;
}

function extractValidationErrors(result) {
  if (
    result &&
    result.result &&
    result.result.processed &&
    Array.isArray(result.result.processed.validationErrors)
  ) {
    return result.result.processed.validationErrors;
  }
  return [];
}

async function runOneCase(testCase) {
  const start = Date.now();
  try {
    const result = await callQwen3AdapterWithFallback(
      testCase.input,
      testCase.context,
      originalLogic
    );
    const durationMs = Date.now() - start;
    const failureType = extractFailureType(result);
    const fallbackUsed = extractFallbackUsed(result);
    const qwenSuccess = extractQwenSuccess(result);
    const replyRisk = extractReplyRisk(result);
    const validationErrors = extractValidationErrors(result);
    return {
      id: testCase.id,
      name: testCase.name,
      success: true,
      durationMs,
      grayHit: result.route !== 'original_direct',
      route: result.route,
      qwenSuccess,
      fallbackUsed,
      failureType,
      replyRisk,
      validationErrors,
      raw: result,
    };
  } catch (error) {
    return {
      id: testCase.id,
      name: testCase.name,
      success: false,
      durationMs: Date.now() - start,
      grayHit: null,
      route: null,
      qwenSuccess: false,
      fallbackUsed: false,
      failureType: 'script_exception',
      replyRisk: null,
      validationErrors: [],
      error: error.message,
      stack: error.stack,
      raw: null,
    };
  }
}

function buildSummary(results) {
  const total = results.length;
  const routeCounts = {
    qwen3_adapter: 0,
    fallback_original: 0,
    original_direct: 0,
    unknown: 0,
  };
  const failureTypeCounts = {};
  let qwenSuccessCount = 0;
  let fallbackCount = 0;
  let grayHitCount = 0;
  let riskyReplyCount = 0;
  let scriptFailureCount = 0;

  for (const item of results) {
    const route = item.route || 'unknown';
    routeCounts[route] = (routeCounts[route] || 0) + 1;

    if (item.qwenSuccess) qwenSuccessCount++;
    if (item.fallbackUsed) fallbackCount++;
    if (item.grayHit) grayHitCount++;
    if (item.replyRisk === 'risky_reply_detected') riskyReplyCount++;
    if (!item.success) scriptFailureCount++;

    if (item.failureType) {
      failureTypeCounts[item.failureType] =
        (failureTypeCounts[item.failureType] || 0) + 1;
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    total,
    qwenSuccessCount,
    fallbackCount,
    grayHitCount,
    riskyReplyCount,
    scriptFailureCount,
    routeCounts,
    failureTypeCounts,
    pass:
      scriptFailureCount === 0 &&
      grayHitCount >= 1 &&
      (qwenSuccessCount >= 1 || fallbackCount >= 1),
  };
}

function buildMarkdown(summary, results) {
  const lines = [];
  lines.push('# Qwen3 灰度冒烟测试报告');
  lines.push('');
  lines.push(`- 生成时间：${summary.generatedAt}`);
  lines.push(`- 总场景数：${summary.total}`);
  lines.push(`- grayHit 次数：${summary.grayHitCount}`);
  lines.push(`- qwen3 成功次数：${summary.qwenSuccessCount}`);
  lines.push(`- fallback 次数：${summary.fallbackCount}`);
  lines.push(`- 高风险回复次数：${summary.riskyReplyCount}`);
  lines.push(`- 脚本异常次数：${summary.scriptFailureCount}`);
  lines.push('');
  lines.push('## Route 统计');
  lines.push('');
  lines.push(`- qwen3_adapter: ${summary.routeCounts.qwen3_adapter || 0}`);
  lines.push(`- fallback_original: ${summary.routeCounts.fallback_original || 0}`);
  lines.push(`- original_direct: ${summary.routeCounts.original_direct || 0}`);
  lines.push(`- unknown: ${summary.routeCounts.unknown || 0}`);
  lines.push('');
  lines.push('## 场景结果');
  lines.push('');
  lines.push('| 场景 | grayHit | route | qwenSuccess | fallback | failureType | replyRisk |');
  lines.push('|---|---:|---|---:|---:|---|---|');

  for (const item of results) {
    lines.push(
      `| ${item.name} | ${String(item.grayHit)} | ${item.route || '-'} | ${String(
        item.qwenSuccess
      )} | ${String(item.fallbackUsed)} | ${item.failureType || '-'} | ${item.replyRisk || '-'} |`
    );
  }

  lines.push('');
  lines.push('## 最终结论');
  lines.push('');
  lines.push(summary.pass ? '✅ PASS' : '❌ FAIL');
  lines.push('');

  return lines.join('\n');
}

async function main() {
  ensureDir(OUTPUT_DIR);

  const results = [];

  for (const testCase of TEST_CASES) {
    console.log(`\n[RUN] ${testCase.id} - ${testCase.name}`);
    const result = await runOneCase(testCase);
    results.push(result);

    const caseDir = path.join(OUTPUT_DIR, testCase.id);
    ensureDir(caseDir);
    writeJson(path.join(caseDir, 'input.json'), testCase.input);
    writeJson(path.join(caseDir, 'context.json'), testCase.context);
    writeJson(path.join(caseDir, 'result.json'), result);

    console.log(
      `[DONE] route=${result.route} grayHit=${result.grayHit} qwenSuccess=${result.qwenSuccess} fallback=${result.fallbackUsed} failureType=${result.failureType}`
    );
  }

  const summary = buildSummary(results);
  writeJson(path.join(OUTPUT_DIR, 'summary.json'), summary);
  writeJson(path.join(OUTPUT_DIR, 'results.json'), results);
  writeText(path.join(OUTPUT_DIR, 'summary.md'), buildMarkdown(summary, results));

  console.log('\n==============================');
  console.log('Qwen3 灰度冒烟测试汇总');
  console.log('==============================');
  console.log(`总场景数: ${summary.total}`);
  console.log(`grayHit: ${summary.grayHitCount}`);
  console.log(`qwen3 成功: ${summary.qwenSuccessCount}`);
  console.log(`fallback: ${summary.fallbackCount}`);
  console.log(`高风险回复: ${summary.riskyReplyCount}`);
  console.log(`脚本异常: ${summary.scriptFailureCount}`);
  console.log(`结论: ${summary.pass ? 'PASS' : 'FAIL'}`);
  console.log(`输出目录: ${OUTPUT_DIR}`);

  process.exit(summary.pass ? 0 : 1);
}

main().catch((error) => {
  console.error('脚本执行异常:', error);
  process.exit(1);
});
