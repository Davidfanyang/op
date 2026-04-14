#!/usr/bin/env node
/**
 * 测试 Conversation Signals Service
 */

const ConversationSignalsService = require('../core/conversation-signals');

async function test() {
  const service = new ConversationSignalsService({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'pai_dashboard'
  });

  try {
    console.log('='.repeat(80));
    console.log('🧪 Testing Conversation Signals Service');
    console.log('='.repeat(80));
    console.log();

    // 1. 测试全局统计
    console.log('【1】全局运营统计');
    console.log('-'.repeat(80));
    const globalStats = await service.getGlobalStats();
    console.log(JSON.stringify(globalStats, null, 2));
    console.log();

    // 2. 测试单个会话信号
    console.log('【2】单个会话信号 (conversation_id=8)');
    console.log('-'.repeat(80));
    const signals = await service.getSignalsByConversation(8);
    console.log(JSON.stringify(signals, null, 2));
    console.log();

    // 3. 测试按客服统计 (全部)
    console.log('【3】按客服统计 (全部)');
    console.log('-'.repeat(80));
    const allAgents = await service.getSignalsByAgent(null);
    console.log(`共 ${allAgents.length} 名客服`);
    console.log('客服\t\t会话数\topen\tinvalid\tSLA超时\t高消息\t平均首响');
    console.log('-'.repeat(100));
    allAgents.forEach(agent => {
      const tag = agent.agent_tag.padEnd(12, ' ');
      console.log(
        `${tag}\t${agent.total_conversations}\t${agent.open_count}\t${agent.invalid_count}\t` +
        `${agent.sla_risk_count}\t\t${agent.high_message_count}\t${agent.avg_first_response}s`
      );
    });
    console.log();

    // 4. 测试按客服统计 (单个)
    console.log('【4】单个客服统计 (玲玲)');
    console.log('-'.repeat(80));
    const lingling = await service.getSignalsByAgent('玲玲');
    console.log(JSON.stringify(lingling, null, 2));
    console.log();

    // 5. 测试风险会话查询
    console.log('【5】风险会话查询 (SLA风险, 限制5条)');
    console.log('-'.repeat(80));
    const riskConversations = await service.getRiskConversations({
      includeSlaRisk: true,
      includeInvalid: false,
      includeUnclosed: false,
      includeHighMessage: false,
      limit: 5
    });
    console.log(`找到 ${riskConversations.length} 条风险会话`);
    riskConversations.forEach(conv => {
      console.log(
        `ID:${conv.conversation_id}\t客服:${conv.agent_tag}\t` +
        `首响:${conv.first_response_seconds}s\tSLA风险:${conv.is_sla_risk}`
      );
    });
    console.log();

    console.log('='.repeat(80));
    console.log('✅ All tests passed');
    console.log('='.repeat(80));

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
  } finally {
    await service.destroy();
  }
}

test();
