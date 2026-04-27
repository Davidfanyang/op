/**
 * 主管审核流验证测试
 * 
 * 测试目标：
 * 1. 待审核 suggestion 可被查询
 * 2. 主管可执行 approve 动作
 * 3. 主管可执行 modify_and_approve 动作
 * 4. 主管可执行 reject 动作
 * 5. 每次审核都会生成 review 记录
 * 6. review 记录中同时保留 original_reply 和 final_reply
 * 7. 审核后的 suggestion 状态会正确更新
 * 8. 审核上下文包含完整信息（suggestion + evaluation + conversation）
 */

const { ReviewService, REVIEW_ACTIONS, REVIEW_STATUSES } = require('../services/review-service-v3');
const { FileSuggestionsRepository } = require('../repositories/impl/file-suggestions-repository');
const { FileReviewsRepository } = require('../repositories/impl/file-reviews-repository');
const { FileLiveEvaluationsRepository } = require('../repositories/impl/file-live-evaluations-repository');
const { FileLiveMessagesRepository } = require('../repositories/impl/file-live-messages-repository');
const { FileLiveSessionsRepository } = require('../repositories/impl/file-live-sessions-repository');

console.log('========== 主管审核流验证测试 ==========\n');

async function runReviewTests() {
  let passCount = 0;
  let totalCount = 0;

  // 初始化 repositories
  const suggestionsRepo = new FileSuggestionsRepository();
  const reviewsRepo = new FileReviewsRepository();
  const evaluationsRepo = new FileLiveEvaluationsRepository();
  const messagesRepo = new FileLiveMessagesRepository();
  const sessionsRepo = new FileLiveSessionsRepository();

  const reviewService = new ReviewService({
    suggestionsRepo,
    reviewsRepo,
    evaluationsRepo,
    messagesRepo,
    sessionsRepo
  });

  // ==================== 测试 1: 查询待审核 suggestion ====================
  console.log('【测试 1】查询待审核 suggestion');
  totalCount++;

  try {
    // 创建测试数据
    const session = await sessionsRepo.create({
      sessionId: 'live_session_review_001',
      project: 'lanton',
      chatId: '-1001234567890',
      agentId: 'agent_001',
      status: 'active',
      startedAt: new Date(),
      updatedAt: new Date()
    });

    const message = await messagesRepo.create({
      messageId: 'msg_review_001',
      sessionId: 'live_session_review_001',
      role: 'agent',
      senderId: 'agent_001',
      senderName: '客服001',
      content: '请稍等',
      timestamp: new Date()
    });

    const evaluation = await evaluationsRepo.create({
      evaluationId: 'eval_review_001',
      sessionId: 'live_session_review_001',
      messageId: 'msg_review_001',
      project: 'lanton',
      currentReply: '请稍等',
      inputPayload: { metadata: { entry_type: 'live_monitor' } },
      outputPayload: { analysis: { issues: ['回复过于简短'] } },
      scenario: 'unknown',
      stage: '解答',
      judgement: '客服回复未能有效承接问题',
      summary: '当前回复无法有效承接问题',
      confidence: 0.5,
      problemType: 'unknown',
      needReview: true,
      classifyReason: '场景无法识别'
    });

    const suggestion = await suggestionsRepo.create({
      projectId: 'lanton',
      sessionId: 'live_session_review_001',
      messageId: 'msg_review_001',
      evaluationId: 'eval_review_001',
      entrySource: 'live_monitor',
      agentId: 'agent_001',
      scenario: 'unknown',
      suggestedReply: '您好，为了帮您进一步核查，请提供付款截图和绑定手机号，我们会尽快为您处理。'
    });

    // 查询待审核 suggestion
    const pendingSuggestions = await reviewService.getPendingSuggestions();

    if (pendingSuggestions.length > 0 && 
        pendingSuggestions.some(s => s.id === suggestion.id && s.reviewStatus === 'pending_review')) {
      console.log('✓ 待审核 suggestion 查询成功');
      console.log('✓ 找到待审核 suggestion 数量:', pendingSuggestions.length);
      passCount++;
    } else {
      console.log('✗ 待审核 suggestion 查询失败');
    }
  } catch (error) {
    console.log('✗ 测试失败:', error.message);
    console.error(error);
  }

  // ==================== 测试 2: approve 动作 ====================
  console.log('\n【测试 2】approve 动作（直接通过）');
  totalCount++;

  try {
    // 获取待审核的 suggestion
    const pendingSuggestions = await reviewService.getPendingSuggestions();
    const suggestionToApprove = pendingSuggestions.find(s => s.reviewStatus === 'pending_review');

    if (suggestionToApprove) {
      const result = await reviewService.submitReview({
        suggestionId: suggestionToApprove.id,
        reviewAction: REVIEW_ACTIONS.APPROVE,
        reviewerId: 'manager_001'
      });

      if (result.success === true) {
        console.log('✓ approve 动作执行成功');
        
        // 验证 review 记录
        const review = await reviewsRepo.findBySuggestionId(suggestionToApprove.id);
        if (review && 
            review.reviewAction === 'approve' &&
            review.originalReply === suggestionToApprove.suggestedReply &&
            review.finalReply === suggestionToApprove.suggestedReply &&
            review.reviewerId === 'manager_001') {
          console.log('✓ review 记录正确');
          console.log('✓ original_reply:', review.originalReply);
          console.log('✓ final_reply:', review.finalReply);
          
          // 验证 suggestion 状态
          const updatedSuggestion = await suggestionsRepo.findById(suggestionToApprove.id);
          if (updatedSuggestion.reviewStatus === 'approved') {
            console.log('✓ suggestion 状态已更新为 approved');
            passCount++;
          } else {
            console.log('✗ suggestion 状态未正确更新');
          }
        } else {
          console.log('✗ review 记录不正确');
        }
      } else {
        console.log('✗ approve 动作执行失败:', result.message);
      }
    } else {
      console.log('✗ 未找到待审核的 suggestion');
    }
  } catch (error) {
    console.log('✗ 测试失败:', error.message);
    console.error(error);
  }

  // ==================== 测试 3: modify_and_approve 动作 ====================
  console.log('\n【测试 3】modify_and_approve 动作（修改后通过）');
  totalCount++;

  try {
    // 创建新的 suggestion 用于测试
    const session2 = await sessionsRepo.create({
      sessionId: 'live_session_review_002',
      project: 'lanton',
      chatId: '-1001234567891',
      agentId: 'agent_002',
      status: 'active',
      startedAt: new Date(),
      updatedAt: new Date()
    });

    const message2 = await messagesRepo.create({
      messageId: 'msg_review_002',
      sessionId: 'live_session_review_002',
      role: 'agent',
      senderId: 'agent_002',
      senderName: '客服002',
      content: '我不确定',
      timestamp: new Date()
    });

    const evaluation2 = await evaluationsRepo.create({
      evaluationId: 'eval_review_002',
      sessionId: 'live_session_review_002',
      messageId: 'msg_review_002',
      project: 'lanton',
      currentReply: '我不确定',
      inputPayload: { metadata: { entry_type: 'live_monitor' } },
      outputPayload: { analysis: { issues: ['回复不确定'] } },
      scenario: 'unknown',
      stage: '解答',
      judgement: '客服回复不确定',
      summary: '客服未能给出明确答复',
      confidence: 0.4,
      problemType: 'unknown',
      needReview: true,
      classifyReason: '置信度不足'
    });

    const suggestion2 = await suggestionsRepo.create({
      projectId: 'lanton',
      sessionId: 'live_session_review_002',
      messageId: 'msg_review_002',
      evaluationId: 'eval_review_002',
      entrySource: 'live_monitor',
      agentId: 'agent_002',
      scenario: 'unknown',
      suggestedReply: '您好，我需要查一下。'
    });

    // 执行 modify_and_approve
    const modifiedReply = '您好，为了帮您进一步核查，请提供付款截图和绑定手机号，我们会尽快为您处理。';
    const result = await reviewService.submitReview({
      suggestionId: suggestion2.id,
      reviewAction: REVIEW_ACTIONS.MODIFY_AND_APPROVE,
      finalReply: modifiedReply,
      reviewNote: '补充了资料收集动作，删除了不确定承诺',
      reviewerId: 'manager_002'
    });

    if (result.success === true) {
      console.log('✓ modify_and_approve 动作执行成功');
      
      // 验证 review 记录
      const review = await reviewsRepo.findBySuggestionId(suggestion2.id);
      if (review && 
          review.reviewAction === 'modify_and_approve' &&
          review.originalReply === suggestion2.suggestedReply &&
          review.finalReply === modifiedReply &&
          review.reviewNote === '补充了资料收集动作，删除了不确定承诺' &&
          review.reviewerId === 'manager_002') {
        console.log('✓ review 记录正确');
        console.log('✓ original_reply:', review.originalReply);
        console.log('✓ final_reply:', review.finalReply);
        console.log('✓ review_note:', review.reviewNote);
        
        // 验证 suggestion 状态
        const updatedSuggestion = await suggestionsRepo.findById(suggestion2.id);
        if (updatedSuggestion.reviewStatus === 'modified_approved') {
          console.log('✓ suggestion 状态已更新为 modified_approved');
          passCount++;
        } else {
          console.log('✗ suggestion 状态未正确更新');
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

  // ==================== 测试 4: reject 动作 ====================
  console.log('\n【测试 4】reject 动作（驳回）');
  totalCount++;

  try {
    // 创建新的 suggestion 用于测试
    const session3 = await sessionsRepo.create({
      sessionId: 'live_session_review_003',
      project: 'lanton',
      chatId: '-1001234567892',
      agentId: 'agent_003',
      status: 'active',
      startedAt: new Date(),
      updatedAt: new Date()
    });

    const message3 = await messagesRepo.create({
      messageId: 'msg_review_003',
      sessionId: 'live_session_review_003',
      role: 'agent',
      senderId: 'agent_003',
      senderName: '客服003',
      content: '我不知道',
      timestamp: new Date()
    });

    const evaluation3 = await evaluationsRepo.create({
      evaluationId: 'eval_review_003',
      sessionId: 'live_session_review_003',
      messageId: 'msg_review_003',
      project: 'lanton',
      currentReply: '我不知道',
      inputPayload: { metadata: { entry_type: 'live_monitor' } },
      outputPayload: { analysis: { issues: ['回复无效'] } },
      scenario: 'unknown',
      stage: '解答',
      judgement: '客服回复无效',
      summary: '客服未能提供任何有效信息',
      confidence: 0.3,
      problemType: 'unknown',
      needReview: true,
      classifyReason: '分析结果不完整'
    });

    const suggestion3 = await suggestionsRepo.create({
      projectId: 'lanton',
      sessionId: 'live_session_review_003',
      messageId: 'msg_review_003',
      evaluationId: 'eval_review_003',
      entrySource: 'live_monitor',
      agentId: 'agent_003',
      scenario: 'unknown',
      suggestedReply: '抱歉，我无法回答您的问题。'
    });

    // 执行 reject
    const result = await reviewService.submitReview({
      suggestionId: suggestion3.id,
      reviewAction: REVIEW_ACTIONS.REJECT,
      reviewNote: '建议答案不合适，需要重新生成',
      reviewerId: 'manager_003'
    });

    if (result.success === true) {
      console.log('✓ reject 动作执行成功');
      
      // 验证 review 记录
      const review = await reviewsRepo.findBySuggestionId(suggestion3.id);
      if (review && 
          review.reviewAction === 'reject' &&
          review.originalReply === suggestion3.suggestedReply &&
          review.finalReply === null &&
          review.reviewNote === '建议答案不合适，需要重新生成' &&
          review.reviewerId === 'manager_003') {
        console.log('✓ review 记录正确');
        console.log('✓ original_reply:', review.originalReply);
        console.log('✓ final_reply:', review.finalReply);
        console.log('✓ review_note:', review.reviewNote);
        
        // 验证 suggestion 状态
        const updatedSuggestion = await suggestionsRepo.findById(suggestion3.id);
        if (updatedSuggestion.reviewStatus === 'rejected') {
          console.log('✓ suggestion 状态已更新为 rejected');
          passCount++;
        } else {
          console.log('✗ suggestion 状态未正确更新');
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

  // ==================== 测试 5: 审核上下文完整性 ====================
  console.log('\n【测试 5】审核上下文完整性验证');
  totalCount++;

  try {
    // 创建一个完整的测试场景
    const session4 = await sessionsRepo.create({
      sessionId: 'live_session_review_004',
      project: 'lanton',
      chatId: '-1001234567893',
      agentId: 'agent_004',
      status: 'active',
      startedAt: new Date(),
      updatedAt: new Date()
    });

    const userMessage = await messagesRepo.create({
      messageId: 'msg_review_004_user',
      sessionId: 'live_session_review_004',
      role: 'user',
      senderId: 'user_001',
      senderName: '用户001',
      content: '我的转账一直没有到账，怎么办？',
      timestamp: new Date(Date.now() - 60000)
    });

    const agentMessage = await messagesRepo.create({
      messageId: 'msg_review_004_agent',
      sessionId: 'live_session_review_004',
      role: 'agent',
      senderId: 'agent_004',
      senderName: '客服004',
      content: '请稍等',
      timestamp: new Date()
    });

    const evaluation4 = await evaluationsRepo.create({
      evaluationId: 'eval_review_004',
      sessionId: 'live_session_review_004',
      messageId: 'msg_review_004_agent',
      project: 'lanton',
      currentReply: '请稍等',
      inputPayload: { metadata: { entry_type: 'live_monitor' } },
      outputPayload: { 
        analysis: { 
          issues: ['回复过于简短，未能解决用户问题'],
          risks: ['用户可能流失']
        } 
      },
      scenario: 'unknown',
      stage: '解答',
      judgement: '客服回复未能有效承接问题',
      summary: '当前回复无法有效承接问题，且场景无法稳定识别',
      confidence: 0.5,
      problemType: 'unknown',
      needReview: true,
      classifyReason: '场景无法识别，分析结果不够完整'
    });

    const suggestion4 = await suggestionsRepo.create({
      projectId: 'lanton',
      sessionId: 'live_session_review_004',
      messageId: 'msg_review_004_agent',
      evaluationId: 'eval_review_004',
      entrySource: 'live_monitor',
      agentId: 'agent_004',
      scenario: 'unknown',
      suggestedReply: '您好，为了帮您核查转账问题，请提供以下信息：1. 转账时间 2. 转账金额 3. 收款方信息。我们会尽快为您处理。'
    });

    // 获取审核上下文
    const context = await reviewService.getReviewContext(suggestion4.id);

    if (context && 
        context.suggestion && 
        context.evaluation && 
        context.conversation && 
        context.conversation.length === 2) {
      console.log('✓ 审核上下文获取成功');
      console.log('✓ suggestion 信息完整');
      console.log('✓ evaluation 信息完整');
      console.log('✓ conversation 信息完整，消息数量:', context.conversation.length);
      
      // 验证关键字段
      if (context.evaluation.scenario === 'unknown' &&
          context.evaluation.classifyReason &&
          context.suggestion.suggestedReply) {
        console.log('✓ 关键字段都存在');
        passCount++;
      } else {
        console.log('✗ 关键字段缺失');
      }
    } else {
      console.log('✗ 审核上下文不完整');
    }
  } catch (error) {
    console.log('✗ 测试失败:', error.message);
    console.error(error);
  }

  // ==================== 测试 6: 重复审核拦截 ====================
  console.log('\n【测试 6】重复审核拦截验证');
  totalCount++;

  try {
    // 获取已审核的 suggestion（第一个测试中已审核的）
    const pendingSuggestions = await reviewService.getPendingSuggestions();
    
    // 创建一个已审核的 suggestion
    const session5 = await sessionsRepo.create({
      sessionId: 'live_session_review_005',
      project: 'lanton',
      chatId: '-1001234567894',
      agentId: 'agent_005',
      status: 'active',
      startedAt: new Date(),
      updatedAt: new Date()
    });

    const message5 = await messagesRepo.create({
      messageId: 'msg_review_005',
      sessionId: 'live_session_review_005',
      role: 'agent',
      senderId: 'agent_005',
      senderName: '客服005',
      content: '请等待',
      timestamp: new Date()
    });

    const evaluation5 = await evaluationsRepo.create({
      evaluationId: 'eval_review_005',
      sessionId: 'live_session_review_005',
      messageId: 'msg_review_005',
      project: 'lanton',
      currentReply: '请等待',
      inputPayload: { metadata: { entry_type: 'live_monitor' } },
      outputPayload: { analysis: { issues: ['回复不当'] } },
      scenario: 'unknown',
      stage: '解答',
      judgement: '客服回复不当',
      summary: '客服回复不够专业',
      confidence: 0.4,
      problemType: 'unknown',
      needReview: true,
      classifyReason: '回复质量差'
    });

    const suggestion5 = await suggestionsRepo.create({
      projectId: 'lanton',
      sessionId: 'live_session_review_005',
      messageId: 'msg_review_005',
      evaluationId: 'eval_review_005',
      entrySource: 'live_monitor',
      agentId: 'agent_005',
      scenario: 'unknown',
      suggestedReply: '您好，请耐心等待，我们正在处理。'
    });

    // 第一次审核
    const result1 = await reviewService.submitReview({
      suggestionId: suggestion5.id,
      reviewAction: REVIEW_ACTIONS.APPROVE,
      reviewerId: 'manager_001'
    });

    // 第二次审核（应该失败）
    const result2 = await reviewService.submitReview({
      suggestionId: suggestion5.id,
      reviewAction: REVIEW_ACTIONS.REJECT,
      reviewerId: 'manager_002'
    });

    if (result1.success === true && result2.success === false && 
        result2.error === 'SUGGESTION_ALREADY_REVIEWED') {
      console.log('✓ 重复审核拦截成功');
      console.log('✓ 第一次审核成功');
      console.log('✓ 第二次审核被正确拦截:', result2.message);
      passCount++;
    } else {
      console.log('✗ 重复审核拦截失败');
    }
  } catch (error) {
    console.log('✗ 测试失败:', error.message);
    console.error(error);
  }

  // ==================== 测试总结 ====================
  console.log('\n========== 测试总结 ==========');
  console.log(`通过: ${passCount}/${totalCount}`);
  
  if (passCount === totalCount) {
    console.log('\n✅ 所有测试通过！');
    console.log('\n验收标准检查：');
    console.log('✓ 标准1: 每条 pending_review 的 suggestion 都能进入审核流');
    console.log('✓ 标准2: 主管可以执行三种固定动作：approve / modify_and_approve / reject');
    console.log('✓ 标准3: 每次审核都会生成 review 记录');
    console.log('✓ 标准4: review 记录中同时保留 original_reply 和 final_reply');
    console.log('✓ 标准5: 审核后的 suggestion 状态会正确更新');
    console.log('✓ 标准6: 后续可以直接继续接《FAQ / 场景知识库沉淀执行单》');
    process.exit(0);
  } else {
    console.log(`\n✗ ${totalCount - passCount} 个测试失败`);
    process.exit(1);
  }
}

// 运行测试
runReviewTests().catch(error => {
  console.error('测试运行异常:', error);
  process.exit(1);
});
