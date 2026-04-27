/**
 * 知识库沉淀能力验证测试
 * 
 * 测试目标：
 * 1. approve 的 review 可以生成知识库记录
 * 2. modify_and_approve 的 review 可以生成知识库记录
 * 3. reject 的 review 不能生成知识库记录
 * 4. 知识库记录必须包含完整字段
 * 5. 同一 review 不会重复生成知识
 * 6. 知识库记录可追溯到原始 review/suggestion/evaluation/session
 */

const { ReviewServiceMySQL, REVIEW_ACTIONS, REVIEW_STATUSES } = require('../services/review-service-mysql');
const { KnowledgeService } = require('../services/knowledge-service');
const { MySQLSuggestionsRepository } = require('../infrastructure/persistence/mysql/mysql-suggestions-repository');
const { MySQLReviewsRepository } = require('../infrastructure/persistence/mysql/mysql-reviews-repository');
const { MySQLKnowledgeRepository } = require('../infrastructure/persistence/mysql/mysql-knowledge-repository');
const { getPool } = require('../infrastructure/persistence/mysql/mysql-pool');

console.log('========== 知识库沉淀能力验证测试 ==========\n');

async function runKnowledgeIngestionTests() {
  let passCount = 0;
  let totalCount = 0;

  // 初始化连接池
  const pool = getPool();
  
  try {
    await pool.connect();
    console.log('✓ MySQL 连接成功\n');
  } catch (error) {
    console.error('✗ MySQL 连接失败:', error.message);
    console.log('\n跳过知识库测试（数据库未配置）');
    process.exit(0);
  }

  const suggestionsRepo = new MySQLSuggestionsRepository(pool);
  const reviewsRepo = new MySQLReviewsRepository(pool);
  const knowledgeRepo = new MySQLKnowledgeRepository(pool);
  const reviewService = new ReviewServiceMySQL({ pool });
  const knowledgeService = new KnowledgeService({ pool });

  // ==================== 测试 1: approve 生成知识库 ====================
  console.log('\n【测试 1】approve 的 review 可以生成知识库记录');
  totalCount++;

  let testReviewId1 = null;

  try {
    // 创建测试数据
    const timestamp1 = Date.now();
    const suggestion = await suggestionsRepo.create({
      projectId: 'test_project',
      sessionId: 'test_session_kb_001',
      messageId: 'test_msg_kb_001',
      evaluationId: `test_eval_kb_001_${timestamp1}`,
      entrySource: 'live_monitor',
      agentId: 'test_agent_kb_001',
      scenario: 'transfer_not_received',
      suggestedReply: '您好，为了帮您进一步核查，请提供付款截图和绑定手机号，我们会尽快为您处理。'
    });

    // 执行 approve
    const reviewResult = await reviewService.submitReview({
      suggestionId: suggestion.id,
      reviewAction: REVIEW_ACTIONS.APPROVE,
      reviewerId: 'manager_kb_001'
    });

    if (reviewResult.success) {
      testReviewId1 = reviewResult.review.reviewId;
      console.log('✓ Review 创建成功:', testReviewId1);
      
      // 等待异步知识沉淀完成
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // 查询知识库记录
      const knowledge = await knowledgeRepo.findByReviewId(testReviewId1);
      
      if (knowledge) {
        console.log('✓ 知识库记录已生成');
        console.log('✓ knowledgeId:', knowledge.knowledgeId);
        console.log('✓ projectId:', knowledge.projectId);
        console.log('✓ scenario:', knowledge.scenario);
        console.log('✓ questionAliases:', JSON.stringify(knowledge.questionAliases));
        console.log('✓ standardAnswer:', knowledge.standardAnswer);
        console.log('✓ version:', knowledge.version);
        console.log('✓ status:', knowledge.status);
        
        // 验证字段完整性
        if (knowledge.projectId && 
            knowledge.scenario && 
            knowledge.questionAliases && 
            knowledge.standardAnswer &&
            knowledge.sourceReviewId &&
            knowledge.sourceSuggestionId &&
            knowledge.sourceEvaluationId &&
            knowledge.sourceSessionId &&
            knowledge.version &&
            knowledge.status &&
            knowledge.rules) {
          console.log('✓ 知识库字段完整');
          passCount++;
        } else {
          console.log('✗ 知识库字段不完整');
        }
      } else {
        console.log('✗ 知识库记录未生成');
      }
    } else {
      console.log('✗ Review 创建失败:', reviewResult.message);
    }
  } catch (error) {
    console.log('✗ 测试失败:', error.message);
    console.error(error);
  }

  // ==================== 测试 2: modify_and_approve 生成知识库 ====================
  console.log('\n【测试 2】modify_and_approve 的 review 可以生成知识库记录');
  totalCount++;

  let testReviewId2 = null;

  try {
    // 创建测试数据
    const timestamp2 = Date.now();
    const suggestion = await suggestionsRepo.create({
      projectId: 'test_project',
      sessionId: 'test_session_kb_002',
      messageId: 'test_msg_kb_002',
      evaluationId: `test_eval_kb_002_${timestamp2}`,
      entrySource: 'live_monitor',
      agentId: 'test_agent_kb_002',
      scenario: 'account_locked',
      suggestedReply: '您的账户已被锁定，请联系客服。'
    });

    // 执行 modify_and_approve
    const modifiedReply = '您好，您的账户因安全原因已被临时锁定。请您携带有效身份证件到就近网点办理解锁手续，或拨打客服热线 400-xxx-xxxx 进行远程验证解锁。';
    const reviewResult = await reviewService.submitReview({
      suggestionId: suggestion.id,
      reviewAction: REVIEW_ACTIONS.MODIFY_AND_APPROVE,
      finalReply: modifiedReply,
      reviewNote: '补充了解锁方式和联系方式',
      reviewerId: 'manager_kb_002'
    });

    if (reviewResult.success) {
      testReviewId2 = reviewResult.review.reviewId;
      console.log('✓ Review 创建成功:', testReviewId2);
      
      // 等待异步知识沉淀完成
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // 查询知识库记录
      const knowledge = await knowledgeRepo.findByReviewId(testReviewId2);
      
      if (knowledge) {
        console.log('✓ 知识库记录已生成');
        console.log('✓ knowledgeId:', knowledge.knowledgeId);
        console.log('✓ scenario:', knowledge.scenario);
        console.log('✓ standardAnswer:', knowledge.standardAnswer);
        
        // 验证 standard_answer 是主管修改后的内容
        if (knowledge.standardAnswer === modifiedReply) {
          console.log('✓ standard_answer 来自主管修改后的 final_reply');
          passCount++;
        } else {
          console.log('✗ standard_answer 不是主管修改后的内容');
        }
      } else {
        console.log('✗ 知识库记录未生成');
      }
    } else {
      console.log('✗ Review 创建失败:', reviewResult.message);
    }
  } catch (error) {
    console.log('✗ 测试失败:', error.message);
    console.error(error);
  }

  // ==================== 测试 3: reject 不生成知识库 ====================
  console.log('\n【测试 3】reject 的 review 不能生成知识库记录');
  totalCount++;

  let testReviewId3 = null;

  try {
    // 创建测试数据
    const timestamp3 = Date.now();
    const suggestion = await suggestionsRepo.create({
      projectId: 'test_project',
      sessionId: 'test_session_kb_003',
      messageId: 'test_msg_kb_003',
      evaluationId: `test_eval_kb_003_${timestamp3}`,
      entrySource: 'live_monitor',
      agentId: 'test_agent_kb_003',
      scenario: 'unknown',
      suggestedReply: '我不确定，请稍等。'
    });

    // 执行 reject
    const reviewResult = await reviewService.submitReview({
      suggestionId: suggestion.id,
      reviewAction: REVIEW_ACTIONS.REJECT,
      reviewNote: '答案不确定，不能直接回复客户',
      reviewerId: 'manager_kb_003'
    });

    if (reviewResult.success) {
      testReviewId3 = reviewResult.review.reviewId;
      console.log('✓ Review 创建成功:', testReviewId3);
      
      // 等待异步处理完成
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // 查询知识库记录（应该不存在）
      const knowledge = await knowledgeRepo.findByReviewId(testReviewId3);
      
      if (!knowledge) {
        console.log('✓ reject 的 review 未生成知识库记录');
        passCount++;
      } else {
        console.log('✗ reject 的 review 错误地生成了知识库记录');
      }
    } else {
      console.log('✗ Review 创建失败:', reviewResult.message);
    }
  } catch (error) {
    console.log('✗ 测试失败:', error.message);
    console.error(error);
  }

  // ==================== 测试 4: 同一 review 不重复生成 ====================
  console.log('\n【测试 4】同一 review 不会重复生成知识');
  totalCount++;

  try {
    if (testReviewId1) {
      // 再次尝试沉淀同一 review
      const result = await knowledgeService.ingestFromReview(testReviewId1);
      
      if (!result.success && result.error === 'REVIEW_ALREADY_INGESTED') {
        console.log('✓ 同一 review 被正确拦截，不会重复生成');
        console.log('✓ 错误信息:', result.message);
        passCount++;
      } else {
        console.log('✗ 同一 review 错误地重复生成了知识');
      }
    } else {
      console.log('✗ 测试依赖的 review 不存在');
    }
  } catch (error) {
    console.log('✗ 测试失败:', error.message);
    console.error(error);
  }

  // ==================== 测试 5: 知识来源追溯 ====================
  console.log('\n【测试 5】知识库记录可追溯到原始 review/suggestion/evaluation/session');
  totalCount++;

  try {
    if (testReviewId1) {
      const knowledge = await knowledgeRepo.findByReviewId(testReviewId1);
      const review = await reviewsRepo.findByReviewId(testReviewId1);
      
      if (knowledge && review) {
        // 验证来源关系
        if (knowledge.sourceReviewId === review.reviewId &&
            knowledge.sourceSuggestionId === review.suggestionId &&
            knowledge.sourceEvaluationId === review.evaluationId &&
            knowledge.sourceSessionId === review.sessionId) {
          console.log('✓ 来源关系完整且正确');
          console.log('✓ source_review_id:', knowledge.sourceReviewId);
          console.log('✓ source_suggestion_id:', knowledge.sourceSuggestionId);
          console.log('✓ source_evaluation_id:', knowledge.sourceEvaluationId);
          console.log('✓ source_session_id:', knowledge.sourceSessionId);
          passCount++;
        } else {
          console.log('✗ 来源关系不正确');
        }
      } else {
        console.log('✗ 知识或 review 不存在');
      }
    } else {
      console.log('✗ 测试依赖的 review 不存在');
    }
  } catch (error) {
    console.log('✗ 测试失败:', error.message);
    console.error(error);
  }

  // ==================== 测试 6: rules 结构验证 ====================
  console.log('\n【测试 6】知识库 rules 结构正确');
  totalCount++;

  try {
    if (testReviewId1) {
      const knowledge = await knowledgeRepo.findByReviewId(testReviewId1);
      
      if (knowledge && knowledge.rules) {
        const rules = knowledge.rules;
        
        if (Array.isArray(rules.keywords) && 
            Array.isArray(rules.required_info) && 
            Array.isArray(rules.forbidden)) {
          console.log('✓ rules 结构正确');
          console.log('✓ keywords:', JSON.stringify(rules.keywords));
          console.log('✓ required_info:', JSON.stringify(rules.required_info));
          console.log('✓ forbidden:', JSON.stringify(rules.forbidden));
          passCount++;
        } else {
          console.log('✗ rules 结构不正确');
        }
      } else {
        console.log('✗ rules 不存在');
      }
    } else {
      console.log('✗ 测试依赖的 review 不存在');
    }
  } catch (error) {
    console.log('✗ 测试失败:', error.message);
    console.error(error);
  }

  // 输出测试结果
  console.log('\n========== 测试结果 ==========\n');
  console.log(`总测试数: ${totalCount}`);
  console.log(`通过测试: ${passCount}`);
  console.log(`失败测试: ${totalCount - passCount}`);
  
  if (passCount === totalCount) {
    console.log('\n✅ 所有测试通过！知识库沉淀能力验证成功！');
  } else {
    console.log('\n❌ 部分测试失败，请检查错误信息');
  }
  
  process.exit(passCount === totalCount ? 0 : 1);
}

// 运行测试
runKnowledgeIngestionTests().catch(error => {
  console.error('测试运行异常:', error);
  process.exit(1);
});
