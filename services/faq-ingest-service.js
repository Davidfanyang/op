/**
 * FAQ 沉淀服务（最小闭环 - 主管打标场景）
 * 
 * 职责：
 * 1. 从 reviews 表中筛选 knowledge_id='pending_faq' 的记录
 * 2. 验证是否满足沉淀条件
 * 3. 将候选记录写入 knowledge_base 表
 * 4. 回写 review 的 knowledge_id 为正式知识 ID
 * 
 * 触发条件：
 * - review_action = 'tag'
 * - review_status = 'tagged'
 * - knowledge_id = 'pending_faq'
 * - is_adopted = 1
 * - problem_tags 中包含 'known'
 * 
 * 禁止条件：
 * - 不满足上述任一条件不允许沉淀
 * - 同一 review 不允许重复沉淀
 */

const { MySQLKnowledgeRepository } = require('../infrastructure/persistence/mysql/mysql-knowledge-repository');
const { MySQLReviewsRepository } = require('../infrastructure/persistence/mysql/mysql-reviews-repository');
const { getPool } = require('../infrastructure/persistence/mysql/mysql-pool');

class FaqIngestService {
  constructor(options = {}) {
    this.pool = options.pool || getPool();
    this.knowledgeRepo = new MySQLKnowledgeRepository(this.pool);
    this.reviewsRepo = new MySQLReviewsRepository(this.pool);
  }

  /**
   * 从 review 沉淀 FAQ（主入口）
   * 
   * @param {string} reviewId - review ID
   * @param {string} operatorId - 操作人 ID
   * @returns {Promise<Object>} 沉淀结果
   */
  async ingestFromReview(reviewId, operatorId) {
    console.log('[FaqIngestService] 开始沉淀 FAQ, reviewId:', reviewId, 'operatorId:', operatorId);
    
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
      
      // 步骤2: 校验是否可沉淀（针对 tag 动作）
      const validation = await this._validateCanIngest(review);
      if (!validation.valid) {
        return {
          success: false,
          error: validation.error,
          message: validation.message
        };
      }
      
      // 步骤3: 读取原始对话（用户消息）
      const userMessages = await this._getUserMessages(review.sessionId);
      
      // 步骤4: 读取 evaluation 获取 scenario
      const evaluation = await this._getEvaluation(review.evaluationId);
      
      // 步骤5: 组装知识对象
      const knowledgeData = this._buildKnowledgeData(review, userMessages, evaluation);
      
      // 步骤6: 写入 knowledge_base
      const knowledge = await this.knowledgeRepo.create(knowledgeData);
      
      console.log('[FaqIngestService] 知识记录已创建, knowledgeId:', knowledge.knowledgeId);
      
      // 步骤7: 回写 review 的 knowledge_id
      await this.reviewsRepo.updateKnowledgeId(review.reviewId, knowledge.knowledgeId);
      
      console.log('[FaqIngestService] Review knowledge_id 已更新, reviewId:', review.reviewId, 'knowledgeId:', knowledge.knowledgeId);
      
      return {
        success: true,
        review_id: review.reviewId,
        knowledge_id: knowledge.knowledgeId,
        status: 'stored'
      };
      
    } catch (error) {
      console.error('[FaqIngestService] 沉淀 FAQ 失败:', error);
      return {
        success: false,
        error: 'FAQ_INGESTION_FAILED',
        message: error.message
      };
    }
  }

  /**
   * 校验 review 是否可以沉淀（针对 tag 动作）
   */
  async _validateCanIngest(review) {
    // 检查1: review_action 必须为 'tag'
    if (review.reviewAction !== 'tag') {
      return {
        valid: false,
        error: 'INVALID_REVIEW_ACTION',
        message: `Review 动作不是 tag: ${review.reviewAction}`
      };
    }
    
    // 检查2: review_status 必须为 'tagged'
    if (review.reviewStatus !== 'tagged') {
      return {
        valid: false,
        error: 'INVALID_REVIEW_STATUS',
        message: `Review 状态不是 tagged: ${review.reviewStatus}`
      };
    }
    
    // 检查3: knowledge_id 必须为 'pending_faq'
    if (review.knowledgeId !== 'pending_faq') {
      return {
        valid: false,
        error: 'NOT_PENDING_FAQ',
        message: `Review knowledge_id 不是 pending_faq: ${review.knowledgeId}`
      };
    }
    
    // 检查4: is_adopted 必须为 1
    if (review.isAdopted !== 1) {
      return {
        valid: false,
        error: 'NOT_ADOPTED',
        message: `Review 未被采纳, is_adopted: ${review.isAdopted}`
      };
    }
    
    // 检查5: problem_tags 必须包含 'known'
    let problemTags = [];
    if (review.problemTags) {
      // mysql2 可能已经自动解析了 JSON，也可能是字符串
      if (typeof review.problemTags === 'string') {
        try {
          problemTags = JSON.parse(review.problemTags);
        } catch (e) {
          problemTags = [review.problemTags];
        }
      } else if (Array.isArray(review.problemTags)) {
        problemTags = review.problemTags;
      } else {
        problemTags = [review.problemTags];
      }
      
      // 处理可能的嵌套数组
      if (problemTags.length > 0 && Array.isArray(problemTags[0])) {
        problemTags = problemTags[0];
      }
    }
    
    if (!problemTags.includes('known')) {
      return {
        valid: false,
        error: 'INVALID_PROBLEM_TYPE',
        message: `Problem tags 不包含 known: ${JSON.stringify(problemTags)}`
      };
    }
    
    // 检查6: final_reply (corrected_answer) 不能为空
    if (!review.finalReply || review.finalReply.trim() === '') {
      return {
        valid: false,
        error: 'FINAL_REPLY_EMPTY',
        message: 'Review 的 final_reply 为空，无法沉淀'
      };
    }
    
    // 检查7: 是否已经沉淀过（查库确认）
    const existingKnowledge = await this.knowledgeRepo.findByReviewId(review.reviewId);
    if (existingKnowledge) {
      return {
        valid: false,
        error: 'REVIEW_ALREADY_INGESTED',
        message: `Review 已经沉淀过知识, knowledgeId: ${existingKnowledge.knowledgeId}`
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
   * 读取 evaluation 获取 scenario
   */
  async _getEvaluation(evaluationId) {
    const sql = `
      SELECT evaluation_id, scenario, summary, project 
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
      project: row.project
    };
  }

  /**
   * 组装知识对象（最小字段）
   */
  _buildKnowledgeData(review, userMessages, evaluation) {
    // project_id 优先从 evaluation 获取，其次从 review 获取
    const projectId = evaluation?.project || review.projectId || 'default';
    
    // scenario 取值：优先来自 evaluation.scenario，如果没有则用 'general'
    let scenario = evaluation?.scenario;
    if (!scenario || scenario.trim() === '') {
      scenario = 'general';
    }
    
    // question: 从用户消息中提取第一条
    let question = '未知问题';
    if (userMessages.length > 0 && userMessages[0]?.content) {
      question = userMessages[0].content.trim();
    }
    
    // answer: 使用 final_reply (corrected_answer)
    const answer = review.finalReply;
    
    // problem_type: 从 problem_tags 中提取
    let problemType = 'known';
    try {
      const tags = review.problemTags ? JSON.parse(review.problemTags) : [];
      problemType = tags[0] || 'known';
    } catch (e) {
      problemType = review.problemTags || 'known';
    }
    
    // question_aliases: 至少包含第一条用户消息
    const questionAliases = [question];
    
    // rules: 最小规则集
    const rules = {
      keywords: [],
      required_info: [],
      forbidden: []
    };
    
    // 版本号：查询当前 scenario 的最大版本号 + 1
    // 注意：这里简化处理，实际应该从 knowledgeRepo 查询
    const version = 1;
    
    return {
      projectId,
      scenario,
      questionAliases,
      standardAnswer: answer,
      rules,
      sourceReviewId: review.reviewId,
      sourceSuggestionId: null,  // tag 动作没有 suggestion
      sourceEvaluationId: review.evaluationId,
      sourceSessionId: review.sessionId,
      version,
      status: 'active'
    };
  }

  /**
   * 查询 FAQ 候选记录（knowledge_id='pending_faq'）
   * 
   * @param {Object} filters - 筛选条件
   * @returns {Promise<Array>} 候选记录列表
   */
  async getPendingFaqCandidates(filters = {}) {
    const sql = `
      SELECT 
        r.review_id,
        r.evaluation_id,
        r.session_id,
        r.review_action,
        r.review_status,
        r.knowledge_id,
        r.is_adopted,
        r.final_accepted,
        r.problem_tags,
        r.final_reply,
        r.review_note,
        r.reviewer_id,
        r.reviewed_at,
        le.scenario,
        le.project,
        le.summary as evaluation_summary
      FROM reviews r
      LEFT JOIN live_evaluations le ON r.evaluation_id = le.evaluation_id
      WHERE r.review_action = 'tag'
        AND r.review_status = 'tagged'
        AND r.knowledge_id = 'pending_faq'
      ORDER BY r.reviewed_at DESC
    `;
    
    const [rows] = await this.pool.query(sql);
    return rows;
  }
}

module.exports = {
  FaqIngestService
};
