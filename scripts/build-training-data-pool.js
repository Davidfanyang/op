#!/usr/bin/env node

/**
 * 训练数据池生成脚本
 * 
 * 用途：从 knowledge_base.active 生成训练数据池
 * 
 * 支持参数：
 * --project_id=lanton     按项目生成
 * --knowledge_id=kb_xxx   按知识ID生成
 * --all                   全量生成（默认）
 * 
 * 示例：
 * node scripts/build-training-data-pool.js --project_id=lanton
 * node scripts/build-training-data-pool.js --knowledge_id=kb_123
 * node scripts/build-training-data-pool.js --all
 */

const { TrainingDataPoolService } = require('../services/training-data-pool-service');

// 解析命令行参数
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {};
  
  args.forEach(arg => {
    if (arg.startsWith('--')) {
      const [key, value] = arg.slice(2).split('=');
      options[key] = value || true;
    }
  });
  
  return options;
}

async function main() {
  const options = parseArgs();
  
  console.log('========== 训练数据池生成脚本 ==========');
  console.log('参数:', options);
  console.log('');
  
  const service = new TrainingDataPoolService();
  
  // 构建参数
  const buildOptions = {};
  
  if (options.project_id && options.project_id !== true) {
    buildOptions.projectId = options.project_id;
  }
  
  if (options.knowledge_id && options.knowledge_id !== true) {
    buildOptions.knowledgeId = options.knowledge_id;
  }
  
  // 执行生成
  console.log('开始生成训练数据池...');
  console.log('');
  
  const result = await service.buildTrainingDataPool(buildOptions);
  
  console.log('');
  console.log('========== 生成结果 ==========');
  console.log('');
  
  if (result.success) {
    console.log('✅ 生成成功');
    console.log('');
    console.log('统计信息:');
    console.log(`  知识总数: ${result.stats.totalKnowledge}`);
    console.log(`  新增样本: ${result.stats.createdCount}`);
    console.log(`  跳过样本: ${result.stats.skippedCount}`);
    console.log(`  失败样本: ${result.stats.failedCount}`);
    
    if (result.stats.errors && result.stats.errors.length > 0) {
      console.log('');
      console.log('错误详情:');
      result.stats.errors.forEach(err => {
        console.log(`  - ${err.knowledgeId}: ${err.error}`);
      });
    }
  } else {
    console.log('❌ 生成失败');
    console.log(`错误: ${result.error}`);
    console.log(`消息: ${result.message}`);
    console.log('');
    console.log('统计信息（失败前）:');
    console.log(`  知识总数: ${result.stats.totalKnowledge}`);
    console.log(`  新增样本: ${result.stats.createdCount}`);
    console.log(`  跳过样本: ${result.stats.skippedCount}`);
    console.log(`  失败样本: ${result.stats.failedCount}`);
  }
  
  console.log('');
  console.log('========================================');
}

// 执行
main().catch(error => {
  console.error('脚本执行失败:', error);
  process.exit(1);
});
