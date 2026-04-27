/**
 * 训练编排服务
 * 
 * 职责：
 * 1. 编排完整的训练流程
 * 2. 协调 user-simulator、evaluation-service、training-session-store
 * 3. 实现训练状态机流转
 * 4. 提供训练日志输出
 * 
 * 标准流程：
 * 客服回复 → 拼接 conversation → 调用分析引擎 → 保存 analysisResult → 判断是否结束
 *     ↓                                                   ↓
 *   未结束: 调用 userSimulator → 发送下一轮用户消息 → round +1
 *     ↓
 *   已结束: 输出训练总结
 */

const {
  createTrainingSession,
  getActiveSession,
  getTrainingSession,
  updateSessionStatus,
  addUserMessage,
  addAgentMessage,
  saveAnalysisResult,
  incrementRound,
  getTrainingSummary,
  TrainingSessionStatus
} = require('../session/training-session-store');

const { generateUserMessage } = require('./user-simulator');
const { evaluate } = require('./evaluation-service');
const { getScenarioById } = require('../core/scenario-loader');
const { generateFeedback } = require('./feedback-template-service');
const { runKnowledgeInjectionTrial } = require('./knowledge-injection-trial');
const { TrainingRecordService } = require('./training-record-service');
const { runQwen3Shadow } = require('./local-model/qwen3-shadow-runner');

/**
 * 启动训练
 * 
 * @param {Object} params
 * @param {string} params.chatId - Telegram chat ID
 * @param {string} params.scenarioId - 场景ID
 * @param {string} params.agentId - 客服ID
 * @returns {Promise<Object>} 训练启动结果
 */
async function startTraining({ chatId, scenarioId, agentId }) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`[TrainingOrchestrator] 启动训练`);
  console.log(`[TrainingOrchestrator] chatId: ${chatId}, scenarioId: ${scenarioId}`);
  console.log(`${'='.repeat(60)}\n`);

  try {
    // 1. 加载场景
    const scenario = getScenarioById(scenarioId);
    if (!scenario) {
      throw new Error(`场景不存在: ${scenarioId}`);
    }

    console.log(`[TrainingOrchestrator] 场景加载成功: ${scenario.title}`);

    // 2. 创建训练 session
    const session = createTrainingSession(chatId, scenarioId, scenario);

    // 3. 创建训练记录（入库）
    const trainingRecordService = TrainingRecordService.getInstance();
    await trainingRecordService.createSession({
      sessionId: session.sessionId,
      scenarioId,
      scenarioTitle: scenario.title,
      agentId: agentId || 'unknown',
      chatId: String(chatId)
    });

    // 4. 调用 userSimulator 生成第一轮用户问题
    updateSessionStatus(session.sessionId, TrainingSessionStatus.GENERATING_USER_REPLY);
    
    const userMessageResult = await generateUserMessage({
      project: 'default',
      scenario,
      conversation: [],
      round: 0
    });

    // 5. 添加用户消息到 conversation
    addUserMessage(session.sessionId, userMessageResult.user_message);

    // 6. 保存用户消息到数据库
    await trainingRecordService.saveMessage({
      sessionId: session.sessionId,
      round: 0,
      role: 'user',
      content: userMessageResult.user_message,
      source: 'ai'
    });

    // 7. 更新状态为等待客服回复
    updateSessionStatus(session.sessionId, TrainingSessionStatus.WAITING_AGENT_REPLY);

    console.log(`\n[TrainingOrchestrator] === 训练启动成功 ===`);
    console.log(`[TrainingOrchestrator] Session ID: ${session.sessionId}`);
    console.log(`[TrainingOrchestrator] 场景: ${scenario.title}`);
    console.log(`[TrainingOrchestrator] Round 0 用户消息: ${userMessageResult.user_message}\n`);

    return {
      success: true,
      sessionId: session.sessionId,
      scenarioId,
      scenarioTitle: scenario.title,
      round: 0,
      userMessage: userMessageResult.user_message,
      isFirstRoundFinished: userMessageResult.is_finished // 如果第一轮就结束（异常情况）
    };

  } catch (error) {
    console.error(`[TrainingOrchestrator] 启动训练失败:`, error.message);
    throw error;
  }
}

/**
 * 处理客服回复
 * 
 * @param {Object} params
 * @param {string} params.sessionId - 训练 session ID
 * @param {string} params.agentReply - 客服回复内容
 * @param {string} params.agentId - 客服ID
 * @returns {Promise<Object>} 处理结果
 */
async function processAgentReply({ sessionId, agentReply, agentId }) {
  const session = getTrainingSession(sessionId);
  if (!session) {
    throw new Error(`训练 session 不存在: ${sessionId}`);
  }

  // 验证状态
  if (session.status !== TrainingSessionStatus.WAITING_AGENT_REPLY) {
    throw new Error(`当前状态不允许回复: ${session.status}，期望状态: waiting_agent_reply`);
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`[TrainingOrchestrator] 处理客服回复`);
  console.log(`[TrainingOrchestrator] Session ID: ${sessionId}`);
  console.log(`[TrainingOrchestrator] Round: ${session.round}`);
  console.log(`${'='.repeat(60)}`);

  try {
    // 1. 添加客服消息到 conversation
    updateSessionStatus(sessionId, TrainingSessionStatus.ANALYZING);
    addAgentMessage(sessionId, agentReply);

    // 2. 保存客服消息到数据库
    const trainingRecordService = TrainingRecordService.getInstance();
    await trainingRecordService.saveMessage({
      sessionId,
      round: session.round,
      role: 'agent',
      content: agentReply,
      source: 'human'
    });

    // 3. 调用分析引擎（使用标准协议）
    const analysisResult = await evaluate({
      project: 'default',
      conversation: session.conversation,
      current_reply: agentReply,
      metadata: {
        source: 'telegram',
        session_id: sessionId,
        agent_id: agentId || 'unknown',
        timestamp: new Date().toISOString(),
        entry_type: 'training',
        scenarioId: session.scenarioId
      },
      rules: {}
    });

    // 4. 影子运行 qwen3（旁路执行，绝不影响正式返回）
    // 原逻辑优先：analysisResult 已经是正式结果
    // qwen3 只做后台观察，失败被完全吞掉
    const shadowContext = {
      taskType: 'quality_evaluation',
      entrySource: 'training',
      scenario: session.scenarioId || 'unknown'
    };
    
    runQwen3Shadow(
      { conversationText: session.conversation.map(m => `${m.role}: ${m.content}`).join('\n') },
      shadowContext,
      { success: true, source: 'original_logic', analysisResult }
    ).catch((error) => {
      // 吞掉所有异常，绝不影响主流程
      console.error('[TrainingOrchestrator] Qwen3 shadow error (non-blocking):', error.message);
    });

    // 5. 保存分析结果
    saveAnalysisResult(sessionId, analysisResult);

    // 5. 生成训练反馈
    const feedback = generateFeedback({
      scenario: session.scenario,
      round: session.round,
      analysis: analysisResult,
      isFinished: shouldEndTraining(session, analysisResult)
    });

    // 5.5 知识注入内部试运行（附加知识增强的建议答案）
    let knowledgeEnhancedSuggestion = null;
    try {
      const trialInput = {
        conversationText: session.conversation.map(m => `${m.role}: ${m.content}`).join('\n'),
        scenario: session.scenarioId,
        projectId: 'default'
      };
      
      const trialContext = {
        entrySource: 'training',
        scenario: session.scenarioId,
        projectId: 'default'
      };
      
      const trialResult = await runKnowledgeInjectionTrial(
        trialInput,
        trialContext,
        // 原逻辑：不返回建议答案
        async () => ({ success: false, source: 'original_logic' })
      );
      
      if (trialResult && trialResult.source === 'knowledge_injection_trial' && trialResult.data) {
        knowledgeEnhancedSuggestion = {
          suggested_reply: trialResult.data.suggested_reply || null,
          score: trialResult.data.score || null,
          knowledgeInjected: true,
          source: 'knowledge_injection_trial'
        };
        
        console.log('[TrainingOrchestrator] 知识增强建议答案已生成');
        console.log('[TrainingOrchestrator] 建议回复:', trialResult.data.suggested_reply?.substring(0, 100));
      } else {
        console.log('[TrainingOrchestrator] 知识注入未命中或失败，不附加建议答案');
      }
    } catch (error) {
      console.error('[TrainingOrchestrator] 知识注入试运行异常（不影响主流程）:', error.message);
    }

    // 6. 保存轮次结果到数据库
    const shouldFinish = shouldEndTraining(session, analysisResult);
    await trainingRecordService.saveRoundResult({
      sessionId,
      round: session.round,
      scenarioId: session.scenarioId,
      scenarioTitle: session.scenario.title,
      analysisRaw: analysisResult,
      feedbackText: feedback.feedback_text,
      structuredFeedback: feedback.structured_feedback,
      isFinished: shouldFinish
    });

    // 7. 打印训练日志
    printTrainingLog(session, agentReply, analysisResult);

    // 8. 判断是否结束（使用上面已计算的 shouldFinish）

    if (shouldFinish) {
      // 结束训练
      updateSessionStatus(sessionId, TrainingSessionStatus.FINISHED);
      
      // 更新数据库中的训练会话状态
      const totalRounds = session.round + 1;
      await trainingRecordService.finishSession(sessionId, totalRounds);
      
      const summary = getTrainingSummary(sessionId);
      
      console.log(`\n[TrainingOrchestrator] === 训练结束 ===`);
      console.log(`[TrainingOrchestrator] 总轮数: ${session.round + 1}`);
      console.log(`[TrainingOrchestrator] 原因: ${getFinishReason(session, analysisResult)}\n`);

      return {
        success: true,
        isFinished: true,
        finishReason: getFinishReason(session, analysisResult),
        analysisResult,
        feedback,
        summary,
        knowledgeEnhancedSuggestion
      };
    }

    // 9. 未结束，生成下一轮用户消息
    updateSessionStatus(sessionId, TrainingSessionStatus.GENERATING_USER_REPLY);
    incrementRound(sessionId);

    const userMessageResult = await generateUserMessage({
      project: 'default',
      scenario: session.scenario,
      conversation: session.conversation,
      round: session.round
    });

    // 10. 添加用户消息到 conversation
    addUserMessage(sessionId, userMessageResult.user_message);

    // 11. 保存用户消息到数据库
    await trainingRecordService.saveMessage({
      sessionId,
      round: session.round,
      role: 'user',
      content: userMessageResult.user_message,
      source: 'ai'
    });

    // 12. 更新状态为等待客服回复
    updateSessionStatus(sessionId, TrainingSessionStatus.WAITING_AGENT_REPLY);

    console.log(`\n[TrainingOrchestrator] === 第 ${session.round} 轮 ===`);
    console.log(`[TrainingOrchestrator] 用户消息: ${userMessageResult.user_message}\n`);

    return {
      success: true,
      isFinished: false,
      analysisResult,
      feedback,
      round: session.round,
      userMessage: userMessageResult.user_message,
      knowledgeEnhancedSuggestion
    };

  } catch (error) {
    console.error(`[TrainingOrchestrator] 处理客服回复失败:`, error.message);
    throw error;
  }
}

/**
 * 判断是否应该结束训练
 */
function shouldEndTraining(session, analysisResult) {
  // 1. 达到最大轮数（6轮）
  if (session.round >= 5) { // round 从 0 开始，所以 >= 5 表示已经完成 6 轮
    console.log(`[TrainingOrchestrator] 结束判断: 达到最大轮数限制 (6轮)`);
    return true;
  }

  // 2. userSimulator 标记结束
  // 注意：这里需要在调用 generateUserMessage 后判断，但为了提前判断，
  // 我们可以通过分析结果来推断
  if (analysisResult.riskLevel === 'none' && 
      analysisResult.result?.level === 'pass' && 
      session.round >= 2) { // 至少 3 轮
    console.log(`[TrainingOrchestrator] 结束判断: 客服表现优秀，可提前结束`);
    return true;
  }

  return false;
}

/**
 * 获取结束原因
 */
function getFinishReason(session, analysisResult) {
  if (session.round >= 5) {
    return '达到最大轮数限制 (6轮)';
  }
  
  if (analysisResult.riskLevel === 'none' && analysisResult.result?.level === 'pass') {
    return '客服表现优秀，训练提前完成';
  }

  return '训练完成';
}

/**
 * 强制停止训练
 */
async function stopTraining(sessionId) {
  const session = getTrainingSession(sessionId);
  if (!session) {
    throw new Error(`训练 session 不存在: ${sessionId}`);
  }

  console.log(`\n[TrainingOrchestrator] 强制停止训练: ${sessionId}`);

  try {
    updateSessionStatus(sessionId, TrainingSessionStatus.CANCELLED);
    
    // 更新数据库中的训练会话状态
    const session = getTrainingSession(sessionId);
    const trainingRecordService = TrainingRecordService.getInstance();
    await trainingRecordService.cancelSession(sessionId, session.round);
    
    const summary = getTrainingSummary(sessionId);

    console.log(`[TrainingOrchestrator] 训练已取消`);

    return {
      success: true,
      isCancelled: true,
      summary
    };

  } catch (error) {
    console.error(`[TrainingOrchestrator] 停止训练失败:`, error.message);
    throw error;
  }
}

/**
 * 获取训练状态
 */
function getTrainingStatus(chatId) {
  const session = getActiveSession(chatId);
  
  if (!session) {
    return {
      hasActiveSession: false,
      message: '当前没有进行中的训练'
    };
  }

  return {
    hasActiveSession: true,
    sessionId: session.sessionId,
    scenarioId: session.scenarioId,
    scenarioTitle: session.scenario?.title || '未知场景',
    round: session.round,
    status: session.status,
    startedAt: session.startedAt,
    totalRounds: session.conversation.filter(m => m.role === 'user').length
  };
}

/**
 * 打印训练日志
 */
function printTrainingLog(session, agentReply, analysisResult) {
  console.log(`\n${'-'.repeat(60)}`);
  console.log(`[Training Log]`);
  console.log(`${'-'.repeat(60)}`);
  console.log(`Session ID: ${session.sessionId}`);
  console.log(`Round: ${session.round}`);
  console.log(`场景: ${session.scenario?.title || '未知'}`);
  console.log(`${'-'.repeat(60)}`);
  
  console.log(`\n[用户消息 (Round ${session.round})]:`);
  const userMessages = session.conversation.filter(m => m.role === 'user');
  console.log(userMessages[userMessages.length - 1]?.content || '无');
  
  console.log(`\n[客服回复 (Round ${session.round})]:`);
  console.log(agentReply);
  
  console.log(`\n[分析结果]:`);
  console.log(`  - 风险等级: ${analysisResult.riskLevel || 'unknown'}`);
  console.log(`  - 评估等级: ${analysisResult.result?.level || 'unknown'}`);
  console.log(`  - 问题数: ${(analysisResult.issues || []).length}`);
  console.log(`  - 优点数: ${(analysisResult.strengths || []).length}`);
  
  if (analysisResult.issues && analysisResult.issues.length > 0) {
    console.log(`\n[发现的问题]:`);
    analysisResult.issues.forEach((issue, idx) => {
      // issues 是字符串数组
      const message = typeof issue === 'string' ? issue : (issue.message || '未知问题');
      console.log(`  ${idx + 1}. ${message}`);
    });
  }
  
  if (analysisResult.strengths && analysisResult.strengths.length > 0) {
    console.log(`\n[优点]:`);
    analysisResult.strengths.forEach((strength, idx) => {
      console.log(`  ${idx + 1}. ${strength}`);
    });
  }
  
  console.log(`\n${'-'.repeat(60)}\n`);
}

/**
 * 格式化训练总结消息（用于发送到 TG）
 */
function formatTrainingSummaryMessage(summary) {
  let message = `🎯 *训练总结*\n\n`;
  message += `*场景:* ${summary.scenarioTitle}\n`;
  message += `*Session ID:* \`${summary.sessionId}\`\n`;
  message += `*总轮数:* ${summary.totalRounds}\n`;
  message += `*状态:* ${summary.status}\n\n`;

  // 风险等级分布
  message += `*风险等级分布:*\n`;
  const risk = summary.riskLevelDistribution;
  if (risk.high > 0) message += `  🔴 高风险: ${risk.high}\n`;
  if (risk.medium > 0) message += `  🟡 中风险: ${risk.medium}\n`;
  if (risk.low > 0) message += `  🟢 低风险: ${risk.low}\n`;
  if (risk.none > 0) message += `  ✅ 无风险: ${risk.none}\n`;
  message += `\n`;

  // 主要问题
  if (summary.issues.length > 0) {
    message += `*主要问题 (${summary.issues.length}个):*\n`;
    summary.issues.slice(0, 5).forEach((issue, idx) => {
      message += `${idx + 1}. [Round ${issue.round}] ${issue.message}\n`;
    });
    if (summary.issues.length > 5) {
      message += `  ... 还有 ${summary.issues.length - 5} 个问题\n`;
    }
    message += `\n`;
  }

  // 优点
  if (summary.strengths.length > 0) {
    message += `*优点 (${summary.strengths.length}个):*\n`;
    summary.strengths.slice(0, 5).forEach((s, idx) => {
      message += `${idx + 1}. [Round ${s.round}] ${s.text}\n`;
    });
    message += `\n`;
  }

  // 改进建议
  if (summary.suggestions.length > 0) {
    message += `*改进建议:*\n`;
    summary.suggestions.forEach((suggestion, idx) => {
      message += `${idx + 1}. ${suggestion}\n`;
    });
    message += `\n`;
  }

  message += `_训练已结束，感谢参与！_`;

  return message;
}

/**
 * 格式化训练取消消息
 */
function formatCancelMessage(summary) {
  let message = `⏹️ *训练已取消*\n\n`;
  message += `*场景:* ${summary.scenarioTitle}\n`;
  message += `*Session ID:* \`${summary.sessionId}\`\n`;
  message += `*已完成轮数:* ${summary.totalRounds}\n\n`;
  message += `_发送 /train <scenarioId> 开始新的训练_`;

  return message;
}

module.exports = {
  startTraining,
  processAgentReply,
  stopTraining,
  getTrainingStatus,
  formatTrainingSummaryMessage,
  formatCancelMessage,
  TrainingSessionStatus
};
