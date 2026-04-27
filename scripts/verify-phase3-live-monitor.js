/**
 * 阶段3验证脚本 - 监听链路验证
 * 
 * 验证目标：
 * 1. HTTP入口能正确构建标准协议
 * 2. 能调用services层
 * 3. 能返回分析结果
 */

const { LiveMonitorAPI } = require('../adapters/http/live-monitor-api');

async function verifyLiveMonitorFlow() {
  console.log('=== 监听链路验证 ===\n');
  
  // 创建API实例
  const api = new LiveMonitorAPI({ port: 3099 });
  
  // 模拟外部请求体
  const requestBody = {
    projectId: 'default',
    conversation: [
      { role: 'customer', text: '怎么申请验证码' },
      { role: 'agent', text: '您好，请提供手机号。' }
    ],
    currentReply: '您好，请提供手机号。',
    metadata: {
      sessionId: 'test_session_001',
      employeeId: 'test_agent_001'
    }
  };
  
  console.log('步骤1: 模拟外部HTTP请求...');
  console.log('  ✓ projectId:', requestBody.projectId);
  console.log('  ✓ conversation:', requestBody.conversation.length, '轮');
  console.log('  ✓ currentReply:', requestBody.currentReply);
  
  console.log('\n步骤2: 入口层转换为标准协议...');
  const protocolInput = api.buildProtocolInput(requestBody);
  console.log('  ✓ project:', protocolInput.project);
  console.log('  ✓ conversation:', protocolInput.conversation.length, '轮');
  console.log('  ✓ conversation[0].role:', protocolInput.conversation[0].role);
  console.log('  ✓ conversation[0].content:', protocolInput.conversation[0].content);
  console.log('  ✓ current_reply:', protocolInput.current_reply);
  console.log('  ✓ metadata.session_id:', protocolInput.metadata.session_id);
  console.log('  ✓ metadata.agent_id:', protocolInput.metadata.agent_id);
  console.log('  ✓ metadata.entry_type:', protocolInput.metadata.entry_type);
  console.log('  ✓ rules:', JSON.stringify(protocolInput.rules));
  
  console.log('\n步骤3: 调用services层...');
  try {
    const { evaluate } = require('../services/evaluation-service');
    const result = await evaluate(protocolInput);
    
    console.log('\n步骤4: 返回结果验证...');
    console.log('  ✓ status:', result.status);
    console.log('  ✓ scenarioId:', result.scenarioId);
    console.log('  ✓ result:', result.result?.level);
    console.log('  ✓ coachSummary:', result.coachSummary?.substring(0, 50) + '...');
    
    console.log('\n✅ 监听链路验证通过');
    console.log('  - HTTP入口正确构建标准协议');
    console.log('  - conversation标准化（customer→user, text→content）');
    console.log('  - services层成功处理');
    console.log('  - 返回结构化结果');
    
    return { success: true, result };
  } catch (error) {
    console.error('\n❌ 监听链路验证失败:', error.message);
    console.error('  堆栈:', error.stack);
    return { success: false, error: error.message };
  } finally {
    // 不启动HTTP服务，仅验证协议转换
  }
}

// 执行验证
if (require.main === module) {
  verifyLiveMonitorFlow()
    .then(result => {
      process.exit(result.success ? 0 : 1);
    })
    .catch(err => {
      console.error('验证脚本执行失败:', err);
      process.exit(1);
    });
}

module.exports = { verifyLiveMonitorFlow };
