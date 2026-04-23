/**
 * Live Monitor HTTP API
 * 提供实时监控接口，供外部系统调用
 * 
 * 协议版本: v1.0（标准协议）
 * - 入口层负责将外部请求转换为标准协议结构
 * - conversation 使用标准格式 [{role: "user"|"/agent", content: string}]
 * - metadata 包含 session_id, agent_id, timestamp, entry_type
 * - rules 必须传入（无规则时为 {}）
 */

const http = require('http');
const url = require('url');
const { evaluate } = require('../../services/evaluation-service');
const { LiveMonitorService } = require('../../services/live-monitor-service');
const { AlertThrottler } = require('../../core/alert-throttler');
const { SupervisorAPI } = require('../../core/api/supervisor-api');
const { TrainingAPI } = require('../../core/api/training-api');
const { QualityAPI } = require('../../core/api/quality-api');
const { KnowledgeAPI } = require('../../core/api/knowledge-api');
const { ReviewAPI } = require('../../core/api/review-api');
const handleTaggingAPI = require('../../api/tagging-api');
const { StatsAPI } = require('../../core/api/stats-api');
const { RepositoryFactory } = require('../../repositories');

class LiveMonitorAPI {
  constructor(options = {}) {
    this.port = options.port || 3001;
    this.server = null;
    this.alertHandlers = [];
    this.alertThrottler = new AlertThrottler({
      sessionDedupWindow: options.sessionDedupWindow || 5 * 60 * 1000,
      employeeRateWindow: options.employeeRateWindow || 60 * 60 * 1000,
      employeeCriticalLimit: options.employeeCriticalLimit || 3
    });
    
    // Live Monitor Service (用于写入 live_sessions, live_messages, live_evaluations)
    // 创建 MySQL 模式的 Repository Factory
    const liveRepoFactory = new RepositoryFactory({
      type: options.repositoryType || 'mysql',
      mysql: options.mysql
    });
    
    this.liveMonitorService = new LiveMonitorService({
      repositories: liveRepoFactory.getAll()
    });
    
    // Supervisor API
    this.supervisorAPI = new SupervisorAPI({
      repositoryType: options.repositoryType || 'file',
      basePath: options.basePath || './runtime/persistence',
      mysql: options.mysql
    });
    
    // Training API
    this.trainingAPI = new TrainingAPI();
    
    // Quality API
    this.qualityAPI = new QualityAPI({
      repositoryType: options.repositoryType || 'file',
      basePath: options.basePath || './runtime/persistence',
      mysql: options.mysql
    });
    
    // Knowledge API
    this.knowledgeAPI = new KnowledgeAPI({
      repositoryType: options.repositoryType || 'file',
      basePath: options.basePath || './runtime/persistence',
      mysql: options.mysql
    });
    
    // Review API
    this.reviewAPI = new ReviewAPI();
    
    // Tagging API（最小闭环）- 直接使用导出函数
    this.taggingAPI = handleTaggingAPI;
    
    // Stats API
    this.statsAPI = new StatsAPI({
      repositoryType: options.repositoryType || 'file',
      basePath: options.basePath || './runtime/persistence',
      mysql: options.mysql
    });
    
    // 定期清理过期数据
    this.cleanupInterval = setInterval(() => {
      this.alertThrottler.cleanup();
    }, 5 * 60 * 1000); // 每5分钟清理一次
  }

  /**
   * 注册告警处理器
   */
  onAlert(handler) {
    this.alertHandlers.push(handler);
  }

  /**
   * 启动服务
   */
  start() {
    this.server = http.createServer(async (req, res) => {
      // 设置 CORS
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.setHeader('Content-Type', 'application/json');

      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }

      const parsedUrl = url.parse(req.url, true);

      // 健康检查
      if (parsedUrl.pathname === '/health') {
        res.writeHead(200);
        res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
        return;
      }

      // Web 静态文件服务
      if (parsedUrl.pathname.startsWith('/web/')) {
        await this.serveStaticFile(req, res, parsedUrl.pathname);
        return;
      }

      // 评估接口
      if (parsedUrl.pathname === '/evaluate' && req.method === 'POST') {
        await this.handleEvaluate(req, res);
        return;
      }

      // 项目列表
      if (parsedUrl.pathname === '/projects' && req.method === 'GET') {
        const { getProjects } = require('../../core/scenario-loader');
        res.writeHead(200);
        res.end(JSON.stringify({ projects: getProjects() }));
        return;
      }

      // Supervisor API 路由
      if (parsedUrl.pathname.startsWith('/supervisor/')) {
        await this.supervisorAPI.handleRequest(req, res);
        return;
      }
      
      // Training API 路由
      if (parsedUrl.pathname.startsWith('/training/')) {
        await this.trainingAPI.handleRequest(req, res);
        return;
      }
      
      // Quality API 路由
      if (parsedUrl.pathname.startsWith('/quality/')) {
        await this.qualityAPI.handleRequest(req, res);
        return;
      }
      
      // Knowledge API 路由
      if (parsedUrl.pathname.startsWith('/knowledge/')) {
        await this.knowledgeAPI.handleRequest(req, res);
        return;
      }
      
      // Review API 路由
      if (parsedUrl.pathname.startsWith('/review/')) {
        // 打标路由（优先匹配）- 直接调用函数
        if (
          parsedUrl.pathname === '/review/tag' ||
          parsedUrl.pathname === '/review/tagged-records' ||
          parsedUrl.pathname.startsWith('/review/tag/')
        ) {
          await this.taggingAPI(req, res);
          return;
        }
        // 其他review路由
        await this.reviewAPI.handleRequest(req, res);
        return;
      }
      
      // Stats API 路由
      if (parsedUrl.pathname.startsWith('/stats/')) {
        await this.statsAPI.handleRequest(req, res);
        return;
      }

      // 404
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Not Found' }));
    });

    this.server.listen(this.port, () => {
      console.log(`[LiveMonitor] API 服务已启动，端口: ${this.port}`);
      console.log(`[LiveMonitor] 健康检查: http://localhost:${this.port}/health`);
      console.log(`[LiveMonitor] 评估接口: POST http://localhost:${this.port}/evaluate`);
      console.log(`[LiveMonitor] Supervisor API:`);
      console.log(`[LiveMonitor]   - GET  /supervisor/reviews/pending`);
      console.log(`[LiveMonitor]   - GET  /supervisor/reviews/:reviewId`);
      console.log(`[LiveMonitor]   - POST /supervisor/reviews/:reviewId/submit`);
      console.log(`[LiveMonitor]   - GET  /supervisor/reviews/stats`);
      console.log(`[LiveMonitor]   - GET  /supervisor/reviews/recent`);
      console.log(`[LiveMonitor] Training API:`);
      console.log(`[LiveMonitor]   - GET  /training/sessions`);
      console.log(`[LiveMonitor]   - GET  /training/sessions/:session_id`);
      console.log(`[LiveMonitor]   - GET  /training/sessions/:session_id/rounds`);
      console.log(`[LiveMonitor]   - GET  /training/stats`);
      console.log(`[LiveMonitor] Quality API:`);
      console.log(`[LiveMonitor]   - GET  /quality/sessions`);
      console.log(`[LiveMonitor]   - GET  /quality/sessions/:session_id`);
      console.log(`[LiveMonitor]   - GET  /quality/evaluations/:evaluation_id`);
      console.log(`[LiveMonitor]   - GET  /quality/alerts`);
      console.log(`[LiveMonitor]   - GET  /quality/stats`);
      console.log(`[LiveMonitor] Knowledge API:`);
      console.log(`[LiveMonitor]   - GET  /knowledge/list`);
      console.log(`[LiveMonitor]   - GET  /knowledge/:knowledge_id`);
      console.log(`[LiveMonitor]   - POST /knowledge/create`);
      console.log(`[LiveMonitor]   - POST /knowledge/update`);
      console.log(`[LiveMonitor]   - POST /knowledge/status`);
      console.log(`[LiveMonitor]   - GET  /knowledge/:knowledge_id/versions`);
      console.log(`[LiveMonitor] Review API:`);
      console.log(`[LiveMonitor]   - GET  /review/tasks`);
      console.log(`[LiveMonitor]   - GET  /review/tasks/:suggestion_id`);
      console.log(`[LiveMonitor]   - POST /review/submit`);
      console.log(`[LiveMonitor]   - GET  /review/records`);
      console.log(`[LiveMonitor]   - GET  /review/stats`);
      console.log(`[LiveMonitor] Tagging API (最小闭环):`);
      console.log(`[LiveMonitor]   - GET  /review/tag/:evaluation_id`);
      console.log(`[LiveMonitor]   - POST /review/tag`);
      console.log(`[LiveMonitor]   - GET  /review/tagged-records`);
      console.log(`[LiveMonitor] Stats API:`);
      console.log(`[LiveMonitor]   - GET  /stats/overview`);
      console.log(`[LiveMonitor]   - GET  /stats/training`);
      console.log(`[LiveMonitor]   - GET  /stats/quality`);
      console.log(`[LiveMonitor]   - GET  /stats/alerts`);
      console.log(`[LiveMonitor]   - GET  /stats/reviews`);
      console.log(`[LiveMonitor]   - GET  /stats/knowledge`);
      console.log(`[LiveMonitor]   - GET  /stats/trend`);
      console.log(`[LiveMonitor]   - GET  /stats/agents`);
    });

    return this;
  }

  /**
   * 处理评估请求
   * 
   * 将外部请求转换为标准协议结构后调用 services 层
   */
  async handleEvaluate(req, res) {
    try {
      const body = await this.parseBody(req);
      
      // 构建标准协议输入结构
      const protocolInput = this.buildProtocolInput(body);
      
      const result = await evaluate(protocolInput);

      // 如果是 live_monitor 模式，调用 live-monitor-service 写入数据库
      if (protocolInput.metadata.entry_type === 'live_monitor' && this.liveMonitorService) {
        try {
          // 构造 live-monitor-service 需要的输入格式
          const liveInput = {
            projectId: protocolInput.project,
            channel: 'telegram',
            employeeId: protocolInput.metadata.agent_id,
            customerId: protocolInput.metadata.customer_id || 'unknown',
            sessionId: protocolInput.metadata.session_id,
            content: protocolInput.current_reply,
            direction: body.direction || 'outbound', // 从请求体获取direction，默认outbound
            messageType: 'text',
            timestamp: protocolInput.metadata.timestamp,
            conversation: protocolInput.conversation,
            metadata: protocolInput.metadata
          };
          
          // 调用 live-monitor-service 处理
          const liveResult = await this.liveMonitorService.process(liveInput);
          console.log('[LiveMonitor] Live data persisted:', liveResult);
          
          // 将 live 结果添加到返回中
          result.liveSessionId = liveResult.sessionId;
          result.liveMessageId = liveResult.messageId;
          result.liveEvaluationId = liveResult.analysisId;
        } catch (liveError) {
          console.error('[LiveMonitor] Failed to persist live data:', liveError.message);
          console.error('[LiveMonitor] Error stack:', liveError.stack);
          // 不阻断主流程，继续返回评估结果
        }
      }

      // 如果有告警，触发处理器（带限流）
      let alertStatus = null;
      if (result.alerts && result.alerts.length > 0) {
        const context = {
          sessionId: protocolInput.metadata.session_id,
          employeeId: protocolInput.metadata.agent_id
        };
        alertStatus = await this.triggerAlerts(result, context);
        
        // 将限流信息添加到结果中（用于调试）
        result.alertStatus = {
          total: result.alerts.length,
          sent: alertStatus.sentAlerts.length,
          throttled: alertStatus.throttledAlerts.length
        };
      }

      res.writeHead(200);
      res.end(JSON.stringify(result));
    } catch (error) {
      console.error('[LiveMonitor] 评估错误:', error);
      res.writeHead(500);
      res.end(JSON.stringify({
        status: 'error',
        error: error.message
      }));
    }
  }

  /**
   * 将外部请求转换为标准协议结构
   * 
   * @param {Object} body - 原始请求体
   * @returns {Object} 标准协议输入对象
   */
  buildProtocolInput(body) {
    // 提取字段（支持向后兼容）
    const projectId = body.projectId || body.project;
    const sessionId = body.metadata?.session_id || body.sessionId || `session_${Date.now()}`;
    const agentId = body.metadata?.agent_id || body.employeeId || body.agentId || 'unknown';
    const conversation = body.conversation || [];
    const currentReply = body.current_reply || body.currentReply || '';
    
    // 标准化 conversation 格式（role 统一为 user/agent）
    const normalizedConversation = conversation.map((turn, index) => ({
      role: turn.role === 'customer' ? 'user' : (turn.role || 'unknown'),
      content: turn.content || turn.text || '',
      _meta: turn.turnIndex !== undefined || turn.ts || turn.timestamp ? {
        turnIndex: turn.turnIndex || index,
        ts: turn.ts || turn.timestamp
      } : undefined
    })).filter(turn => turn.role && turn.content);
    
    return {
      // 1. project
      project: projectId,
      
      // 2. conversation（多轮结构）
      conversation: normalizedConversation,
      
      // 3. current_reply
      current_reply: currentReply,
      
      // 4. metadata（必填字段）
      metadata: {
        source: body.metadata?.source || 'http_api',
        session_id: sessionId,
        agent_id: agentId,
        timestamp: body.metadata?.timestamp || new Date().toISOString(),
        entry_type: 'live_monitor'
      },
      
      // 5. rules（无规则时传空对象）
      rules: body.rules || {},
      
      // 6. direction（用于role映射）
      direction: body.direction || null
    };
  }

  /**
   * 解析请求体
   */
  parseBody(req) {
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
   * 触发告警（带限流）
   */
  async triggerAlerts(result, context = {}) {
    const { sessionId, employeeId } = context;
    const throttledAlerts = [];
    const sentAlerts = [];
    
    for (const alert of result.alerts) {
      const check = this.alertThrottler.shouldSendAlert(alert, { sessionId, employeeId });
      
      if (check.shouldSend) {
        sentAlerts.push(alert);
        // 触发实际处理器（支持 async）
        for (const handler of this.alertHandlers) {
          try {
            await handler(result, alert);
          } catch (err) {
            console.error('[LiveMonitor] 告警处理器错误:', err);
          }
        }
      } else {
        throttledAlerts.push({
          ...alert,
          throttleReason: check.reason
        });
        console.log(`[ALERT] 告警被限流: ${alert.type}, 原因: ${check.reason}`);
      }
    }
    
    return { sentAlerts, throttledAlerts };
  }

  /**
   * 提供静态文件服务
   */
  async serveStaticFile(req, res, pathname) {
    const fs = require('fs');
    const path = require('path');
    
    try {
      // 将 /web/xxx 映射到 web/xxx
      const filePath = path.join(__dirname, '../..', pathname);
      
      // 安全检查：防止路径穿越
      const webDir = path.join(__dirname, '../..', 'web');
      if (!filePath.startsWith(webDir)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }
      
      // 检查文件是否存在
      if (!fs.existsSync(filePath)) {
        res.writeHead(404);
        res.end('Not Found');
        return;
      }
      
      // 设置 Content-Type
      const ext = path.extname(filePath);
      const contentTypes = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'application/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.gif': 'image/gif'
      };
      
      const contentType = contentTypes[ext] || 'application/octet-stream';
      
      // 读取并返回文件
      const content = fs.readFileSync(filePath);
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
      
    } catch (error) {
      console.error('[LiveMonitor] Serve static file error:', error);
      res.writeHead(500);
      res.end('Internal Server Error');
    }
  }

  /**
   * 停止服务
   */
  async stop() {
    if (this.server) {
      this.server.close();
    }
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    if (this.supervisorAPI) {
      await this.supervisorAPI.close();
    }
    if (this.qualityAPI) {
      await this.qualityAPI.close();
    }
    if (this.reviewAPI) {
      await this.reviewAPI.close();
    }
    if (this.statsAPI) {
      await this.statsAPI.close();
    }
    console.log('[LiveMonitor] API 服务已停止');
  }
}

// 直接运行时的启动逻辑
if (require.main === module) {
  const api = new LiveMonitorAPI();
  
  // 注册默认告警处理器：控制台输出
  api.onAlert((result) => {
    console.log('[ALERT] 检测到告警:', {
      projectId: result.projectId,
      scenarioId: result.scenarioId,
      score: result.score,
      alerts: result.alerts
    });
  });

  api.start();

  // 优雅退出
  process.on('SIGINT', () => {
    api.stop();
    process.exit(0);
  });
}

module.exports = { LiveMonitorAPI };
