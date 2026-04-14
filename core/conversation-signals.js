/**
 * Conversation Signals Service
 * 
 * 职责: 从 conversations 事实表提取会话级监督信号
 * 定位: 独立于 AI 评分层,为 supervisor/review 提供风险信号
 * 
 * 当前信号 (4个正式信号):
 * - is_sla_risk: SLA 超时风险
 * - is_invalid_conversation: 无效会话
 * - is_unclosed_conversation: 未关闭会话
 * - is_high_message_count: 高消息复杂度会话
 * 
 * 暂不启用的信号 (脏数据):
 * - is_reopened (reopen_count 全为 0)
 * - is_long_conversation (is_long 全为 0)
 */

const mysql = require('mysql2/promise');

class ConversationSignalsService {
  constructor(config = {}) {
    this.pool = mysql.createPool({
      host: config.host || process.env.DB_HOST || 'localhost',
      user: config.user || process.env.DB_USER || 'root',
      password: config.password || process.env.DB_PASSWORD || '',
      database: config.database || process.env.DB_NAME || 'pai_dashboard',
      waitForConnections: true,
      connectionLimit: config.connectionLimit || 5
    });
  }

  /**
   * 获取单个会话的信号
   * @param {number} conversationId - 会话ID
   * @returns {Object|null} 信号对象
   */
  async getSignalsByConversation(conversationId) {
    const [rows] = await this.pool.query(
      `SELECT * FROM conversation_signals WHERE conversation_id = ?`,
      [conversationId]
    );
    return rows[0] || null;
  }

  /**
   * 获取指定客服的信号统计
   * @param {string} agentTag - 客服标签
   * @param {Object} dateRange - 时间范围 {start, end}
   * @returns {Object} 统计结果
   */
  async getSignalsByAgent(agentTag, dateRange = null) {
    let query = `
      SELECT 
        agent_tag,
        COUNT(*) as total_conversations,
        SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) as open_count,
        SUM(CASE WHEN is_valid = 0 THEN 1 ELSE 0 END) as invalid_count,
        SUM(CASE WHEN is_sla_risk = 1 THEN 1 ELSE 0 END) as sla_risk_count,
        SUM(CASE WHEN is_high_message_count = 1 THEN 1 ELSE 0 END) as high_message_count,
        ROUND(AVG(first_response_seconds), 0) as avg_first_response,
        MIN(first_response_seconds) as min_first_response,
        MAX(first_response_seconds) as max_first_response
      FROM conversation_signals
      WHERE agent_tag IS NOT NULL
    `;

    const params = [];

    if (agentTag) {
      query += ` AND agent_tag = ?`;
      params.push(agentTag);
    }

    if (dateRange && dateRange.start) {
      query += ` AND start_time >= ?`;
      params.push(dateRange.start);
    }

    if (dateRange && dateRange.end) {
      query += ` AND start_time <= ?`;
      params.push(dateRange.end);
    }

    query += ` GROUP BY agent_tag ORDER BY total_conversations DESC`;

    const [rows] = await this.pool.query(query, params);
    return agentTag ? (rows[0] || null) : rows;
  }

  /**
   * 获取风险会话列表
   * @param {Object} filters - 过滤条件
   * @returns {Array} 风险会话列表
   */
  async getRiskConversations(filters = {}) {
    const conditions = [];
    const params = [];

    // 至少命中一个风险信号
    const riskConditions = [];
    
    if (filters.includeSlaRisk !== false) {
      riskConditions.push('is_sla_risk = 1');
    }
    if (filters.includeInvalid !== false) {
      riskConditions.push('is_invalid_conversation = 1');
    }
    if (filters.includeUnclosed !== false) {
      riskConditions.push('is_unclosed_conversation = 1');
    }
    if (filters.includeHighMessage !== false) {
      riskConditions.push('is_high_message_count = 1');
    }

    if (riskConditions.length > 0) {
      conditions.push(`(${riskConditions.join(' OR ')})`);
    }

    if (filters.agentTag) {
      conditions.push('agent_tag = ?');
      params.push(filters.agentTag);
    }

    if (filters.dateRange && filters.dateRange.start) {
      conditions.push('start_time >= ?');
      params.push(filters.dateRange.start);
    }

    if (filters.dateRange && filters.dateRange.end) {
      conditions.push('start_time <= ?');
      params.push(filters.dateRange.end);
    }

    const whereClause = conditions.length > 0 
      ? 'WHERE ' + conditions.join(' AND ')
      : '';

    const query = `
      SELECT 
        conversation_id,
        agent_tag,
        status,
        is_valid,
        message_count,
        first_response_seconds,
        is_sla_risk,
        is_invalid_conversation,
        is_unclosed_conversation,
        is_high_message_count,
        start_time,
        end_time
      FROM conversation_signals
      ${whereClause}
      ORDER BY start_time DESC
      LIMIT ?
    `;

    params.push(filters.limit || 100);

    const [rows] = await this.pool.query(query, params);
    return rows;
  }

  /**
   * 获取全局运营统计
   * @returns {Object} 全局统计
   */
  async getGlobalStats() {
    const [rows] = await this.pool.query(`
      SELECT 
        COUNT(*) as total_conversations,
        SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) as closed_count,
        SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) as open_count,
        SUM(CASE WHEN is_valid = 1 THEN 1 ELSE 0 END) as valid_count,
        SUM(CASE WHEN is_valid = 0 THEN 1 ELSE 0 END) as invalid_count,
        SUM(CASE WHEN is_sla_risk = 1 THEN 1 ELSE 0 END) as sla_risk_count,
        SUM(CASE WHEN is_high_message_count = 1 THEN 1 ELSE 0 END) as high_message_count,
        ROUND(AVG(first_response_seconds), 0) as avg_first_response,
        MIN(start_time) as earliest,
        MAX(start_time) as latest
      FROM conversation_signals
    `);

    return rows[0];
  }

  /**
   * 关闭连接池
   */
  async destroy() {
    await this.pool.end();
  }
}

module.exports = ConversationSignalsService;
