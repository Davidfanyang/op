const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { runFallbackRoute } = require('./router-fallback');

const envPath = path.resolve(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const LOCAL_MODEL_API = 'http://localhost:8001/score';

function buildPrompt(payload) {
  const { scenario, ruleResult } = payload;
  const safeScenario = scenario || {};
  const findingsText = JSON.stringify(ruleResult.findings || [], null, 2);
  const mustCollect = JSON.stringify(safeScenario.mustCollect || [], null, 2);
  const shouldAvoid = JSON.stringify(safeScenario.qualityChecks?.shouldAvoid || [], null, 2);

  return `你是客服训练系统中的 AI 教练模块（AI Coach）。

你的任务不是自由发挥，而是基于给定业务规则，对客服回复进行纠错、指导和标准化改写。

【输入信息】
场景标题：${safeScenario.title || 'unknown_scenario'}
客户问题：${safeScenario.customerMessage || ''}
用户原回复：${ruleResult.originalReply || ''}
错误标签（来自规则评估器，包含 code 与 message）：${findingsText}
必须收集的信息：${mustCollect}
禁止内容：${shouldAvoid}
标准回复参考：${safeScenario.standardReply || ''}

【严格约束】
1. 只能基于提供的信息进行分析，不得编造流程或政策
2. 不得添加未在"标准回复"或"必须收集信息"中出现的步骤
3. 不得做任何承诺（如退款成功、一定解决等）
4. 不得改变业务逻辑，只能优化表达
5. 输出必须适用于真实客服发送场景
6. rewrittenReply 应保持简洁、完整、可直接发送，避免冗长
7. confidence 必须基于输入信息完整度、错误标签清晰度、标准回复明确度综合判断，不得随意给满分

【输出格式（必须严格 JSON）】
{
  "whyBad": "string",
  "suggestions": ["string", "string", "string"],
  "rewrittenReply": "string",
  "riskNotes": ["string"],
  "confidence": 0
}`;
}

/**
 * 使用本地模型生成基础 AI Coach 结果
 * 当 OpenRouter 不可用时作为降级方案
 */
async function callLocalModelCoach(payload) {
  const { scenario, ruleResult } = payload;
  const safeScenario = scenario || {};
  
  try {
    // 调用本地模型获取评分和分析
    const response = await fetch(LOCAL_MODEL_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: safeScenario.customerMessage || '',
        answer: ruleResult.originalReply || ''
      })
    });

    if (!response.ok) {
      throw new Error(`本地模型API错误: ${response.status}`);
    }

    const result = await response.json();
    const score = result.total_score || result.score || 0;
    
    // 基于评分和规则结果生成建议
    const suggestions = [];
    const riskNotes = [];
    
    if (score < 40) {
      suggestions.push('回复质量较低，请参考标准回复进行改进');
      riskNotes.push('评分偏低，可能存在服务态度或信息缺失问题');
    } else if (score < 70) {
      suggestions.push('回复有改进空间，建议对照标准话术优化');
    }
    
    // 基于 findings 添加具体建议
    const findings = ruleResult.findings || [];
    findings.forEach(f => {
      if (f.message && !suggestions.includes(f.message)) {
        suggestions.push(f.message);
      }
    });
    
    // 确保至少有一条建议
    if (suggestions.length === 0) {
      suggestions.push('建议参考标准回复，确保信息完整和表达规范');
    }
    
    return {
      whyBad: score < 50 ? '回复未达到基本质量标准，存在明显改进空间' : '回复可以进一步优化',
      suggestions: suggestions.slice(0, 3),
      rewrittenReply: safeScenario.standardReply || '您好，我们会为您核实处理，请提供相关信息。',
      riskNotes: riskNotes,
      confidence: Math.min(80, Math.round(score)),
      meta: {
        mode: 'local-model',
        provider: 'local',
        model: 'local-scoring-model',
        localScore: score
      }
    };
  } catch (error) {
    console.error('[LocalModelCoach] 调用失败:', error.message);
    throw error;
  }
}

async function callAiCoach(payload) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL;
  const prompt = buildPrompt(payload);
  const useLocalModel = process.env.USE_LOCAL_MODEL === 'true';

  // 如果配置使用本地模型，直接调用本地模型
  if (useLocalModel) {
    try {
      return await callLocalModelCoach(payload);
    } catch (error) {
      console.warn('[AI Coach] 本地模型失败，使用 mock 结果:', error.message);
      return {
        whyBad: '本地模型服务暂时不可用',
        suggestions: ['请检查本地模型服务是否正常运行', '稍后重试或使用标准回复参考'],
        rewrittenReply: payload.scenario?.standardReply || '您好，我们会为您核实处理。',
        riskNotes: ['本地模型服务异常'],
        confidence: 30,
        meta: {
          mode: 'mock-ai',
          reason: 'local_model_failed'
        }
      };
    }
  }

  if (!apiKey || !model) {
    return {
      whyBad: '当前未检测到可用模型配置，无法进行真实 AI 改写。',
      suggestions: ['请先配置 OPENROUTER_API_KEY 与 OPENROUTER_MODEL。'],
      rewrittenReply: '您好，请您提供相关信息，我们会继续为您核查并协助处理。',
      riskNotes: [],
      confidence: 30,
      meta: {
        mode: 'mock-ai',
        reason: 'missing_env'
      }
    };
  }

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://openclaw.local',
        'X-Title': 'trainer-core'
      },
      body: JSON.stringify({
        model,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: '你是严格遵守业务规则的客服训练 AI 教练，只输出 JSON。'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.2
      })
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`OpenRouter error: ${res.status} ${text}`);
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('OpenRouter returned empty content');
    }

    const parsed = JSON.parse(content);
    parsed.meta = {
      mode: 'real-ai',
      provider: 'openrouter',
      model
    };
    return parsed;
  } catch (error) {
    // OpenRouter 失败，尝试本地模型
    console.warn('[AI Coach] OpenRouter 失败，降级到本地模型:', error.message);
    try {
      return await callLocalModelCoach(payload);
    } catch (localError) {
      console.error('[AI Coach] 本地模型也失败:', localError.message);
      
      const fallback = await runFallbackRoute({
        taskName: 'ai_coach_fallback',
        userInput: prompt,
        systemPrompt: '你是严格遵守业务规则的客服训练 AI 教练，只输出 JSON。',
        requestId: `coach_${Date.now()}`,
        approved: true
      });

      if (!fallback.success || !fallback.content) {
        throw error;
      }

      const parsed = JSON.parse(fallback.content);
      parsed.meta = {
        mode: 'fallback-ai',
        provider: fallback.provider,
        model: fallback.model,
        reason: 'openrouter_primary_failed'
      };
      return parsed;
    }
  }
}

module.exports = { callAiCoach, callLocalModelCoach };
