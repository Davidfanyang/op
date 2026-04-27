# 知识治理最小规则（Knowledge Governance Minimum Rules）

> **版本**：v1.0  
> **创建时间**：2026-04-24  
> **状态**：最小可用  
> **目的**：让知识可控，可下线，可标记主答案

---

## 一、当前知识治理能力

### 1.1 已有能力

| 能力 | 状态 | 说明 |
|------|------|------|
| **知识状态管理** | ✅ 已有 | `knowledge_base.status` 字段（active / deprecated） |
| **知识检索** | ✅ 已有 | `KnowledgeRetrievalService` |
| **知识注入** | ✅ 已有 | `runKnowledgeInjectionTrial()` |
| **知识沉淀** | ⚠️ 部分有 | 手动入库，自动沉淀流程待完善 |

### 1.2 本次补充的能力

| 能力 | 状态 | 说明 |
|------|------|------|
| **错知识可下线** | ✅ 复用现有 | 使用 `status='deprecated'` |
| **主答案可标记** | ❌ 本次不补 | 暂不需要，当前每个场景只有 1 条知识 |
| **重复知识可识别** | ✅ 新增脚本 | `scripts/check-duplicate-knowledge.js` |

---

## 二、什么叫错知识

### 2.1 错知识定义

**错知识**是指：

1. **内容错误**：知识内容与实际情况不符
2. **过时知识**：知识内容已过时，不再适用
3. **场景不匹配**：知识标注的场景与实际场景不符
4. **建议答案偏题**：基于该知识生成的建议答案与问题无关
5. **主管否定**：主管明确确认该知识不应使用

### 2.2 错知识示例

**示例 1：内容错误**
```
场景：转账成功但对方未到账
知识：转账成功后，资金会立即到账，不会延迟
实际：转账可能因网络原因延迟到账
结论：❌ 错知识，应下线
```

**示例 2：过时知识**
```
场景：注册流程
知识：请下载 Lanton v1.0 版本
实际：当前已是 Lanton v3.0
结论：❌ 过时知识，应下线
```

**示例 3：场景不匹配**
```
场景：转账成功但对方未到账
知识：注册需要先下载 App
实际：这是注册场景的知识，不是转账场景
结论：❌ 场景不匹配，应下线
```

---

## 三、谁可以下线知识

### 3.1 权限定义

| 角色 | 权限 | 操作方式 |
|------|------|---------|
| **主管** | ✅ 可以下线 | 通知技术负责人，由技术负责人执行 |
| **技术负责人** | ✅ 可以下线 | 直接执行 SQL 或脚本 |
| **客服** | ❌ 不可以下线 | 发现问题后上报主管 |

### 3.2 下线流程

**流程**：
```
1. 发现错知识（客服/主管/技术负责人）
   ↓
2. 记录问题（时间、知识 ID、问题描述）
   ↓
3. 主管确认（是否确实为错知识）
   ↓
4. 技术负责人执行下线
   ↓
5. 更新日志记录
```

**执行命令**：
```bash
# 方法 1：直接 SQL（技术负责人）
mysql -u root -e "USE trainer_core; UPDATE knowledge_base SET status='deprecated' WHERE knowledge_id='kb_xxx';"

# 方法 2：使用脚本（待创建）
node scripts/disable-knowledge.js kb_xxx

# 方法 3：Web 后台（待开发）
# Web 后台 → 知识库管理 → 选择知识 → 下线
```

### 3.3 下线后验证

**验证命令**：
```bash
# 确认知识已下线
mysql -u root -e "USE trainer_core; SELECT knowledge_id, scenario, status FROM knowledge_base WHERE knowledge_id='kb_xxx';"

# 应看到 status='deprecated'
```

**影响评估**：
- 下线后，该知识不会再被检索到
- 已生成的建议答案不受影响
- 下次知识注入会使用其他知识（如有）或回退

---

## 四、什么叫主答案

### 4.1 主答案定义

**主答案**是指：

- 同场景存在多条类似知识时，**当前主要使用的知识**
- 其他知识为历史知识或备用知识

### 4.2 当前是否需要主答案标记

**当前状态**：❌ **不需要**

**原因**：
- 当前白名单场景（`lanton_transfer_success_not_received`）只有 1 条 active 知识
- 不存在同场景多条知识竞争的情况
- 无需区分主答案和备用答案

### 4.3 未来何时需要

**触发条件**：
- 同场景有 >= 2 条 active 知识
- 知识内容类似但不完全相同
- 需要明确哪条是主要使用的

**实现方式**（未来）：
```sql
-- 方案 1：增加 is_primary 字段
ALTER TABLE knowledge_base ADD COLUMN is_primary BOOLEAN DEFAULT FALSE;

-- 方案 2：增加 priority 字段
ALTER TABLE knowledge_base ADD COLUMN priority INT DEFAULT 0;
```

**当前处理**：
- 暂不实现
- 如出现同场景多条知识，由主管手动确认使用哪条
- 技术负责人将其他知识标记为 `deprecated`

---

## 五、重复知识怎么处理

### 5.1 重复知识定义

**重复知识**是指：

1. **完全重复**：同一场景，问题 aliases 完全相同
2. **语义重复**：同一场景，问题 aliases 不同但语义相同
3. **跨场景重复**：不同场景，但知识内容相同（可能是场景划分问题）

### 5.2 当前重复知识情况

**查询命令**：
```bash
# 查询同场景多条知识
mysql -u root -e "USE trainer_core; SELECT scenario, COUNT(*) as count FROM knowledge_base WHERE status='active' GROUP BY scenario HAVING count > 1 ORDER BY count DESC;"
```

**当前结果**（第九步检查）：
- `same_scenario`：26 条（测试场景，暂不处理）
- `transfer_not_received`：13 条（可能与 `lanton_transfer_success_not_received` 重复）
- `account_locked`：13 条（已 deprecated，不影响）

### 5.3 重复知识处理规则

**规则 1：同场景完全重复**
- 保留 1 条，其他标记为 `deprecated`
- 保留标准：最新创建、质量最高、主管确认

**规则 2：同场景语义重复**
- 合并知识（aliases 合并）
- 或保留 1 条，其他标记为 `deprecated`

**规则 3：跨场景重复**
- 检查场景划分是否合理
- 如确实属于同一问题，合并场景
- 如属于不同问题，保留但标注差异

### 5.4 重复知识检查脚本

**脚本路径**：`scripts/check-duplicate-knowledge.js`

**功能**：
- 查询同场景多条知识
- 输出重复知识列表
- 提供处理建议

**执行命令**：
```bash
node scripts/check-duplicate-knowledge.js
```

**输出示例**：
```
【重复知识检查报告】

场景：transfer_not_received
- 知识条数：13 条
- 建议：检查是否与 lanton_transfer_success_not_received 重复

场景：same_scenario
- 知识条数：26 条
- 建议：测试场景，建议清理

【总结】
- 发现 2 个场景存在重复知识
- 建议优先处理 transfer_not_received
```

---

## 六、哪些知识禁止进入白名单场景

### 6.1 禁止清单

| 知识类型 | 禁止原因 | 示例 |
|---------|---------|------|
| **测试知识** | 非生产数据 | `test`、`same_scenario` 场景的知识 |
| **已废弃知识** | 状态为 deprecated | `account_locked` 场景的知识 |
| **未验证知识** | 主管未确认质量 | 新沉淀但未审核的知识 |
| **错知识** | 内容错误或过时 | 已确认应下线的知识 |
| **重复知识** | 存在明显重复 | 同场景多条类似知识 |

### 6.2 检查流程

**知识进入白名单场景前必须检查**：

1. ✅ 知识状态为 `active`
2. ✅ 场景在白名单中
3. ✅ 主管已确认质量
4. ✅ 无重复知识
5. ✅ 内容准确、未过时

---

## 七、最小治理脚本

### 7.1 脚本清单

| 脚本 | 功能 | 状态 |
|------|------|------|
| `scripts/check-duplicate-knowledge.js` | 检查重复知识 | ✅ 待创建 |
| `scripts/disable-knowledge.js` | 下线知识 | ✅ 待创建 |
| `scripts/set-primary-knowledge.js` | 标记主答案 | ❌ 暂不需要 |

### 7.2 创建检查重复知识脚本

**脚本路径**：`scripts/check-duplicate-knowledge.js`

**功能**：
- 查询所有场景的知识条数
- 输出同场景多条知识的列表
- 提供处理建议

**执行命令**：
```bash
node scripts/check-duplicate-knowledge.js
```

---

## 八、文档维护

| 版本 | 日期 | 修改内容 | 修改人 |
|------|------|---------|--------|
| v1.0 | 2026-04-24 | 初始版本，定义最小知识治理规则 | 技术团队 |

---

## 附录：常用治理命令

```bash
# 查询所有知识状态分布
mysql -u root -e "USE trainer_core; SELECT status, COUNT(*) as count FROM knowledge_base GROUP BY status;"

# 查询某个场景的知识详情
mysql -u root -e "USE trainer_core; SELECT id, knowledge_id, scenario, LEFT(question_aliases, 100) as question, status, created_at FROM knowledge_base WHERE scenario='lanton_transfer_success_not_received';"

# 下线知识
mysql -u root -e "USE trainer_core; UPDATE knowledge_base SET status='deprecated' WHERE knowledge_id='kb_xxx';"

# 恢复知识
mysql -u root -e "USE trainer_core; UPDATE knowledge_base SET status='active' WHERE knowledge_id='kb_xxx';"

# 删除知识（谨慎！）
mysql -u root -e "USE trainer_core; DELETE FROM knowledge_base WHERE knowledge_id='kb_xxx';"
```
