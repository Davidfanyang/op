/**
 * MySQL-based Message Repository 实现
 * 
 * 基于MySQL的消息数据持久化
 */

const { MessageRepository } = require('../../../repositories/message-repository');
const { getPool } = require('./mysql-pool');

class MySQLMessageRepository extends MessageRepository {
  constructor(poolOrConfig = null) {
    super();
    this.pool = poolOrConfig || getPool();
  }

  /**
   * 生成消息ID
   */
  _generateId() {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 数据库行转对象
   */
  _rowToObject(row) {
    if (!row) return null;
    
    return {
      messageId: row.message_id,
      sessionId: row.session_id,
      projectId: row.project_id,
      channel: row.channel,
      employeeId: null, // 不在消息表中直接存储，通过session获取
      customerId: null,
      direction: row.message_direction,
      content: row.content,
      messageType: row.message_type,
      senderRole: row.sender_role,
      senderId: row.sender_id,
      timestamp: row.sent_at,
      rawPayload: (function(v) { if (!v) return null; if (typeof v === 'object') return v; try { return JSON.parse(v); } catch { return v; } })(row.raw_payload_json),
      normalized: {
        intent: row.normalized_intent,
        event: row.normalized_event
      },
      createdAt: row.created_at
    };
  }

  /**
   * 对象转数据库字段
   */
  _objectToRow(data) {
    return {
      message_id: data.messageId || this._generateId(),
      session_id: data.sessionId,
      project_id: data.projectId,
      channel: data.channel,
      sender_role: data.senderRole || 'agent',
      sender_id: data.senderId || null,
      message_direction: data.direction || 'outbound',
      content: data.content,
      message_type: data.messageType || 'text',
      raw_payload_json: data.rawPayload ? JSON.stringify(data.rawPayload) : null,
      normalized_intent: data.normalized?.intent || null,
      normalized_event: data.normalized?.event || null,
      sent_at: data.timestamp || new Date()
    };
  }

  /**
   * 保存消息
   */
  async save(messageData) {
    const row = this._objectToRow(messageData);
    
    const sql = `
      INSERT INTO messages (
        message_id, session_id, project_id, channel, sender_role, sender_id,
        message_direction, content, message_type, raw_payload_json,
        normalized_intent, normalized_event, sent_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    await this.pool.insert(sql, [
      row.message_id,
      row.session_id,
      row.project_id,
      row.channel,
      row.sender_role,
      row.sender_id,
      row.message_direction,
      row.content,
      row.message_type,
      row.raw_payload_json,
      row.normalized_intent,
      row.normalized_event,
      row.sent_at
    ]);
    
    return this.findById(row.message_id);
  }

  /**
   * 按 messageId 查询消息
   */
  async findById(messageId) {
    const sql = `SELECT * FROM messages WHERE message_id = ?`;
    const row = await this.pool.queryOne(sql, [messageId]);
    return this._rowToObject(row);
  }

  /**
   * 按 sessionId 拉取消息列表
   */
  async findBySessionId(sessionId, options = {}) {
    const order = options.order === 'asc' ? 'ASC' : 'DESC';
    const limit = parseInt(options.limit) || 100;
    const offset = parseInt(options.offset) || 0;
    
    // 注意：LIMIT 和 OFFSET 不能参数化，需要直接嵌入 SQL（已做整数转换防止注入）
    const sql = `
      SELECT * FROM messages 
      WHERE session_id = ?
      ORDER BY sent_at ${order}
      LIMIT ${limit} OFFSET ${offset}
    `;
    
    const rows = await this.pool.queryMany(sql, [sessionId]);
    return rows.map(row => this._rowToObject(row));
  }

  /**
   * 查询消息列表（支持过滤）
   */
  async findMany(filters, pagination = { page: 1, limit: 50 }) {
    const conditions = [];
    const params = [];
    
    if (filters.projectId) {
      conditions.push('project_id = ?');
      params.push(filters.projectId);
    }
    
    if (filters.sessionId) {
      conditions.push('session_id = ?');
      params.push(filters.sessionId);
    }
    
    if (filters.channel) {
      conditions.push('channel = ?');
      params.push(filters.channel);
    }
    
    if (filters.senderRole) {
      conditions.push('sender_role = ?');
      params.push(filters.senderRole);
    }
    
    if (filters.direction) {
      conditions.push('message_direction = ?');
      params.push(filters.direction);
    }
    
    const whereClause = conditions.length > 0 
      ? `WHERE ${conditions.join(' AND ')}` 
      : '';
    
    // 查询总数
    const countSql = `SELECT COUNT(*) as total FROM messages ${whereClause}`;
    const countRow = await this.pool.queryOne(countSql, params);
    const total = countRow.total;
    
    // 分页查询
    const limit = parseInt(pagination.limit) || 20;
    const offset = (pagination.page - 1) * limit;
    const sql = `
      SELECT * FROM messages ${whereClause}
      ORDER BY sent_at DESC
      LIMIT ${limit} OFFSET ${offset}`;
    
    const rows = await this.pool.queryMany(sql, params);
    
    return {
      items: rows.map(row => this._rowToObject(row)),
      total
    };
  }

  /**
   * 获取会话最新消息
   */
  async getLatestBySession(sessionId) {
    const sql = `
      SELECT * FROM messages 
      WHERE session_id = ?
      ORDER BY sent_at DESC
      LIMIT 1
    `;
    
    const row = await this.pool.queryOne(sql, [sessionId]);
    return this._rowToObject(row);
  }

  /**
   * 更新消息评估关联
   * 注：messages 表不存储 evaluationId，此方法用于记录关联信息
   * 可以通过 evaluations 表反向查询
   */
  async linkEvaluation(messageId, evaluationId) {
    // 在 MySQL 设计中，evaluation 关联在 evaluations 表中
    // 此方法保留接口兼容性，但实际不需要操作
    const message = await this.findById(messageId);
    return message;
  }
}

module.exports = { MySQLMessageRepository };
