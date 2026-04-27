/**
 * FAQ 沉淀快速验证脚本
 */

require('dotenv').config();
const { FaqIngestService } = require('../services/faq-ingest-service');

async function main() {
  console.log('=== FAQ 沉淀快速验证 ===\n');
  
  const service = new FaqIngestService();
  
  // 查询候选记录
  const candidates = await service.getPendingFaqCandidates();
  console.log(`找到 ${candidates.length} 条 pending_faq 候选记录\n`);
  
  if (candidates.length === 0) {
    console.log('没有候选记录，退出');
    return;
  }
  
  // 选择第一条进行沉淀
  const candidate = candidates[0];
  console.log('选择样本:');
  console.log(`  review_id: ${candidate.review_id}`);
  console.log(`  evaluation_id: ${candidate.evaluation_id}`);
  console.log(`  is_adopted: ${candidate.is_adopted}`);
  console.log(`  problem_tags: ${candidate.problem_tags}`);
  console.log(`  knowledge_id: ${candidate.knowledge_id}\n`);
  
  // 执行沉淀
  console.log('执行沉淀...');
  const result = await service.ingestFromReview(candidate.review_id, 'supervisor_001');
  
  if (result.success) {
    console.log('\n✅ 沉淀成功!');
    console.log(`  review_id: ${result.review_id}`);
    console.log(`  knowledge_id: ${result.knowledge_id}`);
    console.log(`  status: ${result.status}`);
  } else {
    console.log('\n❌ 沉淀失败!');
    console.log(`  error: ${result.error}`);
    console.log(`  message: ${result.message}`);
  }
}

main().catch(console.error);
