# Examples 目录 - 示例代码

## 负责什么
- 负责提供示例输入、示例调用、示例流程
- 负责用于演示或最小可运行说明
- 负责帮助开发理解调用方式

## 不负责什么
- 不负责生产链路
- 不负责真实业务判断
- 不负责正式数据入库

## 输入 / 输出
- **输入**: 示例会话、示例配置、示例请求
- **输出**: 示例执行结果、示例输出对象

## 示例分类

### 测试输入样例
- `test-input.json` - 标准测试输入
- `test-good.json` - 优秀回复样例
- `test-bad.json` - 问题回复样例
- `test-with-ai.json` - AI 增强测试样例
- `test-ai-optimized.json` - AI 优化测试样例

### 异常测试样例
- `test-invalid.json` - 无效输入样例
- `test-malformed.json` - 格式错误样例
- `test-basic.json` - 基础测试样例
- `test-run.json` - 运行测试样例

### 示例脚本
- `score-dialog.js` - 评分示例
- `run-ai-chain.js` - AI 链示例

## 使用方式
```bash
# 使用测试样例运行评估
node index.js examples/test-input.json

# 运行 AI 链示例
node examples/run-ai-chain.js
```
