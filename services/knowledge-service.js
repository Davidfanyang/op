/**
 * 知识库沉淀服务
 * 
 * 职责：
 * 1. 接收审核通过的 review
 * 2. 校验是否可沉淀
 * 3. 提取用户问题表达
 * 4. 生成知识规则初版
 * 5. 写入 knowledge_base
 * 6. 标记 review 已沉淀
 * 
 * 触发条件：
 * - reviews.review_action = approve
 * - 或 reviews.review_action = modify_and_approve
 * 
 * 禁止条件：
 * - reject 不允许入库
 * - final_reply 为空不允许入库
 * - 同一 review 不允许重复入库
 */

const { MySQLKnowledgeRepository } = require('../infrastructure/persistence/mysql/mysql-knowledge-repository');
const { MySQLReviewsRepository } = require('../infrastructure/persistence/mysql/mysql-reviews-repository');
const { getPool } = require('../infrastructure/persistence/mysql/mysql-pool');

// 允许沉淀的审核动作
const ALLOWED_REVIEW_ACTIONS = ['approve', 'modify_and_approve'];

// 知识库状态常量
const KNOWLEDGE_STATUS = {
  ACTIVE: 'active',
  DEPRECATED: 'deprecated'
};

class KnowledgeService {
  constructor(options = {}) {
    this.pool = options.pool || getPool();
    this.knowledgeRepo = new MySQLKnowledgeRepository(this.pool);
    this.reviewsRepo = new MySQLReviewsRepository(this.pool);
  }

  /**
   * 从 review 沉淀知识（主入口）
   * 
   * @param {string} reviewId - review ID (review_id 业务字段)
   * @returns {Promise<Object>} 沉淀结果
   */
  async ingestFromReview(reviewId) {
    console.log('[KnowledgeService] 开始沉淀知识, reviewId:', reviewId);
    
    try {
      // 步骤1: 读取 review 详情
      const review = await this.reviewsRepo.findByReviewId(reviewId);
      if (!review) {
        return {
          success: false,
          error: 'REVIEW_NOT_FOUND',
          message: `Review 不存在: ${reviewId}`
        };
      }
      
      // 步骤2: 校验是否可沉淀
      const validation = await this._validateCanIngest(review);
      if (!validation.valid) {
        return {
          success: false,
          error: validation.error,
          message: validation.message
        };
      }
      
      // 步骤3: 读取原始 conversation（用户消息）
      const userMessages = await this._getUserMessages(review.sessionId);
      
      // 步骤4: 读取实时分析结果
      const evaluation = await this._getEvaluation(review.evaluationId);
      
      // 步骤5: 组装知识对象
      const knowledgeData = await this._buildKnowledgeData(review, userMessages, evaluation);
      
      // 步骤6: 写入 knowledge_base
      const knowledge = await this.knowledgeRepo.create(knowledgeData);
      
      console.log('[KnowledgeService] 知识记录已创建, knowledgeId:', knowledge.knowledgeId);
      
      // 步骤7: 标记 review 已沉淀
      await this.reviewsRepo.markReviewKnowledgeCreated(review.reviewId, knowledge.knowledgeId);
      
      console.log('[KnowledgeService] Review 已标记, reviewId:', review.reviewId);
      
      return {
        success: true,
        knowledge: knowledge
      };
      
    } catch (error) {
      console.error('[KnowledgeService] 沉淀知识失败:', error);
      return {
        success: false,
        error: 'KNOWLEDGE_CREATION_FAILED',
        message: error.message
      };
    }
  }

  /**
   * 校验 review 是否可以沉淀
   */
  async _validateCanIngest(review) {
    // 检查1: review_action 是否为 approve 或 modify_and_approve
    if (!ALLOWED_REVIEW_ACTIONS.includes(review.reviewAction)) {
      return {
        valid: false,
        error: 'INVALID_REVIEW_ACTION',
        message: `Review 动作不允许沉淀: ${review.reviewAction}，仅允许: ${ALLOWED_REVIEW_ACTIONS.join(', ')}`
      };
    }
    
    // 检查2: final_reply 是否为空
    if (!review.finalReply || review.finalReply.trim() === '') {
      return {
        valid: false,
        error: 'FINAL_REPLY_EMPTY',
        message: 'Review 的 final_reply 为空，无法沉淀'
      };
    }
    
    // 检查3: review 是否已经沉淀过（查库确认）
    const existingKnowledge = await this.knowledgeRepo.findByReviewId(review.reviewId);
    if (existingKnowledge) {
      return {
        valid: false,
        error: 'REVIEW_ALREADY_INGESTED',
        message: `Review 已经沉淀过知识, knowledgeId: ${existingKnowledge.knowledgeId}`
      };
    }
    
    // 检查4: 来源关系是否完整
    if (!review.sessionId || !review.evaluationId || !review.suggestionId) {
      return {
        valid: false,
        error: 'INCOMPLETE_SOURCE_RELATION',
        message: 'Review 缺少必要的来源关系（session/evaluation/suggestion）'
      };
    }
    
    return { valid: true };
  }

  /**
   * 从 live_messages 中提取用户消息
   */
  async _getUserMessages(sessionId) {
    const sql = `
      SELECT content, timestamp 
      FROM live_messages 
      WHERE session_id = ? AND role = 'user'
      ORDER BY timestamp ASC
    `;
    const [rows] = await this.pool.query(sql, [sessionId]);
    return rows.map(row => ({
      content: row.content,
      timestamp: row.timestamp
    }));
  }

  /**
   * 读取实时分析结果
   */
  async _getEvaluation(evaluationId) {
    const sql = `
      SELECT evaluation_id, scenario, summary, output_payload 
      FROM live_evaluations 
      WHERE evaluation_id = ? 
      LIMIT 1
    `;
    const [rows] = await this.pool.query(sql, [evaluationId]);
    
    if (rows.length === 0) {
      return null;
    }
    
    const row = rows[0];
    return {
      evaluationId: row.evaluation_id,
      scenario: row.scenario,
      summary: row.summary,
      outputPayload: typeof row.output_payload === 'string' 
        ? JSON.parse(row.output_payload) 
        : row.output_payload
    };
  }

  /**
   * 组装知识对象
   */
  async _buildKnowledgeData(review, userMessages, evaluation) {
    // project_id 从 review 中获取
    const projectId = review.projectId || 'default';
    
    // scenario 取值：优先来自 evaluation.scenario
    let scenario = evaluation?.scenario || 'general_unknown';
    if (!scenario || scenario.trim() === '') {
      scenario = 'general_unknown';
    }
    
    // question_aliases 生成：从用户消息中提取
    const questionAliases = this._extractQuestionAliases(userMessages);
    
    // standard_answer 必须来自 review.final_reply
    const standardAnswer = review.finalReply;
    
    // rules 初版生成
    const rules = this._generateInitialRules(scenario, questionAliases, standardAnswer, evaluation);
    
    // 版本号：查询当前 scenario 的最大版本号 + 1
    const maxVersion = await this.knowledgeRepo.getMaxVersionByScenario(projectId, scenario);
    const version = maxVersion + 1;
    
    return {
      projectId,
      scenario,
      questionAliases,
      standardAnswer,
      rules,
      sourceReviewId: review.reviewId,
      sourceSuggestionId: review.suggestionId,
      sourceEvaluationId: review.evaluationId,
      sourceSessionId: review.sessionId,
      version,
      status: KNOWLEDGE_STATUS.ACTIVE
    };
  }

  /**
   * 从用户消息中提取问题表达
   */
  _extractQuestionAliases(userMessages) {
    const aliases = [];
    
    // 至少提取：
    // 1. 用户第一句问题
    // 2. 用户后续追问中的核心问题
    // 3. 最多提取 5 条，避免过多
    
    if (userMessages.length === 0) {
      // 如果没有用户消息，使用默认值
      return ['未知问题'];
    }
    
    // 提取第一条消息
    if (userMessages[0]?.content) {
      aliases.push(userMessages[0].content.trim());
    }
    
    // 提取后续消息（最多 4 条）
    for (let i = 1; i < Math.min(userMessages.length, 5); i++) {
      if (userMessages[i]?.content) {
        const content = userMessages[i].content.trim();
        // 避免重复
        if (!aliases.includes(content) && content.length > 0) {
          aliases.push(content);
        }
      }
    }
    
    return aliases.length > 0 ? aliases : ['未知问题'];
  }

  /**
   * 生成初版规则
   */
  _generateInitialRules(scenario, questionAliases, standardAnswer, evaluation) {
    const rules = {
      keywords: [],
      required_info: [],
      forbidden: []
    };
    
    // keywords: 从 question_aliases 和 scenario 中提取关键词
    const keywords = new Set();
    
    // 从 scenario 提取
    if (scenario && scenario !== 'general_unknown') {
      scenario.split(/[\s_]+/).forEach(word => {
        if (word.length > 1) {
          keywords.add(word);
        }
      });
    }
    
    // 从 question_aliases 提取简单关键词（中文按字符，英文按单词）
    questionAliases.forEach(alias => {
      // 简单提取：提取长度 >= 2 的中文字词或英文单词
      const matches = alias.match(/[\u4e00-\u9fa5]{2,}|[a-zA-Z]{3,}/g);
      if (matches) {
        matches.forEach(match => keywords.add(match));
      }
    });
    
    rules.keywords = Array.from(keywords).slice(0, 10); // 最多 10 个关键词
    
    // required_info: 从 standard_answer 中提取客服要求用户补充的信息
    // 简单启发式：提取包含 "请"、"提供"、"补充" 等词后的名词短语
    const requiredInfoPatterns = [
      /请[您你]?提供([^，,。.]+)/g,
      /请[您你]?补充([^，,。.]+)/g,
      /需要[^，,。.]+([^，,。.]+)/g
    ];
    
    const requiredInfo = new Set();
    requiredInfoPatterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(standardAnswer)) !== null) {
        const info = match[1]?.trim();
        if (info && info.length > 1 && info.length < 50) {
          requiredInfo.add(info);
        }
      }
    });
    
    rules.required_info = Array.from(requiredInfo);
    
    // forbidden: 当前阶段为空
    rules.forbidden = [];
    
    return rules;
  }

  /**
   * 根据 reviewId 查询知识记录
   */
  async getKnowledgeByReviewId(reviewId) {
    return await this.knowledgeRepo.findByReviewId(reviewId);
  }

  /**
   * 根据 knowledgeId 查询知识记录
   */
  async getKnowledgeById(knowledgeId) {
    return await this.knowledgeRepo.findById(knowledgeId);
  }

  /**
   * 根据 scenario 查询知识记录列表
   */
  async getKnowledgeByScenario(scenario) {
    return await this.knowledgeRepo.findByScenario(scenario);
  }

  /**
   * 查询知识记录列表（支持过滤）
   */
  async listKnowledge(filters = {}) {
    return await this.knowledgeRepo.list(filters);
  }

  /**
   * 更新知识状态
   */
  async updateKnowledgeStatus(knowledgeId, status) {
    return await this.knowledgeRepo.updateStatus(knowledgeId, status);
  }

  /**
   * 查找相似知识
   */
  async findSimilarKnowledge(data) {
    return await this.knowledgeRepo.findSimilarKnowledge(data);
  }
}

// 导出类和常量
module.exports = {
  KnowledgeService,
  KNOWLEDGE_STATUS,
  ALLOWED_REVIEW_ACTIONS
};
