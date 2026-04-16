/**
 * Smoke Test - TG Debug Trainer Mode
 * 
 * 协议版本: 
 * - 输入: 标准协议 v1.0
 * - 输出: 标准输出协议 v1.0 (scenarioId, scenarioName, stage, result, riskLevel, issues, missing, strengths, nextAction, coachSummary, confidence)
 * 
 * 用法: node tests/smoke-test.js
 * 需要: TELEGRAM_BOT_TOKEN 环境变量
 */

const path = require('path');
const dotenv = require('dotenv');
const { evaluate } = require('../services/evaluation-service');
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
  // 使用标准输出协议 v1.0
  const lines = [
    `场景：${result.scenarioName || scenario.title}`,
    `阶段：${result.stage || '未知'}`,
    '',
    `用户消息：${customerMessage}`,
    `客服回复：${userReply}`,
    '',
    `评估结果：${result.result || 'unknown'}`,
    `风险等级：${result.riskLevel || 'unknown'}`,
    `置信度：${Math.round((result.confidence || 0) * 100)}%`,
    ''
  ];
  
  // 问题项（issues 是字符串数组）
  if (result.issues && result.issues.length > 0) {
    lines.push('🔴 问题项：');
    result.issues.forEach(issue => {
      lines.push(`• ${issue}`);
    });
    lines.push('');
  }
  
  // 缺失信息（missing 是字符串数组）
  if (result.missing && result.missing.length > 0) {
    lines.push('⚠️ 缺失信息：');
    result.missing.forEach(item => {
      lines.push(`• ${item}`);
    });
    lines.push('');
  }
  
  // 优点（strengths 是字符串数组）
  if (result.strengths && result.strengths.length > 0) {
    lines.push('✅ 优点：');
    result.strengths.forEach(item => {
      lines.push(`• ${item}`);
    });
    lines.push('');
  }
  
  // 教练总结
  if (result.coachSummary) {
    lines.push('📝 教练总结：');
    lines.push(result.coachSummary);
    lines.push('');
  }
  
  // 下一步行动
  if (result.nextAction) {
    lines.push('👉 下一步：');
    lines.push(result.nextAction);
    lines.push('');
  }
  
  lines.push('发送 /score 继续测试');
  
  return lines.join('\n');
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
    
    // 构建标准协议输入
    const protocolInput = {
      project: 'default',
      conversation: [
        {
          role: 'user',
          content: customerMessage,
          _meta: { turnIndex: 0, ts: new Date().toISOString() }
        },
        {
          role: 'agent',
          content: text,
          _meta: { turnIndex: 1, ts: new Date().toISOString() }
        }
      ],
      current_reply: text,
      metadata: {
        source: 'smoke_test',
        session_id: `smoke_test_${chatId}_${Date.now()}`,
        agent_id: `user_${chatId}`,
        timestamp: new Date().toISOString(),
        entry_type: 'training',
        scenarioId: scenario.id
      },
      rules: {}
    };
    
    const result = await evaluate(protocolInput);
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
