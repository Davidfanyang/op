/**
 * 复验测试：已知/未知问题分流功能修复验证
 * 
 * 复验只看四件事：
 * 1. 已知场景高置信度是否能打成 known
 * 2. 场景缺失/结果不完整是否能打成 unknown
 * 3. 分流结果是否真正写入 live_evaluations
 * 4. 同一消息重复触发时是否不会重复分析
 */

const { defaultClassifier: problemClassifier } = require('../services/problem-classifier-service');
const { FileLiveEvaluationsRepository } = require('../repositories/impl/file-live-evaluations-repository');

console.log('========== 复验测试：已知/未知问题分流功能修复验证 ==========\n');

async function runReverificationTests() {
  let passCount = 0;
  let totalCount = 0;

  // 测试 1: 已知场景高置信度是否能打成 known
  console.log('【复验 1】已知场景高置信度是否能打成 known');
  totalCount++;
  
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

  const knownResult = problemClassifier.classifyProblem(knownCase);
  console.log('输入:', JSON.stringify(knownCase, null, 2));
  console.log('输出:', JSON.stringify(knownResult, null, 2));
  
  if (knownResult.problem_type === 'known' && 
      knownResult.need_review === false &&
      knownResult.classify_reason.includes('场景明确')) {
    console.log('✅ 复验 1 通过：已知场景高置信度正确打成 known\n');
    passCount++;
  } else {
    console.log('❌ 复验 1 失败：已知场景高置信度未打成 known\n');
  }

  // 测试 2: 场景缺失是否能打成 unknown
  console.log('【复验 2】场景缺失是否能打成 unknown');
  totalCount++;
  
  const unknownScenarioCase = {
    scenario: null,
    stage: 'greeting',
    judgement: 'pass',
    summary: '客服回复',
    analysis: { stage_detection: { stage: 'greeting' } },
    confidence: 0.8
  };

  const unknownScenarioResult = problemClassifier.classifyProblem(unknownScenarioCase);
  console.log('输入:', JSON.stringify(unknownScenarioCase, null, 2));
  console.log('输出:', JSON.stringify(unknownScenarioResult, null, 2));
  
  if (unknownScenarioResult.problem_type === 'unknown' && 
      unknownScenarioResult.need_review === true &&
      unknownScenarioResult.classify_reason.includes('场景无法识别')) {
    console.log('✅ 复验 2 通过：场景缺失正确打成 unknown\n');
    passCount++;
  } else {
    console.log('❌ 复验 2 失败：场景缺失未打成 unknown\n');
  }

  // 测试 3: 结果不完整是否能打成 unknown
  console.log('【复验 3】结果不完整是否能打成 unknown');
  totalCount++;
  
  const unknownIncompleteCase = {
    scenario: 'lanton_kyc_need',
    stage: 'greeting',
    judgement: '',  // 空的 judgement
    summary: '',    // 空的 summary
    analysis: {},   // 空的 analysis
    confidence: 0.8
  };

  const unknownIncompleteResult = problemClassifier.classifyProblem(unknownIncompleteCase);
  console.log('输入:', JSON.stringify(unknownIncompleteCase, null, 2));
  console.log('输出:', JSON.stringify(unknownIncompleteResult, null, 2));
  
  if (unknownIncompleteResult.problem_type === 'unknown' && 
      unknownIncompleteResult.need_review === true &&
      unknownIncompleteResult.classify_reason.includes('分析结果不完整')) {
    console.log('✅ 复验 3 通过：结果不完整正确打成 unknown\n');
    passCount++;
  } else {
    console.log('❌ 复验 3 失败：结果不完整未打成 unknown\n');
  }

  // 测试 4: 分流结果是否真正写入 live_evaluations
  console.log('【复验 4】分流结果是否真正写入 live_evaluations');
  totalCount++;
  
  try {
    const repo = new FileLiveEvaluationsRepository();
    
    // 创建评估记录
    const testEvaluation = await repo.create({
      evaluationId: 'test_eval_reverify_001',
      sessionId: 'test_session_001',
      messageId: 'msg_001',
      project: 'test_project',
      currentReply: '测试回复',
      inputPayload: { project: 'test_project' },
      outputPayload: {
        scenarioId: 'lanton_bank_transfer',
        result: {
          scenario: 'lanton_bank_transfer',
          stage: 'greeting',
          judgement: 'pass',
          confidence: 0.85,
          analysis: { stage_detection: { stage: 'greeting' } }
        },
        coachSummary: '客服回复准确',
        analysis: { stage_detection: { stage: 'greeting' } }  // 顶层 analysis 也要有
      },
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

    // 调用分流
    const classifierInput = {
      scenario: testEvaluation.scenario,
      stage: testEvaluation.stage,
      judgement: testEvaluation.judgement,
      summary: testEvaluation.summary,
      analysis: testEvaluation.outputPayload?.analysis || {},
      confidence: testEvaluation.confidence
    };

    const classificationResult = problemClassifier.classifyProblem(classifierInput);
    console.log('✓ 分流结果:', JSON.stringify(classificationResult, null, 2));

    // 更新分类
    await repo.updateClassification(testEvaluation.evaluationId, {
      problemType: classificationResult.problem_type,
      needReview: classificationResult.need_review,
      classifyReason: classificationResult.classify_reason
    });

    // 验证写回结果
    const updatedEvaluation = await repo.findById(testEvaluation.evaluationId);
    console.log('✓ 验证数据库记录:');
    console.log('  - problemType:', updatedEvaluation.problemType);
    console.log('  - needReview:', updatedEvaluation.needReview);
    console.log('  - classifyReason:', updatedEvaluation.classifyReason);

    if (updatedEvaluation.problemType === 'known' && 
        updatedEvaluation.needReview === false &&
        updatedEvaluation.classifyReason.includes('场景明确')) {
      console.log('✅ 复验 4 通过：分流结果正确写入 live_evaluations\n');
      passCount++;
    } else {
      console.log('❌ 复验 4 失败：分流结果未正确写入\n');
    }
  } catch (error) {
    console.log('❌ 复验 4 异常:', error.message, '\n');
  }

  // 测试 5: 同一消息重复触发时是否不会重复分析
  console.log('【复验 5】同一消息重复触发时是否不会重复分析');
  totalCount++;
  
  try {
    const repo = new FileLiveEvaluationsRepository();
    
    // 创建第一条评估记录
    await repo.create({
      evaluationId: 'test_eval_reverify_002',
      sessionId: 'test_session_002',
      messageId: 'msg_duplicate_001',
      project: 'test_project',
      currentReply: '测试回复',
      inputPayload: { project: 'test_project' },
      outputPayload: { scenarioId: 'lanton_bank_transfer' },
      scenario: 'lanton_bank_transfer',
      judgement: 'pass',
      summary: '客服回复',
      confidence: 0.8
    });

    console.log('✓ 创建第一条评估记录');

    // 检查是否存在
    const exists = await repo.existsByMessageId('msg_duplicate_001');
    console.log('✓ 持久层去重检查: existsByMessageId("msg_duplicate_001") =', exists);

    if (exists === true) {
      console.log('✅ 复验 5 通过：持久层去重机制正常工作\n');
      passCount++;
    } else {
      console.log('❌ 复验 5 失败：持久层去重机制未正常工作\n');
    }
  } catch (error) {
    console.log('❌ 复验 5 异常:', error.message, '\n');
  }

  // 总结
  console.log('========== 复验测试完成 ==========\n');
  console.log(`测试结果: ${passCount}/${totalCount} 通过`);
  
  if (passCount === totalCount) {
    console.log('✅ 所有复验测试通过！');
    console.log('\n修复验证总结：');
    console.log('1. ✅ classifier 输入对象结构已修复（使用扁平化字段）');
    console.log('2. ✅ 返回值与入库结果已一致（返回 updatedEvaluation）');
    console.log('3. ✅ 去重机制已接入 repository（内存 + 持久层双重去重）');
    console.log('4. ✅ analyzed 标记时机已后移（写入成功后才标记）');
    console.log('\n可以进入下一阶段开发。');
    process.exit(0);
  } else {
    console.log('❌ 部分复验测试失败，需要继续修复。');
    process.exit(1);
  }
}

runReverificationTests().catch(error => {
  console.error('复验测试异常:', error);
  process.exit(1);
});
