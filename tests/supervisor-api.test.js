/**
 * Supervisor API 测试脚本
 * 
 * 测试所有 Supervisor API 接口
 */

const http = require('http');

const BASE_URL = 'http://localhost:3001';

/**
 * 发送 HTTP 请求
 */
function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3001,
      path,
      method,
      headers: { 'Content-Type': 'application/json' }
    };
    
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    
    req.on('error', reject);
    
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

/**
 * 测试用例
 */
async function runTests() {
  console.log('='.repeat(60));
  console.log('Supervisor API 测试');
  console.log('='.repeat(60));
  
  let passed = 0;
  let failed = 0;
  
  // 测试1: 健康检查
  console.log('\n[1] 测试健康检查 GET /health');
  try {
    const res = await request('GET', '/health');
    if (res.status === 200 && res.body.status === 'ok') {
      console.log('✓ 健康检查通过');
      passed++;
    } else {
      console.log('✗ 健康检查失败:', res);
      failed++;
    }
  } catch (err) {
    console.log('✗ 无法连接服务，请先启动: node start-live-monitor.js');
    console.log('  错误:', err.message);
    process.exit(1);
  }
  
  // 测试2: 查询待复核列表（无数据）
  console.log('\n[2] 测试待复核列表 GET /supervisor/reviews/pending');
  try {
    const res = await request('GET', '/supervisor/reviews/pending?projectId=test');
    if (res.status === 200 && res.body.success === true) {
      console.log('✓ 接口返回格式正确');
      console.log('  返回格式:', JSON.stringify(res.body, null, 2).substring(0, 200) + '...');
      passed++;
    } else {
      console.log('✗ 接口返回格式错误:', res.body);
      failed++;
    }
  } catch (err) {
    console.log('✗ 请求失败:', err.message);
    failed++;
  }
  
  // 测试3: 查询复核详情（不存在的ID）
  console.log('\n[3] 测试复核详情 GET /supervisor/reviews/:reviewId (不存在)');
  try {
    const res = await request('GET', '/supervisor/reviews/nonexistent_review_id');
    if (res.status === 404 && res.body.code === 'REVIEW_NOT_FOUND') {
      console.log('✓ 正确返回 REVIEW_NOT_FOUND');
      passed++;
    } else {
      console.log('✗ 错误码不正确:', res.body);
      failed++;
    }
  } catch (err) {
    console.log('✗ 请求失败:', err.message);
    failed++;
  }
  
  // 测试4: 查询复核统计
  console.log('\n[4] 测试复核统计 GET /supervisor/reviews/stats');
  try {
    const res = await request('GET', '/supervisor/reviews/stats?projectId=test');
    if (res.status === 200 && res.body.success === true && res.body.data.summary) {
      console.log('✓ 统计接口返回正确');
      console.log('  summary:', JSON.stringify(res.body.data.summary));
      passed++;
    } else {
      console.log('✗ 统计接口返回格式错误:', res.body);
      failed++;
    }
  } catch (err) {
    console.log('✗ 请求失败:', err.message);
    failed++;
  }
  
  // 测试5: 查询最近已处理记录
  console.log('\n[5] 测试最近已处理 GET /supervisor/reviews/recent');
  try {
    const res = await request('GET', '/supervisor/reviews/recent?projectId=test');
    if (res.status === 200 && res.body.success === true && Array.isArray(res.body.data.items)) {
      console.log('✓ 最近记录接口返回正确');
      passed++;
    } else {
      console.log('✗ 最近记录接口返回格式错误:', res.body);
      failed++;
    }
  } catch (err) {
    console.log('✗ 请求失败:', err.message);
    failed++;
  }
  
  // 测试6: 提交复核（不存在的ID）
  console.log('\n[6] 测试提交复核 POST /supervisor/reviews/:reviewId/submit (不存在)');
  try {
    const res = await request('POST', '/supervisor/reviews/nonexistent/submit', {
      reviewedBy: 'sup_001',
      reviewDecision: 'approved',
      reviewComment: '测试提交'
    });
    if (res.status === 404 && res.body.code === 'REVIEW_NOT_FOUND') {
      console.log('✓ 正确返回 REVIEW_NOT_FOUND');
      passed++;
    } else {
      console.log('✗ 错误码不正确:', res.status, res.body);
      failed++;
    }
  } catch (err) {
    console.log('✗ 请求失败:', err.message);
    failed++;
  }
  
  // 测试7: 提交复核（缺少必填字段）
  console.log('\n[7] 测试提交复核 POST /supervisor/reviews/:reviewId/submit (缺少字段)');
  try {
    const res = await request('POST', '/supervisor/reviews/test/submit', {
      // 缺少 reviewedBy
      reviewDecision: 'approved'
    });
    if (res.status === 400 || res.status === 422) {
      console.log('✓ 正确返回参数校验错误');
      passed++;
    } else {
      console.log('✗ 未正确返回参数校验错误:', res.status, res.body);
      failed++;
    }
  } catch (err) {
    console.log('✗ 请求失败:', err.message);
    failed++;
  }
  
  // 测试8: 提交复核（非法决策）
  console.log('\n[8] 测试提交复核 POST /supervisor/reviews/:reviewId/submit (非法决策)');
  try {
    const res = await request('POST', '/supervisor/reviews/test/submit', {
      reviewedBy: 'sup_001',
      reviewDecision: 'invalid_decision'
    });
    if (res.status === 422 && res.body.code === 'INVALID_REVIEW_DECISION') {
      console.log('✓ 正确返回 INVALID_REVIEW_DECISION');
      passed++;
    } else {
      console.log('✗ 未正确返回决策错误:', res.status, res.body);
      failed++;
    }
  } catch (err) {
    console.log('✗ 请求失败:', err.message);
    failed++;
  }
  
  // 测试9: 缺少 projectId
  console.log('\n[9] 测试缺少 projectId');
  try {
    const res = await request('GET', '/supervisor/reviews/pending');
    if (res.status === 400 && res.body.code === 'PROJECT_ID_REQUIRED') {
      console.log('✓ 正确返回 PROJECT_ID_REQUIRED');
      passed++;
    } else {
      console.log('✗ 未正确返回 PROJECT_ID_REQUIRED:', res.status, res.body);
      failed++;
    }
  } catch (err) {
    console.log('✗ 请求失败:', err.message);
    failed++;
  }
  
  // 结果汇总
  console.log('\n' + '='.repeat(60));
  console.log(`测试完成: ${passed} 通过, ${failed} 失败`);
  console.log('='.repeat(60));
  
  if (failed > 0) {
    process.exit(1);
  }
}

// 运行测试
runTests().catch(err => {
  console.error('测试执行错误:', err);
  process.exit(1);
});
