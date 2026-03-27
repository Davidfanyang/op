const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { evaluateTraining } = require('../core/trainer');
const scenarios = require('../data/scenarios.json');
const { resetSession, getSession } = require('../session/telegram-session');
const { formatResultMessage, formatUsage, formatScenarioPrompt, formatScenarioSelected, formatCustomerMessageRecorded } = require('../app/telegram/formatter');
const { parseCommand } = require('../app/telegram/commands');
const { createTelegramClient } = require('../adapters/telegram/telegram-client');

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error('缺少 TELEGRAM_BOT_TOKEN');
  process.exit(1);
}

const LOCK_PATH = path.resolve(__dirname, '..', 'runtime', 'locks', 'telegram-bot.lock');
let lockFd = null;
function acquireLock() {
  try {
    lockFd = fs.openSync(LOCK_PATH, 'wx');
    fs.writeFileSync(LOCK_PATH, String(process.pid));
  } catch (err) {
    if (err.code === 'EEXIST') {
      const pid = fs.existsSync(LOCK_PATH) ? fs.readFileSync(LOCK_PATH, 'utf8').trim() : 'unknown';
      console.error(`已有 Telegram bot 实例在运行，lock pid=${pid}`);
      process.exit(1);
    }
    throw err;
  }
}
function releaseLock() {
  try { if (lockFd) fs.closeSync(lockFd); } catch {}
  try { if (fs.existsSync(LOCK_PATH)) fs.unlinkSync(LOCK_PATH); } catch {}
}
process.on('exit', releaseLock);
process.on('SIGINT', () => { releaseLock(); process.exit(0); });
process.on('SIGTERM', () => { releaseLock(); process.exit(0); });
acquireLock();

const telegram = createTelegramClient({ token });
let offset = 0;
function getScenarioByInput(input) {
  const text = String(input || '').trim();
  if (/^\d+$/.test(text)) return scenarios[Number(text) - 1] || null;
  return scenarios.find((s) => s.id === text) || null;
}
async function sendUsage(chatId) {
  return telegram.sendMessage(chatId, formatUsage());
}
async function handleTextMessage(chatId, text) {
  const session = getSession(chatId);
  const normalized = String(text || '').trim();
  const command = parseCommand(normalized);

  if (command === 'start') {
    resetSession(chatId);
    await telegram.sendMessage(chatId, '客服训练 Bot 已连接。');
    await sendUsage(chatId);
    return;
  }
  if (command === 'score') {
    session.step = 'await_scenario';
    session.scenario = null;
    session.customerMessage = '';
    await sendMessage(chatId, formatScenarioPrompt(scenarios));
    return;
  }
  if (command === 'cancel') {
    resetSession(chatId);
    await telegram.sendMessage(chatId, '已取消当前流程。');
    return;
  }
  if (session.step === 'await_scenario') {
    const scenario = getScenarioByInput(normalized);
    if (!scenario) {
      await telegram.sendMessage(chatId, '场景无效，请回复场景编号。');
      return;
    }
    session.scenario = scenario;
    session.step = 'await_customer_message';
    await telegram.sendMessage(chatId, formatScenarioSelected(scenario.title));
    return;
  }
  if (session.step === 'await_customer_message') {
    session.customerMessage = normalized === '默认' ? session.scenario.customerMessage : normalized;
    session.step = 'await_user_reply';
    await telegram.sendMessage(chatId, formatCustomerMessageRecorded(session.customerMessage));
    return;
  }
  if (session.step === 'await_user_reply') {
    const scenario = session.scenario;
    const customerMessage = session.customerMessage || scenario.customerMessage;
    const result = evaluateTraining({ scenarioId: scenario.id, userReply: normalized });
    const message = formatResultMessage(result, scenario, customerMessage, normalized);
    resetSession(chatId);
    await telegram.sendMessage(chatId, message);
    return;
  }
  await sendUsage(chatId);
}
async function pollLoop() {
  while (true) {
    try {
      const updates = await telegram.getUpdates(offset);
      for (const update of updates) {
        offset = update.update_id + 1;
        const msg = update.message;
        if (!msg || !msg.text) continue;
        console.log('[UPDATE]', JSON.stringify({ chatId: msg.chat.id, text: msg.text }));
        await handleTextMessage(msg.chat.id, msg.text.trim());
      }
    } catch (err) {
      console.error('[POLL ERROR]', err.message);
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
}
console.log('Telegram 对练评分机器人已启动');
pollLoop();
