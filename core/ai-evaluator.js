const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = 'openai/gpt-4o-mini';
const TIMEOUT_MS = 30000; // 30秒超时
const MAX_RETRIES = 2; // 最大重试次数

async function generateScenario(seed = '') {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${API_KEY}`
        },
        body: JSON.stringify({
            model: MODEL,
            messages: [
                { role: 'system', content: '你是一个客服训练场景生成器。必须严格遵守FAQ逻辑：只生成与“注册验证码收不到”或“转账未到账”相关的变体场景。必须返回 JSON: {"id": "unique_id", "title": "...", "customerMessage": "..."}' },
                { role: 'user', content: `生成一个新的随机客服训练场景。随机种子: ${seed}` }
            ],
            response_format: { type: 'json_object' }
        })
    });
    const data = await response.json();
    return JSON.parse(data.choices[0].message.content);
}

// 验证AI评估结果格式
function validateAiResult(result) {
    if (!result || typeof result !== 'object') {
        throw new Error('AI评估结果格式错误：不是有效对象');
    }
    
    if (typeof result.enabled !== 'boolean') {
        throw new Error('AI评估结果缺少enabled字段');
    }
    
    if (result.enabled) {
        if (!result.dimensionScores || typeof result.dimensionScores !== 'object') {
            throw new Error('AI评估结果缺少dimensionScores字段');
        }
        
        const dimensions = ['attitude', 'process', 'information', 'empathy', 'clarity'];
        for (const dim of dimensions) {
            if (typeof result.dimensionScores[dim] !== 'number' || 
                result.dimensionScores[dim] < 0 || 
                result.dimensionScores[dim] > 20) {
                throw new Error(`AI评估结果${dim}分数无效：应为0-20之间的数字`);
            }
        }
        
        if (!Array.isArray(result.strengths) || !Array.isArray(result.weaknesses)) {
            throw new Error('AI评估结果strengths和weaknesses应为数组');
        }
    }
    
    return true;
}

// 带重试的AI评估请求
async function makeAiRequest(requestBody, retryCount = 0) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
    
    try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_KEY}`,
                'HTTP-Referer': 'https://github.com/trainer-core',
                'X-Title': 'Trainer Core AI Evaluator'
            },
            body: JSON.stringify(requestBody),
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            if (response.status === 429 && retryCount < MAX_RETRIES) {
                // 限流重试，指数退避
                const delay = Math.pow(2, retryCount) * 1000;
                await new Promise(resolve => setTimeout(resolve, delay));
                return makeAiRequest(requestBody, retryCount + 1);
            }
            throw new Error(`API请求失败: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (!data.choices || !data.choices[0] || !data.choices[0].message) {
            throw new Error('AI API 响应格式无效');
        }
        
        let result;
        try {
            result = JSON.parse(data.choices[0].message.content);
        } catch (parseError) {
            throw new Error(`AI响应JSON解析失败: ${parseError.message}`);
        }
        
        validateAiResult(result);
        return result;
        
    } catch (error) {
        clearTimeout(timeoutId);
        
        if (error.name === 'AbortError') {
            throw new Error('AI评估请求超时');
        }
        
        if (error.message.includes('限流') && retryCount < MAX_RETRIES) {
            const delay = Math.pow(2, retryCount) * 1000;
            await new Promise(resolve => setTimeout(resolve, delay));
            return makeAiRequest(requestBody, retryCount + 1);
        }
        
        throw error;
    }
}

async function aiEvaluate(userReply, scenario) {
    if (!API_KEY) {
        throw new Error('OPENROUTER_API_KEY 未配置');
    }
    
    if (!userReply || typeof userReply !== 'string') {
        throw new Error('用户回复无效');
    }
    
    if (!scenario || !scenario.customerMessage || !scenario.standardReply) {
        throw new Error('场景数据无效');
    }

    const requestBody = {
        model: MODEL,
        messages: [
            { 
                role: 'system', 
                content: `你是一个专业的金融客服回复质量评估师，专门评估LantonPay和Pai钱包等金融科技产品的客服回复质量。

评估维度和标准：
1. 态度礼貌性 (0-20分)：是否使用礼貌用语，语气是否专业友好
2. 流程完整性 (0-20分)：是否清楚说明处理步骤和后续动作
3. 信息收集完整性 (0-20分)：是否收集了必要的信息来解决问题
4. 安抚能力 (0-20分)：是否能有效安抚用户情绪，体现同理心
5. 表达清晰度 (0-20分)：表达是否简洁明了，结构是否清晰

评分标准：
- 18-20分：优秀，完全符合客服标准
- 15-17分：良好，基本符合要求
- 12-14分：一般，需要改进
- 8-11分：较差，有明显不足
- 0-7分：很差，不适合使用

请严格按照以下JSON格式返回评估结果：
{
    "enabled": true,
    "insights": "总体评价和改进建议（50-100字）",
    "strengths": ["优点1", "优点2", "优点3"],
    "weaknesses": ["待改进点1", "待改进点2", "待改进点3"],
    "dimensionScores": {
        "attitude": 分数(0-20),
        "process": 分数(0-20),
        "information": 分数(0-20),
        "empathy": 分数(0-20),
        "clarity": 分数(0-20)
    }
}` 
            },
            { 
                role: 'user', 
                content: `【客户问题】
${scenario.customerMessage}

【标准回复参考】
${scenario.standardReply}

【待评估回复】
${userReply}

请根据金融客服标准评估这个回复的质量。` 
            }
        ],
        temperature: 0.3, // 降低随机性，提高一致性
        max_tokens: 1000, // 限制响应长度
        response_format: { type: 'json_object' }
    };
    
    try {
        return await makeAiRequest(requestBody);
    } catch (error) {
        console.error('AI评估详细错误:', error.message);
        throw new Error(`AI评估失败: ${error.message}`);
    }
}

module.exports = { generateScenario, aiEvaluate, validateAiResult };
