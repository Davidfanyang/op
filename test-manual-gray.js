const { callQwen3AdapterWithFallback } = require('./services/local-model/qwen3-gray-route');

async function originalLogic(input, context) {
  return {
    success: true,
    source: 'original_mock',
    input,
    context
  };
}

(async () => {
  const input = {
    conversationText: `用户：我转账成功了，但是对方没收到。
客服：你等等。`
  };

  const context = {
    taskType: 'quality_evaluation',
    entrySource: 'test_entry',
    scenario: 'transfer_not_received'
  };

  const result = await callQwen3AdapterWithFallback(input, context, originalLogic);

  console.log('\n===== 最终结果 =====');
  console.log(JSON.stringify(result, null, 2));
})();
