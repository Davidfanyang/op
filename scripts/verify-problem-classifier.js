/**
 * 验证已知/未知问题分流功能
 * 
 * 简单验证：
 * 1. 分流服务正常工作
 * 2. Repository 支持分类字段
 * 3. 分类结果可以正确写回
 */

const { defaultClassifier: problemClassifier } = require('../services/problem-classifier-service');
const { FileLiveEvaluationsRepository } = require('../repositories/impl/file-live-evaluations-repository');

console.log('========== 验证已知/未知问题分流功能 ==========\n');

async function runValidation() {
  console.log('【验证 1】分流服务正常工作');
  
  // 测试 known 案例
  const knownCase = {
    scenario: 'lanton_bank_transfer',
    stage: 'greeting',
    judgement: 'pass',
    summary: '客服回复准确',
    analysis: { stage_detection: { stage: 'greeting' } },
    confidence: 0.85
  };
  
  const knownResult = problemClassifier.classifyProblem(knownCase);
  console.log('输入 (known 案例):', JSON.stringify(knownCase, null, 2));
  console.log('输出:', JSON.stringify(knownResult, null, 2));
  
  if (knownResult.problem_type === 'known' && knownResult.need_review === false) {
    console.log('✓ known 案例分类正确\n');
  } else {
    console.log('✗ known 案例分类失败\n');
    process.exit(1);
  }
  
  // 测试 unknown 案例
  const unknownCase = {
    scenario: null,
    stage: 'greeting',
    judgement: 'pass',
    summary: '客服回复',
    analysis: { stage_detection: { stage: 'greeting' } },
    confidence: 0.6
  };
  
  const unknownResult = problemClassifier.classifyProblem(unknownCase);
  console.log('输入 (unknown 案例):', JSON.stringify(unknownCase, null, 2));
  console.log('输出:', JSON.stringify(unknownResult, null, 2));
  
  if (unknownResult.problem_type === 'unknown' && unknownResult.need_review === true) {
    console.log('✓ unknown 案例分类正确\n');
  } else {
    console.log('✗ unknown 案例分类失败\n');
    process.exit(1);
  }
  
  console.log('【验证 2】Repository 支持分类字段');
  
  const repo = new FileLiveEvaluationsRepository();
  
  // 创建测试评估记录
  const testEvaluation = await repo.create({
    evaluationId: 'test_eval_validation_001',
    sessionId: 'test_session_001',
    messageId: 'msg_001',
    project: 'test_project',
    currentReply: '测试回复',
    inputPayload: { project: 'test_project' },
    outputPayload: knownCase,
    scenario: 'lanton_bank_transfer',
    stage: 'greeting',
    judgement: 'pass',
    summary: '客服回复准确',
    confidence: 0.85
  });
  
  console.log('✓ 创建评估记录:', testEvaluation.evaluationId);
  console.log('  - 初始 problemType:', testEvaluation.problemType);
  console.log('  - 初始 needReview:', testEvaluation.needReview);
  console.log('  - 初始 classifyReason:', testEvaluation.classifyReason);
  console.log('');
  
  console.log('【验证 3】分类结果可以正确写回');
  
  // 调用分流
  const classificationResult = problemClassifier.classifyProblem(testEvaluation.outputPayload);
  console.log('分流结果:', JSON.stringify(classificationResult, null, 2));
  
  // 更新分类
  await repo.updateClassification(testEvaluation.evaluationId, {
    problemType: classificationResult.problem_type,
    needReview: classificationResult.need_review,
    classifyReason: classificationResult.classify_reason
  });
  
  console.log('✓ 分类结果已写回');
  
  // 验证写回结果
  const updatedEvaluation = await repo.findById(testEvaluation.evaluationId);
  console.log('验证数据库记录:');
  console.log('  - problemType:', updatedEvaluation.problemType);
  console.log('  - needReview:', updatedEvaluation.needReview);
  console.log('  - classifyReason:', updatedEvaluation.classifyReason);
  console.log('');
  
  if (updatedEvaluation.problemType === 'known' && 
      updatedEvaluation.needReview === false &&
      updatedEvaluation.classifyReason.includes('场景明确')) {
    console.log('✓ 分类结果写回正确\n');
  } else {
    console.log('✗ 分类结果写回失败\n');
    process.exit(1);
  }
  
  console.log('【验证 4】unknown 案例写回');
  
  const testEvaluation2 = await repo.create({
    evaluationId: 'test_eval_validation_002',
    sessionId: 'test_session_002',
    messageId: 'msg_002',
    project: 'test_project',
    currentReply: '测试回复2',
    inputPayload: { project: 'test_project' },
    outputPayload: unknownCase,
    scenario: null,
    stage: 'greeting',
    judgement: 'pass',
    summary: '客服回复',
    confidence: 0.6
  });
  
  const classificationResult2 = problemClassifier.classifyProblem(testEvaluation2.outputPayload);
  await repo.updateClassification(testEvaluation2.evaluationId, {
    problemType: classificationResult2.problem_type,
    needReview: classificationResult2.need_review,
    classifyReason: classificationResult2.classify_reason
  });
  
  const updatedEvaluation2 = await repo.findById(testEvaluation2.evaluationId);
  console.log('验证 unknown 案例:');
  console.log('  - problemType:', updatedEvaluation2.problemType);
  console.log('  - needReview:', updatedEvaluation2.needReview);
  console.log('  - classifyReason:', updatedEvaluation2.classifyReason);
  
  if (updatedEvaluation2.problemType === 'unknown' && 
      updatedEvaluation2.needReview === true &&
      updatedEvaluation2.classifyReason.includes('场景无法识别')) {
    console.log('✓ unknown 案例写回正确\n');
  } else {
    console.log('✗ unknown 案例写回失败\n');
    process.exit(1);
  }
  
  console.log('========== 验证完成 ==========\n');
  console.log('✅ 所有验证通过！');
  console.log('');
  console.log('功能总结：');
  console.log('1. ✓ 分流服务正常工作，能正确识别 known/unknown');
  console.log('2. ✓ Repository 支持分类字段（problemType, needReview, classifyReason）');
  console.log('3. ✓ 分类结果可以正确写回数据库');
  console.log('4. ✓ known 问题标记 needReview=false');
  console.log('5. ✓ unknown 问题标记 needReview=true');
  console.log('6. ✓ 所有分类结果都保留了 classify_reason');
  console.log('');
  console.log('下一步任务：《实现告警初版》');
}

runValidation().catch(error => {
  console.error('验证失败:', error);
  process.exit(1);
});
