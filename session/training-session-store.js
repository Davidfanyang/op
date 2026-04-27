/**
 * 训练 Session 管理模块
 * 
 * 职责：
 * 1. 管理训练会话的生命周期
 * 2. 一个 chat 同时只能有一个 active session
 * 3. 提供 session 的创建、查询、更新、删除
 * 4. 记录完整的训练数据
 * 
 * 数据结构：
 * {
 *   sessionId: string,          // 唯一会话ID
 *   chatId: string,             // Telegram chat ID
 *   scenarioId: string,         // 场景ID
 *   scenario: object,           // 场景对象
 *   conversation: array,        // 对话历史 [{role: "user"|"agent", content: string}]
 *   round: number,              // 当前轮次（从0开始）
 *   analysisHistory: array,     // 分析历史 [analysisResult]
 *   status: string,             // 状态：idle|running|waiting_agent_reply|analyzing|generating_user_reply|finished|cancelled
 *   startedAt: string,          // 开始时间
 *   endedAt: string,            // 结束时间
 *   createdAt: string,          // 创建时间
 *   updatedAt: string           // 更新时间
 * }
 */

const { v4: uuidv4 } = require('uuid');

// 内存存储
const sessions = new Map();

// 状态枚举
const TrainingSessionStatus = {
  IDLE: 'idle',
  RUNNING: 'running',
  WAITING_AGENT_REPLY: 'waiting_agent_reply',
  ANALYZING: 'analyzing',
  GENERATING_USER_REPLY: 'generating_user_reply',
  FINISHED: 'finished',
  CANCELLED: 'cancelled'
};

// 合法状态流转
const VALID_TRANSITIONS = {
  [TrainingSessionStatus.IDLE]: [TrainingSessionStatus.RUNNING],
  [TrainingSessionStatus.RUNNING]: [TrainingSessionStatus.WAITING_AGENT_REPLY, TrainingSessionStatus.GENERATING_USER_REPLY, TrainingSessionStatus.CANCELLED],
  [TrainingSessionStatus.WAITING_AGENT_REPLY]: [TrainingSessionStatus.ANALYZING, TrainingSessionStatus.CANCELLED],
  [TrainingSessionStatus.ANALYZING]: [TrainingSessionStatus.GENERATING_USER_REPLY, TrainingSessionStatus.FINISHED, TrainingSessionStatus.CANCELLED],
  [TrainingSessionStatus.GENERATING_USER_REPLY]: [TrainingSessionStatus.WAITING_AGENT_REPLY, TrainingSessionStatus.FINISHED, TrainingSessionStatus.CANCELLED],
  [TrainingSessionStatus.FINISHED]: [],
  [TrainingSessionStatus.CANCELLED]: []
};

/**
 * 创建训练 session
 */
function createTrainingSession(chatId, scenarioId, scenario) {
  // 检查是否已有 active session
  const existingSession = getActiveSession(chatId);
  if (existingSession) {
    throw new Error(`当前已有进行中的训练 session: ${existingSession.sessionId}`);
  }

  const sessionId = uuidv4();
  const now = new Date().toISOString();

  const session = {
    sessionId,
    chatId: String(chatId),
    scenarioId,
    scenario,
    conversation: [],
    round: 0,
    analysisHistory: [],
    status: TrainingSessionStatus.RUNNING,
    startedAt: now,
    endedAt: null,
    createdAt: now,
    updatedAt: now
  };

  sessions.set(sessionId, session);
  console.log(`[TrainingSession] 创建训练 session: ${sessionId} (chat: ${chatId}, scenario: ${scenarioId})`);

  return session;
}

/**
 * 获取 session
 */
function getTrainingSession(sessionId) {
  return sessions.get(sessionId) || null;
}

/**
 * 根据 chatId 获取 active session
 */
function getActiveSession(chatId) {
  const chatIdStr = String(chatId);
  
  for (const [sessionId, session] of sessions) {
    if (session.chatId === chatIdStr && 
        ![TrainingSessionStatus.FINISHED, TrainingSessionStatus.CANCELLED].includes(session.status)) {
      return session;
    }
  }
  
  return null;
}

/**
 * 更新 session 状态
 */
function updateSessionStatus(sessionId, newStatus) {
  const session = sessions.get(sessionId);
  if (!session) {
    throw new Error(`Session 不存在: ${sessionId}`);
  }

  // 验证状态流转
  const allowedTransitions = VALID_TRANSITIONS[session.status];
  if (!allowedTransitions.includes(newStatus)) {
    throw new Error(`非法状态流转: ${session.status} -> ${newStatus}，允许的流转: ${allowedTransitions.join(', ') || '无'}`);
  }

  const oldStatus = session.status;
  session.status = newStatus;
  session.updatedAt = new Date().toISOString();

  if (newStatus === TrainingSessionStatus.FINISHED || newStatus === TrainingSessionStatus.CANCELLED) {
    session.endedAt = new Date().toISOString();
  }

  console.log(`[TrainingSession] 状态变更: ${sessionId} [${oldStatus} -> ${newStatus}]`);

  return session;
}

/**
 * 添加用户消息到 conversation
 */
function addUserMessage(sessionId, message) {
  const session = sessions.get(sessionId);
  if (!session) {
    throw new Error(`Session 不存在: ${sessionId}`);
  }

  session.conversation.push({
    role: 'user',
    content: message,
    _meta: {
      turnIndex: session.round,
      ts: new Date().toISOString()
    }
  });

  session.updatedAt = new Date().toISOString();
  console.log(`[TrainingSession] 添加用户消息 (round ${session.round}): ${message.substring(0, 50)}...`);

  return session;
}

/**
 * 添加客服消息到 conversation
 */
function addAgentMessage(sessionId, message) {
  const session = sessions.get(sessionId);
  if (!session) {
    throw new Error(`Session 不存在: ${sessionId}`);
  }

  session.conversation.push({
    role: 'agent',
    content: message,
    _meta: {
      turnIndex: session.round,
      ts: new Date().toISOString()
    }
  });

  session.updatedAt = new Date().toISOString();
  console.log(`[TrainingSession] 添加客服消息 (round ${session.round}): ${message.substring(0, 50)}...`);

  return session;
}

/**
 * 保存分析结果
 */
function saveAnalysisResult(sessionId, analysisResult) {
  const session = sessions.get(sessionId);
  if (!session) {
    throw new Error(`Session 不存在: ${sessionId}`);
  }

  session.analysisHistory.push({
    round: session.round,
    result: analysisResult,
    timestamp: new Date().toISOString()
  });

  session.updatedAt = new Date().toISOString();
  console.log(`[TrainingSession] 保存分析结果 (round ${session.round}): riskLevel=${analysisResult.riskLevel}`);

  return session;
}

/**
 * 增加轮次
 */
function incrementRound(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) {
    throw new Error(`Session 不存在: ${sessionId}`);
  }

  session.round += 1;
  session.updatedAt = new Date().toISOString();
  console.log(`[TrainingSession] 轮次增加: ${session.round - 1} -> ${session.round}`);

  return session;
}

/**
 * 获取训练摘要
 */
function getTrainingSummary(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) {
    throw new Error(`Session 不存在: ${sessionId}`);
  }

  const totalRounds = session.round;
  const analysisHistory = session.analysisHistory;
  
  // 统计风险等级
  const riskLevelCount = { high: 0, medium: 0, low: 0, none: 0 };
  analysisHistory.forEach(item => {
    const riskLevel = item.result.riskLevel || 'none';
    riskLevelCount[riskLevel] = (riskLevelCount[riskLevel] || 0) + 1;
  });

  // 提取主要问题
  const issues = [];
  analysisHistory.forEach(item => {
    // 分析结果保存在 item.result 中
    const analysisResult = item.result || {};
    // issues 可能是字符串数组或对象数组
    const issueList = analysisResult.issues || [];
    if (issueList.length > 0) {
      issues.push(...issueList.map(issue => ({
        round: item.round,
        message: typeof issue === 'string' ? issue : (issue.message || '未知问题')
      })));
    }
  });

  // 提取优点
  const strengths = [];
  analysisHistory.forEach(item => {
    // 分析结果保存在 item.result 中
    const analysisResult = item.result || {};
    // strengths 是字符串数组
    const strengthList = analysisResult.strengths || [];
    if (strengthList.length > 0) {
      strengths.push(...strengthList.map(s => ({ round: item.round, text: s })));
    }
  });

  // 生成改进建议
  const suggestions = [];
  if (riskLevelCount.high > 0) {
    suggestions.push('需要重点关注高风险回复，避免不当表达');
  }
  if (issues.length > 0) {
    suggestions.push(`共发现 ${issues.length} 个问题，建议逐一改进`);
  }
  if (strengths.length === 0) {
    suggestions.push('未检测到明显优点，建议加强回复质量');
  }

  return {
    sessionId: session.sessionId,
    scenarioId: session.scenarioId,
    scenarioTitle: session.scenario?.title || '未知场景',
    status: session.status,
    totalRounds,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    riskLevelDistribution: riskLevelCount,
    issues,
    strengths,
    suggestions,
    conversation: session.conversation
  };
}

/**
 * 清理已结束或已取消的 session
 */
function cleanupOldSessions() {
  const now = Date.now();
  const maxAge = 24 * 60 * 60 * 1000; // 24小时

  for (const [sessionId, session] of sessions) {
    if (session.status === TrainingSessionStatus.FINISHED || 
        session.status === TrainingSessionStatus.CANCELLED) {
      const endedAt = new Date(session.endedAt).getTime();
      if (now - endedAt > maxAge) {
        sessions.delete(sessionId);
        console.log(`[TrainingSession] 清理旧 session: ${sessionId}`);
      }
    }
  }
}

/**
 * 获取所有 session（用于调试）
 */
function getAllSessions() {
  return Array.from(sessions.values());
}

/**
 * 获取 session 数量
 */
function size() {
  return sessions.size;
}

module.exports = {
  TrainingSessionStatus,
  createTrainingSession,
  getTrainingSession,
  getActiveSession,
  updateSessionStatus,
  addUserMessage,
  addAgentMessage,
  saveAnalysisResult,
  incrementRound,
  getTrainingSummary,
  cleanupOldSessions,
  getAllSessions,
  size
};
