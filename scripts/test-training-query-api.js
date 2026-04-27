/**
 * 训练记录查询接口测试脚本
 * 
 * 用法: node scripts/test-training-query-api.js
 * 
 * 测试内容：
 * 1. 查询训练会话列表
 * 2. 按条件筛选训练会话
 * 3. 查看训练会话详情
 * 4. 查看训练轮次结果
 * 5. 查看训练统计数据
 */

const http = require('http');

const API_BASE = 'http://localhost:3001';

async function main() {
  console.log('========================================');
  console.log('训练记录查询接口测试');
  console.log('========================================\n');

  try {
    // 1. 查询训练会话列表
    console.log('1. 查询训练会话列表 (GET /training/sessions)');
    const sessions = await httpGet('/training/sessions?page=1&page_size=10');
    console.log('响应:', JSON.stringify(sessions, null, 2));
    console.log('');

    // 2. 按项目筛选
    console.log('2. 按项目筛选 (GET /training/sessions?project=default)');
    const filteredSessions = await httpGet('/training/sessions?project=default');
    console.log('响应:', JSON.stringify(filteredSessions, null, 2));
    console.log('');

    // 3. 按状态筛选
    console.log('3. 按状态筛选 (GET /training/sessions?status=finished)');
    const finishedSessions = await httpGet('/training/sessions?status=finished');
    console.log('响应:', JSON.stringify(finishedSessions, null, 2));
    console.log('');

    // 如果有会话，查询详情
    if (sessions.data && sessions.data.items && sessions.data.items.length > 0) {
      const sessionId = sessions.data.items[0].sessionId;
      
      // 4. 查询训练会话详情
      console.log(`4. 查询训练会话详情 (GET /training/sessions/${sessionId})`);
      const sessionDetail = await httpGet(`/training/sessions/${sessionId}`);
      console.log('响应:', JSON.stringify(sessionDetail, null, 2));
      console.log('');

      // 5. 查询训练轮次结果
      console.log(`5. 查询训练轮次结果 (GET /training/sessions/${sessionId}/rounds)`);
      const rounds = await httpGet(`/training/sessions/${sessionId}/rounds`);
      console.log('响应:', JSON.stringify(rounds, null, 2));
      console.log('');
    }

    // 6. 查询训练统计数据
    console.log('6. 查询训练统计数据 (GET /training/stats)');
    const stats = await httpGet('/training/stats');
    console.log('响应:', JSON.stringify(stats, null, 2));
    console.log('');

    // 7. 按时间范围筛选统计
    const now = new Date();
    const startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const endTime = now.toISOString();
    
    console.log(`7. 按时间范围筛选统计 (GET /training/stats?start_time=${startTime}&end_time=${endTime})`);
    const timeFilteredStats = await httpGet(`/training/stats?start_time=${startTime}&end_time=${endTime}`);
    console.log('响应:', JSON.stringify(timeFilteredStats, null, 2));
    console.log('');

    console.log('========================================');
    console.log('测试完成');
    console.log('========================================');

  } catch (err) {
    console.error('测试失败:', err.message);
    console.error('请确保 Live Monitor 服务已启动 (node start-live-monitor.js)');
    process.exit(1);
  }
}

/**
 * HTTP GET 请求
 */
function httpGet(path) {
  return new Promise((resolve, reject) => {
    http.get(`${API_BASE}${path}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (err) {
          reject(new Error('Invalid JSON response'));
        }
      });
    }).on('error', reject);
  });
}

// 运行
main().catch(console.error);
