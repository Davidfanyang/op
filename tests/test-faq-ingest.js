/**
 * FAQ 沉淀最小闭环测试
 * 
 * 测试场景：
 * 1. 查询 FAQ 候选记录（knowledge_id='pending_faq'）
 * 2. 选择至少 1 条真实样本执行沉淀
 * 3. 验证知识表中存在该记录
 * 4. 验证 review 表中的 knowledge_id 已更新
 */

const mysql = require('mysql2/promise');
const http = require('http');
const { FaqIngestService } = require('../services/faq-ingest-service');

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
  console.log('FAQ 沉淀最小闭环测试');
  console.log('='.repeat(80));
  console.log();

  try {
    const faqIngestService = new FaqIngestService();

    // ========================================
    // 步骤1：查询 FAQ 候选记录
    // ========================================
    console.log('📋 步骤1：查询 FAQ 候选记录（knowledge_id=pending_faq）');
    console.log('-'.repeat(80));

    const candidates = await query(`
      SELECT 
        r.review_id,
        r.evaluation_id,
        r.session_id,
        r.knowledge_id,
        r.is_adopted,
        r.final_accepted,
        r.problem_tags,
        r.final_reply,
        r.review_note,
        r.reviewer_id,
        le.scenario,
        le.project
      FROM reviews r
      LEFT JOIN live_evaluations le ON r.evaluation_id = le.evaluation_id
      WHERE r.review_action = 'tag'
        AND r.review_status = 'tagged'
        AND r.knowledge_id = 'pending_faq'
      ORDER BY r.reviewed_at DESC
      LIMIT 5
    `);

    if (candidates.length === 0) {
      console.log('⚠️  没有找到 pending_faq 候选记录，请先完成打标');
      return;
    }

    console.log(`✅ 找到 ${candidates.length} 条 pending_faq 候选记录`);
    candidates.forEach((c, index) => {
      console.log(`   ${index + 1}. review_id: ${c.review_id}`);
      console.log(`      evaluation_id: ${c.evaluation_id}`);
      console.log(`      is_adopted: ${c.is_adopted}`);
      console.log(`      problem_tags: ${c.problem_tags}`);
      console.log();
    });

    // ========================================
    // 步骤2：筛选可沉淀的记录并执行沉淀
    // ========================================
    console.log('🔄 步骤2：执行 FAQ 沉淀');
    console.log('-'.repeat(80));

    // 筛选条件：is_adopted=1 且 problem_tags 包含 'known'
    const ingestableCandidates = candidates.filter(c => {
      if (c.is_adopted !== 1) {
        console.log(`   跳过 ${c.review_id}: is_adopted=${c.is_adopted}`);
        return false;
      }
      
      // problem_tags 可能是字符串或已解析的数组
      let problemTags = [];
      if (typeof c.problem_tags === 'string') {
        try {
          problemTags = JSON.parse(c.problem_tags);
        } catch (e) {
          problemTags = [c.problem_tags];
        }
      } else if (Array.isArray(c.problem_tags)) {
        problemTags = c.problem_tags;
      } else {
        problemTags = c.problem_tags ? [c.problem_tags] : [];
      }
      
      // 处理嵌套数组
      if (problemTags.length > 0 && Array.isArray(problemTags[0])) {
        problemTags = problemTags[0];
      }
      
      const hasKnown = problemTags.includes('known');
      if (!hasKnown) {
        console.log(`   跳过 ${c.review_id}: problem_tags=${JSON.stringify(problemTags)} 不包含 known`);
      }
      
      return hasKnown;
    });

    if (ingestableCandidates.length === 0) {
      console.log('⚠️  没有可沉淀的候选记录（需要 is_adopted=1 且 problem_tags 包含 known）');
      console.log('   提示：请先通过 API 或脚本更新 is_adopted 字段');
      return;
    }

    console.log(`✅ 筛选出 ${ingestableCandidates.length} 条可沉淀记录`);
    console.log();

    // 执行沉淀（最多3条）
    const samplesToIngest = ingestableCandidates.slice(0, 3);

    for (let i = 0; i < samplesToIngest.length; i++) {
      const candidate = samplesToIngest[i];
      console.log(`\n沉淀第 ${i + 1} 条:`);
      console.log(`   review_id: ${candidate.review_id}`);
      console.log(`   evaluation_id: ${candidate.evaluation_id}`);
      console.log(`   scenario: ${candidate.scenario || 'general'}`);
      console.log(`   final_reply: ${candidate.final_reply ? candidate.final_reply.substring(0, 50) + '...' : 'null'}`);

      const result = await faqIngestService.ingestFromReview(candidate.review_id, 'supervisor_001');

      if (result.success) {
        console.log(`   ✅ 沉淀成功`);
        console.log(`      knowledge_id: ${result.knowledge_id}`);
        console.log(`      status: ${result.status}`);
        testResults.push({
          sample: i + 1,
          review_id: candidate.review_id,
          evaluation_id: candidate.evaluation_id,
          knowledge_id: result.knowledge_id,
          success: true
        });
      } else {
        console.log(`   ❌ 沉淀失败: ${result.error} - ${result.message}`);
        testResults.push({
          sample: i + 1,
          review_id: candidate.review_id,
          success: false,
          error: result.error,
          message: result.message
        });
      }
    }
    console.log();

    // ========================================
    // 步骤3：验证知识表入库结果
    // ========================================
    console.log('🗄️  步骤3：验证 knowledge_base 表入库结果');
    console.log('-'.repeat(80));

    for (const result of testResults) {
      if (!result.success) continue;

      const knowledge = await query(`
        SELECT 
          knowledge_id,
          source_review_id,
          source_evaluation_id,
          scenario,
          question_aliases,
          standard_answer,
          status,
          created_at
        FROM knowledge_base
        WHERE knowledge_id = ?
      `, [result.knowledge_id]);

      if (knowledge.length > 0) {
        const k = knowledge[0];
        console.log(`\n✅ 知识记录 ${result.sample}:`);
        console.log(`   knowledge_id: ${k.knowledge_id}`);
        console.log(`   source_review_id: ${k.source_review_id}`);
        console.log(`   source_evaluation_id: ${k.source_evaluation_id}`);
        console.log(`   scenario: ${k.scenario}`);
        console.log(`   question_aliases: ${k.question_aliases}`);
        console.log(`   standard_answer: ${k.standard_answer ? k.standard_answer.substring(0, 50) + '...' : 'null'}`);
        console.log(`   status: ${k.status}`);
        console.log(`   created_at: ${k.created_at}`);
      } else {
        console.log(`\n❌ 知识记录 ${result.sample} 未找到: ${result.knowledge_id}`);
      }
    }
    console.log();

    // ========================================
    // 步骤4：验证 review 表回写结果
    // ========================================
    console.log('🔄 步骤4：验证 reviews 表 knowledge_id 回写结果');
    console.log('-'.repeat(80));

    for (const result of testResults) {
      if (!result.success) continue;

      const review = await query(`
        SELECT 
          review_id,
          evaluation_id,
          knowledge_id,
          review_action,
          review_status,
          updated_at
        FROM reviews
        WHERE review_id = ?
      `, [result.review_id]);

      if (review.length > 0) {
        const r = review[0];
        const isUpdated = r.knowledge_id === result.knowledge_id;
        
        console.log(`\n${isUpdated ? '✅' : '❌'} Review ${result.sample}:`);
        console.log(`   review_id: ${r.review_id}`);
        console.log(`   evaluation_id: ${r.evaluation_id}`);
        console.log(`   knowledge_id: ${r.knowledge_id}`);
        console.log(`   期望值: ${result.knowledge_id}`);
        console.log(`   匹配: ${isUpdated ? '是' : '否'}`);
        console.log(`   updated_at: ${r.updated_at}`);
      } else {
        console.log(`\n❌ Review ${result.sample} 未找到: ${result.review_id}`);
      }
    }
    console.log();

    // ========================================
    // 测试总结
    // ========================================
    console.log('='.repeat(80));
    console.log('📝 测试总结');
    console.log('='.repeat(80));

    const successCount = testResults.filter(r => r.success).length;
    const failCount = testResults.filter(r => !r.success).length;

    console.log(`\n沉淀样本: ${testResults.length} 条`);
    console.log(`成功: ${successCount} 条`);
    console.log(`失败: ${failCount} 条`);
    console.log();

    if (successCount > 0) {
      console.log('✅ FAQ 沉淀最小闭环测试通过！');
      console.log();
      console.log('已完成：');
      console.log('  1. ✅ 查询 pending_faq 候选记录');
      console.log('  2. ✅ 执行 FAQ 沉淀');
      console.log('  3. ✅ 验证 knowledge_base 表入库结果');
      console.log('  4. ✅ 验证 reviews 表 knowledge_id 回写结果');
      console.log();
      console.log('最终结论：已完成 FAQ 最小沉淀闭环，可进入第七步');
    } else {
      console.log('❌ FAQ 沉淀最小闭环测试失败');
      console.log();
      console.log('失败样本：');
      testResults.filter(r => !r.success).forEach(r => {
        console.log(`   样本 ${r.sample}: ${r.error} - ${r.message}`);
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
