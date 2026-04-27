/**
 * 建议答案语义验证 v2 - 验证内容是否有依据
 */
const { UnknownSuggestionService } = require('../services/unknown-suggestion-service');
const { FileSuggestionsRepository } = require('../repositories/impl/file-suggestions-repository');
const { FileLiveEvaluationsRepository } = require('../repositories/impl/file-live-evaluations-repository');
const { FileLiveMessagesRepository } = require('../repositories/impl/file-live-messages-repository');
const { FileLiveSessionsRepository } = require('../repositories/impl/file-live-sessions-repository');

async function run() {
  const samples = [
    {
      name: '样本1',
      evalId: 'semv2_e1', sessionId: 'semv2_s1', msgId: 'semv2_m1',
      user: '你好，请问怎么转账？', agent: '请稍等',
      reason: '场景无法识别', summary: '客服回复过于简短，未解决用户问题',
      findings: ['回复过于简短', '未提供有效信息']
    },
    {
      name: '样本2',
      evalId: 'semv2_e2', sessionId: 'semv2_s2', msgId: 'semv2_m2',
      user: 'Bakong转账需要多久到账？', agent: '我不确定',
      reason: '分析结果不完整', summary: '客服未能给出明确答复',
      findings: ['未提供有效信息', '回复不确定']
    },
    {
      name: '样本3',
      evalId: 'semv2_e3', sessionId: 'semv2_s3', msgId: 'semv2_m3',
      user: '注册需要什么材料？', agent: '我需要查一下',
      reason: '置信度不足', summary: '客服回复缺乏具体内容',
      findings: ['未提供有效信息']
    }
  ];

  console.log('========== 建议答案语义验证 v2 ==========\n');

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

    console.log(`--- ${s.name} ---`);
    console.log(`输入摘要:`);
    console.log(`  用户: ${s.user}`);
    console.log(`  客服: ${s.agent}`);
    console.log(`  判定: ${s.reason}`);
    console.log(``);
    console.log(`最终 suggested_reply:`);
    console.log(`  ${reply}`);
    console.log(``);

    // 检查是否有无依据的事实
    const violations = [];
    if (/\\d+[-~到]\\d+(个|天|小时|分钟)/.test(reply) && !s.user.includes('多久') && !s.user.includes('到账'))
      violations.push('编造了具体时效');
    if (/(身份证|护照|银行卡|手机号)/.test(reply) && !s.findings.some(f => typeof f === 'string' && /(身份证|护照|银行卡|手机号)/.test(f)))
      violations.push('编造了具体材料清单');

    // 检查是否为保守回复
    const isConservative = /(确认|核实|稍等|进一步|查证)/.test(reply);

    // 检查是否引用FAQ
    const isFAQ = result._source === 'faq';

    if (violations.length > 0) {
      console.log(`❌ 内容无依据: ${violations.join('; ')}`);
    } else if (isConservative) {
      console.log(`✓ 保守回复（未编造事实，需进一步核实）`);
    } else {
      console.log(`✓ 内容有依据`);
    }
    console.log('');
  }
}
run().catch(e => console.error(e));
