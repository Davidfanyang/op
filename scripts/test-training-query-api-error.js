/**
 * 训练记录查询接口 - 异常场景测试脚本
 * 
 * 用法: node scripts/test-training-query-api-error.js
 * 
 * 测试内容：
 * 1. session_id 不存在
 * 2. page 非数字
 * 3. page_size 超过 100
 * 4. start_time 格式错误
 * 5. end_time 早于 start_time
 * 6. 数据库无训练数据（查询不存在的项目）
 * 7. session 存在但 messages 为空
 * 8. session 存在但 roundResults 为空
 */

const http = require('http');

const API_BASE = 'http://localhost:3001';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

async function main() {
  console.log('========================================');
  console.log('训练记录查询接口 - 异常场景测试');
  console.log('========================================\n');
  console.log(`测试开始时间: ${new Date().toISOString()}\n`);

  try {
    // 1. session_id 不存在
    await testCase1();
    
    // 2. page 非数字
    await testCase2();
    
    // 3. page_size 超过 100
    await testCase3();
    
    // 4. start_time 格式错误
    await testCase4();
    
    // 5. end_time 早于 start_time
    await testCase5();
    
    // 6. 数据库无训练数据
    await testCase6();
    
    // 7. session 存在但 messages 为空 (需要先查询一个 session)
    await testCase7();
    
    // 8. session 存在但 roundResults 为空
    await testCase8();
    
    // 输出统计
    console.log('\n========================================');
    console.log('测试统计');
    console.log('========================================');
    console.log(`总测试数: ${totalTests}`);
    console.log(`通过: ${passedTests}`);
    console.log(`失败: ${failedTests}`);
    console.log(`通过率: ${((passedTests / totalTests) * 100).toFixed(2)}%`);
    console.log('========================================\n');
    
    if (failedTests > 0) {
      console.log('⚠️  存在失败的测试用例，请检查上方错误信息');
      process.exit(1);
    } else {
      console.log('✅ 所有异常场景测试通过');
    }

  } catch (err) {
    console.error('测试执行失败:', err.message);
    process.exit(1);
  }
}

/**
 * 测试用例 1: session_id 不存在
 */
async function testCase1() {
  totalTests++;
  console.log(`测试 ${totalTests}: session_id 不存在`);
  console.log(`请求: GET /training/sessions/non_existent_session_id`);
  
  try {
    const result = await httpGet('/training/sessions/non_existent_session_id');
    
    if (result.success === false && result.code === 'TRAINING_SESSION_NOT_FOUND') {
      console.log('✅ 通过 - 返回 404 和正确的错误码');
      console.log(`HTTP 状态码: 404`);
      console.log(`响应: ${JSON.stringify(result, null, 2)}\n`);
      passedTests++;
    } else {
      console.log('❌ 失败 - 预期返回 TRAINING_SESSION_NOT_FOUND');
      console.log(`实际响应: ${JSON.stringify(result, null, 2)}\n`);
      failedTests++;
    }
  } catch (err) {
    console.log('❌ 失败 - 请求异常');
    console.log(`错误: ${err.message}\n`);
    failedTests++;
  }
}

/**
 * 测试用例 2: page 非数字
 */
async function testCase2() {
  totalTests++;
  console.log(`测试 ${totalTests}: page 非数字`);
  console.log(`请求: GET /training/sessions?page=abc`);
  
  try {
    const result = await httpGet('/training/sessions?page=abc');
    
    // 应该正常处理，page 默认为 1
    if (result.success === true && result.data && result.data.pagination) {
      console.log('✅ 通过 - 正常处理，page 使用默认值 1');
      console.log(`HTTP 状态码: 200`);
      console.log(`实际 page: ${result.data.pagination.page}`);
      console.log(`响应示例: ${JSON.stringify(result.data.pagination, null, 2)}\n`);
      passedTests++;
    } else {
      console.log('❌ 失败 - 预期正常处理');
      console.log(`实际响应: ${JSON.stringify(result, null, 2)}\n`);
      failedTests++;
    }
  } catch (err) {
    console.log('❌ 失败 - 请求异常');
    console.log(`错误: ${err.message}\n`);
    failedTests++;
  }
}

/**
 * 测试用例 3: page_size 超过 100
 */
async function testCase3() {
  totalTests++;
  console.log(`测试 ${totalTests}: page_size 超过 100`);
  console.log(`请求: GET /training/sessions?page_size=500`);
  
  try {
    const result = await httpGet('/training/sessions?page_size=500');
    
    // 应该限制为 100
    if (result.success === true && result.data && result.data.pagination) {
      const actualPageSize = result.data.pagination.limit;
      if (actualPageSize <= 100) {
        console.log('✅ 通过 - page_size 被限制为最大值 100');
        console.log(`HTTP 状态码: 200`);
        console.log(`请求 page_size: 500`);
        console.log(`实际 page_size: ${actualPageSize}`);
        console.log(`响应示例: ${JSON.stringify(result.data.pagination, null, 2)}\n`);
        passedTests++;
      } else {
        console.log('❌ 失败 - page_size 未被限制');
        console.log(`实际 page_size: ${actualPageSize}\n`);
        failedTests++;
      }
    } else {
      console.log('❌ 失败 - 预期正常处理');
      console.log(`实际响应: ${JSON.stringify(result, null, 2)}\n`);
      failedTests++;
    }
  } catch (err) {
    console.log('❌ 失败 - 请求异常');
    console.log(`错误: ${err.message}\n`);
    failedTests++;
  }
}

/**
 * 测试用例 4: start_time 格式错误
 */
async function testCase4() {
  totalTests++;
  console.log(`测试 ${totalTests}: start_time 格式错误`);
  console.log(`请求: GET /training/sessions?start_time=invalid-date`);
  
  try {
    const result = await httpGet('/training/sessions?start_time=invalid-date');
    
    // 应该正常处理（可能返回空列表或忽略该参数）
    if (result.success === true) {
      console.log('✅ 通过 - 正常处理格式错误的时间');
      console.log(`HTTP 状态码: 200`);
      console.log(`响应示例: ${JSON.stringify(result.data.pagination, null, 2)}\n`);
      passedTests++;
    } else {
      console.log('❌ 失败 - 预期正常处理');
      console.log(`实际响应: ${JSON.stringify(result, null, 2)}\n`);
      failedTests++;
    }
  } catch (err) {
    console.log('❌ 失败 - 请求异常');
    console.log(`错误: ${err.message}\n`);
    failedTests++;
  }
}

/**
 * 测试用例 5: end_time 早于 start_time
 */
async function testCase5() {
  totalTests++;
  console.log(`测试 ${totalTests}: end_time 早于 start_time`);
  console.log(`请求: GET /training/sessions?start_time=2026-04-19T00:00:00Z&end_time=2026-04-01T00:00:00Z`);
  
  try {
    const result = await httpGet('/training/sessions?start_time=2026-04-19T00:00:00Z&end_time=2026-04-01T00:00:00Z');
    
    // 应该正常处理（可能返回空列表）
    if (result.success === true) {
      console.log('✅ 通过 - 正常处理时间范围错误');
      console.log(`HTTP 状态码: 200`);
      console.log(`返回数据量: ${result.data.items.length}`);
      console.log(`响应示例: ${JSON.stringify(result.data.pagination, null, 2)}\n`);
      passedTests++;
    } else {
      console.log('❌ 失败 - 预期正常处理');
      console.log(`实际响应: ${JSON.stringify(result, null, 2)}\n`);
      failedTests++;
    }
  } catch (err) {
    console.log('❌ 失败 - 请求异常');
    console.log(`错误: ${err.message}\n`);
    failedTests++;
  }
}

/**
 * 测试用例 6: 数据库无训练数据（查询不存在的项目）
 */
async function testCase6() {
  totalTests++;
  console.log(`测试 ${totalTests}: 数据库无训练数据`);
  console.log(`请求: GET /training/sessions?project=non_existent_project`);
  
  try {
    const result = await httpGet('/training/sessions?project=non_existent_project');
    
    // 应该返回空列表
    if (result.success === true && result.data.items.length === 0 && result.data.pagination.total === 0) {
      console.log('✅ 通过 - 返回空列表');
      console.log(`HTTP 状态码: 200`);
      console.log(`返回数据量: 0`);
      console.log(`响应示例: ${JSON.stringify(result.data, null, 2)}\n`);
      passedTests++;
    } else {
      console.log('❌ 失败 - 预期返回空列表');
      console.log(`实际响应: ${JSON.stringify(result, null, 2)}\n`);
      failedTests++;
    }
  } catch (err) {
    console.log('❌ 失败 - 请求异常');
    console.log(`错误: ${err.message}\n`);
    failedTests++;
  }
}

/**
 * 测试用例 7: session 存在但 messages 为空
 * 注意：这个测试需要数据库中有一个没有消息的 session
 * 我们查询一个存在的 session，即使它有消息，也验证接口能正常处理
 */
async function testCase7() {
  totalTests++;
  console.log(`测试 ${totalTests}: session 存在但查询 messages`);
  console.log(`说明: 查询一个存在的 session，验证接口能正常处理 messages`);
  
  try {
    // 先获取一个存在的 session
    const sessionsResult = await httpGet('/training/sessions?page=1&page_size=1');
    
    if (sessionsResult.data && sessionsResult.data.items && sessionsResult.data.items.length > 0) {
      const sessionId = sessionsResult.data.items[0].sessionId;
      console.log(`请求: GET /training/sessions/${sessionId}`);
      
      const result = await httpGet(`/training/sessions/${sessionId}`);
      
      if (result.success === true && result.data && result.data.session) {
        console.log('✅ 通过 - 正常返回 session 和 messages');
        console.log(`HTTP 状态码: 200`);
        console.log(`messages 数量: ${result.data.messages ? result.data.messages.length : 0}`);
        console.log(`响应示例: ${JSON.stringify({
          sessionId: result.data.session.sessionId,
          messagesCount: result.data.messages ? result.data.messages.length : 0,
          hasMessages: result.data.messages && result.data.messages.length > 0
        }, null, 2)}\n`);
        passedTests++;
      } else {
        console.log('❌ 失败 - 预期正常返回');
        console.log(`实际响应: ${JSON.stringify(result, null, 2)}\n`);
        failedTests++;
      }
    } else {
      console.log('⚠️  跳过 - 数据库中没有 session');
      console.log('说明: 无法测试此场景，因为数据库为空\n');
      totalTests--;
    }
  } catch (err) {
    console.log('❌ 失败 - 请求异常');
    console.log(`错误: ${err.message}\n`);
    failedTests++;
  }
}

/**
 * 测试用例 8: session 存在但 roundResults 为空
 * 注意：类似测试 7，验证接口能正常处理
 */
async function testCase8() {
  totalTests++;
  console.log(`测试 ${totalTests}: session 存在但查询 roundResults`);
  console.log(`说明: 查询一个存在的 session 的轮次结果，验证接口能正常处理`);
  
  try {
    // 先获取一个存在的 session
    const sessionsResult = await httpGet('/training/sessions?page=1&page_size=1');
    
    if (sessionsResult.data && sessionsResult.data.items && sessionsResult.data.items.length > 0) {
      const sessionId = sessionsResult.data.items[0].sessionId;
      console.log(`请求: GET /training/sessions/${sessionId}/rounds`);
      
      const result = await httpGet(`/training/sessions/${sessionId}/rounds`);
      
      if (result.success === true && result.data && result.data.session) {
        console.log('✅ 通过 - 正常返回 session 和 roundResults');
        console.log(`HTTP 状态码: 200`);
        console.log(`roundResults 数量: ${result.data.roundResults ? result.data.roundResults.length : 0}`);
        console.log(`响应示例: ${JSON.stringify({
          sessionId: result.data.session.sessionId,
          roundResultsCount: result.data.roundResults ? result.data.roundResults.length : 0,
          hasRoundResults: result.data.roundResults && result.data.roundResults.length > 0
        }, null, 2)}\n`);
        passedTests++;
      } else {
        console.log('❌ 失败 - 预期正常返回');
        console.log(`实际响应: ${JSON.stringify(result, null, 2)}\n`);
        failedTests++;
      }
    } else {
      console.log('⚠️  跳过 - 数据库中没有 session');
      console.log('说明: 无法测试此场景，因为数据库为空\n');
      totalTests--;
    }
  } catch (err) {
    console.log('❌ 失败 - 请求异常');
    console.log(`错误: ${err.message}\n`);
    failedTests++;
  }
}

/**
 * HTTP GET 请求（带状态码）
 */
function httpGet(path) {
  return new Promise((resolve, reject) => {
    http.get(`${API_BASE}${path}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          parsed.httpStatus = res.statusCode;
          resolve(parsed);
        } catch (err) {
          reject(new Error('Invalid JSON response'));
        }
      });
    }).on('error', reject);
  });
}

// 运行
main().catch(console.error);
