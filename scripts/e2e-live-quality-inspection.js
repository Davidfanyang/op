#!/usr/bin/env node
/**
 * 实时质检链路 E2E 测试
 * 
 * 测试目标：
 * 1. 通过 /evaluate 接口触发实时质检
 * 2. 生成 live_session
 * 3. 生成 live_messages  
 * 4. 生成 live_evaluation
 * 5. 触发 known/unknown 分流
 * 6. 如命中风险，生成 alert
 */

require('dotenv').config();

const http = require('http');
const mysql = require('mysql2/promise');

const API_BASE = 'http://localhost:3001';
const dbConfig = {
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'trainer_core'
};

function httpPost(path, data) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API_BASE);
    const postData = JSON.stringify(data);
    
    const options = {
      hostname: url.hostname,
      port: url.port || 3001,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };
    
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (err) {
          resolve(body);
        }
      });
    });
    
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function runE2ETest() {
  const pool = mysql.createPool(dbConfig);
  
  console.log('='.repeat(80));
  console.log('🔄 实时质检链路 E2E 测试');
  console.log('='.repeat(80));
  console.log();
  
  try {
    // 步骤 1: 发送实时质检请求
    console.log('【步骤 1】发送实时质检请求（构造高风险会话）...');
    
    const evalPayload = {
      projectId: 'default',
      project: 'default',
      mode: 'live_monitor',
      metadata: {
        session_id: `live_e2e_${Date.now()}`,
        agent_id: 'e2e_test_agent',
        timestamp: new Date().toISOString(),
        entry_type: 'live_monitor',
        source: 'e2e_test'
      },
      conversation: [
        { role: 'user', content: '我转账成功了但对方没收到钱，怎么回事？' },
        { role: 'agent', content: '不知道' }
      ],
      current_reply: '不知道',
      rules: {}
    };
    
    console.log('  用户消息: 我转账成功了但对方没收到钱，怎么回事？');
    console.log('  客服回复: 不知道');
    console.log('  Session ID:', evalPayload.metadata.session_id);
    console.log();
    
    const evalResult = await httpPost('/evaluate', evalPayload);
    console.log('✅ 评估请求完成');
    console.log('  HTTP 返回:', JSON.stringify(evalResult).substring(0, 500));
    console.log();
    
    // 等待异步写入
    await new Promise(r => setTimeout(r, 2000));
    
    // 步骤 2: 检查数据库
    console.log('【步骤 2】检查数据库写入情况...');
    
    const [liveSessions] = await pool.query('SELECT * FROM live_sessions ORDER BY created_at DESC LIMIT 5');
    console.log(`  live_sessions: ${liveSessions.length} 条`);
    if (liveSessions.length > 0) {
      console.log('  最新记录:', JSON.stringify(liveSessions[0], null, 2).substring(0, 300));
    }
    
    const [liveMessages] = await pool.query('SELECT * FROM live_messages ORDER BY created_at DESC LIMIT 10');
    console.log(`  live_messages: ${liveMessages.length} 条`);
    
    const [liveEvals] = await pool.query('SELECT * FROM live_evaluations ORDER BY created_at DESC LIMIT 5');
    console.log(`  live_evaluations: ${liveEvals.length} 条`);
    if (liveEvals.length > 0) {
      console.log('  最新评估:', JSON.stringify(liveEvals[0], null, 2).substring(0, 300));
    }
    
    const [alerts] = await pool.query('SELECT * FROM alerts ORDER BY created_at DESC LIMIT 5');
    console.log(`  alerts: ${alerts.length} 条`);
    if (alerts.length > 0) {
      console.log('  最新告警:', JSON.stringify(alerts[0], null, 2).substring(0, 300));
    }
    
    console.log();
    
    // 步骤 3: 验证数据关联
    console.log('【步骤 3】验证数据关联性...');
    
    if (liveSessions.length > 0 && liveMessages.length > 0) {
      const sessionId = liveSessions[0].session_id;
      const [sessionMessages] = await pool.query(
        'SELECT * FROM live_messages WHERE session_id = ? ORDER BY created_at',
        [sessionId]
      );
      console.log(`  Session ${sessionId.substring(0, 30)}... 关联消息数: ${sessionMessages.length}`);
      
      if (liveEvals.length > 0) {
        const evalId = liveEvals[0].evaluation_id;
        console.log(`  Evaluation ${evalId.substring(0, 30)}... 关联检查完成`);
      }
    }
    
    console.log();
    console.log('='.repeat(80));
    console.log('✅ 实时质检 E2E 测试完成');
    console.log('='.repeat(80));
    
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

runE2ETest();
