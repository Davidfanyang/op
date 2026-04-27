# FALLBACK_SWITCH_PLAN.md

## 当前策略

- 保留现有主线路（OpenRouter 直连）为默认主线路
- 新增 claw-router 作为备用线路入口
- 当前不做主线路替换，不影响现有运行方式

## 已上线内容

- `trainer-core/core/router-fallback.js`
- `trainer-core/core/ai-coach.js` 已接入备用线路调用

## 当前行为

1. 默认先走现有 OpenRouter 主线路
2. 若主线路报错，则自动调用 `claw-router` 备用线路
3. 备用线路内部执行：
   - 任务分类
   - 成本估算
   - 重试
   - fallback
   - 记账

## 之后切换主线路的备案方案

当现有主线路出现以下任一情况时，可切换默认主线路到 `claw-router`：

- 持续 rate limit
- 持续 provider 不稳定
- 成本明显失控
- 需要正式启用多 provider 路由

## 切换步骤

1. 找到当前直接调用 OpenRouter 的入口
2. 用 `routeTask()` 替换默认调用
3. 保留旧直连方式作为紧急回退
4. 验证两个真实任务：
   - 一个普通轻任务
   - 一个高价值代码/分析任务

## 当前结论

- 备用线路已接入部分系统
- 主线路仍保持原样
- 切主方案已备案，可在限流时快速执行
