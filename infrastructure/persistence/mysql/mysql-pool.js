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
   * 执行查询
   * @param {string} sql - SQL语句
   * @param {Array} params - 参数
   * @returns {Promise<Array>} [rows, fields]
   */
  async query(sql, params = []) {
    if (!this.pool) {
      await this.connect();
    }
    
    try {
      const [rows, fields] = await this.pool.execute(sql, params);
      return [rows, fields];
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
    const [result] = await this.query(sql, params);
    return result.insertId;
  }

  /**
   * 执行更新并返回影响行数
   * @param {string} sql - SQL语句
   * @param {Array} params - 参数
   * @returns {Promise<number>} affectedRows
   */
  async update(sql, params = []) {
    const [result] = await this.query(sql, params);
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
