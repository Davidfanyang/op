#!/usr/bin/env node

/**
 * 实时质检链路最终验收 E2E 测试脚本
 * 
 * 测试流程：
 * 1. 记录测试前数据
 * 2. 发送 inbound 用户消息
 * 3. 发送 outbound 客服回复
 * 4. 触发实时质检分析
 * 5. 验证数据关联
 * 6. 输出测试后数据
 * 7. 输出验收结论
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
      (SELECT COUNT(*) FROM live_evaluations) as live_evaluations
  `);
  return rows[0];
}

// ============ 测试主流程 ============
async function main() {
  console.log('\n🚀 开始实时质检链路最终验收测试\n');

  // 步骤1：记录测试前数据
  log('【步骤1】记录测试前数据');
  const beforeCounts = await getCounts();
  console.log('测试前数据：');
  console.log(`  live_sessions: ${beforeCounts.live_sessions}`);
  console.log(`  live_messages: ${beforeCounts.live_messages}`);
  console.log(`  live_evaluations: ${beforeCounts.live_evaluations}`);

  const sessionId = `live_e2e_final_${Date.now()}`;
  const agentId = 'agent_e2e_001';
  const customerId = 'customer_e2e_001';

  // 步骤2：发送 inbound 用户消息
  log('【步骤2】发送 inbound 用户消息');
  const userMessage = {
    projectId: 'default',
    project: 'default',
    mode: 'live_monitor',
    channel: 'telegram',
    employeeId: agentId,
    customerId: customerId,
    sessionId: sessionId,
    direction: 'inbound',
    content: '你好，我转账成功了，但是对方没收到钱，帮我查一下',
    current_reply: '你好，我转账成功了，但是对方没收到钱，帮我查一下',
    timestamp: new Date().toISOString(),
    rules: {}
  };

  const userResponse = await apiRequest('POST', '/evaluate', userMessage);
  console.log('用户消息发送成功');
  console.log(`  sessionId: ${userResponse.sessionId || sessionId}`);
  console.log(`  messageId: ${userResponse.messageId || 'N/A'}`);

  // 等待1秒确保数据写入
  await new Promise(resolve => setTimeout(resolve, 1000));

  // 步骤3：发送 outbound 客服回复
  log('【步骤3】发送 outbound 客服回复');
  const agentMessage = {
    projectId: 'default',
    project: 'default',
    mode: 'live_monitor',
    channel: 'telegram',
    employeeId: agentId,
    customerId: customerId,
    sessionId: sessionId,
    direction: 'outbound',
    content: '您好，为了帮您进一步核查，请您提供付款截图和绑定手机号，我们会尽快为您处理。',
    current_reply: '您好，为了帮您进一步核查，请您提供付款截图和绑定手机号，我们会尽快为您处理。',
    timestamp: new Date().toISOString(),
    rules: {}
  };

  const agentResponse = await apiRequest('POST', '/evaluate', agentMessage);
  console.log('客服消息发送成功');
  console.log(`  sessionId: ${agentResponse.sessionId || sessionId}`);
  console.log(`  messageId: ${agentResponse.messageId || 'N/A'}`);
  console.log(`  analysisId: ${agentResponse.analysisId || 'N/A'}`);
  console.log(`  alertTriggered: ${agentResponse.alertTriggered}`);

  // 等待3秒确保数据分析完成
  await new Promise(resolve => setTimeout(resolve, 3000));

  // 步骤4：验证数据
  log('【步骤4】验证 live_* 表数据');

  // 4.1 验证 live_sessions
  const sessions = await queryDB(`
    SELECT session_id, project, agent_id, status, created_at 
    FROM live_sessions 
    WHERE session_id = '${sessionId}'
  `);
  console.log('live_sessions 验证：');
  if (sessions.length > 0) {
    console.log(`  ✅ 找到会话: ${sessions[0].session_id}`);
    console.log(`     project: ${sessions[0].project}`);
    console.log(`     agent_id: ${sessions[0].agent_id}`);
    console.log(`     status: ${sessions[0].status}`);
  } else {
    console.log(`  ❌ 未找到会话: ${sessionId}`);
  }

  // 4.2 验证 live_messages（必须有 user 和 agent）
  const messages = await queryDB(`
    SELECT message_id, session_id, role, sender_id, content, created_at 
    FROM live_messages 
    WHERE session_id = '${sessionId}'
    ORDER BY created_at ASC
  `);
  console.log('\nlive_messages 验证：');
  console.log(`  消息总数: ${messages.length}`);
  
  const hasUser = messages.some(m => m.role === 'user');
  const hasAgent = messages.some(m => m.role === 'agent');
  
  if (hasUser) {
    const userMsg = messages.find(m => m.role === 'user');
    console.log(`  ✅ user 角色消息: ${userMsg.content.substring(0, 30)}...`);
  } else {
    console.log(`  ❌ 缺少 user 角色消息`);
  }
  
  if (hasAgent) {
    const agentMsg = messages.find(m => m.role === 'agent');
    console.log(`  ✅ agent 角色消息: ${agentMsg.content.substring(0, 30)}...`);
  } else {
    console.log(`  ❌ 缺少 agent 角色消息`);
  }

  // 4.3 验证 live_evaluations
  const evaluations = await queryDB(`
    SELECT evaluation_id, session_id, message_id, project, scenario, stage, judgement, summary, confidence, created_at,
           JSON_EXTRACT(output_payload, '$.status') as eval_status,
           JSON_EXTRACT(output_payload, '$.result.level') as result_level,
           JSON_EXTRACT(output_payload, '$.coachSummary') as coach_summary
    FROM live_evaluations 
    WHERE session_id = '${sessionId}'
    ORDER BY created_at ASC
  `);
  console.log('\nlive_evaluations 验证：');
  console.log(`  评估总数: ${evaluations.length}`);
  
  if (evaluations.length > 0) {
    const eval1 = evaluations[0];
    console.log(`  evaluation_id: ${eval1.evaluation_id}`);
    console.log(`  eval_status: ${eval1.eval_status ? eval1.eval_status.replace(/"/g, '') : 'N/A'}`);
    console.log(`  result_level: ${eval1.result_level ? eval1.result_level.replace(/"/g, '') : 'N/A'}`);
    console.log(`  coach_summary: ${eval1.coach_summary ? eval1.coach_summary.replace(/"/g, '') : 'N/A'}`);
    
    // 检查是否有 project 错误
    const hasProjectError = evaluations.some(e => {
      const summary = e.coach_summary ? e.coach_summary.replace(/"/g, '') : '';
      return summary.includes('缺少必填字段: project');
    });
    
    if (hasProjectError) {
      console.log(`  ❌ 存在 project 字段缺失错误`);
    } else {
      console.log(`  ✅ 无 project 字段缺失错误`);
    }
  }

  // 步骤5：记录测试后数据
  log('【步骤5】记录测试后数据');
  const afterCounts = await getCounts();
  console.log('测试后数据：');
  console.log(`  live_sessions: ${afterCounts.live_sessions} (增量: ${afterCounts.live_sessions - beforeCounts.live_sessions})`);
  console.log(`  live_messages: ${afterCounts.live_messages} (增量: ${afterCounts.live_messages - beforeCounts.live_messages})`);
  console.log(`  live_evaluations: ${afterCounts.live_evaluations} (增量: ${afterCounts.live_evaluations - beforeCounts.live_evaluations})`);

  // 步骤6：输出验收结论
  log('【步骤6】验收结论');
  
  const checks = {
    'live_sessions 增量 >= 1': (afterCounts.live_sessions - beforeCounts.live_sessions) >= 1,
    'live_messages 增量 >= 2': (afterCounts.live_messages - beforeCounts.live_messages) >= 2,
    'live_evaluations 增量 >= 1': (afterCounts.live_evaluations - beforeCounts.live_evaluations) >= 1,
    'live_messages 同时存在 user 和 agent': hasUser && hasAgent,
    'live_evaluations 无 project 错误': !evaluations.some(e => {
      const summary = e.coach_summary ? e.coach_summary.replace(/"/g, '') : '';
      return summary.includes('缺少必填字段: project');
    }),
    'live_evaluations 有有效分析结果': evaluations.some(e => {
      const status = e.eval_status ? e.eval_status.replace(/"/g, '') : '';
      return status !== 'invalid_input';
    })
  };

  let allPassed = true;
  for (const [check, passed] of Object.entries(checks)) {
    console.log(`  ${passed ? '✅' : '❌'} ${check}`);
    if (!passed) allPassed = false;
  }

  console.log('\n' + '='.repeat(60));
  if (allPassed) {
    console.log('🎉 验收结果: PASS');
    console.log('='.repeat(60));
    process.exit(0);
  } else {
    console.log('❌ 验收结果: FAIL');
    console.log('='.repeat(60));
    process.exit(1);
  }
}

// ============ 执行 ============
main().catch(err => {
  console.error('\n❌ 测试执行失败:', err);
  process.exit(1);
});
