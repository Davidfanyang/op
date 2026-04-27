/**
 * MySQL-based Live Message Repository 实现
 * 
 * 基于MySQL的实时消息数据持久化
 */

const { LiveMessagesRepository } = require('../../../repositories/live-messages-repository');
const { getPool } = require('./mysql-pool');

class MySQLLiveMessageRepository extends LiveMessagesRepository {
  constructor(poolOrConfig = null) {
    super();
    this.pool = poolOrConfig || getPool();
  }

  /**
   * 生成消息ID
   */
  _generateId() {
    return `live_msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 数据库行转对象
   */
  _rowToObject(row) {
    if (!row) return null;
    
    return {
      id: row.id,
      messageId: row.message_id,
      sessionId: row.session_id,
      role: row.role,
      senderId: row.sender_id,
      senderName: row.sender_name,
      content: row.content,
      timestamp: row.timestamp,
      createdAt: row.created_at
    };
  }

  /**
   * 保存消息
   */
  async save(messageData) {
    const messageId = messageData.messageId || this._generateId();
    const timestamp = messageData.timestamp || new Date().toISOString().replace('T', ' ').substring(0, 19);
    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
    
    const sql = `
      INSERT INTO live_messages (message_id, session_id, role, sender_id, sender_name, content, timestamp, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    await this.pool.query(sql, [
      messageId,
      messageData.sessionId,
      messageData.role || 'user',
      messageData.senderId || '',
      messageData.senderName || null,
      messageData.content || '',
      timestamp,
      now
    ]);
    
    console.log('[MySQLLiveMessageRepo] 保存消息:', messageId, 'role:', messageData.role);
    
    return this.findById(messageId);
  }

  /**
   * 按 messageId 查询消息
   */
  async findById(messageId) {
    const sql = `SELECT * FROM live_messages WHERE message_id = ?`;
    const row = await this.pool.queryOne(sql, [messageId]);
    return this._rowToObject(row);
  }

  /**
   * 按 sessionId 查询消息列表
   */
  async findBySessionId(sessionId, options = {}) {
    const order = options.order === 'asc' ? 'ASC' : 'DESC';
    const limit = parseInt(options.limit) || 100;
    const offset = parseInt(options.offset) || 0;
    
    // 注意：LIMIT 和 OFFSET 不能参数化，需要直接嵌入 SQL
    const sql = `
      SELECT * FROM live_messages 
      WHERE session_id = ?
      ORDER BY timestamp ${order}
      LIMIT ${limit} OFFSET ${offset}
    `;
    
    const rows = await this.pool.queryMany(sql, [sessionId]);
    return rows.map(row => this._rowToObject(row));
  }

  /**
   * 关联 evaluation
   */
  async linkEvaluation(messageId, evaluationId) {
    // live_messages 表没有 evaluation_id 字段，此方法为空操作
    console.log('[MySQLLiveMessageRepo] linkEvaluation: 空操作（live_messages表不包含evaluation_id）');
    return true;
  }
}

module.exports = { MySQLLiveMessageRepository };
