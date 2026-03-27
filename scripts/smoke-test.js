const path = require('path');
const dotenv = require('dotenv');
const { evaluateTraining } = require('../core/trainer');
const scenarios = require('../data/scenarios.json');

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error('缺少 TELEGRAM_BOT_TOKEN');
  process.exit(1);
}

const baseUrl = `https://api.telegram.org/bot${token}`;
let offset = 0;
const sessions = new Map();

function resetSession(chatId) {
  sessions.set(chatId, { step: 'idle', scenario: null, customerMessage: '' });
}

function getSession(chatId) {
  if (!sessions.has(chatId)) resetSession(chatId);
  return sessions.get(chatId);
}

function getScenarioList() {
  return scenarios.map((s, i) => `${i + 1}. ${s.title}`).join('\n');
}

function getScenarioByInput(input) {
  const text = String(input || '').trim();
  if (/^\d+$/.test(text)) return scenarios[Number(text) - 1] || null;
  return scenarios.find((s) => s.id === text) || null;
}

function buildResultMessage(result, scenario, customerMessage, userReply) {
  return [
    `场景：${scenario.title}`,
    `用户消息：${customerMessage}`,
    `客服回复：${userReply}`,
    '',
    `总分：${result.score}`,
    `总结：${result.coachSummary}`,
    '',
    '问题项：',
    ...result.findings.map((f) => `- ${f.message}`),
    '',
    '建议：',
    ...result.suggestions.map((s) => `- ${s}`),
    '',
    '标准回复：',
    result.standardReply,
    '',
    '发送 /score 继续测试'
  ].join('\n');
}

async function tg(method, body) {
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
  return tg('sendMessage', { chat_id: chatId, text });
}

async function handleTextMessage(chatId, text) {
  const session = getSession(chatId);

  if (text === '/start') {
    resetSession(chatId);
    await sendMessage(chatId, '客服训练 Bot 已连接。\n发送 /score 开始评分。');
    return;
  }

  if (text === '/score') {
    session.step = 'await_scenario';
    await sendMessage(chatId, `请选择场景，回复编号即可：\n${getScenarioList()}`);
    return;
  }

  if (text === '/cancel') {
    resetSession(chatId);
    await sendMessage(chatId, '已取消当前流程。');
    return;
  }

  if (session.step === 'await_scenario') {
    const scenario = getScenarioByInput(text);
    if (!scenario) {
      await sendMessage(chatId, '场景无效，请回复编号。');
      return;
    }
    session.scenario = scenario;
    session.step = 'await_customer_message';
    await sendMessage(chatId, '请发送用户消息，或者发“默认”使用系统默认问题。');
    return;
  }

  if (session.step === 'await_customer_message') {
    session.customerMessage = text === '默认' ? session.scenario.customerMessage : text;
    session.step = 'await_user_reply';
    await sendMessage(chatId, '请发送客服回复。');
    return;
  }

  if (session.step === 'await_user_reply') {
    const scenario = session.scenario;
    const customerMessage = session.customerMessage || scenario.customerMessage;
    const result = evaluateTraining({ scenarioId: scenario.id, userReply: text });
    const message = buildResultMessage(result, scenario, customerMessage, text);
    resetSession(chatId);
    await sendMessage(chatId, message);
    return;
  }

  await sendMessage(chatId, '发送 /score 开始测试。');
}

async function pollLoop() {
  while (true) {
    try {
      const updates = await tg('getUpdates', { offset, timeout: 10, allowed_updates: ['message'] });
      for (const update of updates) {
        offset = update.update_id + 1;
        const msg = update.message;
        if (!msg || !msg.text) continue;
        console.log('[UPDATE_RAW]', JSON.stringify({ chatId: msg.chat.id, text: msg.text }));
        await handleTextMessage(msg.chat.id, msg.text.trim());
      }
    } catch (err) {
      console.error('[POLL ERROR]', err.message);
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
}

console.log('tg-debug trainer mode 已启动');
pollLoop();
