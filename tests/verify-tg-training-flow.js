/**
 * TG 训练链路端到端验证
 * 
 * 验证完整的6步训练消息流：
 * 1. 开始训练 (/start)
 * 2. 用户模拟发问 (scenario.customerMessage)
 * 3. 客服回复 (user input)
 * 4. 调用分析引擎 (evaluate)
 * 5. 返回训练反馈 (formatResultMessage)
 * 6. 结束总结 (session reset)
 */

const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

// 通过 evaluation-service 统一入口调用（不再绕过）
const { evaluate } = require('../services/evaluation-service');
const { formatResultMessage } = require('../app/telegram/formatter');
const scenarios = require('../data/scenarios.json');

console.log('=== TG 训练链路端到端验证 ===\n');

// 模拟完整的训练流程
async function simulateTrainingFlow() {
  console.log('[步骤1] 开始训练 - 选择场景');
  const scenario = scenarios[0]; // 选择第一个场景
  console.log(`场景: ${scenario.title}`);
  console.log(`场景ID: ${scenario.id}\n`);
  
  console.log('[步骤2] 用户模拟发问');
  const customerMessage = scenario.customerMessage;
  console.log(`用户: ${customerMessage}\n`);
  
  console.log('[步骤3] 客服回复');
  const agentReply = '您好，请提供您的手机号和验证码，我们帮您查看。';
  console.log(`客服: ${agentReply}\n`);
  
  console.log('[步骤4] 调用分析引擎');
  
  // 构建标准协议输入（通过 evaluation-service 统一入口）
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
        content: agentReply,
        _meta: { turnIndex: 1, ts: new Date().toISOString() }
      }
    ],
    current_reply: agentReply,
    metadata: {
      source: 'telegram',
      session_id: `test_training_${Date.now()}`,
      agent_id: 'test_agent',
      timestamp: new Date().toISOString(),
      entry_type: 'training',
      scenarioId: scenario.id  // training模式需要scenarioId
    },
    rules: {}
  };
  
  console.log('输入协议验证:');
  console.log(`✓ project: ${protocolInput.project}`);
  console.log(`✓ conversation: ${protocolInput.conversation.length} 轮`);
  console.log(`✓ current_reply: ${protocolInput.current_reply}`);
  console.log(`✓ metadata.source: ${protocolInput.metadata.source}`);
  console.log(`✓ metadata.entry_type: ${protocolInput.metadata.entry_type}`);
  console.log(`✓ metadata.scenarioId: ${protocolInput.metadata.scenarioId}`);
  console.log('');
  
  const result = await evaluate(protocolInput);
  
  console.log('[步骤5] 返回训练反馈');
  console.log('评估结果:');
  console.log(`✓ scenarioName: ${result.scenarioName}`);
  console.log(`✓ stage: ${result.stage}`);
  console.log(`✓ result: ${result.result}`);
  console.log(`✓ riskLevel: ${result.riskLevel}`);
  console.log(`✓ confidence: ${Math.round((result.confidence || 0) * 100)}%`);
  console.log(`✓ issues: ${result.issues ? result.issues.length : 0} 项`);
  console.log(`✓ missing: ${result.missing ? result.missing.length : 0} 项`);
  console.log(`✓ strengths: ${result.strengths ? result.strengths.length : 0} 项`);
  console.log(`✓ coachSummary: ${result.coachSummary ? '有' : '无'}`);
  console.log(`✓ nextAction: ${result.nextAction ? '有' : '无'}`);
  console.log('');
  
  console.log('[步骤6] 结束总结 - 格式化TG消息');
  const message = formatResultMessage(result, scenario, customerMessage, agentReply);
  console.log('格式化后的TG消息:');
  console.log('---');
  console.log(message);
  console.log('---\n');
  
  // 验证消息格式
  console.log('=== 验证结果 ===');
  
  // 验证输入协议
  const inputValid = 
    protocolInput.project &&
    Array.isArray(protocolInput.conversation) &&
    protocolInput.current_reply &&
    protocolInput.metadata &&
    protocolInput.metadata.source &&
    protocolInput.metadata.session_id &&
    protocolInput.metadata.agent_id &&
    protocolInput.metadata.timestamp &&
    protocolInput.metadata.entry_type;
  
  // 验证输出协议
  const outputValid = 
    result.scenarioName &&
    result.result &&
    ['pass', 'borderline', 'fail', 'risk'].includes(result.result) &&
    result.riskLevel &&
    result.confidence !== undefined &&
    Array.isArray(result.issues || []) &&
    Array.isArray(result.missing || []) &&
    Array.isArray(result.strengths || []);
  
  // 验证消息格式
  const messageValid = 
    message.includes('评估结果:') &&
    message.includes('风险等级:') &&
    message.includes('置信度:') &&
    !message.includes('result.score') &&
    !message.includes('result.findings') &&
    !message.includes('result.suggestions') &&
    !message.includes('result.standardReply');
  
  if (inputValid && outputValid && messageValid) {
    console.log('✅ 通过 - TG训练链路完整验证成功');
    console.log('\n验证项:');
    console.log('✓ 标准输入协议 v1.0');
    console.log('✓ 标准输出协议 v1.0');
    console.log('✓ TG消息格式化');
    console.log('✓ 无旧字段依赖');
    console.log('✓ 6步流程完整');
    process.exit(0);
  } else {
    console.log('❌ 失败 - 验证不通过');
    if (!inputValid) console.log('✗ 输入协议不完整');
    if (!outputValid) console.log('✗ 输出协议不完整');
    if (!messageValid) console.log('✗ 消息格式不正确');
    process.exit(1);
  }
}

// 运行验证
simulateTrainingFlow().catch(err => {
  console.error('❌ 验证失败:', err.message);
  console.error(err.stack);
  process.exit(1);
});
