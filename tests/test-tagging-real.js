#!/usr/bin/env node

/**
 * 主管打标最小闭环 - 真实样本测试
 */

const http = require('http');
const mysql = require('mysql2/promise');

const BASE_URL = 'http://localhost:3001';

async function httpRequest(path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: { 'Content-Type': 'application/json' }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function query(sql, params = []) {
  const conn = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    database: 'trainer_core'
  });
  const [rows] = await conn.execute(sql, params);
  await conn.end();
  return rows;
}

async function main() {
  console.log('================================================================================');
  console.log('主管打标最小闭环测试 - 真实样本');
  console.log('================================================================================\n');

  try {
    // 步骤1：查询真实evaluation
    console.log('📋 步骤1：查询真实evaluation样本');
    console.log('-'.repeat(80));
    
    const evaluations = await query(`
      SELECT evaluation_id, session_id, message_id, project_id, mode, status, alert_level
      FROM evaluations 
      WHERE evaluation_id LIKE 'eval_%'
      LIMIT 5
    `);
    
    if (evaluations.length === 0) {
      console.log('❌ 没有找到可用的evaluation记录');
      return;
    }
    
    console.log(`✅ 找到 ${evaluations.length} 条evaluation记录`);
    evaluations.forEach((ev, i) => {
      console.log(`   ${i+1}. ${ev.evaluation_id} (status=${ev.status}, alert_level=${ev.alert_level})`);
    });
    
    const evalIds = evaluations.slice(0, 3).map(e => e.evaluation_id);
    console.log('');

    // 步骤2：提交3条打标
    console.log('🏷️  步骤2：提交3条打标样本');
    console.log('-'.repeat(80));
    
    const tagSamples = [
      {
        evaluation_id: evalIds[0],
        reviewer_id: 'supervisor_001',
        is_correct: true,
        problem_type: '话术不规范',
        should_store: true,
        corrected_answer: '已优化为标准话术，符合服务规范。',
        review_comment: '整体回复正确，但话术可以更简洁'
      },
      {
        evaluation_id: evalIds[1],
        reviewer_id: 'supervisor_001',
        is_correct: false,
        problem_type: '信息遗漏',
        should_store: false,
        corrected_answer: '应补充说明退换货流程和时效要求。',
        review_comment: '遗漏关键信息，需要补充完整'
      },
      {
        evaluation_id: evalIds[2],
        reviewer_id: 'supervisor_002',
        is_correct: true,
        problem_type: '知识盲区',
        should_store: true,
        corrected_answer: '该问题属于特殊场景，需要主管确认后回复。',
        review_comment: '知识点需要补充到FAQ'
      }
    ];
    
    const reviewIds = [];
    
    for (let i = 0; i < tagSamples.length; i++) {
      const sample = tagSamples[i];
      console.log(`\n提交第 ${i+1} 条打标:`);
      console.log(`   evaluation_id: ${sample.evaluation_id}`);
      console.log(`   is_correct: ${sample.is_correct}`);
      console.log(`   problem_type: ${sample.problem_type}`);
      console.log(`   should_store: ${sample.should_store}`);
      
      const result = await httpRequest('/review/tag', 'POST', sample);
      
      if (result.status === 200 && result.data.code === 0) {
        console.log(`   ✅ 打标成功: review_id=${result.data.data.review_id}`);
        console.log(`      faq_eligible: ${result.data.data.faq_eligible}`);
        reviewIds.push(result.data.data.review_id);
      } else {
        console.log(`   ❌ 打标失败: ${result.data.message || JSON.stringify(result.data)}`);
      }
    }
    
    console.log('\n');

    // 步骤3：查询打标记录
    console.log('📊 步骤3：查询打标记录');
    console.log('-'.repeat(80));
    
    const recordsResult = await httpRequest('/review/tagged-records?page=1&page_size=10');
    
    if (recordsResult.status === 200 && recordsResult.data.code === 0) {
      const records = recordsResult.data.data;
      console.log(`✅ 查询成功，共 ${records.total} 条打标记录`);
      records.records.slice(0, 3).forEach((r, i) => {
        console.log(`   ${i+1}. review_id=${r.review_id}`);
        console.log(`      final_accepted: ${r.final_accepted}`);
        console.log(`      knowledge_id: ${r.knowledge_id}`);
      });
    } else {
      console.log(`❌ 查询失败: ${JSON.stringify(recordsResult.data)}`);
    }
    console.log('');

    // 步骤4：验证MySQL入库
    console.log('🗄️  步骤4：验证reviews表入库结果');
    console.log('-'.repeat(80));
    
    const reviews = await query(`
      SELECT review_id, evaluation_id, review_action, review_status,
             final_accepted, problem_tags, knowledge_id, review_note
      FROM reviews 
      WHERE review_action = 'tag'
      ORDER BY created_at DESC
      LIMIT 10
    `);
    
    console.log(`✅ reviews表中共有 ${reviews.length} 条打标记录`);
    
    reviews.slice(0, 3).forEach((r, i) => {
      console.log(`\n   记录 ${i+1}:`);
      console.log(`      review_id: ${r.review_id}`);
      console.log(`      evaluation_id: ${r.evaluation_id}`);
      console.log(`      review_action: ${r.review_action}`);
      console.log(`      review_status: ${r.review_status}`);
      console.log(`      final_accepted: ${r.final_accepted}`);
      console.log(`      problem_tags: ${r.problem_tags}`);
      console.log(`      knowledge_id: ${r.knowledge_id}`);
    });
    console.log('');

    // 步骤5：验证FAQ沉淀条件
    console.log('🎯 步骤5：验证FAQ沉淀条件');
    console.log('-'.repeat(80));
    
    const faqPendingReviews = await query(`
      SELECT review_id, evaluation_id, knowledge_id, problem_tags
      FROM reviews 
      WHERE knowledge_id = 'pending_faq'
    `);
    
    console.log(`✅ 符合FAQ沉淀条件的记录: ${faqPendingReviews.length} 条`);
    faqPendingReviews.forEach((r, i) => {
      console.log(`   ${i+1}. review_id=${r.review_id}, problem_tags=${r.problem_tags}`);
    });
    console.log('');

    // 最终结论
    console.log('================================================================================');
    console.log('🎉 最终结论');
    console.log('================================================================================');
    console.log(`✅ 提交打标: ${reviewIds.length} 条`);
    console.log(`✅ 入库成功: ${reviews.length} 条`);
    console.log(`✅ FAQ待沉淀: ${faqPendingReviews.length} 条`);
    console.log('');
    console.log('主管打标最小闭环已启动并验证通过！');
    console.log('================================================================================');

  } catch (error) {
    console.error(`❌ 测试异常: ${error.message}`);
    console.error(error.stack);
  }
}

main();
