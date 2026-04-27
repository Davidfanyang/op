{
  session: {
    id: 3,
    sessionId: 'test_a9326e39-c748-45d1-aa7b-2f43c61731d7',
    project: 'default',
    scenarioId: 'test_scenario_001',
    scenarioTitle: '测试场景 - 产品咨询',
    agentId: 'test_agent_001',
    chatId: '123456789',
    status: 'finished',
    totalRounds: 2,
    startedAt: '2026-04-17T11:41:22.000Z',
    finishedAt: '2026-04-17T11:41:22.000Z',
    createdAt: '2026-04-17T11:41:22.000Z',
    updatedAt: '2026-04-17T11:41:22.000Z'
  },
  messages: [
    {
      id: 5,
      sessionId: 'test_a9326e39-c748-45d1-aa7b-2f43c61731d7',
      round: 0,
      role: 'user',
      content: '你好，我想问一下产品怎么用？',
      source: 'ai',
      createdAt: '2026-04-17T11:41:22.000Z'
    },
    {
      id: 6,
      sessionId: 'test_a9326e39-c748-45d1-aa7b-2f43c61731d7',
      round: 0,
      role: 'agent',
      content: '您好！很高兴为您服务。请问您想了解产品的哪个方面？',
      source: 'human',
      createdAt: '2026-04-17T11:41:22.000Z'
    },
    {
      id: 7,
      sessionId: 'test_a9326e39-c748-45d1-aa7b-2f43c61731d7',
      round: 1,
      role: 'user',
      content: '我想了解具体的操作步骤',
      source: 'ai',
      createdAt: '2026-04-17T11:41:22.000Z'
    },
    {
      id: 8,
      sessionId: 'test_a9326e39-c748-45d1-aa7b-2f43c61731d7',
      round: 1,
      role: 'agent',
      content: '好的，以下是详细操作步骤：1. 登录系统 2. 进入设置页面 3. 点击配置按钮...',
      source: 'human',
      createdAt: '2026-04-17T11:41:22.000Z'
    }
  ],
  roundResults: [
    {
      id: 3,
      sessionId: 'test_a9326e39-c748-45d1-aa7b-2f43c61731d7',
      round: 0,
      scenarioId: 'test_scenario_001',
      scenarioTitle: '测试场景 - 产品咨询',
      analysisRaw: {
        riskLevel: 'low',
        result: { level: 'pass', score: 85 },
        issues: ['回复可以更加具体'],
        strengths: ['态度友善', '及时响应'],
        missing: ['未提供具体操作步骤']
      },
      feedbackText: '本轮表现不错，态度友善，但可以更具体一些。',
      structuredFeedback: {
        scenario_id: 'test_scenario_001',
        scenario_title: '测试场景 - 产品咨询',
        round: 1,
        strengths: ['态度友善', '及时响应'],
        problems: ['回复可以更加具体'],
        missing: ['未提供具体操作步骤'],
        suggestions: ['补充具体操作步骤'],
        is_finished: false,
        status: 'continuing',
        generated_at: '2026-04-17T11:41:22.000Z'
      },
      isFinished: false,
      createdAt: '2026-04-17T11:41:22.000Z'
    },
    {
      id: 4,
      sessionId: 'test_a9326e39-c748-45d1-aa7b-2f43c61731d7',
      round: 1,
      scenarioId: 'test_scenario_001',
      scenarioTitle: '测试场景 - 产品咨询',
      analysisRaw: {
        riskLevel: 'none',
        result: { level: 'pass', score: 95 },
        issues: [],
        strengths: ['步骤详细', '逻辑清晰', '表达专业'],
        missing: []
      },
      feedbackText: '本轮表现优秀，步骤详细且清晰！',
      structuredFeedback: {
        scenario_id: 'test_scenario_001',
        round: 2,
        strengths: ['步骤详细', '逻辑清晰', '表达专业'],
        problems: [],
        missing: [],
        suggestions: ['保持当前的服务质量'],
        is_finished: true,
        status: 'finished',
        generated_at: '2026-04-17T11:41:22.000Z'
      },
      isFinished: true,
      createdAt: '2026-04-17T11:41:22.000Z'
    }
  ],
  totalRounds: 2,
  status: 'finished'
}
