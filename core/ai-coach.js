const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const envPath = path.resolve(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

function buildPrompt(payload) {
  const { scenario, ruleResult } = payload;
  const findingsText = JSON.stringify(ruleResult.findings || [], null, 2);
  const mustCollect = JSON.stringify(scenario.mustCollect || [], null, 2);
  const shouldAvoid = JSON.stringify(scenario.qualityChecks?.shouldAvoid || [], null, 2);

  return `你是客服训练系统中的 AI 教练模块（AI Coach）。

你的任务不是自由发挥，而是基于给定业务规则，对客服回复进行纠错、指导和标准化改写。

【输入信息】
场景标题：${scenario.title}
客户问题：${scenario.customerMessage}
用户原回复：${ruleResult.originalReply || ''}
错误标签（来自规则评估器，包含 code 与 message）：${findingsText}
必须收集的信息：${mustCollect}
禁止内容：${shouldAvoid}
标准回复参考：${scenario.standardReply}

【严格约束】
1. 只能基于提供的信息进行分析，不得编造流程或政策
2. 不得添加未在“标准回复”或“必须收集信息”中出现的步骤
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

async function callAiCoach(payload) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL;

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

  const prompt = buildPrompt(payload);
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
    model
  };
  return parsed;
}

module.exports = { callAiCoach };
