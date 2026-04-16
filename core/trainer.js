/**
 * Trainer v5.2 - 对话分析主链 (Orchestrator)
 * 
 * 架构: 直接调用 analysis-pipeline
 * 主链: loadScenario -> detectScenario -> detectStage -> checkCurrentReply -> analyzeGaps -> buildFeedback
 * 
 * 输入协议: v1.0（标准协议，仅支持标准格式）
 * 标准协议结构:
 * {
 *   project: string,           // 项目标识（必填）
 *   conversation: array,       // 多轮对话 [{role: "user"|"agent", content: string, _meta?}]（必填）
 *   current_reply: string,     // 当前客服回复（必填）
 *   metadata: object,          // 元数据 {source, session_id, agent_id, timestamp, entry_type}（必填）
 *   rules: object              // 规则对象（必填，无规则时传 {}）
 * }
 * 
 * 输出结构:
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
const { validateProtocol } = require('./protocol-validator');
const { loadRules } = require('./rule-loader');

// 默认配置
const DEFAULT_PROJECT = 'default';
const DEFAULT_MODE = 'training';

/**
 * 协议标准化：确保输入符合标准协议 v1.0
 * 仅支持标准协议字段，不再兼容旧字段
 * 
 * @param {Object} input - 标准协议输入对象
 * @returns {Object} 标准化后的协议对象
 */
function normalizeToProtocol(input) {
  return {
    // 1. project（必填）
    project: input.project || DEFAULT_PROJECT,
    
    // 2. conversation（标准化 role 和 content）
    conversation: normalizeConversation(input.conversation),
    
    // 3. current_reply（必填）
    current_reply: input.current_reply || '',
    
    // 4. metadata（标准化字段名，补充缺失字段）
    metadata: normalizeMetadata(input.metadata),
    
    // 5. rules（加载或传入规则对象）
    rules: input.rules || loadRules(input.project || DEFAULT_PROJECT)
  };
}

/**
 * 标准化 conversation
 * - role: "customer" → "user"（兼容旧格式）
 * - 保留 _meta 元数据
 */
function normalizeConversation(conversation) {
  if (!Array.isArray(conversation)) {
    return [];
  }
  
  return conversation.map((turn, index) => ({
    role: turn.role === 'customer' ? 'user' : (turn.role || 'unknown'),
    content: turn.content || '',
    _meta: turn._meta || {
      turnIndex: index,
      ts: new Date().toISOString()
    }
  }));
}

/**
 * 标准化 metadata
 * - 补充缺失的必填字段
 * - 保留扩展字段
 */
function normalizeMetadata(metadata = {}) {
  return {
    // source: 必填
    source: metadata.source || 'unknown',
    
    // session_id: 必填
    session_id: metadata.session_id || `session_${Date.now()}`,
    
    // agent_id: 必填
    agent_id: metadata.agent_id || 'unknown',
    
    // timestamp: 必填
    timestamp: metadata.timestamp || new Date().toISOString(),
    
    // entry_type: 必填
    entry_type: metadata.entry_type || DEFAULT_MODE,
    
    // 保留其他扩展字段
    ...metadata
  };
}

/**
 * 分析单轮对话 - 主要入口
 * @param {Object} input - 输入对象（支持旧字段和新字段）
 * @returns {Promise<Object>} 分析结果
 */
async function analyzeTurn(input) {
  // 1. 基础校验（支持旧字段，向后兼容）
  validateInput(input);

  // 2. 转换为标准协议
  const protocolInput = normalizeToProtocol(input);
  
  // 3. 校验标准协议（向后兼容期间：仅记录调试日志，不阻塞）
  // 注意：阶段4删除旧字段兼容后，可改为严格校验
  if (process.env.NODE_ENV === 'development' || process.env.DEBUG_PROTOCOL) {
    try {
      validateProtocol(protocolInput);
    } catch (err) {
      // 仅在调试模式下输出警告
      console.debug(`[Trainer] 协议校验警告: ${err.message}`);
    }
  }

  // 4. 调用 analysis pipeline（传入标准协议）
  return analysisPipeline.analyzeTurn(protocolInput);
}

/**
 * 分析完整对话(多轮)
 * @param {Object} input - 输入对象（支持旧字段和新字段）
 * @returns {Promise<Object>} 对话整体分析结果
 */
async function analyzeConversation(input) {
  // 1. 基础校验（支持旧字段，向后兼容）
  validateInput(input, false);

  // 2. 转换为标准协议
  const protocolInput = normalizeToProtocol(input);
  
  // 3. 校验标准协议（向后兼容期间：仅记录调试日志，不阻塞）
  if (process.env.NODE_ENV === 'development' || process.env.DEBUG_PROTOCOL) {
    try {
      validateProtocol(protocolInput);
    } catch (err) {
      console.debug(`[Trainer] 协议校验警告: ${err.message}`);
    }
  }

  // 4. 调用 analysis pipeline（传入标准协议）
  return analysisPipeline.analyzeConversation(protocolInput);
}

// 向后兼容旧接口
async function evaluateTraining(input) {
  // 设置默认 projectId
  if (!input || typeof input !== 'object') {
    throw new Error('INVALID_INPUT: input 必须是对象');
  }
  
  if (!input.projectId && !input.project) {
    input.projectId = DEFAULT_PROJECT;
  }
  
  // 兼容旧接口: 构造 conversation
  if (!input.conversation) {
    const customerMsg = input.customerMessage || input.customerIntent || '';
    const agentReply = input.userReply || '';
    
    // 构造对话历史
    input.conversation = [];
    if (customerMsg) {
      input.conversation.push({
        role: 'customer',
        text: customerMsg,
        ts: new Date().toISOString()
      });
    }
    input.conversation.push({
      role: 'agent',
      text: agentReply,
      ts: new Date().toISOString()
    });
    
    input.currentReply = agentReply;
  }

  return analyzeTurn(input);
}

/**
 * 校验输入（仅支持标准协议）
 */
function validateInput(input, requireCurrentReply = true) {
  if (!input || typeof input !== 'object') {
    throw new Error('INVALID_INPUT: input 必须是对象');
  }

  // project 必填
  if (!input.project) {
    throw new Error('INVALID_INPUT: 缺少 project');
  }

  if (!input.conversation || !Array.isArray(input.conversation)) {
    throw new Error('INVALID_INPUT: 缺少 conversation 数组');
  }

  if (requireCurrentReply && !input.current_reply) {
    throw new Error('INVALID_INPUT: 缺少 current_reply');
  }
}

module.exports = { 
  analyzeTurn, 
  analyzeConversation,
  evaluateTraining, // 向后兼容
  
  // 协议相关（新增）
  normalizeToProtocol,
  normalizeConversation,
  normalizeMetadata,
  validateProtocol: require('./protocol-validator').validateProtocol
};
