#!/usr/bin/env node

/**
 * Unknown 闭环最终验收 E2E 测试脚本
 * 
 * 测试流程：
 * 1. 记录测试前数据
 * 2. 发送 unknown 问题触发实时质检
 * 3. 验证生成 suggestion
 * 4. 验证 suggestion 进入 review
 * 5. 验证 review approve 后沉淀到 knowledge_base
 * 6. 输出验收结论
 */

const http = require('http');
const mysql = require('mysql2/promise');

// ============ 配置 ============
const API_HOST = 'localhost';
const API_PORT = 3001;
const DB_CONFIG = {
  host: 'localhost',
  user: 'root',
  database: 'trainer_core',
  waitForConnections: true,
  connectionLimit: 5
};

// ============ 工具函数 ============
function log(title, data) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(title);
  console.log('='.repeat(60));
  if (data) console.log(data);
}

function apiRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: API_HOST,
      port: API_PORT,
      path,
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(data);
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function queryDB(sql) {
  const conn = await mysql.createConnection(DB_CONFIG);
  try {
    const [rows] = await conn.query(sql);
    return rows;
  } finally {
    await conn.end();
  }
}

async function getCounts() {
  const rows = await queryDB(`
    SELECT 
      (SELECT COUNT(*) FROM live_sessions) as live_sessions,
      (SELECT COUNT(*) FROM live_messages) as live_messages,
      (SELECT COUNT(*) FROM live_evaluations) as live_evaluations,
      (SELECT COUNT(*) FROM suggestions) as suggestions,
      (SELECT COUNT(*) FROM reviews) as reviews,
      (SELECT COUNT(*) FROM knowledge_base) as knowledge_base
  `);
  return rows[0];
}

// ============ 测试主流程 ============
async function main() {
  console.log('\n🚀 开始 Unknown 闭环最终验收测试\n');

  // 步骤1：记录测试前数据
  log('【步骤1】记录测试前数据');
  const beforeCounts = await getCounts();
  console.log('测试前数据：');
  console.log(`  live_sessions: ${beforeCounts.live_sessions}`);
  console.log(`  live_messages: ${beforeCounts.live_messages}`);
  console.log(`  live_evaluations: ${beforeCounts.live_evaluations}`);
  console.log(`  suggestions: ${beforeCounts.suggestions}`);
  console.log(`  reviews: ${beforeCounts.reviews}`);
  console.log(`  knowledge_base: ${beforeCounts.knowledge_base}`);

  const sessionId = `unknown_e2e_${Date.now()}`;
  const agentId = 'agent_unknown_001';
  const customerId = 'customer_unknown_001';

  // 步骤2：发送 unknown 问题（不在知识库中的问题）
  log('【步骤2】发送 unknown 问题触发实时质检');
  
  // 构造完整conversation（必须包含user和agent消息）
  const conversation = [
    {
      role: 'user',
      content: '你好，我想了解一下量子计算在区块链中的应用前景',
      timestamp: new Date(Date.now() - 60000).toISOString()  // 1分钟前
    },
    {
      role: 'agent',
      content: '关于量子计算在区块链中的应用前景分析',
      timestamp: new Date().toISOString()
    }
  ];
  
  const unknownMessage = {
    projectId: 'default',
    project: 'default',
    mode: 'live_monitor',
    channel: 'telegram',
    employeeId: agentId,
    customerId: customerId,
    sessionId: sessionId,
    direction: 'outbound',
    content: '关于量子计算在区块链中的应用前景分析',
    current_reply: '关于量子计算在区块链中的应用前景分析',
    conversation: conversation,  // 完整conversation
    metadata: {
      session_id: sessionId,
      agent_id: agentId,
      customer_id: customerId,
      project: 'default',
      projectId: 'default',
      source: 'live_monitor',
      entry_type: 'live_monitor',
      timestamp: new Date().toISOString()
    },
    timestamp: new Date().toISOString(),
    rules: {}
  };

  const unknownResponse = await apiRequest('POST', '/evaluate', unknownMessage);
  console.log('Unknown 问题发送成功');
  console.log(`  sessionId: ${unknownResponse.sessionId || sessionId}`);
  console.log(`  messageId: ${unknownResponse.messageId || 'N/A'}`);
  console.log(`  analysisId: ${unknownResponse.analysisId || 'N/A'}`);
  console.log(`  alertTriggered: ${unknownResponse.alertTriggered}`);
  console.log(`  reviewId: ${unknownResponse.reviewId || 'N/A'}`);
  console.log(`  response: ${JSON.stringify(unknownResponse, null, 2)}`);

  // 等待5秒确保数据分析和建议生成完成
  await new Promise(resolve => setTimeout(resolve, 5000));

  // 步骤3：查询本次新增的 live_evaluation
  log('【步骤3】查询本次新增的 live_evaluation');
  const evaluations = await queryDB(`
    SELECT evaluation_id, session_id, problem_type, need_review, classify_reason, created_at
    FROM live_evaluations
    WHERE session_id = '${sessionId}'
    ORDER BY created_at DESC
    LIMIT 1
  `);

  let evaluationId = null;
  let problemType = null;
  let needReview = null;
  
  if (evaluations.length > 0) {
    const evalRecord = evaluations[0];
    evaluationId = evalRecord.evaluation_id;
    problemType = evalRecord.problem_type;
    needReview = evalRecord.need_review;
    console.log(`  ✅ Live Evaluation 已生成: ${evalRecord.evaluation_id}`);
    console.log(`     session_id: ${evalRecord.session_id}`);
    console.log(`     problem_type: ${evalRecord.problem_type}`);
    console.log(`     need_review: ${evalRecord.need_review}`);
    console.log(`     classify_reason: ${evalRecord.classify_reason}`);
  } else {
    console.log(`  ❌ 未找到本次 live_evaluation`);
  }

  // 步骤4：验证 suggestion 生成
  log('【步骤4】验证 suggestion 生成');
  let suggestionId = null;
  
  if (evaluationId) {
    const suggestions = await queryDB(`
      SELECT suggestion_id, evaluation_id, status, suggested_reply, created_at
      FROM suggestions
      WHERE evaluation_id = '${evaluationId}'
      ORDER BY created_at DESC
      LIMIT 1
    `);
    
    if (suggestions.length > 0) {
      const suggestion = suggestions[0];
      suggestionId = suggestion.suggestion_id;
      console.log(`  ✅ Suggestion 已生成: ${suggestion.suggestion_id}`);
      console.log(`     evaluation_id: ${suggestion.evaluation_id}`);
      console.log(`     status: ${suggestion.status}`);
      console.log(`     suggested_reply: ${suggestion.suggested_reply?.substring(0, 50)}...`);
    } else {
      console.log(`  ❌ 未找到 suggestion（evaluation_id: ${evaluationId}）`);
    }
  } else {
    console.log(`  ⚠️  跳过 suggestion 查询（无 evaluation_id）`);
  }

  // 步骤5：验证 review 生成
  log('【步骤5】验证 review 生成');
  let reviewId = null;
  let reviewRecord = null;
  
  if (suggestionId) {
    const reviews = await queryDB(`
      SELECT review_id, evaluation_id, suggestion_id, review_status, review_action, final_reply, created_at
      FROM reviews
      WHERE suggestion_id = '${suggestionId}'
      ORDER BY created_at DESC
      LIMIT 1
    `);
    
    if (reviews.length > 0) {
      reviewRecord = reviews[0];
      reviewId = reviewRecord.review_id;
      console.log(`  ✅ Review 已生成: ${reviewRecord.review_id}`);
      console.log(`     evaluation_id: ${reviewRecord.evaluation_id}`);
      console.log(`     suggestion_id: ${reviewRecord.suggestion_id}`);
      console.log(`     review_status: ${reviewRecord.review_status}`);
    } else {
      console.log(`  ❌ 未找到 review（suggestion_id: ${suggestionId}）`);
    }
  } else {
    console.log(`  ⚠️  跳过 review 查询（无 suggestion_id）`);
  }

  // 步骤6：提交 approve（如果 review 存在且未处理）
  if (reviewId && reviewRecord && (reviewRecord.review_status === 'pending' || reviewRecord.review_status === 'pending_review')) {
    log('【步骤6】提交 approve');
    const approvePayload = {
      suggestion_id: suggestionId,
      review_action: 'approve',
      reviewer_id: 'admin_e2e',
      review_note: 'E2E测试 approve'
    };

    try {
      const approveResponse = await apiRequest('POST', '/review/submit', approvePayload);
      console.log('Approve 提交成功');
      console.log(`  reviewId: ${approveResponse.reviewId || reviewId}`);
      console.log(`  reviewStatus: ${approveResponse.reviewStatus || 'N/A'}`);
      console.log(`  finalReply: ${approveResponse.finalReply?.substring(0, 50) || 'N/A'}...`);

      // 等待3秒确保知识沉淀完成
      await new Promise(resolve => setTimeout(resolve, 3000));
    } catch (err) {
      console.log(`  ⚠️  Approve 提交失败: ${err.message}`);
    }
  } else if (reviewId) {
    console.log(`  ℹ️  Review 已处理，跳过 approve（status: ${reviewRecord?.review_status}）`);
  } else {
    console.log(`  ⚠️  无 review，跳过 approve`);
  }

  // 步骤7：验证 knowledge_base 沉淀
  log('【步骤7】验证 knowledge_base 沉淀');
  let knowledgeId = null;
  let knowledgeRecord = null;
  
  if (suggestionId) {
    const knowledgeBase = await queryDB(`
      SELECT knowledge_id, source_suggestion_id, source_review_id, source_evaluation_id, 
             source_session_id, standard_answer, status, created_at
      FROM knowledge_base
      WHERE source_suggestion_id = '${suggestionId}'
      ORDER BY created_at DESC
      LIMIT 1
    `);

    if (knowledgeBase.length > 0) {
      knowledgeRecord = knowledgeBase[0];
      knowledgeId = knowledgeRecord.knowledge_id;
      console.log(`  ✅ Knowledge 已沉淀: ${knowledgeRecord.knowledge_id}`);
      console.log(`     source_suggestion_id: ${knowledgeRecord.source_suggestion_id}`);
      console.log(`     source_review_id: ${knowledgeRecord.source_review_id}`);
      console.log(`     source_evaluation_id: ${knowledgeRecord.source_evaluation_id}`);
      console.log(`     source_session_id: ${knowledgeRecord.source_session_id}`);
      console.log(`     standard_answer: ${knowledgeRecord.standard_answer?.substring(0, 50)}...`);
      console.log(`     status: ${knowledgeRecord.status}`);
    } else {
      console.log(`  ❌ 未找到 knowledge_base 记录（suggestion_id: ${suggestionId}）`);
    }
  } else {
    console.log(`  ⚠️  跳过 knowledge_base 查询（无 suggestion_id）`);
  }

  // 步骤8：记录测试后数据
  log('【步骤8】记录测试后数据');
  const afterCounts = await getCounts();
  console.log('测试后数据：');
  console.log(`  live_sessions: ${afterCounts.live_sessions} (增量: ${afterCounts.live_sessions - beforeCounts.live_sessions})`);
  console.log(`  live_messages: ${afterCounts.live_messages} (增量: ${afterCounts.live_messages - beforeCounts.live_messages})`);
  console.log(`  live_evaluations: ${afterCounts.live_evaluations} (增量: ${afterCounts.live_evaluations - beforeCounts.live_evaluations})`);
  console.log(`  suggestions: ${afterCounts.suggestions} (增量: ${afterCounts.suggestions - beforeCounts.suggestions})`);
  console.log(`  reviews: ${afterCounts.reviews} (增量: ${afterCounts.reviews - beforeCounts.reviews})`);
  console.log(`  knowledge_base: ${afterCounts.knowledge_base} (增量: ${afterCounts.knowledge_base - beforeCounts.knowledge_base})`);

  // 步骤9：输出验收结论
  log('【步骤9】验收结论');
  
  // 输出本次新增数据详情
  console.log('\n📋 本次新增数据详情：');
  console.log('  1. Live Evaluation:');
  console.log(`     - evaluation_id: ${evaluationId || 'N/A'}`);
  console.log(`     - session_id: ${sessionId}`);
  console.log(`     - problem_type: ${problemType || 'N/A'}`);
  console.log(`     - need_review: ${needReview || 'N/A'}`);
  
  console.log('  2. Suggestion:');
  console.log(`     - suggestion_id: ${suggestionId || 'N/A'}`);
  console.log(`     - evaluation_id: ${evaluationId || 'N/A'}`);
  console.log(`     - status: ${suggestionId ? 'pending_review' : 'N/A'}`);
  
  console.log('  3. Review:');
  console.log(`     - review_id: ${reviewId || 'N/A'}`);
  console.log(`     - suggestion_id: ${suggestionId || 'N/A'}`);
  console.log(`     - review_action: ${reviewRecord?.review_action || 'N/A'}`);
  
  console.log('  4. Knowledge Base:');
  console.log(`     - knowledge_id: ${knowledgeId || 'N/A'}`);
  console.log(`     - source_review_id: ${knowledgeRecord?.source_review_id || 'N/A'}`);
  console.log(`     - source_suggestion_id: ${knowledgeRecord?.source_suggestion_id || 'N/A'}`);
  console.log(`     - source_evaluation_id: ${knowledgeRecord?.source_evaluation_id || 'N/A'}`);
  console.log(`     - source_session_id: ${knowledgeRecord?.source_session_id || 'N/A'}`);
  console.log(`     - standard_answer: ${knowledgeRecord?.standard_answer?.substring(0, 30) || 'N/A'}...`);
  
  const checks = {
    'live_evaluations 增量 >= 1': (afterCounts.live_evaluations - beforeCounts.live_evaluations) >= 1,
    'suggestions 增量 >= 1': (afterCounts.suggestions - beforeCounts.suggestions) >= 1,
    'reviews 增量 >= 1': (afterCounts.reviews - beforeCounts.reviews) >= 1,
    'knowledge_base 增量 >= 1': (afterCounts.knowledge_base - beforeCounts.knowledge_base) >= 1,
    'suggestion.evaluation_id 可关联': evaluationId !== null && suggestionId !== null,
    'review.suggestion_id 可关联': suggestionId !== null && reviewId !== null,
    'knowledge_base 可追溯 source_suggestion_id': knowledgeId !== null && knowledgeRecord?.source_suggestion_id === suggestionId,
    'knowledge_base 可追溯 source_review_id': knowledgeId !== null && knowledgeRecord?.source_review_id === reviewId,
    'knowledge_base 可追溯 source_evaluation_id': knowledgeId !== null && knowledgeRecord?.source_evaluation_id === evaluationId,
    'knowledge_base 可追溯 source_session_id': knowledgeId !== null && knowledgeRecord?.source_session_id === sessionId
  };

  console.log('\n✅ 验收检查项：');
  let allPassed = true;
  for (const [check, passed] of Object.entries(checks)) {
    console.log(`  ${passed ? '✅' : '❌'} ${check}`);
    if (!passed) allPassed = false;
  }

  console.log('\n' + '='.repeat(60));
  if (allPassed) {
    console.log('🎉 验收结果: PASS');
    console.log('='.repeat(60));
    console.log('\nUnknown 闭环验证成功：');
    console.log('  unknown → suggestion → review → knowledge_base');
    console.log('\n所有数据串联成功：');
    console.log(`  evaluation(${evaluationId?.substring(0, 20)}...) → suggestion(${suggestionId?.substring(0, 20)}...) → review(${reviewId?.substring(0, 20)}...) → knowledge(${knowledgeId?.substring(0, 20)}...)`);
    process.exit(0);
  } else {
    console.log('❌ 验收结果: FAIL');
    console.log('='.repeat(60));
    console.log('\n部分环节未完成，请检查：');
    if (!evaluationId) console.log('  ❌ live_evaluation 未生成');
    if (!suggestionId) console.log('  ❌ suggestion 未生成');
    if (!reviewId) console.log('  ❌ review 未生成');
    if (!knowledgeId) console.log('  ❌ knowledge_base 未沉淀');
    process.exit(1);
  }
}

// ============ 执行 ============
main().catch(err => {
  console.error('\n❌ 测试执行失败:', err);
  process.exit(1);
});
