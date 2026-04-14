/**
 * Trainer v5.0 - 对话分析主链 (Orchestrator)
 * 
 * 新架构: 直接调用 analysis-pipeline
 * 主链: loadScenario -> detectScenario -> detectStage -> checkCurrentReply -> analyzeGaps -> buildFeedback
 * 
 * 统一输入结构:
 * {
 *   projectId: string,           // 项目ID (必填)
 *   mode: string,                // 'training' | 'live_monitor' (必填)
 *   conversation: Array,         // 对话历史 [{ role, text, ts? }] (必填)
 *   currentReply: string,        // 当前客服回复 (必填)
 *   metadata: object             // 元数据 (可选)
 * }
 * 
 * 统一输出结构:
 * {
 *   scenarioId: string,
 *   scenarioName: string,
 *   stage: string,
 *   result: "pass" | "borderline" | "fail" | "risk",
 *   riskLevel: "none" | "low" | "medium" | "high" | "critical",
 *   issues: string[],
 *   missing: string[],
 *   strengths: string[],
 *   nextAction: string,
 *   coachSummary: string,
 *   confidence: number,
 *   reviewStatus?: "pending" | "auto_pass" | "needs_review"
 * }
 */

const analysisPipeline = require('./analysis-pipeline');

// 默认配置
const DEFAULT_PROJECT = 'default';
const DEFAULT_MODE = 'training';

/**
 * 分析单轮对话 - 主要入口
 * @param {Object} input - 统一输入结构
 * @returns {Promise<Object>} 分析结果
 */
async function analyzeTurn(input) {
  // 1. 基础校验
  validateInput(input);

  // 2. 设置默认值
  const normalizedInput = {
    projectId: input.projectId || DEFAULT_PROJECT,
    mode: input.mode || DEFAULT_MODE,
    conversation: input.conversation,
    currentReply: input.currentReply,
    metadata: input.metadata || {}
  };

  // 3. 标准化对话格式(兼容旧格式)
  normalizedInput.conversation = normalizeConversation(normalizedInput.conversation);

  // 4. 调用 analysis pipeline
  return analysisPipeline.analyzeTurn(normalizedInput);
}

/**
 * 分析完整对话(多轮)
 * @param {Object} input - 统一输入结构
 * @returns {Promise<Object>} 对话整体分析结果
 */
async function analyzeConversation(input) {
  // 1. 基础校验
  validateInput(input, false);

  // 2. 设置默认值
  const normalizedInput = {
    projectId: input.projectId || DEFAULT_PROJECT,
    mode: input.mode || DEFAULT_MODE,
    conversation: input.conversation,
    metadata: input.metadata || {}
  };

  // 3. 标准化对话格式
  normalizedInput.conversation = normalizeConversation(normalizedInput.conversation);

  // 4. 调用 analysis pipeline
  return analysisPipeline.analyzeConversation(normalizedInput);
}

// 向后兼容旧接口
async function evaluateTraining(input) {
  // 兼容旧接口: 构造 conversation
  if (!input.conversation) {
    input.conversation = [
      {
        role: 'customer',
        text: input.customerMessage || input.customerIntent || '',
        ts: new Date().toISOString()
      },
      {
        role: 'agent',
        text: input.userReply,
        ts: new Date().toISOString()
      }
    ];
    input.currentReply = input.userReply;
  }

  return analyzeTurn(input);
}

/**
 * 校验输入
 */
function validateInput(input, requireCurrentReply = true) {
  if (!input || typeof input !== 'object') {
    throw new Error('INVALID_INPUT: input 必须是对象');
  }

  if (!input.conversation || !Array.isArray(input.conversation)) {
    throw new Error('INVALID_INPUT: 缺少 conversation 数组');
  }

  if (requireCurrentReply && (!input.currentReply || typeof input.currentReply !== 'string')) {
    throw new Error('INVALID_INPUT: 缺少 currentReply');
  }

  if (input.mode && !['training', 'live_monitor'].includes(input.mode)) {
    throw new Error('INVALID_INPUT: mode 必须是 "training" 或 "live_monitor"');
  }
}

/**
 * 标准化对话格式
 */
function normalizeConversation(conversation) {
  return conversation.map((turn, index) => ({
    turnIndex: index,
    role: turn.role,
    text: turn.text || turn.content || '',
    ts: turn.ts || turn.timestamp || new Date().toISOString()
  }));
}

module.exports = { 
  analyzeTurn, 
  analyzeConversation,
  evaluateTraining // 向后兼容
};
