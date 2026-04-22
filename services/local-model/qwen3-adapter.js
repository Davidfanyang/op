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

// ========================
// Prompt 构造函数（固化 full + system_user 模式）
// ========================

/**
 * 构建 Qwen3 质量评估 prompt
 * 
 * @param {Object} input - 输入数据
 * @param {string} input.conversationText - 对话文本
 * @param {string} input.taskType - 任务类型（默认：quality_evaluation）
 * @returns {Array} messages 数组
 */
function buildQwen3EvaluationMessages(input) {
  const { conversationText, taskType = 'quality_evaluation' } = input;

  if (!conversationText || typeof conversationText !== 'string') {
    throw new Error('conversationText is required and must be a string');
  }

  // 仅支持质量评估任务
  if (taskType !== 'quality_evaluation') {
    throw new Error(`Unsupported taskType: ${taskType}. Only 'quality_evaluation' is supported.`);
  }

  const systemPrompt = `你是客服质量评估助手。请分析以下对话并以JSON格式输出评估结果。

输出JSON必须包含以下字段：
- score: 0-100的整数，表示客服回复质量评分
- problem_type: "known"或"unknown"，表示问题类型
- scenario: 字符串，表示识别到的场景
- issues: 数组，存在的问题列表
- missing_info: 数组，缺失的信息列表
- suggested_reply: 字符串，建议的客服回复
- confidence: 0.0-1.0的数字，表示评估置信度

严格要求：
1. 只输出合法JSON，不要任何解释、markdown或其他文本
2. 所有字段都必须存在且类型正确
3. score必须是整数
4. confidence必须在0到1之间`;

  const userPrompt = conversationText;

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ];
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
      // 1. 构建 prompt
      const messages = buildQwen3EvaluationMessages(input);

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
            replyRiskDetails: processedResult.replyRiskDetails
          },
          data: processedResult.data,
          retryCount: retryCount
        };
      }

      // 6. 失败 - 判断是否可重试
      const failureType = classifyFailure(null, processedResult);

      // 只有以下失败类型允许重试
      const retryableFailures = ['request_failed', 'timeout', 'empty_response'];
      
      if (!retryableFailures.includes(failureType) || retryCount >= maxRetries) {
        // 不可重试或已达最大重试次数
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
            replyRiskDetails: processedResult.replyRiskDetails
          },
          data: null,
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
  DEFAULT_CONFIG
};
