/**
 * 质检记录查询接口测试脚本
 * 
 * 测试内容：
 * 1. 查询质检会话列表
 * 2. 查询质检会话详情
 * 3. 查询单条质检结果详情
 * 4. 查询告警列表
 * 5. 查询质检基础统计
 * 6. 筛选功能验证
 * 7. 分页功能验证
 * 8. 异常处理验证
 */

const http = require('http');

const API_BASE = 'http://localhost:3001';

// 测试计数器
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

/**
 * HTTP GET 请求
 */
function httpGet(path) {
  return new Promise((resolve, reject) => {
    http.get(`${API_BASE}${path}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({
            statusCode: res.statusCode,
            data: JSON.parse(data)
          });
        } catch (err) {
          reject(new Error('Invalid JSON response'));
        }
      });
    }).on('error', reject);
  });
}

/**
 * 测试函数
 */
async function runTest(name, testFn) {
  totalTests++;
  try {
    await testFn();
    passedTests++;
    console.log(`✅ ${name}`);
  } catch (err) {
    failedTests++;
    console.log(`❌ ${name}`);
    console.log(`   错误: ${err.message}`);
  }
}

/**
 * 断言函数
 */
function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

/**
 * 主测试函数
 */
async function main() {
  console.log('='.repeat(60));
  console.log('质检记录查询接口测试');
  console.log('='.repeat(60));
  console.log();

  // ==================== 测试 1: 查询质检会话列表 ====================
  await runTest('测试 1: 查询质检会话列表（无筛选）', async () => {
    const response = await httpGet('/quality/sessions');
    
    assert(response.statusCode === 200, `状态码应为 200，实际为 ${response.statusCode}`);
    assert(response.data.list !== undefined, '返回应包含 list 字段');
    assert(response.data.total !== undefined, '返回应包含 total 字段');
    assert(response.data.page !== undefined, '返回应包含 page 字段');
    assert(response.data.page_size !== undefined, '返回应包含 page_size 字段');
    assert(Array.isArray(response.data.list), 'list 应为数组');
    
    console.log(`   返回 ${response.data.list.length} 条记录，总数 ${response.data.total}`);
  });

  // ==================== 测试 2: 分页功能 ====================
  await runTest('测试 2: 分页功能（page_size=5）', async () => {
    const response = await httpGet('/quality/sessions?page=1&page_size=5');
    
    assert(response.statusCode === 200, '状态码应为 200');
    assert(response.data.page === 1, 'page 应为 1');
    assert(response.data.page_size === 5, 'page_size 应为 5');
    assert(response.data.list.length <= 5, '返回数量不应超过 page_size');
    
    console.log(`   返回 ${response.data.list.length} 条记录`);
  });

  // ==================== 测试 3: page_size 最大值限制 ====================
  await runTest('测试 3: page_size 最大值限制（100）', async () => {
    const response = await httpGet('/quality/sessions?page=1&page_size=200');
    
    assert(response.statusCode === 200, '状态码应为 200');
    assert(response.data.page_size <= 100, 'page_size 最大应为 100');
    
    console.log(`   page_size 限制为 ${response.data.page_size}`);
  });

  // ==================== 测试 4: 查询质检会话详情 ====================
  await runTest('测试 4: 查询质检会话详情', async () => {
    // 先获取一个 session_id
    const listResponse = await httpGet('/quality/sessions?page=1&page_size=1');
    
    if (listResponse.data.list.length === 0) {
      console.log('   ⚠️  无数据，跳过详情测试');
      return;
    }

    const sessionId = listResponse.data.list[0].session_id;
    const response = await httpGet(`/quality/sessions/${sessionId}`);
    
    assert(response.statusCode === 200, '状态码应为 200');
    assert(response.data.session !== undefined, '返回应包含 session 字段');
    assert(response.data.messages !== undefined, '返回应包含 messages 字段');
    assert(response.data.evaluations !== undefined, '返回应包含 evaluations 字段');
    assert(response.data.alerts !== undefined, '返回应包含 alerts 字段');
    assert(response.data.session.session_id === sessionId, 'session_id 应匹配');
    assert(Array.isArray(response.data.messages), 'messages 应为数组');
    assert(Array.isArray(response.data.evaluations), 'evaluations 应为数组');
    assert(Array.isArray(response.data.alerts), 'alerts 应为数组');
    
    console.log(`   Session: ${response.data.session.session_id}`);
    console.log(`   Messages: ${response.data.messages.length} 条`);
    console.log(`   Evaluations: ${response.data.evaluations.length} 条`);
    console.log(`   Alerts: ${response.data.alerts.length} 条`);
  });

  // ==================== 测试 5: session 不存在 ====================
  await runTest('测试 5: session 不存在返回 404', async () => {
    const response = await httpGet('/quality/sessions/nonexistent_session');
    
    assert(response.statusCode === 404, '状态码应为 404');
    assert(response.data.error === 'quality_session_not_found', '错误码应为 quality_session_not_found');
    
    console.log(`   返回错误: ${response.data.error}`);
  });

  // ==================== 测试 6: 查询单条质检结果详情 ====================
  await runTest('测试 6: 查询单条质检结果详情', async () => {
    // 先获取一个 evaluation_id
    const listResponse = await httpGet('/quality/sessions?page=1&page_size=1');
    
    if (listResponse.data.list.length === 0) {
      console.log('   ⚠️  无数据，跳过 evaluation 详情测试');
      return;
    }

    const sessionId = listResponse.data.list[0].session_id;
    const sessionDetail = await httpGet(`/quality/sessions/${sessionId}`);
    
    if (sessionDetail.data.evaluations.length === 0) {
      console.log('   ⚠️  无 evaluation 数据，跳过测试');
      return;
    }

    const evaluationId = sessionDetail.data.evaluations[0].id;
    const response = await httpGet(`/quality/evaluations/${evaluationId}`);
    
    assert(response.statusCode === 200, '状态码应为 200');
    assert(response.data.evaluation !== undefined, '返回应包含 evaluation 字段');
    assert(response.data.alerts !== undefined, '返回应包含 alerts 字段');
    assert(response.data.evaluation.id === evaluationId, 'evaluation_id 应匹配');
    assert(response.data.evaluation.input_payload !== undefined, '应包含 input_payload');
    assert(response.data.evaluation.output_payload !== undefined, '应包含 output_payload');
    
    console.log(`   Evaluation: ${response.data.evaluation.id}`);
    console.log(`   Scenario: ${response.data.evaluation.scenario}`);
    console.log(`   Confidence: ${response.data.evaluation.confidence}`);
  });

  // ==================== 测试 7: evaluation 不存在 ====================
  await runTest('测试 7: evaluation 不存在返回 404', async () => {
    const response = await httpGet('/quality/evaluations/nonexistent_eval');
    
    assert(response.statusCode === 404, '状态码应为 404');
    assert(response.data.error === 'quality_evaluation_not_found', '错误码应为 quality_evaluation_not_found');
    
    console.log(`   返回错误: ${response.data.error}`);
  });

  // ==================== 测试 8: 查询告警列表 ====================
  await runTest('测试 8: 查询告警列表', async () => {
    const response = await httpGet('/quality/alerts');
    
    assert(response.statusCode === 200, '状态码应为 200');
    assert(response.data.list !== undefined, '返回应包含 list 字段');
    assert(response.data.total !== undefined, '返回应包含 total 字段');
    assert(response.data.page !== undefined, '返回应包含 page 字段');
    assert(response.data.page_size !== undefined, '返回应包含 page_size 字段');
    assert(Array.isArray(response.data.list), 'list 应为数组');
    
    console.log(`   返回 ${response.data.list.length} 条告警，总数 ${response.data.total}`);
  });

  // ==================== 测试 9: 告警列表分页 ====================
  await runTest('测试 9: 告警列表分页', async () => {
    const response = await httpGet('/quality/alerts?page=1&page_size=10');
    
    assert(response.statusCode === 200, '状态码应为 200');
    assert(response.data.page === 1, 'page 应为 1');
    assert(response.data.page_size === 10, 'page_size 应为 10');
    
    console.log(`   返回 ${response.data.list.length} 条告警`);
  });

  // ==================== 测试 10: 查询质检统计 ====================
  await runTest('测试 10: 查询质检基础统计', async () => {
    const response = await httpGet('/quality/stats');
    
    assert(response.statusCode === 200, '状态码应为 200');
    assert(response.data.total_sessions !== undefined, '应包含 total_sessions');
    assert(response.data.total_messages !== undefined, '应包含 total_messages');
    assert(response.data.total_evaluations !== undefined, '应包含 total_evaluations');
    assert(response.data.known_count !== undefined, '应包含 known_count');
    assert(response.data.unknown_count !== undefined, '应包含 unknown_count');
    assert(response.data.alert_count !== undefined, '应包含 alert_count');
    assert(response.data.scenario_distribution !== undefined, '应包含 scenario_distribution');
    assert(response.data.agent_distribution !== undefined, '应包含 agent_distribution');
    assert(Array.isArray(response.data.scenario_distribution), 'scenario_distribution 应为数组');
    assert(Array.isArray(response.data.agent_distribution), 'agent_distribution 应为数组');
    
    console.log(`   Sessions: ${response.data.total_sessions}`);
    console.log(`   Messages: ${response.data.total_messages}`);
    console.log(`   Evaluations: ${response.data.total_evaluations}`);
    console.log(`   Known: ${response.data.known_count}, Unknown: ${response.data.unknown_count}`);
    console.log(`   Alerts: ${response.data.alert_count} (High: ${response.data.high_alert_count}, Medium: ${response.data.medium_alert_count})`);
  });

  // ==================== 测试 11: 按 project 筛选 ====================
  await runTest('测试 11: 按 project 筛选会话列表', async () => {
    const response = await httpGet('/quality/sessions?project=default');
    
    assert(response.statusCode === 200, '状态码应为 200');
    assert(Array.isArray(response.data.list), 'list 应为数组');
    
    // 验证返回的 session 都属于指定 project
    for (const session of response.data.list) {
      assert(session.project === 'default', `session.project 应为 'default'，实际为 '${session.project}'`);
    }
    
    console.log(`   返回 ${response.data.list.length} 条记录`);
  });

  // ==================== 测试 12: 筛选条件组合 ====================
  await runTest('测试 12: 多条件筛选（project + problem_type）', async () => {
    const response = await httpGet('/quality/sessions?project=default&problem_type=known');
    
    assert(response.statusCode === 200, '状态码应为 200');
    assert(Array.isArray(response.data.list), 'list 应为数组');
    
    console.log(`   返回 ${response.data.list.length} 条记录`);
  });

  // ==================== 测试 13: 无数据返回空数组 ====================
  await runTest('测试 13: 无数据时返回空数组', async () => {
    const response = await httpGet('/quality/sessions?project=nonexistent_project');
    
    assert(response.statusCode === 200, '状态码应为 200');
    assert(Array.isArray(response.data.list), 'list 应为数组');
    assert(response.data.list.length === 0 || response.data.total === 0, '无数据时应返回空数组或 total=0');
    
    console.log(`   返回 ${response.data.list.length} 条记录，总数 ${response.data.total}`);
  });

  // ==================== 测试 14: 接口返回结构稳定性 ====================
  await runTest('测试 14: 接口返回结构稳定性（不裸露数据库字段）', async () => {
    const response = await httpGet('/quality/sessions?page=1&page_size=1');
    
    if (response.data.list.length > 0) {
      const session = response.data.list[0];
      
      // 验证使用下划线命名（稳定结构）
      assert(session.session_id !== undefined, '应使用 session_id 字段');
      assert(session.message_count !== undefined, '应使用 message_count 字段');
      assert(session.evaluation_count !== undefined, '应使用 evaluation_count 字段');
      
      // 验证不使用驼峰命名（数据库原始字段）
      assert(session.sessionId === undefined, '不应使用 sessionId（数据库字段）');
      
      console.log('   返回结构符合规范（使用下划线命名）');
    } else {
      console.log('   ⚠️  无数据，跳过结构验证');
    }
  });

  // ==================== 测试总结 ====================
  console.log();
  console.log('='.repeat(60));
  console.log('测试总结');
  console.log('='.repeat(60));
  console.log(`总测试数: ${totalTests}`);
  console.log(`通过: ${passedTests}`);
  console.log(`失败: ${failedTests}`);
  console.log();

  if (failedTests === 0) {
    console.log('✅ 所有测试通过！');
  } else {
    console.log(`❌ 有 ${failedTests} 个测试失败，请检查日志`);
  }
}

// 运行测试
main().catch(err => {
  console.error('测试运行错误:', err);
  process.exit(1);
});
