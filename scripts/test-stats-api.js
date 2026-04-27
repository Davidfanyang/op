#!/usr/bin/env node
/**
 * 基础统计接口测试脚本
 * 
 * 测试所有 /stats/* 接口是否正常工作
 */

require('dotenv').config();

const http = require('http');

const BASE_URL = 'http://localhost:3001';

// 测试用例
const testCases = [
  {
    name: '总览统计',
    path: '/stats/overview',
    params: {}
  },
  {
    name: '总览统计（带时间筛选）',
    path: '/stats/overview',
    params: {
      start_time: '2026-04-01',
      end_time: '2026-04-30'
    }
  },
  {
    name: '训练统计',
    path: '/stats/training',
    params: {}
  },
  {
    name: '训练统计（带筛选）',
    path: '/stats/training',
    params: {
      project: 'default',
      start_time: '2026-04-01',
      end_time: '2026-04-30'
    }
  },
  {
    name: '质检统计',
    path: '/stats/quality',
    params: {}
  },
  {
    name: '质检统计（带筛选）',
    path: '/stats/quality',
    params: {
      project: 'default',
      problem_type: 'unknown',
      start_time: '2026-04-01',
      end_time: '2026-04-30'
    }
  },
  {
    name: '告警统计',
    path: '/stats/alerts',
    params: {}
  },
  {
    name: '告警统计（带筛选）',
    path: '/stats/alerts',
    params: {
      project: 'default',
      alert_level: 'high',
      start_time: '2026-04-01',
      end_time: '2026-04-30'
    }
  },
  {
    name: '审核统计',
    path: '/stats/reviews',
    params: {}
  },
  {
    name: '审核统计（带筛选）',
    path: '/stats/reviews',
    params: {
      project: 'default',
      start_time: '2026-04-01',
      end_time: '2026-04-30'
    }
  },
  {
    name: '知识库统计',
    path: '/stats/knowledge',
    params: {}
  },
  {
    name: '知识库统计（带筛选）',
    path: '/stats/knowledge',
    params: {
      project: 'default',
      status: 'active',
      start_time: '2026-04-01',
      end_time: '2026-04-30'
    }
  },
  {
    name: '时间趋势统计（all）',
    path: '/stats/trend',
    params: {
      type: 'all',
      granularity: 'day',
      start_time: '2026-04-01',
      end_time: '2026-04-30'
    }
  },
  {
    name: '时间趋势统计（quality）',
    path: '/stats/trend',
    params: {
      type: 'quality',
      granularity: 'day',
      start_time: '2026-04-01',
      end_time: '2026-04-30'
    }
  },
  {
    name: '客服维度统计',
    path: '/stats/agents',
    params: {}
  },
  {
    name: '客服维度统计（带筛选）',
    path: '/stats/agents',
    params: {
      project: 'default',
      start_time: '2026-04-01',
      end_time: '2026-04-30'
    }
  }
];

// 错误测试用例
const errorTestCases = [
  {
    name: '趋势统计 - 非法 granularity',
    path: '/stats/trend',
    params: {
      granularity: 'month'
    },
    expectedError: 'invalid_granularity'
  },
  {
    name: '趋势统计 - 非法 type',
    path: '/stats/trend',
    params: {
      type: 'invalid_type'
    },
    expectedError: 'invalid_stats_type'
  }
];

/**
 * 发送 HTTP GET 请求
 */
function sendRequest(path, params) {
  return new Promise((resolve, reject) => {
    const queryString = Object.keys(params)
      .map(key => `${key}=${encodeURIComponent(params[key])}`)
      .join('&');
    
    const fullPath = queryString ? `${path}?${queryString}` : path;
    const url = new URL(fullPath, BASE_URL);

    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({
            statusCode: res.statusCode,
            data: parsed
          });
        } catch (e) {
          reject(new Error(`Failed to parse response: ${data}`));
        }
      });
    });

    req.on('error', (e) => {
      reject(e);
    });

    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.end();
  });
}

/**
 * 运行测试
 */
async function runTests() {
  console.log('='.repeat(80));
  console.log('基础统计接口测试');
  console.log('='.repeat(80));
  console.log(`Base URL: ${BASE_URL}\n`);

  let passed = 0;
  let failed = 0;

  // 正常测试用例
  console.log('【正常测试用例】\n');
  for (const testCase of testCases) {
    try {
      console.log(`测试: ${testCase.name}`);
      console.log(`  路径: ${testCase.path}`);
      if (Object.keys(testCase.params).length > 0) {
        console.log(`  参数: ${JSON.stringify(testCase.params)}`);
      }

      const response = await sendRequest(testCase.path, testCase.params);

      if (response.statusCode === 200 && response.data.code === 0) {
        console.log(`  ✅ 通过 (HTTP ${response.statusCode})`);
        console.log(`  返回数据: ${JSON.stringify(response.data.data, null, 2).substring(0, 200)}...`);
        passed++;
      } else {
        console.log(`  ❌ 失败 (HTTP ${response.statusCode}, code: ${response.data.code})`);
        console.log(`  错误: ${JSON.stringify(response.data)}`);
        failed++;
      }
    } catch (error) {
      console.log(`  ❌ 失败 (异常: ${error.message})`);
      failed++;
    }
    console.log();
  }

  // 错误测试用例
  console.log('\n【错误测试用例】\n');
  for (const testCase of errorTestCases) {
    try {
      console.log(`测试: ${testCase.name}`);
      console.log(`  路径: ${testCase.path}`);
      console.log(`  参数: ${JSON.stringify(testCase.params)}`);

      const response = await sendRequest(testCase.path, testCase.params);

      if (response.data.code === 1 && response.data.error === testCase.expectedError) {
        console.log(`  ✅ 通过 (返回预期错误: ${testCase.expectedError})`);
        passed++;
      } else {
        console.log(`  ❌ 失败 (期望错误: ${testCase.expectedError}, 实际: ${JSON.stringify(response.data)})`);
        failed++;
      }
    } catch (error) {
      console.log(`  ❌ 失败 (异常: ${error.message})`);
      failed++;
    }
    console.log();
  }

  // 测试总结
  console.log('='.repeat(80));
  console.log('测试总结');
  console.log('='.repeat(80));
  console.log(`总用例数: ${passed + failed}`);
  console.log(`通过: ${passed}`);
  console.log(`失败: ${failed}`);
  console.log(`通过率: ${((passed / (passed + failed)) * 100).toFixed(2)}%`);

  if (failed === 0) {
    console.log('\n✅ 所有测试通过！');
    process.exit(0);
  } else {
    console.log(`\n❌ ${failed} 个测试失败`);
    process.exit(1);
  }
}

// 运行测试
runTests().catch(error => {
  console.error('测试执行异常:', error);
  process.exit(1);
});
