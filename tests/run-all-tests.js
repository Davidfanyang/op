/**
 * 运行所有测试
 * 统一入口，批量执行
 */

const path = require('path');

const tests = [
  { name: 'Feedback', file: './feedback.test.js' },
  { name: 'Trainer', file: './trainer.test.js' },
  { name: 'Evaluation Service', file: './evaluation-service.test.js' },
  { name: 'Evaluator', file: './evaluator.test.js' }
];

async function runAll() {
  console.log('╔════════════════════════════════════════╗');
  console.log('║     Trainer-Core 测试套件              ║');
  console.log('╚════════════════════════════════════════╝');
  console.log();

  let totalPassed = 0;
  let totalFailed = 0;

  for (const test of tests) {
    console.log(`\n▶ 运行 ${test.name} 测试...`);
    console.log('─'.repeat(40));
    
    try {
      // 动态加载并运行测试
      const testModule = require(test.file);
      // 测试文件会自己运行并输出结果
      await new Promise(resolve => setTimeout(resolve, 100));
      console.log(`  ${test.name} 测试完成`);
    } catch (err) {
      console.log(`  ✗ ${test.name} 测试出错:`, err.message);
    }
  }

  console.log('\n' + '═'.repeat(40));
  console.log('所有测试执行完毕');
  console.log('运行单个测试: node tests/trainer.test.js');
}

runAll().catch(console.error);
