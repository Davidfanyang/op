#!/usr/bin/env node
/**
 * 演示: Conversation Signals 接入 Review 流程
 * 
 * 展示:
 * 1. 接入前 review 详情看到什么
 * 2. 接入后多了 conversation_signals
 * 3. pending 列表中的 signals 摘要
 */

const { ReviewServiceV2 } = require('../services/review-service-v2');
const { createRepositoryFactory } = require('../repositories');

async function demo() {
  console.log('='.repeat(80));
  console.log('📋 演示: Conversation Signals 接入 Review 流程');
  console.log('='.repeat(80));
  console.log();

  // 初始化服务
  const factory = createRepositoryFactory({
    type: 'file',
    basePath: './runtime/persistence'
  });
  
  await factory.initialize();
  const repositories = factory.getAll();
  const reviewService = new ReviewServiceV2(repositories);

  try {
    // 演示 1: 查看现有的 review 数据
    console.log('【1】查看现有 pending reviews');
    console.log('-'.repeat(80));
    
    try {
      const pending = await reviewService.getPendingReviews({
        projectId: 'default',
        limit: 5
      });
      
      console.log(`找到 ${pending.items.length} 条 pending reviews`);
      
      if (pending.items.length > 0) {
        const firstReview = pending.items[0];
        console.log('\n第一条 review 摘要:');
        console.log(`  reviewId: ${firstReview.reviewId}`);
        console.log(`  alertLevel: ${firstReview.alertLevel}`);
        console.log(`  score: ${firstReview.score}`);
        console.log(`  employeeId: ${firstReview.employeeId}`);
        
        // 展示接入后的 signals
        console.log('\n🆕 接入 conversation signals 后:');
        if (firstReview.conversationSignals) {
          console.log('  ✅ 找到 signals:');
          console.log(`    is_sla_risk: ${firstReview.conversationSignals.is_sla_risk}`);
          console.log(`    is_invalid_conversation: ${firstReview.conversationSignals.is_invalid_conversation}`);
          console.log(`    is_unclosed_conversation: ${firstReview.conversationSignals.is_unclosed_conversation}`);
          console.log(`    is_high_message_count: ${firstReview.conversationSignals.is_high_message_count}`);
          console.log(`    first_response_seconds: ${firstReview.conversationSignals.first_response_seconds}`);
          console.log(`    message_count: ${firstReview.conversationSignals.message_count}`);
        } else {
          console.log('  ⚠️  signals 为 null (可能 chat_id 未映射)');
          console.log('  💡 这是正常的,signals 查询失败不会阻断主流程');
        }
      } else {
        console.log('  (没有 pending reviews,这是正常的)');
      }
    } catch (err) {
      console.log(`  ⚠️  查询 pending 失败: ${err.message}`);
      console.log('  (可能是因为没有 review 数据,不影响演示)');
    }
    
    console.log();
    console.log('【2】Signals 接入说明');
    console.log('-'.repeat(80));
    console.log();
    console.log('✅ 已接入位置:');
    console.log('  1. GET /supervisor/reviews/pending');
    console.log('     → 每条 review 增加 conversationSignals 摘要字段');
    console.log('     → 包含 4 个信号 + 2 个原始字段');
    console.log();
    console.log('  2. GET /supervisor/reviews/:reviewId');
    console.log('     → review 详情增加 conversationSignals 完整对象');
    console.log('     → 包含 4 个信号 + 2 个原始字段 + 元数据');
    console.log();
    console.log('📊 主管现在可以看到:');
    console.log('  - 这是话术问题 (evaluation.findings/suggestions)');
    console.log('  - 还是会话流程问题 (conversationSignals)');
    console.log('    • SLA 超时风险 → 需要优化响应速度');
    console.log('    • 无效会话 → 数据质量问题,不应参与评估');
    console.log('    • 未关闭会话 → 流程合规问题');
    console.log('    • 高消息会话 → 复杂度高,可能需要主管介入');
    console.log();
    console.log('🔒 安全保障:');
    console.log('  - signals 查询失败不阻断主流程 (try-catch)');
    console.log('  - signals 为 null 时前端降级处理');
    console.log('  - 不修改 score 主链');
    console.log('  - 不修改 training prompt');
    console.log();
    console.log('【3】映射策略');
    console.log('-'.repeat(80));
    console.log();
    console.log('通过以下优先级查找 conversation_id:');
    console.log('  1. session.metadata.chat_id');
    console.log('  2. message.rawPayload.chat.id');
    console.log('  3. session.metadataJson.chat_id (MySQL 模式)');
    console.log();
    console.log('⚠️  如果现有 review 数据的 session/message 中没有 chat_id,');
    console.log('   signals 将为 null,但不会影响 review 正常展示。');
    console.log();
    console.log('【4】下一步建议');
    console.log('-'.repeat(80));
    console.log();
    console.log('如果要让 signals 真正生效:');
    console.log('  1. 确保创建 review 时,session 包含 chat_id');
    console.log('  2. 或者在 live_monitor 流程中保存 chat_id 到 metadata');
    console.log('  3. 测试: 创建一条包含 chat_id 的 review,查看 signals 是否正确附加');
    console.log();
    console.log('='.repeat(80));
    console.log('✅ 演示完成');
    console.log('='.repeat(80));

  } catch (error) {
    console.error('❌ 演示失败:', error.message);
    console.error(error.stack);
  } finally {
    await factory.close();
  }
}

demo();
