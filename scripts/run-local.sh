#!/bin/bash
# run-local.sh - 本地启动脚本

set -e

echo "======================================"
echo "客服训练 Bot - 本地启动"
echo "======================================"

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "错误: 未安装 Node.js"
    exit 1
fi

echo "Node.js 版本: $(node --version)"

# 检查 .env
if [ ! -f .env ]; then
    echo "创建 .env 文件（从 .env.example 复制）..."
    if [ -f .env.example ]; then
        cp .env.example .env
        echo "请编辑 .env 文件，添加 TELEGRAM_BOT_TOKEN 等必要配置"
    else
        echo "警告: 缺少 .env.example 文件"
    fi
    exit 1
fi

# 安装依赖
echo "安装依赖..."
npm install

# 启动 Bot
echo "======================================"
echo "启动 Bot..."
echo "======================================"
node start-bot.js
