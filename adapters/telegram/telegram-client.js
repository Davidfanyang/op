function createTelegramClient({ token }) {
  if (!token) throw new Error('缺少 TELEGRAM_BOT_TOKEN');
  const baseUrl = `https://api.telegram.org/bot${token}`;

  async function call(method, body) {
    const res = await fetch(`${baseUrl}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!data.ok) throw new Error(`${method} failed: ${JSON.stringify(data)}`);
    return data.result;
  }

  async function sendMessage(chatId, text) {
    return call('sendMessage', { chat_id: chatId, text });
  }

  async function getUpdates(offset) {
    return call('getUpdates', { offset, timeout: 10, allowed_updates: ['message'] });
  }

  return { call, sendMessage, getUpdates };
}

module.exports = { createTelegramClient };
