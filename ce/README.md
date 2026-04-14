# 影子运行包 (Shadow Run Package)

> 主管可用版 - 3天影子运行验证

---

## 📦 包含内容

### 核心模块 (core/)
- `training-workbench.js` - Training工作台 (3视图)
- `alert-router.js` - Live Monitor告警分流器

### 脚本 (scripts/)
- `shadow-run-daily.js` - 每日数据收集脚本
- `shadow-run-review.js` - 3天后复盘分析脚本
- `show-training-workbench.js` - 工作台展示脚本
- `training-queue-processor.js` - Training队列处理工具

### 文档 (docs/)
- `supervisor-decision-card.md` - 主管最小判读模板
- `shadow-run-guide.md` - 影子运行完整指南

---

## 🚀 快速开始

### 1. 查看工作台
```bash
node show-training-workbench.js
```

### 2. 处理Training队列
```bash
# 查看待处理
node training-queue-processor.js list

# 处理记录
node training-queue-processor.js process <review_id> <decision> <reviewed_by> "<comment>"
```

### 3. 生成日报
```bash
node shadow-run-daily.js 2026-04-11
```

### 4. 3天后复盘
```bash
node shadow-run-review.js
```

---

## 📊 影子运行配置

| 维度 | 配置 |
|------|------|
| 项目 | default |
| Training场景 | greeting_test |
| Live Monitor入口 | Telegram |
| 主管 | supervisor_001 |
| 周期 | 3天 |

---

## 🎯 验证目标

### Training 工作台
- Priority认可率 > 80%
- Problem Tags准确率 > 75%
- 日均处理时效 < 24h

### Live Monitor 分流
- 进入主管流占比 30-40%
- 告警准确率 > 70%
- 误报率 < 20%

### 判读模板
- 决策一致性 > 85%
- 决策时效 < 2分钟/条

---

## 📝 每日操作清单

- [ ] 早上: 查看工作台,处理high priority
- [ ] 下午: 处理medium priority和live_monitor告警
- [ ] 下班前: 运行shadow-run-daily.js生成日报

---

## 📂 输出文件

日报会保存到:
```
runtime/shadow-run/
├── daily-report-2026-04-11.json
├── daily-report-2026-04-12.json
└── daily-report-2026-04-13.json
```

复盘报告会保存到:
```
runtime/shadow-run/
└── review-analysis-2026-04-14.json
```

---

## ⚠️ 注意事项

1. 不要扩大范围 (只用default项目)
2. 用真实数据,不用测试数据
3. 每天及时生成日报
4. 处理时写清楚备注
5. 3天内不要修改规则

---

**完整指南**: 查看 `shadow-run-guide.md`
