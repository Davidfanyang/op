#!/bin/bash

# ============================================================
# 第4阶段 MySQL 测试运行脚本
# ============================================================

set -e

echo "============================================================"
echo "第4阶段 MySQL 集成测试"
echo "============================================================"

# 检查环境变量
if [ -z "$MYSQL_HOST" ] || [ -z "$MYSQL_PASSWORD" ]; then
    echo ""
    echo "⚠️  MySQL 环境变量未配置"
    echo ""
    echo "请设置以下环境变量："
    echo "  export MYSQL_HOST=localhost"
    echo "  export MYSQL_PORT=3306"
    echo "  export MYSQL_USER=root"
    echo "  export MYSQL_PASSWORD=your_password"
    echo "  export MYSQL_DATABASE=trainer_core_test"
    echo ""
    echo "或者创建 .env.test 文件"
    echo ""
    exit 1
fi

echo ""
echo "配置信息:"
echo "  Host: $MYSQL_HOST"
echo "  Port: ${MYSQL_PORT:-3306}"
echo "  User: $MYSQL_USER"
echo "  Database: $MYSQL_DATABASE"
echo ""

# 加载 .env.test 如果存在
if [ -f ".env.test" ]; then
    echo "加载 .env.test..."
    export $(grep -v '^#' .env.test | xargs)
fi

# 检查 MySQL 连接
echo "检查 MySQL 连接..."
if ! command -v mysql &> /dev/null; then
    echo "⚠️  mysql 命令未找到，跳过连接测试"
else
    if mysql -h"$MYSQL_HOST" -P"${MYSQL_PORT:-3306}" -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" -e "SELECT 1" &> /dev/null; then
        echo "✓ MySQL 连接成功"
    else
        echo "✗ MySQL 连接失败，请检查配置"
        exit 1
    fi
fi

# 创建测试数据库
echo ""
echo "创建测试数据库 (如果不存在)..."
mysql -h"$MYSQL_HOST" -P"${MYSQL_PORT:-3306}" -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" \
    -e "CREATE DATABASE IF NOT EXISTS $MYSQL_DATABASE CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci" || true

# 执行 schema
echo ""
echo "执行 schema.sql..."
mysql -h"$MYSQL_HOST" -P"${MYSQL_PORT:-3306}" -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE" \
    < infrastructure/persistence/mysql/schema.sql && echo "✓ Schema 执行成功"

# 运行测试
echo ""
echo "============================================================"
echo "运行测试"
echo "============================================================"

PASSED=0
FAILED=0

# 测试 1: Repository 集成测试
echo ""
echo ">>> 测试 1: MySQL Repository 集成测试"
echo ""
if node tests/mysql-repository.integration.test.js; then
    ((PASSED++))
else
    ((FAILED++))
fi

# 测试 2: 事务一致性测试
echo ""
echo ">>> 测试 2: submitReview 事务一致性测试"
echo ""
if node tests/submit-review.transaction.test.js; then
    ((PASSED++))
else
    ((FAILED++))
fi

# 测试 3: 全链路流程测试
echo ""
echo ">>> 测试 3: Live Monitor 全链路流程测试"
echo ""
if node tests/live-monitor-mysql-flow.test.js; then
    ((PASSED++))
else
    ((FAILED++))
fi

# 结果汇总
echo ""
echo "============================================================"
echo "测试结果: $PASSED 通过, $FAILED 失败"
echo "============================================================"

if [ $FAILED -gt 0 ]; then
    exit 1
fi

echo ""
echo "🎉 第4阶段 MySQL 联调验收完成！"
