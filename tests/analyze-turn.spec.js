/**
 * AnalyzeTurn 规范测试
 * 
 * 使用 scenario-fixtures 中的数据运行测试
 * 验证 analyzeTurn 能稳定输出结构化诊断
 * 
 * 协议版本: v1.0（标准协议）
 * - conversation 使用标准格式 [{role: "user"|"agent", content: string}]
 * - 使用 current_reply 替代 currentReply
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { analyzeTurn } = require('../core/evaluator');
const { getScenarioById } = require('../core/scenario-loader');

// ========== 辅助函数 ==========

function createConversation(turns) {
  return turns.map((turn, index) => ({
    role: turn.role === 'customer' ? 'user' : turn.role,
    content: turn.content,
    _meta: {
      turnIndex: index,
      ts: turn.timestamp || new Date().toISOString()
    }
  }));
}

async function runFixtureTest(fixtureFile) {
  const fixturePath = path.join(__dirname, 'scenario-fixtures', fixtureFile);
  const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  
  console.log(`\n[Fixture] ${fixture.description}`);
  console.log(`  场景: ${fixture.scenarioId}`);
  console.log(`  测试用例数: ${fixture.testCases.length}`);
  
  const scenario = getScenarioById(fixture.scenarioId);
  assert(scenario, `场景 ${fixture.scenarioId} 应存在`);
  
  let passed = 0;
  let failed = 0;
  
  for (const testCase of fixture.testCases) {
    try {
      console.log(`\n  [Case] ${testCase.name}`);
      
      const conversation = createConversation(testCase.conversation);
      const result = await analyzeTurn({
        project: fixture.projectId || 'default',
        scenario,
        conversation,
        current_reply: testCase.currentReply,
        metadata: {
          source: 'test',
          session_id: `test_${fixture.scenarioId}_${Date.now()}`,
          agent_id: 'test_agent',
          timestamp: new Date().toISOString(),
          entry_type: 'training'
        },
        rules: {}
      });
      
      // 验证输出结构
      assert(result.scenarioId, '应包含 scenarioId');
      assert(result.scenarioName, '应包含 scenarioName');
      assert(result.stage, '应包含 stage 信息');
      assert(result.result, '应包含 result');
      assert(['pass', 'borderline', 'fail', 'risk'].includes(result.result), 'result 应为有效等级');
      assert(result.riskLevel, '应包含 riskLevel');
      assert(result.coachSummary, '应包含 coachSummary');
      
      // 验证等级
      if (testCase.expectedLevel) {
        assert(result.result === testCase.expectedLevel, 
          `等级应为 ${testCase.expectedLevel}，实际为 ${result.result}`);
      }
      
      // 验证风险等级
      if (testCase.expectedRisk) {
        assert(result.riskLevel === testCase.expectedRisk,
          `风险等级应为 ${testCase.expectedRisk}，实际为 ${result.riskLevel}`);
      }
      
      // 验证缺失关键词
      if (testCase.missingKeywords) {
        const missingText = result.missing.join('');
        testCase.missingKeywords.forEach(kw => {
          assert(missingText.includes(kw) || result.issues.some(i => i.includes(kw)),
            `应缺失关键词: ${kw}`);
        });
      }
      
      // 验证禁忌内容
      if (testCase.forbiddenKeywords) {
        const hasForbidden = result.issues.some(i => i.includes('禁忌内容') || i.includes('全局禁忌'));
        assert(hasForbidden, '应检测到禁忌内容');
      }
      
      console.log(`    ✓ Level: ${result.result.level}, Risk: ${result.riskLevel}`);
      passed++;
      
    } catch (error) {
      console.error(`    ✗ 失败: ${error.message}`);
      failed++;
    }
  }
  
  return { passed, failed, total: fixture.testCases.length };
}

// ========== 运行所有 Fixture 测试 ==========

async function runAllFixtureTests() {
  console.log('===================================');
  console.log('AnalyzeTurn 规范测试');
  console.log('===================================');
  
  const fixtures = [
    'sms-code-positive.json',
    'sms-code-negative.json',
    'transfer-test-cases.json',
    'register-flow-test-cases.json'
  ];
  
  let totalPassed = 0;
  let totalFailed = 0;
  
  for (const fixture of fixtures) {
    const result = await runFixtureTest(fixture);
    totalPassed += result.passed;
    totalFailed += result.failed;
  }
  
  console.log('\n===================================');
  console.log(`测试完成: ${totalPassed} 通过, ${totalFailed} 失败`);
  console.log('===================================\n');
  
  if (totalFailed > 0) {
    process.exit(1);
  }
}

// 运行测试
runAllFixtureTests().catch(console.error);
