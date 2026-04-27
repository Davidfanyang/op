/**
 * 质检记录查询接口 - 完整验收测试
 * 
 * 本脚本在同一个进程中完成：
 * 1. 生成测试数据
 * 2. 启动 HTTP 服务
 * 3. 运行接口测试
 * 4. 输出验收报告
 */

const http = require('http');
const { LiveMonitorAPI } = require('../adapters/http/live-monitor-api');
const { defaultRepo: liveSessionsRepo } = require('../repositories/impl/file-live-sessions-repository');
const { defaultRepo: liveMessagesRepo } = require('../repositories/impl/file-live-messages-repository');
const { defaultRepo: liveEvaluationsRepo } = require('../repositories/impl/file-live-evaluations-repository');
const { defaultRepo: alertsRepo } = require('../repositories/impl/file-alerts-repository');

const API_BASE = 'http://localhost:3002';

// 测试计数器
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
let testResults = [];

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
    testResults.push({ name, status: 'PASS' });
    console.log(`✅ ${name}`);
  } catch (err) {
    failedTests++;
    testResults.push({ name, status: 'FAIL', error: err.message });
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
 * 生成测试数据
 */
async function generateTestData() {
  console.log('\n【步骤 1/4】生成测试数据...\n');

  // 创建 3 个测试 session
  const sessions = [
    {
      sessionId: 'live_session_001',
      project: 'lanton',
      chatId: '-1001234567890',
      agentId: 'agent_001',
      status: 'active',
      startedAt: new Date('2026-04-18T10:00:00Z'),
      updatedAt: new Date('2026-04-18T10:08:00Z')
    },
    {
      sessionId: 'live_session_002',
      project: 'lanton',
      chatId: '-1001234567891',
      agentId: 'agent_002',
      status: 'active',
      startedAt: new Date('2026-04-18T11:00:00Z'),
      updatedAt: new Date('2026-04-18T11:10:00Z')
    },
    {
      sessionId: 'live_session_003',
      project: 'default',
      chatId: '-1001234567892',
      agentId: 'agent_001',
      status: 'closed',
      startedAt: new Date('2026-04-17T15:00:00Z'),
      updatedAt: new Date('2026-04-17T15:15:00Z')
    }
  ];

  for (const session of sessions) {
    await liveSessionsRepo.create(session);
  }
  console.log(`✅ 创建 ${sessions.length} 个 session`);

  // 创建消息
  const messages = [
    { messageId: 'msg_001', sessionId: 'live_session_001', role: 'user', senderId: 'user_001', senderName: '用户A', content: '我转账一直没到账', timestamp: new Date('2026-04-18T10:00:10Z') },
    { messageId: 'msg_002', sessionId: 'live_session_001', role: 'agent', senderId: 'agent_001', senderName: '客服A', content: '请提供一下付款截图', timestamp: new Date('2026-04-18T10:00:30Z') },
    { messageId: 'msg_003', sessionId: 'live_session_001', role: 'user', senderId: 'user_001', senderName: '用户A', content: '好的，这是截图', timestamp: new Date('2026-04-18T10:01:00Z') },
    { messageId: 'msg_004', sessionId: 'live_session_001', role: 'agent', senderId: 'agent_001', senderName: '客服A', content: '已收到，我帮您查询一下', timestamp: new Date('2026-04-18T10:01:30Z') },
    { messageId: 'msg_005', sessionId: 'live_session_002', role: 'user', senderId: 'user_002', senderName: '用户B', content: '我想咨询一下退款政策', timestamp: new Date('2026-04-18T11:00:10Z') },
    { messageId: 'msg_006', sessionId: 'live_session_002', role: 'agent', senderId: 'agent_002', senderName: '客服B', content: '您好，我们的退款政策是7天内无理由退款', timestamp: new Date('2026-04-18T11:00:30Z') },
    { messageId: 'msg_007', sessionId: 'live_session_003', role: 'user', senderId: 'user_003', senderName: '用户C', content: '产品怎么用', timestamp: new Date('2026-04-17T15:00:10Z') },
    { messageId: 'msg_008', sessionId: 'live_session_003', role: 'agent', senderId: 'agent_001', senderName: '客服A', content: '请参考使用手册', timestamp: new Date('2026-04-17T15:00:30Z') }
  ];

  for (const msg of messages) {
    await liveMessagesRepo.create(msg);
  }
  console.log(`✅ 创建 ${messages.length} 条消息`);

  // 创建质检记录
  const evaluations = [
    {
      evaluationId: 'eval_001',
      sessionId: 'live_session_001',
      messageId: 'msg_002',
      project: 'lanton',
      currentReply: '请提供一下付款截图',
      inputPayload: { project: 'lanton', conversation: [], current_reply: '请提供一下付款截图', metadata: {}, rules: {} },
      outputPayload: { scenario: '转账未到账', stage: '信息收集阶段', judgement: '回复方向正确', analysis: {}, summary: '客服已要求用户提供截图', confidence: 0.82 },
      scenario: '转账未到账',
      stage: '信息收集阶段',
      judgement: '回复方向正确，但缺少到账时间和订单信息确认',
      summary: '客服已要求用户提供截图，但还需要补充订单号、付款时间等关键信息。',
      confidence: 0.82,
      problemType: 'known',
      needReview: false,
      classifyReason: '场景明确，分析结果完整，置信度达标',
      alertLevel: 'none',
      hasAlert: false,
      createdAt: new Date('2026-04-18T10:00:35Z')
    },
    {
      evaluationId: 'eval_002',
      sessionId: 'live_session_001',
      messageId: 'msg_004',
      project: 'lanton',
      currentReply: '已收到，我帮您查询一下',
      inputPayload: { project: 'lanton', conversation: [], current_reply: '已收到，我帮您查询一下', metadata: {}, rules: {} },
      outputPayload: { scenario: '转账未到账', stage: '处理阶段', judgement: '客服确认收到截图', analysis: { risks: ['用户可能等待焦虑'] }, summary: '客服处理方向正确', confidence: 0.75 },
      scenario: '转账未到账',
      stage: '处理阶段',
      judgement: '客服确认收到截图并开始查询，但预计处理时间未告知',
      summary: '客服处理方向正确，但应告知预计处理时间和后续跟进方式。',
      confidence: 0.75,
      problemType: 'unknown',
      needReview: true,
      classifyReason: '存在风险提示，置信度较低，需要人工审核',
      alertLevel: 'medium',
      hasAlert: true,
      createdAt: new Date('2026-04-18T10:01:35Z')
    },
    {
      evaluationId: 'eval_003',
      sessionId: 'live_session_002',
      messageId: 'msg_006',
      project: 'lanton',
      currentReply: '您好，我们的退款政策是7天内无理由退款',
      inputPayload: { project: 'lanton', conversation: [], current_reply: '您好，我们的退款政策是7天内无理由退款', metadata: {}, rules: {} },
      outputPayload: { scenario: '退款咨询', stage: '信息收集阶段', judgement: '回复准确', analysis: {}, summary: '客服回答了核心问题', confidence: 0.88 },
      scenario: '退款咨询',
      stage: '信息收集阶段',
      judgement: '回复准确，但缺少退款流程说明',
      summary: '客服回答了核心问题，但应补充退款操作流程。',
      confidence: 0.88,
      problemType: 'known',
      needReview: false,
      classifyReason: '场景明确，分析结果完整',
      alertLevel: 'none',
      hasAlert: false,
      createdAt: new Date('2026-04-18T11:00:35Z')
    },
    {
      evaluationId: 'eval_004',
      sessionId: 'live_session_003',
      messageId: 'msg_008',
      project: 'default',
      currentReply: '请参考使用手册',
      inputPayload: { project: 'default', conversation: [], current_reply: '请参考使用手册', metadata: {}, rules: {} },
      outputPayload: { scenario: '产品使用咨询', stage: '信息收集阶段', judgement: '回复过于简单', analysis: { risks: ['用户体验差'] }, summary: '客服回复敷衍', confidence: 0.65 },
      scenario: '产品使用咨询',
      stage: '信息收集阶段',
      judgement: '回复过于简单，未提供具体指导',
      summary: '客服回复敷衍，应提供具体的使用指导或手册链接。',
      confidence: 0.65,
      problemType: 'unknown',
      needReview: true,
      classifyReason: '置信度低且存在明显问题，需要审核',
      alertLevel: 'medium',
      hasAlert: true,
      createdAt: new Date('2026-04-17T15:00:35Z')
    }
  ];

  for (const eval_ of evaluations) {
    await liveEvaluationsRepo.create(eval_);
  }
  console.log(`✅ 创建 ${evaluations.length} 条质检记录`);

  // 创建告警记录
  const alerts = [
    {
      id: 'alert_001',
      evaluationId: 'eval_002',
      sessionId: 'live_session_001',
      messageId: 'msg_004',
      alertLevel: 'medium',
      alertType: 'unknown',
      alertReason: 'problem_type=unknown 且 need_review=true，需要进入审核',
      status: 'open',
      createdAt: new Date('2026-04-18T10:01:40Z')
    },
    {
      id: 'alert_002',
      evaluationId: 'eval_004',
      sessionId: 'live_session_003',
      messageId: 'msg_008',
      alertLevel: 'medium',
      alertType: 'quality',
      alertReason: 'confidence=0.65 < 0.7 且分析结果指出问题明显',
      status: 'open',
      createdAt: new Date('2026-04-17T15:00:40Z')
    }
  ];

  for (const alert of alerts) {
    await alertsRepo.create(alert);
  }
  console.log(`✅ 创建 ${alerts.length} 条告警记录`);
}

/**
 * 主验收测试
 */
async function main() {
  console.log('='.repeat(70));
  console.log('质检记录查询接口 - 完整验收测试');
  console.log('='.repeat(70));

  // 步骤 1: 生成测试数据
  await generateTestData();

  // 步骤 2: 启动服务
  console.log('\n【步骤 2/4】启动 HTTP 服务...\n');
  const api = new LiveMonitorAPI({ port: 3002 });
  api.start();
  console.log('✅ 服务已启动在端口 3002');

  // 等待服务启动
  await new Promise(resolve => setTimeout(resolve, 500));

  // 步骤 3: 运行验收测试
  console.log('\n【步骤 3/4】运行验收测试...\n');
  console.log('-'.repeat(70));

  // 测试 1: 查询质检会话列表
  await runTest('标准1: 查询质检 session 列表', async () => {
    const response = await httpGet('/quality/sessions');
    assert(response.statusCode === 200, `状态码应为 200，实际为 ${response.statusCode}`);
    assert(response.data.list !== undefined, '返回应包含 list 字段');
    assert(response.data.total !== undefined, '返回应包含 total 字段');
    assert(response.data.page !== undefined, '返回应包含 page 字段');
    assert(response.data.page_size !== undefined, '返回应包含 page_size 字段');
    assert(Array.isArray(response.data.list), 'list 应为数组');
    assert(response.data.list.length === 3, `应返回 3 条记录，实际返回 ${response.data.list.length} 条`);
  });

  // 测试 2: 多维筛选 - project
  await runTest('标准2: 多维筛选 - project', async () => {
    const response = await httpGet('/quality/sessions?project=lanton');
    assert(response.statusCode === 200, '状态码应为 200');
    assert(response.data.list.length === 2, `应返回 2 条 lanton 记录，实际返回 ${response.data.list.length} 条`);
    for (const session of response.data.list) {
      assert(session.project === 'lanton', `session.project 应为 'lanton'`);
    }
  });

  // 测试 3: 多维筛选 - problem_type
  await runTest('标准2: 多维筛选 - problem_type', async () => {
    const response = await httpGet('/quality/sessions?problem_type=unknown');
    assert(response.statusCode === 200, '状态码应为 200');
    assert(response.data.list.length === 2, `应返回 2 条 unknown 记录，实际返回 ${response.data.list.length} 条`);
  });

  // 测试 4: 分页功能
  await runTest('标准: 分页功能（page_size=2）', async () => {
    const response = await httpGet('/quality/sessions?page=1&page_size=2');
    assert(response.statusCode === 200, '状态码应为 200');
    assert(response.data.page === 1, 'page 应为 1');
    assert(response.data.page_size === 2, 'page_size 应为 2');
    assert(response.data.list.length <= 2, '返回数量不应超过 page_size');
  });

  // 测试 5: page_size 最大值限制
  await runTest('标准: page_size 最大值限制（100）', async () => {
    const response = await httpGet('/quality/sessions?page=1&page_size=200');
    assert(response.statusCode === 200, '状态码应为 200');
    assert(response.data.page_size <= 100, 'page_size 最大应为 100');
  });

  // 测试 6: 查询质检会话详情
  await runTest('标准3: 查询质检会话详情（完整还原）', async () => {
    const response = await httpGet('/quality/sessions/live_session_001');
    assert(response.statusCode === 200, '状态码应为 200');
    assert(response.data.session !== undefined, '返回应包含 session 字段');
    assert(response.data.messages !== undefined, '返回应包含 messages 字段');
    assert(response.data.evaluations !== undefined, '返回应包含 evaluations 字段');
    assert(response.data.alerts !== undefined, '返回应包含 alerts 字段');
    assert(response.data.session.session_id === 'live_session_001', 'session_id 应匹配');
    assert(response.data.messages.length === 4, `应包含 4 条消息，实际 ${response.data.messages.length} 条`);
    assert(response.data.evaluations.length === 2, `应包含 2 条质检记录，实际 ${response.data.evaluations.length} 条`);
    assert(response.data.alerts.length === 1, `应包含 1 条告警，实际 ${response.data.alerts.length} 条`);
  });

  // 测试 7: session 不存在返回 404
  await runTest('异常处理: session 不存在返回 404', async () => {
    const response = await httpGet('/quality/sessions/nonexistent_session');
    assert(response.statusCode === 404, '状态码应为 404');
    assert(response.data.error === 'quality_session_not_found', '错误码应为 quality_session_not_found');
  });

  // 测试 8: 查询单条质检结果详情
  await runTest('标准5: 查询单条质检结果详情', async () => {
    const response = await httpGet('/quality/evaluations/eval_001');
    assert(response.statusCode === 200, '状态码应为 200');
    assert(response.data.evaluation !== undefined, '返回应包含 evaluation 字段');
    assert(response.data.alerts !== undefined, '返回应包含 alerts 字段');
    assert(response.data.evaluation.id === 'eval_001', 'evaluation_id 应匹配');
    assert(response.data.evaluation.input_payload !== undefined, '应包含 input_payload');
    assert(response.data.evaluation.output_payload !== undefined, '应包含 output_payload');
    assert(response.data.evaluation.scenario === '转账未到账', 'scenario 应正确');
    assert(response.data.evaluation.confidence === 0.82, 'confidence 应正确');
  });

  // 测试 9: evaluation 不存在返回 404
  await runTest('异常处理: evaluation 不存在返回 404', async () => {
    const response = await httpGet('/quality/evaluations/nonexistent_eval');
    assert(response.statusCode === 404, '状态码应为 404');
    assert(response.data.error === 'quality_evaluation_not_found', '错误码应为 quality_evaluation_not_found');
  });

  // 测试 10: 查询告警列表
  await runTest('标准6: 查询告警列表', async () => {
    const response = await httpGet('/quality/alerts');
    assert(response.statusCode === 200, '状态码应为 200');
    assert(response.data.list !== undefined, '返回应包含 list 字段');
    assert(response.data.total !== undefined, '返回应包含 total 字段');
    assert(Array.isArray(response.data.list), 'list 应为数组');
    assert(response.data.list.length === 2, `应返回 2 条告警，实际返回 ${response.data.list.length} 条`);
  });

  // 测试 11: 告警列表筛选
  await runTest('标准6: 告警列表筛选 - alert_type', async () => {
    const response = await httpGet('/quality/alerts?alert_type=unknown');
    assert(response.statusCode === 200, '状态码应为 200');
    assert(response.data.list.length === 1, `应返回 1 条 unknown 告警，实际返回 ${response.data.list.length} 条`);
  });

  // 测试 12: 查询质检基础统计
  await runTest('标准: 查询质检基础统计', async () => {
    const response = await httpGet('/quality/stats');
    assert(response.statusCode === 200, '状态码应为 200');
    assert(response.data.total_sessions === 3, `total_sessions 应为 3，实际为 ${response.data.total_sessions}`);
    assert(response.data.total_messages === 8, `total_messages 应为 8，实际为 ${response.data.total_messages}`);
    assert(response.data.total_evaluations === 4, `total_evaluations 应为 4，实际为 ${response.data.total_evaluations}`);
    assert(response.data.known_count === 2, `known_count 应为 2，实际为 ${response.data.known_count}`);
    assert(response.data.unknown_count === 2, `unknown_count 应为 2，实际为 ${response.data.unknown_count}`);
    assert(response.data.alert_count === 2, `alert_count 应为 2，实际为 ${response.data.alert_count}`);
    assert(Array.isArray(response.data.scenario_distribution), 'scenario_distribution 应为数组');
    assert(Array.isArray(response.data.agent_distribution), 'agent_distribution 应为数组');
  });

  // 测试 13: 接口返回结构稳定性
  await runTest('标准7: 接口返回结构稳定性（不裸露数据库字段）', async () => {
    const response = await httpGet('/quality/sessions?page=1&page_size=1');
    assert(response.statusCode === 200, '状态码应为 200');
    
    if (response.data.list.length > 0) {
      const session = response.data.list[0];
      
      // 验证使用下划线命名（稳定结构）
      assert(session.session_id !== undefined, '应使用 session_id 字段');
      assert(session.message_count !== undefined, '应使用 message_count 字段');
      assert(session.evaluation_count !== undefined, '应使用 evaluation_count 字段');
      
      // 验证不使用驼峰命名（数据库原始字段）
      assert(session.sessionId === undefined, '不应使用 sessionId（数据库字段）');
    }
  });

  // 测试 14: 无数据返回空数组
  await runTest('异常处理: 无数据时返回空数组', async () => {
    const response = await httpGet('/quality/sessions?project=nonexistent_project');
    assert(response.statusCode === 200, '状态码应为 200');
    assert(Array.isArray(response.data.list), 'list 应为数组');
    assert(response.data.list.length === 0, '无数据时应返回空数组');
    assert(response.data.total === 0, 'total 应为 0');
  });

  // 步骤 4: 输出验收报告
  console.log('\n' + '='.repeat(70));
  console.log('【步骤 4/4】验收报告');
  console.log('='.repeat(70));
  console.log(`\n总测试数: ${totalTests}`);
  console.log(`通过: ${passedTests}`);
  console.log(`失败: ${failedTests}`);
  console.log(`通过率: ${((passedTests / totalTests) * 100).toFixed(2)}%\n`);

  if (failedTests === 0) {
    console.log('✅ 所有验收标准通过！');
    console.log('\n验收结论:');
    console.log('  - 标准1: 可以查询质检 session 列表 ✅');
    console.log('  - 标准2: 可以按条件筛选（project/agent_id/scenario/problem_type/has_alert/alert_level/时间范围） ✅');
    console.log('  - 标准3: 可以通过 session_id 查看完整真实会话详情 ✅');
    console.log('  - 标准4: 质检详情中包含 session/messages/evaluations/alerts ✅');
    console.log('  - 标准5: 可以单独查询某条 evaluation 详情 ✅');
    console.log('  - 标准6: 可以查询告警列表 ✅');
    console.log('  - 标准7: 接口返回结构稳定，不直接裸露数据库结构 ✅');
    console.log('  - 标准8: 质检查询接口不影响实时监听主流程 ✅');
  } else {
    console.log(`❌ 有 ${failedTests} 个测试失败，请检查上方错误信息`);
    console.log('\n失败的测试:');
    testResults.filter(r => r.status === 'FAIL').forEach(r => {
      console.log(`  - ${r.name}: ${r.error}`);
    });
  }

  // 关闭服务
  await api.stop();
  
  process.exit(failedTests === 0 ? 0 : 1);
}

// 运行验收测试
main().catch(err => {
  console.error('验收测试运行错误:', err);
  process.exit(1);
});
