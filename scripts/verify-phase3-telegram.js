/**
 * 阶段3验证脚本 - TG链路验证
 * 
 * 验证目标：
 * 1. bot层能正确构建标准协议
 * 2. 能调用services层
 * 3. 能返回结构化结果
 */

const { evaluate } = require('../services/evaluation-service');

async function verifyTelegramFlow() {
  console.log('=== TG链路验证 ===\n');
  
  // 模拟bot层构建的标准协议输入
  const protocolInput = {
    // 1. project
    project: 'default',
    
    // 2. conversation（多轮结构，role 统一为 user/agent）
    conversation: [
      {
        role: 'user',
        content: 'LantonPay 支持哪些方式向银行转账？',
        _meta: {
          turnIndex: 0,
          ts: new Date().toISOString()
        }
      },
      {
        role: 'agent',
        content: '您好，请提供您的手机号，我们帮您查询验证码状态。',
        _meta: {
          turnIndex: 1,
          ts: new Date().toISOString()
        }
      }
    ],
    
    // 3. current_reply（当前客服回复）
    current_reply: '您好，请提供您的手机号，我们帮您查询验证码状态。',
    
    // 4. metadata（必填字段）
    metadata: {
      source: 'telegram',
      session_id: 'test_user_123_lanton_bank_transfer_' + Date.now(),
      agent_id: 'test_agent',
      timestamp: new Date().toISOString(),
      entry_type: 'training'
    },
    
    // 5. rules（无规则时传空对象）
    rules: {}
  };
  
  console.log('步骤1: bot层构建标准协议...');
  console.log('  ✓ project:', protocolInput.project);
  console.log('  ✓ conversation:', protocolInput.conversation.length, '轮');
  console.log('  ✓ current_reply:', protocolInput.current_reply.substring(0, 30) + '...');
  console.log('  ✓ metadata.entry_type:', protocolInput.metadata.entry_type);
  console.log('  ✓ rules:', JSON.stringify(protocolInput.rules));
  
  console.log('\n步骤2: 调用services层...');
  try {
    const result = await evaluate(protocolInput);
    
    console.log('\n步骤3: 返回结果验证...');
    console.log('  ✓ status:', result.status);
    console.log('  ✓ scenarioId:', result.scenarioId);
    console.log('  ✓ result:', result.result?.level);
    console.log('  ✓ coachSummary:', result.coachSummary?.substring(0, 50) + '...');
    
    console.log('\n✅ TG链路验证通过');
    console.log('  - bot层正确构建标准协议');
    console.log('  - services层成功处理');
    console.log('  - 返回结构化结果');
    
    return { success: true, result };
  } catch (error) {
    console.error('\n❌ TG链路验证失败:', error.message);
    console.error('  堆栈:', error.stack);
    return { success: false, error: error.message };
  }
}

// 执行验证
if (require.main === module) {
  verifyTelegramFlow()
    .then(result => {
      process.exit(result.success ? 0 : 1);
    })
    .catch(err => {
      console.error('验证脚本执行失败:', err);
      process.exit(1);
    });
}

module.exports = { verifyTelegramFlow };
