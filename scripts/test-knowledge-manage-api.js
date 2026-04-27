/**
 * 知识库管理接口自动化测试脚本
 * 
 * 测试所有知识库管理接口：
 * 1. 健康检查
 * 2. 创建知识成功
 * 3. 查询知识详情成功
 * 4. 查询知识列表成功
 * 5. 按 scenario 筛选成功
 * 6. keyword 搜索成功
 * 7. 更新知识并生成 version=2
 * 8. 查询版本历史，看到 version=1 deprecated、version=2 active
 * 9. 停用 version=2 知识，status=deprecated
 * 10. 查询停用后的知识，确认记录仍存在
 * 11. 非法参数返回 400
 * 12. 不存在 knowledgeId 返回 404
 * 
 * 用法: node scripts/test-knowledge-manage-api.js
 */

const http = require('http');

const BASE_URL = 'http://localhost:3001';

// 颜色输出
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

function log(color, message) {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSuccess(message) {
  log('green', `✓ ${message}`);
}

function logError(message) {
  log('red', `✗ ${message}`);
}

function logInfo(message) {
  log('blue', `ℹ ${message}`);
}

// HTTP 请求封装
function httpRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const bodyStr = body ? JSON.stringify(body) : null;
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,  // 使用 path 而不是 pathname + search
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    if (bodyStr) {
      options.headers['Content-Length'] = Buffer.byteLength(bodyStr);
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({
            statusCode: res.statusCode,
            data: json
          });
        } catch (error) {
          resolve({
            statusCode: res.statusCode,
            data: data
          });
        }
      });
    });

    req.on('error', reject);

    if (bodyStr) {
      req.write(bodyStr);
    }

    req.end();
  });
}

// 测试用例
async function testKnowledgeManageAPI() {
  logInfo('开始测试知识库管理接口...');
  console.log('');

  let createdKnowledgeId = null;
  let updatedKnowledgeId = null;
  let passedCount = 0;
  let failedCount = 0;

  // ==================== 测试 1: 健康检查 ====================
  logInfo('测试 1: 健康检查');
  
  try {
    const healthResult = await httpRequest('GET', '/health');
    
    if (healthResult.statusCode === 200 && healthResult.data.status === 'ok') {
      logSuccess('健康检查通过');
      passedCount++;
    } else {
      logError('健康检查失败');
      console.error(JSON.stringify(healthResult.data, null, 2));
      failedCount++;
    }
  } catch (error) {
    logError('健康检查异常');
    console.error(error.message);
    failedCount++;
  }
  console.log('');

  // ==================== 测试 2: 创建知识成功 ====================
  logInfo('测试 2: 创建知识成功');
  
  try {
    const createResult = await httpRequest('POST', '/knowledge/create', {
      project: 'test_project',
      scenario: '测试场景',
      questionAliases: [
        '如何测试接口',
        '接口测试方法'
      ],
      standardAnswer: '您好，请使用自动化测试脚本进行接口测试。',
      rules: {
        keywords: ['测试', '接口'],
        required_info: [],
        forbidden: []
      },
      operatorId: 'tester_001'
    });

    if (createResult.statusCode === 201 && createResult.data.code === 0) {
      logSuccess('创建知识成功');
      createdKnowledgeId = createResult.data.data.knowledgeId;
      logInfo(`knowledgeId: ${createdKnowledgeId}`);
      logInfo(`version: ${createResult.data.data.version}`);
      logInfo(`status: ${createResult.data.data.status}`);
      passedCount++;
    } else {
      logError('创建知识失败');
      logError(`请求路径: POST /knowledge/create`);
      logError(`状态码: ${createResult.statusCode}`);
      console.error(JSON.stringify(createResult.data, null, 2));
      failedCount++;
    }
  } catch (error) {
    logError('创建知识异常');
    console.error(error.message);
    failedCount++;
  }
  console.log('');

  // ==================== 测试 3: 查询知识详情成功 ====================
  logInfo('测试 3: 查询知识详情成功');
  
  if (createdKnowledgeId) {
    try {
      const detailResult = await httpRequest('GET', `/knowledge/${createdKnowledgeId}`);
      
      if (detailResult.statusCode === 200 && detailResult.data.code === 0) {
        logSuccess('查询知识详情成功');
        logInfo(`knowledgeId: ${detailResult.data.data.knowledgeId}`);
        logInfo(`project: ${detailResult.data.data.project}`);
        logInfo(`scenario: ${detailResult.data.data.scenario}`);
        logInfo(`version: ${detailResult.data.data.version}`);
        logInfo(`status: ${detailResult.data.data.status}`);
        passedCount++;
      } else {
        logError('查询知识详情失败');
        logError(`请求路径: GET /knowledge/${createdKnowledgeId}`);
        logError(`状态码: ${detailResult.statusCode}`);
        console.error(JSON.stringify(detailResult.data, null, 2));
        failedCount++;
      }
    } catch (error) {
      logError('查询知识详情异常');
      console.error(error.message);
      failedCount++;
    }
  } else {
    logError('跳过测试：创建知识失败');
    failedCount++;
  }
  console.log('');

  // ==================== 测试 4: 查询知识列表成功 ====================
  logInfo('测试 4: 查询知识列表成功');
  
  try {
    const listResult = await httpRequest('GET', '/knowledge/list?project=test_project&page=1&page_size=10');
    
    if (listResult.statusCode === 200 && listResult.data.code === 0) {
      logSuccess('查询知识列表成功');
      logInfo(`总数: ${listResult.data.data.total}`);
      logInfo(`当前页: ${listResult.data.data.page}`);
      logInfo(`每页数量: ${listResult.data.data.pageSize}`);
      passedCount++;
    } else {
      logError('查询知识列表失败');
      logError(`请求路径: GET /knowledge/list`);
      logError(`状态码: ${listResult.statusCode}`);
      console.error(JSON.stringify(listResult.data, null, 2));
      failedCount++;
    }
  } catch (error) {
    logError('查询知识列表异常');
    console.error(error.message);
    failedCount++;
  }
  console.log('');

  // ==================== 测试 5: 按 scenario 筛选成功 ====================
  logInfo('测试 5: 按 scenario 筛选成功');
  
  try {
    const filterResult = await httpRequest('GET', '/knowledge/list?scenario=测试场景');
    
    if (filterResult.statusCode === 200 && filterResult.data.code === 0) {
      logSuccess('按 scenario 筛选成功');
      logInfo(`筛选结果数量: ${filterResult.data.data.total}`);
      passedCount++;
    } else {
      logError('按 scenario 筛选失败');
      logError(`请求路径: GET /knowledge/list?scenario=测试场景`);
      logError(`状态码: ${filterResult.statusCode}`);
      console.error(JSON.stringify(filterResult.data, null, 2));
      failedCount++;
    }
  } catch (error) {
    logError('按 scenario 筛选异常');
    console.error(error.message);
    failedCount++;
  }
  console.log('');

  // ==================== 测试 6: keyword 搜索成功 ====================
  logInfo('测试 6: keyword 搜索成功');
  
  try {
    const keywordResult = await httpRequest('GET', '/knowledge/list?keyword=测试');
    
    if (keywordResult.statusCode === 200 && keywordResult.data.code === 0) {
      logSuccess('keyword 搜索成功');
      logInfo(`搜索结果数量: ${keywordResult.data.data.total}`);
      passedCount++;
    } else {
      logError('keyword 搜索失败');
      logError(`请求路径: GET /knowledge/list?keyword=测试`);
      logError(`状态码: ${keywordResult.statusCode}`);
      console.error(JSON.stringify(keywordResult.data, null, 2));
      failedCount++;
    }
  } catch (error) {
    logError('keyword 搜索异常');
    console.error(error.message);
    failedCount++;
  }
  console.log('');

  // ==================== 测试 7: 更新知识并生成 version=2 ====================
  logInfo('测试 7: 更新知识并生成 version=2');
  
  if (createdKnowledgeId) {
    try {
      const updateResult = await httpRequest('POST', '/knowledge/update', {
        knowledgeId: createdKnowledgeId,
        questionAliases: [
          '如何测试接口',
          '接口测试方法',
          '接口自动化测试'
        ],
        standardAnswer: '您好，请使用自动化测试脚本进行接口测试，确保覆盖所有场景。',
        rules: {
          keywords: ['测试', '接口', '自动化'],
          required_info: [],
          forbidden: []
        },
        operatorId: 'tester_001',
        updateReason: '补充自动化测试说明'
      });

      if (updateResult.statusCode === 200 && updateResult.data.code === 0) {
        logSuccess('更新知识成功');
        updatedKnowledgeId = updateResult.data.data.knowledgeId;
        logInfo(`新 knowledgeId: ${updatedKnowledgeId}`);
        logInfo(`rootId: ${updateResult.data.data.rootId}`);
        logInfo(`version: ${updateResult.data.data.version}`);
        logInfo(`status: ${updateResult.data.data.status}`);
        
        if (updateResult.data.data.version === 2) {
          logSuccess('版本号正确（version=2）');
          passedCount++;
        } else {
          logError(`版本号错误（期望 version=2，实际 version=${updateResult.data.data.version}）`);
          failedCount++;
        }
      } else {
        logError('更新知识失败');
        logError(`请求路径: POST /knowledge/update`);
        logError(`状态码: ${updateResult.statusCode}`);
        console.error(JSON.stringify(updateResult.data, null, 2));
        failedCount++;
      }
    } catch (error) {
      logError('更新知识异常');
      console.error(error.message);
      failedCount++;
    }
  } else {
    logError('跳过测试：创建知识失败');
    failedCount++;
  }
  console.log('');

  // ==================== 测试 8: 查询版本历史 ====================
  logInfo('测试 8: 查询版本历史，看到 version=1 deprecated、version=2 active');
  
  if (createdKnowledgeId) {
    try {
      const versionsResult = await httpRequest('GET', `/knowledge/${createdKnowledgeId}/versions`);
      
      if (versionsResult.statusCode === 200 && versionsResult.data.code === 0) {
        logSuccess('查询版本历史成功');
        logInfo(`rootId: ${versionsResult.data.data.rootId}`);
        logInfo(`版本数量: ${versionsResult.data.data.versions.length}`);
        
        const versions = versionsResult.data.data.versions;
        let versionCheckPassed = true;
        
        versions.forEach(v => {
          logInfo(`  - version ${v.version}: ${v.status} (${v.knowledgeId})`);
        });
        
        // 验证 version=1 为 deprecated
        const v1 = versions.find(v => v.version === 1);
        if (v1 && v1.status === 'deprecated') {
          logSuccess('version=1 状态正确（deprecated）');
        } else {
          logError('version=1 状态错误（期望 deprecated）');
          versionCheckPassed = false;
        }
        
        // 验证 version=2 为 active
        const v2 = versions.find(v => v.version === 2);
        if (v2 && v2.status === 'active') {
          logSuccess('version=2 状态正确（active）');
        } else {
          logError('version=2 状态错误（期望 active）');
          versionCheckPassed = false;
        }
        
        if (versionCheckPassed) {
          passedCount++;
        } else {
          failedCount++;
        }
      } else {
        logError('查询版本历史失败');
        logError(`请求路径: GET /knowledge/${createdKnowledgeId}/versions`);
        logError(`状态码: ${versionsResult.statusCode}`);
        console.error(JSON.stringify(versionsResult.data, null, 2));
        failedCount++;
      }
    } catch (error) {
      logError('查询版本历史异常');
      console.error(error.message);
      failedCount++;
    }
  } else {
    logError('跳过测试：创建知识失败');
    failedCount++;
  }
  console.log('');

  // ==================== 测试 9: 停用 version=2 知识 ====================
  logInfo('测试 9: 停用 version=2 知识，status=deprecated');
  
  if (updatedKnowledgeId) {
    try {
      const statusResult = await httpRequest('POST', '/knowledge/status', {
        knowledgeId: updatedKnowledgeId,
        status: 'deprecated',
        operatorId: 'tester_001',
        reason: '自动化测试停用'
      });

      if (statusResult.statusCode === 200 && statusResult.data.code === 0) {
        logSuccess('停用知识成功');
        logInfo(`knowledgeId: ${statusResult.data.data.knowledgeId}`);
        logInfo(`status: ${statusResult.data.data.status}`);
        
        if (statusResult.data.data.status === 'deprecated') {
          logSuccess('状态正确（deprecated）');
          passedCount++;
        } else {
          logError(`状态错误（期望 deprecated，实际 ${statusResult.data.data.status}）`);
          failedCount++;
        }
      } else {
        logError('停用知识失败');
        logError(`请求路径: POST /knowledge/status`);
        logError(`状态码: ${statusResult.statusCode}`);
        console.error(JSON.stringify(statusResult.data, null, 2));
        failedCount++;
      }
    } catch (error) {
      logError('停用知识异常');
      console.error(error.message);
      failedCount++;
    }
  } else {
    logError('跳过测试：更新知识失败');
    failedCount++;
  }
  console.log('');

  // ==================== 测试 10: 查询停用后的知识，确认记录仍存在 ====================
  logInfo('测试 10: 查询停用后的知识，确认记录仍存在');
  
  if (updatedKnowledgeId) {
    try {
      const deprecatedDetailResult = await httpRequest('GET', `/knowledge/${updatedKnowledgeId}`);
      
      if (deprecatedDetailResult.statusCode === 200 && deprecatedDetailResult.data.code === 0) {
        logSuccess('查询停用后的知识成功');
        logInfo(`knowledgeId: ${deprecatedDetailResult.data.data.knowledgeId}`);
        logInfo(`status: ${deprecatedDetailResult.data.data.status}`);
        
        if (deprecatedDetailResult.data.data.status === 'deprecated') {
          logSuccess('记录仍存在且状态为 deprecated（软删除验证通过）');
          passedCount++;
        } else {
          logError(`状态错误（期望 deprecated，实际 ${deprecatedDetailResult.data.data.status}）`);
          failedCount++;
        }
      } else {
        logError('查询停用后的知识失败');
        logError(`请求路径: GET /knowledge/${updatedKnowledgeId}`);
        logError(`状态码: ${deprecatedDetailResult.statusCode}`);
        console.error(JSON.stringify(deprecatedDetailResult.data, null, 2));
        failedCount++;
      }
    } catch (error) {
      logError('查询停用后的知识异常');
      console.error(error.message);
      failedCount++;
    }
  } else {
    logError('跳过测试：更新知识失败');
    failedCount++;
  }
  console.log('');

  // ==================== 测试 11: 非法参数返回 400 ====================
  logInfo('测试 11: 非法参数返回 400');
  
  try {
    const invalidCreateResult = await httpRequest('POST', '/knowledge/create', {
      project: 'test_project',
      scenario: '测试场景'
      // 缺少 questionAliases, standardAnswer, operatorId
    });

    if (invalidCreateResult.statusCode === 400 && invalidCreateResult.data.code === 1) {
      logSuccess('参数校验成功（拒绝非法请求）');
      logInfo(`error: ${invalidCreateResult.data.error}`);
      logInfo(`message: ${invalidCreateResult.data.message}`);
      passedCount++;
    } else {
      logError('参数校验失败（应拒绝非法请求）');
      logError(`请求路径: POST /knowledge/create`);
      logError(`状态码: ${invalidCreateResult.statusCode}`);
      console.error(JSON.stringify(invalidCreateResult.data, null, 2));
      failedCount++;
    }
  } catch (error) {
    logError('参数校验异常');
    console.error(error.message);
    failedCount++;
  }
  console.log('');

  // ==================== 测试 12: 不存在 knowledgeId 返回 404 ====================
  logInfo('测试 12: 不存在 knowledgeId 返回 404');
  
  try {
    const notFoundResult = await httpRequest('GET', '/knowledge/kb_nonexistent_test_id');
    
    if (notFoundResult.statusCode === 404 && notFoundResult.data.code === 1) {
      logSuccess('404 响应正确');
      logInfo(`error: ${notFoundResult.data.error}`);
      passedCount++;
    } else {
      logError('404 响应错误');
      logError(`请求路径: GET /knowledge/kb_nonexistent_test_id`);
      logError(`状态码: ${notFoundResult.statusCode}`);
      console.error(JSON.stringify(notFoundResult.data, null, 2));
      failedCount++;
    }
  } catch (error) {
    logError('404 测试异常');
    console.error(error.message);
    failedCount++;
  }
  console.log('');

  // ==================== 测试完成 ====================
  logInfo('========== 测试完成 ==========');
  console.log('');
  logInfo(`测试通过数量: ${passedCount}`);
  logInfo(`测试失败数量: ${failedCount}`);
  console.log('');
  
  if (failedCount === 0) {
    logSuccess('所有测试通过！');
  } else {
    logError(`有 ${failedCount} 个测试失败，请检查上方错误信息`);
  }
}

// 运行测试
testKnowledgeManageAPI().catch(error => {
  logError('测试执行异常');
  console.error(error);
  process.exit(1);
});
