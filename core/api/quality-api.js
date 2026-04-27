/**
 * Quality API Controller
 * 
 * 质检记录查询接口控制器，提供：
 * - GET /quality/sessions - 查询质检会话列表
 * - GET /quality/sessions/:session_id - 查询质检会话详情
 * - GET /quality/evaluations/:evaluation_id - 查询单条质检结果详情
 * - GET /quality/alerts - 查询告警列表
 * - GET /quality/stats - 查询质检基础统计
 * 
 * 严格限制：
 * - 只读接口，不涉及任何写入/修改操作
 * - 只查询 live 相关表，不混入训练数据
 */

const url = require('url');
const { RepositoryFactory } = require('../../repositories');
const QualityQueryService = require('../../services/quality-query-service');

class QualityAPI {
  constructor(options = {}) {
    this.options = options;
    
    // 根据 repositoryType 创建 Repository Factory
    const factory = new RepositoryFactory({
      type: options.repositoryType || process.env.REPOSITORY_TYPE || 'mysql',
      mysql: options.mysql
    });
    
    // 获取所有 repositories
    const repos = factory.getAll();
    
    // 验证必须的 repository 是否存在
    if (!repos.liveSession) {
      throw new Error('QualityAPI requires liveSession repository');
    }
    if (!repos.liveMessage) {
      throw new Error('QualityAPI requires liveMessage repository');
    }
    if (!repos.liveEvaluation) {
      throw new Error('QualityAPI requires liveEvaluation repository');
    }
    if (!repos.alerts) {
      throw new Error('QualityAPI requires alerts repository');
    }
    
    // 创建 QualityQueryService 并注入 MySQL repositories
    this.qualityQueryService = new QualityQueryService({
      sessionsRepo: repos.liveSession,
      messagesRepo: repos.liveMessage,
      evaluationsRepo: repos.liveEvaluation,
      alertsRepo: repos.alerts
    });
    
    this.initialized = true;
    console.log('[QualityAPI] 初始化成功, repositoryType:', options.repositoryType || process.env.REPOSITORY_TYPE || 'mysql');
  }

  /**
   * 处理请求入口
   */
  async handleRequest(req, res) {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;
    const method = req.method;
    const query = parsedUrl.query;

    // 设置 CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Content-Type', 'application/json');

    if (method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    try {
      // 路由匹配
      // GET /quality/sessions
      if (pathname === '/quality/sessions' && method === 'GET') {
        await this._handleListSessions(req, res, query);
        return;
      }

      // GET /quality/sessions/:session_id
      const sessionMatch = pathname.match(/^\/quality\/sessions\/([^/]+)$/);
      if (sessionMatch && method === 'GET') {
        const sessionId = sessionMatch[1];
        await this._handleGetSessionDetail(req, res, sessionId);
        return;
      }

      // GET /quality/evaluations/:evaluation_id
      const evalMatch = pathname.match(/^\/quality\/evaluations\/([^/]+)$/);
      if (evalMatch && method === 'GET') {
        const evaluationId = evalMatch[1];
        await this._handleGetEvaluationDetail(req, res, evaluationId);
        return;
      }

      // GET /quality/alerts
      if (pathname === '/quality/alerts' && method === 'GET') {
        await this._handleListAlerts(req, res, query);
        return;
      }

      // GET /quality/stats
      if (pathname === '/quality/stats' && method === 'GET') {
        await this._handleGetStats(req, res, query);
        return;
      }

      // 404
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'quality_endpoint_not_found' }));

    } catch (err) {
      console.error('[QualityAPI] Error:', err);
      res.writeHead(500);
      res.end(JSON.stringify({ error: 'internal_error', message: err.message }));
    }
  }

  /**
   * GET /quality/sessions
   */
  async _handleListSessions(req, res, query) {
    // 解析筛选条件
    const filters = {
      project: query.project,
      agent_id: query.agent_id,
      scenario: query.scenario,
      problem_type: query.problem_type,
      has_alert: query.has_alert,
      alert_level: query.alert_level,
      start_time: query.start_time,
      end_time: query.end_time
    };

    // 解析分页参数
    const pagination = {
      page: query.page,
      page_size: query.page_size
    };

    const result = await this.qualityQueryService.listSessions(filters, pagination);

    res.writeHead(200);
    res.end(JSON.stringify({
      code: 0,
      data: result
    }));
  }

  /**
   * GET /quality/sessions/:session_id
   */
  async _handleGetSessionDetail(req, res, sessionId) {
    const result = await this.qualityQueryService.getSessionDetail(sessionId);

    if (!result) {
      res.writeHead(404);
      res.end(JSON.stringify({ 
        code: 404, 
        error: 'quality_session_not_found',
        message: '会话不存在' 
      }));
      return;
    }

    res.writeHead(200);
    res.end(JSON.stringify({
      code: 0,
      data: result
    }));
  }

  /**
   * GET /quality/evaluations/:evaluation_id
   */
  async _handleGetEvaluationDetail(req, res, evaluationId) {
    const result = await this.qualityQueryService.getEvaluationDetail(evaluationId);

    if (!result) {
      res.writeHead(404);
      res.end(JSON.stringify({ 
        code: 404, 
        error: 'quality_evaluation_not_found',
        message: '分析记录不存在' 
      }));
      return;
    }

    res.writeHead(200);
    res.end(JSON.stringify({
      code: 0,
      data: result
    }));
  }

  /**
   * GET /quality/alerts
   */
  async _handleListAlerts(req, res, query) {
    // 解析筛选条件
    const filters = {
      project: query.project,
      agent_id: query.agent_id,
      alert_level: query.alert_level,
      alert_type: query.alert_type,
      status: query.status,
      start_time: query.start_time,
      end_time: query.end_time
    };

    // 解析分页参数
    const pagination = {
      page: query.page,
      page_size: query.page_size
    };

    const result = await this.qualityQueryService.listAlerts(filters, pagination);

    res.writeHead(200);
    res.end(JSON.stringify(result));
  }

  /**
   * GET /quality/stats
   */
  async _handleGetStats(req, res, query) {
    // 解析筛选条件
    const filters = {
      project: query.project,
      agent_id: query.agent_id,
      start_time: query.start_time,
      end_time: query.end_time
    };

    const result = await this.qualityQueryService.getQualityStats(filters);

    res.writeHead(200);
    res.end(JSON.stringify(result));
  }

  /**
   * 关闭资源
   */
  async close() {
    // 无资源需要关闭
  }
}

module.exports = { QualityAPI };
