/**
 * Live Monitor HTTP API
 * 提供实时监控接口，供外部系统调用
 */

const http = require('http');
const url = require('url');
const { evaluate } = require('../../services/evaluation-service');
const { AlertThrottler } = require('../../core/alert-throttler');
const { SupervisorAPI } = require('../../core/api/supervisor-api');

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
    
    // Supervisor API
    this.supervisorAPI = new SupervisorAPI({
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
    });

    return this;
  }

  /**
   * 处理评估请求
   */
  async handleEvaluate(req, res) {
    try {
      const body = await this.parseBody(req);
      
      // 强制使用 live_monitor 模式
      const params = {
        ...body,
        mode: 'live_monitor'
      };

      const result = await evaluate(params);

      // 如果有告警，触发处理器（带限流）
      let alertStatus = null;
      if (result.alerts && result.alerts.length > 0) {
        const context = {
          sessionId: params.metadata?.sessionId || params.sessionId,
          employeeId: params.metadata?.employeeId
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
