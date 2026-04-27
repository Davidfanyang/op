/**
 * Repository 层统一入口
 * 
 * 提供：
 * 1. 接口定义导出
 * 2. File-based 实现导出
 * 3. Repository 工厂
 */

const { SessionRepository } = require('./session-repository');
const { MessageRepository } = require('./message-repository');
const { EvaluationRepository } = require('./evaluation-repository');
const { ReviewRepository } = require('./review-repository');

const { FileSessionRepository } = require('../infrastructure/persistence/file/file-session-repository');
const { FileMessageRepository } = require('../infrastructure/persistence/file/file-message-repository');
const { FileEvaluationRepository } = require('../infrastructure/persistence/file/file-evaluation-repository');
const { FileReviewRepository } = require('../infrastructure/persistence/file/file-review-repository');

// MySQL 实现
const { MySQLSessionRepository } = require('../infrastructure/persistence/mysql/mysql-session-repository');
const { MySQLMessageRepository } = require('../infrastructure/persistence/mysql/mysql-message-repository');
const { MySQLEvaluationRepository } = require('../infrastructure/persistence/mysql/mysql-evaluation-repository');
const { MySQLReviewRepository } = require('../infrastructure/persistence/mysql/mysql-review-repository');
const { MySQLLiveSessionRepository } = require('../infrastructure/persistence/mysql/mysql-live-session-repository');
const { MySQLLiveMessageRepository } = require('../infrastructure/persistence/mysql/mysql-live-message-repository');
const { MySQLLiveEvaluationRepository } = require('../infrastructure/persistence/mysql/mysql-live-evaluation-repository');
const { MySQLSuggestionsRepository } = require('../infrastructure/persistence/mysql/mysql-suggestions-repository');
const { MySQLReviewsRepository } = require('../infrastructure/persistence/mysql/mysql-reviews-repository');
const { MySQLPool, createPool } = require('../infrastructure/persistence/mysql/mysql-pool');

/**
 * Repository 工厂
 * 根据配置创建对应的 Repository 实例
 * 
 * 支持驱动类型:
 * - 'file': 基于文件系统的持久化（开发/测试用）
 * - 'mysql': 基于 MySQL 的持久化（生产环境）
 * - 'mock': 内存模拟（单元测试用）
 */
class RepositoryFactory {
  constructor(config = {}) {
    this.config = {
      type: config.type || 'file', // 'file' | 'mysql' | 'mock'
      basePath: config.basePath || './runtime/persistence',
      // MySQL 配置
      mysql: {
        host: config.mysql?.host || process.env.MYSQL_HOST || 'localhost',
        port: config.mysql?.port || parseInt(process.env.MYSQL_PORT || '3306'),
        user: config.mysql?.user || process.env.MYSQL_USER || 'root',
        password: config.mysql?.password || process.env.MYSQL_PASSWORD || '',
        database: config.mysql?.database || process.env.MYSQL_DATABASE || 'trainer_core',
        connectionLimit: config.mysql?.connectionLimit || 10,
        ...config.mysql
      },
      ...config
    };
    
    this._instances = {};
    this._mysqlPool = null;
  }

  /**
   * 获取 MySQL 连接池（懒加载）
   */
  _getMySQLPool() {
    if (!this._mysqlPool) {
      this._mysqlPool = createPool(this.config.mysql);
    }
    return this._mysqlPool;
  }

  /**
   * 获取 Session Repository
   */
  getSessionRepository() {
    if (!this._instances.session) {
      switch (this.config.type) {
        case 'file':
          this._instances.session = new FileSessionRepository(
            `${this.config.basePath}/sessions`
          );
          break;
        case 'mysql':
          this._instances.session = new MySQLSessionRepository(this._getMySQLPool());
          break;
        case 'mock':
          this._instances.session = new SessionRepository();
          break;
        default:
          throw new Error(`Unknown repository type: ${this.config.type}`);
      }
    }
    return this._instances.session;
  }

  /**
   * 获取 Message Repository
   */
  getMessageRepository() {
    if (!this._instances.message) {
      switch (this.config.type) {
        case 'file':
          this._instances.message = new FileMessageRepository(
            `${this.config.basePath}/messages`
          );
          break;
        case 'mysql':
          this._instances.message = new MySQLMessageRepository(this._getMySQLPool());
          break;
        case 'mock':
          this._instances.message = new MessageRepository();
          break;
        default:
          throw new Error(`Unknown repository type: ${this.config.type}`);
      }
    }
    return this._instances.message;
  }

  /**
   * 获取 Evaluation Repository
   */
  getEvaluationRepository() {
    if (!this._instances.evaluation) {
      switch (this.config.type) {
        case 'file':
          this._instances.evaluation = new FileEvaluationRepository(
            `${this.config.basePath}/evaluations`
          );
          break;
        case 'mysql':
          this._instances.evaluation = new MySQLEvaluationRepository(this._getMySQLPool());
          break;
        case 'mock':
          this._instances.evaluation = new EvaluationRepository();
          break;
        default:
          throw new Error(`Unknown repository type: ${this.config.type}`);
      }
    }
    return this._instances.evaluation;
  }

  /**
   * 获取 Live Session Repository
   */
  getLiveSessionRepository() {
    if (!this._instances.liveSession) {
      switch (this.config.type) {
        case 'file':
          const { defaultRepo } = require('../repositories/impl/file-live-sessions-repository');
          this._instances.liveSession = defaultRepo;
          break;
        case 'mysql':
          this._instances.liveSession = new MySQLLiveSessionRepository(this._getMySQLPool());
          break;
        case 'mock':
          const { LiveSessionsRepository } = require('../repositories/live-sessions-repository');
          this._instances.liveSession = new LiveSessionsRepository();
          break;
        default:
          throw new Error(`Unknown repository type: ${this.config.type}`);
      }
    }
    return this._instances.liveSession;
  }

  /**
   * 获取 Live Message Repository
   */
  getLiveMessageRepository() {
    if (!this._instances.liveMessage) {
      switch (this.config.type) {
        case 'file':
          const { defaultRepo } = require('../repositories/impl/file-live-messages-repository');
          this._instances.liveMessage = defaultRepo;
          break;
        case 'mysql':
          this._instances.liveMessage = new MySQLLiveMessageRepository(this._getMySQLPool());
          break;
        case 'mock':
          const { LiveMessagesRepository } = require('../repositories/live-messages-repository');
          this._instances.liveMessage = new LiveMessagesRepository();
          break;
        default:
          throw new Error(`Unknown repository type: ${this.config.type}`);
      }
    }
    return this._instances.liveMessage;
  }

  /**
   * 获取 Live Evaluation Repository
   */
  getLiveEvaluationRepository() {
    if (!this._instances.liveEvaluation) {
      switch (this.config.type) {
        case 'file':
          const { defaultRepo } = require('../repositories/impl/file-live-evaluations-repository');
          this._instances.liveEvaluation = defaultRepo;
          break;
        case 'mysql':
          this._instances.liveEvaluation = new MySQLLiveEvaluationRepository(this._getMySQLPool());
          break;
        case 'mock':
          const { LiveEvaluationsRepository } = require('../repositories/live-evaluations-repository');
          this._instances.liveEvaluation = new LiveEvaluationsRepository();
          break;
        default:
          throw new Error(`Unknown repository type: ${this.config.type}`);
      }
    }
    return this._instances.liveEvaluation;
  }

  /**
   * 获取 Review Repository
   */
  getReviewRepository() {
    if (!this._instances.review) {
      switch (this.config.type) {
        case 'file':
          this._instances.review = new FileReviewRepository(
            `${this.config.basePath}/reviews`
          );
          break;
        case 'mysql':
          const reviewRepo = new MySQLReviewRepository(this._getMySQLPool());
          // 设置 evaluationRepository 引用，用于同步更新
          reviewRepo.setEvaluationRepository(this.getEvaluationRepository());
          this._instances.review = reviewRepo;
          break;
        case 'mock':
          this._instances.review = new ReviewRepository();
          break;
        default:
          throw new Error(`Unknown repository type: ${this.config.type}`);
      }
    }
    return this._instances.review;
  }

  /**
   * 获取 Suggestions Repository
   */
  getSuggestionsRepository() {
    if (!this._instances.suggestions) {
      switch (this.config.type) {
        case 'file':
          const { defaultRepo } = require('../repositories/impl/file-suggestions-repository');
          this._instances.suggestions = defaultRepo;
          break;
        case 'mysql':
          this._instances.suggestions = new MySQLSuggestionsRepository(this._getMySQLPool());
          break;
        case 'mock':
          this._instances.suggestions = { findById: () => null, create: () => null };
          break;
        default:
          throw new Error(`Unknown repository type: ${this.config.type}`);
      }
    }
    return this._instances.suggestions;
  }

  /**
   * 获取 Reviews Repository (live_monitor reviews)
   */
  getReviewsRepository() {
    if (!this._instances.reviews) {
      switch (this.config.type) {
        case 'file':
          const { defaultRepo } = require('../repositories/impl/file-reviews-repository');
          this._instances.reviews = defaultRepo;
          break;
        case 'mysql':
          this._instances.reviews = new MySQLReviewsRepository(this._getMySQLPool());
          break;
        case 'mock':
          this._instances.reviews = { findById: () => null, create: () => null };
          break;
        default:
          throw new Error(`Unknown repository type: ${this.config.type}`);
      }
    }
    return this._instances.reviews;
  }

  /**
   * 获取 Alerts Repository
   */
  getAlertsRepository() {
    if (!this._instances.alerts) {
      switch (this.config.type) {
        case 'file':
          const { defaultRepo } = require('../repositories/impl/file-alerts-repository');
          this._instances.alerts = defaultRepo;
          break;
        case 'mysql':
          // alerts 使用 reviews 表存储
          this._instances.alerts = new MySQLReviewsRepository(this._getMySQLPool());
          break;
        case 'mock':
          this._instances.alerts = { findById: () => null, create: () => null };
          break;
        default:
          throw new Error(`Unknown repository type: ${this.config.type}`);
      }
    }
    return this._instances.alerts;
  }

  /**
   * 获取所有 Repository（包含 live）
   */
  getAll() {
    return {
      session: this.getSessionRepository(),
      message: this.getMessageRepository(),
      evaluation: this.getEvaluationRepository(),
      review: this.getReviewRepository(),
      liveSession: this.getLiveSessionRepository(),
      liveMessage: this.getLiveMessageRepository(),
      liveEvaluation: this.getLiveEvaluationRepository(),
      suggestions: this.getSuggestionsRepository(),
      reviews: this.getReviewsRepository(),
      alerts: this.getAlertsRepository()
    };
  }

  /**
   * 获取 MySQL Repository 集合（便捷方法）
   * 如果当前不是 MySQL 模式，会抛出错误
   */
  getMySQLRepositories() {
    if (this.config.type !== 'mysql') {
      throw new Error('当前未使用 MySQL 模式，无法获取 MySQL Repositories');
    }
    return {
      session: this.getSessionRepository(),
      message: this.getMessageRepository(),
      evaluation: this.getEvaluationRepository(),
      review: this.getReviewRepository(),
      liveSession: this.getLiveSessionRepository(),
      liveMessage: this.getLiveMessageRepository(),
      liveEvaluation: this.getLiveEvaluationRepository()
    };
  }

  /**
   * 重置所有实例（用于测试）
   */
  reset() {
    this._instances = {};
    if (this._mysqlPool) {
      this._mysqlPool.close().catch(() => {});
      this._mysqlPool = null;
    }
  }

  /**
   * 初始化连接（MySQL 模式需要先调用）
   */
  async initialize() {
    if (this.config.type === 'mysql') {
      await this._getMySQLPool().connect();
    }
  }

  /**
   * 关闭连接
   */
  async close() {
    if (this._mysqlPool) {
      await this._mysqlPool.close();
      this._mysqlPool = null;
    }
  }

  /**
   * 健康检查
   */
  async healthCheck() {
    if (this.config.type === 'mysql' && this._mysqlPool) {
      return this._mysqlPool.healthCheck();
    }
    return true;
  }
}

// 默认工厂实例（根据环境变量 REPOSITORY_TYPE 初始化）
const defaultFactory = new RepositoryFactory({
  type: process.env.REPOSITORY_TYPE || 'file'
});

module.exports = {
  // 接口定义
  SessionRepository,
  MessageRepository,
  EvaluationRepository,
  ReviewRepository,
  
  // File 实现
  FileSessionRepository,
  FileMessageRepository,
  FileEvaluationRepository,
  FileReviewRepository,
  
  // MySQL 实现
  MySQLSessionRepository,
  MySQLMessageRepository,
  MySQLEvaluationRepository,
  MySQLReviewRepository,
  MySQLLiveSessionRepository,
  MySQLLiveMessageRepository,
  MySQLLiveEvaluationRepository,
  MySQLPool,
  createPool,
  
  // 工厂
  RepositoryFactory,
  
  // 便捷获取默认实例
  getSessionRepository: () => defaultFactory.getSessionRepository(),
  getMessageRepository: () => defaultFactory.getMessageRepository(),
  getEvaluationRepository: () => defaultFactory.getEvaluationRepository(),
  getReviewRepository: () => defaultFactory.getReviewRepository(),
  getLiveSessionRepository: () => defaultFactory.getLiveSessionRepository(),
  getLiveMessageRepository: () => defaultFactory.getLiveMessageRepository(),
  getLiveEvaluationRepository: () => defaultFactory.getLiveEvaluationRepository(),
  getSuggestionsRepository: () => defaultFactory.getSuggestionsRepository(),
  getReviewsRepository: () => defaultFactory.getReviewsRepository(),
  getAlertsRepository: () => defaultFactory.getAlertsRepository(),
  getRepositories: () => defaultFactory.getAll(),
  createRepositoryFactory: (config) => new RepositoryFactory(config),
  getDefaultFactory: () => defaultFactory
};
