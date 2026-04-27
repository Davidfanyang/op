/**
 * Qwen3 评分规则测试脚本（第五版：微调模式）
 * 
 * 验证"qwen_raw_score + 规则微调"模式的正确性
 * 
 * @author Qoder
 * @date 2026-04-23
 */

'use strict';

const { calculateRuleBasedScore } = require('../services/local-model/qwen3-score-rules');

// ========================
// 测试用例（第五版：微调模式）
// ========================

const testCases = [
  {
    name: '用例1：正常样本，轻微问题（预期：仍在70+）',
    input: {
      problem_type: 'known',
      scenario: 'transfer_not_received',
      issues: ['客服回复敷衍', '未说明处理路径'],
      missing_info: ['未核实转账时间', '未索要订单信息'],
      suggested_reply: '请您耐心等待，我们帮您核实一下。',
      confidence: 0.82,
      score: 82  // qwen_raw_score
    },
    expectedRange: { min: 60, max: 82 },
    description: 'qwen_raw=82，有轻微问题+敷衍回复，微调后应该在60-82之间'
  },
  {
    name: '用例2：仅安抚无动作（预期：显著压分）',
    input: {
      problem_type: 'known',
      scenario: 'only_reassure',
      issues: ['回复过于敷衍'],
      missing_info: ['未收集信息'],
      suggested_reply: '抱歉给您带来不便，理解您的情况，请耐心等待。',
      confidence: 0.85,
      score: 84  // qwen_raw_score
    },
    expectedRange: { min: 55, max: 72 },
    description: 'qwen_raw=84，仅安抚无动作，应该被压到72以下'
  },
  {
    name: '用例3：差样本封顶（预期：≤70）',
    input: {
      problem_type: 'known',
      scenario: 'multiple_issues',
      issues: ['问题1', '问题2', '问题3'],
      missing_info: ['缺失1', '缺失2', '缺失3'],
      suggested_reply: '等等',
      confidence: 0.50,
      score: 88  // qwen_raw_score（qwen给了高分，但实际是差样本）
    },
    expectedRange: { min: 50, max: 70 },
    description: 'qwen_raw=88，但issues>=2 && missing>=2，应该被封顶到70'
  },
  {
    name: '用例4：好样本下限（预期：≥80）',
    input: {
      problem_type: 'known',
      scenario: 'good_handling',
      issues: [],
      missing_info: [],
      suggested_reply: '请提供订单号，我们将为您查询，接下来会协助处理，处理完成后会通知您。',
      confidence: 0.90,
      score: 76  // qwen_raw_score（qwen给低了，但实际是好样本）
    },
    expectedRange: { min: 80, max: 95 },
    description: 'qwen_raw=76，无问题+有动作+有下一步，应该被拉到80+'
  },
  {
    name: '用例5：unknown问题（预期：轻扣分，不崩）',
    input: {
      problem_type: 'unknown',
      scenario: 'unknown',
      issues: ['问题无法理解'],
      missing_info: ['未明确问题类型'],
      suggested_reply: '请说明您的具体问题。',
      confidence: 0.60,
      score: 78  // qwen_raw_score
    },
    expectedRange: { min: 68, max: 78 },
    description: 'qwen_raw=78，unknown轻扣分，应该在70左右'
  },
  {
    name: '用例6：调整幅度限制（预期：改变量≤20）',
    input: {
      problem_type: 'known',
      scenario: 'extreme_case',
      issues: ['问题1', '问题2', '问题3', '问题4', '问题5'],
      missing_info: ['缺失1', '缺失2', '缺失3', '缺失4'],
      suggested_reply: '请稍等',
      confidence: 0.40,
      score: 90  // qwen_raw_score（极端高分但实际很差）
    },
    expectedRange: { min: 70, max: 90 },  // 最多只能扣20分，所以>=70
    description: 'qwen_raw=90，极端扣分场景，但MAX_ADJUSTMENT=20，所以最终>=70'
  }
];

// ========================
// 执行测试
// ========================

function runTests() {
  console.log('========================================');
  console.log('Qwen3 评分规则测试（第五版：微调模式）');
  console.log('========================================\n');
  
  let passedCount = 0;
  let failedCount = 0;
  
  testCases.forEach((testCase, index) => {
    console.log(`\n【${testCase.name}】`);
    console.log(`说明：${testCase.description}`);
    console.log(`输入：`, JSON.stringify(testCase.input, null, 2));
    
    try {
      const result = calculateRuleBasedScore(testCase.input);
      
      console.log(`\n输出：`);
      console.log(`  - qwen_raw_score: ${result.qwen_raw_score}`);
      console.log(`  - rule_score: ${result.score}`);
      console.log(`  - 调整幅度: ${result.meta.adjustment} 分`);
      console.log(`  - 扣分项: ${result.deductions.length} 个`);
      result.deductions.forEach(d => {
        console.log(`    * ${d.reason}: -${d.points} 分 (${d.detail})`);
      });
      console.log(`  - 加分项: ${result.additions.length} 个`);
      result.additions.forEach(a => {
        console.log(`    * ${a.reason}: +${a.points} 分 (${a.detail})`);
      });
      console.log(`  - 检测标志: ${result.meta.detectedFlags.join(', ') || '无'}`);
      
      // 验证预期范围
      if (result.score >= testCase.expectedRange.min && result.score <= testCase.expectedRange.max) {
        console.log(`\n✅ 通过 (分数 ${result.score} 在预期范围 [${testCase.expectedRange.min}, ${testCase.expectedRange.max}] 内)`);
        passedCount++;
      } else {
        console.log(`\n❌ 失败 (分数 ${result.score} 不在预期范围 [${testCase.expectedRange.min}, ${testCase.expectedRange.max}] 内)`);
        failedCount++;
      }
      
      // 验证调整幅度限制
      if (Math.abs(result.meta.adjustment) > 20) {
        console.log(`⚠️  警告：调整幅度 ${result.meta.adjustment} 超过20分限制`);
      }
    } catch (error) {
      console.log(`\n❌ 异常: ${error.message}`);
      failedCount++;
    }
  });
  
  console.log('\n\n========================================');
  console.log('测试总结');
  console.log('========================================');
  console.log(`总用例数: ${testCases.length}`);
  console.log(`通过: ${passedCount}`);
  console.log(`失败: ${failedCount}`);
  console.log(`通过率: ${((passedCount / testCases.length) * 100).toFixed(1)}%`);
  
  if (failedCount === 0) {
    console.log('\n✅ 所有测试通过！');
    process.exit(0);
  } else {
    console.log(`\n❌ ${failedCount} 个测试失败`);
    process.exit(1);
  }
}

// 运行测试
runTests();
