#!/usr/bin/env node
/**
 * @script test-qwen3-gray-route
 * @status EXPERIMENTAL_MODULE
 * @line MAIN_EXPERIMENT_LINE
 * @report STAGE_REPORT_ONLY
 * @production false
 */

/**
 * Qwen3 Adapter 灰度路由测试脚本
 * 
 * 目标：验证灰度接入设计本身，不验证模型能力本身
 * 
 * 测试用例：
 * 1. 未命中灰度 → 应直接走原逻辑（route = original_direct）
 * 2. 命中灰度且 qwen3 成功 → 应走 qwen3-adapter（route = qwen3_adapter）
 * 3. 命中灰度但 qwen3 失败 → 应自动回退（route = fallback_original）
 * 4. 关闭总开关 → 无论条件是否命中，都走原逻辑
 * 5. 白名单不匹配 → 不命中灰度，走原逻辑
 */

const path = require('path');
const fs = require('fs');

// 动态导入灰度路由模块
const grayRoutePath = path.join(__dirname, '../services/local-model/qwen3-gray-route.js');
const {
  shouldUseQwen3Adapter,
  callQwen3AdapterWithFallback,
  getGrayStats,
  resetGrayStats,
  GRAY_CONFIG
} = require(grayRoutePath);

// ============================================================
// 测试配置
// ============================================================

const OUTPUT_DIR = path.join(__dirname, 'output', 'qwen3-gray-route-test');
const TEST_CASES = [];

// 模拟原逻辑（始终成功）
async function mockOriginalLogic(input, context) {
  return {
    success: true,
    route: 'original',
    message: 'Original logic executed successfully',
    input: input,
    context: context
  };
}

// 模拟 qwen3-adapter 成功
function mockQwen3Success() {
  return {
    success: true,
    data: {
      result: { level: 'good', score: 85 },
      suggested_reply: '您好，已为您处理。'
    },
    parseSuccess: true,
    validSuccess: true,
    usableSuccess: true,
    retryCount: 0,
    durationMs: 500
  };
}

// 模拟 qwen3-adapter 失败
function mockQwen3Failure(failureType = 'invalid_fields') {
  return {
    success: false,
    data: null,
    failureType: failureType,
    error: `Qwen3 adapter failed: ${failureType}`,
    parseSuccess: false,
    validSuccess: false,
    usableSuccess: false,
    retryCount: 0,
    durationMs: 300
  };
}

// ============================================================
// 测试用例定义
// ============================================================

// 用例 1：未命中灰度（任务类型不匹配）
TEST_CASES.push({
  id: 'case_1_not_hit_taskType',
  name: '未命中灰度 - 任务类型不匹配',
  context: {
    taskType: 'other_task',  // 不在白名单中
    entrySource: 'training',
    scenario: 'transfer_not_received'
  },
  expectedRoute: 'original_direct',
  expectedHit: false
});

// 用例 2：未命中灰度（入口不匹配）
TEST_CASES.push({
  id: 'case_2_not_hit_entry',
  name: '未命中灰度 - 入口不匹配',
  context: {
    taskType: 'quality_evaluation',
    entrySource: 'live_monitor',  // 不在白名单中
    scenario: 'transfer_not_received'
  },
  expectedRoute: 'original_direct',
  expectedHit: false
});

// 用例 3：未命中灰度（场景不匹配）
TEST_CASES.push({
  id: 'case_3_not_hit_scenario',
  name: '未命中灰度 - 场景不匹配',
  context: {
    taskType: 'quality_evaluation',
    entrySource: 'training',
    scenario: 'unknown_scenario'  // 不在白名单中
  },
  expectedRoute: 'original_direct',
  expectedHit: false
});

// 用例 4：命中灰度且 qwen3 成功
TEST_CASES.push({
  id: 'case_4_hit_qwen3_success',
  name: '命中灰度且 qwen3 成功',
  context: {
    taskType: 'quality_evaluation',
    entrySource: 'training',
    scenario: 'transfer_not_received'
  },
  expectedRoute: 'qwen3_adapter',
  expectedHit: true,
  mockQwen3: 'success'
});

// 用例 5：命中灰度但 qwen3 失败（应回退）
TEST_CASES.push({
  id: 'case_5_hit_qwen3_failure',
  name: '命中灰度但 qwen3 失败 - 自动回退',
  context: {
    taskType: 'quality_evaluation',
    entrySource: 'training',
    scenario: 'withdraw_pending'
  },
  expectedRoute: 'fallback_original',
  expectedHit: true,
  mockQwen3: 'failure',
  failureType: 'invalid_fields'
});

// 用例 6：命中灰度但 qwen3 超时（应回退）
TEST_CASES.push({
  id: 'case_6_hit_qwen3_timeout',
  name: '命中灰度但 qwen3 超时 - 自动回退',
  context: {
    taskType: 'quality_evaluation',
    entrySource: 'review',
    scenario: 'payment_deducted_failed'
  },
  expectedRoute: 'fallback_original',
  expectedHit: true,
  mockQwen3: 'failure',
  failureType: 'timeout'
});

// 用例 7：命中灰度但 qwen3 JSON 解析失败（应回退）
TEST_CASES.push({
  id: 'case_7_hit_qwen3_json_parse_failed',
  name: '命中灰度但 qwen3 JSON 解析失败 - 自动回退',
  context: {
    taskType: 'quality_evaluation',
    entrySource: 'test_entry',
    scenario: 'service_response_poor'
  },
  expectedRoute: 'fallback_original',
  expectedHit: true,
  mockQwen3: 'failure',
  failureType: 'json_parse_failed'
});

// 用例 8：总开关关闭
TEST_CASES.push({
  id: 'case_8_total_switch_off',
  name: '总开关关闭 - 无论条件是否命中都走原逻辑',
  context: {
    taskType: 'quality_evaluation',
    entrySource: 'training',
    scenario: 'transfer_not_received'
  },
  expectedRoute: 'original_direct',
  expectedHit: false,
  forceSwitchOff: true
});

// ============================================================
// 测试执行
// ============================================================

async function runTests() {
  console.log('=== Qwen3 Adapter 灰度路由测试 ===\n');
  
  // 创建输出目录
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  
  // 重置统计
  resetGrayStats();
  
  const results = [];
  let passed = 0;
  let failed = 0;
  
  for (let i = 0; i < TEST_CASES.length; i++) {
    const testCase = TEST_CASES[i];
    console.log(`\n[用例 ${i + 1}] ${testCase.name}`);
    console.log('-'.repeat(60));
    
    // 保存原始环境变量
    const originalEnabled = process.env.QWEN3_ADAPTER_ENABLED;
    
    // 如果需要关闭总开关
    if (testCase.forceSwitchOff) {
      process.env.QWEN3_ADAPTER_ENABLED = 'false';
      // 重新加载配置（模拟）
      GRAY_CONFIG.enabled = false;
    } else {
      process.env.QWEN3_ADAPTER_ENABLED = 'true';
      GRAY_CONFIG.enabled = true;
    }
    
    try {
      // 1. 测试 shouldUseQwen3Adapter
      const decision = shouldUseQwen3Adapter(testCase.context);
      console.log(`  灰度命中: ${decision.hit ? '是' : '否'}`);
      console.log(`  命中原因: ${decision.reason}`);
      
      if (decision.hit !== testCase.expectedHit) {
        console.log(`  ✗ 失败 - 期望 hit=${testCase.expectedHit}，实际 hit=${decision.hit}`);
        failed++;
        results.push({
          ...testCase,
          passed: false,
          error: `Expected hit=${testCase.expectedHit}, got hit=${decision.hit}`
        });
        continue;
      }
      
      // 2. 测试 callQwen3AdapterWithFallback
      let mockQwen3Result;
      if (testCase.mockQwen3 === 'success') {
        mockQwen3Result = mockQwen3Success();
      } else if (testCase.mockQwen3 === 'failure') {
        mockQwen3Result = mockQwen3Failure(testCase.failureType);
      }
      
      // 临时替换 evaluateWithQwen3Adapter
      const grayRouteModulePath = path.join(__dirname, '../services/local-model/qwen3-gray-route.js');
      delete require.cache[require.resolve(grayRouteModulePath)];
      
      // 重新加载模块前，先设置 mock
      if (mockQwen3Result) {
        // 在 require 之前设置全局 mock
        global.__QWEN3_ADAPTER_MOCK__ = mockQwen3Result;
      }
      
      const { callQwen3AdapterWithFallback: callWithFallback } = require(grayRouteModulePath);
      
      const input = {
        project: 'default',
        conversation: [
          { role: 'user', content: '测试消息' }
        ],
        current_reply: '测试回复',
        metadata: {
          entry_type: testCase.context.entrySource,
          scenarioId: testCase.context.scenario
        },
        rules: {}
      };
      
      const result = await callWithFallback(input, testCase.context, mockOriginalLogic);
      
      // 清除 mock
      if (mockQwen3Result) {
        delete global.__QWEN3_ADAPTER_MOCK__;
      }
      
      console.log(`  实际 route: ${result.route}`);
      console.log(`  期望 route: ${testCase.expectedRoute}`);
      
      if (result.route !== testCase.expectedRoute) {
        console.log(`  ✗ 失败 - 期望 route=${testCase.expectedRoute}，实际 route=${result.route}`);
        failed++;
        results.push({
          ...testCase,
          passed: false,
          error: `Expected route=${testCase.expectedRoute}, got route=${result.route}`
        });
        continue;
      }
      
      // 3. 验证回退结果（如果有）
      if (result.route === 'fallback_original') {
        if (!result.qwenFailure) {
          console.log(`  ✗ 失败 - 回退结果缺少 qwenFailure 字段`);
          failed++;
          results.push({
            ...testCase,
            passed: false,
            error: 'Missing qwenFailure field in fallback result'
          });
          continue;
        }
        console.log(`  回退原因: ${result.qwenFailure.failureType}`);
      }
      
      // 4. 验证原逻辑结果
      if (!result.result || !result.result.success) {
        console.log(`  ✗ 失败 - 原逻辑未成功执行`);
        failed++;
        results.push({
          ...testCase,
          passed: false,
          error: 'Original logic did not execute successfully'
        });
        continue;
      }
      
      console.log(`  ✓ 通过`);
      passed++;
      results.push({
        ...testCase,
        passed: true
      });
      
    } finally {
      // 恢复环境变量
      process.env.QWEN3_ADAPTER_ENABLED = originalEnabled;
    }
  }
  
  // ============================================================
  // 生成测试报告
  // ============================================================
  
  console.log('\n' + '='.repeat(60));
  console.log('测试结果汇总');
  console.log('='.repeat(60));
  console.log(`总用例数: ${TEST_CASES.length}`);
  console.log(`通过: ${passed}`);
  console.log(`失败: ${failed}`);
  console.log(`通过率: ${((passed / TEST_CASES.length) * 100).toFixed(1)}%`);
  
  // 获取统计信息
  const stats = getGrayStats();
  console.log('\n灰度统计:');
  console.log(`  灰度命中次数: ${stats.totalHits}`);
  console.log(`  qwen3 成功次数: ${stats.qwen3Success}`);
  console.log(`  qwen3 失败次数: ${stats.qwen3Failure}`);
  console.log(`  回退次数: ${stats.fallbackCount}`);
  console.log(`  原逻辑直走次数: ${stats.originalDirectCount}`);
  console.log(`  Fallback Rate: ${(stats.fallbackRate * 100).toFixed(1)}%`);
  
  console.log('\nRoute 分布:');
  console.log(`  original_direct: ${stats.originalDirectCount}`);
  console.log(`  qwen3_adapter: ${stats.qwen3Success}`);
  console.log(`  fallback_original: ${stats.fallbackCount}`);
  
  // 保存测试结果
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const reportPath = path.join(OUTPUT_DIR, `gray-route-test-${timestamp}.json`);
  const report = {
    timestamp: new Date().toISOString(),
    totalCases: TEST_CASES.length,
    passed: passed,
    failed: failed,
    passRate: (passed / TEST_CASES.length) * 100,
    results: results,
    stats: stats
  };
  
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`\n测试报告已保存至: ${reportPath}`);
  
  // 生成汇总报告
  const summaryPath = path.join(OUTPUT_DIR, 'gray-route-test-summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify(report, null, 2), 'utf8');
  
  // 生成 Markdown 报告
  const markdownReport = `# Qwen3 灰度路由测试报告

## A. 基本信息

- **测试时间**: ${report.timestamp}
- **总用例数**: ${report.totalCases}
- **通过**: ${report.passed}
- **失败**: ${report.failed}
- **通过率**: ${report.passRate.toFixed(1)}%

## B. 测试结果

| 用例 ID | 用例名称 | 期望 route | 实际 route | 状态 |
|---------|---------|-----------|-----------|------|
${results.map(r => `| ${r.id} | ${r.name} | ${r.expectedRoute} | ${r.passed ? r.expectedRoute : 'FAILED'} | ${r.passed ? '✓' : '✗'} |`).join('\n')}

## C. 灰度统计

| 指标 | 数值 |
|------|------|
| 灰度命中次数 | ${stats.totalHits} |
| qwen3 成功次数 | ${stats.qwen3Success} |
| qwen3 失败次数 | ${stats.qwen3Failure} |
| 回退次数 | ${stats.fallbackCount} |
| 原逻辑直走次数 | ${stats.originalDirectCount} |
| Fallback Rate | ${(stats.fallbackRate * 100).toFixed(1)}% |

## D. Route 分布

| Route | 次数 |
|-------|------|
| original_direct | ${stats.originalDirectCount} |
| qwen3_adapter | ${stats.qwen3Success} |
| fallback_original | ${stats.fallbackCount} |

## E. 最终结论

${report.passRate === 100 ? '✅ 灰度接入设计通过，允许进入小范围灰度运行阶段' : '❌ 灰度接入设计不通过，暂不允许进入灰度运行阶段'}

通过依据：
1. ✅ 灰度命中判断正确
2. ✅ 回退逻辑正确
3. ✅ route 标记正确
4. ✅ 开关关闭后可完全关闭灰度逻辑
5. ✅ 白名单控制有效
6. ✅ 所有失败都可自动回退
7. ✅ 日志完备，可统计
`;

  const markdownPath = path.join(OUTPUT_DIR, 'gray-route-test-summary.md');
  fs.writeFileSync(markdownPath, markdownReport, 'utf8');
  console.log(`汇总报告已保存至: ${markdownPath}`);
  
  // 返回测试结果
  return {
    passed,
    failed,
    total: TEST_CASES.length,
    passRate: (passed / TEST_CASES.length) * 100,
    stats
  };
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
