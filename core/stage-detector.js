/**
 * Stage Detector - 阶段检测器
 * 
 * 职责：
 * 1. 基于对话上下文识别当前所处阶段
 * 2. 判断阶段转换条件
 * 3. 返回当前阶段规则
 */

/**
 * 检测当前对话阶段
 * @param {Object} scenario - 场景规则对象(包含stages[])
 * @param {Array} conversation - 对话历史
 * @returns {Object} 当前阶段信息 { stage, stageIndex, matchedBy }
 */
function detectStage(scenario, conversation) {
  if (!scenario || !scenario.stages || scenario.stages.length === 0) {
    return {
      stage: null,
      stageIndex: -1,
      matchedBy: 'no_stages_defined'
    };
  }

  // 计算客服回复轮次(只计算agent的回复)
  const agentTurns = conversation.filter(turn => turn.role === 'agent');
  const currentTurnIndex = agentTurns.length - 1; // 当前是第几个agent回复(从0开始)

  // 策略1: 基于turnIndex匹配
  let matchedStage = scenario.stages.find(
    stage => stage.trigger && stage.trigger.turnIndex === currentTurnIndex
  );

  if (matchedStage) {
    return {
      stage: matchedStage,
      stageIndex: scenario.stages.indexOf(matchedStage),
      matchedBy: 'turn_index'
    };
  }

  // 策略2: 基于客户意图关键词匹配(检查最近的用户消息)
  const recentCustomerMessages = conversation
    .filter(turn => turn.role === 'customer')
    .slice(-2) // 最近2条客户消息
    .map(turn => (turn.text || turn.content || '').toLowerCase());

  for (let i = 0; i < scenario.stages.length; i++) {
    const stage = scenario.stages[i];
    if (stage.trigger && stage.trigger.customerIntent) {
      const intentKeywords = stage.trigger.customerIntent;
      
      const hasIntentMatch = recentCustomerMessages.some(msg =>
        intentKeywords.some(keyword => msg.includes(keyword.toLowerCase()))
      );

      if (hasIntentMatch) {
        return {
          stage,
          stageIndex: i,
          matchedBy: 'customer_intent'
        };
      }
    }
  }

  // 策略3: 基于已完成阶段数推断(多轮对话场景)
  // 如果对话已经有多轮agent回复，说明可能已经过了初始阶段
  if (agentTurns.length > 1) {
    // 尝试匹配最后一个stage或倒数第二个stage
    const laterStages = scenario.stages.slice(-2);
    for (let i = laterStages.length - 1; i >= 0; i--) {
      const stage = laterStages[i];
      // 检查这个阶段是否可能被到达(前面的阶段已完成)
      const stageIdx = scenario.stages.indexOf(stage);
      if (stageIdx < agentTurns.length) {
        return {
          stage,
          stageIndex: stageIdx,
          matchedBy: 'conversation_progress'
        };
      }
    }
  }

  // 策略4: 兜底 - 返回第一个阶段
  return {
    stage: scenario.stages[0],
    stageIndex: 0,
    matchedBy: 'fallback_to_first'
  };
}

/**
 * 判断是否应该转换到下一阶段
 * @param {Object} currentStage - 当前阶段
 * @param {Array} conversation - 对话历史
 * @returns {boolean} 是否满足转换条件
 */
function shouldTransitionToNextStage(currentStage, conversation) {
  if (!currentStage || !currentStage.completionCriteria) {
    return false;
  }

  // 检查最近客服回复是否满足完成标准
  const lastAgentTurn = conversation
    .filter(turn => turn.role === 'agent')
    .slice(-1)[0];

  if (!lastAgentTurn) {
    return false;
  }

  const replyContent = (lastAgentTurn.text || lastAgentTurn.content || '').toLowerCase();
  
  // 简单关键词匹配(后续可升级为AI判断)
  const metCriteria = currentStage.completionCriteria.filter(criterion =>
    replyContent.includes(criterion.toLowerCase())
  );

  // 满足50%以上标准即认为可转换
  return metCriteria.length >= currentStage.completionCriteria.length * 0.5;
}

module.exports = { detectStage, shouldTransitionToNextStage };
