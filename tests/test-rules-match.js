/**
 * 规则承接维度验证测试
 * 
 * 测试目标：
 * 1. 第一层命中：主题标题精确命中
 * 2. 第二层命中：关键词组合命中
 * 3. 第三层命中：产品域 + 场景域兜底命中
 * 4. 全部不命中：场景、FAQ、流程、话术全部不匹配
 * 5. 验收标准：FAQ 内典型问题不能再误判 unknown
 */

const { defaultClassifier: problemClassifier } = require('../services/problem-classifier-service');

console.log('========== 规则承接维度验证测试 ==========\n');

async function runRulesTests() {
  let passCount = 0;
  let totalCount = 0;

  // ==================== 测试 1: 第一层命中 - 主题标题精确命中 ====================
  console.log('【测试 1】规则命中第一层：主题标题精确命中');
  totalCount++;

  try {
    // 使用 scenarios.json 中的真实场景
    const testEvaluation = {
      scenario: 'lanton_bank_transfer',
      stage: '解答',
      judgement: '客服回答准确，提供了完整的转账指引',
      summary: '用户咨询银行转账方式，客服正确回答了扫码转账和Bakong转账两种方式',
      analysis: {
        risks: [],
        quality_score: 0.95,
        compliance_check: 'pass'
      },
      confidence: 0.92
    };

    const result = await problemClassifier.classifyProblem(testEvaluation);
    
    if (result.problem_type === 'known' && 
        result.ruleMatchStatus === 'matched' &&
        result.matchedRuleIds.includes('lanton_bank_transfer') &&
        result.ruleCoverageSource === 'topic_exact') {
      console.log('✓ 测试通过');
      console.log('  结果:', JSON.stringify(result, null, 2));
      passCount++;
    } else {
      console.log('✗ 测试失败');
      console.log('  预期: problem_type=known, ruleMatchStatus=matched, ruleCoverageSource=topic_exact');
      console.log('  实际:', JSON.stringify(result, null, 2));
    }
  } catch (error) {
    console.log('✗ 测试异常:', error.message);
  }

  console.log('');

  // ==================== 测试 2: FAQ 内典型问题 - Lanton 转账 ====================
  console.log('【测试 2】FAQ 内典型问题：LantonPay 银行转账（不能误判 unknown）');
  totalCount++;

  try {
    const testEvaluation = {
      scenario: 'lanton_bank_transfer',
      stage: '解答',
      judgement: '客服回答正确',
      summary: '用户询问 LantonPay 支持哪些方式向银行转账',
      analysis: {
        risks: [],
        quality_score: 0.9
      },
      confidence: 0.88
    };

    const result = await problemClassifier.classifyProblem(testEvaluation);
    
    if (result.problem_type === 'known') {
      console.log('✓ 测试通过：FAQ 内问题正确判定为 known');
      console.log('  结果:', JSON.stringify(result, null, 2));
      passCount++;
    } else {
      console.log('✗ 测试失败：FAQ 内问题被误判为 unknown');
      console.log('  结果:', JSON.stringify(result, null, 2));
    }
  } catch (error) {
    console.log('✗ 测试异常:', error.message);
  }

  console.log('');

  // ==================== 测试 3: FAQ 内典型问题 - PAI 充值 ====================
  console.log('【测试 3】FAQ 内典型问题：PAI 数字货币充值（不能误判 unknown）');
  totalCount++;

  try {
    const testEvaluation = {
      scenario: 'pai_crypto_deposit',
      stage: '解答',
      judgement: '客服回答正确',
      summary: '用户询问 Pai App 怎么充值 USDT',
      analysis: {
        risks: [],
        quality_score: 0.85
      },
      confidence: 0.82
    };

    const result = await problemClassifier.classifyProblem(testEvaluation);
    
    if (result.problem_type === 'known') {
      console.log('✓ 测试通过：FAQ 内问题正确判定为 known');
      console.log('  结果:', JSON.stringify(result, null, 2));
      passCount++;
    } else {
      console.log('✗ 测试失败：FAQ 内问题被误判为 unknown');
      console.log('  结果:', JSON.stringify(result, null, 2));
    }
  } catch (error) {
    console.log('✗ 测试异常:', error.message);
  }

  console.log('');

  // ==================== 测试 4: FAQ 内典型问题 - 国际转账 ====================
  console.log('【测试 4】FAQ 内典型问题：国际转账到微信（不能误判 unknown）');
  totalCount++;

  try {
    const testEvaluation = {
      scenario: 'lanton_intl_transfer_wechat',
      stage: '解答',
      judgement: '客服回答正确',
      summary: '用户询问怎么把钱转账到微信',
      analysis: {
        risks: [],
        quality_score: 0.9
      },
      confidence: 0.87
    };

    const result = await problemClassifier.classifyProblem(testEvaluation);
    
    if (result.problem_type === 'known') {
      console.log('✓ 测试通过：FAQ 内问题正确判定为 known');
      console.log('  结果:', JSON.stringify(result, null, 2));
      passCount++;
    } else {
      console.log('✗ 测试失败：FAQ 内问题被误判为 unknown');
      console.log('  结果:', JSON.stringify(result, null, 2));
    }
  } catch (error) {
    console.log('✗ 测试异常:', error.message);
  }

  console.log('');

  // ==================== 测试 5: 第二层命中 - 关键词组合命中 ====================
  console.log('【测试 5】规则命中第二层：关键词组合命中');
  totalCount++;

  try {
    // 场景不明确，但 summary 中包含关键词
    const testEvaluation = {
      scenario: 'unknown',  // 场景不明确
      stage: '解答',
      judgement: '客服提供了转账指引',
      summary: '用户询问如何向银行转账，客服回答了扫码转账和 Bakong 转账方式',
      analysis: {
        risks: [],
        quality_score: 0.8
      },
      confidence: 0.75
    };

    const result = await problemClassifier.classifyProblem(testEvaluation);
    
    // 虽然场景不明确，但关键词命中规则，应该判定为 known
    if (result.problem_type === 'known' && 
        result.ruleMatchStatus === 'matched' &&
        result.ruleCoverageSource === 'keyword') {
      console.log('✓ 测试通过：关键词命中规则，判定为 known');
      console.log('  结果:', JSON.stringify(result, null, 2));
      passCount++;
    } else {
      console.log('✗ 测试失败');
      console.log('  预期: problem_type=known, ruleCoverageSource=keyword');
      console.log('  实际:', JSON.stringify(result, null, 2));
    }
  } catch (error) {
    console.log('✗ 测试异常:', error.message);
  }

  console.log('');

  // ==================== 测试 6: 第三层命中 - 产品域兜底 ====================
  console.log('【测试 6】规则命中第三层：产品域兜底命中');
  totalCount++;

  try {
    // 场景是 lanton 前缀但不在精确列表中
    const testEvaluation = {
      scenario: 'lanton_new_feature',  // 新场景，不在 FAQ 中
      stage: '解答',
      judgement: '客服回答',
      summary: '用户咨询 LantonPay 相关问题',
      analysis: {
        risks: [],
        quality_score: 0.75
      },
      confidence: 0.8
    };

    const result = await problemClassifier.classifyProblem(testEvaluation);
    
    // 场景不明确且无关键词匹配，但产品域是 lanton，应该兜底命中
    if (result.problem_type === 'known' && 
        result.ruleMatchStatus === 'matched' &&
        result.ruleCoverageSource === 'product_fallback') {
      console.log('✓ 测试通过：产品域兜底命中，判定为 known');
      console.log('  结果:', JSON.stringify(result, null, 2));
      passCount++;
    } else {
      console.log('✗ 测试失败');
      console.log('  预期: problem_type=known, ruleCoverageSource=product_fallback');
      console.log('  实际:', JSON.stringify(result, null, 2));
    }
  } catch (error) {
    console.log('✗ 测试异常:', error.message);
  }

  console.log('');

  // ==================== 测试 7: 全部不命中 - 判定 unknown ====================
  console.log('【测试 7】规则全部不命中：场景、FAQ、流程、话术全部不匹配');
  totalCount++;

  try {
    // 完全陌生的场景和内容
    const testEvaluation = {
      scenario: 'completely_unknown_topic',
      stage: '解答',
      judgement: '客服回答',
      summary: '用户询问一个完全陌生的问题，与 LantonPay 和 PAI 都无关',
      analysis: {
        risks: [],
        quality_score: 0.5
      },
      confidence: 0.4
    };

    const result = await problemClassifier.classifyProblem(testEvaluation);
    
    if (result.problem_type === 'unknown' && 
        result.ruleMatchStatus === 'not_matched' &&
        result.ruleCoverageSource === 'none') {
      console.log('✓ 测试通过：规则全部不命中，正确判定为 unknown');
      console.log('  结果:', JSON.stringify(result, null, 2));
      passCount++;
    } else {
      console.log('✗ 测试失败');
      console.log('  预期: problem_type=unknown, ruleMatchStatus=not_matched, ruleCoverageSource=none');
      console.log('  实际:', JSON.stringify(result, null, 2));
    }
  } catch (error) {
    console.log('✗ 测试异常:', error.message);
  }

  console.log('');

  // ==================== 测试 8: 规则匹配信息完整性 ====================
  console.log('【测试 8】验证：规则匹配信息完整性（ruleMatchStatus/matchedRuleIds/matchedRuleTopics/ruleCoverageSource）');
  totalCount++;

  try {
    const testEvaluation = {
      scenario: 'pai_crypto_withdraw',
      stage: '解答',
      judgement: '客服回答正确',
      summary: '用户询问 Pai 里面的 USDT 怎么提现',
      analysis: {
        risks: [],
        quality_score: 0.9
      },
      confidence: 0.88
    };

    const result = await problemClassifier.classifyProblem(testEvaluation);
    
    const hasAllFields = 
      result.ruleMatchStatus !== undefined &&
      Array.isArray(result.matchedRuleIds) &&
      Array.isArray(result.matchedRuleTopics) &&
      result.ruleCoverageSource !== undefined;

    if (hasAllFields) {
      console.log('✓ 测试通过：所有规则匹配字段都存在');
      console.log('  ruleMatchStatus:', result.ruleMatchStatus);
      console.log('  matchedRuleIds:', result.matchedRuleIds);
      console.log('  matchedRuleTopics:', result.matchedRuleTopics);
      console.log('  ruleCoverageSource:', result.ruleCoverageSource);
      passCount++;
    } else {
      console.log('✗ 测试失败：缺少规则匹配字段');
      console.log('  结果:', JSON.stringify(result, null, 2));
    }
  } catch (error) {
    console.log('✗ 测试异常:', error.message);
  }

  console.log('');

  // ==================== 测试 9: FAQ 批量验证 - Lanton 典型场景 ====================
  console.log('【测试 9】FAQ 批量验证：Lanton 典型场景（10个）不能误判 unknown');
  totalCount++;

  try {
    const lantonScenarios = [
      'lanton_bank_transfer',
      'lanton_internal_transfer',
      'lanton_intl_transfer',
      'lanton_download',
      'lanton_kyc_need',
      'lanton_forgot_password',
      'lanton_change_phone',
      'lanton_crypto_not_supported',
      'lanton_scan_abnormal',
      'lanton_over_limit'
    ];

    let allKnown = true;
    const failedScenarios = [];

    for (const scenario of lantonScenarios) {
      const testEvaluation = {
        scenario,
        stage: '解答',
        judgement: '客服回答',
        summary: '用户咨询问题',
        analysis: { risks: [], quality_score: 0.8 },
        confidence: 0.85
      };

      const result = await problemClassifier.classifyProblem(testEvaluation);
      
      if (result.problem_type !== 'known') {
        allKnown = false;
        failedScenarios.push(scenario);
      }
    }

    if (allKnown) {
      console.log(`✓ 测试通过：${lantonScenarios.length}/${lantonScenarios.length} 个 Lanton 场景全部判定为 known`);
      passCount++;
    } else {
      console.log(`✗ 测试失败：${failedScenarios.length} 个场景被误判为 unknown`);
      console.log('  失败场景:', failedScenarios);
    }
  } catch (error) {
    console.log('✗ 测试异常:', error.message);
  }

  console.log('');

  // ==================== 测试 10: FAQ 批量验证 - PAI 典型场景 ====================
  console.log('【测试 10】FAQ 批量验证：PAI 典型场景（10个）不能误判 unknown');
  totalCount++;

  try {
    const paiScenarios = [
      'pai_crypto_deposit',
      'pai_crypto_withdraw',
      'pai_intl_transfer_bank_time',
      'pai_deposit_methods',
      'pai_cash_delivery',
      'pai_open_usd_account',
      'pai_reset_password_manual',
      'pai_change_phone_manual',
      'pai_quick_trade_guide',
      'pai_supported_chains'
    ];

    let allKnown = true;
    const failedScenarios = [];

    for (const scenario of paiScenarios) {
      const testEvaluation = {
        scenario,
        stage: '解答',
        judgement: '客服回答',
        summary: '用户咨询问题',
        analysis: { risks: [], quality_score: 0.8 },
        confidence: 0.85
      };

      const result = await problemClassifier.classifyProblem(testEvaluation);
      
      if (result.problem_type !== 'known') {
        allKnown = false;
        failedScenarios.push(scenario);
      }
    }

    if (allKnown) {
      console.log(`✓ 测试通过：${paiScenarios.length}/${paiScenarios.length} 个 PAI 场景全部判定为 known`);
      passCount++;
    } else {
      console.log(`✗ 测试失败：${failedScenarios.length} 个场景被误判为 unknown`);
      console.log('  失败场景:', failedScenarios);
    }
  } catch (error) {
    console.log('✗ 测试异常:', error.message);
  }

  console.log('');

  // ==================== 测试总结 ====================
  console.log('========== 测试总结 ==========');
  console.log(`通过: ${passCount}/${totalCount}`);
  
  if (passCount === totalCount) {
    console.log('✅ 所有测试通过！规则承接维度已真实生效，FAQ 内问题不再误判 unknown。');
  } else {
    console.log(`❌ 有 ${totalCount - passCount} 个测试失败，请检查实现。`);
  }

  return passCount === totalCount;
}

// 运行测试
runRulesTests().then(success => {
  process.exit(success ? 0 : 1);
}).catch(error => {
  console.error('测试执行异常:', error);
  process.exit(1);
});
