#!/usr/bin/env node
/**
 * 状态系统测试脚本
 * 验证三层状态体系实现
 */

const { evaluate } = require('./services/evaluation-service');
const { updateReviewStatus } = require('./services/review-service');
const {
  EvaluationStatus,
  AlertLevel,
  ReviewStatus,
  FalsePositiveReason
} = require('./core/constants/statuses');

async function test() {
  console.log('========================================');
  console.log('三层状态体系测试');
  console.log('========================================\n');

  // 1. CRITICAL + PENDING 示例
  console.log('=== 1. CRITICAL + PENDING 示例 ===');
  const result1 = await evaluate({
    projectId: 'lanton',
    mode: 'live_monitor',
    scenarioId: 'lanton_sms_code',
    userReply: '嗯',
    metadata: { sessionId: 'test_001', employeeId: 'emp001' }
  });
  
  console.log('三层状态:');
  console.log(`  evaluationStatus: ${result1.evaluationStatus}`);
  console.log(`  alertLevel: ${result1.alertLevel}`);
  console.log(`  reviewStatus: ${result1.reviewStatus}`);
  console.log('\n完整结构:');
  console.log(JSON.stringify(result1, null, 2));

  // 2. FALSE_POSITIVE 更新后
  console.log('\n\n=== 2. FALSE_POSITIVE 更新后示例 ===');
  const updateResult = updateReviewStatus({
    sessionId: 'test_001',
    reviewStatus: 'false_positive',
    reviewedBy: 'supervisor_01',
    reviewComment: '正常短回复被误报',
    falsePositiveReason: 'threshold_too_sensitive'
  });
  console.log(JSON.stringify(updateResult, null, 2));

  // 3. DISMISSED 示例
  console.log('\n\n=== 3. DISMISSED 示例 ===');
  const result3 = await evaluate({
    projectId: 'lanton',
    mode: 'live_monitor',
    scenarioId: 'lanton_sms_code',
    userReply: '好的',
    metadata: { sessionId: 'test_002', employeeId: 'emp002' }
  });
  
  const dismissResult = updateReviewStatus({
    sessionId: 'test_002',
    reviewStatus: 'dismissed',
    reviewedBy: 'supervisor_02',
    reviewComment: '暂不处理'
  });
  console.log(JSON.stringify(dismissResult, null, 2));

  // 4. 状态枚举输出
  console.log('\n\n=== 4. 完整状态枚举 ===');
  console.log('EvaluationStatus:', EvaluationStatus);
  console.log('AlertLevel:', AlertLevel);
  console.log('ReviewStatus:', ReviewStatus);
  console.log('FalsePositiveReason:', FalsePositiveReason);

  console.log('\n========================================');
  console.log('测试完成');
  console.log('========================================');
}

test().catch(console.error);
