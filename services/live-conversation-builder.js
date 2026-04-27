/**
 * 实时会话拼接模块
 * 
 * 职责：
 * 1. 根据 chat_id 识别当前实时会话
 * 2. 根据时间窗口判断是否开启新会话（超时 10 分钟）
 * 3. 识别消息角色（user / agent）
 * 4. 把消息拼接为多轮 conversation
 * 5. 按 message_id 去重
 * 6. 输出标准 conversation 对象
 * 
 * 会话规则：
 * - 同 chat_id 的消息归属同一会话
 * - 超时时间 10 分钟（600000ms）
 * - 超时则生成新 session_key
 * - 训练会话与实时会话完全隔离
 * 
 * 输出结构：
 * {
 *   chat_id: string,
 *   session_key: string,
 *   conversation: [
 *     { role: 'user' | 'agent', content: string, timestamp: string }
 *   ],
 *   last_message_id: number,
 *   updated_at: string
 * }
 */

const { v4: uuidv4 } = require('uuid');

// 内存存储：实时会话数据
const liveSessions = new Map();

// 配置常量
const SESSION_TIMEOUT_MS = 10 * 60 * 1000; // 10 分钟
const MAX_CONVERSATION_LENGTH = 100; // 单会话最大消息数

/**
 * LiveConversationBuilder 类
 */
class LiveConversationBuilder {
  constructor(options = {}) {
    this.timeoutMs = options.timeoutMs || SESSION_TIMEOUT_MS;
    this.maxConversationLength = options.maxConversationLength || MAX_CONVERSATION_LENGTH;
  }

  /**
   * 处理单条消息，拼接为会话
   * @param {Object} standardMessage - 标准消息对象（来自 LiveMessageIngestor）
   * @returns {Object} 会话对象
   */
  async processMessage(standardMessage) {
    // 1. 校验消息
    this._validateMessage(standardMessage);

    const { chat_id, message_id, sender_id, sender_name, message_text, timestamp } = standardMessage;
    const chatIdStr = String(chat_id);
    const msgTimestamp = new Date(timestamp || Date.now()).getTime();

    // 2. 查找或创建会话
    let session = this._getOrCreateSession(chatIdStr, msgTimestamp);

    // 3. 去重：检查 message_id 是否已存在
    if (this._isDuplicate(session, message_id)) {
      console.log('[LiveConversationBuilder] 消息已去重:', {
        chat_id: chatIdStr,
        message_id,
        session_key: session.session_key
      });
      return this._buildOutput(session);
    }

    // 4. 识别消息角色
    const role = this._identifyRole(standardMessage, session);

    // 5. 添加到 conversation
    session.conversation.push({
      role,
      content: message_text,
      timestamp: new Date(msgTimestamp).toISOString()
    });

    // 6. 更新会话元数据
    session.last_message_id = message_id;
    session.updated_at = new Date(msgTimestamp).toISOString();
    session.message_ids.add(message_id); // 记录已处理的 message_id

    // 7. 限制 conversation 长度
    if (session.conversation.length > this.maxConversationLength) {
      // 移除最旧的消息，但保留 message_ids 用于去重
      session.conversation = session.conversation.slice(-this.maxConversationLength);
    }

    console.log('[LiveConversationBuilder] 消息已拼接:', {
      chat_id: chatIdStr,
      session_key: session.session_key,
      role,
      message_id,
      conversation_length: session.conversation.length
    });

    // 8. 输出标准会话对象
    return this._buildOutput(session);
  }

  /**
   * 获取会话（用于查询/调试）
   * @param {string} chat_id 
   * @returns {Object|null}
   */
  getSession(chat_id) {
    const chatIdStr = String(chat_id);
    const session = liveSessions.get(chatIdStr);
    if (!session) return null;
    return this._buildOutput(session);
  }

  /**
   * 获取所有活跃会话（用于调试/监控）
   * @returns {Array}
   */
  getAllSessions() {
    return Array.from(liveSessions.values()).map(session => this._buildOutput(session));
  }

  /**
   * 清理过期会话
   */
  cleanupExpiredSessions() {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [chatId, session] of liveSessions) {
      const lastActivity = new Date(session.updated_at).getTime();
      if (now - lastActivity > this.timeoutMs) {
        liveSessions.delete(chatId);
        cleanedCount++;
        console.log('[LiveConversationBuilder] 清理过期会话:', {
          chat_id: chatId,
          session_key: session.session_key,
          last_activity: session.updated_at
        });
      }
    }

    if (cleanedCount > 0) {
      console.log('[LiveConversationBuilder] 清理完成:', { cleaned_count: cleanedCount });
    }

    return cleanedCount;
  }

  /**
   * 获取会话数量
   * @returns {number}
   */
  size() {
    return liveSessions.size;
  }

  // ==================== 私有方法 ====================

  /**
   * 校验消息格式
   */
  _validateMessage(message) {
    if (!message) {
      throw new Error('[LiveConversationBuilder] 消息对象为空');
    }

    const requiredFields = ['chat_id', 'message_id', 'message_text'];
    for (const field of requiredFields) {
      if (message[field] === undefined || message[field] === null) {
        throw new Error(`[LiveConversationBuilder] 缺少必填字段: ${field}`);
      }
    }

    if (typeof message.chat_id !== 'string') {
      throw new Error('[LiveConversationBuilder] chat_id 必须是字符串');
    }

    if (typeof message.message_id !== 'number') {
      throw new Error('[LiveConversationBuilder] message_id 必须是数字');
    }

    if (typeof message.message_text !== 'string' || message.message_text.trim() === '') {
      throw new Error('[LiveConversationBuilder] message_text 必须是非空字符串');
    }
  }

  /**
   * 获取或创建会话
   */
  _getOrCreateSession(chatId, msgTimestamp) {
    const existingSession = liveSessions.get(chatId);

    // 如果不存在，创建新会话
    if (!existingSession) {
      return this._createSession(chatId, msgTimestamp);
    }

    // 检查是否超时
    const lastActivity = new Date(existingSession.updated_at).getTime();
    const timeDiff = msgTimestamp - lastActivity;

    if (timeDiff > this.timeoutMs) {
      console.log('[LiveConversationBuilder] 会话超时，创建新会话:', {
        chat_id: chatId,
        old_session_key: existingSession.session_key,
        timeout_ms: timeDiff
      });
      // 超时，创建新会话
      return this._createSession(chatId, msgTimestamp);
    }

    // 未超时，继续使用现有会话
    return existingSession;
  }

  /**
   * 创建新会话
   */
  _createSession(chatId, msgTimestamp) {
    const sessionKey = `live_${chatId}_${uuidv4()}`;
    const now = new Date(msgTimestamp).toISOString();

    const session = {
      chat_id: chatId,
      session_key: sessionKey,
      conversation: [],
      message_ids: new Set(), // 用于去重
      last_message_id: null,
      created_at: now,
      updated_at: now
    };

    liveSessions.set(chatId, session);

    console.log('[LiveConversationBuilder] 创建新会话:', {
      chat_id: chatId,
      session_key: sessionKey
    });

    return session;
  }

  /**
   * 检查消息是否重复
   */
  _isDuplicate(session, messageId) {
    return session.message_ids.has(messageId);
  }

  /**
   * 识别消息角色
   * 
   * 角色识别规则：
   * - 通过 sender_id 判断
   * - 第一条消息的角色作为基准
   * - 后续消息根据 sender_id 与基准对比
   * 
   * @param {Object} message - 标准消息对象
   * @param {Object} session - 当前会话
   * @returns {string} 'user' | 'agent'
   */
  _identifyRole(message, session) {
    const { sender_id } = message;

    // 如果是第一条消息，需要判断角色
    if (session.conversation.length === 0) {
      // 默认规则：
      // - 如果 sender_id 与 botId 相同，则为 agent
      // - 否则为 user
      // 注意：botId 由外部设置，如果未设置则默认为 null
      
      const isBot = sender_id === this.botId;
      const role = isBot ? 'agent' : 'user';

      // 记录第一个发送者的 ID 作为基准
      session.first_sender_id = sender_id;
      session.first_role = role;

      console.log('[LiveConversationBuilder] 识别首条消息角色:', {
        sender_id,
        role,
        is_bot: isBot
      });

      return role;
    }

    // 后续消息：根据 sender_id 与首条消息对比
    if (sender_id === session.first_sender_id) {
      return session.first_role;
    }

    // 与首条消息发送者不同，则为另一方
    return session.first_role === 'user' ? 'agent' : 'user';
  }

  /**
   * 构建标准输出对象
   */
  _buildOutput(session) {
    return {
      chat_id: session.chat_id,
      session_key: session.session_key,
      conversation: session.conversation.map(msg => ({
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp
      })),
      last_message_id: session.last_message_id,
      updated_at: session.updated_at
    };
  }
}

// 导出类和单例
const defaultBuilder = new LiveConversationBuilder();

module.exports = {
  LiveConversationBuilder,
  defaultBuilder
};
