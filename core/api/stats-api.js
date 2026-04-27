/**
 * Stats API Controller
 * 
 * 基础统计接口控制器，为 Web 看板提供：
 * - GET /stats/overview - 总览统计
 * - GET /stats/training - 训练统计
 * - GET /stats/quality - 质检统计
 * - GET /stats/alerts - 告警统计
 * - GET /stats/reviews - 审核统计
 * - GET /stats/knowledge - 知识库统计
 * - GET /stats/trend - 时间趋势统计
 * - GET /stats/agents - 客服维度统计
 * 
 * 严格限制：
 * - 只读统计接口，不涉及任何写入/修改操作
 * - 训练与质检统计口径清晰隔离
 * - 统一返回结构 { code: 0, data: {} }
 */

const url = require('url');
const { defaultService: statsService } = require('../../services/stats-service');

class StatsAPI {
  constructor(options = {}) {
    // 允许外部注入 service（测试用）
    this.statsService = options.statsService || statsService;
    this.initialized = true;
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
      
      // GET /stats/overview
      if (pathname === '/stats/overview' && method === 'GET') {
        await this._handleOverview(req, res, query);
        return;
      }

      // GET /stats/training
      if (pathname === '/stats/training' && method === 'GET') {
        await this._handleTraining(req, res, query);
        return;
      }

      // GET /stats/quality
      if (pathname === '/stats/quality' && method === 'GET') {
        await this._handleQuality(req, res, query);
        return;
      }

      // GET /stats/alerts
      if (pathname === '/stats/alerts' && method === 'GET') {
        await this._handleAlerts(req, res, query);
        return;
      }

      // GET /stats/reviews
      if (pathname === '/stats/reviews' && method === 'GET') {
        await this._handleReviews(req, res, query);
        return;
      }

      // GET /stats/knowledge
      if (pathname === '/stats/knowledge' && method === 'GET') {
        await this._handleKnowledge(req, res, query);
        return;
      }

      // GET /stats/trend
      if (pathname === '/stats/trend' && method === 'GET') {
        await this._handleTrend(req, res, query);
        return;
      }

      // GET /stats/agents
      if (pathname === '/stats/agents' && method === 'GET') {
        await this._handleAgents(req, res, query);
        return;
      }

      // 404
      res.writeHead(404);
      res.end(JSON.stringify({ code: 1, error: 'stats_endpoint_not_found' }));

    } catch (err) {
      console.error('[StatsAPI] Error:', err);
      res.writeHead(500);
      res.end(JSON.stringify({ code: 1, error: 'internal_error', message: err.message }));
    }
  }

  /**
   * GET /stats/overview
   */
  async _handleOverview(req, res, query) {
    const filters = {
      project: query.project,
      start_time: query.start_time,
      end_time: query.end_time
    };

    const result = await this.statsService.getOverview(filters);

    res.writeHead(result.code === 0 ? 200 : 400);
    res.end(JSON.stringify(result));
  }

  /**
   * GET /stats/training
   */
  async _handleTraining(req, res, query) {
    const filters = {
      project: query.project,
      agent_id: query.agent_id,
      scenario_id: query.scenario_id,
      start_time: query.start_time,
      end_time: query.end_time
    };

    const result = await this.statsService.getTrainingStats(filters);

    res.writeHead(result.code === 0 ? 200 : 400);
    res.end(JSON.stringify(result));
  }

  /**
   * GET /stats/quality
   */
  async _handleQuality(req, res, query) {
    const filters = {
      project: query.project,
      agent_id: query.agent_id,
      scenario: query.scenario,
      problem_type: query.problem_type,
      start_time: query.start_time,
      end_time: query.end_time
    };

    const result = await this.statsService.getQualityStats(filters);

    res.writeHead(result.code === 0 ? 200 : 400);
    res.end(JSON.stringify(result));
  }

  /**
   * GET /stats/alerts
   */
  async _handleAlerts(req, res, query) {
    const filters = {
      project: query.project,
      agent_id: query.agent_id,
      alert_level: query.alert_level,
      alert_type: query.alert_type,
      start_time: query.start_time,
      end_time: query.end_time
    };

    const result = await this.statsService.getAlertStats(filters);

    res.writeHead(result.code === 0 ? 200 : 400);
    res.end(JSON.stringify(result));
  }

  /**
   * GET /stats/reviews
   */
  async _handleReviews(req, res, query) {
    const filters = {
      project: query.project,
      reviewer_id: query.reviewer_id,
      scenario: query.scenario,
      start_time: query.start_time,
      end_time: query.end_time
    };

    const result = await this.statsService.getReviewStats(filters);

    res.writeHead(result.code === 0 ? 200 : 400);
    res.end(JSON.stringify(result));
  }

  /**
   * GET /stats/knowledge
   */
  async _handleKnowledge(req, res, query) {
    const filters = {
      project: query.project,
      scenario: query.scenario,
      status: query.status,
      start_time: query.start_time,
      end_time: query.end_time
    };

    const result = await this.statsService.getKnowledgeStats(filters);

    res.writeHead(result.code === 0 ? 200 : 400);
    res.end(JSON.stringify(result));
  }

  /**
   * GET /stats/trend
   */
  async _handleTrend(req, res, query) {
    // 验证 type 参数
    if (query.type && !['training', 'quality', 'alerts', 'reviews', 'all'].includes(query.type)) {
      res.writeHead(400);
      res.end(JSON.stringify({ code: 1, error: 'invalid_stats_type' }));
      return;
    }

    // 验证 granularity 参数
    if (query.granularity && !['day', 'week'].includes(query.granularity)) {
      res.writeHead(400);
      res.end(JSON.stringify({ code: 1, error: 'invalid_granularity' }));
      return;
    }

    const filters = {
      project: query.project,
      type: query.type,
      start_time: query.start_time,
      end_time: query.end_time,
      granularity: query.granularity
    };

    const result = await this.statsService.getTrendStats(filters);

    res.writeHead(result.code === 0 ? 200 : 400);
    res.end(JSON.stringify(result));
  }

  /**
   * GET /stats/agents
   */
  async _handleAgents(req, res, query) {
    const filters = {
      project: query.project,
      agent_id: query.agent_id,
      start_time: query.start_time,
      end_time: query.end_time
    };

    const result = await this.statsService.getAgentStats(filters);

    res.writeHead(result.code === 0 ? 200 : 400);
    res.end(JSON.stringify(result));
  }

  /**
   * 关闭资源
   */
  async close() {
    // 无资源需要关闭
  }
}

module.exports = { StatsAPI };
