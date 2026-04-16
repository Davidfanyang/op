// 本地对话评分脚本
// 用途：输入场景、用户消息、客服回复，直接得到评分结果
//
// 协议版本: v1.0（标准协议）
// - 使用标准协议调用 evaluate 函数

const readline = require('readline');
const scenarios = require('../data/scenarios.json');
const { evaluate } = require('../services/evaluation-service');

function createRl() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

function ask(rl, question) {
  return new Promise((resolve) => rl.question(question, (answer) => resolve(answer.trim())));
}

function parseArgs(argv) {
  const args = { scenarioId: '', customerMessage: '', userReply: '' };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--scenario' || token === '-s') {
      args.scenarioId = argv[i + 1] || '';
      i += 1;
    } else if (token === '--customer' || token === '-c') {
      args.customerMessage = argv[i + 1] || '';
      i += 1;
    } else if (token === '--reply' || token === '-r') {
      args.userReply = argv[i + 1] || '';
      i += 1;
    }
  }
  return args;
}

function printScenarioList() {
  console.log('可用场景：');
  scenarios.forEach((item, index) => {
    console.log(`${index + 1}. ${item.id} | ${item.title} | ${item.customerMessage}`);
  });
  console.log('');
}

function normalizeScenarioId(input) {
  const raw = String(input || '').trim();
  if (!raw) return '';

  if (/^\d+$/.test(raw)) {
    const index = Number(raw) - 1;
    if (scenarios[index]) return scenarios[index].id;
  }

  return raw;
}

function getScenarioOrThrow(scenarioId) {
  const scenario = scenarios.find((item) => item.id === scenarioId);
  if (!scenario) {
    throw new Error(`未找到场景: ${scenarioId}`);
  }
  return scenario;
}

function renderResult(result, scenario, customerMessage, userReply) {
  const payload = {
    input: {
      scenarioId: scenario.id,
      scenarioTitle: scenario.title,
      customerMessage,
      userReply
    },
    output: result
  };

  console.log('\n================ 评分结果 ================');
  console.log(`场景: ${scenario.title} (${scenario.id})`);
  console.log(`用户消息: ${customerMessage}`);
  console.log(`客服回复: ${userReply}`);
  console.log('------------------------------------------');
  console.log(`总分: ${result.score}`);
  console.log(`总结: ${result.coachSummary}`);
  console.log('维度分:');
  Object.entries(result.dimensionScores).forEach(([key, value]) => {
    console.log(`- ${key}: ${value}`);
  });

  console.log('问题项:');
  result.findings.forEach((item) => {
    console.log(`- [${item.code}] ${item.message}`);
  });

  console.log('建议:');
  result.suggestions.forEach((item) => {
    console.log(`- ${item}`);
  });

  if (result.strengths && result.strengths.length) {
    console.log('优点:');
    result.strengths.forEach((item) => {
      console.log(`- ${item}`);
    });
  }

  console.log('标准回复参考:');
  console.log(result.standardReply);
  console.log('==========================================\n');

  console.log('JSON 输出:');
  console.log(JSON.stringify(payload, null, 2));
}

async function runInteractive() {
  const rl = createRl();

  try {
    printScenarioList();
    const scenarioInput = await ask(rl, '请输入场景编号或 scenarioId: ');
    const scenarioId = normalizeScenarioId(scenarioInput);
    const scenario = getScenarioOrThrow(scenarioId);

    const customerMessage = await ask(
      rl,
      `请输入用户消息（直接回车则使用默认：${scenario.customerMessage}）: `
    );

    const userReply = await ask(rl, '请输入客服回复: ');
    if (!userReply) {
      throw new Error('客服回复不能为空');
    }

    const actualCustomerMessage = customerMessage || scenario.customerMessage;
    
    // 构建标准协议输入
    const protocolInput = {
      project: 'default',
      conversation: [
        {
          role: 'user',
          content: actualCustomerMessage,
          _meta: { turnIndex: 0, ts: new Date().toISOString() }
        },
        {
          role: 'agent',
          content: userReply,
          _meta: { turnIndex: 1, ts: new Date().toISOString() }
        }
      ],
      current_reply: userReply,
      metadata: {
        source: 'score_dialog',
        session_id: `score_dialog_${scenario.id}_${Date.now()}`,
        agent_id: 'interactive_user',
        timestamp: new Date().toISOString(),
        entry_type: 'training',
        scenarioId: scenario.id
      },
      rules: {}
    };
    
    const result = await evaluate(protocolInput);

    renderResult(result, scenario, actualCustomerMessage, userReply);
  } finally {
    rl.close();
  }
}

async function runWithArgs() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.scenarioId || !args.userReply) {
    return false;
  }

  const scenarioId = normalizeScenarioId(args.scenarioId);
  const scenario = getScenarioOrThrow(scenarioId);
  const customerMessage = args.customerMessage || scenario.customerMessage;
  
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
        content: args.userReply,
        _meta: { turnIndex: 1, ts: new Date().toISOString() }
      }
    ],
    current_reply: args.userReply,
    metadata: {
      source: 'score_dialog',
      session_id: `score_dialog_${scenario.id}_${Date.now()}`,
      agent_id: 'interactive_user',
      timestamp: new Date().toISOString(),
      entry_type: 'training',
      scenarioId: scenario.id
    },
    rules: {}
  };
  
  const result = await evaluate(protocolInput);

  renderResult(result, scenario, customerMessage, args.userReply);
  return true;
}

async function main() {
  try {
    const handled = await runWithArgs();
    if (!handled) {
      await runInteractive();
    }
  } catch (error) {
    console.error(`执行失败: ${error.message}`);
    process.exit(1);
  }
}

main();
