# 试运行场景白名单（Trial Scenario Whitelist）

> **版本**：v1.0  
> **创建时间**：2026-04-24  
> **状态**：已收紧  
> **目的**：只保留最稳场景，禁止全场景尝试

---

## 一、当前可试运行场景列表

### 1.1 允许试运行的场景（白名单）

| 序号 | 场景 ID | 场景标题 | 知识条数 | 状态 | 进入理由 |
|------|---------|---------|---------|------|---------|
| 1 | `lanton_transfer_success_not_received` | 转账成功但对方未到账 | 1 条（active） | ✅ 允许 | 已验证可稳定命中，知识质量高，第八步证据充分 |

**当前配置**：
```bash
KNOWLEDGE_INJECTION_SCENARIO_WHITELIST=lanton_transfer_success_not_received
```

### 1.2 为什么只保留这 1 个场景

**验证历史**：
- ✅ 第八步已验证：知识注入成功（knowledge_hit_count = 1）
- ✅ 第八步已验证：建议答案质量高（评分 65 分）
- ✅ 第九步已验证：白名单机制生效
- ✅ 第九步已验证：回退机制可靠

**知识质量**：
- ✅ 有 1 条 active 知识（ID: 69）
- ✅ 知识内容专业、准确
- ✅ 建议答案可直接参考使用

**风险控制**：
- ✅ 只保留 1 个场景，便于观察
- ✅ 如有问题，影响范围最小
- ✅ 主管容易评估质量

---

## 二、当前不应放开的场景

### 2.1 不应放开的场景清单

| 场景 ID | 场景标题 | 知识条数 | 状态 | 暂停原因 |
|---------|---------|---------|------|---------|
| `register_flow` | 注册流程指引 | 0 条 | ❌ 禁止 | 无 active 知识，无法命中 |
| `lanton_sms_code` | 注册收不到验证码 | 0 条 | ❌ 禁止 | 无 active 知识，无法命中 |
| `transfer_not_received` | 转账未到账（旧版） | 13 条 | ❌ 禁止 | 场景 ID 不统一，可能与白名单场景重复 |
| `same_scenario` | 同场景测试 | 26 条 | ❌ 禁止 | 测试数据，不应进入生产 |
| `test` | 测试场景 | 2 条 | ❌ 禁止 | 测试数据 |
| `general` | 通用 | 2 条 | ❌ 禁止 | 太泛，不适合知识注入 |
| `general_unknown` | 通用未知 | 4 条 | ❌ 禁止 | 未知问题，质量未验证 |
| `account_locked` | 账户锁定 | 13 条 | ⚠️ deprecated | 知识已废弃 |
| `final_verification` | 最终验证 | 2 条 | ⚠️ deprecated | 知识已废弃 |
| `knowledge_api_test` | 知识 API 测试 | 2 条 | ⚠️ deprecated | 测试数据 |
| `测试场景` | 测试场景（中文） | 4 条 | ⚠️ deprecated | 测试数据 |

### 2.2 重点说明

**`transfer_not_received` vs `lanton_transfer_success_not_received`**：
- `transfer_not_received`：旧版场景 ID，有 13 条知识
- `lanton_transfer_success_not_received`：新版场景 ID，有 1 条知识
- **问题**：两个场景可能是同一问题，但知识重复
- **处理**：当前只使用新版场景，旧版场景暂停，待去重后再决定是否启用

**`same_scenario`**：
- 有 26 条 active 知识，数量最多
- **但**：这是测试场景，知识质量未验证
- **处理**：禁止进入白名单，除非主管明确确认知识质量

---

## 三、场景进入白名单的条件

### 3.1 必要条件

1. ✅ **有 active 知识**：至少 1 条状态为 `active` 的知识
2. ✅ **知识质量已验证**：主管已确认知识准确、专业
3. ✅ **场景已验证**：已在测试中证明可稳定命中
4. ✅ **建议答案质量高**：评分 >= 60 分，或主管主观认可
5. ✅ **无重复知识**：已检查与其他场景无重复

### 3.2 禁止条件

1. ❌ **无 active 知识**：知识条数为 0 或全部 deprecated
2. ❌ **测试场景**：`test`、`same_scenario` 等明确标注为测试
3. ❌ **知识已废弃**：状态为 `deprecated`
4. ❌ **知识未验证**：主管未确认质量
5. ❌ **有重复知识**：与其他场景存在明显重复

---

## 四、如何扩展白名单

### 4.1 扩展流程

```
1. 技术负责人检查场景知识质量
   ↓
2. 主管审核并确认
   ↓
3. 更新白名单配置
   ↓
4. 小范围测试（1~2 次训练）
   ↓
5. 观察 3 天，无问题则正式启用
```

### 4.2 扩展示例

**假设要添加 `withdraw_pending`（提现 pending）场景**：

**步骤 1：检查知识质量**
```bash
# 查询该场景知识
mysql -u root -e "USE trainer_core; SELECT id, knowledge_id, scenario, LEFT(question_aliases, 100) as question, status FROM knowledge_base WHERE scenario='withdraw_pending';"
```

**步骤 2：测试验证**
```bash
# 临时添加到白名单
export KNOWLEDGE_INJECTION_SCENARIO_WHITELIST=lanton_transfer_success_not_received,withdraw_pending

# 运行测试
node scripts/test-internal-trial-verification.js
```

**步骤 3：观察日志**
```bash
# 查看命中情况
tail -f runtime/logs/bot.log | grep KnowledgeInjectionTrial
```

**步骤 4：主管确认**
- 主管试用 3 天
- 评估建议答案质量
- 确认无错知识

**步骤 5：正式更新配置**
```bash
# 更新 .env
KNOWLEDGE_INJECTION_SCENARIO_WHITELIST=lanton_transfer_success_not_received,withdraw_pending

# 重启服务
npm restart
```

---

## 五、当前配置（最终版）

### 5.1 环境变量

```bash
# 知识注入总开关
KNOWLEDGE_INJECTION_ENABLED=true

# 入口白名单
KNOWLEDGE_INJECTION_ENTRY_WHITELIST=training,internal_trial

# 场景白名单（当前只允许 1 个场景）
KNOWLEDGE_INJECTION_SCENARIO_WHITELIST=lanton_transfer_success_not_received

# 最大知识条数
KNOWLEDGE_INJECTION_MAX_ITEMS=3
```

### 5.2 场景白名单说明

**当前白名单场景**：
- `lanton_transfer_success_not_received`（转账成功但对方未到账）

**为什么只有 1 个**：
- 这是唯一经过完整验证的场景
- 第八步、第九步均已证明可稳定运行
- 其他场景知识质量待验证或为测试数据

**何时可扩展**：
- 主管确认其他场景知识质量
- 完成去重（如 `transfer_not_received`）
- 完成测试验证

---

## 六、文档维护

| 版本 | 日期 | 修改内容 | 修改人 |
|------|------|---------|--------|
| v1.0 | 2026-04-24 | 初始版本，收紧场景白名单到 1 个 | 技术团队 |

---

## 附录：知识数据查询命令

```bash
# 查询所有场景知识条数
mysql -u root -e "USE trainer_core; SELECT scenario, COUNT(*) as count, GROUP_CONCAT(DISTINCT status) as statuses FROM knowledge_base GROUP BY scenario;"

# 查询某个场景的知识详情
mysql -u root -e "USE trainer_core; SELECT id, knowledge_id, scenario, LEFT(question_aliases, 100) as question, status FROM knowledge_base WHERE scenario='lanton_transfer_success_not_received';"

# 查询重复知识（同一场景多条知识）
mysql -u root -e "USE trainer_core; SELECT scenario, COUNT(*) as count FROM knowledge_base WHERE status='active' GROUP BY scenario HAVING count > 1 ORDER BY count DESC;"
```
