# Scripts 模块

## 负责什么
- 负责辅助脚本、初始化脚本、导入脚本、检查脚本、批处理脚本
- 负责一次性工具操作
- 负责非在线主链路的技术支撑

## 不负责什么
- 不负责在线主业务流程
- 不负责正式业务判断
- 不负责系统主入口承载

## 输入 / 输出
- **输入**: 命令参数、文件数据、脚本配置
- **输出**: 日志、导入结果、检查结果、批处理结果

## 脚本分类
### 数据导入/初始化
- `insert-training-samples.js` - 插入训练样本
- `add-parsejson.js` - JSON 解析工具

### 测试/调试
- `test-live-monitor-closed-loop.js` - 监听闭环测试
- `test-conversation-signals.js` - 会话信号测试
- `debug-submit-review.js` - 审核提交调试

### 分析/统计
- `gray-stats.js` - 灰度统计
- `analyze-conversations.js` - 会话分析
- `query-gray-data.js` - 灰度数据查询

### 影子运行
- `shadow-run-daily.js` - 每日影子运行
- `shadow-run-review.js` - 影子运行审核

### 工具/验证
- `check-env.js` - 环境检查
- `verify-alert-routing.js` - 告警路由验证
- `verify-decision-card.js` - 决策卡片验证

## 使用注意
脚本模块不参与主业务流程，仅用于开发、测试、运维辅助。
