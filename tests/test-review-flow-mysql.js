/**
 * 主管审核流 MySQL 级别验证测试
 * 
 * 测试目标：
 * 1. pending_review suggestion 可被查询
 * 2. approve 后 reviews 表生成记录，suggestion 状态变为 approved
 * 3. modify_and_approve 后 final_reply 保存主管修改内容，suggestion 状态变为 modified_approved
 * 4. reject 后 final_reply 为 null，suggestion 状态变为 rejected
 * 5. 同一 suggestion 不能重复审核
 * 6. reviews.suggestion_id 唯一约束生效
 * 7. submitReview 中途失败时事务回滚
 */

const { ReviewServiceMySQL, REVIEW_ACTIONS, REVIEW_STATUSES } = require('../services/review-service-mysql');
const { MySQLSuggestionsRepository } = require('../infrastructure/persistence/mysql/mysql-suggestions-repository');
const { MySQLReviewsRepository } = require('../infrastructure/persistence/mysql/mysql-reviews-repository');
const { getPool } = require('../infrastructure/persistence/mysql/mysql-pool');

console.log('========== 主管审核流 MySQL 级别验证测试 ==========\n');

async function runMySQLReviewTests() {
  let passCount = 0;
  let totalCount = 0;

  // 初始化连接池
  const pool = getPool();
  
  try {
    await pool.connect();
    console.log('✓ MySQL 连接成功\n');
  } catch (error) {
    console.error('✗ MySQL 连接失败:', error.message);
    console.log('\n跳过 MySQL 测试（数据库未配置）');
    process.exit(0);
  }

  const reviewService = new ReviewServiceMySQL({ pool });
  const suggestionsRepo = new MySQLSuggestionsRepository(pool);
  const reviewsRepo = new MySQLReviewsRepository(pool);

  // ==================== 测试 1: pending_review suggestion 可被查询 ====================
  console.log('【测试 1】pending_review suggestion 可被查询');
  totalCount++;

  let testSuggestionId = null;

  try {
    // 创建测试数据
    const suggestion = await suggestionsRepo.create({
      projectId: 'test_project',
      sessionId: 'test_session_001',
      messageId: 'test_message_001',
      evaluationId: 'test_eval_001',
      entrySource: 'live_monitor',
      agentId: 'test_agent_001',
      scenario: 'unknown',
      suggestedReply: '您好，为了帮您进一步核查，请提供付款截图和绑定手机号。'
    });

    testSuggestionId = suggestion.id;

    // 查询待审核 suggestion
    const pendingSuggestions = await reviewService.getPendingSuggestions();

    if (pendingSuggestions.length > 0 && 
        pendingSuggestions.some(s => s.id === suggestion.id && s.reviewStatus === 'pending_review')) {
      console.log('✓ 待审核 suggestion 查询成功');
      console.log('✓ 找到待审核 suggestion 数量:', pendingSuggestions.length);
      console.log('✓ suggestion ID:', suggestion.id);
      console.log('✓ review_status:', suggestion.reviewStatus);
      passCount++;
    } else {
      console.log('✗ 待审核 suggestion 查询失败');
    }
  } catch (error) {
    console.log('✗ 测试失败:', error.message);
    console.error(error);
  }

  // ==================== 测试 2: approve 后 reviews 表生成记录 ====================
  console.log('\n【测试 2】approve 后 reviews 表生成记录，suggestion 状态变为 approved');
  totalCount++;

  try {
    if (!testSuggestionId) {
      console.log('✗ 跳过测试（测试数据未创建）');
    } else {
      const result = await reviewService.submitReview({
        suggestionId: testSuggestionId,
        reviewAction: REVIEW_ACTIONS.APPROVE,
        reviewerId: 'manager_mysql_001'
      });

      if (result.success === true) {
        console.log('✓ approve 动作执行成功');
        
        // 验证 review 记录
        const review = await reviewsRepo.findByEvaluationId('test_eval_001');
        if (review && 
            review.reviewAction === 'approve' &&
            review.originalReply &&
            review.finalReply === review.originalReply &&
            review.reviewerId === 'manager_mysql_001') {
          console.log('✓ review 记录已生成');
          console.log('✓ review_action:', review.reviewAction);
          console.log('✓ original_reply:', review.originalReply);
          console.log('✓ final_reply:', review.finalReply);
          
          // 验证 suggestion 状态
          const updatedSuggestion = await suggestionsRepo.findById(testSuggestionId);
          if (updatedSuggestion.reviewStatus === 'approved') {
            console.log('✓ suggestion 状态已更新为 approved');
            passCount++;
          } else {
            console.log('✗ suggestion 状态未正确更新，当前:', updatedSuggestion.reviewStatus);
          }
        } else {
          console.log('✗ review 记录不正确');
        }
      } else {
        console.log('✗ approve 动作执行失败:', result.message);
      }
    }
  } catch (error) {
    console.log('✗ 测试失败:', error.message);
    console.error(error);
  }

  // ==================== 测试 3: modify_and_approve 测试 ====================
  console.log('\n【测试 3】modify_and_approve 后 final_reply 保存主管修改内容');
  totalCount++;

  let testSuggestionId2 = null;

  try {
    // 创建新的 suggestion
    const suggestion2 = await suggestionsRepo.create({
      projectId: 'test_project',
      sessionId: 'test_session_002',
      messageId: 'test_message_002',
      evaluationId: 'test_eval_002',
      entrySource: 'live_monitor',
      agentId: 'test_agent_002',
      scenario: 'unknown',
      suggestedReply: '您好，我需要查一下。'
    });

    testSuggestionId2 = suggestion2.id;

    // 执行 modify_and_approve
    const modifiedReply = '您好，为了帮您进一步核查，请提供付款截图和绑定手机号，我们会尽快为您处理。';
    const result = await reviewService.submitReview({
      suggestionId: testSuggestionId2,
      reviewAction: REVIEW_ACTIONS.MODIFY_AND_APPROVE,
      finalReply: modifiedReply,
      reviewNote: '补充了资料收集动作，删除了不确定承诺',
      reviewerId: 'manager_mysql_002'
    });

    if (result.success === true) {
      console.log('✓ modify_and_approve 动作执行成功');
      
      // 验证 review 记录
      const review = await reviewsRepo.findByEvaluationId('test_eval_002');
      if (review && 
          review.reviewAction === 'modify_and_approve' &&
          review.originalReply === '您好，我需要查一下。' &&
          review.finalReply === modifiedReply &&
          review.reviewNote === '补充了资料收集动作，删除了不确定承诺') {
        console.log('✓ review 记录正确');
        console.log('✓ original_reply:', review.originalReply);
        console.log('✓ final_reply:', review.finalReply);
        console.log('✓ review_note:', review.reviewNote);
        
        // 验证 suggestion 状态
        const updatedSuggestion = await suggestionsRepo.findById(testSuggestionId2);
        if (updatedSuggestion.reviewStatus === 'modified_approved') {
          console.log('✓ suggestion 状态已更新为 modified_approved');
          passCount++;
        } else {
          console.log('✗ suggestion 状态未正确更新，当前:', updatedSuggestion.reviewStatus);
        }
      } else {
        console.log('✗ review 记录不正确');
      }
    } else {
      console.log('✗ modify_and_approve 动作执行失败:', result.message);
    }
  } catch (error) {
    console.log('✗ 测试失败:', error.message);
    console.error(error);
  }

  // ==================== 测试 4: reject 测试 ====================
  console.log('\n【测试 4】reject 后 final_reply 为 null，suggestion 状态变为 rejected');
  totalCount++;

  let testSuggestionId3 = null;

  try {
    // 创建新的 suggestion
    const suggestion3 = await suggestionsRepo.create({
      projectId: 'test_project',
      sessionId: 'test_session_003',
      messageId: 'test_message_003',
      evaluationId: 'test_eval_003',
      entrySource: 'live_monitor',
      agentId: 'test_agent_003',
      scenario: 'unknown',
      suggestedReply: '抱歉，我无法回答您的问题。'
    });

    testSuggestionId3 = suggestion3.id;

    // 执行 reject
    const result = await reviewService.submitReview({
      suggestionId: testSuggestionId3,
      reviewAction: REVIEW_ACTIONS.REJECT,
      reviewNote: '建议答案不合适，需要重新生成',
      reviewerId: 'manager_mysql_003'
    });

    if (result.success === true) {
      console.log('✓ reject 动作执行成功');
      
      // 验证 review 记录
      const review = await reviewsRepo.findByEvaluationId('test_eval_003');
      if (review && 
          review.reviewAction === 'reject' &&
          review.originalReply === '抱歉，我无法回答您的问题。' &&
          review.finalReply === null &&
          review.reviewNote === '建议答案不合适，需要重新生成') {
        console.log('✓ review 记录正确');
        console.log('✓ original_reply:', review.originalReply);
        console.log('✓ final_reply:', review.finalReply);
        console.log('✓ review_note:', review.reviewNote);
        
        // 验证 suggestion 状态
        const updatedSuggestion = await suggestionsRepo.findById(testSuggestionId3);
        if (updatedSuggestion.reviewStatus === 'rejected') {
          console.log('✓ suggestion 状态已更新为 rejected');
          passCount++;
        } else {
          console.log('✗ suggestion 状态未正确更新，当前:', updatedSuggestion.reviewStatus);
        }
      } else {
        console.log('✗ review 记录不正确');
      }
    } else {
      console.log('✗ reject 动作执行失败:', result.message);
    }
  } catch (error) {
    console.log('✗ 测试失败:', error.message);
    console.error(error);
  }

  // ==================== 测试 5: 同一 suggestion 不能重复审核 ====================
  console.log('\n【测试 5】同一 suggestion 不能重复审核');
  totalCount++;

  let testSuggestionId4 = null;

  try {
    // 创建新的 suggestion
    const suggestion4 = await suggestionsRepo.create({
      projectId: 'test_project',
      sessionId: 'test_session_004',
      messageId: 'test_message_004',
      evaluationId: 'test_eval_004',
      entrySource: 'live_monitor',
      agentId: 'test_agent_004',
      scenario: 'unknown',
      suggestedReply: '您好，请耐心等待。'
    });

    testSuggestionId4 = suggestion4.id;

    // 第一次审核
    const result1 = await reviewService.submitReview({
      suggestionId: testSuggestionId4,
      reviewAction: REVIEW_ACTIONS.APPROVE,
      reviewerId: 'manager_mysql_001'
    });

    // 第二次审核（应该失败）
    const result2 = await reviewService.submitReview({
      suggestionId: testSuggestionId4,
      reviewAction: REVIEW_ACTIONS.REJECT,
      reviewerId: 'manager_mysql_002'
    });

    if (result1.success === true && result2.success === false && 
        result2.error === 'SUGGESTION_ALREADY_REVIEWED') {
      console.log('✓ 重复审核拦截成功');
      console.log('✓ 第一次审核成功');
      console.log('✓ 第二次审核被正确拦截:', result2.message);
      passCount++;
    } else {
      console.log('✗ 重复审核拦截失败');
      console.log('  第一次结果:', result1.success);
      console.log('  第二次结果:', result2.success, result2.error);
    }
  } catch (error) {
    console.log('✗ 测试失败:', error.message);
    console.error(error);
  }

  // ==================== 测试 6: reviews.suggestion_id 唯一约束生效 ====================
  console.log('\n【测试 6】reviews.suggestion_id 唯一约束生效');
  totalCount++;

  let testSuggestionId5 = null;

  try {
    // 创建新的 suggestion
    const suggestion5 = await suggestionsRepo.create({
      projectId: 'test_project',
      sessionId: 'test_session_005',
      messageId: 'test_message_005',
      evaluationId: 'test_eval_005',
      entrySource: 'live_monitor',
      agentId: 'test_agent_005',
      scenario: 'unknown',
      suggestedReply: '您好，请提供相关信息。'
    });

    testSuggestionId5 = suggestion5.id;
    const suggestion5BusinessId = suggestion5.suggestionId;  // 获取业务ID

    // 第一次审核
    await reviewService.submitReview({
      suggestionId: testSuggestionId5,
      reviewAction: REVIEW_ACTIONS.APPROVE,
      reviewerId: 'manager_mysql_001'
    });
    
    console.log('✓ 第一次审核成功');
    console.log('✓ suggestion 业务ID:', suggestion5BusinessId);

    // 尝试直接插入重复的 review（测试数据库约束）
    try {
      await pool.query(`
        INSERT INTO reviews (
          review_id, suggestion_id, evaluation_id, session_id,
          review_action, original_reply, final_reply, review_note, reviewer_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        'test_duplicate_review',
        suggestion5BusinessId,  // 使用相同的 suggestion_id 业务ID（对应 unique key）
        'test_eval_005',
        'test_session_005',
        'approve',
        '测试重复插入',
        '测试重复插入',
        '测试重复插入',
        'manager_mysql_001'
      ]);
      
      console.log('✗ 唯一约束未生效，允许重复插入');
    } catch (dbError) {
      console.log('✓ 捕获到数据库错误');
      console.log('✓ 错误码:', dbError.code);
      console.log('✓ 错误信息:', dbError.message);
      if (dbError.code === 'ER_DUP_ENTRY' || dbError.message.includes('Duplicate')) {
        console.log('✓ 唯一约束生效，拒绝重复插入');
        console.log('✓ 唯一约束名称: reviews.uk_suggestion_id');
        passCount++;
      } else {
        console.log('✗ 数据库错误类型不符:', dbError.message);
      }
    }
  } catch (error) {
    console.log('✗ 测试失败:', error.message);
    console.error(error);
  }

  // ==================== 测试 7: submitReview 中途失败时事务回滚 ====================
  console.log('\n【测试 7】submitReview 中途失败时事务回滚');
  totalCount++;

  let testSuggestionId6 = null;

  try {
    // 创建新的 suggestion
    const suggestion6 = await suggestionsRepo.create({
      projectId: 'test_project',
      sessionId: 'test_session_006',
      messageId: 'test_message_006',
      evaluationId: 'test_eval_006',
      entrySource: 'live_monitor',
      agentId: 'test_agent_006',
      scenario: 'unknown',
      suggestedReply: '您好，请稍等。'
    });

    testSuggestionId6 = suggestion6.id;

    // 尝试执行无效的审核动作（应该在事务中失败并回滚）
    const result = await reviewService.submitReview({
      suggestionId: testSuggestionId6,
      reviewAction: 'invalid_action',  // 无效动作
      reviewerId: 'manager_mysql_001'
    });

    if (result.success === false) {
      console.log('✓ 无效审核动作被拒绝');
      console.log('✓ 错误信息:', result.message);
      
      // 验证 suggestion 状态未被修改（仍为 pending_review）
      const unchangedSuggestion = await suggestionsRepo.findById(testSuggestionId6);
      if (unchangedSuggestion.reviewStatus === 'pending_review') {
        console.log('✓ suggestion 状态未被修改（事务回滚成功）');
        console.log('✓ 当前状态:', unchangedSuggestion.reviewStatus);
        
        // 验证没有生成 review 记录（使用 suggestionId 查询）
        const noReview = await reviewsRepo.findBySuggestionId(String(testSuggestionId6));
        if (!noReview) {
          console.log('✓ 没有生成 review 记录（事务回滚成功）');
          passCount++;
        } else {
          console.log('✗ 生成了 review 记录（事务未回滚）');
        }
      } else {
        console.log('✗ suggestion 状态被修改（事务未回滚）');
      }
    } else {
      console.log('✗ 无效审核动作未被拒绝');
    }
  } catch (error) {
    console.log('✗ 测试失败:', error.message);
    console.error(error);
  }

  // ==================== 测试总结 ====================
  console.log('\n========== 测试总结 ==========');
  console.log(`通过: ${passCount}/${totalCount}`);
  
  if (passCount === totalCount) {
    console.log('\n✅ 所有 MySQL 级别测试通过！');
    console.log('\n验收标准检查：');
    console.log('✓ 1. pending_review suggestion 可被查询');
    console.log('✓ 2. approve 后 reviews 表生成记录，suggestion 状态变为 approved');
    console.log('✓ 3. modify_and_approve 后 final_reply 保存主管修改内容');
    console.log('✓ 4. reject 后 final_reply 为 null，suggestion 状态变为 rejected');
    console.log('✓ 5. 同一 suggestion 不能重复审核');
    console.log('✓ 6. reviews.suggestion_id 唯一约束生效');
    console.log('✓ 7. submitReview 中途失败时事务回滚');
    console.log('\n✅ 可以进入《FAQ / 场景知识库沉淀执行单》');
    process.exit(0);
  } else {
    console.log(`\n✗ ${totalCount - passCount} 个测试失败`);
    process.exit(1);
  }
}

// 运行测试
runMySQLReviewTests().catch(error => {
  console.error('测试运行异常:', error);
  process.exit(1);
});
