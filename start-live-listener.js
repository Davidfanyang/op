#!/usr/bin/env node
/**
 * start-live-listener.js - TG 实时监听入口
 * 
 * 职责：
 * 1. 加载环境变量
 * 2. 校验必要配置
 * 3. 启动 TG 实时监听适配器
 * 4. 连接实时监听入口服务
 */

require('dotenv').config();

const { TGLiveListener } = require('./adapters/telegram/tg-live-listener');
const { LiveMessageIngestor } = require('./services/live-message-ingestor');
const { defaultBuilder: conversationBuilder } = require('./services/live-conversation-builder');
const { defaultService: liveEvaluationService } = require('./services/live-evaluation-service');

// 解析配置
const config = {
  token: process.env.TELEGRAM_BOT_TOKEN,
  enabled: process.env.TG_LIVE_ENABLED === 'true',
  chatIds: process.env.TG_LIVE_CHAT_IDS ? process.env.TG_LIVE_CHAT_IDS.split(',').map(id => id.trim()) : [],
  ignoreBotSelf: process.env.TG_IGNORE_BOT_SELF !== 'false' // 默认true
};

// 输出启动信息
console.log('='.repeat(60));
console.log('TG 实时监听入口启动');
console.log('='.repeat(60));
console.log(`时间: ${new Date().toISOString()}`);
console.log(`Node 版本: ${process.version}`);
console.log(`环境: ${process.env.NODE_ENV || 'development'}`);
console.log('='.repeat(60));
console.log(`TG_LIVE_ENABLED: ${config.enabled}`);
console.log(`TG_LIVE_CHAT_IDS: ${config.chatIds.length > 0 ? config.chatIds.join(', ') : '(不限制)'}`);
console.log(`TG_IGNORE_BOT_SELF: ${config.ignoreBotSelf}`);
console.log(`TELEGRAM_BOT_TOKEN: ${config.token ? config.token.substring(0, 10) + '...' : '(未配置)'}`);
console.log('='.repeat(60));

// 校验必要配置
if (!config.enabled) {
  console.log('\n⚠️  TG 实时监听未启用');
  console.log('请设置环境变量 TG_LIVE_ENABLED=true');
  process.exit(0);
}

if (!config.token) {
  console.error('\n❌ 启动失败：缺少 TELEGRAM_BOT_TOKEN');
  process.exit(1);
}

// 创建入口服务
const ingestor = new LiveMessageIngestor();

// 跟踪每个会话的上一次消息（用于判断新增消息）
const sessionLastMessageId = new Map();

// 注册会话拼接处理器
ingestor.onMessage(async (message) => {
  try {
    const conversationResult = await conversationBuilder.processMessage(message);
    
    console.log('\n' + '='.repeat(60));
    console.log('🔄 [会话拼接] 会话已更新');
    console.log('='.repeat(60));
    console.log(`群ID: ${conversationResult.chat_id}`);
    console.log(`会话Key: ${conversationResult.session_key}`);
    console.log(`对话轮次: ${conversationResult.conversation.length}`);
    console.log(`最后消息ID: ${conversationResult.last_message_id}`);
    console.log('='.repeat(60));
    
    // 判断当前消息是否是新增的（用于触发实时质检）
    const chatId = conversationResult.chat_id;
    const lastProcessedId = sessionLastMessageId.get(chatId);
    const isNewMessage = conversationResult.last_message_id !== lastProcessedId;
    
    if (isNewMessage) {
      // 更新最后处理的消息 ID
      sessionLastMessageId.set(chatId, conversationResult.last_message_id);
      
      // 获取当前消息对象（用于判断角色和触发分析）
      const currentMessage = {
        message_id: conversationResult.last_message_id,
        sender_id: message.sender_id,
        sender_name: message.sender_name,
        message_text: message.message_text,
        timestamp: message.timestamp,
        role: conversationResult.conversation.slice(-1)[0]?.role // 最后一条消息的角色
      };
      
      // 调用实时质检服务
      const evaluationResult = await liveEvaluationService.processConversation(
        conversationResult,
        currentMessage
      );
      
      if (evaluationResult.analyzed) {
        console.log('\n' + '='.repeat(60));
        console.log('✅ [实时质检] 分析完成');
        console.log('='.repeat(60));
        console.log(`评估ID: ${evaluationResult.evaluation.evaluationId}`);
        console.log(`场景: ${evaluationResult.evaluation.scenario || '未识别'}`);
        console.log(`结论: ${evaluationResult.evaluation.judgement || 'N/A'}`);
        console.log(`总结: ${evaluationResult.evaluation.summary || 'N/A'}`);
        console.log('='.repeat(60));
      }
    }
    
    // TODO: 后续接"已知/未知问题分流执行单"
    // - 根据 evaluationResult 进行问题分类
    // - 触发告警路由或知识沉淀
    
  } catch (err) {
    console.error('[实时链路] 处理失败:', err.message);
    console.error(err.stack);
  }
});

// 创建 TG 监听适配器
const listener = new TGLiveListener({
  token: config.token,
  enabled: config.enabled,
  chatIds: config.chatIds,
  ignoreBotSelf: config.ignoreBotSelf
});

// 启动监听
(async () => {
  try {
    console.log('\n🚀 正在启动 TG 实时监听...');
    
    await listener.start(async (standardMessage) => {
      // 将消息传递给入口服务
      await ingestor.ingest(standardMessage);
    });

    console.log('✅ TG 实时监听已启动\n');

    // 优雅退出
    process.on('SIGINT', async () => {
      console.log('\n\n正在停止监听...');
      await listener.stop();
      console.log('监听已停止');
      process.exit(0);
    });

  } catch (err) {
    console.error('\n❌ 启动失败:', err.message);
    process.exit(1);
  }
})();
