const { generateScenario } = require('./core/ai-evaluator');

async function testGenerator() {
  console.log("--- 开始动态生成测试 ---");
  const scenarios = new Set();
  
  for (let i = 0; i < 5; i++) {
    try {
      const scenario = await generateScenario();
      console.log(`[测试轮次 ${i+1}] ID: ${scenario.id}, 标题: ${scenario.title}`);
      
      if (scenarios.has(scenario.id)) {
        console.warn(`! 重复场景 ID: ${scenario.id}`);
      } else {
        scenarios.add(scenario.id);
      }
    } catch (e) {
      console.error(`[测试轮次 ${i+1}] 失败: ${e.message}`);
    }
  }
  console.log("--- 测试结束，共生成唯一场景数:", scenarios.size);
}

testGenerator();
