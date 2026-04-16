/**
 * Analysis Pipeline v5.0 测试
 * 
 * 测试新的分析管道:
 * loadScenario -> detectScenario -> detectStage -> checkCurrentReply -> analyzeGaps -> buildFeedback
 * 
 * 验证新的输入输出格式
 * 
 * 协议版本: v1.0（标准协议）
 * - 使用 project, conversation, current_reply, metadata, rules
 * - conversation 使用标准格式 [{role: "user"|"agent", content: string}]
 * - metadata 包含 session_id, agent_id, timestamp, entry_type
 */

const assert = require('assert');
const { analyzeTurn, analyzeConversation } = require('../core/evaluator');

console.log('===================================');
console.log('Analysis Pipeline v5.0 测试');
console.log('===================================');

// ========== 辅助函数 ==========

function createConversation(turns) {
  return turns.map((turn, index) => ({
    role: turn.role,
    text: turn.text,
    ts: turn.ts || new Date().toISOString()
  }));
}

// ========== 测试 1: analyzeTurn 基础功能 ==========

async function testAnalyzeTurn_Basic() {
  console.log('\n[Test 1] analyzeTurn 基础功能');
  
  const input = {
    projectId: 'lanton',
    mode: 'training',
    conversation: createConversation([
      { role: 'customer', text: '我注册LantonPay一直收不到验证码，怎么办？' }
    ]),
    currentReply: '您好！请您提供注册时使用的手机号，以便我们协助您申请验证码。',
    metadata: { scenarioId: 'lanton_sms_code' }
  };

  const result = await analyzeTurn(input);

  // 验证输出结构
  console.log('  scenarioId:', result.scenarioId);
  console.log('  scenarioName:', result.scenarioName);
  console.log('  stage:', result.stage);
  console.log('  result:', result.result);
  console.log('  riskLevel:', result.riskLevel);
  console.log('  issues:', result.issues.length);
  console.log('  missing:', result.missing.length);
  console.log('  strengths:', result.strengths.length);
  console.log('  nextAction:', result.nextAction);
  console.log('  confidence:', result.confidence);
  console.log('  reviewStatus:', result.reviewStatus);

  // 验证必填字段
  assert(result.scenarioId, '应包含 scenarioId');
  assert(result.scenarioName, '应包含 scenarioName');
  assert(result.stage, '应包含 stage');
  assert(['pass', 'borderline', 'fail', 'risk'].includes(result.result), 'result 应为有效等级');
  assert(['none', 'low', 'medium', 'high', 'critical'].includes(result.riskLevel), 'riskLevel 应为有效值');
  assert(Array.isArray(result.issues), 'issues 应为数组');
  assert(Array.isArray(result.missing), 'missing 应为数组');
  assert(Array.isArray(result.strengths), 'strengths 应为数组');
  assert(result.nextAction, '应包含 nextAction');
  assert(result.coachSummary, '应包含 coachSummary');
  assert(typeof result.confidence === 'number', 'confidence 应为数字');
  assert(result.confidence >= 0 && result.confidence <= 1, 'confidence 应在 0-1 之间');

  console.log('  ✓ 通过');
}

// ========== 测试 2: analyzeTurn 多轮对话 ==========

async function testAnalyzeTurn_MultiTurn() {
  console.log('\n[Test 2] analyzeTurn 多轮对话');
  
  const input = {
    projectId: 'lanton',
    mode: 'live_monitor',
    conversation: createConversation([
      { role: 'customer', text: '收不到验证码' },
      { role: 'agent', text: '您好！请您提供注册手机号，我们协助申请。' },
      { role: 'customer', text: '我的手机号是13800138000' }
    ]),
    currentReply: '收到！我们已为您申请验证码，预计5分钟内发送，请您注意查收。',
    metadata: { scenarioId: 'lanton_sms_code' }
  };

  const result = await analyzeTurn(input);

  console.log('  result:', result.result);
  console.log('  riskLevel:', result.riskLevel);
  console.log('  strengths:', result.strengths);

  assert(result.scenarioId === 'lanton_sms_code', '应正确识别场景');
  assert(result.confidence > 0, 'confidence 应大于 0');

  console.log('  ✓ 通过');
}

// ========== 测试 3: analyzeConversation ==========

async function testAnalyzeConversation() {
  console.log('\n[Test 3] analyzeConversation 完整对话分析');
  
  const input = {
    projectId: 'lanton',
    mode: 'training',
    conversation: createConversation([
      { role: 'customer', text: '收不到验证码' },
      { role: 'agent', text: '您好！请您提供注册手机号，我们协助申请。' },
      { role: 'customer', text: '13800138000' },
      { role: 'agent', text: '收到！已为您申请，预计5分钟内收到。' }
    ]),
    metadata: { scenarioId: 'lanton_sms_code' }
  };

  const result = await analyzeConversation(input);

  console.log('  scenarioId:', result.scenarioId);
  console.log('  scenarioName:', result.scenarioName);
  console.log('  totalTurns:', result.overall.totalTurns);
  console.log('  agentTurns:', result.overall.agentTurns);
  console.log('  levelDistribution:', result.overall.levelDistribution);
  console.log('  avgConfidence:', result.overall.avgConfidence);

  assert(result.projectId === 'lanton', '应包含 projectId');
  assert(result.mode === 'training', '应包含 mode');
  assert(result.turns.length === 2, '应有2轮客服回复');
  assert(result.overall.totalTurns === 2, '总轮次应为2');
  assert(result.overall.avgConfidence > 0, '平均置信度应大于0');

  // 验证每轮结果结构
  result.turns.forEach((turn, index) => {
    assert(turn.scenarioId, `轮次 ${index} 应包含 scenarioId`);
    assert(turn.result, `轮次 ${index} 应包含 result`);
    assert(turn.confidence, `轮次 ${index} 应包含 confidence`);
  });

  console.log('  ✓ 通过');
}

// ========== 测试 4: 不同 mode 的 reviewStatus ==========

async function testReviewStatus_DifferentModes() {
  console.log('\n[Test 4] 不同 mode 的 reviewStatus');
  
  // training 模式 - pass
  const trainingInput = {
    projectId: 'lanton',
    mode: 'training',
    conversation: createConversation([
      { role: 'customer', text: '收不到验证码' }
    ]),
    currentReply: '您好！请您提供注册手机号，我们协助申请。',
    metadata: { scenarioId: 'lanton_sms_code' }
  };

  const trainingResult = await analyzeTurn(trainingInput);
  console.log('  training mode reviewStatus:', trainingResult.reviewStatus);
  assert(['pending', 'auto_pass', 'needs_review'].includes(trainingResult.reviewStatus), 'reviewStatus 应为有效值');

  // live_monitor 模式
  const liveInput = {
    ...trainingInput,
    mode: 'live_monitor'
  };

  const liveResult = await analyzeTurn(liveInput);
  console.log('  live_monitor mode reviewStatus:', liveResult.reviewStatus);
  assert(['pending', 'auto_pass', 'needs_review'].includes(liveResult.reviewStatus), 'reviewStatus 应为有效值');

  console.log('  ✓ 通过');
}

// ========== 测试 5: 风险等级映射 ==========

async function testRiskLevelMapping() {
  console.log('\n[Test 5] 风险等级映射');
  
  const input = {
    projectId: 'lanton',
    mode: 'training',
    conversation: createConversation([
      { role: 'customer', text: '收不到验证码' }
    ]),
    currentReply: '你自己等等吧，这个我们没办法',
    metadata: { scenarioId: 'lanton_sms_code' }
  };

  const result = await analyzeTurn(input);

  console.log('  result:', result.result);
  console.log('  riskLevel:', result.riskLevel);
  console.log('  issues:', result.issues);

  // 包含禁忌内容应该是 risk 或 high
  assert(result.result === 'risk' || result.riskLevel === 'high' || result.riskLevel === 'critical', 
    '包含禁忌内容应有高风险等级');

  console.log('  ✓ 通过');
}

// ========== 运行所有测试 ==========

async function runAllTests() {
  const tests = [
    testAnalyzeTurn_Basic,
    testAnalyzeTurn_MultiTurn,
    testAnalyzeConversation,
    testReviewStatus_DifferentModes,
    testRiskLevelMapping
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      await test();
      passed++;
    } catch (error) {
      console.error('  ✗ 失败:', error.message);
      console.error('    堆栈:', error.stack.split('\n').slice(1, 3).join('\n    '));
      failed++;
    }
  }

  console.log('\n===================================');
  console.log(`测试完成: ${passed} 通过, ${failed} 失败`);
  console.log('===================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

// 运行测试
runAllTests().catch(console.error);
