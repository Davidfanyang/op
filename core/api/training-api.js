/**
 * Training API Controller
 * 
 * 训练记录查询接口控制器，提供：
 * - GET /training/sessions - 查询训练会话列表
 * - GET /training/sessions/:session_id - 查询训练会话详情
 * - GET /training/sessions/:session_id/rounds - 查询训练轮次结果
 * - GET /training/stats - 查询训练统计数据
 */

const url = require('url');
const { success, error, paginated, generateRequestId, APIError } = require('./response');
const { TrainingQueryService } = require('../../services/training-query-service');

class TrainingAPI {
  constructor(options = {}) {
    this.queryService = null;
    this.initialized = false;
    
    // 允许外部注入 service（测试用）
    if (options.queryService) {
      this.queryService = options.queryService;
      this.initialized = true;
    }
  }

  /**
   * 初始化（懒加载）
   */
  async _ensureInitialized() {
    if (this.initialized) return;
    
    this.queryService = TrainingQueryService.getInstance();
    this.initialized = true;
  }

  /**
   * 处理请求入口
   */
  async handleRequest(req, res) {
    await this._ensureInitialized();
    
    const requestId = generateRequestId();
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;
    const method = req.method;
    
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
    
    // 只允许 GET 请求
    if (method !== 'GET') {
      res.writeHead(405);
      res.end(JSON.stringify(error('METHOD_NOT_ALLOWED', 'only GET method is allowed', requestId)));
      return;
    }
    
    try {
      // 路由匹配
      
      // GET /training/stats
      if (pathname === '/training/stats') {
        await this._handleGetStats(req, res, parsedUrl.query, requestId);
        return;
      }
      
      // GET /training/sessions
      if (pathname === '/training/sessions') {
        await this._handleGetSessions(req, res, parsedUrl.query, requestId);
        return;
      }
      
      // 匹配 /training/sessions/:session_id/rounds
      const roundsMatch = pathname.match(/^\/training\/sessions\/([^/]+)\/rounds$/);
      if (roundsMatch) {
        const sessionId = roundsMatch[1];
        await this._handleGetRounds(req, res, sessionId, requestId);
        return;
      }
      
      // 匹配 /training/sessions/:session_id
      const sessionMatch = pathname.match(/^\/training\/sessions\/([^/]+)$/);
      if (sessionMatch) {
        const sessionId = sessionMatch[1];
        await this._handleGetSessionDetail(req, res, sessionId, requestId);
        return;
      }
      
      // 404
      res.writeHead(404);
      res.end(JSON.stringify(error('NOT_FOUND', 'endpoint not found', requestId)));
      
    } catch (err) {
      console.error('[TrainingAPI] Error:', err);
      
      if (err instanceof APIError) {
        res.writeHead(this._getStatusCode(err.code));
        res.end(JSON.stringify(err.toResponse(requestId)));
      } else {
        res.writeHead(500);
        res.end(JSON.stringify(error('INTERNAL_ERROR', err.message, requestId)));
      }
    }
  }

  /**
   * GET /training/sessions
   * 查询训练会话列表
   */
  async _handleGetSessions(req, res, query, requestId) {
    const filters = {
      project: query.project,
      agentId: query.agent_id,
      scenarioId: query.scenario_id,
      status: query.status,
      startTime: query.start_time,
      endTime: query.end_time
    };
    
    const pagination = {
      page: parseInt(query.page) || 1,
      pageSize: parseInt(query.page_size) || 20
    };
    
    const result = await this.queryService.findTrainingSessions(filters, pagination);
    
    res.writeHead(200);
    res.end(JSON.stringify(paginated(result.items, {
      limit: result.pagination.pageSize,  // 使用 Service 层限制后的值
      offset: (result.pagination.page - 1) * result.pagination.pageSize,
      total: result.pagination.total
    }, requestId)));
  }

  /**
   * GET /training/sessions/:session_id
   * 查询训练会话详情
   */
  async _handleGetSessionDetail(req, res, sessionId, requestId) {
    const result = await this.queryService.getTrainingSessionById(sessionId);
    
    if (!result) {
      res.writeHead(404);
      res.end(JSON.stringify(error('TRAINING_SESSION_NOT_FOUND', 'training session not found', requestId)));
      return;
    }
    
    res.writeHead(200);
    res.end(JSON.stringify(success(result, 'ok', requestId)));
  }

  /**
   * GET /training/sessions/:session_id/rounds
   * 查询训练轮次结果
   */
  async _handleGetRounds(req, res, sessionId, requestId) {
    const result = await this.queryService.listTrainingRoundResultsBySessionId(sessionId);
    
    if (!result) {
      res.writeHead(404);
      res.end(JSON.stringify(error('TRAINING_SESSION_NOT_FOUND', 'training session not found', requestId)));
      return;
    }
    
    res.writeHead(200);
    res.end(JSON.stringify(success(result, 'ok', requestId)));
  }

  /**
   * GET /training/stats
   * 查询训练统计数据
   */
  async _handleGetStats(req, res, query, requestId) {
    const filters = {
      project: query.project,
      agentId: query.agent_id,
      scenarioId: query.scenario_id,
      startTime: query.start_time,
      endTime: query.end_time
    };
    
    const result = await this.queryService.aggregateTrainingStats(filters);
    
    res.writeHead(200);
    res.end(JSON.stringify(success(result, 'ok', requestId)));
  }

  /**
   * 获取 HTTP 状态码
   */
  _getStatusCode(code) {
    const mapping = {
      'BAD_REQUEST': 400,
      'VALIDATION_ERROR': 400,
      'NOT_FOUND': 404,
      'TRAINING_SESSION_NOT_FOUND': 404,
      'METHOD_NOT_ALLOWED': 405,
      'INTERNAL_ERROR': 500
    };
    return mapping[code] || 500;
  }
}

module.exports = { TrainingAPI };
