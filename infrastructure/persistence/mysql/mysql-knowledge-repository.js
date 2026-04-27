/**
 * MySQL-based Knowledge Base Repository 实现
 * 
 * 基于MySQL的知识库数据持久化
 * 支持知识记录的创建、查询、去重和版本管理
 */

const { getPool } = require('./mysql-pool');

class MySQLKnowledgeRepository {
  constructor(poolOrConfig = null) {
    this.pool = poolOrConfig || getPool();
  }

  /**
   * 生成知识ID
   */
  _generateId() {
    return `kb_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 数据库行转对象
   */
  _rowToObject(row) {
    if (!row) return null;
    
    return {
      id: row.id,
      knowledgeId: row.knowledge_id,
      rootId: row.root_id,
      projectId: row.project_id,
      scenario: row.scenario,
      questionAliases: typeof row.question_aliases === 'string' 
        ? JSON.parse(row.question_aliases) 
        : row.question_aliases,
      standardAnswer: row.standard_answer,
      rules: typeof row.rules === 'string' 
        ? JSON.parse(row.rules) 
        : row.rules,
      sourceReviewId: row.source_review_id,
      sourceSuggestionId: row.source_suggestion_id,
      sourceEvaluationId: row.source_evaluation_id,
      sourceSessionId: row.source_session_id,
      version: row.version,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  /**
   * 创建知识记录
   * @param {Object} data - 知识数据
   * @returns {Promise<Object>} 创建的知识对象
   */
  async create(data) {
    const knowledgeId = this._generateId();
    const rootId = data.rootId || knowledgeId; // 如果没有 rootId，则自己就是 root
    const now = new Date();
    
    const sql = `
      INSERT INTO knowledge_base (
        knowledge_id, root_id, project_id, scenario, question_aliases, standard_answer, rules,
        source_review_id, source_suggestion_id, source_evaluation_id, source_session_id,
        version, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    await this.pool.query(sql, [
      knowledgeId,
      rootId,
      data.projectId,
      data.scenario,
      JSON.stringify(data.questionAliases),
      data.standardAnswer,
      JSON.stringify(data.rules || {}),
      data.sourceReviewId || null,
      data.sourceSuggestionId || null,
      data.sourceEvaluationId || null,
      data.sourceSessionId || null,
      data.version || 1,
      data.status || 'active',
      now,
      now
    ]);
    
    return this.findById(knowledgeId);
  }

  /**
   * 根据 review_id 查询知识记录
   * @param {string} reviewId - review ID
   * @returns {Promise<Object|null>} 知识对象或 null
   */
  async findByReviewId(reviewId) {
    const sql = `SELECT * FROM knowledge_base WHERE source_review_id = ? LIMIT 1`;
    const [rows] = await this.pool.query(sql, [reviewId]);
    return rows.length > 0 ? this._rowToObject(rows[0]) : null;
  }

  /**
   * 根据 knowledge_id 查询知识记录
   * @param {string} knowledgeId - knowledge ID
   * @returns {Promise<Object|null>} 知识对象或 null
   */
  async findById(knowledgeId) {
    const sql = `SELECT * FROM knowledge_base WHERE knowledge_id = ? LIMIT 1`;
    const [rows] = await this.pool.query(sql, [knowledgeId]);
    return rows.length > 0 ? this._rowToObject(rows[0]) : null;
  }

  /**
   * 根据 scenario 查询知识记录列表
   * @param {string} projectId - 项目 ID
   * @param {string} scenario - 场景名称
   * @returns {Promise<Array>} 知识列表
   */
  async findByScenario(projectId, scenario) {
    const sql = `SELECT * FROM knowledge_base WHERE project_id = ? AND scenario = ? AND status = 'active' ORDER BY version DESC`;
    const [rows] = await this.pool.query(sql, [projectId, scenario]);
    return rows.map(row => this._rowToObject(row));
  }

  /**
   * 查找相似知识（用于去重）
   * @param {Object} data - 查询条件
   * @returns {Promise<Array>} 相似知识列表
   */
  async findSimilarKnowledge(data) {
    const { scenario, questionAliases, sourceReviewId } = data;
    
    // 先检查 source_review_id 是否已存在
    const existingByReview = await this.findByReviewId(sourceReviewId);
    if (existingByReview) {
      return [existingByReview];
    }
    
    // 查找相同 scenario 的知识
    const sql = `
      SELECT * FROM knowledge_base 
      WHERE scenario = ? AND status = 'active'
      ORDER BY version DESC
    `;
    const [rows] = await this.pool.query(sql, [scenario]);
    
    // 过滤出 question_aliases 有交集的知识
    const similarKnowledge = [];
    for (const row of rows) {
      const knowledge = this._rowToObject(row);
      
      // 检查 question_aliases 是否有交集
      if (questionAliases && knowledge.questionAliases) {
        const hasIntersection = questionAliases.some(alias => 
          knowledge.questionAliases.includes(alias)
        );
        
        if (hasIntersection) {
          similarKnowledge.push(knowledge);
        }
      }
    }
    
    return similarKnowledge;
  }

  /**
   * 查询知识记录列表（支持过滤和分页）
   * @param {Object} filters - 过滤条件
   * @param {Object} pagination - 分页参数
   * @returns {Promise<Array>} 知识列表
   */
  async findKnowledge(filters = {}, pagination = {}) {
    const conditions = [];
    const params = [];

    if (filters.projectId) {
      conditions.push('project_id = ?');
      params.push(filters.projectId);
    }

    if (filters.scenario) {
      conditions.push('scenario = ?');
      params.push(filters.scenario);
    }

    if (filters.status) {
      conditions.push('status = ?');
      params.push(filters.status);
    }

    // keyword 搜索：匹配 question_aliases、standard_answer、scenario
    if (filters.keyword) {
      conditions.push('(question_aliases LIKE ? OR standard_answer LIKE ? OR scenario LIKE ?)');
      const likeKeyword = `%${filters.keyword}%`;
      params.push(likeKeyword, likeKeyword, likeKeyword);
    }

    const whereClause = conditions.length > 0 
      ? 'WHERE ' + conditions.join(' AND ')
      : '';

    const page = pagination.page || 1;
    const pageSize = Math.min(pagination.pageSize || 20, 100); // 最大 100
    const offset = (page - 1) * pageSize;

    // LIMIT 和 OFFSET 不能直接用 ? 占位符，需要直接拼接
    const sql = `SELECT * FROM knowledge_base ${whereClause} ORDER BY created_at DESC LIMIT ${pageSize} OFFSET ${offset}`;
    const [rows] = await this.pool.query(sql, params);
    return rows.map(row => this._rowToObject(row));
  }

  /**
   * 统计知识记录数量（支持过滤）
   * @param {Object} filters - 过滤条件
   * @returns {Promise<number>} 记录数量
   */
  async countKnowledge(filters = {}) {
    const conditions = [];
    const params = [];

    if (filters.projectId) {
      conditions.push('project_id = ?');
      params.push(filters.projectId);
    }

    if (filters.scenario) {
      conditions.push('scenario = ?');
      params.push(filters.scenario);
    }

    if (filters.status) {
      conditions.push('status = ?');
      params.push(filters.status);
    }

    if (filters.keyword) {
      conditions.push('(question_aliases LIKE ? OR standard_answer LIKE ? OR scenario LIKE ?)');
      const likeKeyword = `%${filters.keyword}%`;
      params.push(likeKeyword, likeKeyword, likeKeyword);
    }

    const whereClause = conditions.length > 0 
      ? 'WHERE ' + conditions.join(' AND ')
      : '';

    const sql = `SELECT COUNT(*) as total FROM knowledge_base ${whereClause}`;
    const [rows] = await this.pool.query(sql, params);
    return rows[0]?.total || 0;
  }

  /**
   * 更新知识状态
   * @param {string} knowledgeId - knowledge ID
   * @param {string} status - 新状态
   * @returns {Promise<Object>} 更新后的知识对象
   */
  async updateStatus(knowledgeId, status) {
    const sql = `
      UPDATE knowledge_base 
      SET status = ?, updated_at = NOW() 
      WHERE knowledge_id = ?
    `;
    await this.pool.query(sql, [status, knowledgeId]);
    
    return this.findById(knowledgeId);
  }

  /**
   * 查询指定 root_id 的所有版本
   * @param {string} rootId - root ID
   * @returns {Promise<Array>} 版本列表
   */
  async findKnowledgeVersions(rootId) {
    const sql = `SELECT * FROM knowledge_base WHERE root_id = ? ORDER BY version ASC`;
    const [rows] = await this.pool.query(sql, [rootId]);
    return rows.map(row => this._rowToObject(row));
  }

  /**
   * 查询指定 root_id 的最大版本号
   * @param {string} rootId - root ID
   * @returns {Promise<number>} 最大版本号
   */
  async getMaxVersionByRootId(rootId) {
    const sql = `
      SELECT MAX(version) as max_version 
      FROM knowledge_base 
      WHERE root_id = ?
    `;
    const [rows] = await this.pool.query(sql, [rootId]);
    return rows[0]?.max_version || 0;
  }

  /**
   * 查询指定 scenario 的最大版本号（兼容旧方法）
   * @param {string} projectId - 项目 ID
   * @param {string} scenario - 场景名称
   * @returns {Promise<number>} 最大版本号
   */
  async getMaxVersionByScenario(projectId, scenario) {
    const sql = `
      SELECT MAX(version) as max_version 
      FROM knowledge_base 
      WHERE project_id = ? AND scenario = ?
    `;
    const [rows] = await this.pool.query(sql, [projectId, scenario]);
    return rows[0]?.max_version || 0;
  }

  /**
   * 查询 active 状态的知识列表
   * @param {string} projectId - 项目 ID（可选）
   * @returns {Promise<Array>} 知识列表
   */
  async listActiveKnowledge(projectId = null) {
    let sql = `SELECT * FROM knowledge_base WHERE status = 'active'`;
    const params = [];
    
    if (projectId) {
      sql += ' AND project_id = ?';
      params.push(projectId);
    }
    
    sql += ' ORDER BY created_at DESC';
    
    const [rows] = await this.pool.query(sql, params);
    return rows.map(row => this._rowToObject(row));
  }
}

// 导出类
module.exports = {
  MySQLKnowledgeRepository
};
