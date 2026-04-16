/**
 * Trainer 主链测试
 * 验证：输入校验、场景加载、评分调用、错误处理
 * 
 * 协议版本: v1.0（标准协议）
 */

const { evaluateTraining } = require('../core/trainer');

async function runTests() {
  console.log('=== Trainer 主链测试 ===\n');
  let passed = 0;
  let failed = 0;

  // 测试1: 正常输入（使用标准协议）
  console.log('测试1: 正常输入...');
  try {
    const result = await evaluateTraining({
      project: 'default',
      conversation: [
        {
          role: 'user',
          content: '我注册LantonPay一直收不到验证码，怎么办？',
          _meta: { turnIndex: 0, ts: new Date().toISOString() }
        },
        {
          role: 'agent',
          content: '您好，请提供手机号，我们帮您申请验证码。',
          _meta: { turnIndex: 1, ts: new Date().toISOString() }
        }
      ],
      current_reply: '您好，请提供手机号，我们帮您申请验证码。',
      metadata: {
        source: 'test',
        session_id: 'test_trainer_001',
        agent_id: 'test_agent',
        timestamp: new Date().toISOString(),
        entry_type: 'training',
        scenarioId: 'lanton_sms_code'
      },
      rules: {}
    });
    // v5.1 输出结构：scenarioId, scenarioName, stage, result, riskLevel, issues, missing, strengths, nextAction, coachSummary, confidence
    if (result.scenarioId && result.stage && result.result && result.issues !== undefined) {
      console.log('  ✓ 通过 - 场景:', result.scenarioId, '阶段:', result.stage, '结果:', result.result);
      passed++;
    } else {
      console.log('  ✗ 失败 - 返回结构不完整');
      failed++;
    }
  } catch (err) {
    console.log('  ✗ 失败:', err.message);
    failed++;
  }

  // 测试2: 缺少 scenarioId（应该使用默认场景）
  console.log('\n测试2: 缺少 scenarioId...');
  try {
    const result = await evaluateTraining({
      project: 'default',
      conversation: [
        {
          role: 'user',
          content: '测试消息',
          _meta: { turnIndex: 0, ts: new Date().toISOString() }
        },
        {
          role: 'agent',
          content: '测试回复',
          _meta: { turnIndex: 1, ts: new Date().toISOString() }
        }
      ],
      current_reply: '测试回复',
      metadata: {
        source: 'test',
        session_id: 'test_trainer_002',
        agent_id: 'test_agent',
        timestamp: new Date().toISOString(),
        entry_type: 'training'
      },
      rules: {}
    });
    // v5.1 会自动使用默认场景，不会抛错
    if (result.scenarioId && result.result) {
      console.log('  ✓ 通过 - 使用默认场景:', result.scenarioId);
      passed++;
    } else {
      console.log('  ✗ 失败 - 返回结构不完整');
      failed++;
    }
  } catch (err) {
    // 如果抛错，也接受（取决于场景加载策略）
    if (err.message.includes('scenarioId') || err.message.includes('SCENARIO_NOT_FOUND')) {
      console.log('  ✓ 通过 - 正确捕获错误:', err.message.substring(0, 50));
      passed++;
    } else {
      console.log('  ✗ 失败 - 错误类型不对:', err.message);
      failed++;
    }
  }

  // 测试3: 缺少 current_reply
  console.log('\n测试3: 缺少 current_reply...');
  try {
    await evaluateTraining({
      project: 'default',
      conversation: [
        {
          role: 'user',
          content: '测试消息',
          _meta: { turnIndex: 0, ts: new Date().toISOString() }
        }
      ],
      current_reply: '',
      metadata: {
        source: 'test',
        session_id: 'test_trainer_003',
        agent_id: 'test_agent',
        timestamp: new Date().toISOString(),
        entry_type: 'training',
        scenarioId: 'lanton_sms_code'
      },
      rules: {}
    });
    console.log('  ✗ 失败 - 应该抛出错误');
    failed++;
  } catch (err) {
    if (err.message.includes('current_reply') || err.message.includes('currentReply')) {
      console.log('  ✓ 通过 - 正确捕获错误');
      passed++;
    } else {
      console.log('  ✗ 失败 - 错误类型不对:', err.message);
      failed++;
    }
  }

  // 测试4: 场景不存在（应使用兜底场景）
  console.log('\n测试4: 场景不存在...');
  try {
    const result = await evaluateTraining({
      project: 'default',
      conversation: [
        {
          role: 'user',
          content: '测试消息',
          _meta: { turnIndex: 0, ts: new Date().toISOString() }
        },
        {
          role: 'agent',
          content: '测试回复',
          _meta: { turnIndex: 1, ts: new Date().toISOString() }
        }
      ],
      current_reply: '测试回复',
      metadata: {
        source: 'test',
        session_id: 'test_trainer_004',
        agent_id: 'test_agent',
        timestamp: new Date().toISOString(),
        entry_type: 'training',
        scenarioId: 'not_exist_scenario'
      },
      rules: {}
    });
    // v5.1 会使用兜底场景，不会抛错
    if (result.scenarioId && result.result) {
      console.log('  ✓ 通过 - 使用兜底场景:', result.scenarioId);
      passed++;
    } else {
      console.log('  ✗ 失败 - 返回结构不完整');
      failed++;
    }
  } catch (err) {
    // 如果抛错，也接受
    if (err.message.includes('未找到场景') || err.message.includes('SCENARIO_NOT_FOUND')) {
      console.log('  ✓ 通过 - 正确捕获错误:', err.message.substring(0, 50));
      passed++;
    } else {
      console.log('  ✗ 失败 - 错误类型不对:', err.message);
      failed++;
    }
  }

  // 测试5: 空输入
  console.log('\n测试5: 空输入...');
  try {
    await evaluateTraining(null);
    console.log('  ✗ 失败 - 应该抛出错误');
    failed++;
  } catch (err) {
    console.log('  ✓ 通过 - 正确捕获错误');
    passed++;
  }

  console.log('\n=== 测试结果 ===');
  console.log(`通过: ${passed}`);
  console.log(`失败: ${failed}`);
  return failed === 0;
}

runTests().then(success => {
  process.exit(success ? 0 : 1);
});
