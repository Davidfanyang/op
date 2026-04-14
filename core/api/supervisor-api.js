/**
 * Supervisor API Controller
 * 
 * 主管复核接口控制器，提供：
 * - GET /supervisor/reviews/pending - 查询待复核列表
 * - GET /supervisor/reviews/:reviewId - 查询复核详情
 * - POST /supervisor/reviews/:reviewId/submit - 提交复核结果
 * - GET /supervisor/reviews/stats - 查询复核统计
 * - GET /supervisor/reviews/recent - 查询最近已处理记录
 */

const url = require('url');
const { success, error, paginated, generateRequestId, APIError } = require('./response');
const { ReviewServiceV2 } = require('../../services/review-service-v2');
const { createRepositoryFactory } = require('../../repositories');

class SupervisorAPI {
  constructor(options = {}) {
    this.reviewService = null;
    this.repositories = null;
    this.factory = null;
    this.initialized = false;
    
    // 允许外部注入 service（测试用）
    if (options.reviewService) {
      this.reviewService = options.reviewService;
      this.initialized = true;
    }
    
    // 配置
    this.config = {
      repositoryType: options.repositoryType || 'file',
      basePath: options.basePath || './runtime/persistence',
      mysql: options.mysql || null,
      ...options
    };
  }

  /**
   * 初始化（懒加载）
   */
  async _ensureInitialized() {
    if (this.initialized) return;
    
    this.factory = createRepositoryFactory({
      type: this.config.repositoryType,
      basePath: this.config.basePath,
      mysql: this.config.mysql
    });
    
    // MySQL 模式需要初始化连接
    if (this.config.repositoryType === 'mysql') {
      await this.factory.initialize();
    }
    
    this.repositories = this.factory.getAll();
    this.reviewService = new ReviewServiceV2(this.repositories);
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
      if (pathname === '/supervisor/reviews/pending' && method === 'GET') {
        await this._handleGetPending(req, res, parsedUrl.query, requestId);
        return;
      }
      
      if (pathname === '/supervisor/reviews/stats' && method === 'GET') {
        await this._handleGetStats(req, res, parsedUrl.query, requestId);
        return;
      }
      
      if (pathname === '/supervisor/reviews/recent' && method === 'GET') {
        await this._handleGetRecent(req, res, parsedUrl.query, requestId);
        return;
      }
      
      // 匹配 /supervisor/reviews/:reviewId
      const detailMatch = pathname.match(/^\/supervisor\/reviews\/([^/]+)$/);
      if (detailMatch) {
        const reviewId = detailMatch[1];
        
        if (method === 'GET') {
          await this._handleGetDetail(req, res, reviewId, requestId);
          return;
        }
      }
      
      // 匹配 /supervisor/reviews/:reviewId/submit
      const submitMatch = pathname.match(/^\/supervisor\/reviews\/([^/]+)\/submit$/);
      if (submitMatch && method === 'POST') {
        const reviewId = submitMatch[1];
        await this._handleSubmit(req, res, reviewId, requestId);
        return;
      }
      
      // 404
      res.writeHead(404);
      res.end(JSON.stringify(error('NOT_FOUND', 'endpoint not found', requestId)));
      
    } catch (err) {
      console.error('[SupervisorAPI] Error:', err);
      
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
   * GET /supervisor/reviews/pending
   */
  async _handleGetPending(req, res, query, requestId) {
    const params = {
      projectId: query.projectId,
      alertLevel: query.alertLevel,
      limit: parseInt(query.limit) || 20,
      offset: parseInt(query.offset) || 0
    };
    
    const result = await this.reviewService.getPendingReviews(params);
    
    res.writeHead(200);
    res.end(JSON.stringify(paginated(result.items, {
      limit: params.limit,
      offset: params.offset,
      total: result.pagination.total
    }, requestId)));
  }

  /**
   * GET /supervisor/reviews/:reviewId
   */
  async _handleGetDetail(req, res, reviewId, requestId) {
    const result = await this.reviewService.getReviewDetail(reviewId);
    
    res.writeHead(200);
    res.end(JSON.stringify(success(result, 'ok', requestId)));
  }

  /**
   * POST /supervisor/reviews/:reviewId/submit
   */
  async _handleSubmit(req, res, reviewId, requestId) {
    const body = await this._parseBody(req);
    
    const result = await this.reviewService.submitReview(reviewId, {
      reviewedBy: body.reviewedBy,
      reviewDecision: body.reviewDecision,
      reviewComment: body.reviewComment,
      optimizedReply: body.optimizedReply,
      optimizedReplyApproved: body.optimizedReplyApproved,
      isAdopted: body.isAdopted,
      closeReview: body.closeReview
    });
    
    res.writeHead(200);
    res.end(JSON.stringify(success(result, 'review submitted successfully', requestId)));
  }

  /**
   * GET /supervisor/reviews/stats
   */
  async _handleGetStats(req, res, query, requestId) {
    const result = await this.reviewService.getReviewStats(query.projectId, {
      start: query.startDate,
      end: query.endDate
    });
    
    res.writeHead(200);
    res.end(JSON.stringify(success(result, 'ok', requestId)));
  }

  /**
   * GET /supervisor/reviews/recent
   */
  async _handleGetRecent(req, res, query, requestId) {
    const result = await this.reviewService.getRecentReviews(
      query.projectId,
      parseInt(query.limit) || 20
    );
    
    res.writeHead(200);
    res.end(JSON.stringify(success(result, 'ok', requestId)));
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
          resolve(data ? JSON.parse(data) : {});
        } catch (e) {
          reject(new Error('Invalid JSON'));
        }
      });
      req.on('error', reject);
    });
  }

  /**
   * 获取 HTTP 状态码
   */
  _getStatusCode(code) {
    const mapping = {
      'BAD_REQUEST': 400,
      'VALIDATION_ERROR': 400,
      'PROJECT_ID_REQUIRED': 400,
      'REVIEW_NOT_FOUND': 404,
      'EVALUATION_NOT_FOUND': 404,
      'PROJECT_NOT_FOUND': 404,
      'REVIEW_ALREADY_PROCESSED': 409,
      'INVALID_REVIEW_DECISION': 422,
      'INVALID_REVIEW_STATUS': 422,
      'INTERNAL_ERROR': 500,
      'EVALUATION_SYNC_FAILED': 500
    };
    return mapping[code] || 500;
  }

  /**
   * 关闭资源
   */
  async close() {
    if (this.factory) {
      await this.factory.close();
    }
  }
}

module.exports = { SupervisorAPI };
