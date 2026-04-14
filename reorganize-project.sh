#!/bin/bash

# ============================================================
# trainer-core 项目整理脚本
# 执行顺序: 清垃圾 -> 改名 -> 修死链 -> 重构核心
# ============================================================

set -e  # 遇到错误立即退出

echo "=========================================="
echo "trainer-core 项目整理脚本"
echo "=========================================="
echo ""

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "工作目录: $SCRIPT_DIR"
echo ""

# ============================================================
# 第1步：清垃圾
# ============================================================
echo "【第1步】清理垃圾文件..."

# 删除垃圾文件和目录
rm -rf __MACOSX 2>/dev/null || true
rm -rf node_modules 2>/dev/null || true
rm -f nohup.out 2>/dev/null || true
rm -f node 2>/dev/null || true
rm -f "trainer-core@1.0.0" 2>/dev/null || true
rm -f "test.jsonnode index.js test.json" 2>/dev/null || true
rm -f "test.jsonnode index.js test.json.save" 2>/dev/null || true

echo "  ✓ 垃圾文件清理完成"
echo ""

# ============================================================
# 第2步：统一入口名
# ============================================================
echo "【第2步】统一入口名称..."

# 改名 bot-final.js -> telegram-bot.js
if [ -f "bot/bot-final.js" ]; then
    mv bot/bot-final.js bot/telegram-bot.js
    echo "  ✓ bot/bot-final.js -> bot/telegram-bot.js"
fi

# 更新 package.json 中的脚本
if [ -f "package.json" ]; then
    sed -i '' 's/bot-final\.js/telegram-bot.js/g' package.json
    sed -i '' 's/bot-final\.lock/telegram-bot.lock/g' package.json
    sed -i '' 's/bot-final\.log/telegram-bot.log/g' package.json
    echo "  ✓ package.json 已更新"
fi

echo ""

# ============================================================
# 第3步：修死链
# ============================================================
echo "【第3步】修复死链和引用..."

# 修复 index.js - 删除 evaluateTrainingSync
if [ -f "index.js" ]; then
    cat > index.js << 'EOF'
const { evaluateTraining } = require('./core/trainer');
const fs = require('fs');
const path = require('path');

async function main() {
  const inputPath = process.argv[2];
  
  if (!inputPath) {
    console.error('用法: node index.js <input.json>');
    process.exit(1);
  }

  const fullPath = path.resolve(inputPath);
  
  if (!fs.existsSync(fullPath)) {
    console.error(`文件不存在: ${fullPath}`);
    process.exit(1);
  }

  const input = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  
  try {
    const result = await evaluateTraining(input);
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('评估失败:', err.message);
    process.exit(1);
  }
}

main();
EOF
    echo "  ✓ index.js 已重写"
fi

# 重写 start-bot.js
if [ -f "start-bot.js" ]; then
    cat > start-bot.js << 'EOF'
#!/usr/bin/env node

/**
 * 正式启动入口
 * 统一加载环境变量并启动 Telegram Bot
 */

const path = require('path');
const dotenv = require('dotenv');

// 加载环境变量
dotenv.config({ path: path.resolve(__dirname, '.env') });

// 校验必要配置
const requiredEnv = ['TELEGRAM_BOT_TOKEN'];
const missing = requiredEnv.filter(key => !process.env[key]);

if (missing.length > 0) {
  console.error('错误: 缺少必要环境变量:');
  missing.forEach(key => console.error(`  - ${key}`));
  console.error('\n请检查 .env 文件');
  process.exit(1);
}

console.log('========================================');
console.log('Trainer Core Bot');
console.log('========================================');
console.log('启动时间:', new Date().toISOString());
console.log('');

// 启动 Bot
require('./bot/telegram-bot');
EOF
    chmod +x start-bot.js
    echo "  ✓ start-bot.js 已重写"
fi

# 删除 run-with-logs.js
if [ -f "run-with-logs.js" ]; then
    rm run-with-logs.js
    echo "  ✓ run-with-logs.js 已删除"
fi

# 重写 scripts/run-local.sh
if [ -d "scripts" ]; then
    cat > scripts/run-local.sh << 'EOF'
#!/bin/bash

# 本地启动脚本
# 仅保留最基本逻辑

set -e

echo "启动 Trainer Core Bot..."

# 检查 .env
if [ ! -f ".env" ]; then
    echo "错误: 缺少 .env 文件"
    echo "请复制 .env.example 并配置"
    exit 1
fi

# 安装依赖
echo "安装依赖..."
npm install

# 启动
echo "启动 Bot..."
node start-bot.js
EOF
    chmod +x scripts/run-local.sh
    echo "  ✓ scripts/run-local.sh 已重写"
fi

# 归档或删除 setup-docker.sh
if [ -f "scripts/setup-docker.sh" ]; then
    mkdir -p archive/scripts
    mv scripts/setup-docker.sh archive/scripts/
    echo "  ✓ scripts/setup-docker.sh 已移至 archive/scripts/"
fi

echo ""

# ============================================================
# 第4步：创建 .gitignore
# ============================================================
echo "【第4步】创建 .gitignore..."

cat > .gitignore << 'EOF'
# 依赖
node_modules/

# 环境变量
.env

# 运行时文件
runtime/logs/*
runtime/locks/*
!runtime/logs/.gitkeep
!runtime/locks/.gitkeep

# 系统文件
.DS_Store
__MACOSX/

# 日志
nohup.out
*.log

# 编辑器
.idea/
.vscode/
*.swp
*.swo

# 测试残留
test.jsonnode*

# 误生成文件
node
trainer-core@1.0.0
EOF

echo "  ✓ .gitignore 已创建"
echo ""

# ============================================================
# 第5步：创建 .env.example
# ============================================================
echo "【第5步】创建 .env.example..."

cat > .env.example << 'EOF'
# Telegram Bot Token
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here

# 本地评分模型 API
LOCAL_SCORING_API=http://localhost:8001/score

# (可选) OpenRouter API - 用于 AI 增强评估
OPENROUTER_API_KEY=
OPENROUTER_MODEL=google/gemini-3.1-pro-preview

# (可选) 其他 AI 服务
OPENAI_API_KEY=
GOOGLE_API_KEY=
EOF

echo "  ✓ .env.example 已创建"
echo ""

# ============================================================
# 第6步：整理测试文件
# ============================================================
echo "【第6步】整理测试文件..."

# 创建 tests 目录
mkdir -p tests

# 移动测试文件
for file in test-ai-validation.js test-local-model.js test-smart-evaluator.js test-generator.js test-sync.js; do
    if [ -f "$file" ]; then
        mv "$file" tests/
        echo "  ✓ $file -> tests/"
    fi
done

# 保留根目录的核心测试 JSON
for file in test-basic.json test-good.json test-bad.json; do
    if [ -f "$file" ]; then
        echo "  ✓ $file 保留在根目录"
    fi
done

# 归档其他测试文件
mkdir -p archive/tests
for file in test-invalid.json test-malformed.json test-run.json test-with-ai.json test.json; do
    if [ -f "$file" ]; then
        mv "$file" archive/tests/
        echo "  ✓ $file -> archive/tests/"
    fi
done

echo ""

# ============================================================
# 第7步：创建核心目录结构
# ============================================================
echo "【第7步】创建核心目录结构..."

mkdir -p core/schemas
mkdir -p core/mappings
mkdir -p services
mkdir -p archive/tests

echo "  ✓ 目录结构已创建"
echo ""

# ============================================================
# 第8步：创建 archive/README.md
# ============================================================
echo "【第8步】创建 archive 说明..."

cat > archive/README.md << 'EOF'
# Archive 归档目录

此目录仅用于存放历史参考文件，**不参与正式运行**。

## 规则

1. 不允许被正式代码 import
2. 仅作历史版本参考
3. 删除前请确认无依赖

## 当前归档

- `evaluator-legacy-v2.0.js` - 旧版智能评分算法
- `feedback-legacy-v2.0.js` - 旧版反馈构建逻辑
- `scripts/` - 旧版脚本
- `tests/` - 旧版测试文件
EOF

echo "  ✓ archive/README.md 已创建"
echo ""

# ============================================================
# 完成
# ============================================================
echo "=========================================="
echo "整理完成!"
echo "=========================================="
echo ""
echo "后续步骤:"
echo "1. 检查 .env 文件配置"
echo "2. 运行 npm install 安装依赖"
echo "3. 运行 node start-bot.js 启动"
echo ""
echo "目录结构:"
ls -la
