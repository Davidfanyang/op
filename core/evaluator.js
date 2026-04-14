/**
 * Evaluator v5.0 - 对话分析器统一入口
 * 
 * 新架构: analysis pipeline (无分数计算)
 * 主链: loadScenario -> detectScenario -> detectStage -> checkCurrentReply -> analyzeGaps -> buildFeedback
 * 
 * 核心变更:
 * - 完全移除 score pipeline
 * - 使用 analysis-pipeline 作为核心
 * - 严格遵循新输入输出 schema
 */

const analysisPipeline = require('./analysis-pipeline');

/**
 * 分析单轮对话 - 新主入口
 * 
 * @param {Object} input - 输入参数
 * @param {string} input.projectId - 项目ID
 * @param {string} input.mode - 模式: "training" | "live_monitor"
 * @param {Array} input.conversation - 对话历史 [{ role, text, ts? }]
 * @param {string} input.currentReply - 当前客服回复
 * @param {Object} [input.metadata] - 元数据
 * 
 * @returns {Promise<Object>} 分析结果
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
async function analyzeTurn(input) {
  return analysisPipeline.analyzeTurn(input);
}

/**
 * 分析完整对话(多轮)
 * 
 * @param {Object} input - 输入参数
 * @param {string} input.projectId - 项目ID
 * @param {string} input.mode - 模式
 * @param {Array} input.conversation - 完整对话历史
 * @param {Object} [input.metadata] - 元数据
 * 
 * @returns {Promise<Object>} 对话整体分析结果
 */
async function analyzeConversation(input) {
  return analysisPipeline.analyzeConversation(input);
}

// 向后兼容(旧接口适配)
async function evaluateReply(userReply, scenario) {
  // 兼容旧接口: 构造新格式输入
  const conversation = [
    {
      role: 'customer',
      text: scenario.customerMessage || scenario.customerIntent || '',
      ts: new Date().toISOString()
    },
    {
      role: 'agent',
      text: userReply,
      ts: new Date().toISOString()
    }
  ];

  return analyzeTurn({
    projectId: 'default',
    mode: 'training',
    conversation,
    currentReply: userReply,
    metadata: { scenarioId: scenario.id }
  });
}

module.exports = { 
  analyzeTurn, 
  analyzeConversation,
  evaluateReply // 向后兼容
};
