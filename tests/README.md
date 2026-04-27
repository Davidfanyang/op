# Tests 模块

## 负责什么
- 负责测试用例、验证逻辑、回归验证
- 负责检查模块行为是否符合预期
- 负责为迭代改造提供校验依据

## 不负责什么
- 不负责生产业务逻辑
- 不负责对外服务
- 不负责正式文档输出

## 输入 / 输出
- **输入**: 测试数据、测试请求、断言条件
- **输出**: 通过结果、失败结果、测试报告

## 测试分类
### 单元测试
- `evaluator.test.js` - 评估器测试
- `trainer.test.js` - 训练器测试
- `feedback.test.js` - 反馈模块测试
- `dialogue-analyzer.test.js` - 对话分析器测试

### 集成测试
- `mysql-repository.integration.test.js` - MySQL Repository 集成测试
- `live-monitor-service.test.js` - 监听服务测试
- `supervisor-api.test.js` - 主管 API 测试

### 场景测试
- `scenario-matching.test.js` - 场景匹配测试
- `mode-isolation.test.js` - 模式隔离测试

### 特殊测试
- `alert-throttling.test.js` - 告警限流测试
- `false-positive-control.test.js` - 误报控制测试
- `submit-review.transaction.test.js` - 审核提交事务测试

## 运行方式
```bash
# 运行所有测试
node tests/run-all-tests.js

# 运行单个测试
node tests/evaluator.test.js
```
