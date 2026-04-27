/**
 * Knowledge API Controller
 * 
 * 知识库管理接口控制器，提供：
 * - GET /knowledge/list - 查询知识库列表
 * - GET /knowledge/:knowledge_id - 查询知识详情
 * - POST /knowledge/create - 新增人工知识
 * - POST /knowledge/update - 更新知识并生成新版本
 * - POST /knowledge/status - 停用知识
 * - GET /knowledge/:knowledge_id/versions - 查询版本历史
 * 
 * 严格限制：
 * - 只做知识库管理，不涉及训练逻辑
 * - 不修改 core 分析逻辑
 * - 返回稳定 JSON 结构
 */

const url = require('url');
const { defaultService: knowledgeManageService } = require('../../services/knowledge-manage-service');

class KnowledgeAPI {
  constructor(options = {}) {
    // 允许外部注入 service（测试用）
    this.knowledgeManageService = options.knowledgeManageService || knowledgeManageService;
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
      
      // GET /knowledge/list
      if (pathname === '/knowledge/list' && method === 'GET') {
        await this._handleListKnowledge(req, res, query);
        return;
      }

      // GET /knowledge/:knowledge_id/versions（必须在 /knowledge/:knowledge_id 之前匹配）
      const versionsMatch = pathname.match(/^\/knowledge\/([^/]+)\/versions$/);
      if (versionsMatch && method === 'GET') {
        const knowledgeId = versionsMatch[1];
        await this._handleGetVersions(req, res, knowledgeId);
        return;
      }

      // GET /knowledge/:knowledge_id
      const detailMatch = pathname.match(/^\/knowledge\/([^/]+)$/);
      if (detailMatch && method === 'GET') {
        const knowledgeId = detailMatch[1];
        await this._handleGetDetail(req, res, knowledgeId);
        return;
      }

      // POST /knowledge/create
      if (pathname === '/knowledge/create' && method === 'POST') {
        await this._handleCreateKnowledge(req, res);
        return;
      }

      // POST /knowledge/update
      if (pathname === '/knowledge/update' && method === 'POST') {
        await this._handleUpdateKnowledge(req, res);
        return;
      }

      // POST /knowledge/status
      if (pathname === '/knowledge/status' && method === 'POST') {
        await this._handleChangeStatus(req, res);
        return;
      }

      // 404
      res.writeHead(404);
      res.end(JSON.stringify({ code: 1, error: 'knowledge_endpoint_not_found' }));

    } catch (err) {
      console.error('[KnowledgeAPI] Error:', err);
      res.writeHead(500);
      res.end(JSON.stringify({ code: 1, error: 'internal_error', message: err.message }));
    }
  }

  /**
   * GET /knowledge/list
   * 查询知识库列表
   */
  async _handleListKnowledge(req, res, query) {
    // 解析筛选条件
    const filters = {
      project: query.project,
      scenario: query.scenario,
      status: query.status,
      keyword: query.keyword
    };

    // 解析分页参数
    const pagination = {
      page: query.page,
      pageSize: query.page_size
    };

    const result = await this.knowledgeManageService.listKnowledge(filters, pagination);

    if (!result.success) {
      res.writeHead(400);
      res.end(JSON.stringify({
        code: 1,
        error: result.error,
        message: result.message
      }));
      return;
    }

    res.writeHead(200);
    res.end(JSON.stringify({
      code: 0,
      data: result.data
    }));
  }

  /**
   * GET /knowledge/:knowledge_id
   * 查询知识详情
   */
  async _handleGetDetail(req, res, knowledgeId) {
    const result = await this.knowledgeManageService.getKnowledgeDetail(knowledgeId);

    if (!result.success) {
      const statusCode = result.error === 'KNOWLEDGE_NOT_FOUND' ? 404 : 400;
      res.writeHead(statusCode);
      res.end(JSON.stringify({
        code: 1,
        error: result.error,
        message: result.message
      }));
      return;
    }

    res.writeHead(200);
    res.end(JSON.stringify({
      code: 0,
      data: result.data
    }));
  }

  /**
   * POST /knowledge/create
   * 新增人工知识
   */
  async _handleCreateKnowledge(req, res) {
    try {
      const body = await this._parseBody(req);

      // 字段兼容处理：支持 camelCase 和 snake_case
      const normalizedBody = {
        project: body.project,
        scenario: body.scenario,
        questionAliases: body.questionAliases || body.question_aliases,
        standardAnswer: body.standardAnswer || body.standard_answer,
        rules: body.rules,
        operatorId: body.operatorId || body.operator_id
      };

      const result = await this.knowledgeManageService.createKnowledge(normalizedBody);

      if (!result.success) {
        const statusCode = result.error === 'INVALID_PARAMS' ? 400 : 500;
        res.writeHead(statusCode);
        res.end(JSON.stringify({
          code: 1,
          error: result.error,
          message: result.message
        }));
        return;
      }

      res.writeHead(201);
      res.end(JSON.stringify({
        code: 0,
        data: result.data
      }));
    } catch (error) {
      console.error('[KnowledgeAPI] createKnowledge 解析失败:', error);
      res.writeHead(400);
      res.end(JSON.stringify({
        code: 1,
        error: 'INVALID_JSON',
        message: '请求体必须是有效的 JSON'
      }));
    }
  }

  /**
   * POST /knowledge/update
   * 更新知识并生成新版本
   */
  async _handleUpdateKnowledge(req, res) {
    try {
      const body = await this._parseBody(req);

      // 字段兼容处理：支持 camelCase 和 snake_case
      const normalizedBody = {
        knowledgeId: body.knowledgeId || body.knowledge_id,
        questionAliases: body.questionAliases || body.question_aliases,
        standardAnswer: body.standardAnswer || body.standard_answer,
        rules: body.rules,
        operatorId: body.operatorId || body.operator_id,
        reason: body.reason
      };

      const result = await this.knowledgeManageService.updateKnowledge(normalizedBody);

      if (!result.success) {
        const statusCode = result.error === 'INVALID_PARAMS' || result.error === 'KNOWLEDGE_NOT_FOUND' ? 400 : 500;
        res.writeHead(statusCode);
        res.end(JSON.stringify({
          code: 1,
          error: result.error,
          message: result.message
        }));
        return;
      }

      res.writeHead(200);
      res.end(JSON.stringify({
        code: 0,
        data: result.data
      }));
    } catch (error) {
      console.error('[KnowledgeAPI] updateKnowledge 解析失败:', error);
      res.writeHead(400);
      res.end(JSON.stringify({
        code: 1,
        error: 'INVALID_JSON',
        message: '请求体必须是有效的 JSON'
      }));
    }
  }

  /**
   * POST /knowledge/status
   * 停用知识
   */
  async _handleChangeStatus(req, res) {
    try {
      const body = await this._parseBody(req);

      // 字段兼容处理：支持 camelCase 和 snake_case
      const normalizedBody = {
        knowledgeId: body.knowledgeId || body.knowledge_id,
        status: body.status,
        operatorId: body.operatorId || body.operator_id,
        reason: body.reason
      };

      const result = await this.knowledgeManageService.changeKnowledgeStatus(normalizedBody);

      if (!result.success) {
        const statusCode = result.error === 'INVALID_PARAMS' || result.error === 'KNOWLEDGE_NOT_FOUND' ? 400 : 500;
        res.writeHead(statusCode);
        res.end(JSON.stringify({
          code: 1,
          error: result.error,
          message: result.message
        }));
        return;
      }

      res.writeHead(200);
      res.end(JSON.stringify({
        code: 0,
        data: result.data
      }));
    } catch (error) {
      console.error('[KnowledgeAPI] changeStatus 解析失败:', error);
      res.writeHead(400);
      res.end(JSON.stringify({
        code: 1,
        error: 'INVALID_JSON',
        message: '请求体必须是有效的 JSON'
      }));
    }
  }

  /**
   * GET /knowledge/:knowledge_id/versions
   * 查询版本历史
   */
  async _handleGetVersions(req, res, knowledgeId) {
    const result = await this.knowledgeManageService.getKnowledgeVersions(knowledgeId);

    if (!result.success) {
      const statusCode = result.error === 'KNOWLEDGE_NOT_FOUND' ? 404 : 400;
      res.writeHead(statusCode);
      res.end(JSON.stringify({
        code: 1,
        error: result.error,
        message: result.message
      }));
      return;
    }

    res.writeHead(200);
    res.end(JSON.stringify({
      code: 0,
      data: result.data
    }));
  }

  /**
   * 解析请求体
   */
  _parseBody(req) {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });
      req.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
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

module.exports = { KnowledgeAPI };
