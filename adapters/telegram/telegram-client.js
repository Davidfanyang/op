function createTelegramClient({ token }) {
  if (!token) throw new Error('缺少 TELEGRAM_BOT_TOKEN');
  const baseUrl = `https://api.telegram.org/bot${token}`;

  async function call(method, body) {
    console.log(`[TELEGRAM API] 发起请求: ${method}`, JSON.stringify(body).slice(0, 100));
    try {
      const res = await fetch(`${baseUrl}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      
      if (!res.ok) {
        console.error(`[TELEGRAM API] HTTP 错误: ${res.status} ${res.statusText}`);
        throw new Error(`HTTP错误: ${res.status}`);
      }
      
      const data = await res.json();
      console.log(`[TELEGRAM API] 响应: ${method}`, JSON.stringify(data).slice(0, 100));
      
      if (!data.ok) {
        console.error(`[TELEGRAM API] API 错误: ${method} 失败:`, data);
        throw new Error(`${method} 失败: ${JSON.stringify(data)}`);
      }
      
      return data.result;
    } catch (err) {
      console.error(`[TELEGRAM API] 请求异常: ${method}`, err);
      throw err;
    }
  }

  async function sendMessage(chatId, text, options = {}) {
    return call('sendMessage', { chat_id: chatId, text, ...options });
  }

  async function getUpdates(offset, options = {}) {
    try {
      console.log(`[TELEGRAM API] 获取更新 offset=${offset}`);
      const updates = await call('getUpdates', { 
        offset,
        timeout: options.timeout || 30,
        allowed_updates: options.allowed_updates || ['message'],
        limit: options.limit || 100
      });
      if (updates && updates.length > 0) {
        console.log(`[TELEGRAM API] 收到 ${updates.length} 条更新`);
      }
      return updates;
    } catch (err) {
      console.error('[TELEGRAM API] getUpdates 失败:', err);
      throw err; // 让上层处理重试逻辑
    }
  }

  async function testConnection() {
    try {
      const me = await call('getMe', {});
      console.log(`[TELEGRAM API] 连接测试成功: @${me.username}`);
      return me;
    } catch (err) {
      console.error('[TELEGRAM API] 连接测试失败:', err.message);
      throw err;
    }
  }

  // 设置 webhook 或删除 webhook
  async function setWebhook(url) {
    return call('setWebhook', { url });
  }

  async function deleteWebhook() {
    try {
      await call('deleteWebhook', { drop_pending_updates: true });
      // 等待webhook完全删除
      console.log('[TELEGRAM API] 等待webhook删除完成...');
      await new Promise(resolve => setTimeout(resolve, 2000));
      return true;
    } catch (err) {
      console.error('[TELEGRAM API] 删除webhook失败:', err);
      throw err;
    }
  }

  async function getWebhookInfo() {
    return call('getWebhookInfo', {});
  }

  return { 
    call, 
    sendMessage, 
    getUpdates,
    testConnection,
    setWebhook,
    deleteWebhook,
    getWebhookInfo
  };
}

module.exports = { createTelegramClient };