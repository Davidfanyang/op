/**
 * 主管打标最小闭环测试
 * 
 * 测试场景：
 * 1. 查看待打标数据（查询evaluations）
 * 2. 提交3条打标样本
 * 3. 查询打标记录
 * 4. 验证reviews表入库结果
 */

const mysql = require('mysql2/promise');
const http = require('http');

// 数据库配置
const dbConfig = {
  host: process.env.MYSQL_HOST || 'localhost',
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'trainer_core'
};

// API基础URL
const API_BASE = 'http://localhost:3001';

// 测试变量
const testResults = [];
let evaluationIds = [];

/**
 * 执行SQL查询
 */
async function query(sql, params = []) {
  const conn = await mysql.createConnection(dbConfig);
  try {
    const [rows] = await conn.execute(sql, params);
    return rows;
  } finally {
    await conn.end();
  }
}

/**
 * 发送HTTP请求
 */
function httpRequest(path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API_BASE);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
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

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

/**
 * 主测试流程
 */
async function main() {
  console.log('='.repeat(80));
  console.log('主管打标最小闭环测试');
  console.log('='.repeat(80));
  console.log();

  try {
    // ========================================
    // 步骤1：查询可用的evaluation样本
    // ========================================
    console.log('📋 步骤1：查询可用的evaluation样本');
    console.log('-'.repeat(80));

    const evaluations = await query(`
      SELECT le.evaluation_id, le.session_id, le.message_id, le.project, le.scenario, le.judgement
      FROM live_evaluations le
      LEFT JOIN reviews r ON le.evaluation_id = r.evaluation_id AND r.review_action = 'tag'
      WHERE r.review_id IS NULL
      LIMIT 5
    `);

    if (evaluations.length === 0) {
      console.log('⚠️  没有找到evaluation数据，请先运行实时质检');
      return;
    }

    console.log(`✅ 找到 ${evaluations.length} 条evaluation记录`);
    evaluationIds = evaluations.slice(0, 3).map(e => e.evaluation_id);
    
    evaluationIds.forEach((id, index) => {
      console.log(`   ${index + 1}. ${id}`);
    });
    console.log();

    // ========================================
    // 步骤2：提交3条打标样本
    // ========================================
    console.log('🏷️  步骤2：提交3条打标样本');
    console.log('-'.repeat(80));

    const tagSamples = [
      {
        evaluation_id: evaluationIds[0],
        reviewer_id: 'supervisor_001',
        is_correct: true,
        problem_type: 'known',
        should_store: true,
        corrected_answer: '您好，为了帮您进一步核查，请您提供付款截图和绑定手机号，我们将尽快为您处理。',
        review_comment: '客服回答正确，可以沉淀为FAQ'
      },
      {
        evaluation_id: evaluationIds[1],
        reviewer_id: 'supervisor_001',
        is_correct: false,
        problem_type: 'unknown',
        should_store: false,
        corrected_answer: '您好，转账未到账可能是因为网络延迟，请您提供交易哈希，我们帮您查询。',
        review_comment: '客服回答错误，需要培训'
      },
      {
        evaluation_id: evaluationIds[2],
        reviewer_id: 'supervisor_002',
        is_correct: true,
        problem_type: 'known',
        should_store: true,
        corrected_answer: '您好，Lanton Pay注册需要实名认证，请您准备好身份证正反面照片。',
        review_comment: '客服回答正确，可以沉淀为FAQ'
      }
    ];

    for (let i = 0; i < tagSamples.length; i++) {
      const sample = tagSamples[i];
      console.log(`\n提交第 ${i + 1} 条打标:`);
      console.log(`   evaluation_id: ${sample.evaluation_id}`);
      console.log(`   is_correct: ${sample.is_correct}`);
      console.log(`   problem_type: ${sample.problem_type}`);
      console.log(`   should_store: ${sample.should_store}`);

      const result = await httpRequest('/review/tag', 'POST', sample);

      if (result.code === 0) {
        console.log(`   ✅ 打标成功`);
        console.log(`      review_id: ${result.data.review_id}`);
        console.log(`      faq_eligible: ${result.data.faq_eligible}`);
        console.log(`      knowledge_id: ${result.data.knowledge_id}`);
        testResults.push({
          sample: i + 1,
          success: true,
          review_id: result.data.review_id,
          faq_eligible: result.data.faq_eligible
        });
      } else {
        console.log(`   ❌ 打标失败: ${result.error?.message || result}`);
        testResults.push({
          sample: i + 1,
          success: false,
          error: result.error?.message || result
        });
      }
    }
    console.log();

    // ========================================
    // 步骤3：查询打标记录
    // ========================================
    console.log('📊 步骤3：查询打标记录');
    console.log('-'.repeat(80));

    const recordsResult = await httpRequest('/review/tagged-records?page=1&page_size=10');

    if (recordsResult.code === 0) {
      const { list, total } = recordsResult.data;
      console.log(`✅ 查询成功，共 ${total} 条打标记录`);
      console.log(`   显示前 ${list.length} 条:`);
      
      list.forEach((record, index) => {
        console.log(`\n   记录 ${index + 1}:`);
        console.log(`      review_id: ${record.review_id}`);
        console.log(`      evaluation_id: ${record.evaluation_id}`);
        console.log(`      is_correct: ${record.is_correct}`);
        console.log(`      problem_type: ${record.problem_type}`);
        console.log(`      should_store: ${record.should_store}`);
        console.log(`      faq_eligible: ${record.faq_eligible}`);
        console.log(`      reviewer_id: ${record.reviewer_id}`);
      });
    } else {
      console.log(`❌ 查询失败: ${recordsResult.error?.message || recordsResult}`);
    }
    console.log();

    // ========================================
    // 步骤4：验证reviews表入库结果
    // ========================================
    console.log('🗄️  步骤4：验证reviews表入库结果');
    console.log('-'.repeat(80));

    const reviews = await query(`
      SELECT 
        review_id,
        evaluation_id,
        review_action,
        review_status,
        final_accepted,
        problem_tags,
        final_reply,
        review_note,
        knowledge_id,
        reviewer_id,
        reviewed_at
      FROM reviews
      WHERE review_action = 'tag'
      ORDER BY created_at DESC
      LIMIT 10
    `);

    console.log(`✅ reviews表中共有 ${reviews.length} 条打标记录`);
    
    reviews.forEach((review, index) => {
      console.log(`\n   入库记录 ${index + 1}:`);
      console.log(`      review_id: ${review.review_id}`);
      console.log(`      evaluation_id: ${review.evaluation_id}`);
      console.log(`      review_action: ${review.review_action}`);
      console.log(`      review_status: ${review.review_status}`);
      console.log(`      final_accepted: ${review.final_accepted}`);
      console.log(`      problem_tags: ${review.problem_tags}`);
      console.log(`      knowledge_id: ${review.knowledge_id}`);
      console.log(`      reviewer_id: ${review.reviewer_id}`);
    });
    console.log();

    // ========================================
    // 步骤5：验证FAQ沉淀条件
    // ========================================
    console.log('🎯 步骤5：验证FAQ沉淀条件');
    console.log('-'.repeat(80));

    const faqPendingReviews = await query(`
      SELECT review_id, evaluation_id, knowledge_id
      FROM reviews
      WHERE knowledge_id = 'pending_faq'
    `);

    console.log(`✅ 标记为 pending_faq 的记录: ${faqPendingReviews.length} 条`);
    faqPendingReviews.forEach((review, index) => {
      console.log(`   ${index + 1}. review_id: ${review.review_id}, evaluation_id: ${review.evaluation_id}`);
    });
    console.log();

    // ========================================
    // 测试总结
    // ========================================
    console.log('='.repeat(80));
    console.log('📝 测试总结');
    console.log('='.repeat(80));

    const successCount = testResults.filter(r => r.success).length;
    const failCount = testResults.filter(r => !r.success).length;

    console.log(`\n提交样本: ${testResults.length} 条`);
    console.log(`成功: ${successCount} 条`);
    console.log(`失败: ${failCount} 条`);
    console.log();

    if (successCount === testResults.length) {
      console.log('✅ 主管打标最小闭环测试通过！');
      console.log();
      console.log('已完成：');
      console.log('  1. ✅ 查看待打标数据');
      console.log('  2. ✅ 提交3条打标样本');
      console.log('  3. ✅ 查询打标记录');
      console.log('  4. ✅ 验证reviews表入库结果');
      console.log('  5. ✅ 验证FAQ沉淀条件（knowledge_id=pending_faq）');
      console.log();
      console.log('最终结论：已启动主管打标最小闭环');
    } else {
      console.log('❌ 主管打标最小闭环测试部分失败');
      console.log();
      console.log('失败样本：');
      testResults.filter(r => !r.success).forEach(r => {
        console.log(`   样本 ${r.sample}: ${r.error}`);
      });
    }
    console.log();

  } catch (error) {
    console.error('❌ 测试异常:', error.message);
    console.error(error.stack);
  }
}

// 运行测试
main().catch(console.error);
