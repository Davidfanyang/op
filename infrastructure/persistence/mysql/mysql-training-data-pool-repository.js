/**
 * MySQL-based Training Data Pool Repository 实现
 * 
 * 基于MySQL的训练数据池数据持久化
 * 支持训练数据的创建、查询、去重和状态管理
 */

const { getPool } = require('./mysql-pool');

class MySQLTrainingDataPoolRepository {
  constructor(poolOrConfig = null) {
    this.pool = poolOrConfig || getPool();
  }

  /**
   * 生成训练数据ID
   */
  _generateId() {
    return `td_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 生成 input_text 的 hash（用于去重）
   */
  _generateHash(text) {
    // 简单 hash：使用字符串的字符编码和
    // 实际生产环境建议使用 crypto.createHash('sha256')
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return `hash_${Math.abs(hash).toString(36)}`;
  }

  /**
   * 数据库行转对象
   */
  _rowToObject(row) {
    if (!row) return null;
    
    return {
      id: row.id,
      dataId: row.data_id,
      projectId: row.project_id,
      knowledgeId: row.knowledge_id,
      scenario: row.scenario,
      inputText: row.input_text,
      inputTextHash: row.input_text_hash,
      targetReply: row.target_reply,
      rules: typeof row.rules === 'string' 
        ? JSON.parse(row.rules) 
        : row.rules,
      sourceReviewId: row.source_review_id,
      sourceSuggestionId: row.source_suggestion_id,
      sourceEvaluationId: row.source_evaluation_id,
      sourceSessionId: row.source_session_id,
      knowledgeVersion: row.knowledge_version,
      dataVersion: row.data_version,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  /**
   * 创建训练数据记录
   * @param {Object} data - 训练数据
   * @param {string} data.projectId - 项目 ID
   * @param {string} data.knowledgeId - 来源知识 ID
   * @param {string} data.scenario - 场景
   * @param {string} data.inputText - 用户问题表达
   * @param {string} data.targetReply - 标准答案
   * @param {Object} data.rules - 规则对象
   * @param {string} data.sourceReviewId - 来源 review ID
   * @param {string} data.sourceSuggestionId - 来源 suggestion ID
   * @param {string} data.sourceEvaluationId - 来源 evaluation ID
   * @param {string} data.sourceSessionId - 来源 session ID
   * @param {number} data.knowledgeVersion - 来源知识版本
   * @param {number} data.dataVersion - 数据版本
   * @param {string} data.status - 状态
   * @returns {Promise<Object>} 创建的训练数据对象
   */
  async create(data) {
    const dataId = this._generateId();
    const inputTextHash = this._generateHash(data.inputText);
    const now = new Date();
    
    const sql = `
      INSERT INTO training_data_pool (
        data_id, project_id, knowledge_id, scenario, input_text, input_text_hash,
        target_reply, rules, source_review_id, source_suggestion_id,
        source_evaluation_id, source_session_id, knowledge_version,
        data_version, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    await this.pool.query(sql, [
      dataId,
      data.projectId,
      data.knowledgeId,
      data.scenario,
      data.inputText,
      inputTextHash,
      data.targetReply,
      JSON.stringify(data.rules),
      data.sourceReviewId,
      data.sourceSuggestionId,
      data.sourceEvaluationId,
      data.sourceSessionId,
      data.knowledgeVersion,
      data.dataVersion || 1,
      data.status || 'ready',
      now,
      now
    ]);
    
    return this.findByDataId(dataId);
  }

  /**
   * 根据 data_id 查询训练数据
   * @param {string} dataId - data ID
   * @returns {Promise<Object|null>} 训练数据对象或 null
   */
  async findByDataId(dataId) {
    const sql = `SELECT * FROM training_data_pool WHERE data_id = ? LIMIT 1`;
    const [rows] = await this.pool.query(sql, [dataId]);
    return rows.length > 0 ? this._rowToObject(rows[0]) : null;
  }

  /**
   * 根据 knowledge_id + input_text_hash + knowledge_version 查询训练数据（去重）
   * @param {string} knowledgeId - knowledge ID
   * @param {string} inputTextHash - input_text 的 hash
   * @param {number} knowledgeVersion - knowledge 版本
   * @returns {Promise<Object|null>} 训练数据对象或 null
   */
  async findByKnowledgeAndInput(knowledgeId, inputTextHash, knowledgeVersion) {
    const sql = `
      SELECT * FROM training_data_pool 
      WHERE knowledge_id = ? AND input_text_hash = ? AND knowledge_version = ?
      LIMIT 1
    `;
    const [rows] = await this.pool.query(sql, [knowledgeId, inputTextHash, knowledgeVersion]);
    return rows.length > 0 ? this._rowToObject(rows[0]) : null;
  }

  /**
   * 根据 knowledge_id 查询训练数据列表
   * @param {string} knowledgeId - knowledge ID
   * @returns {Promise<Array>} 训练数据列表
   */
  async findByKnowledgeId(knowledgeId) {
    const sql = `SELECT * FROM training_data_pool WHERE knowledge_id = ? ORDER BY created_at DESC`;
    const [rows] = await this.pool.query(sql, [knowledgeId]);
    return rows.map(row => this._rowToObject(row));
  }

  /**
   * 根据 project_id 查询训练数据列表
   * @param {string} projectId - project ID
   * @returns {Promise<Array>} 训练数据列表
   */
  async findByProjectId(projectId) {
    const sql = `SELECT * FROM training_data_pool WHERE project_id = ? ORDER BY created_at DESC`;
    const [rows] = await this.pool.query(sql, [projectId]);
    return rows.map(row => this._rowToObject(row));
  }

  /**
   * 查询训练数据列表（支持过滤）
   * @param {Object} filters - 过滤条件
   * @returns {Promise<Array>} 训练数据列表
   */
  async list(filters = {}) {
    const conditions = [];
    const params = [];

    if (filters.projectId) {
      conditions.push('project_id = ?');
      params.push(filters.projectId);
    }

    if (filters.knowledgeId) {
      conditions.push('knowledge_id = ?');
      params.push(filters.knowledgeId);
    }

    if (filters.scenario) {
      conditions.push('scenario = ?');
      params.push(filters.scenario);
    }

    if (filters.status) {
      conditions.push('status = ?');
      params.push(filters.status);
    }

    const whereClause = conditions.length > 0 
      ? 'WHERE ' + conditions.join(' AND ')
      : '';

    const sql = `SELECT * FROM training_data_pool ${whereClause} ORDER BY created_at DESC`;
    const [rows] = await this.pool.query(sql, params);
    return rows.map(row => this._rowToObject(row));
  }

  /**
   * 更新训练数据状态
   * @param {string} dataId - data ID
   * @param {string} status - 新状态
   * @returns {Promise<Object>} 更新后的训练数据对象
   */
  async updateStatus(dataId, status) {
    const sql = `
      UPDATE training_data_pool 
      SET status = ?, updated_at = NOW() 
      WHERE data_id = ?
    `;
    await this.pool.query(sql, [status, dataId]);
    
    return this.findByDataId(dataId);
  }

  /**
   * 批量更新训练数据状态
   * @param {string} projectId - project ID
   * @param {string} status - 新状态
   * @returns {Promise<number>} 更新的记录数
   */
  async updateStatusByProjectId(projectId, status) {
    const sql = `
      UPDATE training_data_pool 
      SET status = ?, updated_at = NOW() 
      WHERE project_id = ?
    `;
    const [result] = await this.pool.query(sql, [status, projectId]);
    return result.affectedRows || 0;
  }
}

// 导出类
module.exports = {
  MySQLTrainingDataPoolRepository
};
