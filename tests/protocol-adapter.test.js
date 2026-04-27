/**
 * 协议适配层单元测试
 * 
 * 测试目标：
 * 1. 验证旧字段调用仍然有效（向后兼容）
 * 2. 验证新字段调用正常工作
 * 3. 验证字段映射正确性
 * 4. 验证 rules 字段正确加载
 */

const { 
  normalizeToProtocol, 
  normalizeConversation, 
  normalizeMetadata,
  validateProtocol 
} = require('../core/trainer');
const { loadRules } = require('../core/rule-loader');

// 测试计数器
let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ ${message}`);
    passed++;
  } else {
    console.error(`  ❌ ${message}`);
    failed++;
  }
}

console.log('=== 协议适配层测试 ===\n');

// 测试1: 旧字段调用向后兼容
console.log('测试1: 旧字段调用向后兼容');
const oldInput = {
  projectId: 'lanton',
  mode: 'training',
  conversation: [
    { role: 'customer', text: '怎么注册' },
    { role: 'agent', text: '需要手机号' }
  ],
  currentReply: '需要手机号',
  metadata: {
    sessionId: 'test_001',
    employeeId: 'agent_001'
  }
};

const oldResult = normalizeToProtocol(oldInput);
assert(oldResult.project === 'lanton', 'projectId 映射为 project');
assert(oldResult.current_reply === '需要手机号', 'currentReply 映射为 current_reply');
assert(oldResult.metadata.session_id === 'test_001', 'sessionId 映射为 session_id');
assert(oldResult.metadata.agent_id === 'agent_001', 'employeeId 映射为 agent_id');
assert(oldResult.metadata.entry_type === 'training', 'mode 映射为 entry_type');
assert(oldResult.metadata.source === 'tg_training', 'source 根据 training 推断');
assert(typeof oldResult.rules === 'object', 'rules 字段存在且为对象');
console.log('');

// 测试2: 新字段调用
console.log('测试2: 新字段调用（标准协议）');
const newInput = {
  project: 'lanton',
  conversation: [
    { role: 'user', content: '怎么注册' },
    { role: 'agent', content: '需要手机号' }
  ],
  current_reply: '需要手机号',
  metadata: {
    source: 'tg_training',
    session_id: 'test_002',
    agent_id: 'agent_002',
    timestamp: '2026-04-16T18:00:00+07:00',
    entry_type: 'training'
  },
  rules: {
    must_ask: ['手机号'],
    must_include: ['验证码']
  }
};

const newResult = normalizeToProtocol(newInput);
assert(newResult.project === 'lanton', 'project 字段保持不变');
assert(newResult.current_reply === '需要手机号', 'current_reply 字段保持不变');
assert(newResult.metadata.source === 'tg_training', 'source 字段保持不变');
assert(newResult.rules.must_ask.includes('手机号'), 'rules 正确传入');
console.log('');

// 测试3: conversation 标准化
console.log('测试3: conversation 标准化');
const convInput = [
  { role: 'customer', text: '你好' },
  { role: 'agent', content: '有什么可以帮助你的' },
  { role: 'user', text: '怎么注册', timestamp: '2026-04-16T18:00:00+07:00' }
];

const convResult = normalizeConversation(convInput);
assert(convResult[0].role === 'user', 'customer 映射为 user');
assert(convResult[0].content === '你好', 'text 映射为 content');
assert(convResult[1].role === 'agent', 'agent 保持不变');
assert(convResult[1].content === '有什么可以帮助你的', 'content 保持不变');
assert(convResult[2]._meta.ts === '2026-04-16T18:00:00+07:00', 'timestamp 保留在 _meta');
console.log('');

// 测试4: metadata 标准化
console.log('测试4: metadata 标准化');
const metaInput = {
  sessionId: 'test_003',
  employeeId: 'agent_003'
};

const metaResult = normalizeMetadata(metaInput, 'live_monitor');
assert(metaResult.session_id === 'test_003', 'sessionId 映射为 session_id');
assert(metaResult.agent_id === 'agent_003', 'employeeId 映射为 agent_id');
assert(metaResult.entry_type === 'live_monitor', 'entry_type 正确传入');
assert(metaResult.source === 'tg_live', 'source 根据 live_monitor 推断');
assert(metaResult.timestamp, 'timestamp 自动生成');
console.log('');

// 测试5: rules 加载
console.log('测试5: rules 加载');
const rules = loadRules('lanton');
assert(typeof rules === 'object', 'rules 为对象');
assert(Array.isArray(rules.must_ask), 'rules.must_ask 为数组');
assert(Array.isArray(rules.must_include), 'rules.must_include 为数组');
assert(Array.isArray(rules.forbidden), 'rules.forbidden 为数组');
assert(typeof rules.stage_rules === 'object', 'rules.stage_rules 为对象');
console.log('');

// 测试6: 协议校验 - 正确输入
console.log('测试6: 协议校验 - 正确输入');
const validInput = {
  project: 'lanton',
  conversation: [
    { role: 'user', content: '你好' }
  ],
  current_reply: '你好，有什么可以帮助你的',
  metadata: {
    source: 'tg_training',
    session_id: 'test_004',
    agent_id: 'agent_004',
    timestamp: '2026-04-16T18:00:00+07:00',
    entry_type: 'training'
  },
  rules: {}
};

try {
  validateProtocol(validInput);
  assert(true, '正确输入通过校验');
} catch (err) {
  assert(false, `正确输入应该通过校验: ${err.message}`);
}
console.log('');

// 测试7: 协议校验 - 缺少必填字段
console.log('测试7: 协议校验 - 缺少必填字段');
const invalidInput = {
  project: 'lanton',
  conversation: [],  // 空数组
  current_reply: '',  // 空字符串
  metadata: {},  // 缺少必填字段
  rules: null  // 不能为 null
};

try {
  validateProtocol(invalidInput);
  assert(false, '缺少必填字段应该校验失败');
} catch (err) {
  assert(true, `缺少必填字段正确拦截: ${err.message.substring(0, 50)}...`);
}
console.log('');

// 测试8: 混合字段（新旧混用）
console.log('测试8: 混合字段（新旧混用）');
const mixedInput = {
  projectId: 'lanton',  // 旧字段
  mode: 'live_monitor',  // 旧字段
  conversation: [
    { role: 'customer', text: '转账失败怎么办' }  // 旧字段
  ],
  currentReply: '请提供订单号',  // 旧字段
  metadata: {
    sessionId: 'test_005',  // 旧字段
    employeeId: 'agent_005',  // 旧字段
    entry_type: 'live_monitor'  // 新字段
  }
  // 未传 rules，应该自动加载
};

const mixedResult = normalizeToProtocol(mixedInput);
assert(mixedResult.project === 'lanton', 'projectId 正确映射');
assert(mixedResult.metadata.entry_type === 'live_monitor', 'mode 正确映射为 entry_type');
assert(mixedResult.conversation[0].role === 'user', 'customer 正确映射为 user');
assert(mixedResult.conversation[0].content === '转账失败怎么办', 'text 正确映射为 content');
assert(mixedResult.current_reply === '请提供订单号', 'currentReply 正确映射为 current_reply');
assert(mixedResult.metadata.session_id === 'test_005', 'sessionId 正确映射为 session_id');
assert(mixedResult.metadata.source === 'tg_live', 'source 正确推断');
assert(typeof mixedResult.rules === 'object', 'rules 自动加载');
console.log('');

// 输出测试结果
console.log('=== 测试结果汇总 ===');
console.log(`通过: ${passed}`);
console.log(`失败: ${failed}`);
console.log(`总计: ${passed + failed}`);

if (failed > 0) {
  console.error('\n❌ 测试失败，请检查上述错误');
  process.exit(1);
} else {
  console.log('\n✅ 所有测试通过');
  process.exit(0);
}
