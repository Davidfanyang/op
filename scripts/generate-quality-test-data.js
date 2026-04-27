/**
 * 生成质检测试数据脚本
 * 
 * 用于创建测试用的 live sessions, messages, evaluations, alerts 数据
 */

const { defaultRepo: liveSessionsRepo } = require('../repositories/impl/file-live-sessions-repository');
const { defaultRepo: liveMessagesRepo } = require('../repositories/impl/file-live-messages-repository');
const { defaultRepo: liveEvaluationsRepo } = require('../repositories/impl/file-live-evaluations-repository');
const { defaultRepo: alertsRepo } = require('../repositories/impl/file-alerts-repository');

async function generateTestData() {
  console.log('开始生成质检测试数据...\n');

  // 创建 3 个测试 session
  const sessions = [
    {
      sessionId: 'live_session_001',
      project: 'lanton',
      chatId: '-1001234567890',
      agentId: 'agent_001',
      status: 'active',
      startedAt: new Date('2026-04-18T10:00:00Z'),
      updatedAt: new Date('2026-04-18T10:08:00Z')
    },
    {
      sessionId: 'live_session_002',
      project: 'lanton',
      chatId: '-1001234567891',
      agentId: 'agent_002',
      status: 'active',
      startedAt: new Date('2026-04-18T11:00:00Z'),
      updatedAt: new Date('2026-04-18T11:10:00Z')
    },
    {
      sessionId: 'live_session_003',
      project: 'default',
      chatId: '-1001234567892',
      agentId: 'agent_001',
      status: 'closed',
      startedAt: new Date('2026-04-17T15:00:00Z'),
      updatedAt: new Date('2026-04-17T15:15:00Z')
    }
  ];

  for (const session of sessions) {
    await liveSessionsRepo.create(session);
    console.log(`✅ 创建 session: ${session.sessionId} (project: ${session.project}, agent: ${session.agentId})`);
  }

  console.log('\n');

  // 为 session_001 创建消息
  const messages1 = [
    {
      messageId: 'msg_001',
      sessionId: 'live_session_001',
      role: 'user',
      senderId: 'user_001',
      senderName: '用户A',
      content: '我转账一直没到账',
      timestamp: new Date('2026-04-18T10:00:10Z')
    },
    {
      messageId: 'msg_002',
      sessionId: 'live_session_001',
      role: 'agent',
      senderId: 'agent_001',
      senderName: '客服A',
      content: '请提供一下付款截图',
      timestamp: new Date('2026-04-18T10:00:30Z')
    },
    {
      messageId: 'msg_003',
      sessionId: 'live_session_001',
      role: 'user',
      senderId: 'user_001',
      senderName: '用户A',
      content: '好的，这是截图',
      timestamp: new Date('2026-04-18T10:01:00Z')
    },
    {
      messageId: 'msg_004',
      sessionId: 'live_session_001',
      role: 'agent',
      senderId: 'agent_001',
      senderName: '客服A',
      content: '已收到，我帮您查询一下',
      timestamp: new Date('2026-04-18T10:01:30Z')
    }
  ];

  for (const msg of messages1) {
    await liveMessagesRepo.create(msg);
  }
  console.log(`✅ 为 session_001 创建 ${messages1.length} 条消息`);

  // 为 session_002 创建消息
  const messages2 = [
    {
      messageId: 'msg_005',
      sessionId: 'live_session_002',
      role: 'user',
      senderId: 'user_002',
      senderName: '用户B',
      content: '我想咨询一下退款政策',
      timestamp: new Date('2026-04-18T11:00:10Z')
    },
    {
      messageId: 'msg_006',
      sessionId: 'live_session_002',
      role: 'agent',
      senderId: 'agent_002',
      senderName: '客服B',
      content: '您好，我们的退款政策是7天内无理由退款',
      timestamp: new Date('2026-04-18T11:00:30Z')
    }
  ];

  for (const msg of messages2) {
    await liveMessagesRepo.create(msg);
  }
  console.log(`✅ 为 session_002 创建 ${messages2.length} 条消息`);

  // 为 session_003 创建消息
  const messages3 = [
    {
      messageId: 'msg_007',
      sessionId: 'live_session_003',
      role: 'user',
      senderId: 'user_003',
      senderName: '用户C',
      content: '产品怎么用',
      timestamp: new Date('2026-04-17T15:00:10Z')
    },
    {
      messageId: 'msg_008',
      sessionId: 'live_session_003',
      role: 'agent',
      senderId: 'agent_001',
      senderName: '客服A',
      content: '请参考使用手册',
      timestamp: new Date('2026-04-17T15:00:30Z')
    }
  ];

  for (const msg of messages3) {
    await liveMessagesRepo.create(msg);
  }
  console.log(`✅ 为 session_003 创建 ${messages3.length} 条消息`);

  console.log('\n');

  // 为 session_001 创建质检记录
  const evaluations1 = [
    {
      evaluationId: 'eval_001',
      sessionId: 'live_session_001',
      messageId: 'msg_002',
      project: 'lanton',
      currentReply: '请提供一下付款截图',
      inputPayload: {
        project: 'lanton',
        conversation: [{ role: 'user', content: '我转账一直没到账' }],
        current_reply: '请提供一下付款截图',
        metadata: { session_id: 'live_session_001', agent_id: 'agent_001' },
        rules: {}
      },
      outputPayload: {
        scenario: '转账未到账',
        stage: '信息收集阶段',
        judgement: '回复方向正确，但缺少到账时间和订单信息确认',
        analysis: { strengths: ['要求提供截图'], weaknesses: ['缺少关键信息确认'] },
        summary: '客服已要求用户提供截图，但还需要补充订单号、付款时间等关键信息。',
        confidence: 0.82
      },
      scenario: '转账未到账',
      stage: '信息收集阶段',
      judgement: '回复方向正确，但缺少到账时间和订单信息确认',
      summary: '客服已要求用户提供截图，但还需要补充订单号、付款时间等关键信息。',
      confidence: 0.82,
      problemType: 'known',
      needReview: false,
      classifyReason: '场景明确，分析结果完整，置信度达标',
      alertLevel: 'none',
      hasAlert: false,
      createdAt: new Date('2026-04-18T10:00:35Z')
    },
    {
      evaluationId: 'eval_002',
      sessionId: 'live_session_001',
      messageId: 'msg_004',
      project: 'lanton',
      currentReply: '已收到，我帮您查询一下',
      inputPayload: {
        project: 'lanton',
        conversation: [
          { role: 'user', content: '我转账一直没到账' },
          { role: 'agent', content: '请提供一下付款截图' },
          { role: 'user', content: '好的，这是截图' }
        ],
        current_reply: '已收到，我帮您查询一下',
        metadata: { session_id: 'live_session_001', agent_id: 'agent_001' },
        rules: {}
      },
      outputPayload: {
        scenario: '转账未到账',
        stage: '处理阶段',
        judgement: '客服确认收到截图并开始查询，但预计处理时间未告知',
        analysis: { strengths: ['及时确认'], weaknesses: ['未告知处理时间'], risks: ['用户可能等待焦虑'] },
        summary: '客服处理方向正确，但应告知预计处理时间和后续跟进方式。',
        confidence: 0.75
      },
      scenario: '转账未到账',
      stage: '处理阶段',
      judgement: '客服确认收到截图并开始查询，但预计处理时间未告知',
      summary: '客服处理方向正确，但应告知预计处理时间和后续跟进方式。',
      confidence: 0.75,
      problemType: 'unknown',
      needReview: true,
      classifyReason: '存在风险提示，置信度较低，需要人工审核',
      alertLevel: 'medium',
      hasAlert: true,
      createdAt: new Date('2026-04-18T10:01:35Z')
    }
  ];

  for (const eval_ of evaluations1) {
    await liveEvaluationsRepo.create(eval_);
  }
  console.log(`✅ 为 session_001 创建 ${evaluations1.length} 条质检记录`);

  // 为 session_002 创建质检记录
  const evaluations2 = [
    {
      evaluationId: 'eval_003',
      sessionId: 'live_session_002',
      messageId: 'msg_006',
      project: 'lanton',
      currentReply: '您好，我们的退款政策是7天内无理由退款',
      inputPayload: {
        project: 'lanton',
        conversation: [{ role: 'user', content: '我想咨询一下退款政策' }],
        current_reply: '您好，我们的退款政策是7天内无理由退款',
        metadata: { session_id: 'live_session_002', agent_id: 'agent_002' },
        rules: {}
      },
      outputPayload: {
        scenario: '退款咨询',
        stage: '信息收集阶段',
        judgement: '回复准确，但缺少退款流程说明',
        analysis: { strengths: ['政策准确'], weaknesses: ['缺少流程说明'] },
        summary: '客服回答了核心问题，但应补充退款操作流程。',
        confidence: 0.88
      },
      scenario: '退款咨询',
      stage: '信息收集阶段',
      judgement: '回复准确，但缺少退款流程说明',
      summary: '客服回答了核心问题，但应补充退款操作流程。',
      confidence: 0.88,
      problemType: 'known',
      needReview: false,
      classifyReason: '场景明确，分析结果完整',
      alertLevel: 'none',
      hasAlert: false,
      createdAt: new Date('2026-04-18T11:00:35Z')
    }
  ];

  for (const eval_ of evaluations2) {
    await liveEvaluationsRepo.create(eval_);
  }
  console.log(`✅ 为 session_002 创建 ${evaluations2.length} 条质检记录`);

  // 为 session_003 创建质检记录
  const evaluations3 = [
    {
      evaluationId: 'eval_004',
      sessionId: 'live_session_003',
      messageId: 'msg_008',
      project: 'default',
      currentReply: '请参考使用手册',
      inputPayload: {
        project: 'default',
        conversation: [{ role: 'user', content: '产品怎么用' }],
        current_reply: '请参考使用手册',
        metadata: { session_id: 'live_session_003', agent_id: 'agent_001' },
        rules: {}
      },
      outputPayload: {
        scenario: '产品使用咨询',
        stage: '信息收集阶段',
        judgement: '回复过于简单，未提供具体指导',
        analysis: { strengths: [], weaknesses: ['回复过于简单', '未提供实质帮助'], risks: ['用户体验差'] },
        summary: '客服回复敷衍，应提供具体的使用指导或手册链接。',
        confidence: 0.65
      },
      scenario: '产品使用咨询',
      stage: '信息收集阶段',
      judgement: '回复过于简单，未提供具体指导',
      summary: '客服回复敷衍，应提供具体的使用指导或手册链接。',
      confidence: 0.65,
      problemType: 'unknown',
      needReview: true,
      classifyReason: '置信度低且存在明显问题，需要审核',
      alertLevel: 'medium',
      hasAlert: true,
      createdAt: new Date('2026-04-17T15:00:35Z')
    }
  ];

  for (const eval_ of evaluations3) {
    await liveEvaluationsRepo.create(eval_);
  }
  console.log(`✅ 为 session_003 创建 ${evaluations3.length} 条质检记录`);

  console.log('\n');

  // 创建告警记录
  const alerts = [
    {
      id: 'alert_001',
      evaluationId: 'eval_002',
      sessionId: 'live_session_001',
      messageId: 'msg_004',
      alertLevel: 'medium',
      alertType: 'unknown',
      alertReason: 'problem_type=unknown 且 need_review=true，需要进入审核',
      status: 'open',
      createdAt: new Date('2026-04-18T10:01:40Z')
    },
    {
      id: 'alert_002',
      evaluationId: 'eval_004',
      sessionId: 'live_session_003',
      messageId: 'msg_008',
      alertLevel: 'medium',
      alertType: 'quality',
      alertReason: 'confidence=0.65 < 0.7 且分析结果指出问题明显',
      status: 'open',
      createdAt: new Date('2026-04-17T15:00:40Z')
    }
  ];

  for (const alert of alerts) {
    await alertsRepo.create(alert);
  }
  console.log(`✅ 创建 ${alerts.length} 条告警记录`);

  console.log('\n' + '='.repeat(60));
  console.log('测试数据生成完成!');
  console.log('='.repeat(60));
  console.log('\n数据统计:');
  console.log(`  Sessions: ${sessions.length}`);
  console.log(`  Messages: ${messages1.length + messages2.length + messages3.length}`);
  console.log(`  Evaluations: ${evaluations1.length + evaluations2.length + evaluations3.length}`);
  console.log(`  Alerts: ${alerts.length}`);
  console.log('\n现在可以运行测试脚本: node scripts/test-quality-query-api.js');
}

generateTestData().catch(err => {
  console.error('生成测试数据失败:', err);
  process.exit(1);
});
