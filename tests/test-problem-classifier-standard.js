/**
 * 未知问题判定标准验证测试
 * 
 * 测试目标：
 * 1. 每条实时质检结果都能得到明确的 problem_type
 * 2. unknown 的判定标准固定且一致
 * 3. 所有 unknown 都自动带 need_review=true
 * 4. 所有分类结果都带 classify_reason
 * 5. known / unknown 判定稳定一致
 */

const { defaultClassifier: problemClassifier } = require('../services/problem-classifier-service');

console.log('========== 未知问题判定标准验证测试 ==========\n');

async function runClassifierTests() {
  let passCount = 0;
  let totalCount = 0;

  // ==================== 测试 1: known - 所有条件都满足 ====================
  console.log('【测试 1】known 判定：场景明确，分析完整，confidence 达标');
  totalCount++;

  try {
    const knownCase = {
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

    const result = problemClassifier.classifyProblem(knownCase);
    
    if (result.problem_type === 'known' && 
        result.need_review === false &&
        result.classify_reason === '场景明确，分析结果完整，置信度达标') {
      console.log('✓ 测试通过');
      console.log('  结果:', JSON.stringify(result, null, 2));
      passCount++;
    } else {
      console.log('✗ 测试失败');
      console.log('  预期: problem_type=known, need_review=false');
      console.log('  实际:', JSON.stringify(result, null, 2));
    }
  } catch (error) {
    console.log('✗ 测试异常:', error.message);
  }

  console.log('');

  // ==================== 测试 2: unknown - 场景为空 ====================
  console.log('【测试 2】unknown 判定：场景为空');
  totalCount++;

  try {
    const unknownScenarioEmpty = {
      scenario: null,
      stage: '解答',
      judgement: '客服回答准确',
      summary: '用户咨询问题，客服回答',
      analysis: {
        risks: [],
        quality_score: 0.8
      },
      confidence: 0.85
    };

    const result = problemClassifier.classifyProblem(unknownScenarioEmpty);
    
    if (result.problem_type === 'unknown' && 
        result.need_review === true &&
        result.classify_reason === '场景无法识别') {
      console.log('✓ 测试通过');
      console.log('  结果:', JSON.stringify(result, null, 2));
      passCount++;
    } else {
      console.log('✗ 测试失败');
      console.log('  预期: problem_type=unknown, classify_reason=场景无法识别');
      console.log('  实际:', JSON.stringify(result, null, 2));
    }
  } catch (error) {
    console.log('✗ 测试异常:', error.message);
  }

  console.log('');

  // ==================== 测试 3: unknown - 场景为 unknown ====================
  console.log('【测试 3】unknown 判定：场景为 unknown');
  totalCount++;

  try {
    const unknownScenarioUnknown = {
      scenario: 'unknown',
      stage: '解答',
      judgement: '客服回答准确',
      summary: '用户咨询问题，客服回答',
      analysis: {
        risks: [],
        quality_score: 0.8
      },
      confidence: 0.85
    };

    const result = problemClassifier.classifyProblem(unknownScenarioUnknown);
    
    if (result.problem_type === 'unknown' && 
        result.need_review === true &&
        result.classify_reason === '场景无法识别') {
      console.log('✓ 测试通过');
      console.log('  结果:', JSON.stringify(result, null, 2));
      passCount++;
    } else {
      console.log('✗ 测试失败');
      console.log('  预期: problem_type=unknown, classify_reason=场景无法识别');
      console.log('  实际:', JSON.stringify(result, null, 2));
    }
  } catch (error) {
    console.log('✗ 测试异常:', error.message);
  }

  console.log('');

  // ==================== 测试 4: unknown - 场景为 other ====================
  console.log('【测试 4】unknown 判定：场景为 other');
  totalCount++;

  try {
    const unknownScenarioOther = {
      scenario: 'other',
      stage: '解答',
      judgement: '客服回答准确',
      summary: '用户咨询问题，客服回答',
      analysis: {
        risks: [],
        quality_score: 0.8
      },
      confidence: 0.85
    };

    const result = problemClassifier.classifyProblem(unknownScenarioOther);
    
    if (result.problem_type === 'unknown' && 
        result.need_review === true &&
        result.classify_reason === '场景无法识别') {
      console.log('✓ 测试通过');
      console.log('  结果:', JSON.stringify(result, null, 2));
      passCount++;
    } else {
      console.log('✗ 测试失败');
      console.log('  预期: problem_type=unknown, classify_reason=场景无法识别');
      console.log('  实际:', JSON.stringify(result, null, 2));
    }
  } catch (error) {
    console.log('✗ 测试异常:', error.message);
  }

  console.log('');

  // ==================== 测试 5: unknown - 场景不在有效场景集 ====================
  console.log('【测试 5】unknown 判定：场景不在有效场景集');
  totalCount++;

  try {
    const unknownScenarioInvalid = {
      scenario: 'invalid_scenario_xyz',
      stage: '解答',
      judgement: '客服回答准确',
      summary: '用户咨询问题，客服回答',
      analysis: {
        risks: [],
        quality_score: 0.8
      },
      confidence: 0.85
    };

    const result = problemClassifier.classifyProblem(unknownScenarioInvalid);
    
    if (result.problem_type === 'unknown' && 
        result.need_review === true &&
        result.classify_reason === '场景不在当前项目有效场景范围内') {
      console.log('✓ 测试通过');
      console.log('  结果:', JSON.stringify(result, null, 2));
      passCount++;
    } else {
      console.log('✗ 测试失败');
      console.log('  预期: problem_type=unknown, classify_reason=场景不在当前项目有效场景范围内');
      console.log('  实际:', JSON.stringify(result, null, 2));
    }
  } catch (error) {
    console.log('✗ 测试异常:', error.message);
  }

  console.log('');

  // ==================== 测试 6: unknown - judgement 为空 ====================
  console.log('【测试 6】unknown 判定：judgement 为空');
  totalCount++;

  try {
    const unknownJudgementEmpty = {
      scenario: 'lanton_bank_transfer',
      stage: '解答',
      judgement: '',
      summary: '用户咨询问题，客服回答',
      analysis: {
        risks: [],
        quality_score: 0.8
      },
      confidence: 0.85
    };

    const result = problemClassifier.classifyProblem(unknownJudgementEmpty);
    
    if (result.problem_type === 'unknown' && 
        result.need_review === true &&
        result.classify_reason === '缺少 judgement 核心信息') {
      console.log('✓ 测试通过');
      console.log('  结果:', JSON.stringify(result, null, 2));
      passCount++;
    } else {
      console.log('✗ 测试失败');
      console.log('  预期: problem_type=unknown, classify_reason=缺少 judgement 核心信息');
      console.log('  实际:', JSON.stringify(result, null, 2));
    }
  } catch (error) {
    console.log('✗ 测试异常:', error.message);
  }

  console.log('');

  // ==================== 测试 7: unknown - summary 为空 ====================
  console.log('【测试 7】unknown 判定：summary 为空');
  totalCount++;

  try {
    const unknownSummaryEmpty = {
      scenario: 'lanton_bank_transfer',
      stage: '解答',
      judgement: '客服回答准确',
      summary: null,
      analysis: {
        risks: [],
        quality_score: 0.8
      },
      confidence: 0.85
    };

    const result = problemClassifier.classifyProblem(unknownSummaryEmpty);
    
    if (result.problem_type === 'unknown' && 
        result.need_review === true &&
        result.classify_reason === '缺少 summary 核心信息') {
      console.log('✓ 测试通过');
      console.log('  结果:', JSON.stringify(result, null, 2));
      passCount++;
    } else {
      console.log('✗ 测试失败');
      console.log('  预期: problem_type=unknown, classify_reason=缺少 summary 核心信息');
      console.log('  实际:', JSON.stringify(result, null, 2));
    }
  } catch (error) {
    console.log('✗ 测试异常:', error.message);
  }

  console.log('');

  // ==================== 测试 8: unknown - analysis 为空对象 ====================
  console.log('【测试 8】unknown 判定：analysis 为空对象');
  totalCount++;

  try {
    const unknownAnalysisEmpty = {
      scenario: 'lanton_bank_transfer',
      stage: '解答',
      judgement: '客服回答准确',
      summary: '用户咨询问题，客服回答',
      analysis: {},
      confidence: 0.85
    };

    const result = problemClassifier.classifyProblem(unknownAnalysisEmpty);
    
    if (result.problem_type === 'unknown' && 
        result.need_review === true &&
        result.classify_reason === 'analysis 为空或缺失') {
      console.log('✓ 测试通过');
      console.log('  结果:', JSON.stringify(result, null, 2));
      passCount++;
    } else {
      console.log('✗ 测试失败');
      console.log('  预期: problem_type=unknown, classify_reason=analysis 为空或缺失');
      console.log('  实际:', JSON.stringify(result, null, 2));
    }
  } catch (error) {
    console.log('✗ 测试异常:', error.message);
  }

  console.log('');

  // ==================== 测试 9: unknown - analysis 仅有空数组 ====================
  console.log('【测试 9】unknown 判定：analysis 仅有空数组');
  totalCount++;

  try {
    const unknownAnalysisEmptyArrays = {
      scenario: 'lanton_bank_transfer',
      stage: '解答',
      judgement: '客服回答准确',
      summary: '用户咨询问题，客服回答',
      analysis: {
        risks: [],
        suggestions: [],
        keywords: []
      },
      confidence: 0.85
    };

    const result = problemClassifier.classifyProblem(unknownAnalysisEmptyArrays);
    
    if (result.problem_type === 'unknown' && 
        result.need_review === true) {
      console.log('✓ 测试通过');
      console.log('  结果:', JSON.stringify(result, null, 2));
      passCount++;
    } else {
      console.log('✗ 测试失败');
      console.log('  预期: problem_type=unknown');
      console.log('  实际:', JSON.stringify(result, null, 2));
    }
  } catch (error) {
    console.log('✗ 测试异常:', error.message);
  }

  console.log('');

  // ==================== 测试 10: unknown - confidence < 0.7 ====================
  console.log('【测试 10】unknown 判定：confidence < 0.7');
  totalCount++;

  try {
    const unknownLowConfidence = {
      scenario: 'lanton_bank_transfer',
      stage: '解答',
      judgement: '客服回答准确',
      summary: '用户咨询问题，客服回答',
      analysis: {
        risks: [],
        quality_score: 0.8
      },
      confidence: 0.65
    };

    const result = problemClassifier.classifyProblem(unknownLowConfidence);
    
    if (result.problem_type === 'unknown' && 
        result.need_review === true &&
        result.classify_reason === '置信度不足') {
      console.log('✓ 测试通过');
      console.log('  结果:', JSON.stringify(result, null, 2));
      passCount++;
    } else {
      console.log('✗ 测试失败');
      console.log('  预期: problem_type=unknown, classify_reason=置信度不足');
      console.log('  实际:', JSON.stringify(result, null, 2));
    }
  } catch (error) {
    console.log('✗ 测试异常:', error.message);
  }

  console.log('');

  // ==================== 测试 11: known - confidence 刚好等于 0.7 ====================
  console.log('【测试 11】known 判定：confidence 刚好等于 0.7（边界值）');
  totalCount++;

  try {
    const knownThresholdConfidence = {
      scenario: 'lanton_bank_transfer',
      stage: '解答',
      judgement: '客服回答准确',
      summary: '用户咨询问题，客服回答',
      analysis: {
        risks: [],
        quality_score: 0.8
      },
      confidence: 0.7
    };

    const result = problemClassifier.classifyProblem(knownThresholdConfidence);
    
    if (result.problem_type === 'known' && 
        result.need_review === false &&
        result.classify_reason === '场景明确，分析结果完整，置信度达标') {
      console.log('✓ 测试通过');
      console.log('  结果:', JSON.stringify(result, null, 2));
      passCount++;
    } else {
      console.log('✗ 测试失败');
      console.log('  预期: problem_type=known');
      console.log('  实际:', JSON.stringify(result, null, 2));
    }
  } catch (error) {
    console.log('✗ 测试异常:', error.message);
  }

  console.log('');

  // ==================== 测试 12: unknown - 多个条件同时失败 ====================
  console.log('【测试 12】unknown 判定：多个条件同时失败（场景空 + confidence 低）');
  totalCount++;

  try {
    const unknownMultipleFailures = {
      scenario: '',
      stage: '解答',
      judgement: '客服回答准确',
      summary: '用户咨询问题，客服回答',
      analysis: {
        risks: [],
        quality_score: 0.8
      },
      confidence: 0.5
    };

    const result = problemClassifier.classifyProblem(unknownMultipleFailures);
    
    // 应该优先返回场景失败原因
    if (result.problem_type === 'unknown' && 
        result.need_review === true &&
        result.classify_reason === '场景无法识别') {
      console.log('✓ 测试通过（优先级正确：先检查场景）');
      console.log('  结果:', JSON.stringify(result, null, 2));
      passCount++;
    } else {
      console.log('✗ 测试失败');
      console.log('  预期: problem_type=unknown, classify_reason=场景无法识别');
      console.log('  实际:', JSON.stringify(result, null, 2));
    }
  } catch (error) {
    console.log('✗ 测试异常:', error.message);
  }

  console.log('');

  // ==================== 测试 13: unknown - 场景明确但 analysis 不完整 ====================
  console.log('【测试 13】unknown 判定：场景明确但 analysis 不完整（优先级验证）');
  totalCount++;

  try {
    const unknownAnalysisIncomplete = {
      scenario: 'lanton_bank_transfer',
      stage: '解答',
      judgement: '客服回答准确',
      summary: '',  // summary 为空
      analysis: {
        risks: [],
        quality_score: 0.8
      },
      confidence: 0.9
    };

    const result = problemClassifier.classifyProblem(unknownAnalysisIncomplete);
    
    // 应该返回分析不完整原因，而不是 confidence 问题
    if (result.problem_type === 'unknown' && 
        result.need_review === true &&
        result.classify_reason === '缺少 summary 核心信息') {
      console.log('✓ 测试通过（优先级正确：先检查分析完整性）');
      console.log('  结果:', JSON.stringify(result, null, 2));
      passCount++;
    } else {
      console.log('✗ 测试失败');
      console.log('  预期: problem_type=unknown, classify_reason=缺少 summary 核心信息');
      console.log('  实际:', JSON.stringify(result, null, 2));
    }
  } catch (error) {
    console.log('✗ 测试异常:', error.message);
  }

  console.log('');

  // ==================== 测试 14: 验证 classify_reason 不可为空 ====================
  console.log('【测试 14】验证：所有分类结果都带 classify_reason');
  totalCount++;

  try {
    const testCases = [
      { scenario: null, judgement: 'ok', summary: 'ok', analysis: { x: 1 }, confidence: 0.9 },
      { scenario: 'lanton_bank_transfer', judgement: '', summary: 'ok', analysis: { x: 1 }, confidence: 0.9 },
      { scenario: 'lanton_bank_transfer', judgement: 'ok', summary: 'ok', analysis: {}, confidence: 0.9 },
      { scenario: 'lanton_bank_transfer', judgement: 'ok', summary: 'ok', analysis: { x: 1 }, confidence: 0.5 },
      { scenario: 'lanton_bank_transfer', judgement: 'ok', summary: 'ok', analysis: { x: 1 }, confidence: 0.9 }
    ];

    let allHaveReason = true;
    testCases.forEach((tc, idx) => {
      const result = problemClassifier.classifyProblem(tc);
      if (!result.classify_reason || result.classify_reason.trim() === '') {
        console.log(`  ✗ 测试用例 ${idx + 1} 缺少 classify_reason`);
        allHaveReason = false;
      }
    });

    if (allHaveReason) {
      console.log('✓ 测试通过：所有分类结果都包含 classify_reason');
      passCount++;
    } else {
      console.log('✗ 测试失败：存在分类结果缺少 classify_reason');
    }
  } catch (error) {
    console.log('✗ 测试异常:', error.message);
  }

  console.log('');

  // ==================== 测试 15: 验证 need_review 自动设置 ====================
  console.log('【测试 15】验证：unknown 自动 need_review=true，known 自动 need_review=false');
  totalCount++;

  try {
    const unknownCase = {
      scenario: null,
      judgement: 'ok',
      summary: 'ok',
      analysis: { x: 1 },
      confidence: 0.9
    };

    const knownCase = {
      scenario: 'lanton_bank_transfer',
      judgement: 'ok',
      summary: 'ok',
      analysis: { x: 1 },
      confidence: 0.9
    };

    const unknownResult = problemClassifier.classifyProblem(unknownCase);
    const knownResult = problemClassifier.classifyProblem(knownCase);

    if (unknownResult.problem_type === 'unknown' && unknownResult.need_review === true &&
        knownResult.problem_type === 'known' && knownResult.need_review === false) {
      console.log('✓ 测试通过：need_review 自动设置正确');
      passCount++;
    } else {
      console.log('✗ 测试失败');
      console.log('  unknown need_review:', unknownResult.need_review);
      console.log('  known need_review:', knownResult.need_review);
    }
  } catch (error) {
    console.log('✗ 测试异常:', error.message);
  }

  console.log('');

  // ==================== 测试总结 ====================
  console.log('========== 测试总结 ==========');
  console.log(`通过: ${passCount}/${totalCount}`);
  
  if (passCount === totalCount) {
    console.log('✅ 所有测试通过！未知问题判定标准已固化。');
  } else {
    console.log(`❌ 有 ${totalCount - passCount} 个测试失败，请检查实现。`);
  }

  return passCount === totalCount;
}

// 运行测试
runClassifierTests().then(success => {
  process.exit(success ? 0 : 1);
}).catch(error => {
  console.error('测试执行异常:', error);
  process.exit(1);
});
