/**
 * MySQL 连接池管理模块
 * 
 * 提供统一的 MySQL 连接池管理，支持：
 * - 连接池配置
 * - 连接获取/释放
 * - 事务支持
 * - 健康检查
 */

const mysql = require('mysql2/promise');

class MySQLPool {
  constructor(config = {}) {
    this.config = {
      host: config.host || process.env.MYSQL_HOST || 'localhost',
      port: config.port || parseInt(process.env.MYSQL_PORT || '3306'),
      user: config.user || process.env.MYSQL_USER || 'root',
      password: config.password || process.env.MYSQL_PASSWORD || '',
      database: config.database || process.env.MYSQL_DATABASE || 'trainer_core',
      
      // 连接池配置
      waitForConnections: config.waitForConnections !== false,
      connectionLimit: config.connectionLimit || 10,
      queueLimit: config.queueLimit || 0,
      
      // 超时配置
      connectTimeout: config.connectTimeout || 10000,
      acquireTimeout: config.acquireTimeout || 30000,
      
      // 字符集
      charset: config.charset || 'utf8mb4',
      
      // 时区
      timezone: config.timezone || '+00:00',
      
      // 调试模式
      debug: config.debug || false
    };
    
    this.pool = null;
    this._isConnected = false;
  }

  /**
   * 初始化连接池
   * @returns {Promise<void>}
   */
  async connect() {
    if (this.pool) {
      return;
    }
    
    try {
      this.pool = mysql.createPool(this.config);
      
      // 测试连接
      const connection = await this.pool.getConnection();
      await connection.ping();
      connection.release();
      
      this._isConnected = true;
      console.log('[MySQLPool] Connected successfully', {
        host: this.config.host,
        database: this.config.database,
        connectionLimit: this.config.connectionLimit
      });
    } catch (err) {
      console.error('[MySQLPool] Connection failed:', err.message);
      throw err;
    }
  }

  /**
   * 获取连接池状态
   * @returns {Object}
   */
  getStatus() {
    if (!this.pool) {
      return { connected: false };
    }
    
    return {
      connected: this._isConnected,
      config: {
        host: this.config.host,
        database: this.config.database,
        connectionLimit: this.config.connectionLimit
      }
    };
  }

  /**
   * 转换 ISO 8601  datetime 为 MySQL DATETIME 格式
   * @param {string|Date} datetime - ISO 8601 字符串或 Date 对象
   * @returns {string} MySQL DATETIME 格式: 'YYYY-MM-DD HH:MM:SS'
   */
  _toMySQLDatetime(datetime) {
    if (!datetime) return null;
    
    // 如果已经是 Date 对象
    if (datetime instanceof Date) {
      return datetime.toISOString().replace('T', ' ').substring(0, 19);
    }
    
    // 如果是 ISO 8601 字符串
    if (typeof datetime === 'string') {
      // 如果已经是 MySQL 格式，直接返回
      if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(datetime)) {
        return datetime;
      }
      
      // 转换 ISO 8601 到 MySQL 格式
      try {
        const date = new Date(datetime);
        if (isNaN(date.getTime())) {
          console.warn('[MySQLPool] Invalid datetime value:', datetime);
          return null;
        }
        return date.toISOString().replace('T', ' ').substring(0, 19);
      } catch (e) {
        console.error('[MySQLPool] Failed to parse datetime:', datetime, e.message);
        return null;
      }
    }
    
    return datetime;
  }

  /**
   * 执行查询
   * @param {string} sql - SQL语句
   * @param {Array} params - 参数
   * @returns {Promise<Array|Object>} 对于SELECT返回[rows, fields]，对于UPDATE/INSERT/DELETE返回result对象
   */
  async query(sql, params = []) {
    if (!this.pool) {
      await this.connect();
    }
    
    // 转换所有 datetime 参数（更严格的检查）
    const convertedParams = params.map((param, index) => {
      // 只转换明确的 ISO 8601 格式（包含 'T' 和 'Z' 或时区偏移）
      if (typeof param === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(param)) {
        const converted = this._toMySQLDatetime(param);
        if (converted === null) {
          console.warn(`[MySQLPool] Param ${index} datetime conversion failed, using original:`, param);
          return param; // 转换失败时使用原值
        }
        console.debug(`[MySQLPool] Converted datetime param ${index}: ${param} -> ${converted}`);
        return converted;
      }
      return param;
    });
    
    try {
      const [result, fields] = await this.pool.execute(sql, convertedParams);
      
      // 对于 UPDATE/INSERT/DELETE，返回完整的 result 对象（包含 affectedRows, insertId 等）
      // 对于 SELECT，返回 [rows, fields]
      if (fields === undefined) {
        // UPDATE/INSERT/DELETE 语句
        return result;
      } else {
        // SELECT 语句
        return [result, fields];
      }
    } catch (err) {
      console.error('[MySQLPool] Query error:', err.message, { sql: sql.substring(0, 100) });
      throw err;
    }
  }

  /**
   * 执行查询（返回单行）
   * @param {string} sql - SQL语句
   * @param {Array} params - 参数
   * @returns {Promise<Object|null>}
   */
  async queryOne(sql, params = []) {
    const [rows] = await this.query(sql, params);
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * 执行查询（返回多行）
   * @param {string} sql - SQL语句
   * @param {Array} params - 参数
   * @returns {Promise<Array>}
   */
  async queryMany(sql, params = []) {
    const [rows] = await this.query(sql, params);
    return rows;
  }

  /**
   * 执行插入并返回插入ID
   * @param {string} sql - SQL语句
   * @param {Array} params - 参数
   * @returns {Promise<number|string>} insertId
   */
  async insert(sql, params = []) {
    const result = await this.query(sql, params);
    return result.insertId;
  }

  /**
   * 执行更新并返回影响行数
   * @param {string} sql - SQL语句
   * @param {Array} params - 参数
   * @returns {Promise<number>} affectedRows
   */
  async update(sql, params = []) {
    const result = await this.query(sql, params);
    return result.affectedRows;
  }

  /**
   * 执行事务
   * @param {Function} callback - 事务回调函数，接收 connection 参数
   * @returns {Promise<any>} callback 的返回值
   */
  async transaction(callback) {
    if (!this.pool) {
      await this.connect();
    }
    
    const connection = await this.pool.getConnection();
    
    try {
      await connection.beginTransaction();
      
      // 提供简化的查询接口
      const txConn = {
        query: (sql, params) => connection.execute(sql, params),
        queryOne: async (sql, params) => {
          const [rows] = await connection.execute(sql, params);
          return rows.length > 0 ? rows[0] : null;
        },
        queryMany: async (sql, params) => {
          const [rows] = await connection.execute(sql, params);
          return rows;
        },
        insert: async (sql, params) => {
          const [result] = await connection.execute(sql, params);
          return result.insertId;
        },
        update: async (sql, params) => {
          const [result] = await connection.execute(sql, params);
          return result.affectedRows;
        }
      };
      
      const result = await callback(txConn);
      await connection.commit();
      return result;
    } catch (err) {
      await connection.rollback();
      console.error('[MySQLPool] Transaction rollback:', err.message);
      throw err;
    } finally {
      connection.release();
    }
  }

  /**
   * 健康检查
   * @returns {Promise<boolean>}
   */
  async healthCheck() {
    try {
      if (!this.pool) {
        return false;
      }
      
      const connection = await this.pool.getConnection();
      await connection.ping();
      connection.release();
      return true;
    } catch (err) {
      console.error('[MySQLPool] Health check failed:', err.message);
      return false;
    }
  }

  /**
   * 关闭连接池
   * @returns {Promise<void>}
   */
  async close() {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      this._isConnected = false;
      console.log('[MySQLPool] Connection pool closed');
    }
  }
}

// 单例模式
let defaultPool = null;

/**
 * 获取默认连接池实例
 * @param {Object} config - 配置
 * @returns {MySQLPool}
 */
function getPool(config = {}) {
  if (!defaultPool) {
    defaultPool = new MySQLPool(config);
  }
  return defaultPool;
}

/**
 * 创建新的连接池实例
 * @param {Object} config - 配置
 * @returns {MySQLPool}
 */
function createPool(config = {}) {
  return new MySQLPool(config);
}

module.exports = {
  MySQLPool,
  getPool,
  createPool
};
