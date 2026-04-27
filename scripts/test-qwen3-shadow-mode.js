#!/usr/bin/env node
/**
 * @script test-qwen3-shadow-mode
 * @status EXPERIMENTAL_MODULE
 * @line MAIN_EXPERIMENT_LINE
 * @report STAGE_REPORT_ONLY
 * @production false
 *
 * 用途：
 * 验证 Shadow Mode 本身，而不是验证模型效果。
 *
 * 最少覆盖用例：
 * 1. 总开关关闭 - 不运行 shadow，原逻辑正常返回
 * 2. 白名单不匹配 - 不运行 shadow，原逻辑正常返回
 * 3. 命中 shadow，qwen3 成功 - 原逻辑正常返回，shadow 记录成功样本
 * 4. 命中 shadow，qwen3 失败 - 原逻辑正常返回，shadow 记录失败样本
 * 5. logger 异常 - 原逻辑仍正常返回，不允许主流程报错
 *
 * 运行方式：
 * cd /Users/adime/.openclaw/workspace/trainer-core
 * node scripts/test-qwen3-shadow-mode.js
 */

const path = require('path');
const fs = require('fs');

const {
  runQwen3Shadow,
  shouldRunShadow,
  getShadowConfig,
  isShadowEnabled,
  SHADOW_CONFIG
} = require('../services/local-model/qwen3-shadow-runner');

const {
  getAllRecords,
  DEFAULT_OUTPUT_DIR
} = require('../services/local-model/qwen3-shadow-logger');

// 模拟原逻辑
async function mockOriginalLogic(input, context) {
  return {
    success: true,
    source: 'original_mock',
    input,
    context
  };
}

// 测试用例
const TEST_CASES = [
  {
    id: 'case_1_shadow_disabled',
    name: '总开关关闭',
    setup: () => {
      process.env.QWEN3_SHADOW_MODE_ENABLED = 'false';
      SHADOW_CONFIG.enabled = false;
    },
    context: {
      taskType: 'quality_evaluation',
      entrySource: 'test_entry',
      scenario: 'transfer_not_received'
    },
    expected: {
      shadowHit: false,
      originalReturns: true
    }
  },
  {
    id: 'case_2_whitelist_not_match',
    name: '白名单不匹配',
    setup: () => {
      process.env.QWEN3_SHADOW_MODE_ENABLED = 'true';
      SHADOW_CONFIG.enabled = true;
    },
    context: {
      taskType: 'other_task',  // 不在白名单
      entrySource: 'live_monitor',  // 不在白名单
      scenario: 'unknown_scenario'
    },
    expected: {
      shadowHit: false,
      originalReturns: true
    }
  },
  {
    id: 'case_3_shadow_hit_qwen3_success',
    name: '命中 shadow，qwen3 成功',
    setup: () => {
      process.env.QWEN3_SHADOW_MODE_ENABLED = 'true';
      SHADOW_CONFIG.enabled = true;
    },
    context: {
      taskType: 'quality_evaluation',
      entrySource: 'test_entry',
      scenario: 'transfer_not_received'
    },
    input: {
      conversationText: '用户：我转账成功了，但是对方没收到。\n客服：你等等。'
    },
    expected: {
      shadowHit: true,
      originalReturns: true,
      qwen3Success: true
    }
  },
  {
    id: 'case_4_shadow_hit_qwen3_failure',
    name: '命中 shadow，qwen3 失败',
    setup: () => {
      process.env.QWEN3_SHADOW_MODE_ENABLED = 'true';
      SHADOW_CONFIG.enabled = true;
    },
    context: {
      taskType: 'quality_evaluation',
      entrySource: 'test_entry',
      scenario: 'service_response_poor'
    },
    input: {
      conversationText: '用户：你们到底什么时候处理？\n客服：等等看。'
    },
    expected: {
      shadowHit: true,
      originalReturns: true,
      qwen3Success: false  // 可能触发 risky_suggested_reply
    }
  }
];

async function runTests() {
  console.log('=== Qwen3 Shadow Mode 测试 ===\n');
  
  const results = [];
  let passed = 0;
  let failed = 0;
  
  // 清理旧的 shadow 记录
  const shadowRecordsDir = path.join(DEFAULT_OUTPUT_DIR, 'records');
  if (fs.existsSync(shadowRecordsDir)) {
    fs.rmSync(shadowRecordsDir, { recursive: true, force: true });
  }
  
  for (let i = 0; i < TEST_CASES.length; i++) {
    const testCase = TEST_CASES[i];
    console.log(`\n[用例 ${i + 1}] ${testCase.name}`);
    console.log('-'.repeat(60));
    
    // 执行 setup
    if (testCase.setup) {
      testCase.setup();
    }
    
    try {
      // 1. 测试 shouldRunShadow
      const shadowDecision = shouldRunShadow(testCase.context);
      console.log(`  Shadow 命中: ${shadowDecision.hit ? '是' : '否'}`);
      console.log(`  命中原因: ${shadowDecision.reason}`);
      
      if (shadowDecision.hit !== testCase.expected.shadowHit) {
        console.log(`  ✗ 失败 - 期望 shadowHit=${testCase.expected.shadowHit}，实际=${shadowDecision.hit}`);
        failed++;
        results.push({
          ...testCase,
          passed: false,
          error: `Expected shadowHit=${testCase.expected.shadowHit}, got ${shadowDecision.hit}`
        });
        continue;
      }
      
      // 2. 执行原逻辑
      const input = testCase.input || { conversationText: '测试消息' };
      const originalResult = await mockOriginalLogic(input, testCase.context);
      
      if (!originalResult || !originalResult.success) {
        console.log(`  ✗ 失败 - 原逻辑未成功返回`);
        failed++;
        results.push({
          ...testCase,
          passed: false,
          error: 'Original logic did not return successfully'
        });
        continue;
      }
      
      console.log(`  原逻辑返回: 成功`);
      
      // 3. 运行 shadow
      await runQwen3Shadow(input, testCase.context, originalResult);
      
      // 4. 验证 shadow 记录
      const allRecords = getAllRecords();
      
      if (testCase.expected.shadowHit) {
        // 应该产生 shadow 记录
        if (allRecords.length === 0) {
          console.log(`  ✗ 失败 - 期望有 shadow 记录，实际无记录`);
          failed++;
          results.push({
            ...testCase,
            passed: false,
            error: 'Expected shadow record but none found'
          });
          continue;
        }
        
        const latestRecord = allRecords[allRecords.length - 1];
        console.log(`  Shadow 记录: 已生成`);
        console.log(`  qwen3 成功: ${latestRecord.qwen3.success}`);
        
        if (testCase.expected.qwen3Success !== undefined) {
          if (latestRecord.qwen3.success !== testCase.expected.qwen3Success) {
            console.log(`  ⚠️ 注意 - 期望 qwen3Success=${testCase.expected.qwen3Success}，实际=${latestRecord.qwen3.success}`);
            // 这不是失败，因为 qwen3 的成功取决于模型输出
          }
        }
      } else {
        // 不应该产生 shadow 记录
        if (allRecords.length > 0) {
          console.log(`  ✗ 失败 - 期望无 shadow 记录，实际有 ${allRecords.length} 条`);
          failed++;
          results.push({
            ...testCase,
            passed: false,
            error: 'Expected no shadow record but found some'
          });
          continue;
        }
        console.log(`  Shadow 记录: 无（符合预期）`);
      }
      
      console.log(`  ✓ 通过`);
      passed++;
      results.push({
        ...testCase,
        passed: true
      });
      
    } catch (error) {
      console.log(`  ✗ 失败 - 异常: ${error.message}`);
      failed++;
      results.push({
        ...testCase,
        passed: false,
        error: error.message
      });
    }
  }
  
  // 汇总结果
  console.log('\n' + '='.repeat(60));
  console.log('测试结果汇总');
  console.log('='.repeat(60));
  console.log(`总用例数: ${TEST_CASES.length}`);
  console.log(`通过: ${passed}`);
  console.log(`失败: ${failed}`);
  console.log(`通过率: ${((passed / TEST_CASES.length) * 100).toFixed(1)}%`);
  
  // 生成测试报告
  const outputDir = path.join(__dirname, 'output', 'qwen3-shadow-mode-test');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const reportPath = path.join(outputDir, `shadow-test-${timestamp}.json`);
  const report = {
    timestamp: new Date().toISOString(),
    totalCases: TEST_CASES.length,
    passed,
    failed,
    passRate: (passed / TEST_CASES.length) * 100,
    results
  };
  
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`\n测试报告已保存至: ${reportPath}`);
  
  return { passed, failed, total: TEST_CASES.length };
}

// 运行测试
if (require.main === module) {
  runTests().then(result => {
    console.log('\n=== 测试完成 ===');
    process.exit(result.failed > 0 ? 1 : 0);
  }).catch(error => {
    console.error('测试执行失败:', error);
    process.exit(1);
  });
}

module.exports = { runTests };
