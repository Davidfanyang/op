/**
 * @status EXPERIMENTAL_MODULE
 * @line MAIN_EXPERIMENT_LINE
 * @stage CURRENT_STAGE_TARGET
 * @production false
 * @scope qwen3 local experiment only
 */

/**
 * Qwen3 Adapter - 基于 G4 验证通过的请求配置
 * 
 * 职责：
 * 1. 固化 G4 组请求参数（format: "json", num_predict: 1024）
 * 2. 构造请求 payload（full prompt + system_user 模式）
 * 3. 调用 Ollama /api/chat
 * 4. 使用 qwen3-json-utils.js 解析结果
 * 5. 输出统一 adapter 结果结构
 * 6. 对失败结果做分类归因
 * 7. 支持有限次数重试（最多 1 次）
 * 
 * 设计原则：
 * - 只固化已验证通过的配置
 * - adapter 只做适配，不做业务造假
 * - 独立模块，不污染主链路
 * - 结果必须可解释
 * - 必须可回退
 */

const http = require('http');
const { processQwenResponse } = require('./qwen3-json-utils');
const { calculateRuleBasedScore } = require('./qwen3-score-rules');
const { KnowledgeRetrievalService } = require('../knowledge-retrieval-service');

// ========================
// G4 固定配置（不允许随意修改）
// ========================

const DEFAULT_CONFIG = {
  model: 'qwen3:4b',
  format: 'json',           // 关键参数：矩阵验证 G4 组通过的核心
  stream: false,
  think: false,
  options: {
    temperature: 0,         // 追求稳定性
    num_predict: 1024       // G4 验证通过的档位
  }
};

const OLLAMA_HOST = 'localhost';
const OLLAMA_PORT = 11434;

// 最后一次知识检索的 IDs（用于日志）
let lastKnowledgeIds = [];

// ========================
// Prompt 构造函数（固化 full + system_user 模式）
// ========================

/**
 * 构建 Qwen3 质量评估 prompt
 * 
 * @param {Object} input - 输入数据
 * @param {string} input.conversationText - 对话文本
 * @param {string} input.taskType - 任务类型（默认：quality_evaluation）
 * @param {string} input.scenario - 场景标识（可选，用于知识检索）
 * @param {string} input.projectId - 项目标识（可选，用于知识检索）
 * @returns {Array} messages 数组
 */
async function buildQwen3EvaluationMessages(input) {
  const { conversationText, taskType = 'quality_evaluation', scenario, projectId } = input;

  if (!conversationText || typeof conversationText !== 'string') {
    throw new Error('conversationText is required and must be a string');
  }

  // 仅支持质量评估任务
  if (taskType !== 'quality_evaluation') {
    throw new Error(`Unsupported taskType: ${taskType}. Only 'quality_evaluation' is supported.`);
  }

  // 尝试检索知识
  let knowledgeText = '';
  let knowledgeIds = [];
  try {
    const retrievalService = new KnowledgeRetrievalService();
    const keyword = retrievalService.extractKeyword(conversationText);
    
    const retrievalResult = await retrievalService.retrieveAndFormat({
      scenario,
      projectId,
      keyword,
      maxResults: 3
    });
    
    knowledgeText = retrievalResult.knowledgeText || '';
    knowledgeIds = retrievalResult.knowledgeIds || [];
    
    // 保存到模块级变量，供日志使用
    lastKnowledgeIds = knowledgeIds;
  } catch (error) {
    console.warn('[Qwen3 Adapter] 知识检索失败（不影响主流程）:', error.message);
    lastKnowledgeIds = [];
  }

  const systemPrompt = `你是客服质量评估助手。请分析以下对话并以JSON格式输出评估结果。${knowledgeText}

输出JSON必须包含以下字段：
- score: 0-100的整数，表示客服回复质量评分
- problem_type: "known"或"unknown"，表示问题类型
- scenario: 字符串，表示识别到的场景
- issues: 数组，存在的问题列表
- missing_info: 数组，缺失的信息列表
- suggested_reply: 字符串，建议的客服回复
- risk_level: "low"、"medium"或"high"，表示风险等级
- confidence: 0.0-1.0的数字，表示评估置信度

=== problem_type 判定规则（极其重要）===

只要问题属于以下任意一种，必须判定为 known：
- 转账未到账
- 提现未到账
- 扣款失败但资金扣除
- 客服回复敷衍
- 信息未收集完整
- 支付相关咨询

只有在以下情况，才允许 unknown：
- 用户问题完全无法理解
- 无法识别业务类型
- 内容严重缺失无法判断

禁止：
- 因为"信息不足"就判 unknown
- 模糊情况下优先 unknown（这是错误行为）

=== 评分标准（必须严格遵守）===

【90-100分：优秀】
- 完整收集客户信息
- 明确给出处理路径和时间预期
- 语气专业且共情
- 无任何遗漏或错误

【80-89分：良好】
- 基本收集关键信息
- 给出处理方向但细节不足
- 语气礼貌
- 可能有1-2个小遗漏

【70-79分：及格】
- 收集了部分信息但不完整
- 处理路径模糊或未给时间预期
- 语气一般
- 存在3-4个遗漏

【60-69分：不及格】
- 信息收集严重不足
- 未给出明确处理路径
- 回复敷衍或模板化
- 存在5个以上遗漏

【0-59分：差】
- 完全未收集信息
- 无任何处理建议
- 回复敷衍、冷漠或错误
- 可能激化客户情绪

=== 强制压分规则（优先级高于其他规则）===

如果出现以下任一情况，score 必须 ≤ 69：
1. 客服回复敷衍（如"请稍等"、"我们核实一下"但无后续路径）
2. 未收集关键信息（如订单号、转账金额、时间等）
3. 未给出明确处理路径或时间预期
4. 客户表达不满但客服未共情或安抚
5. missing_info 数组长度 ≥ 3

如果 issues 数组长度 ≥ 5，score 必须 ≤ 59。

=== 分数一致性要求 ===

score 必须与 issues 和 missing_info 的数量、严重程度一致：
- issues 多且严重 → score 必须低
- missing_info 多 → score 必须低
- 不能出现"问题很多但分数很高"的矛盾

=== 风险等级定义 ===

- low: 回复基本无风险，客户情绪稳定
- medium: 回复存在一定风险，可能导致客户不满或问题升级
- high: 回复有严重风险，可能激化矛盾、引发投诉或造成损失

严格要求：
1. 只输出合法JSON，不要任何解释、文本或其他文本
2. 所有字段都必须存在且类型正确
3. score必须是整数，且严格遵守上述评分标准
4. risk_level 必须是 "low"、"medium" 或 "high" 之一
5. confidence必须在0到1之间`;

  const userPrompt = conversationText;

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ];
}

/**
 * 获取最后一次知识检索的 knowledge IDs（用于日志）
 */
function getLastKnowledgeIds() {
  return lastKnowledgeIds;
}

// ========================
// HTTP 请求
// ========================

/**
 * 发送 HTTP 请求到 Ollama
 * 
 * @param {string} path - API 路径
 * @param {Object} data - 请求数据
 * @param {number} timeoutMs - 超时时间（毫秒）
 * @returns {Promise<Object>} 响应数据
 */
function sendOllamaRequest(path, data, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: OLLAMA_HOST,
      port: OLLAMA_PORT,
      path: path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(JSON.stringify(data))
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(new Error(`JSON parse failed: ${error.message}\nRaw: ${body}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(new Error(`Request failed: ${error.message}`));
    });

    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.write(JSON.stringify(data));
    req.end();
  });
}

// ========================
// 构建请求 Payload
// ========================

/**
 * 构建 Ollama 请求 payload
 * 
 * @param {Array} messages - 消息数组
 * @param {Object} config - 配置对象
 * @returns {Object} 请求 payload
 */
function buildRequestPayload(messages, config = DEFAULT_CONFIG) {
  return {
    model: config.model,
    format: config.format,
    messages: messages,
    stream: config.stream,
    think: config.think,
    options: {
      temperature: config.options.temperature,
      num_predict: config.options.num_predict
    }
  };
}

// ========================
// 失败分类
// ========================

/**
 * 分类失败类型
 * 
 * @param {Error|null} requestError - 请求错误
 * @param {Object} processedResult - 处理结果
 * @returns {string} 失败类型
 */
function classifyFailure(requestError, processedResult) {
  // 请求级失败
  if (requestError) {
    if (requestError.message.includes('timeout')) {
      return 'timeout';
    }
    return 'request_failed';
  }

  // 处理级失败
  if (!processedResult) {
    return 'empty_response';
  }

  if (processedResult.failureType) {
    return processedResult.failureType;
  }

  if (!processedResult.success && processedResult.data === null) {
    return 'no_json_found';
  }

  return 'unknown_failure';
}

// ========================
// 主函数：evaluateWithQwen3Adapter
// ========================

/**
 * 使用 Qwen3 adapter 进行质量评估
 * 
 * @param {Object} input - 输入数据
 * @param {string} input.conversationText - 对话文本
 * @param {Object} options - 可选配置
 * @param {number} options.timeoutMs - 超时时间（毫秒），默认 30000
 * @param {number} options.maxRetries - 最大重试次数，默认 1
 * @returns {Promise<Object>} 评估结果
 */
async function evaluateWithQwen3Adapter(input, options = {}) {
  const {
    timeoutMs = 30000,
    maxRetries = 1
  } = options;

  // 验证输入
  if (!input || !input.conversationText) {
    return {
      success: false,
      failureType: 'invalid_input',
      error: 'conversationText is required',
      requestConfig: DEFAULT_CONFIG,
      rawResponse: null,
      processed: null,
      data: null,
      retryCount: 0
    };
  }

  let retryCount = 0;
  let lastError = null;
  let lastResponse = null;
  let lastProcessed = null;

  // 重试循环（最多 maxRetries 次）
  while (retryCount <= maxRetries) {
    try {
      // 1. 构建 prompt（现在是 async）
      const messages = await buildQwen3EvaluationMessages(input);

      // 2. 构建请求 payload
      const payload = buildRequestPayload(messages);

      // 3. 调用 Ollama
      const rawResponse = await sendOllamaRequest('/api/chat', payload, timeoutMs);
      lastResponse = rawResponse;

      // 4. 处理响应
      const processedResult = processQwenResponse(rawResponse);
      lastProcessed = processedResult;

      // 5. 判断是否成功
      if (processedResult.success && processedResult.data !== null) {
        // 计算规则化分数
        let processedScore = null;
        if (processedResult.data && processedResult.data.issues !== undefined && processedResult.data.missing_info !== undefined) {
          try {
            const ruleScoreResult = calculateRuleBasedScore(processedResult.data);
            processedScore = {
              qwen_raw_score: processedResult.data.score,
              rule_score: ruleScoreResult.score,
              base_score: ruleScoreResult.base_score,
              deductions: ruleScoreResult.deductions,
              meta: ruleScoreResult.meta
            };
          } catch (ruleError) {
            console.error('[Qwen3Adapter] Rule score calculation failed:', ruleError.message);
            // 规则计算失败不影响主流程，仍然返回 qwen 原始分数
            processedScore = {
              qwen_raw_score: processedResult.data.score,
              rule_score: null,
              base_score: null,
              deductions: [],
              error: ruleError.message
            };
          }
        }
        
        // 成功
        return {
          success: true,
          failureType: null,
          error: null,
          requestConfig: {
            model: DEFAULT_CONFIG.model,
            format: DEFAULT_CONFIG.format,
            num_predict: DEFAULT_CONFIG.options.num_predict,
            temperature: DEFAULT_CONFIG.options.temperature,
            think: DEFAULT_CONFIG.think
          },
          rawResponse: rawResponse,
          processed: {
            success: processedResult.success,
            selectedSource: processedResult.selectedSource,
            candidates: processedResult.candidates,
            truncated: processedResult.truncated,
            validationErrors: processedResult.validationErrors,
            replyRisk: processedResult.replyRisk,
            replyRiskDetails: processedResult.replyRiskDetails,
            data: processedResult.data,  // 保留解析数据，即使 suggested_reply 有风险
            processedScore: processedScore  // 新增：规则化评分
          },
          data: processedResult.data,
          processedScore: processedScore,  // 新增：规则化评分
          retryCount: retryCount
        };
      }

      // 6. 失败 - 判断是否可重试
      const failureType = classifyFailure(null, processedResult);

      // 只有以下失败类型允许重试
      const retryableFailures = ['request_failed', 'timeout', 'empty_response'];
      
      if (!retryableFailures.includes(failureType) || retryCount >= maxRetries) {
        // 不可重试或已达最大重试次数
        // 即使失败，如果 processed.data 存在，也计算规则分数
        let processedScore = null;
        if (processedResult.data && processedResult.data.issues !== undefined && processedResult.data.missing_info !== undefined) {
          try {
            const ruleScoreResult = calculateRuleBasedScore(processedResult.data);
            processedScore = {
              qwen_raw_score: processedResult.data.score,
              rule_score: ruleScoreResult.score,
              base_score: ruleScoreResult.base_score,
              deductions: ruleScoreResult.deductions,
              meta: ruleScoreResult.meta
            };
          } catch (ruleError) {
            console.error('[Qwen3Adapter] Rule score calculation failed:', ruleError.message);
          }
        }
        
        return {
          success: false,
          failureType: failureType,
          error: processedResult.error || 'Processing failed',
          requestConfig: {
            model: DEFAULT_CONFIG.model,
            format: DEFAULT_CONFIG.format,
            num_predict: DEFAULT_CONFIG.options.num_predict,
            temperature: DEFAULT_CONFIG.options.temperature,
            think: DEFAULT_CONFIG.think
          },
          rawResponse: rawResponse,
          processed: {
            success: processedResult.success,
            selectedSource: processedResult.selectedSource,
            candidates: processedResult.candidates,
            truncated: processedResult.truncated,
            validationErrors: processedResult.validationErrors,
            replyRisk: processedResult.replyRisk,
            replyRiskDetails: processedResult.replyRiskDetails,
            data: processedResult.data,  // 保留解析数据，即使 suggested_reply 有风险
            processedScore: processedScore  // 新增：规则化评分
          },
          data: processedResult.data,  // 修改：即使失败也返回 data（用于 shadow 对比）
          processedScore: processedScore,  // 新增：规则化评分
          retryCount: retryCount
        };
      }

      // 7. 可重试，继续下一轮
      retryCount++;
      lastError = new Error(processedResult.error || 'Processing failed');

    } catch (error) {
      lastError = error;

      // 判断是否可重试
      const failureType = classifyFailure(error, null);
      const retryableFailures = ['request_failed', 'timeout', 'empty_response'];

      if (!retryableFailures.includes(failureType) || retryCount >= maxRetries) {
        // 不可重试或已达最大重试次数
        return {
          success: false,
          failureType: failureType,
          error: error.message,
          requestConfig: {
            model: DEFAULT_CONFIG.model,
            format: DEFAULT_CONFIG.format,
            num_predict: DEFAULT_CONFIG.options.num_predict,
            temperature: DEFAULT_CONFIG.options.temperature,
            think: DEFAULT_CONFIG.think
          },
          rawResponse: lastResponse,
          processed: lastProcessed,
          data: null,
          retryCount: retryCount
        };
      }

      // 可重试，继续下一轮
      retryCount++;
    }
  }

  // 理论上不应该到这里，但以防万一
  return {
    success: false,
    failureType: classifyFailure(lastError, lastProcessed),
    error: lastError?.message || 'Unknown error',
    requestConfig: {
      model: DEFAULT_CONFIG.model,
      format: DEFAULT_CONFIG.format,
      num_predict: DEFAULT_CONFIG.options.num_predict,
      temperature: DEFAULT_CONFIG.options.temperature,
      think: DEFAULT_CONFIG.think
    },
    rawResponse: lastResponse,
    processed: lastProcessed,
    data: null,
    retryCount: retryCount
  };
}

// ========================
// 导出
// ========================

module.exports = {
  evaluateWithQwen3Adapter,
  buildQwen3EvaluationMessages,
  getLastKnowledgeIds,
  DEFAULT_CONFIG
};
