# 对练机器人项目说明书

## 项目定位

这是一个以 `trainer-core` 为核心的客服对练/训练系统。

目标不是普通聊天机器人，而是：
- 对客服回复做规则评估
- 在高风险场景下调用 AI 做纠错与标准化改写
- 对 AI 结果做验证
- 在主线路异常时走备用线路

## 项目结构总览

本次打包主要包含 3 个核心目录：

### 1. `trainer-core/`
主项目目录，属于当前业务核心。

负责：
- 训练流程主逻辑
- 规则评估
- AI 教练调用
- AI 结果验证
- Telegram 接入
- 结果反馈与 metrics

关键目录说明：

#### `core/`
核心业务层。

主要文件：
- `index.js`：当前 AI 增强主链入口，负责编排 AI 决策、AI coach、验证、metrics
- `trainer.js`：较早期的训练评估入口，目前更适合作为兼容层保留
- `ai-coach.js`：AI 教练模块，负责根据规则结果生成纠错建议和标准化改写
- `ai-validator.js`：AI 输出验证门面，负责做结构校验并接入 validation-kit
- `validation-kit-bridge.js`：把 validation-kit 挂到 trainer-core 的桥接层
- `router-fallback.js`：备用线路入口，负责调用 claw-router
- `metrics.js`：统计 AI 调用、fallback、失败次数等
- `scenario-loader.js`：训练场景读取
- `feedback.js`：结果反馈组装
- `evaluator.js`：基础规则评估器
- `ai-decision.js`：判断是否需要进入 AI 教练流程

#### `app/telegram/`
Telegram 交互层。

主要文件：
- `commands.js`：指令解析
- `formatter.js`：消息格式处理

#### `adapters/telegram/`
Telegram API 适配层。

#### `data/`
训练数据层。

主要内容：
- 场景定义
- 标准答案
- 规则相关数据

#### `examples/`
示例和调试样本。

主要用于：
- 跑本地测试
- 验证链路
- 回归检查

---

### 2. `claw-router/`
备用 AI 路由器。

定位：
- 多 provider 备用线路
- 主线路异常时接管
- 提供任务分类、成本估算、fallback、重试逻辑

负责：
- provider 路由
- retry / backoff
- fallback
- 基础预算判断
- 实际消耗统计

关键文件：
- `src/router.ts`：核心路由逻辑
- `src/providers/openai.ts`：OpenAI provider
- `src/providers/google.ts`：Google provider
- `src/providers/openrouter.ts`：OpenRouter provider
- `src/providers/base.ts`：provider 错误统一封装
- `src/classifier.ts`：任务分类（L1/L2/L3 + taskType）
- `src/budget.ts`：预算判断
- `src/estimator.ts`：粗略 token / 成本估算
- `src/ledger.ts`：调用记录
- `src/demo.ts`：本地 demo

当前状态：
- 已作为备用线路接入系统
- 默认不替换主线路
- 主线路失败时可被触发

---

### 3. `validation-kit/`
验证层原型包。

定位：
- 观察层验证骨架
- 不直接当最终阻断器
- 为未来 runtime validator 留接口

负责：
- `TaskSpec`
- `ValidationPolicy`
- `PhaseOutcome`
- validator pipeline
- evaluation
- rewrite selector

关键目录说明：
- `src/spec/`：任务规格识别与验证策略推导
- `src/validation/`：验证管线和 validators
- `src/evaluation/`：候选结果评分
- `src/rewrite/`：改写结果选择逻辑
- `src/types/`：类型定义

关键文件：
- `spec-detector.ts`：把任务输入识别成结构化 spec
- `validation-policy.ts`：根据 spec 推导验证策略
- `run-validator-pipeline.ts`：执行阶段化验证
- `evaluator.ts`：对候选输出进行评分
- `select-better-candidate.ts`：决定是否采用二稿

当前状态：
- 已接入 trainer-core 的一条真实链路
- 当前属于观察层
- runtime validator 尚未真正实现

---

## 当前运行关系

当前默认策略：

1. 主线路继续走 `trainer-core` 里的原主线路
2. 如果主线路失败，可触发 `claw-router` 备用线路
3. `validation-kit` 已挂入真实验证链，但当前主要用于观察和补充判断

## 当前建议的迁移顺序（到另一台电脑）

### 第一步：恢复代码
把整个项目目录复制到新电脑。

### 第二步：安装依赖
分别进入以下目录执行：

```bash
cd trainer-core && npm install
cd ../claw-router && npm install
cd ../validation-kit && npm install
```

### 第三步：补环境变量
至少需要配置：

#### `trainer-core/.env`
- `TELEGRAM_BOT_TOKEN`
- `OPENROUTER_API_KEY`
- `OPENROUTER_MODEL`
- 如需备用线路联动，建议同步配置：
  - `OPENAI_API_KEY`
  - `GOOGLE_API_KEY`

#### `claw-router/.env`
- `OPENAI_API_KEY`
- `GOOGLE_API_KEY`
- `OPENROUTER_API_KEY`

### 第四步：先做本地测试
建议顺序：

```bash
cd validation-kit && npm run build
cd ../claw-router && npm run build
cd ../trainer-core && node examples/run-ai-chain.js
```

### 第五步：再启动 Telegram 入口
等本地链路测试通过后，再启动 Telegram 相关入口。

## 当前注意事项

### 1. 不要默认切换主线路
当前策略是：
- 主线路保留
- 备用线路已接入
- 等现有主线路持续限流/不稳定时再切过去

### 2. `validation-kit` 不是最终生产阻断器
目前它更适合：
- 观察
- 记录 phase outcome
- 辅助判断

而不是直接强阻断所有结果。

### 3. `.env` 不应一起进压缩包公开流转
如果你打算分享给别人，建议把 `.env` 单独保管，不要和代码一起发。

## 我对当前项目的一句话定义

这是一个：

**以 trainer-core 为主、claw-router 为备用线路、validation-kit 为观察层验证引擎的客服对练系统。**
