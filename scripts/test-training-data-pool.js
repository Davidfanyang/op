#!/usr/bin/env node

/**
 * 训练数据池能力验证测试
 * 
 * 测试用例：
 * 1. active knowledge 生成训练数据
 * 2. deprecated knowledge 不生成训练数据
 * 3. 同一 knowledge 重复执行不重复生成
 * 4. project_id 隔离
 * 5. target_reply 来源校验
 * 6. 多个 question_aliases 生成多条样本
 * 7. rules 字段命名一致性
 * 8. 来源追溯完整性
 */

const mysql = require('mysql2/promise');
const { TrainingDataPoolService, TRAINING_DATA_STATUS } = require('../services/training-data-pool-service');
const { MySQLKnowledgeRepository } = require('../infrastructure/persistence/mysql/mysql-knowledge-repository');
const { MySQLTrainingDataPoolRepository } = require('../infrastructure/persistence/mysql/mysql-training-data-pool-repository');
const { getPool } = require('../infrastructure/persistence/mysql/mysql-pool');

// 测试计数器
let totalCount = 0;
let passCount = 0;

async function runTrainingDataPoolTests() {
  console.log('========== 训练数据池能力验证测试 ==========\n');
  
  // 初始化 - 不传入pool，使用默认的getPool()
  const service = new TrainingDataPoolService();
  const knowledgeRepo = new MySQLKnowledgeRepository();
  const trainingDataRepo = new MySQLTrainingDataPoolRepository();
  
  console.log('✓ MySQL 连接成功\n');
  
  // ==================== 测试 1: active knowledge 生成训练数据 ====================
  console.log('【测试 1】active knowledge 生成训练数据');
  totalCount++;
  
  try {
    // 准备测试知识
    const testKnowledge = {
      knowledgeId: `kb_test_1_${Date.now()}`,
      projectId: 'test_project',
      scenario: 'transfer_not_received',
      questionAliases: [
        '我转账一直没到账',
        '钱扣了但对方没收到'
      ],
      standardAnswer: '您好，为了帮您进一步核查，请您提供付款截图和绑定手机号，我们会尽快为您处理。',
      rules: {
        keywords: ['转账', '没到账'],
        required_info: ['付款截图', '绑定手机号'],
        forbidden: []
      },
      sourceReviewId: `review_test_1_${Date.now()}`,
      sourceSuggestionId: `suggestion_test_1_${Date.now()}`,
      sourceEvaluationId: `eval_test_1_${Date.now()}`,
      sourceSessionId: `session_test_1_${Date.now()}`,
      version: 1,
      status: 'active'
    };
    
    // 直接插入知识库
    const createdKnowledge = await knowledgeRepo.create(testKnowledge);
    const actualKnowledgeId = createdKnowledge.knowledgeId;
    console.log('✓ 测试知识已创建:', actualKnowledgeId);
    
    // 生成训练数据
    const result = await service.buildTrainingDataPool({
      knowledgeId: actualKnowledgeId
    });
    
    if (result.success && result.stats.createdCount === 2) {
      console.log('✓ 训练数据生成成功');
      console.log('✓ 创建了 2 条训练样本（对应 2 个 question_aliases）');
      
      // 验证训练数据（使用实际创建的 knowledgeId）
      const trainingDataList = await trainingDataRepo.findByKnowledgeId(actualKnowledgeId);
      if (trainingDataList.length === 2) {
        console.log('✓ training_data_pool 记录数正确');
        passCount++;
      } else {
        console.log('✗ training_data_pool 记录数不正确:', trainingDataList.length);
      }
    } else {
      console.log('✗ 训练数据生成失败', result);
    }
  } catch (error) {
    console.log('✗ 测试失败:', error.message);
    console.error(error);
  }
  
  // ==================== 测试 2: deprecated knowledge 不生成训练数据 ====================
  console.log('\n【测试 2】deprecated knowledge 不生成训练数据');
  totalCount++;
  
  try {
    // 准备测试知识（deprecated）
    const testKnowledge = {
      knowledgeId: `kb_test_2_${Date.now()}`,
      projectId: 'test_project',
      scenario: 'account_locked',
      questionAliases: ['我的账户被锁了'],
      standardAnswer: '您好，请您携带有效身份证件到就近网点办理解锁手续。',
      rules: {
        keywords: ['账户', '锁定'],
        required_info: ['身份证件'],
        forbidden: []
      },
      sourceReviewId: `review_test_2_${Date.now()}`,
      sourceSuggestionId: `suggestion_test_2_${Date.now()}`,
      sourceEvaluationId: `eval_test_2_${Date.now()}`,
      sourceSessionId: `session_test_2_${Date.now()}`,
      version: 1,
      status: 'deprecated'  // 注意：deprecated 状态
    };
    
    await knowledgeRepo.create(testKnowledge);
    const actualKnowledgeId = (await knowledgeRepo.findByReviewId(testKnowledge.sourceReviewId)).knowledgeId;
    console.log('✓ deprecated 测试知识已创建:', actualKnowledgeId);
    
    // 尝试生成训练数据
    const result = await service.buildTrainingDataPool({
      knowledgeId: actualKnowledgeId
    });
    
    if (result.success && result.stats.createdCount === 0) {
      console.log('✓ deprecated 知识未生成训练数据');
      passCount++;
    } else {
      console.log('✗ deprecated 知识错误地生成了训练数据');
    }
  } catch (error) {
    console.log('✗ 测试失败:', error.message);
    console.error(error);
  }
  
  // ==================== 测试 3: 同一 knowledge 重复执行不重复生成 ====================
  console.log('\n【测试 3】同一 knowledge 重复执行不重复生成');
  totalCount++;
  
  try {
    // 使用测试1的知识（已经生成过训练数据）
    const knowledgeList = await knowledgeRepo.listActiveKnowledge('test_project');
    const existingKnowledge = knowledgeList.find(k => k.scenario === 'transfer_not_received');
    
    if (existingKnowledge) {
      // 再次执行生成
      const result = await service.buildTrainingDataPool({
        knowledgeId: existingKnowledge.knowledgeId
      });
      
      if (result.success && result.stats.skippedCount > 0 && result.stats.createdCount === 0) {
        console.log('✓ 同一 knowledge 被正确跳过，未重复生成');
        console.log('✓ skipped_count:', result.stats.skippedCount);
        passCount++;
      } else {
        console.log('✗ 同一 knowledge 错误地重复生成了');
      }
    } else {
      console.log('✗ 测试依赖的知识不存在');
    }
  } catch (error) {
    console.log('✗ 测试失败:', error.message);
    console.error(error);
  }
  
  // ==================== 测试 4: project_id 隔离 ====================
  console.log('\n【测试 4】project_id 隔离');
  totalCount++;
  
  try {
    // 创建两个项目的知识
    const knowledgeA = {
      knowledgeId: `kb_test_4a_${Date.now()}`,
      projectId: 'project_a',
      scenario: 'same_scenario',
      questionAliases: ['问题A'],
      standardAnswer: '答案A',
      rules: { keywords: [], required_info: [], forbidden: [] },
      sourceReviewId: `review_test_4a_${Date.now()}`,
      sourceSuggestionId: `suggestion_test_4a_${Date.now()}`,
      sourceEvaluationId: `eval_test_4a_${Date.now()}`,
      sourceSessionId: `session_test_4a_${Date.now()}`,
      version: 1,
      status: 'active'
    };
    
    const knowledgeB = {
      knowledgeId: `kb_test_4b_${Date.now()}`,
      projectId: 'project_b',
      scenario: 'same_scenario',  // 相同 scenario
      questionAliases: ['问题B'],
      standardAnswer: '答案B',
      rules: { keywords: [], required_info: [], forbidden: [] },
      sourceReviewId: `review_test_4b_${Date.now()}`,
      sourceSuggestionId: `suggestion_test_4b_${Date.now()}`,
      sourceEvaluationId: `eval_test_4b_${Date.now()}`,
      sourceSessionId: `session_test_4b_${Date.now()}`,
      version: 1,
      status: 'active'
    };
    
    await knowledgeRepo.create(knowledgeA);
    await knowledgeRepo.create(knowledgeB);
    console.log('✓ 两个项目的知识已创建（相同 scenario）');
    
    // 分别为两个项目生成训练数据
    const resultA = await service.buildTrainingDataPool({ projectId: 'project_a' });
    const resultB = await service.buildTrainingDataPool({ projectId: 'project_b' });
    
    // 验证隔离
    const dataA = await trainingDataRepo.findByProjectId('project_a');
    const dataB = await trainingDataRepo.findByProjectId('project_b');
    
    if (dataA.length > 0 && dataB.length > 0) {
      // 确认项目A的数据不会出现在项目B中
      const projectADataInB = dataB.filter(d => d.projectId === 'project_a');
      const projectBDataInA = dataA.filter(d => d.projectId === 'project_b');
      
      if (projectADataInB.length === 0 && projectBDataInA.length === 0) {
        console.log('✓ 项目隔离正确，互不影响');
        console.log('✓ project_a 训练数据:', dataA.length, '条');
        console.log('✓ project_b 训练数据:', dataB.length, '条');
        passCount++;
      } else {
        console.log('✗ 项目隔离失败');
      }
    } else {
      console.log('✗ 训练数据生成失败');
    }
  } catch (error) {
    console.log('✗ 测试失败:', error.message);
    console.error(error);
  }
  
  // ==================== 测试 5: target_reply 来源校验 ====================
  console.log('\n【测试 5】target_reply 来源校验');
  totalCount++;
  
  try {
    const knowledgeList = await knowledgeRepo.listActiveKnowledge('test_project');
    const testKnowledge = knowledgeList.find(k => k.scenario === 'transfer_not_received');
    
    if (testKnowledge) {
      const trainingDataList = await trainingDataRepo.findByKnowledgeId(testKnowledge.knowledgeId);
      
      if (trainingDataList.length > 0) {
        const allMatch = trainingDataList.every(data => 
          data.targetReply === testKnowledge.standardAnswer
        );
        
        if (allMatch) {
          console.log('✓ target_reply 全部来自 knowledge_base.standard_answer');
          console.log('✓ target_reply:', trainingDataList[0].targetReply);
          passCount++;
        } else {
          console.log('✗ target_reply 来源不正确');
        }
      } else {
        console.log('✗ 训练数据不存在');
      }
    } else {
      console.log('✗ 测试依赖的知识不存在');
    }
  } catch (error) {
    console.log('✗ 测试失败:', error.message);
    console.error(error);
  }
  
  // ==================== 测试 6: rules 字段命名一致性 ====================
  console.log('\n【测试 6】rules 字段命名一致性');
  totalCount++;
  
  try {
    const knowledgeList = await knowledgeRepo.listActiveKnowledge('test_project');
    const testKnowledge = knowledgeList.find(k => k.scenario === 'transfer_not_received');
    
    if (testKnowledge) {
      const trainingDataList = await trainingDataRepo.findByKnowledgeId(testKnowledge.knowledgeId);
      
      if (trainingDataList.length > 0) {
        const rules = trainingDataList[0].rules;
        
        // 验证 rules 包含正确的字段名
        if (rules && 
            'keywords' in rules && 
            'required_info' in rules &&  // 必须是 required_info，不是 requiredInfo
            'forbidden' in rules) {
          console.log('✓ rules 字段命名正确');
          console.log('✓ keywords:', JSON.stringify(rules.keywords));
          console.log('✓ required_info:', JSON.stringify(rules.required_info));
          console.log('✓ forbidden:', JSON.stringify(rules.forbidden));
          passCount++;
        } else {
          console.log('✗ rules 字段命名不正确');
          console.log('✗ rules:', JSON.stringify(rules));
        }
      } else {
        console.log('✗ 训练数据不存在');
      }
    } else {
      console.log('✗ 测试依赖的知识不存在');
    }
  } catch (error) {
    console.log('✗ 测试失败:', error.message);
    console.error(error);
  }
  
  // ==================== 测试 7: 来源追溯完整性 ====================
  console.log('\n【测试 7】来源追溯完整性');
  totalCount++;
  
  try {
    const knowledgeList = await knowledgeRepo.listActiveKnowledge('test_project');
    const testKnowledge = knowledgeList.find(k => k.scenario === 'transfer_not_received');
    
    if (testKnowledge) {
      const trainingDataList = await trainingDataRepo.findByKnowledgeId(testKnowledge.knowledgeId);
      
      if (trainingDataList.length > 0) {
        const data = trainingDataList[0];
        
        // 验证来源字段
        if (data.knowledgeId === testKnowledge.knowledgeId &&
            data.sourceReviewId === testKnowledge.sourceReviewId &&
            data.sourceSuggestionId === testKnowledge.sourceSuggestionId &&
            data.sourceEvaluationId === testKnowledge.sourceEvaluationId &&
            data.sourceSessionId === testKnowledge.sourceSessionId) {
          console.log('✓ 来源追溯完整且正确');
          console.log('✓ knowledge_id:', data.knowledgeId);
          console.log('✓ source_review_id:', data.sourceReviewId);
          console.log('✓ source_suggestion_id:', data.sourceSuggestionId);
          console.log('✓ source_evaluation_id:', data.sourceEvaluationId);
          console.log('✓ source_session_id:', data.sourceSessionId);
          passCount++;
        } else {
          console.log('✗ 来源追溯不完整');
        }
      } else {
        console.log('✗ 训练数据不存在');
      }
    } else {
      console.log('✗ 测试依赖的知识不存在');
    }
  } catch (error) {
    console.log('✗ 测试失败:', error.message);
    console.error(error);
  }
  
  // ==================== 测试 8: knowledge_version 和 data_version 正确 ====================
  console.log('\n【测试 8】knowledge_version 和 data_version 正确');
  totalCount++;
  
  try {
    const knowledgeList = await knowledgeRepo.listActiveKnowledge('test_project');
    const testKnowledge = knowledgeList.find(k => k.scenario === 'transfer_not_received');
    
    if (testKnowledge) {
      const trainingDataList = await trainingDataRepo.findByKnowledgeId(testKnowledge.knowledgeId);
      
      if (trainingDataList.length > 0) {
        const allCorrect = trainingDataList.every(data => 
          data.knowledgeVersion === testKnowledge.version &&
          data.dataVersion >= 1
        );
        
        if (allCorrect) {
          console.log('✓ knowledge_version 正确:', trainingDataList[0].knowledgeVersion);
          console.log('✓ data_version 正确:', trainingDataList[0].dataVersion);
          passCount++;
        } else {
          console.log('✗ 版本号不正确');
        }
      } else {
        console.log('✗ 训练数据不存在');
      }
    } else {
      console.log('✗ 测试依赖的知识不存在');
    }
  } catch (error) {
    console.log('✗ 测试失败:', error.message);
    console.error(error);
  }
  
  // ==================== 测试结果 ====================
  console.log('\n========== 测试结果 ==========\n');
  console.log(`总测试数: ${totalCount}`);
  console.log(`通过测试: ${passCount}`);
  console.log(`失败测试: ${totalCount - passCount}`);
  
  if (passCount === totalCount) {
    console.log('\n✅ 所有测试通过！训练数据池能力验证成功！');
  } else {
    console.log('\n❌ 部分测试失败，请检查错误信息');
  }
}

// 执行测试
runTrainingDataPoolTests().catch(error => {
  console.error('测试执行失败:', error);
  process.exit(1);
});
