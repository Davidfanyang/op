/**
 * 实时监听入口服务
 * 
 * 职责：
 * 1. 接收统一对象（来自 TG 适配器或其他来源）
 * 2. 做最小校验
 * 3. 输出日志
 * 
 * 注意：
 * - 本阶段只做入口接入，不做分析、入库、拼接
 * - 后续可继续接"真实会话拼接执行单"
 */

class LiveMessageIngestor {
  constructor(options = {}) {
    this.handlers = []; // 消息处理链
  }

  /**
   * 注册消息处理器
   * @param {Function} handler - 处理函数，接收 standardMessage
   */
  onMessage(handler) {
    if (typeof handler !== 'function') {
      throw new Error('[LiveMessageIngestor] handler 必须是函数');
    }
    this.handlers.push(handler);
  }

  /**
   * 接收消息（入口函数）
   * @param {Object} standardMessage - 统一内部对象
   */
  async ingest(standardMessage) {
    // 1. 最小校验
    const validationResult = this._validate(standardMessage);
    if (!validationResult.valid) {
      console.error('[LiveMessageIngestor] 消息校验失败:', validationResult.error);
      return {
        success: false,
        error: validationResult.error
      };
    }

    console.log('[LiveMessageIngestor] 消息进入实时监听入口:', {
      source: standardMessage.source,
      entry_type: standardMessage.entry_type,
      chat_id: standardMessage.chat_id,
      message_id: standardMessage.message_id,
      sender_id: standardMessage.sender_id,
      message_text_preview: standardMessage.message_text?.substring(0, 50) || ''
    });

    // 2. 调用处理链
    for (const handler of this.handlers) {
      try {
        await handler(standardMessage);
      } catch (err) {
        console.error('[LiveMessageIngestor] 处理器错误:', err.message);
      }
    }

    return {
      success: true,
      message: '消息已进入实时监听入口'
    };
  }

  /**
   * 最小校验
   */
  _validate(message) {
    if (!message) {
      return { valid: false, error: '消息对象为空' };
    }

    // 必填字段校验
    const requiredFields = ['source', 'entry_type', 'chat_id', 'message_id', 'message_text'];
    for (const field of requiredFields) {
      if (message[field] === undefined || message[field] === null) {
        return { valid: false, error: `缺少必填字段: ${field}` };
      }
    }

    // 字段类型校验
    if (typeof message.source !== 'string') {
      return { valid: false, error: 'source 必须是字符串' };
    }

    if (typeof message.entry_type !== 'string') {
      return { valid: false, error: 'entry_type 必须是字符串' };
    }

    if (typeof message.chat_id !== 'string') {
      return { valid: false, error: 'chat_id 必须是字符串' };
    }

    if (typeof message.message_id !== 'number') {
      return { valid: false, error: 'message_id 必须是数字' };
    }

    if (typeof message.message_text !== 'string') {
      return { valid: false, error: 'message_text 必须是字符串' };
    }

    // 字段值校验
    if (message.message_text.trim() === '') {
      return { valid: false, error: 'message_text 不能为空字符串' };
    }

    return { valid: true };
  }
}

module.exports = { LiveMessageIngestor };
