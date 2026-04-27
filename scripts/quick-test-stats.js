#!/usr/bin/env node
/**
 * 快速测试基础统计接口
 * 直接测试关键接口
 */

require('dotenv').config();
const http = require('http');

const BASE_URL = 'http://localhost:3001';

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
      method: 'GET'
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({
            statusCode: res.statusCode,
            data: JSON.parse(data)
          });
        } catch (e) {
          reject(new Error(`Failed to parse: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Timeout'));
    });
    req.end();
  });
}

async function quickTest() {
  console.log('快速测试基础统计接口\n');
  
  const tests = [
    { name: '总览统计', path: '/stats/overview', params: {} },
    { name: '训练统计', path: '/stats/training', params: {} },
    { name: '质检统计', path: '/stats/quality', params: {} },
    { name: '告警统计', path: '/stats/alerts', params: {} },
    { name: '审核统计', path: '/stats/reviews', params: {} },
    { name: '知识库统计', path: '/stats/knowledge', params: {} },
    { name: '时间趋势', path: '/stats/trend', params: { type: 'quality' } },
    { name: '客服维度', path: '/stats/agents', params: {} }
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      const response = await sendRequest(test.path, test.params);
      if (response.statusCode === 200 && response.data.code === 0) {
        console.log(`✅ ${test.name} - 通过`);
        passed++;
      } else {
        console.log(`❌ ${test.name} - 失败: ${JSON.stringify(response.data).substring(0, 100)}`);
        failed++;
      }
    } catch (error) {
      console.log(`❌ ${test.name} - 异常: ${error.message}`);
      failed++;
    }
  }

  console.log(`\n总计: ${passed + failed}, 通过: ${passed}, 失败: ${failed}`);
  
  if (failed === 0) {
    console.log('\n✅ 所有测试通过！');
    process.exit(0);
  } else {
    console.log(`\n❌ ${failed} 个测试失败`);
    process.exit(1);
  }
}

quickTest();
