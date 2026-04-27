/**
 * Review API Controller
 * 
 * 主管审核页面承接接口，提供：
 * - GET /review/tasks - 查询待审核任务列表
 * - GET /review/tasks/:suggestion_id - 查询审核任务详情
 * - POST /review/submit - 提交审核结果
 * - GET /review/records - 查询审核记录列表
 * - GET /review/stats - 查询审核统计
 * 
 * 严格遵循：
 * - 只处理 suggestion / review 相关审核任务
 * - 详情返回完整上下文（suggestion + session + conversation + evaluation + alerts + review）
 * - 提交审核复用既有 review-service
 * - 统一返回结构 { code: 0, data: {} } 或 { code: 1, error: "..." }
 */

const url = require('url');
const { defaultService: reviewPageService } = require('../../services/review-page-service');

class ReviewAPI {
  constructor(options = {}) {
    // 允许外部注入 service（测试用）
    this.reviewPageService = options.reviewPageService || reviewPageService;
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
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Content-Type', 'application/json');

    if (method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    try {
      // 路由匹配
      // GET /review/tasks
      if (pathname === '/review/tasks' && method === 'GET') {
        await this._handleListTasks(req, res, query);
        return;
      }

      // GET /review/tasks/:suggestion_id
      const taskMatch = pathname.match(/^\/review\/tasks\/([^/]+)$/);
      if (taskMatch && method === 'GET') {
        const suggestionId = taskMatch[1];
        await this._handleGetTaskDetail(req, res, suggestionId);
        return;
      }

      // POST /review/submit
      if (pathname === '/review/submit' && method === 'POST') {
        await this._handleSubmitReview(req, res);
        return;
      }

      // GET /review/records
      if (pathname === '/review/records' && method === 'GET') {
        await this._handleListRecords(req, res, query);
        return;
      }

      // GET /review/stats
      if (pathname === '/review/stats' && method === 'GET') {
        await this._handleGetStats(req, res, query);
        return;
      }

      // 404
      res.writeHead(404);
      res.end(JSON.stringify({ code: 1, error: 'review_endpoint_not_found' }));

    } catch (err) {
      console.error('[ReviewAPI] Error:', err);
      res.writeHead(500);
      res.end(JSON.stringify({ code: 1, error: 'internal_error', message: err.message }));
    }
  }

  /**
   * GET /review/tasks
   * 查询待审核任务列表
   */
  async _handleListTasks(req, res, query) {
    // 解析筛选条件
    const filters = {
      status: query.status,
      project: query.project,
      agent_id: query.agent_id,
      scenario: query.scenario,
      alert_level: query.alert_level,
      start_time: query.start_time,
      end_time: query.end_time
    };

    // 解析分页参数
    const pagination = {
      page: query.page,
      page_size: query.page_size
    };

    const result = await this.reviewPageService.getReviewTasks(filters, pagination);

    res.writeHead(200);
    res.end(JSON.stringify(result));
  }

  /**
   * GET /review/tasks/:suggestion_id
   * 查询审核任务详情
   */
  async _handleGetTaskDetail(req, res, suggestionId) {
    try {
      const result = await this.reviewPageService.getReviewTaskDetail(suggestionId);

      if (result.code === 1) {
        // 处理错误情况
        if (result.error === 'suggestion_not_found') {
          res.writeHead(404);
        } else {
          res.writeHead(400);
        }
        res.end(JSON.stringify(result));
        return;
      }

      res.writeHead(200);
      res.end(JSON.stringify(result));
    } catch (err) {
      console.error('[ReviewAPI] Get task detail error:', err);
      res.writeHead(500);
      res.end(JSON.stringify({ code: 1, error: 'internal_error', message: err.message }));
    }
  }

  /**
   * POST /review/submit
   * 提交审核结果
   */
  async _handleSubmitReview(req, res) {
    try {
      const body = await this._parseBody(req);

      const result = await this.reviewPageService.submitReviewResult(body);

      if (result.code === 1) {
        // 根据错误类型返回不同的 HTTP 状态码
        if (result.error === 'suggestion_not_found') {
          res.writeHead(404);
        } else if (result.error === 'suggestion_already_reviewed' || 
                   result.error === 'invalid_review_action' ||
                   result.error === 'final_reply_required' ||
                   result.error === 'suggestion_id_required' ||
                   result.error === 'review_action_required' ||
                   result.error === 'reviewer_id_required') {
          res.writeHead(400);
        } else {
          res.writeHead(500);
        }
        res.end(JSON.stringify(result));
        return;
      }

      res.writeHead(200);
      res.end(JSON.stringify(result));
    } catch (err) {
      console.error('[ReviewAPI] Submit review error:', err);
      res.writeHead(500);
      res.end(JSON.stringify({ code: 1, error: 'internal_error', message: err.message }));
    }
  }

  /**
   * GET /review/records
   * 查询审核记录列表
   */
  async _handleListRecords(req, res, query) {
    // 解析筛选条件
    const filters = {
      review_action: query.review_action,
      reviewer_id: query.reviewer_id,
      project: query.project,
      scenario: query.scenario,
      start_time: query.start_time,
      end_time: query.end_time
    };

    // 解析分页参数
    const pagination = {
      page: query.page,
      page_size: query.page_size
    };

    const result = await this.reviewPageService.getReviewRecords(filters, pagination);

    res.writeHead(200);
    res.end(JSON.stringify(result));
  }

  /**
   * GET /review/stats
   * 查询审核统计
   */
  async _handleGetStats(req, res, query) {
    // 解析筛选条件
    const filters = {
      project: query.project,
      reviewer_id: query.reviewer_id,
      start_time: query.start_time,
      end_time: query.end_time
    };

    const result = await this.reviewPageService.getReviewStats(filters);

    res.writeHead(200);
    res.end(JSON.stringify(result));
  }

  /**
   * 解析请求体
   */
  _parseBody(req) {
    return new Promise((resolve, reject) => {
      let data = '';
      req.on('data', chunk => data += chunk);
      req.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('Invalid JSON'));
        }
      });
      req.on('error', reject);
    });
  }

  /**
   * 关闭资源
   */
  async close() {
    // 无资源需要关闭
  }
}

module.exports = { ReviewAPI };
