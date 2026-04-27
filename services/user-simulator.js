/**
 * AI 用户模拟器 - 训练系统的用户角色扮演模块
 * 
 * 职责：
 * 1. 根据场景生成第一轮用户问题
 * 2. 根据 conversation 上下文继续生成后续用户发言
 * 3. 控制对话轮数在 3~6 轮之间
 * 4. 判断对话是否可以结束
 * 
 * 设计原则：
 * - 用户表达必须自然，贴近真实用户
 * - 不允许一次性说完所有信息
 * - 必须贴合场景和当前对话阶段
 * - 必须根据上下文推进对话
 * - 优先使用本地模型生成，降级到规则版
 * 
 * 本地模型降级方案：
 * - 环境变量 USE_LOCAL_MODEL=true 时尝试调用本地模型
 * - 本地模型 API: http://localhost:8001/score
 * - 若调用失败、返回格式错误或返回评分结果，自动降级到规则版
 * - 规则版基于场景信息和对话上下文生成自然的用户消息
 * - 当前默认降级方案：规则版（USE_LOCAL_MODEL 未设置或为 false）
 * 
 * 输入协议：
 * {
 *   project: string,           // 项目标识
 *   scenario: object,          // 场景对象（含 stages）
 *   conversation: array,       // 当前对话历史 [{role: "user"|"agent", content: string}]
 *   round: number              // 当前轮次（从0开始）
 * }
 * 
 * 输出协议：
 * {
 *   user_message: string,      // 生成的用户消息
 *   is_finished: boolean       // 是否应该结束对话
 * }
 */

const fs = require('fs');
const path = require('path');

// 本地模型 API 地址（与 ai-coach 共用）
const LOCAL_MODEL_API = 'http://localhost:8001/score';

/**
 * 生成第一轮用户问题
 * @param {Object} scenario - 场景对象
 * @returns {string} 用户初始问题
 */
function generateFirstMessage(scenario) {
  // 如果场景有 customerMessage，直接使用
  if (scenario.customerMessage) {
    return scenario.customerMessage;
  }

  // 否则根据场景标题和描述生成
  const title = scenario.title || '咨询';
  const description = scenario.description || '';
  
  // 规则版：基于场景信息构造自然的开场白
  return buildNaturalOpening(title, description);
}

/**
 * 生成后续用户消息（基于对话上下文）
 * @param {Object} params - 参数
 * @param {Object} params.scenario - 场景对象
 * @param {Array} params.conversation - 对话历史
 * @param {number} params.round - 当前轮次
 * @param {Object} params.analysisResult - 上一轮分析结果（可选）
 * @returns {Promise<string>} 用户消息
 */
async function generateNextMessage(params) {
  const { scenario, conversation, round, analysisResult } = params;
  
  // 检查是否使用本地模型
  const useLocalModel = process.env.USE_LOCAL_MODEL === 'true';
  
  if (useLocalModel) {
    try {
      return await generateWithLocalModel(scenario, conversation, round, analysisResult);
    } catch (error) {
      console.warn('[UserSimulator] 本地模型失败，降级到规则版:', error.message);
      return generateWithRules(scenario, conversation, round, analysisResult);
    }
  }
  
  // 默认使用规则版
  return generateWithRules(scenario, conversation, round, analysisResult);
}

/**
 * 判断对话是否应该结束
 * @param {Object} params - 参数
 * @param {Object} params.scenario - 场景对象
 * @param {Array} params.conversation - 对话历史
 * @param {number} params.round - 当前轮次
 * @param {Object} params.analysisResult - 上一轮分析结果（可选）
 * @returns {boolean} 是否结束
 */
function shouldFinishConversation(params) {
  const { scenario, conversation, round, analysisResult } = params;
  
  // 规则1: 最少3轮
  if (round < 3) {
    return false;
  }
  
  // 规则2: 最多6轮
  if (round >= 6) {
    return true;
  }
  
  // 规则3: 如果分析结果显示 pass 且无问题，可以结束
  if (analysisResult) {
    const level = analysisResult.result?.level;
    const issues = analysisResult.issues || [];
    const missing = analysisResult.missing || [];
    
    // 如果客服表现优秀，且用户问题已解决，提前结束
    if (level === 'pass' && issues.length === 0 && missing.length === 0) {
      // 但仍需至少3轮
      return round >= 3;
    }
    
    // 如果客服表现很差，可能需要更多轮次来改进
    if (level === 'fail' || level === 'risk') {
      return false;
    }
  }
  
  // 规则4: 如果场景有 stages，检查是否已完成所有阶段
  if (scenario.stages && scenario.stages.length > 0) {
    const currentStage = detectCurrentStage(scenario, conversation);
    if (currentStage && !currentStage.nextStage) {
      // 最后阶段且已完成
      return round >= 3;
    }
  }
  
  // 默认继续
  return false;
}

/**
 * 使用本地模型生成用户消息
 * @private
 */
async function generateWithLocalModel(scenario, conversation, round, analysisResult) {
  const prompt = buildUserSimulationPrompt(scenario, conversation, round, analysisResult);
  
  try {
    const response = await fetch(LOCAL_MODEL_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: prompt,
        mode: 'user_simulation'
      })
    });

    if (!response.ok) {
      throw new Error(`本地模型API错误: ${response.status}`);
    }

    const result = await response.json();
    
    // 尝试从结果中提取用户消息
    if (result.user_message) {
      return result.user_message;
    }
    
    // 如果模型返回的是评分结果，降级到规则版
    if (result.total_score !== undefined) {
      console.warn('[UserSimulator] 本地模型返回评分结果而非对话，降级到规则版');
      return generateWithRules(scenario, conversation, round, analysisResult);
    }
    
    // 尝试从其他字段提取
    return result.message || result.content || result.text || 
           generateWithRules(scenario, conversation, round, analysisResult);
           
  } catch (error) {
    console.error('[UserSimulator] 本地模型调用失败:', error.message);
    throw error;
  }
}

/**
 * 构建用户模拟提示词
 * @private
 */
function buildUserSimulationPrompt(scenario, conversation, round, analysisResult) {
  const scenarioTitle = scenario.title || '未知场景';
  const scenarioDesc = scenario.description || '';
  const customerMessage = scenario.customerMessage || '';
  
  // 构建对话历史文本
  const historyText = conversation.map((turn, idx) => {
    const role = turn.role === 'user' ? '用户' : '客服';
    return `[第${idx + 1}轮] ${role}: ${turn.content}`;
  }).join('\n');
  
  // 获取当前阶段信息
  const currentStage = detectCurrentStage(scenario, conversation);
  const stageInfo = currentStage ? `
当前阶段：${currentStage.name}
阶段目标：${currentStage.description}
期望用户行为：${currentStage.expectedActions?.join('、') || '根据场景自然推进'}
` : '';

  // 分析结果反馈
  const feedbackText = analysisResult ? `
上一轮客服回复质量：${analysisResult.result?.level || '未知'}
存在的问题：${(analysisResult.issues || []).map(i => i.message || i).join('、') || '无明显问题'}
缺失信息：${(analysisResult.missing || []).join('、') || '无明显缺失'}
` : '';

  return `你是一个正在接受客服培训的真实用户模拟系统。

【场景信息】
场景标题：${scenarioTitle}
场景描述：${scenarioDesc}
初始问题：${customerMessage}

${stageInfo}
【对话历史】
${historyText}

${feedbackText}

【当前轮次】第 ${round + 1} 轮

【你的任务】
作为用户，基于以上信息生成下一句发言。

【严格要求】
1. 表达必须自然，像真实用户（不要像客服或AI）
2. 不要一次性说完所有信息，要逐步透露
3. 根据客服上一轮回复来回应（如果客服问问题，就回答；如果客服给方案，就反馈）
4. 如果客服遗漏了关键信息，要主动追问或表现出不满
5. 如果客服表现好，可以表示满意或提出下一个问题
6. 语言风格：口语化、简洁、可能有错别字或不完整句子
7. 不要使用敬语或过于正式的表达（除非场景需要）
8. 长度控制在 10-50 字之间

【输出格式】
只输出用户说的话，不要加任何前缀或解释。`;
}

/**
 * 规则版用户消息生成
 * @private
 */
function generateWithRules(scenario, conversation, round, analysisResult) {
  const currentStage = detectCurrentStage(scenario, conversation);
  
  // 第一轮：使用场景的 customerMessage
  if (round === 0) {
    return scenario.customerMessage || buildNaturalOpening(scenario.title, scenario.description);
  }
  
  // 后续轮次：基于阶段和客服回复生成
  const lastAgentReply = findLastAgentReply(conversation);
  
  if (!lastAgentReply) {
    return scenario.customerMessage || '请问怎么回事？';
  }
  
  // 根据分析结果决定用户反应
  if (analysisResult) {
    const level = analysisResult.result?.level;
    const missing = analysisResult.missing || [];
    const issues = analysisResult.issues || [];
    
    // 客服遗漏了信息，用户追问
    if (missing.length > 0) {
      return generateFollowUpQuestion(missing, scenario);
    }
    
    // 客服有问题，用户表达不满或困惑
    if (issues.length > 0 && (level === 'fail' || level === 'borderline')) {
      return generateComplaint(issues, lastAgentReply);
    }
    
    // 客服表现好，用户继续或确认
    if (level === 'pass') {
      return generatePositiveResponse(conversation, round, scenario);
    }
  }
  
  // 默认：基于阶段生成
  if (currentStage) {
    return generateStageBasedMessage(currentStage, conversation, round);
  }
  
  // 兜底：通用追问
  return generateGenericFollowUp(lastAgentReply);
}

/**
 * 检测当前所处阶段
 * @private
 */
function detectCurrentStage(scenario, conversation) {
  if (!scenario.stages || scenario.stages.length === 0) {
    return null;
  }
  
  const turnCount = conversation.filter(t => t.role === 'agent').length;
  
  // 根据轮次匹配阶段
  for (const stage of scenario.stages) {
    if (stage.trigger && stage.trigger.turnIndex !== undefined) {
      if (turnCount === stage.trigger.turnIndex) {
        return stage;
      }
    }
  }
  
  // 默认返回最后一个阶段
  return scenario.stages[scenario.stages.length - 1];
}

/**
 * 构建自然的开场白
 * @private
 */
function buildNaturalOpening(title, description) {
  // 从标题和描述中提取关键词
  const keywords = extractKeywords(title, description);
  
  const openings = [
    `你好，我想问一下${keywords}的问题`,
    `请问${keywords}怎么弄？`,
    `你好，${keywords}遇到了点问题`,
    `在吗？想咨询下${keywords}`,
    `你好，${keywords}一直搞不定，能帮下吗？`
  ];
  
  return openings[Math.floor(Math.random() * openings.length)];
}

/**
 * 生成追问（针对缺失信息）
 * @private
 */
function generateFollowUpQuestion(missing, scenario) {
  const questions = [
    `那你还需要什么信息？`,
    `我是不是还忘了说什么？`,
    `还有别的需要我提供的吗？`,
    `具体要怎么做啊？`,
    `能不能说清楚一点？`
  ];
  
  // 如果有具体的缺失信息，生成针对性追问
  if (missing.length > 0 && typeof missing[0] === 'string') {
    const firstMissing = missing[0];
    return `你刚才说的${firstMissing}具体是指什么？`;
  }
  
  return questions[Math.floor(Math.random() * questions.length)];
}

/**
 * 生成抱怨/不满（针对客服问题）
 * @private
 */
function generateComplaint(issues, lastAgentReply) {
  const complaints = [
    `你说的我不太明白，能再说清楚点吗？`,
    `怎么感觉没解决我的问题啊`,
    `我不是这个意思，我是想问...`,
    `你这回复有点敷衍吧`,
    `说了半天还是不知道怎么办`,
    `能不能直接告诉我怎么做？`
  ];
  
  return complaints[Math.floor(Math.random() * complaints.length)];
}

/**
 * 生成正面回应（客服表现好时）
 * @private
 */
function generatePositiveResponse(conversation, round, scenario) {
  // 如果已经是第4轮以上，可以结束
  if (round >= 4) {
    const endings = [
      `好的，明白了，谢谢`,
      `好的，我试试，谢谢`,
      `了解了，没问题了`,
      `好的，清楚了，感谢`,
      `明白了，我先操作下`
    ];
    return endings[Math.floor(Math.random() * endings.length)];
  }
  
  // 否则继续提问
  const continuations = [
    `好的，那还有其他需要注意的吗？`,
    `明白了，那如果我遇到问题怎么办？`,
    `好的，还有别的办法吗？`,
    `了解了，那大概要多久？`,
    `好的，费用是怎么算的？`
  ];
  
  return continuations[Math.floor(Math.random() * continuations.length)];
}

/**
 * 基于阶段生成消息
 * @private
 */
function generateStageBasedMessage(stage, conversation, round) {
  const stageName = stage.name || '';
  
  // 根据阶段名称生成对应消息
  if (stageName.includes('问候') || stageName.includes('收集')) {
    return `我是新用户，不太懂怎么操作`;
  }
  
  if (stageName.includes('指引') || stageName.includes('步骤')) {
    return `有点复杂，能再说详细点吗？`;
  }
  
  if (stageName.includes('处理') || stageName.includes('问题')) {
    return `试了还是不行，显示错误了`;
  }
  
  if (stageName.includes('确认') || stageName.includes('完成')) {
    return `好了，应该没问题了`;
  }
  
  // 默认
  return `然后呢？`;
}

/**
 * 生成通用追问
 * @private
 */
function generateGenericFollowUp(lastAgentReply) {
  // 检查客服是否在问问题
  if (lastAgentReply.includes('？') || lastAgentReply.includes('?')) {
    // 客服在问问题，用户回答
    const answers = [
      `好的，我提供一下`,
      `稍等，我找一下`,
      `是这个吗？`,
      `不太确定，你说的是哪个？`
    ];
    return answers[Math.floor(Math.random() * answers.length)];
  }
  
  // 客服在给方案，用户反馈
  const responses = [
    `好的，我试试`,
    `明白了`,
    `还有其他办法吗？`,
    `如果还是不行怎么办？`,
    `大概要多久？`
  ];
  
  return responses[Math.floor(Math.random() * responses.length)];
}

/**
 * 查找客服最后一次回复
 * @private
 */
function findLastAgentReply(conversation) {
  for (let i = conversation.length - 1; i >= 0; i--) {
    if (conversation[i].role === 'agent') {
      return conversation[i].content;
    }
  }
  return null;
}

/**
 * 提取关键词
 * @private
 */
function extractKeywords(title, description) {
  const text = `${title} ${description}`;
  // 简单提取：取前10个字符
  return text.substring(0, 10);
}

/**
 * 主入口：生成用户消息
 * 
 * @param {Object} params - 输入参数
 * @param {string} params.project - 项目标识
 * @param {Object} params.scenario - 场景对象
 * @param {Array} params.conversation - 对话历史
 * @param {number} params.round - 当前轮次
 * @param {Object} [params.analysisResult] - 上一轮分析结果
 * @returns {Promise<Object>} { user_message, is_finished }
 */
async function generateUserMessage(params) {
  const { project, scenario, conversation, round, analysisResult } = params;
  
  // 参数校验
  if (!scenario) {
    throw new Error('INVALID_INPUT: 缺少 scenario');
  }
  
  if (!Array.isArray(conversation)) {
    throw new Error('INVALID_INPUT: conversation 必须是数组');
  }
  
  if (round === undefined || round === null) {
    throw new Error('INVALID_INPUT: 缺少 round');
  }
  
  // 第一轮：生成初始问题
  if (round === 0) {
    const userMessage = generateFirstMessage(scenario);
    return {
      user_message: userMessage,
      is_finished: false
    };
  }
  
  // 后续轮次：先判断是否应该结束
  const isFinished = shouldFinishConversation({
    scenario,
    conversation,
    round,
    analysisResult
  });
  
  if (isFinished) {
    return {
      user_message: null,
      is_finished: true
    };
  }
  
  // 生成下一句用户消息
  const userMessage = await generateNextMessage({
    scenario,
    conversation,
    round,
    analysisResult
  });
  
  return {
    user_message: userMessage,
    is_finished: false
  };
}

module.exports = {
  generateUserMessage,
  // 导出内部函数供测试
  generateFirstMessage,
  generateNextMessage,
  shouldFinishConversation,
  detectCurrentStage
};
