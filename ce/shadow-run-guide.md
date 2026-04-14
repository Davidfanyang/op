# 影子运行指南 (3天)

> 目标: 用真实使用数据验证系统是否真正可用,而不是样例验收

---

## 运行范围

| 维度 | 范围 | 说明 |
|------|------|------|
| **项目** | default | 只用这一个项目 |
| **Training场景** | greeting_test | 只用这一个场景 |
| **Live Monitor入口** | Telegram | 只用这一个入口 |
| **主管** | supervisor_001 | 只有这位主管处理 |
| **周期** | 3天 | 连续3天收集数据 |

---

## 每天做什么

### 主管操作 (每天5-10分钟)

#### 早上
1. 查看 training 工作台:
```bash
node scripts/show-training-workbench.js
```

2. 处理 high priority (分数<30):
```bash
# 查看详情
node scripts/training-queue-processor.js detail <review_id>

# 执行处理
node scripts/training-queue-processor.js process <review_id> <decision> supervisor_001 "备注"
```

#### 下午
3. 处理 medium priority (分数30-50)

4. 查看 live_monitor 告警 (如有Telegram通知)
   - 在Telegram中回复告警消息
   - 使用 `/review approved` 或 `/review rejected`

#### 下班前
5. 生成日报:
```bash
node scripts/shadow-run-daily.js 2026-04-11  # 替换为当天日期
```

---

## 数据收集

### 自动收集的6个指标

#### Training (3个)
1. **新增待处理数** - 每天新增多少training记录
2. **high/medium/low 分布** - 优先级分布是否合理
3. **需补训数量** - 主管真正判为needs_training的数量

#### Live Monitor (3个)
4. **进入主管流数量** - 多少告警进了supervisor_review
5. **确认有效数量** - 主管判为approved的数量
6. **标记误报数量** - 主管判为rejected的数量

### 日报存储位置

```
runtime/shadow-run/
├── daily-report-2026-04-11.json
├── daily-report-2026-04-12.json
└── daily-report-2026-04-13.json
```

---

## 3天后复盘

### 运行复盘脚本

```bash
node scripts/shadow-run-review.js
```

会自动分析最近3天数据,输出:

### 1. Priority 认可度

```
优先级  总数  主管认可  主管驳回  平均分  认可率
high    15    13        2         22.5    86.7%
medium  12    10        2         38.2    83.3%
low     8     3         5         55.1    37.5%
```

**判断标准**:
- ✅ 认可率 > 80%: 优先级设计合理
- ⚠️ 认可率 60-80%: 需要微调
- ❌ 认可率 < 60%: 需要重新设计

### 2. Problem Tags 准确率

```
问题标签  总数  准确  打偏  准确率  典型打偏案例
态度问题  10    9     1     90.0%   无
话术问题  12    8     4     66.7%   分数58, 主管判passed
流程问题  5     4     1     80.0%   分数45, 主管判passed
```

**判断标准**:
- ✅ 准确率 > 80%: 标签识别准确
- ⚠️ 准确率 60-80%: 需要优化规则
- ❌ 准确率 < 60%: 需要重新设计

### 3. 误报分析 (不该进主管流)

列出所有被主管判为 `rejected` 的 live_monitor 告警:
- Review ID
- 分数/告警级别
- 主管备注
- 为什么不该进

### 4. 漏报分析 (该进但没进)

列出所有低级别告警但主管判为 `approved` 的案例:
- Review ID
- 分数/告警级别
- 主管备注
- 为什么该进

---

## 成功标准

### Training 工作台

| 指标 | 目标值 | 说明 |
|------|-------|------|
| **Priority认可率** | >80% | 主管认可优先级划分 |
| **Problem Tags准确率** | >75% | 问题标签识别准确 |
| **日均处理时效** | <24h | 当天问题当天处理 |

### Live Monitor 分流

| 指标 | 目标值 | 说明 |
|------|-------|------|
| **进入主管流占比** | 30-40% | 不过多也不过少 |
| **告警准确率** | >70% | approved/(approved+rejected) |
| **误报率** | <20% | rejected/总告警数 |
| **漏报数** | <5% | 该进但没进的 |

### 判读模板

| 指标 | 目标值 | 说明 |
|------|-------|------|
| **决策一致性** | >85% | 主管用模板判断与最终决定一致 |
| **决策时效** | <2分钟/条 | 看卡片就能快速判断 |

---

## 问题记录表

每天记录遇到的问题:

| 日期 | 问题类型 | 问题描述 | 影响 | 建议改进 |
|------|---------|---------|------|---------|
| 4/11 | priority | low优先级主管也处理了 | 增加工作量 | 调整low的阈值 |
| 4/12 | tags | "话术问题"打偏 | 误判 | 优化识别规则 |
| 4/13 | routing | observation进了主管流 | 误报 | 调整分流规则 |

---

## 常用命令

```bash
# 查看工作台
node scripts/show-training-workbench.js

# 处理training
node scripts/training-queue-processor.js list
node scripts/training-queue-processor.js detail <id>
node scripts/training-queue-processor.js process <id> <decision> supervisor_001 "备注"

# 生成日报
node scripts/shadow-run-daily.js 2026-04-11

# 3天后复盘
node scripts/shadow-run-review.js
```

---

## 注意事项

1. **范围限制**: 只用default项目,greeting_test场景,不要扩
2. **真实数据**: 用真实客服对话,不要用测试数据
3. **及时记录**: 每天下班前生成日报,不要累积
4. **备注清楚**: 处理时写清楚为什么这样判,方便复盘
5. **不要修改规则**: 3天内不要改代码,保持规则稳定

---

## 3天后下一步

### 如果验证通过 (达到成功标准)
- 扩大范围 (增加场景/项目)
- 优化规则 (根据复盘结果)
- 准备正式上线

### 如果验证未通过
- 分析问题原因
- 调整规则/阈值
- 重新运行3天

---

**开始日期**: 2026-04-11  
**结束日期**: 2026-04-13  
**复盘日期**: 2026-04-14
