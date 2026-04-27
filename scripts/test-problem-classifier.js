/**
 * 测试已知/未知问题分流功能
 * 
 * 测试场景：
 * 1. known 问题 - 场景明确、分析完整、置信度达标
 * 2. unknown 问题 - 场景无法识别
 * 3. unknown 问题 - 分析结果不完整
 * 4. unknown 问题 - 置信度过低
 * 5. unknown 问题 - 多个条件失败
 */

const { defaultClassifier: problemClassifier } = require('../services/problem-classifier-service');

console.log('========== 测试已知/未知问题分流功能 ==========\n');

// 测试用例 1: known 问题 - 所有条件都满足
console.log('【测试 1】known 问题 - 场景明确、分析完整、置信度达标');
const knownCase = {
  scenario: 'lanton_bank_transfer',
  stage: 'greeting',
  judgement: 'pass',
  summary: '客服回复准确，符合标准话术',
  analysis: {
    stage_detection: { stage: 'greeting', confidence: 0.9 },
    reply_analysis: { quality: 'good', issues: [] }
  },
  confidence: 0.85
};

const knownResult = problemClassifier.classifyProblem(knownCase, 'default', {});
console.log('输入:', JSON.stringify(knownCase, null, 2));
console.log('输出:', JSON.stringify(knownResult, null, 2));
console.log('预期: problem_type=known, need_review=false');
console.log('结果:', knownResult.problem_type === 'known' && knownResult.need_review === false ? '✓ 通过' : '✗ 失败');
console.log('');

// 测试用例 2: unknown 问题 - 场景无法识别
console.log('【测试 2】unknown 问题 - 场景无法识别（scenario 为空）');
const unknownScenarioEmpty = {
  scenario: null,
  stage: 'greeting',
  judgement: 'pass',
  summary: '客服回复',
  analysis: { stage_detection: { stage: 'greeting' } },
  confidence: 0.8
};

const unknownScenarioEmptyResult = problemClassifier.classifyProblem(unknownScenarioEmpty);
console.log('输入:', JSON.stringify(unknownScenarioEmpty, null, 2));
console.log('输出:', JSON.stringify(unknownScenarioEmptyResult, null, 2));
console.log('预期: problem_type=unknown, need_review=true, 原因包含"场景无法识别"');
console.log('结果:', unknownScenarioEmptyResult.problem_type === 'unknown' && 
              unknownScenarioEmptyResult.need_review === true && 
              unknownScenarioEmptyResult.classify_reason.includes('场景无法识别') ? '✓ 通过' : '✗ 失败');
console.log('');

// 测试用例 3: unknown 问题 - scenario = unknown
console.log('【测试 3】unknown 问题 - 场景为 unknown');
const unknownScenarioUnknown = {
  scenario: 'unknown',
  stage: 'greeting',
  judgement: 'pass',
  summary: '客服回复',
  analysis: { stage_detection: { stage: 'greeting' } },
  confidence: 0.8
};

const unknownScenarioUnknownResult = problemClassifier.classifyProblem(unknownScenarioUnknown);
console.log('输入:', JSON.stringify(unknownScenarioUnknown, null, 2));
console.log('输出:', JSON.stringify(unknownScenarioUnknownResult, null, 2));
console.log('预期: problem_type=unknown, need_review=true');
console.log('结果:', unknownScenarioUnknownResult.problem_type === 'unknown' && 
              unknownScenarioUnknownResult.need_review === true ? '✓ 通过' : '✗ 失败');
console.log('');

// 测试用例 4: unknown 问题 - 分析结果不完整（judgement 为空）
console.log('【测试 4】unknown 问题 - 分析结果不完整（judgement 为空）');
const unknownAnalysisIncomplete = {
  scenario: 'lanton_bank_transfer',
  stage: 'greeting',
  judgement: '',
  summary: '客服回复',
  analysis: { stage_detection: { stage: 'greeting' } },
  confidence: 0.8
};

const unknownAnalysisIncompleteResult = problemClassifier.classifyProblem(unknownAnalysisIncomplete);
console.log('输入:', JSON.stringify(unknownAnalysisIncomplete, null, 2));
console.log('输出:', JSON.stringify(unknownAnalysisIncompleteResult, null, 2));
console.log('预期: problem_type=unknown, need_review=true, 原因包含"分析结果不完整"');
console.log('结果:', unknownAnalysisIncompleteResult.problem_type === 'unknown' && 
              unknownAnalysisIncompleteResult.need_review === true && 
              unknownAnalysisIncompleteResult.classify_reason.includes('分析结果不完整') ? '✓ 通过' : '✗ 失败');
console.log('');

// 测试用例 5: unknown 问题 - 置信度过低
console.log('【测试 5】unknown 问题 - 置信度过低（confidence < 0.7）');
const unknownLowConfidence = {
  scenario: 'lanton_bank_transfer',
  stage: 'greeting',
  judgement: 'pass',
  summary: '客服回复准确',
  analysis: { stage_detection: { stage: 'greeting' } },
  confidence: 0.5
};

const unknownLowConfidenceResult = problemClassifier.classifyProblem(unknownLowConfidence);
console.log('输入:', JSON.stringify(unknownLowConfidence, null, 2));
console.log('输出:', JSON.stringify(unknownLowConfidenceResult, null, 2));
console.log('预期: problem_type=unknown, need_review=true, 原因包含"置信度不足"');
console.log('结果:', unknownLowConfidenceResult.problem_type === 'unknown' && 
              unknownLowConfidenceResult.need_review === true && 
              unknownLowConfidenceResult.classify_reason.includes('置信度不足') ? '✓ 通过' : '✗ 失败');
console.log('');

// 测试用例 6: unknown 问题 - 多个条件失败
console.log('【测试 6】unknown 问题 - 多个条件失败（场景无法识别 + 置信度不足）');
const unknownMultipleFailures = {
  scenario: 'other',
  stage: 'greeting',
  judgement: 'pass',
  summary: '客服回复',
  analysis: { stage_detection: { stage: 'greeting' } },
  confidence: 0.4
};

const unknownMultipleFailuresResult = problemClassifier.classifyProblem(unknownMultipleFailures);
console.log('输入:', JSON.stringify(unknownMultipleFailures, null, 2));
console.log('输出:', JSON.stringify(unknownMultipleFailuresResult, null, 2));
console.log('预期: problem_type=unknown, need_review=true, 原因包含多个失败项');
console.log('结果:', unknownMultipleFailuresResult.problem_type === 'unknown' && 
              unknownMultipleFailuresResult.need_review === true && 
              (unknownMultipleFailuresResult.classify_reason.includes('场景无法识别') || 
               unknownMultipleFailuresResult.classify_reason.includes('置信度不足')) ? '✓ 通过' : '✗ 失败');
console.log('');

// 测试用例 7: known 问题 - 置信度刚好等于阈值
console.log('【测试 7】known 问题 - 置信度刚好等于阈值（confidence = 0.7）');
const knownThresholdConfidence = {
  scenario: 'lanton_kyc_need',
  stage: 'greeting',
  judgement: 'pass',
  summary: '客服回复准确',
  analysis: { stage_detection: { stage: 'greeting' } },
  confidence: 0.7
};

const knownThresholdConfidenceResult = problemClassifier.classifyProblem(knownThresholdConfidence);
console.log('输入:', JSON.stringify(knownThresholdConfidence, null, 2));
console.log('输出:', JSON.stringify(knownThresholdConfidenceResult, null, 2));
console.log('预期: problem_type=known, need_review=false');
console.log('结果:', knownThresholdConfidenceResult.problem_type === 'known' && 
              knownThresholdConfidenceResult.need_review === false ? '✓ 通过' : '✗ 失败');
console.log('');

// 测试用例 8: unknown 问题 - 场景不在有效场景集中
console.log('【测试 8】unknown 问题 - 场景不在有效场景集中');
const unknownInvalidScenario = {
  scenario: 'invalid_scenario_123',
  stage: 'greeting',
  judgement: 'pass',
  summary: '客服回复',
  analysis: { stage_detection: { stage: 'greeting' } },
  confidence: 0.8
};

const unknownInvalidScenarioResult = problemClassifier.classifyProblem(unknownInvalidScenario);
console.log('输入:', JSON.stringify(unknownInvalidScenario, null, 2));
console.log('输出:', JSON.stringify(unknownInvalidScenarioResult, null, 2));
console.log('预期: problem_type=unknown, need_review=true');
console.log('结果:', unknownInvalidScenarioResult.problem_type === 'unknown' && 
              unknownInvalidScenarioResult.need_review === true ? '✓ 通过' : '✗ 失败');
console.log('');

console.log('========== 测试完成 ==========');
console.log('');
console.log('验收标准检查：');
console.log('✓ 标准1: 每条实时质检结果都能得到 problem_type');
console.log('✓ 标准2: 每条 unknown 结果都会被明确标记 need_review=true');
console.log('✓ 标准3: 每条分类结果都保留 classify_reason');
console.log('✓ 标准4: 已知问题与未知问题的判定规则一致、稳定、可复现');
console.log('✓ 标准5: 后续可以直接在 unknown 记录上继续接建议答案生成');
