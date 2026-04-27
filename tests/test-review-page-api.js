/**
 * 主管审核页面承接接口验收测试
 * 
 * 测试内容：
 * 1. 查询待审核任务列表
 * 2. 查询审核任务详情
 * 3. 提交审核结果（approve/modify_and_approve/reject）
 * 4. 查询审核记录列表
 * 5. 查询审核统计
 * 
 * 执行命令：
 * cd /Users/adime/.openclaw/workspace/trainer-core
 * node tests/test-review-page-api.js
 */

const http = require('http');
const { LiveMonitorAPI } = require('../adapters/http/live-monitor-api');
const { defaultRepo: suggestionsRepo } = require('../repositories/impl/file-suggestions-repository');
const { defaultRepo: reviewsRepo } = require('../repositories/impl/file-reviews-repository');
const { defaultRepo: liveEvaluationsRepo } = require('../repositories/impl/file-live-evaluations-repository');
const { defaultRepo: liveMessagesRepo } = require('../repositories/impl/file-live-messages-repository');
const { defaultRepo: liveSessionsRepo } = require('../repositories/impl/file-live-sessions-repository');

const BASE_URL = 'http://localhost:3001';

// 测试数据
const testSession = {
  sessionId: 'live_session_001',
  project: 'lanton',
  chatId: '-100xxxx',
  agentId: 'agent_001',
  status: 'active',
  startedAt: new Date(),
  updatedAt: new Date()
};

const testEvaluation = {
  evaluationId: 'eval_001',
  sessionId: 'live_session_001',
  project: 'lanton',
  scenario: '转账未到账',
  stage: '信息收集阶段',
  judgement: '回复无法有效承接用户问题',
  summary: '客服未收集订单号、付款截图、付款时间等关键信息。',
  confidence: 0.62,
  problemType: 'unknown',
  needReview: true,
  classifyReason: '场景无法识别或置信度不足',
  currentReply: '请稍等',
  createdAt: new Date()
};

const testSuggestion = {
  id: 'suggestion_test_001',
  projectId: 'lanton',
  sessionId: 'live_session_001',
  messageId: 'msg_001',
  evaluationId: 'eval_001',
  entrySource: 'live_monitor',
  agentId: 'agent_001',
  scenario: '转账未到账',
  suggestedReply: '您好，请您提供付款截图和订单号，我们会进一步核查。',
  sourceType: 'ai_generated',
  status: 'active',
  reviewStatus: 'pending_review',
  createdAt: new Date(),
  updatedAt: new Date()
};

const testMessages = [
  {
    id: 'msg_001',
    messageId: 'msg_001',
    sessionId: 'live_session_001',
    role: 'user',
    senderId: 'user_001',
    senderName: '用户A',
    content: '我转账一直没到账',
    timestamp: new Date()
  },
  {
    id: 'msg_002',
    messageId: 'msg_002',
    sessionId: 'live_session_001',
    role: 'agent',
    senderId: 'agent_001',
    senderName: '客服A',
    content: '请稍等',
    timestamp: new Date()
  }
];

// HTTP 请求辅助函数
function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({
            statusCode: res.statusCode,
            data: JSON.parse(data)
          });
        } catch (e) {
          resolve({
            statusCode: res.statusCode,
            data: data
          });
        }
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

// 测试主函数
async function runTests() {
  console.log('=== 主管审核页面承接接口验收测试 ===\n');

  // 准备测试数据
  console.log('准备测试数据...');
  await liveSessionsRepo.create(testSession);
  await liveEvaluationsRepo.create(testEvaluation);
  await suggestionsRepo.create(testSuggestion);
  
  for (const msg of testMessages) {
    await liveMessagesRepo.create(msg);
  }
  console.log('测试数据准备完成\n');

  let passed = 0;
  let failed = 0;

  try {
    // 测试 1: 查询待审核任务列表
    console.log('测试 1: 查询待审核任务列表');
    try {
      const response = await makeRequest('GET', '/review/tasks');
      console.log('响应:', JSON.stringify(response.data, null, 2));
      
      if (response.data.code === 0 && response.data.data.list && Array.isArray(response.data.data.list)) {
        console.log('✓ 测试 1 通过\n');
        passed++;
      } else {
        console.log('✗ 测试 1 失败\n');
        failed++;
      }
    } catch (error) {
      console.log('✗ 测试 1 失败:', error.message, '\n');
      failed++;
    }

    // 测试 2: 查询审核任务详情
    console.log('测试 2: 查询审核任务详情');
    try {
      const response = await makeRequest('GET', `/review/tasks/${testSuggestion.id}`);
      console.log('响应:', JSON.stringify(response.data, null, 2));
      
      if (response.data.code === 0 && 
          response.data.data.suggestion && 
          response.data.data.session &&
          response.data.data.conversation &&
          response.data.data.evaluation) {
        console.log('✓ 测试 2 通过\n');
        passed++;
      } else {
        console.log('✗ 测试 2 失败\n');
        failed++;
      }
    } catch (error) {
      console.log('✗ 测试 2 失败:', error.message, '\n');
      failed++;
    }

    // 测试 3: 提交审核结果 - approve
    console.log('测试 3: 提交审核结果 - approve');
    try {
      const response = await makeRequest('POST', '/review/submit', {
        suggestion_id: testSuggestion.id,
        review_action: 'approve',
        reviewer_id: 'manager_001'
      });
      console.log('响应:', JSON.stringify(response.data, null, 2));
      
      if (response.data.code === 0 && 
          response.data.data.review_id &&
          response.data.data.status === 'approved') {
        console.log('✓ 测试 3 通过\n');
        passed++;
      } else {
        console.log('✗ 测试 3 失败\n');
        failed++;
      }
    } catch (error) {
      console.log('✗ 测试 3 失败:', error.message, '\n');
      failed++;
    }

    // 测试 4: 提交审核结果 - 已审核的 suggestion 不允许重复提交
    console.log('测试 4: 提交审核结果 - 已审核的 suggestion 不允许重复提交');
    try {
      const response = await makeRequest('POST', '/review/submit', {
        suggestion_id: testSuggestion.id,
        review_action: 'approve',
        reviewer_id: 'manager_001'
      });
      console.log('响应:', JSON.stringify(response.data, null, 2));
      
      if (response.data.code === 1 && response.data.error === 'suggestion_already_reviewed') {
        console.log('✓ 测试 4 通过\n');
        passed++;
      } else {
        console.log('✗ 测试 4 失败\n');
        failed++;
      }
    } catch (error) {
      console.log('✗ 测试 4 失败:', error.message, '\n');
      failed++;
    }

    // 测试 5: 提交审核结果 - modify_and_approve 缺少 final_reply
    console.log('测试 5: 提交审核结果 - modify_and_approve 缺少 final_reply');
    try {
      // 创建一个新的 suggestion 用于测试
      const newSuggestion = {
        ...testSuggestion,
        id: 'suggestion_test_002',
        evaluationId: 'eval_002',
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      const newEvaluation = {
        ...testEvaluation,
        id: 'eval_test_002',
        evaluationId: 'eval_002',
        createdAt: new Date()
      };
      
      await liveEvaluationsRepo.create(newEvaluation);
      await suggestionsRepo.create(newSuggestion);
      
      const response = await makeRequest('POST', '/review/submit', {
        suggestion_id: newSuggestion.id,
        review_action: 'modify_and_approve',
        reviewer_id: 'manager_001'
      });
      console.log('响应:', JSON.stringify(response.data, null, 2));
      
      if (response.data.code === 1 && response.data.error === 'final_reply_required') {
        console.log('✓ 测试 5 通过\n');
        passed++;
      } else {
        console.log('✗ 测试 5 失败\n');
        failed++;
      }
    } catch (error) {
      console.log('✗ 测试 5 失败:', error.message, '\n');
      failed++;
    }

    // 测试 6: 提交审核结果 - modify_and_approve
    console.log('测试 6: 提交审核结果 - modify_and_approve');
    try {
      const response = await makeRequest('POST', '/review/submit', {
        suggestion_id: 'suggestion_test_002',
        review_action: 'modify_and_approve',
        final_reply: '您好，为了帮您进一步核查，请您提供付款截图、订单号和付款时间，我们会尽快协助处理。',
        review_note: '补充订单号和付款时间',
        reviewer_id: 'manager_001'
      });
      console.log('响应:', JSON.stringify(response.data, null, 2));
      
      if (response.data.code === 0 && 
          response.data.data.review_id &&
          response.data.data.status === 'modified_approved') {
        console.log('✓ 测试 6 通过\n');
        passed++;
      } else {
        console.log('✗ 测试 6 失败\n');
        failed++;
      }
    } catch (error) {
      console.log('✗ 测试 6 失败:', error.message, '\n');
      failed++;
    }

    // 测试 7: 查询审核记录列表
    console.log('测试 7: 查询审核记录列表');
    try {
      const response = await makeRequest('GET', '/review/records');
      console.log('响应:', JSON.stringify(response.data, null, 2));
      
      if (response.data.code === 0 && response.data.data.list && Array.isArray(response.data.data.list)) {
        console.log('✓ 测试 7 通过\n');
        passed++;
      } else {
        console.log('✗ 测试 7 失败\n');
        failed++;
      }
    } catch (error) {
      console.log('✗ 测试 7 失败:', error.message, '\n');
      failed++;
    }

    // 测试 8: 查询审核统计
    console.log('测试 8: 查询审核统计');
    try {
      const response = await makeRequest('GET', '/review/stats');
      console.log('响应:', JSON.stringify(response.data, null, 2));
      
      if (response.data.code === 0 && 
          typeof response.data.data.pending_count === 'number' &&
          typeof response.data.data.approved_count === 'number') {
        console.log('✓ 测试 8 通过\n');
        passed++;
      } else {
        console.log('✗ 测试 8 失败\n');
        failed++;
      }
    } catch (error) {
      console.log('✗ 测试 8 失败:', error.message, '\n');
      failed++;
    }

    // 测试 9: 查询不存在的 suggestion 详情
    console.log('测试 9: 查询不存在的 suggestion 详情');
    try {
      const response = await makeRequest('GET', '/review/tasks/non_existent_id');
      console.log('响应:', JSON.stringify(response.data, null, 2));
      
      if (response.data.code === 1 && response.data.error === 'suggestion_not_found') {
        console.log('✓ 测试 9 通过\n');
        passed++;
      } else {
        console.log('✗ 测试 9 失败\n');
        failed++;
      }
    } catch (error) {
      console.log('✗ 测试 9 失败:', error.message, '\n');
      failed++;
    }

    // 测试 10: 提交审核结果 - 非法的 review_action
    console.log('测试 10: 提交审核结果 - 非法的 review_action');
    try {
      const newSuggestion = {
        ...testSuggestion,
        id: 'suggestion_test_003',
        evaluationId: 'eval_003',
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      const newEvaluation = {
        ...testEvaluation,
        id: 'eval_test_003',
        evaluationId: 'eval_003',
        createdAt: new Date()
      };
      
      await liveEvaluationsRepo.create(newEvaluation);
      await suggestionsRepo.create(newSuggestion);
      
      const response = await makeRequest('POST', '/review/submit', {
        suggestion_id: newSuggestion.id,
        review_action: 'invalid_action',
        reviewer_id: 'manager_001'
      });
      console.log('响应:', JSON.stringify(response.data, null, 2));
      
      if (response.data.code === 1 && response.data.error === 'invalid_review_action') {
        console.log('✓ 测试 10 通过\n');
        passed++;
      } else {
        console.log('✗ 测试 10 失败\n');
        failed++;
      }
    } catch (error) {
      console.log('✗ 测试 10 失败:', error.message, '\n');
      failed++;
    }

  } finally {
    // 输出测试结果
    console.log('=== 测试结果汇总 ===');
    console.log(`通过: ${passed}`);
    console.log(`失败: ${failed}`);
    console.log(`总计: ${passed + failed}`);
    
    if (failed === 0) {
      console.log('\n✓ 所有测试通过！');
    } else {
      console.log(`\n✗ ${failed} 个测试失败`);
    }
    
    process.exit(failed > 0 ? 1 : 0);
  }
}

// 启动服务器并运行测试
const api = new LiveMonitorAPI({ port: 3001 });

api.start();

// 等待服务器启动
setTimeout(() => {
  runTests().then(() => {
    api.stop();
  }).catch(err => {
    console.error('测试执行失败:', err);
    api.stop();
    process.exit(1);
  });
}, 1000);
