const { evaluate } = require('../services/evaluation-service');
const { createTelegramClient } = require('../adapters/telegram/telegram-client');
const { formatResultMessage } = require('../app/telegram/formatter');
const { parseCommand, parseReviewCommand } = require('../app/telegram/commands');
const { getSession, setSession, clearSession } = require('../session/telegram-session');
const { updateReviewStatus } = require('../services/review-service');
const { ReviewStatus, FalsePositiveReason } = require('../core/constants/statuses');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const telegram = createTelegramClient({ token: process.env.TELEGRAM_BOT_TOKEN });
let offset = 0;
const scenarios = require('../data/scenarios.json');

const DEFAULT_PROJECT = 'default';
const DEFAULT_MODE = 'training';

async function handleTextMessage(chatId, text, userInfo = {}) {
  let session = getSession(chatId) || { index: -1, step: 'idle', projectId: DEFAULT_PROJECT };
  const normalized = String(text || '').trim();
  const command = parseCommand(normalized);

  // 处理 review 命令
  if (command === 'review') {
    await handleReviewCommand(chatId, normalized, userInfo);
    return;
  }

  // 处理 training 命令
  if (command === 'training_pending') {
    await handleTrainingPendingCommand(chatId, userInfo);
    return;
  }

  if (command === 'training_stats') {
    await handleTrainingStatsCommand(chatId, userInfo);
    return;
  }

  if (command === 'start' || command === 'next') {
    session.index = (session.index + 1) % scenarios.length;
    session.scenario = scenarios[session.index];
    session.step = 'await_reply';
    session.mode = DEFAULT_MODE;
    setSession(chatId, session);
    
    await telegram.sendMessage(chatId, `【话术训练 #${session.index + 1}】${session.scenario.title}\n\n问题：${session.scenario.customerMessage}\n\n请发送你的客服回复：`, { parse_mode: 'Markdown' });
    return;
  }

  if (command === 'cancel') {
    clearSession(chatId);
    await telegram.sendMessage(chatId, '已取消当前训练会话。发送 /start 重新开始。');
    return;
  }

  if (command === 'help') {
    await telegram.sendMessage(chatId, 
      '*可用命令：*\n' +
      '/start - 开始新的训练\n' +
      '/next - 下一题\n' +
      '/cancel - 取消当前会话\n' +
      '/review confirmed [备注] - 确认告警\n' +
      '/review false_positive [原因] [备注] - 标记误报\n' +
      '/review dismissed [备注] - 忽略告警\n' +
      '/training_pending - 查看训练待复核列表\n' +
      '/training_stats - 查看训练统计\n' +
      '/help - 显示帮助\n\n' +
      '训练时直接发送你的客服回复即可。',
      { parse_mode: 'Markdown' }
    );
    return;
  }

  if (session.step === 'await_reply') {
    // 构建标准协议输入结构
    const customerMessage = session.scenario?.customerMessage || '';
    const agentReply = normalized;
    
    const protocolInput = {
      // 1. project
      project: session.projectId || DEFAULT_PROJECT,
      
      // 2. conversation（多轮结构，role 统一为 user/agent）
      conversation: [
        {
          role: 'user',
          content: customerMessage,
          _meta: {
            turnIndex: 0,
            ts: new Date().toISOString()
          }
        },
        {
          role: 'agent',
          content: agentReply,
          _meta: {
            turnIndex: 1,
            ts: new Date().toISOString()
          }
        }
      ],
      
      // 3. current_reply（当前客服回复）
      current_reply: agentReply,
      
      // 4. metadata（必填字段）
      metadata: {
        source: 'telegram',
        session_id: `${chatId}_${session.scenario?.id || 'unknown'}_${Date.now()}`,
        agent_id: userInfo.username || userInfo.userId || 'unknown',
        timestamp: new Date().toISOString(),
        entry_type: 'training'
      },
      
      // 5. rules（无规则时传空对象）
      rules: {}
    };
    
    const result = await evaluate(protocolInput);
    
    const message = formatResultMessage(result, session.scenario, customerMessage, agentReply);
    await telegram.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    session.step = 'idle';
    setSession(chatId, session);
    return;
  }
  
  await telegram.sendMessage(chatId, "发送 /start 开始训练。\n/help 查看帮助\n（Bot已加载最新 FAQ 知识库，仅依据 FAQ 场景进行评估）");
}

/**
 * 处理 review 命令
 */
async function handleReviewCommand(chatId, text, userInfo) {
  const parsed = parseReviewCommand(text);
  
  if (!parsed) {
    await telegram.sendMessage(chatId, 
      '❌ 命令格式错误\n\n' +
      '正确格式：\n' +
      '`/review confirmed [备注]`\n' +
      '`/review false_positive [原因] [备注]`\n' +
      '`/review dismissed [备注]`\n\n' +
      '误报原因可选：\n' +
      '- threshold_too_sensitive\n' +
      '- dimension_mapping_strict\n' +
      '- model_understanding_limitation\n' +
      '- scenario_match_error\n' +
      '- other',
      { parse_mode: 'Markdown' }
    );
    return;
  }

  // 检查 false_positive 是否提供了原因
  if (parsed._missingReason) {
    await telegram.sendMessage(chatId,
      '❌ false_positive 必须提供误报原因\n\n' +
      '正确格式：\n' +
      '`/review false_positive threshold_too_sensitive 正常短回复被误报`\n\n' +
      '可选原因：\n' +
      '- threshold_too_sensitive\n' +
      '- dimension_mapping_strict\n' +
      '- model_understanding_limitation\n' +
      '- scenario_match_error\n' +
      '- other',
      { parse_mode: 'Markdown' }
    );
    return;
  }

  // 从回复的消息中获取 sessionId
  // 注意：这里假设用户是在回复某条告警消息
  // 实际实现可能需要从消息上下文中获取
  const sessionId = userInfo.replyToMessage?.text?.match(/会话ID:\s*`?(\S+)`?/)?.[1];
  
  if (!sessionId) {
    await telegram.sendMessage(chatId,
      '❌ 无法确定要复核的会话\n\n' +
      '请回复告警消息后再使用 /review 命令',
      { parse_mode: 'Markdown' }
    );
    return;
  }

  // 执行复核更新
  const result = updateReviewStatus({
    sessionId,
    reviewStatus: parsed.reviewStatus,
    reviewedBy: userInfo.username || userInfo.userId || 'unknown',
    reviewComment: parsed.reviewComment,
    falsePositiveReason: parsed.falsePositiveReason
  });

  if (!result.success) {
    await telegram.sendMessage(chatId,
      `❌ 复核失败\n\n错误: ${result.error.message}`,
      { parse_mode: 'Markdown' }
    );
    return;
  }

  // 发送确认消息
  const data = result.data;
  let confirmMessage = '';
  
  switch (data.reviewStatus) {
    case ReviewStatus.CONFIRMED:
      confirmMessage += '✅ *复核已更新*\n\n';
      break;
    case ReviewStatus.FALSE_POSITIVE:
      confirmMessage += '🔄 *复核已更新*\n\n';
      break;
    case ReviewStatus.DISMISSED:
      confirmMessage += '🚫 *复核已更新*\n\n';
      break;
  }
  
  confirmMessage += `*会话ID:* \`${data.sessionId || sessionId}\`\n`;
  confirmMessage += `*复核状态:* ${data.reviewStatus}\n`;
  confirmMessage += `*复核人:* ${data.reviewedBy}\n`;
  
  if (data.falsePositiveReason) {
    confirmMessage += `*误报原因:* ${data.falsePositiveReason}\n`;
  }
  
  if (data.reviewComment) {
    confirmMessage += `*备注:* ${data.reviewComment}\n`;
  }
  
  await telegram.sendMessage(chatId, confirmMessage, { parse_mode: 'Markdown' });
}

/**
 * 处理 /training_pending 命令
 */
async function handleTrainingPendingCommand(chatId, userInfo) {
  try {
    const { RepositoryFactory } = require('../repositories');
    const repos = RepositoryFactory.getMySQLRepositories();
    
    const result = await repos.review.findTrainingPending('default', {}, { page: 1, limit: 10 });
    
    if (result.total === 0) {
      await telegram.sendMessage(chatId, '✅ 当前没有待复核的训练记录');
      return;
    }
    
    let message = `📋 *训练待复核列表* (${result.total} 条)\n\n`;
    
    result.items.forEach((item, index) => {
      message += `${index + 1}. *${item.alertLevel}* - ${item.sessionId}\n`;
      message += `   创建时间: ${new Date(item.createdAt).toLocaleString('zh-CN')}\n\n`;
    });
    
    message += '_使用 /review 命令复核具体会话_';
    
    await telegram.sendMessage(chatId, message, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('[TrainingPending] 查询失败:', error.message);
    await telegram.sendMessage(chatId, `❌ 查询失败: ${error.message}`, { parse_mode: 'Markdown' });
  }
}

/**
 * 处理 /training_stats 命令
 */
async function handleTrainingStatsCommand(chatId, userInfo) {
  try {
    const { RepositoryFactory } = require('../repositories');
    const repos = RepositoryFactory.getMySQLRepositories();
    
    const stats = await repos.review.getTrainingStats('default', {});
    
    let message = `📊 *训练统计*\n\n`;
    message += `*总计:* ${stats.total} 条记录\n\n`;
    
    message += '*按状态分布:*\n';
    for (const [status, data] of Object.entries(stats.byStatus)) {
      message += `- ${status}: ${data.count} 条`;
      if (data.avgScore) message += ` (平均分: ${data.avgScore})`;
      message += '\n';
    }
    
    message += '\n*按告警级别:*\n';
    for (const [level, count] of Object.entries(stats.byAlertLevel)) {
      message += `- ${level}: ${count} 条\n`;
    }
    
    await telegram.sendMessage(chatId, message, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('[TrainingStats] 查询失败:', error.message);
    await telegram.sendMessage(chatId, `❌ 查询失败: ${error.message}`, { parse_mode: 'Markdown' });
  }
}

async function pollLoop() {
  console.log('[Telegram Bot] 启动轮询...');
  while (true) {
    try {
      const updates = await telegram.getUpdates(offset);
      for (const update of updates) {
        offset = update.update_id + 1;
        if (update.message?.text) {
          const userInfo = {
            userId: update.message.from?.id,
            username: update.message.from?.username,
            replyToMessage: update.message.reply_to_message
          };
          await handleTextMessage(update.message.chat.id, update.message.text, userInfo);
        }
      }
    } catch (err) { 
      console.error('[Telegram Bot] 轮询错误:', err.message);
      await new Promise(r => setTimeout(r, 2000)); 
    }
  }
}

if (require.main === module) {
  pollLoop();
}

module.exports = { pollLoop, handleTextMessage };
