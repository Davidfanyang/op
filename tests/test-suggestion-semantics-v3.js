/**
 * 建议答案语义验证 v3 - 验证内容有依据 + 输出来源追溯
 * 
 * 验证约束：
 * 1. 不得编造无依据的具体事实（时效、材料、处理能力）
 * 2. 内容来源收敛到三类：conversation / evaluation / FAQ
 * 3. 无依据时走保守回复
 */
const { UnknownSuggestionService } = require('../services/unknown-suggestion-service');
const { FileSuggestionsRepository } = require('../repositories/impl/file-suggestions-repository');
const { FileLiveEvaluationsRepository } = require('../repositories/impl/file-live-evaluations-repository');
const { FileLiveMessagesRepository } = require('../repositories/impl/file-live-messages-repository');
const { FileLiveSessionsRepository } = require('../repositories/impl/file-live-sessions-repository');

async function run() {
  const samples = [
    {
      name: '样本1: 转账咨询（有FAQ匹配）',
      evalId: 'semv3_e1', sessionId: 'semv3_s1', msgId: 'semv3_m1',
      user: '你好，请问怎么转账？',
      agent: '请稍等',
      reason: '场景无法识别',
      summary: '客服回复过于简短，未解决用户问题',
      findings: ['回复过于简短', '未提供有效信息']
    },
    {
      name: '样本2: 到账时效咨询（无FAQ精确匹配，应走保守回复）',
      evalId: 'semv3_e2', sessionId: 'semv3_s2', msgId: 'semv3_m2',
      user: 'Bakong转账需要多久到账？',
      agent: '我不确定',
      reason: '分析结果不完整',
      summary: '客服未能给出明确答复',
      findings: ['未提供有效信息', '回复不确定']
    },
    {
      name: '样本3: 注册材料咨询（有FAQ匹配）',
      evalId: 'semv3_e3', sessionId: 'semv3_s3', msgId: 'semv3_m3',
      user: '注册Lanton Pay需要做KYC吗？',
      agent: '我需要查一下',
      reason: '置信度不足',
      summary: '客服回复缺乏具体内容',
      findings: ['未提供有效信息']
    }
  ];

  console.log('========== 建议答案语义验证 v3 - 内容依据追溯 ==========\n');

  let allPass = true;

  for (const s of samples) {
    const suggestionsRepo = new FileSuggestionsRepository();
    const evaluationsRepo = new FileLiveEvaluationsRepository();
    const messagesRepo = new FileLiveMessagesRepository();
    const sessionsRepo = new FileLiveSessionsRepository();
    const service = new UnknownSuggestionService({ suggestionsRepo, evaluationsRepo, messagesRepo, sessionsRepo });

    await sessionsRepo.create({ sessionId: s.sessionId, project: 'lanton', chatId: '-1001', agentId: 'cs001', status: 'active', startedAt: new Date(), updatedAt: new Date() });
    await messagesRepo.create({ messageId: s.msgId + '_user', sessionId: s.sessionId, role: 'user', senderId: 'u1', senderName: '用户', content: s.user, timestamp: new Date().toISOString() });
    await messagesRepo.create({ messageId: s.msgId + '_agent', sessionId: s.sessionId, role: 'agent', senderId: 'cs001', senderName: '客服', content: s.agent, timestamp: new Date().toISOString() });
    await evaluationsRepo.create({
      evaluationId: s.evalId, sessionId: s.sessionId, messageId: s.msgId + '_agent',
      project: 'lanton', currentReply: s.agent,
      inputPayload: { metadata: { entry_type: 'live_monitor' } },
      outputPayload: { analysis: { issues: s.findings } },
      scenario: 'unknown', summary: s.summary, problemType: 'unknown',
      needReview: true, classifyReason: s.reason
    });

    const result = await service.generateSuggestionByEvaluationId(s.evalId);
    const reply = result.suggested_reply || '';

    // 追溯信息依据来源
    const evidenceSources = traceEvidenceSource(reply, s);

    console.log(`=== ${s.name} ===`);
    console.log(`输入摘要:`);
    console.log(`  用户: ${s.user}`);
    console.log(`  客服: ${s.agent}`);
    console.log(`  判定: ${s.reason}`);
    console.log(``);
    console.log(`最终 suggested_reply:`);
    console.log(`  ${reply}`);
    console.log(``);
    console.log(`信息依据来源:`);
    for (const src of evidenceSources) {
      console.log(`  ${src}`);
    }
    console.log(``);

    // 验证：不含无依据事实
    const violations = checkViolations(reply, s);
    if (violations.length > 0) {
      console.log(`❌ 内容无依据: ${violations.join('; ')}`);
      allPass = false;
    } else {
      console.log(`✓ 内容有依据，未编造事实`);
    }
    console.log('');
  }

  console.log('========== 总结 ==========');
  if (allPass) {
    console.log('✅ 全部3条样本通过内容依据验证');
  } else {
    console.log('❌ 存在无依据内容，需修正');
  }
}

/**
 * 追溯回复中关键信息的依据来源
 */
function traceEvidenceSource(reply, sample) {
  const sources = [];

  // 检查是否来自 FAQ
  try {
    const fs = require('fs');
    const path = require('path');
    const scenariosPath = path.join(__dirname, '..', 'data', 'scenarios.json');
    if (fs.existsSync(scenariosPath)) {
      const allScenarios = JSON.parse(fs.readFileSync(scenariosPath, 'utf8'));
      for (const scenario of allScenarios) {
        const stdReply = scenario.standardReply || scenario.standard_reply || '';
        if (stdReply && reply.trim() === stdReply.trim()) {
          sources.push(`[FAQ] 场景: ${scenario.id} - "${scenario.title}"`);
          break;
        }
      }
    }
  } catch (e) { /* ignore */ }

  // 检查是否引用了 conversation 中的信息
  const convKeywords = extractMeaningfulWords(sample.user + ' ' + sample.agent);
  const replyKeywords = extractMeaningfulWords(reply);
  const convReferenced = replyKeywords.filter(kw => convKeywords.includes(kw) && kw.length >= 2);
  if (convReferenced.length > 0) {
    sources.push(`[对话] 引用了用户/客服已提及的关键词: ${convReferenced.slice(0, 5).join('、')}`);
  }

  // 检查是否引用了 evaluation 的 findings
  const findingKeywords = (sample.findings || []).flatMap(f => extractMeaningfulWords(f));
  const evalReferenced = replyKeywords.filter(kw => findingKeywords.includes(kw) && kw.length >= 2);
  if (evalReferenced.length > 0) {
    sources.push(`[评估] 引用了 evaluation findings 中的关键词: ${evalReferenced.slice(0, 3).join('、')}`);
  }

  // 保守回复标识
  if (/(确认|核实|稍等|进一步|查证|需要先)/.test(reply)) {
    sources.push('[保守] 回复采用保守策略：先收集信息/确认场景/说明需核实');
  }

  if (sources.length === 0) {
    sources.push('[未知] 未追溯到的信息来源');
  }

  return sources;
}

/**
 * 提取有意义的关键词
 */
function extractMeaningfulWords(text) {
  const stopWords = new Set(['的', '了', '吗', '呢', '啊', '是', '在', '我', '你', '请问', '你好', '怎么', '什么', '如何', '能', '可以', '有', '要', '会', '都', '也', '还', '就', '着', '过', '您好', '关于', '提到', '需要', '先', '一下', '稍后', '回复', '方便', '稍等']);
  const words = [];
  const patterns = [
    /[a-zA-Z]{2,}/g,
    /[\u4e00-\u9fa5]{2,4}/g
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text.toLowerCase())) !== null) {
      const word = match[0];
      if (!stopWords.has(word)) {
        words.push(word);
      }
    }
  }
  return [...new Set(words)];
}

/**
 * 检查是否含有无依据的事实
 */
function checkViolations(reply, sample) {
  const violations = [];

  // 检查时效
  const timePatterns = /\d+[-~到]\d+\s*(个|天|小时|分钟|工作日)|\d+\s*(小时|分钟|天|工作日)内?/g;
  let timeMatch;
  while ((timeMatch = timePatterns.exec(reply)) !== null) {
    const timeStr = timeMatch[0];
    // 是否在 conversation 或 findings 或 FAQ 中出现过
    const allowedText = (sample.user + ' ' + sample.agent + ' ' + (sample.findings || []).join(' ')).toLowerCase();
    if (!allowedText.includes(timeStr)) {
      violations.push(`编造了具体时效: "${timeStr}"（conversation/evaluation 中未出现）`);
    }
  }

  // 检查材料清单
  const materialPattern = /(身份证|护照|银行卡|手机号|证件照|手持证件|视频)[，、及与].*(身份证|护照|银行卡|手机号|证件照|手持证件|视频)/;
  const matMatch = reply.match(materialPattern);
  if (matMatch) {
    const allowedText = (sample.user + ' ' + sample.agent + ' ' + (sample.findings || []).join(' ')).toLowerCase();
    if (!allowedText.includes(matMatch[1]) && !allowedText.includes(matMatch[2])) {
      violations.push(`编造了具体材料清单: "${matMatch[0]}"（conversation/evaluation 中未出现）`);
    }
  }

  // 检查处理能力断言
  const capPatterns = [/不支持(数字货币|USDT|充值|提现|转账|退款)/, /仅支持(法定货币|银行转账|扫码)/];
  for (const pattern of capPatterns) {
    const capMatch = reply.match(pattern);
    if (capMatch) {
      const allowedText = (sample.user + ' ' + sample.agent + ' ' + (sample.findings || []).join(' ')).toLowerCase();
      if (!allowedText.includes(capMatch[0])) {
        violations.push(`编造了处理能力断言: "${capMatch[0]}"（conversation/evaluation 中未出现）`);
      }
    }
  }

  return violations;
}

run().catch(e => console.error(e));
