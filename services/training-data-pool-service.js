/**
 * 训练数据池服务
 * 
 * 职责：
 * 1. 读取 knowledge_base.status = active 的知识
 * 2. 校验知识是否可进入训练池
 * 3. 将 question_aliases 拆分为多条训练样本
 * 4. 每条 question_alias 生成一条 training_data_pool 记录
 * 5. 按 knowledge_id + input_text_hash + knowledge_version 去重
 * 6. 写入 training_data_pool
 * 7. 不负责模型训练
 * 
 * 触发方式：
 * - 手动触发（脚本 / API）
 * - 不自动挂在 review-service 后面
 * 
 * 数据来源：
 * - input_text 来自 knowledge_base.question_aliases
 * - target_reply 必须来自 knowledge_base.standard_answer
 * - rules 必须来自 knowledge_base.rules
 * - project_id 必须来自 knowledge_base.project_id
 * - source_xxx 必须来自 knowledge_base.source_xxx
 */

const { MySQLKnowledgeRepository } = require('../infrastructure/persistence/mysql/mysql-knowledge-repository');
const { MySQLTrainingDataPoolRepository } = require('../infrastructure/persistence/mysql/mysql-training-data-pool-repository');
const { getPool } = require('../infrastructure/persistence/mysql/mysql-pool');

// 训练数据状态常量
const TRAINING_DATA_STATUS = {
  READY: 'ready',
  USED: 'used',
  DEPRECATED: 'deprecated'
};

class TrainingDataPoolService {
  constructor(options = {}) {
    this.pool = options.pool || getPool();
    this.knowledgeRepo = new MySQLKnowledgeRepository(this.pool);
    this.trainingDataRepo = new MySQLTrainingDataPoolRepository(this.pool);
  }

  /**
   * 从知识库生成训练数据池
   * 
   * @param {Object} options - 生成选项
   * @param {string} options.projectId - 项目 ID（可选，不传则生成所有项目）
   * @param {string} options.knowledgeId - 知识 ID（可选，只生成指定知识）
   * @returns {Promise<Object>} 生成统计结果
   */
  async buildTrainingDataPool(options = {}) {
    const { projectId, knowledgeId } = options;
    
    console.log('[TrainingDataPoolService] 开始生成训练数据池', options);
    
    const stats = {
      totalKnowledge: 0,
      createdCount: 0,
      skippedCount: 0,
      failedCount: 0,
      errors: []
    };
    
    try {
      // 步骤1: 读取 active knowledge
      let knowledgeList;
      
      if (knowledgeId) {
        // 只生成指定知识（必须校验status=active）
        const knowledge = await this.knowledgeRepo.findById(knowledgeId);
        if (!knowledge) {
          return {
            success: false,
            error: 'KNOWLEDGE_NOT_FOUND',
            message: `知识不存在: ${knowledgeId}`,
            stats
          };
        }
        
        // 关键：必须校验status=active
        if (knowledge.status !== 'active') {
          console.log(`[TrainingDataPoolService] 知识状态不是active，跳过: ${knowledgeId} (status=${knowledge.status})`);
          return {
            success: true,
            stats: {
              totalKnowledge: 0,
              createdCount: 0,
              skippedCount: 1,
              failedCount: 0,
              errors: []
            }
          };
        }
        
        knowledgeList = [knowledge];
      } else {
        // 生成所有 active knowledge（可按 project_id 过滤）
        knowledgeList = await this.knowledgeRepo.listActiveKnowledge(projectId);
      }
      
      stats.totalKnowledge = knowledgeList.length;
      console.log(`[TrainingDataPoolService] 找到 ${knowledgeList.length} 条 active 知识`);
      
      // 步骤2: 遍历知识，生成训练数据
      for (const knowledge of knowledgeList) {
        try {
          const result = await this._processKnowledge(knowledge);
          stats.createdCount += result.created;
          stats.skippedCount += result.skipped;
        } catch (error) {
          console.error(`[TrainingDataPoolService] 处理知识失败: ${knowledge.knowledgeId}`, error.message);
          stats.failedCount++;
          stats.errors.push({
            knowledgeId: knowledge.knowledgeId,
            error: error.message
          });
        }
      }
      
      console.log('[TrainingDataPoolService] 训练数据池生成完成', stats);
      
      return {
        success: true,
        stats
      };
    } catch (error) {
      console.error('[TrainingDataPoolService] 生成训练数据池失败:', error.message);
      return {
        success: false,
        error: 'BUILD_FAILED',
        message: error.message,
        stats
      };
    }
  }

  /**
   * 处理单条知识，生成训练样本
   */
  async _processKnowledge(knowledge) {
    const result = {
      created: 0,
      skipped: 0
    };
    
    // 步骤1: 校验知识是否可进入训练池
    const validation = this._validateKnowledgeForTraining(knowledge);
    if (!validation.valid) {
      console.warn(`[TrainingDataPoolService] 知识校验失败: ${knowledge.knowledgeId}`, validation.message);
      return result;
    }
    
    // 步骤2: 拆分 question_aliases
    const questionAliases = knowledge.questionAliases;
    
    if (!Array.isArray(questionAliases) || questionAliases.length === 0) {
      console.warn(`[TrainingDataPoolService] 知识缺少 question_aliases: ${knowledge.knowledgeId}`);
      return result;
    }
    
    console.log(`[TrainingDataPoolService] 处理知识: ${knowledge.knowledgeId}, question_aliases 数量: ${questionAliases.length}`);
    
    // 步骤3: 为每个 question_alias 生成训练样本
    for (const inputText of questionAliases) {
      try {
        const trainingDataResult = await this._createTrainingData(knowledge, inputText);
        
        if (trainingDataResult.action === 'created') {
          result.created++;
        } else if (trainingDataResult.action === 'skipped') {
          result.skipped++;
        }
      } catch (error) {
        console.error(`[TrainingDataPoolService] 创建训练数据失败: ${knowledge.knowledgeId}`, error.message);
        throw error;
      }
    }
    
    return result;
  }

  /**
   * 校验知识是否可进入训练池
   */
  _validateKnowledgeForTraining(knowledge) {
    // 检查1: status 必须为 active
    if (knowledge.status !== 'active') {
      return {
        valid: false,
        message: `知识状态不是 active: ${knowledge.status}`
      };
    }
    
    // 检查2: project_id 非空
    if (!knowledge.projectId || knowledge.projectId.trim() === '') {
      return {
        valid: false,
        message: '知识缺少 project_id'
      };
    }
    
    // 检查3: knowledge_id 非空
    if (!knowledge.knowledgeId || knowledge.knowledgeId.trim() === '') {
      return {
        valid: false,
        message: '知识缺少 knowledge_id'
      };
    }
    
    // 检查4: scenario 非空
    if (!knowledge.scenario || knowledge.scenario.trim() === '') {
      return {
        valid: false,
        message: '知识缺少 scenario'
      };
    }
    
    // 检查5: question_aliases 非空数组
    if (!knowledge.questionAliases || !Array.isArray(knowledge.questionAliases) || knowledge.questionAliases.length === 0) {
      return {
        valid: false,
        message: '知识缺少 question_aliases'
      };
    }
    
    // 检查6: standard_answer 非空
    if (!knowledge.standardAnswer || knowledge.standardAnswer.trim() === '') {
      return {
        valid: false,
        message: '知识缺少 standard_answer'
      };
    }
    
    // 检查7: rules 非空
    if (!knowledge.rules || typeof knowledge.rules !== 'object') {
      return {
        valid: false,
        message: '知识缺少 rules'
      };
    }
    
    // 检查8: source_review_id 非空
    if (!knowledge.sourceReviewId || knowledge.sourceReviewId.trim() === '') {
      return {
        valid: false,
        message: '知识缺少 source_review_id'
      };
    }
    
    return { valid: true };
  }

  /**
   * 创建单条训练数据
   */
  async _createTrainingData(knowledge, inputText) {
    // 步骤1: 生成 input_text_hash
    const inputTextHash = this.trainingDataRepo._generateHash(inputText);
    
    // 步骤2: 检查是否已存在训练样本（去重）
    const existingData = await this.trainingDataRepo.findByKnowledgeAndInput(
      knowledge.knowledgeId,
      inputTextHash,
      knowledge.version
    );
    
    if (existingData) {
      console.log(`[TrainingDataPoolService] 训练数据已存在，跳过: ${knowledge.knowledgeId} + ${inputTextHash}`);
      return { action: 'skipped', data: existingData };
    }
    
    // 步骤3: 查询当前 knowledge_id + input_text 的最大 data_version
    const existingDataList = await this.trainingDataRepo.findByKnowledgeId(knowledge.knowledgeId);
    const maxDataVersion = existingDataList.reduce((max, data) => {
      return Math.max(max, data.dataVersion || 0);
    }, 0);
    
    const dataVersion = maxDataVersion + 1;
    
    // 步骤4: 创建训练数据
    const trainingData = await this.trainingDataRepo.create({
      projectId: knowledge.projectId,
      knowledgeId: knowledge.knowledgeId,
      scenario: knowledge.scenario,
      inputText: inputText,
      targetReply: knowledge.standardAnswer,
      rules: knowledge.rules,
      sourceReviewId: knowledge.sourceReviewId,
      sourceSuggestionId: knowledge.sourceSuggestionId,
      sourceEvaluationId: knowledge.sourceEvaluationId,
      sourceSessionId: knowledge.sourceSessionId,
      knowledgeVersion: knowledge.version,
      dataVersion: dataVersion,
      status: TRAINING_DATA_STATUS.READY
    });
    
    console.log(`[TrainingDataPoolService] 训练数据已创建: ${trainingData.dataId}`);
    
    return { action: 'created', data: trainingData };
  }

  /**
   * 根据 dataId 查询训练数据
   */
  async getTrainingDataById(dataId) {
    return await this.trainingDataRepo.findByDataId(dataId);
  }

  /**
   * 根据 knowledgeId 查询训练数据列表
   */
  async getTrainingDataByKnowledgeId(knowledgeId) {
    return await this.trainingDataRepo.findByKnowledgeId(knowledgeId);
  }

  /**
   * 根据 projectId 查询训练数据列表
   */
  async getTrainingDataByProjectId(projectId) {
    return await this.trainingDataRepo.findByProjectId(projectId);
  }

  /**
   * 查询训练数据列表（支持过滤）
   */
  async listTrainingData(filters = {}) {
    return await this.trainingDataRepo.list(filters);
  }

  /**
   * 更新训练数据状态
   */
  async updateTrainingDataStatus(dataId, status) {
    return await this.trainingDataRepo.updateStatus(dataId, status);
  }
}

// 导出类和常量
module.exports = {
  TrainingDataPoolService,
  TRAINING_DATA_STATUS
};
