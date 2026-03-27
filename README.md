# trainer-core

客服训练核心引擎 V1。

当前项目包含三块能力：

1. **规则评分引擎**：输入场景 + 客服回复，输出分数、问题项、建议、标准回复
2. **命令行测试脚本**：本地交互输入即可评分
3. **Telegram Bot**：通过 TG 分步骤输入并返回评分结果

---

## 目录结构

```text
trainer-core/
├─ bot/                 # Telegram Bot
├─ core/                # 核心评分逻辑
├─ data/                # 场景与评分标准数据
├─ examples/            # 示例输入与本地测试脚本
├─ index.js             # CLI 入口：读取 JSON 文件评分
├─ package.json
└─ README.md
```

---

## 环境要求

- Node.js 18+
- npm

---

## 安装依赖

```bash
cd /Users/adime/.openclaw/workspace/trainer-core
npm install
```

---

## 环境变量

复制示例文件：

```bash
cp .env.example .env
```

然后按需填写：

```env
# AI 增强链路（可选）
OPENROUTER_API_KEY=
OPENROUTER_MODEL=

# Telegram Bot（运行 TG Bot 必填）
TELEGRAM_BOT_TOKEN=
```

---

## 运行方式

### 1. 跑默认示例

```bash
npm run start
```

等价于：

```bash
node index.js examples/test-input.json
```

---

### 2. 跑指定 JSON 文件

```bash
node index.js examples/test-good.json
node index.js examples/test-bad.json
```

输入格式：

```json
{
  "scenarioId": "lanton_sms_code",
  "userReply": "您好，请提供您的注册手机号，我们会协助您申请验证码。"
}
```

---

### 3. 本地交互评分

```bash
npm run score
```

功能：
- 选择场景
- 输入用户消息
- 输入客服回复
- 输出评分和 JSON 结果

也支持参数模式：

```bash
node examples/score-dialog.js \
  --scenario lanton_transfer_success_not_received \
  --customer "我转账成功了但是对方没收到钱，怎么办？" \
  --reply "您好，请您提供付款账单截图和Lanton绑定手机号，我们会尽快帮您核查处理。"
```

---

### 4. 启动 Telegram Bot

```bash
npm run tg
```

支持命令：

- `/start`
- `/help`
- `/scenarios`
- `/score`
- `/cancel`

交互流程：

1. 选择场景
2. 输入用户消息
3. 输入客服回复
4. 返回评分结果

---

## 当前可用场景

### `lanton_sms_code`
- 标题：注册收不到验证码
- 用户示例：我注册 Lanton Pay 一直收不到验证码，怎么办？

### `lanton_transfer_success_not_received`
- 标题：转账成功但对方未到账
- 用户示例：我这边显示转账成功了，但是对方一直没收到钱，这是怎么回事？

---

## 核心输出字段

评分结果主要包含：

- `score`：总分
- `coachSummary`：整体总结
- `dimensionScores`：维度分数
- `findings`：问题项
- `suggestions`：优化建议
- `standardReply`：标准参考回复

---

## 说明

当前版本是**规则评分引擎优先**：

- 优点：简单、稳定、可解释
- 限制：还不支持直接对整段多轮对话自动抽取客服回复

如果后续需要，可以继续扩展：

- Telegram 按钮选择场景
- 直接粘贴整段对话自动评分
- 批量导入 CSV / Excel
- Web 页面
# op
