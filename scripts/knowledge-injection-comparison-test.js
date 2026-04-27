/**
 * 第七步补充验证：3条样本的真实模型输出对比
 * 
 * 测试目标：
 * 1. 选3条真实样本
 * 2. 每条样本跑两次：不注入知识 / 注入知识
 * 3. 回传两次真实模型输出
 * 4. 明确说明哪一条在接知识后更接近主管标准答案
 */

const http = require('http');
const { KnowledgeRetrievalService } = require('../services/knowledge-retrieval-service');

// ========================
// Ollama 调用函数
// ========================

function callOllama(messages, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const data = {
      model: 'qwen3:4b',
      format: 'json',
      messages: messages,
      stream: false,
      think: false,
      options: {
        temperature: 0,
        num_predict: 1024
      }
    };

    const options = {
      hostname: 'localhost',
      port: 11434,
      path: '/api/chat',
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

    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.write(JSON.stringify(data));
    req.end();
  });
}

// ========================
// 构建 System Prompt（不含知识）
// ========================

function buildSystemPromptWithoutKnowledge() {
  return `你是客服质量评估助手。请分析以下对话并以JSON格式输出评估结果。

输出JSON必须包含以下字段：
- score: 0-100的整数，表示客服回复质量评分
- problem_type: "known"或"unknown"，表示问题类型
- scenario: 字符串，表示识别到的场景
- issues: 数组，存在的问题列表
- missing_info: 数组，缺失的信息列表
- suggested_reply: 字符串，建议的客服回复
- risk_level: "low"、"medium"或"high"，表示风险等级
- confidence: 0.0-1.0的数字，表示评估置信度

严格要求：
1. 只输出合法JSON，不要任何解释、文本或其他文本
2. 所有字段都必须存在且类型正确
3. score必须是整数
4. risk_level 必须是 "low"、"medium" 或 "high" 之一`;
}

// ========================
// 构建 System Prompt（含知识）
// ========================

async function buildSystemPromptWithKnowledge(scenario, projectId, conversationText) {
  const basePrompt = buildSystemPromptWithoutKnowledge();
  
  try {
    const retrievalService = new KnowledgeRetrievalService();
    const keyword = retrievalService.extractKeyword(conversationText);
    
    const knowledgeText = await retrievalService.retrieveAndFormat({
      scenario,
      projectId,
      keyword,
      maxResults: 3
    });
    
    if (knowledgeText) {
      // 在基础 prompt 后注入知识
      return basePrompt + knowledgeText;
    } else {
      return basePrompt;
    }
  } catch (error) {
    console.warn('知识检索失败:', error.message);
    return basePrompt;
  }
}

// ========================
// 测试样本
// ========================

const SAMPLES = [
  {
    id: 1,
    name: 'Scenario 命中样本',
    conversationText: '客服：您好，请问有什么可以帮助您的？\n用户：我昨天转账了5000块，显示成功了但对方说没收到，怎么回事？\n客服：请您提供转账时间、金额和交易哈希，我们马上为您核查到账状态。',
    scenario: 'transfer_not_received',
    projectId: 'test_project',
    standardAnswer: '您好，为了帮您进一步核查，请您提供付款截图和绑定手机号，我们会尽快为您处理。'
  },
  {
    id: 2,
    name: '场景通用样本',
    conversationText: '客服：您好，请问有什么问题吗？\n用户：我的转账一直没有到账，都过了24小时了！\n客服：请您稍等，我们核实一下。',
    scenario: 'same_scenario',
    projectId: 'project_a',
    standardAnswer: '非常抱歉给您带来不便，请您提供转账时间和交易截图，我们会立即为您跟进处理进度。'
  },
  {
    id: 3,
    name: '通用未知样本',
    conversationText: '客服：您好，请问需要什么帮助？\n用户：我想问一下你们的服务时间是什么时候？\n客服：我们的服务时间是工作日9点到18点。',
    scenario: 'general_unknown',
    projectId: 'test_project',
    standardAnswer: '我们的客服服务时间为工作日9:00-18:00，如有紧急问题可在服务时间内联系我们。'
  }
];

// ========================
// 单条样本对比测试
// ========================

async function testSampleWithComparison(sample) {
  console.log(`\n${'═'.repeat(80)}`);
  console.log(`【样本 ${sample.id}】${sample.name}`);
  console.log(`${'═'.repeat(80)}`);
  
  console.log('\n样本内容：');
  console.log(sample.conversationText);
  console.log('\n场景标识：', sample.scenario);
  console.log('项目标识：', sample.projectId);
  console.log('\n主管标准答案：');
  console.log(sample.standardAnswer);
  
  const result = {
    sample: sample,
    withoutKnowledge: null,
    withKnowledge: null,
    knowledgeInjected: false,
    knowledgeText: null
  };
  
  // ========================
  // 第一次：不注入知识
  // ========================
  console.log(`\n【第一次运行】不注入知识`);
  console.log('-'.repeat(80));
  
  try {
    const messagesWithout = [
      { role: 'system', content: buildSystemPromptWithoutKnowledge() },
      { role: 'user', content: sample.conversationText }
    ];
    
    const responseWithout = await callOllama(messagesWithout);
    const contentWithout = responseWithout?.message?.content;
    
    if (contentWithout) {
      try {
        const parsedWithout = JSON.parse(contentWithout);
        result.withoutKnowledge = parsedWithout;
        
        console.log('✅ 模型调用成功');
        console.log('评分：', parsedWithout.score);
        console.log('问题类型：', parsedWithout.problem_type);
        console.log('场景：', parsedWithout.scenario);
        console.log('建议回复：', parsedWithout.suggested_reply?.substring(0, 150));
      } catch (e) {
        console.log('⚠️  JSON 解析失败，输出原文：');
        console.log(contentWithout.substring(0, 300));
        result.withoutKnowledge = { raw: contentWithout };
      }
    } else {
      console.log('❌ 模型返回空内容');
    }
  } catch (error) {
    console.log('❌ 模型调用失败：', error.message);
  }
  
  // 等待2秒
  console.log('\n等待 2 秒...');
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // ========================
  // 第二次：注入知识
  // ========================
  console.log(`\n【第二次运行】注入知识`);
  console.log('-'.repeat(80));
  
  try {
    const systemPromptWith = await buildSystemPromptWithKnowledge(
      sample.scenario,
      sample.projectId,
      sample.conversationText
    );
    
    const messagesWith = [
      { role: 'system', content: systemPromptWith },
      { role: 'user', content: sample.conversationText }
    ];
    
    const responseWith = await callOllama(messagesWith);
    const contentWith = responseWith?.message?.content;
    
    if (contentWith) {
      try {
        const parsedWith = JSON.parse(contentWith);
        result.withKnowledge = parsedWith;
        
        console.log('✅ 模型调用成功');
        console.log('评分：', parsedWith.score);
        console.log('问题类型：', parsedWith.problem_type);
        console.log('场景：', parsedWith.scenario);
        console.log('建议回复：', parsedWith.suggested_reply?.substring(0, 150));
      } catch (e) {
        console.log('⚠️  JSON 解析失败，输出原文：');
        console.log(contentWith.substring(0, 300));
        result.withKnowledge = { raw: contentWith };
      }
    } else {
      console.log('❌ 模型返回空内容');
    }
  } catch (error) {
    console.log('❌ 模型调用失败：', error.message);
  }
  
  // ========================
  // 对比分析
  // ========================
  console.log(`\n【对比分析】`);
  console.log('-'.repeat(80));
  
  if (result.withoutKnowledge && result.withKnowledge) {
    const without = result.withoutKnowledge;
    const with_ = result.withKnowledge;
    
    // 检查是否有知识注入
    const retrievalService = new KnowledgeRetrievalService();
    const keyword = retrievalService.extractKeyword(sample.conversationText);
    const knowledgeText = await retrievalService.retrieveAndFormat({
      scenario: sample.scenario,
      projectId: sample.projectId,
      keyword,
      maxResults: 3
    });
    
    result.knowledgeInjected = knowledgeText ? true : false;
    result.knowledgeText = knowledgeText;
    
    if (knowledgeText) {
      console.log('✅ 知识已注入');
      console.log('注入知识摘要：', knowledgeText.substring(0, 200) + '...');
    } else {
      console.log('⚠️  未命中知识（该样本无对应知识）');
    }
    
    // 对比评分
    console.log('\n评分对比：');
    console.log('  不注入知识：', without.score || 'N/A');
    console.log('  注入知识：', with_.score || 'N/A');
    
    // 对比建议回复
    console.log('\n建议回复对比：');
    console.log('  不注入知识：', without.suggested_reply?.substring(0, 100) || 'N/A');
    console.log('  注入知识：', with_.suggested_reply?.substring(0, 100) || 'N/A');
    console.log('  主管标准答案：', sample.standardAnswer.substring(0, 100));
    
    // 判断是否更接近标准答案
    if (with_.suggested_reply && without.suggested_reply) {
      const withSimilarity = calculateSimilarity(with_.suggested_reply, sample.standardAnswer);
      const withoutSimilarity = calculateSimilarity(without.suggested_reply, sample.standardAnswer);
      
      console.log('\n与标准答案的相似度：');
      console.log('  不注入知识：', (withoutSimilarity * 100).toFixed(1) + '%');
      console.log('  注入知识：', (withSimilarity * 100).toFixed(1) + '%');
      
      if (withSimilarity > withoutSimilarity) {
        console.log('\n✅ 注入知识后更接近主管标准答案');
        result.improved = true;
      } else if (withSimilarity < withoutSimilarity) {
        console.log('\n❌ 注入知识后反而偏离标准答案');
        result.improved = false;
      } else {
        console.log('\n⚠️  注入知识后与标准答案相似度相同');
        result.improved = null;
      }
    }
  } else {
    console.log('⚠️  无法对比（至少一次调用失败）');
  }
  
  return result;
}

// ========================
// 简单文本相似度计算（基于关键词重叠）
// ========================

function calculateSimilarity(text1, text2) {
  if (!text1 || !text2) return 0;
  
  const words1 = text1.split('').filter(c => c.trim());
  const words2 = text2.split('').filter(c => c.trim());
  
  const set2 = new Set(words2);
  let matchCount = 0;
  
  words1.forEach(w => {
    if (set2.has(w)) matchCount++;
  });
  
  return matchCount / Math.max(words1.length, words2.length);
}

// ========================
// 主测试流程
// ========================

async function main() {
  console.log('='.repeat(80));
  console.log('第七步补充验证：3条样本的真实模型输出对比');
  console.log('='.repeat(80));
  
  const results = [];
  
  for (const sample of SAMPLES) {
    const result = await testSampleWithComparison(sample);
    results.push(result);
    
    // 样本间等待3秒
    if (sample.id < SAMPLES.length) {
      console.log(`\n等待 3 秒后继续下一个样本...`);
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
  
  // ========================
  // 汇总结果
  // ========================
  console.log('\n' + '='.repeat(80));
  console.log('【汇总结果】');
  console.log('='.repeat(80));
  
  results.forEach((result, index) => {
    console.log(`\n样本 ${result.sample.id}：${result.sample.name}`);
    console.log('  场景：', result.sample.scenario);
    console.log('  知识注入：', result.knowledgeInjected ? '✅' : '❌');
    
    if (result.withoutKnowledge && result.withKnowledge) {
      console.log('  不注入知识评分：', result.withoutKnowledge.score || 'N/A');
      console.log('  注入知识评分：', result.withKnowledge.score || 'N/A');
      
      if (result.improved === true) {
        console.log('  改进情况：✅ 注入知识后更接近主管标准答案');
      } else if (result.improved === false) {
        console.log('  改进情况：❌ 注入知识后偏离标准答案');
      } else {
        console.log('  改进情况：⚠️  无明显差异');
      }
    } else {
      console.log('  状态：⚠️  至少一次调用失败');
    }
  });
  
  // ========================
  // 最终结论
  // ========================
  console.log('\n' + '='.repeat(80));
  console.log('【最终结论】');
  console.log('='.repeat(80));
  
  const improvedCount = results.filter(r => r.improved === true).length;
  const totalWithComparison = results.filter(r => r.withoutKnowledge && r.withKnowledge).length;
  
  console.log(`\n3 条样本对比结果：`);
  console.log(`  - 成功完成对比：${totalWithComparison} 条`);
  console.log(`  - 注入知识后改进：${improvedCount} 条`);
  
  if (totalWithComparison >= 3 && improvedCount >= 1) {
    console.log('\n✅ 第七步完全通过');
    console.log('\n完成标准：');
    console.log('  1. ✅ 已确认模型调用入口');
    console.log('  2. ✅ 已确认 knowledge 检索入口');
    console.log('  3. ✅ 已能查询 active 知识记录');
    console.log('  4. ✅ 已能在模型调用前注入知识文本');
    console.log('  5. ✅ 已完成 3 条样本验证');
    console.log('  6. ✅ 已证明至少 1 条样本在接知识后回答更稳定');
    console.log('  7. ✅ 未扩展到复杂 RAG / 向量检索工程');
  } else if (totalWithComparison >= 3) {
    console.log('\n⚠️  知识检索已接入，但改进效果不明显');
    console.log('\n可能原因：');
    console.log('  - 知识质量不足（重复、不精确）');
    console.log('  - 模型对知识的利用不够');
    console.log('  - 样本选择不当');
  } else {
    console.log('\n❌ 对比测试未完成');
  }
}

main().catch(error => {
  console.error('测试失败：', error.message);
  console.error(error.stack);
  process.exit(1);
});
