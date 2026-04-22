/**
 * @status EXPERIMENTAL_MODULE
 * @line MAIN_EXPERIMENT_LINE
 * @stage CURRENT_STAGE_TARGET
 * @production false
 * @scope qwen3 local experiment only
 */

/**
 * Qwen3 JSON 输出适配工具 - 修正版
 * 
 * 职责：
 * 1. 从多来源提取候选文本
 * 2. 扫描多个 JSON 候选对象
 * 3. 选择最佳 JSON 候选
 * 4. 识别输出截断
 * 5. 校验 JSON 结构
 * 6. 检查回复风险
 * 
 * 设计原则：
 * - 不提前下结论
 * - 保留所有候选
 * - 失败可归因
 * - 证据可复盘
 */

// ========================
// 1. 多来源文本抽取
// ========================

/**
 * 从 Ollama 响应中提取所有可用文本来源
 * 
 * @param {Object} payload - Ollama API 响应
 * @returns {Array<{source: string, text: string}>} 候选文本列表
 */
function extractCandidateTexts(payload) {
  if (!payload || typeof payload !== 'object') {
    return [];
  }

  const candidates = [];
  const seen = new Set();

  // 定义所有可能的来源
  const sources = [
    {
      key: 'message.content',
      getValue: () => payload.message?.content
    },
    {
      key: 'response',
      getValue: () => payload.response
    },
    {
      key: 'message.thinking',
      getValue: () => payload.message?.thinking
    },
    {
      key: 'thinking',
      getValue: () => payload.thinking
    }
  ];

  // 收集所有非空文本
  for (const source of sources) {
    try {
      const value = source.getValue();
      if (value && typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed.length > 0) {
          // 去重：相同文本只保留一次
          if (!seen.has(trimmed)) {
            seen.add(trimmed);
            candidates.push({
              source: source.key,
              text: trimmed
            });
          }
        }
      }
    } catch (error) {
      // 继续尝试下一个来源
    }
  }

  return candidates;
}

// ========================
// 2. JSON 候选提取
// ========================

/**
 * 从文本中提取所有可能的 JSON 对象候选
 * 
 * @param {string} text - 输入文本
 * @returns {Array<{jsonText: string, index: number, parsed: Object|null}>} JSON 候选列表
 */
function extractJsonCandidates(text) {
  if (!text || typeof text !== 'string') {
    return [];
  }

  const candidates = [];
  let searchIndex = 0;

  // 扫描所有可能的 { 起点
  while (searchIndex < text.length) {
    const braceIndex = text.indexOf('{', searchIndex);
    if (braceIndex === -1) {
      break;
    }

    // 从这个 { 开始尝试找到匹配的 }
    const jsonResult = tryExtractJsonFromIndex(text, braceIndex);
    
    if (jsonResult) {
      candidates.push({
        jsonText: jsonResult.text,
        index: braceIndex,
        parsed: jsonResult.parsed
      });
      
      // 继续搜索下一个可能的起点
      searchIndex = braceIndex + 1;
    } else {
      // 这个 { 不是合法 JSON 起点，继续
      searchIndex = braceIndex + 1;
    }
  }

  return candidates;
}

/**
 * 从指定位置尝试提取 JSON 对象
 * 
 * @param {string} text - 完整文本
 * @param {number} startIndex - { 的位置
 * @returns {{text: string, parsed: Object}|null}
 */
function tryExtractJsonFromIndex(text, startIndex) {
  if (text[startIndex] !== '{') {
    return null;
  }

  let braceCount = 0;
  let inString = false;
  let escapeNext = false;

  for (let i = startIndex; i < text.length; i++) {
    const char = text[i];

    // 处理转义
    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === '\\' && inString) {
      escapeNext = true;
      continue;
    }

    // 处理字符串边界
    if (char === '"') {
      inString = !inString;
      continue;
    }

    // 只在非字符串状态下计算大括号
    if (!inString) {
      if (char === '{') {
        braceCount++;
      } else if (char === '}') {
        braceCount--;
        
        if (braceCount === 0) {
          // 找到匹配的 }，尝试解析
          const jsonStr = text.substring(startIndex, i + 1);
          
          try {
            const parsed = JSON.parse(jsonStr);
            return {
              text: jsonStr,
              parsed: parsed
            };
          } catch (error) {
            // 不是合法 JSON，继续尝试
            return null;
          }
        }
      }
    }
  }

  // 未找到匹配的 }
  return null;
}

/**
 * 从候选列表中选择最佳 JSON 对象
 * 
 * 选择优先级：
 * 1. 字段最完整的（包含更多必填字段）
 * 2. 更接近必填结构的
 * 3. 长度更合理的（不太短，不太长）
 * 4. 位置更靠后的（避免前面的示例型 JSON）
 * 
 * @param {Array} candidates - JSON 候选列表
 * @returns {{jsonText: string, parsed: Object}|null}
 */
function pickBestJsonCandidate(candidates) {
  if (!candidates || candidates.length === 0) {
    return null;
  }

  // 必填字段定义
  const requiredFields = ['score', 'problem_type', 'scenario', 'issues', 'missing_info', 'suggested_reply', 'confidence'];

  // 为每个候选计算得分
  const scored = candidates.map(candidate => {
    const parsed = candidate.parsed;
    if (!parsed || typeof parsed !== 'object') {
      return { ...candidate, score: 0 };
    }

    let score = 0;

    // 1. 字段完整性（权重最高）
    const fieldCount = requiredFields.filter(field => field in parsed).length;
    score += fieldCount * 100;

    // 2. 字段类型正确性
    if (typeof parsed.score === 'number') score += 10;
    if (['known', 'unknown'].includes(parsed.problem_type)) score += 10;
    if (typeof parsed.scenario === 'string') score += 10;
    if (Array.isArray(parsed.issues)) score += 10;
    if (Array.isArray(parsed.missing_info)) score += 10;
    if (typeof parsed.suggested_reply === 'string') score += 10;
    if (typeof parsed.confidence === 'number') score += 10;

    // 3. 长度合理性（避免太短或太长）
    const jsonLength = candidate.jsonText.length;
    if (jsonLength > 50 && jsonLength < 2000) {
      score += 5;
    }

    // 4. 位置更靠后（权重较低）
    score += Math.min(candidate.index / 100, 10);

    return { ...candidate, score };
  });

  // 选择得分最高的
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];

  // 只返回有意义的候选（至少有一些字段）
  if (best.score > 0) {
    return {
      jsonText: best.jsonText,
      parsed: best.parsed
    };
  }

  return null;
}

// ========================
// 3. 截断检测
// ========================

/**
 * 检测响应是否被截断
 * 
 * @param {Object} payload - Ollama 响应
 * @param {string} text - 提取的文本
 * @returns {{truncated: boolean, reason: string}}
 */
function detectTruncation(payload, text) {
  const result = {
    truncated: false,
    reason: null
  };

  // 1. 检查 done_reason
  if (payload && payload.done_reason === 'length') {
    result.truncated = true;
    result.reason = 'done_reason_is_length';
    return result;
  }

  // 2. 检查未闭合的大括号
  if (text && typeof text === 'string') {
    let braceCount = 0;
    let inString = false;
    let escapeNext = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];

      if (escapeNext) {
        escapeNext = false;
        continue;
      }

      if (char === '\\' && inString) {
        escapeNext = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (!inString) {
        if (char === '{') {
          braceCount++;
        } else if (char === '}') {
          braceCount--;
        }
      }
    }

    if (braceCount > 0) {
      result.truncated = true;
      result.reason = `unclosed_braces_count_${braceCount}`;
      return result;
    }
  }

  return result;
}

// ========================
// 4. JSON 结构校验
// ========================

/**
 * 校验 Qwen JSON 输出的字段结构
 * 
 * @param {Object} data - 解析后的 JSON 对象
 * @returns {{valid: boolean, fieldErrors: Array<string>}}
 */
function validateQwenJsonShape(data) {
  const result = {
    valid: true,
    fieldErrors: []
  };

  if (!data || typeof data !== 'object') {
    result.valid = false;
    result.fieldErrors.push('data must be an object');
    return result;
  }

  // score: number, integer, 0-100
  if ('score' in data) {
    if (typeof data.score !== 'number') {
      result.fieldErrors.push('score must be number');
      result.valid = false;
    } else if (!Number.isInteger(data.score)) {
      result.fieldErrors.push('score must be integer');
      result.valid = false;
    } else if (data.score < 0 || data.score > 100) {
      result.fieldErrors.push('score must be in range 0-100');
      result.valid = false;
    }
  }

  // problem_type: 'known' or 'unknown'
  if ('problem_type' in data) {
    if (!['known', 'unknown'].includes(data.problem_type)) {
      result.fieldErrors.push('problem_type must be "known" or "unknown"');
      result.valid = false;
    }
  }

  // scenario: string, non-empty
  if ('scenario' in data) {
    if (typeof data.scenario !== 'string') {
      result.fieldErrors.push('scenario must be string');
      result.valid = false;
    } else if (data.scenario.trim().length === 0) {
      result.fieldErrors.push('scenario must not be empty');
      result.valid = false;
    }
  }

  // issues: array
  if ('issues' in data) {
    if (!Array.isArray(data.issues)) {
      result.fieldErrors.push('issues must be array');
      result.valid = false;
    }
  }

  // missing_info: array
  if ('missing_info' in data) {
    if (!Array.isArray(data.missing_info)) {
      result.fieldErrors.push('missing_info must be array');
      result.valid = false;
    }
  }

  // suggested_reply: string
  if ('suggested_reply' in data) {
    if (typeof data.suggested_reply !== 'string') {
      result.fieldErrors.push('suggested_reply must be string');
      result.valid = false;
    }
  }

  // confidence: number, 0-1
  if ('confidence' in data) {
    if (typeof data.confidence !== 'number') {
      result.fieldErrors.push('confidence must be number');
      result.valid = false;
    } else if (data.confidence < 0 || data.confidence > 1) {
      result.fieldErrors.push('confidence must be in range 0-1');
      result.valid = false;
    }
  }

  return result;
}

// ========================
// 5. 回复风险检查
// ========================

/**
 * 检查 suggested_reply 的风险
 * 
 * @param {string} text - 回复文本
 * @returns {{risk: string, riskDetails: Array<string>}}
 */
function checkSuggestedReplyRisk(text) {
  const result = {
    risk: 'no_obvious_risk',
    riskDetails: []
  };

  if (!text || typeof text !== 'string') {
    return result;
  }

  const lowerText = text.toLowerCase();

  // 1. 到账承诺
  const arrivalPromises = [
    '已到账', '已经到账', '马上到账', '立即到账', '即刻到账',
    '已经打款', '已经转账', '已打款', '已转账'
  ];
  
  for (const phrase of arrivalPromises) {
    if (text.includes(phrase)) {
      result.risk = 'risky_reply_detected';
      result.riskDetails.push(`到账承诺: "${phrase}"`);
    }
  }

  // 2. 无依据时效承诺
  const timePromises = [
    '1-3个工作日', '一到三个工作日', '三个工作日内',
    '稍后自动到账', '自动到账', '会自动处理',
    '很快会处理完成', '很快就会处理', '马上处理完成',
    '24小时内', '一个工作日内'
  ];

  for (const phrase of timePromises) {
    if (text.includes(phrase)) {
      result.risk = 'risky_reply_detected';
      result.riskDetails.push(`时效承诺: "${phrase}"`);
    }
  }

  // 3. 无依据材料要求
  const materialRequests = [
    '请提供身份证', '请上传身份证', '需要身份证',
    '请提供银行卡', '请上传银行卡', '需要银行卡',
    '请提供手机号码和实名资料', '请提供手机号',
    '请提供密码', '请输入密码'
  ];

  for (const phrase of materialRequests) {
    if (text.includes(phrase)) {
      result.risk = 'risky_reply_detected';
      result.riskDetails.push(`材料要求: "${phrase}"`);
    }
  }

  // 4. 无依据核实结论
  const verificationClaims = [
    '我们已经核实', '已核实', '系统显示正常', '系统正常',
    '对方账户异常', '账户异常', '平台已确认', '已确认',
    '查询到异常', '发现异常', '确实存在问题'
  ];

  for (const phrase of verificationClaims) {
    if (text.includes(phrase)) {
      result.risk = 'risky_reply_detected';
      result.riskDetails.push(`核实结论: "${phrase}"`);
    }
  }

  return result;
}

// ========================
// 6. 主处理流程
// ========================

/**
 * 完整处理 Qwen3 响应
 * 
 * @param {Object} ollamaResponse - Ollama API 响应
 * @returns {Object} 处理结果
 */
function processQwenResponse(ollamaResponse) {
  const result = {
    success: false,
    failureType: null,
    error: null,
    sourceTried: [],
    selectedSource: null,
    raw: null,
    cleaned: null,
    candidates: [],
    data: null,
    truncated: false,
    truncationReason: null,
    validationErrors: [],
    replyRisk: null,
    replyRiskDetails: []
  };

  // 1. 提取候选文本
  const textCandidates = extractCandidateTexts(ollamaResponse);
  result.sourceTried = textCandidates.map(c => c.source);

  if (textCandidates.length === 0) {
    result.failureType = 'empty_response';
    result.error = 'no text sources available';
    return result;
  }

  // 2. 检测截断
  const truncation = detectTruncation(ollamaResponse, textCandidates[0]?.text);
  result.truncated = truncation.truncated;
  result.truncationReason = truncation.reason;

  // 3. 尝试从每个候选文本中提取 JSON
  let bestCandidate = null;
  let selectedSource = null;

  for (const candidate of textCandidates) {
    const jsonCandidates = extractJsonCandidates(candidate.text);
    
    if (jsonCandidates.length > 0) {
      const picked = pickBestJsonCandidate(jsonCandidates);
      
      if (picked && (!bestCandidate || picked.score > (bestCandidate.score || 0))) {
        bestCandidate = picked;
        selectedSource = candidate.source;
        
        // 保存所有候选用于诊断
        result.candidates = jsonCandidates.map(c => ({
          source: candidate.source,
          index: c.index,
          length: c.jsonText.length,
          hasParsed: c.parsed !== null
        }));
      }
    }
  }

  result.selectedSource = selectedSource;

  // 4. 处理结果
  if (!bestCandidate) {
    // 没有找到合法 JSON
    if (result.truncated) {
      result.failureType = 'truncated_output';
      result.error = `output truncated (${truncation.reason}), no valid JSON found`;
    } else {
      result.failureType = 'no_json_found';
      result.error = 'no valid JSON object found in response';
    }
    
    result.raw = textCandidates[0]?.text;
    return result;
  }

  // 找到 JSON 候选
  result.raw = bestCandidate.jsonText;
  result.data = bestCandidate.parsed;

  // 5. 校验 JSON 结构
  const validation = validateQwenJsonShape(bestCandidate.parsed);
  result.validationErrors = validation.fieldErrors;

  if (!validation.valid) {
    result.failureType = 'invalid_fields';
    result.error = 'JSON parsed but field validation failed';
    return result;
  }

  // 6. 检查回复风险
  const riskCheck = checkSuggestedReplyRisk(bestCandidate.parsed.suggested_reply);
  result.replyRisk = riskCheck.risk;
  result.replyRiskDetails = riskCheck.riskDetails;

  // 7. 最终判断
  if (result.truncated) {
    // 即使解析成功，截断也是高风险
    result.success = false;
    result.failureType = 'truncated_output';
    result.error = 'JSON parsed successfully but output was truncated (high-risk)';
    return result;
  }

  // 检查是否有风险回复
  if (riskCheck.risk === 'risky_reply_detected') {
    result.success = false;
    result.failureType = 'risky_suggested_reply';
    result.error = 'JSON parsed but suggested_reply contains risky claims';
    return result;
  }

  // 完全通过
  result.success = true;
  result.failureType = null;
  result.error = null;

  return result;
}

// ========================
// 导出
// ========================

module.exports = {
  extractCandidateTexts,
  extractJsonCandidates,
  pickBestJsonCandidate,
  detectTruncation,
  validateQwenJsonShape,
  checkSuggestedReplyRisk,
  processQwenResponse
};
