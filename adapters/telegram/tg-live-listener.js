/**
 * TG 实时监听适配器
 * 
 * 职责：
 * 1. 接收 Telegram 真实消息（通过 long polling）
 * 2. 过滤无效消息
 * 3. 转换为统一内部对象
 * 
 * 统一对象结构：
 * {
 *   source: 'telegram',
 *   entry_type: 'live_monitor',
 *   chat_id: string,
 *   message_id: number,
 *   sender_id: number,
 *   sender_name: string,
 *   message_text: string,
 *   timestamp: ISO8601,
 *   raw_event: object
 * }
 */

const { createTelegramClient } = require('./telegram-client');

class TGLiveListener {
  constructor(options = {}) {
    this.token = options.token || process.env.TELEGRAM_BOT_TOKEN;
    this.enabled = options.enabled !== false;
    this.chatIds = options.chatIds || []; // 允许监听的群ID列表，空表示不限制
    this.ignoreBotSelf = options.ignoreBotSelf !== false; // 默认忽略 Bot 自己的消息
    
    this.telegram = null;
    this.offset = 0;
    this.isRunning = false;
    this.messageHandler = null; // 外部传入的消息处理函数
    
    // Bot 自身的 ID（启动后获取）
    this.botId = null;
  }

  /**
   * 启动监听
   */
  async start(messageHandler) {
    if (!this.enabled) {
      console.log('[TGLiveListener] 实时监听未启用（TG_LIVE_ENABLED=false）');
      return;
    }

    if (!this.token) {
      throw new Error('[TGLiveListener] 缺少 TELEGRAM_BOT_TOKEN');
    }

    this.messageHandler = messageHandler;
    this.telegram = createTelegramClient({ token: this.token });

    // 获取 Bot 自身信息
    try {
      const botInfo = await this.telegram.testConnection();
      this.botId = botInfo.id;
      console.log(`[TGLiveListener] Bot 已连接: @${botInfo.username} (ID: ${botInfo.id})`);
    } catch (err) {
      throw new Error(`[TGLiveListener] Bot 连接失败: ${err.message}`);
    }

    this.isRunning = true;
    console.log('[TGLiveListener] 开始轮询监听消息...');
    
    // 启动轮询
    this._pollLoop();
  }

  /**
   * 停止监听
   */
  async stop() {
    this.isRunning = false;
    console.log('[TGLiveListener] 监听已停止');
  }

  /**
   * 轮询循环
   */
  async _pollLoop() {
    while (this.isRunning) {
      try {
        const updates = await this.telegram.getUpdates(this.offset, {
          timeout: 30,
          allowed_updates: ['message']
        });

        for (const update of updates) {
          this.offset = update.update_id + 1;
          
          // 处理消息
          if (update.message) {
            this._processMessage(update.message);
          }
        }
      } catch (err) {
        console.error('[TGLiveListener] 轮询错误:', err.message);
        // 错误后等待2秒再重试
        await new Promise(r => setTimeout(r, 2000));
      }
    }
  }

  /**
   * 处理单条消息
   */
  _processMessage(message) {
    console.log('[TGLiveListener] 收到消息:', {
      message_id: message.message_id,
      chat_id: message.chat?.id,
      from: message.from?.username || message.from?.id
    });

    // 1. 过滤：Bot 自己的消息
    if (this.ignoreBotSelf && message.from?.id === this.botId) {
      console.log('[TGLiveListener] 过滤：Bot 自己的消息');
      return;
    }

    // 2. 过滤：系统消息（new_chat_members, left_chat_member 等）
    if (message.new_chat_members || message.left_chat_member || 
        message.new_chat_title || message.new_chat_photo || 
        message.delete_chat_photo || message.group_chat_created ||
        message.supergroup_chat_created || message.channel_chat_created ||
        message.migrate_to_chat_id || message.migrate_from_chat_id) {
      console.log('[TGLiveListener] 过滤：系统消息');
      return;
    }

    // 3. 过滤：空消息
    if (!message.text && !message.caption) {
      console.log('[TGLiveListener] 过滤：空消息（无文本）');
      return;
    }

    // 4. 过滤：非指定群消息（如果配置了 chatIds）
    if (this.chatIds.length > 0 && !this.chatIds.includes(String(message.chat.id))) {
      console.log('[TGLiveListener] 过滤：非指定群消息', {
        chat_id: message.chat.id,
        allowed: this.chatIds
      });
      return;
    }

    // 5. 转换为统一内部对象
    const standardMessage = this._toStandardObject(message);

    console.log('[TGLiveListener] 标准对象生成成功:', {
      source: standardMessage.source,
      entry_type: standardMessage.entry_type,
      chat_id: standardMessage.chat_id,
      sender_id: standardMessage.sender_id,
      message_text_length: standardMessage.message_text?.length || 0
    });

    // 6. 调用外部处理函数
    if (this.messageHandler) {
      try {
        this.messageHandler(standardMessage);
      } catch (err) {
        console.error('[TGLiveListener] 消息处理函数错误:', err.message);
      }
    }
  }

  /**
   * 转换为统一内部对象
   */
  _toStandardObject(message) {
    return {
      source: 'telegram',
      entry_type: 'live_monitor',
      chat_id: String(message.chat.id),
      message_id: message.message_id,
      sender_id: message.from?.id || null,
      sender_name: message.from?.username || message.from?.first_name || 'unknown',
      message_text: message.text || message.caption || '',
      timestamp: new Date(message.date * 1000).toISOString(), // Telegram 使用 Unix timestamp
      raw_event: message
    };
  }
}

module.exports = { TGLiveListener };
