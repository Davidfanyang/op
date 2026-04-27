# 主管打标最小闭环执行单

**版本**: v1.0  
**日期**: 2026-04-23  
**状态**: 待执行  
**优先级**: P0（回归主线）

---

## 一、背景

### 1.1 为什么要做打标最小闭环

**当前状态：**
- ✅ 主管审核页面已有5个核心接口（tasks / detail / submit / records / stats）
- ✅ reviews表（MySQL）已包含大部分所需字段
- ✅ 审核主链路已跑通

**缺失能力：**
- ❌ 缺少"打标"语义的最小字段（is_correct, problem_type, should_store, corrected_answer, review_comment）
- ❌ 打标后数据未明确标记"可进入FAQ沉淀"
- ❌ 缺少打标专用的简化接口（现有接口太重，包含太多审核流逻辑）

**目标：**
- 主管能查看真实对话 + Qwen3分析结果
- 主管能打最小字段（5个）
- 打标结果入库（reviews表）
- 打标通过的数据具备进入FAQ沉淀的条件

---

## 二、最小打标字段（5个）

### 2.1 字段定义

| 字段 | 类型 | 必填 | 说明 | 映射到reviews表 | 示例值 |
|------|------|------|------|----------------|--------|
| `is_correct` | boolean | ✅ | 客服回复是否正确 | `final_accepted` (1/0) | `true` |
| `problem_type` | string | ✅ | 问题类型（从枚举选择） | `problem_tags` (JSON数组) | `"话术不规范"` |
| `should_store` | boolean | ✅ | 是否应沉淀到FAQ | `knowledge_id` (pending标记) | `true` |
| `corrected_answer` | string | ❌ | 修正后的标准答案 | `final_reply` | `"您好，请提供..."` |
| `review_comment` | string | ❌ | 主管备注 | `review_note` | `"话术需更专业"` |

### 2.2 问题类型枚举（首版最小集）

```json
[
  "话术不规范",
  "信息遗漏",
  "流程错误",
  "态度问题",
  "知识盲区",
  "系统操作错误",
  "无问题（正确回复）"
]
```

**说明：**
- 首版只支持单选，后续可扩展为多选
- "无问题（正确回复）"表示客服回复完全正确，但仍可能需要沉淀

---

## 三、数据库设计

### 3.1 复用现有reviews表

**不需要新建表**，复用现有reviews表。

**现有字段映射：**

| 打标字段 | reviews表字段 | 说明 |
|---------|--------------|------|
| is_correct | `final_accepted` (TINYINT) | 1=正确，0=错误 |
| problem_type | `problem_tags` (JSON) | 数组格式：`["话术不规范"]` |
| should_store | `knowledge_id` (VARCHAR) | `'pending_faq'`=待沉淀，NULL=不沉淀 |
| corrected_answer | `final_reply` (TEXT) | 修正后的标准答案 |
| review_comment | `review_note` (TEXT) | 主管备注 |

### 3.2 新增状态和动作

**review_status 新增：**
- `tagged` - 已打标（可进入FAQ沉淀）

**review_action 新增：**
- `tag` - 打标动作（区别于approve/modify_and_approve/reject）

### 3.3 打标结果存储SQL

```sql
INSERT INTO reviews (
  review_id,
  project_id,
  mode,
  session_id,
  message_id,
  evaluation_id,
  suggestion_id,
  
  -- 打标核心字段
  review_action,              -- 'tag' (新动作)
  final_accepted,             -- is_correct (1/0)
  problem_tags,               -- problem_type (JSON数组)
  final_reply,                -- corrected_answer
  review_note,                -- review_comment
  
  -- FAQ沉淀标记
  knowledge_id,               -- 'pending_faq' (打标通过且should_store=true)
  
  -- 审核人信息
  reviewer_id,
  reviewed_at,
  
  -- 状态
  review_status               -- 'tagged' (新状态)
) VALUES (
  'rev_xxx',
  'project_001',
  'live_monitor',
  'session_xxx',
  'message_xxx',
  'eval_xxx',
  'sugg_xxx',
  
  'tag',
  1,                          -- is_correct=true
  '["话术不规范"]',
  '您好，为了帮您进一步核查...',
  '话术需更专业，避免口语化',
  
  'pending_faq',             -- should_store=true
  
  'supervisor_001',
  NOW(),
  
  'tagged'
);
```

---

## 四、API接口设计

### 4.1 接口1：打标提交（核心）

```
POST /review/tag
```

**请求体：**
```json
{
  "evaluation_id": "eval_xxx",
  "suggestion_id": "sugg_xxx",  // 可选
  "reviewer_id": "supervisor_001",
  
  "is_correct": true,
  "problem_type": "话术不规范",
  "should_store": true,
  "corrected_answer": "标准答案内容（可选）",
  "review_comment": "主管备注（可选）"
}
```

**响应（成功）：**
```json
{
  "code": 0,
  "data": {
    "review_id": "rev_xxx",
    "status": "tagged",
    "faq_eligible": true,
    "message": "打标成功，数据已具备FAQ沉淀条件"
  }
}
```

**响应（失败）：**
```json
{
  "code": 400,
  "error": {
    "message": "is_correct=false时，should_store必须为false",
    "details": {
      "is_correct": false,
      "should_store": true
    }
  }
}
```

**验证规则：**
- ✅ `evaluation_id` 必填
- ✅ `reviewer_id` 必填
- ✅ `is_correct` 必填（boolean）
- ✅ `problem_type` 必填（从枚举选择）
- ✅ `should_store` 必填（boolean）
- ❌ `corrected_answer` 可选
- ❌ `review_comment` 可选
- ❌ `is_correct=false` 时，`should_store` 必须为false
- ❌ `problem_type` 必须在枚举范围内

---

### 4.2 接口2：查询打标记录

```
GET /review/tagged-records?project_id=xxx&reviewer_id=xxx&faq_eligible=true&page=1&page_size=20
```

**查询参数：**
- `project_id` - 项目ID（可选）
- `reviewer_id` - 审核人ID（可选）
- `faq_eligible` - 是否只查可沉淀FAQ的数据（可选，true/false）
- `page` - 页码（默认1）
- `page_size` - 每页条数（默认20，最大100）

**响应：**
```json
{
  "code": 0,
  "data": {
    "list": [
      {
        "review_id": "rev_xxx",
        "evaluation_id": "eval_xxx",
        "is_correct": true,
        "problem_type": ["话术不规范"],
        "should_store": true,
        "faq_eligible": true,
        "corrected_answer": "标准答案",
        "review_comment": "备注",
        "reviewer_id": "supervisor_001",
        "tagged_at": "2026-04-23T10:30:00Z"
      }
    ],
    "total": 100,
    "page": 1,
    "page_size": 20
  }
}
```

---

## 五、FAQ沉淀条件

### 5.1 判断逻辑

```javascript
const faq_eligible = (
  is_correct === true &&           // 主管认为正确
  should_store === true &&         // 主管认为应沉淀
  problem_type !== '无问题（正确回复）'  // 确实有问题需要沉淀
);
```

### 5.2 标记方式

- `knowledge_id = 'pending_faq'` → 标记为待沉淀
- 后续由FAQ沉淀服务处理，生成正式knowledge_id
- `knowledge_id = NULL` → 不沉淀

### 5.3 后续FAQ沉淀流程（Phase 3）

```
1. 查询 reviews 表中 knowledge_id='pending_faq' 的记录
2. 调用 knowledge-service 生成FAQ
3. 更新 knowledge_id 为正式ID（如 'kb_xxx'）
4. FAQ进入知识库，可供查询
```

---

## 六、实现步骤

### Phase 1：打标服务（本次）

#### 6.1.1 创建 `services/tagging-service.js`

**职责：**
- 打标数据验证
- 打标结果入库
- FAQ沉淀条件判断

**核心方法：**
```javascript
class TaggingService {
  // 提交打标结果
  async submitTag(data) {
    // 1. 验证字段
    // 2. 判断faq_eligible
    // 3. 写入reviews表
    // 4. 返回结果
  }
  
  // 查询打标记录
  async getTaggedRecords(filters, pagination) {
    // 1. 查询reviews表（review_status='tagged'）
    // 2. 分页
    // 3. 返回结果
  }
  
  // 判断是否可沉淀FAQ
  isFaqEligible(isCorrect, shouldStore, problemType) {
    return isCorrect === true && 
           shouldStore === true && 
           problemType !== '无问题（正确回复）';
  }
}
```

#### 6.1.2 创建 `api/tagging-api.js`

**路由：**
- `POST /review/tag` - 提交打标
- `GET /review/tagged-records` - 查询打标记录

**注册到live-monitor-api.js：**
```javascript
const taggingRouter = require('./tagging-api');
app.use('/review', taggingRouter);
```

#### 6.1.3 修改Repository

**reviews-repository.js 新增方法：**
```javascript
// 创建打标记录
async createTaggingReview(data) {
  // INSERT INTO reviews ...
}

// 查询打标记录
async findTaggedRecords(filters, pagination) {
  // SELECT * FROM reviews WHERE review_status='tagged' ...
}
```

---

### Phase 2：前端打标页面（后续）

**不在此次执行范围内**，仅记录需求：

1. ⏸️ 创建打标表单UI
2. ⏸️ 对接打标API
3. ⏸️ 展示真实对话+分析结果
4. ⏸️ 问题类型下拉选择
5. ⏸️ 标记"是否沉淀FAQ"

---

### Phase 3：FAQ沉淀对接（后续）

**不在此次执行范围内**，仅记录需求：

1. ⏸️ 从reviews表查询 `knowledge_id='pending_faq'`
2. ⏸️ 调用knowledge-service生成FAQ
3. ⏸️ 更新 `knowledge_id` 为正式ID
4. ⏸️ FAQ进入知识库

---

## 七、不碰的边界（严格遵守）

| 不碰 | 原因 |
|------|------|
| ❌ 评分系统 | 不打扰evaluations表的score字段 |
| ❌ 历史正文补齐 | 暂停这条线（等待上游数据） |
| ❌ 校准模型 | 不修改ai-evaluator逻辑 |
| ❌ 审核流原有逻辑 | 不修改approve/modify_and_approve/reject |
| ❌ 知识库生成逻辑 | 本次只标记pending_faq，不生成正式FAQ |
| ❌ 前端UI | 本次只做后端API |

---

## 八、完成标准

### 8.1 功能标准

- [ ] 打标接口可正常调用（POST /review/tag）
- [ ] 5个最小字段全部入库
- [ ] `is_correct=true + should_store=true` 的数据标记为 `knowledge_id='pending_faq'`
- [ ] 打标记录可查询（GET /review/tagged-records）
- [ ] 不破坏现有审核流功能（tasks / detail / submit / records / stats）

### 8.2 测试标准

- [ ] 自动化测试覆盖打标接口
- [ ] 验证规则测试（必填字段、枚举值、逻辑约束）
- [ ] FAQ沉淀条件判断测试
- [ ] 回归测试：现有审核接口正常

### 8.3 验收标准

- [ ] 打标成功后，reviews表数据正确
- [ ] `knowledge_id='pending_faq'` 标记正确
- [ ] 打标记录查询接口返回正确
- [ ] 接口文档完整

---

## 九、文件清单

### 9.1 新增文件

| 文件 | 说明 | 行数 |
|------|------|------|
| `services/tagging-service.js` | 打标服务 | ~150行 |
| `api/tagging-api.js` | 打标路由 | ~80行 |
| `tests/test-tagging-api.js` | 打标接口测试 | ~200行 |
| `docs/supervisor-minimal-tagging-plan.md` | 本文档 | - |

### 9.2 修改文件

| 文件 | 修改内容 |
|------|---------|
| `repositories/reviews-repository.js` | 新增createTaggingReview、findTaggedRecords方法 |
| `services/live-monitor-api.js` | 注册tagging路由 |

---

## 十、风险评估

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| reviews表字段不足 | 无法存储打标结果 | 提前确认字段映射 |
| 与现有审核流冲突 | 破坏已有功能 | 新状态和动作独立命名 |
| FAQ沉淀逻辑未实现 | pending_faq无法流转 | Phase 3补充 |
| 前端未实现 | 无法实际使用 | 本次只做后端 |

---

## 十一、后续扩展（不在本次范围）

| 扩展 | 说明 | 优先级 |
|------|------|--------|
| 多选问题类型 | 一条消息可能有多个问题 | P2 |
| 批量打标 | 一次标记多条 | P2 |
| 打标模板 | 预设常用打标组合 | P3 |
| 打标统计 | 按主管/问题类型统计 | P2 |
| FAQ自动生成 | pending_faq自动转正式FAQ | P1 |

---

## 十二、执行指令

**严格按本执行单推进：**

1. ✅ 创建 `services/tagging-service.js`
2. ✅ 创建 `api/tagging-api.js`
3. ✅ 修改 `repositories/reviews-repository.js`
4. ✅ 注册路由到 `services/live-monitor-api.js`
5. ✅ 创建 `tests/test-tagging-api.js`
6. ✅ 运行测试，确认通过

**不做的：**
- ❌ 不碰评分系统
- ❌ 不碰历史正文补齐
- ❌ 不碰校准模型
- ❌ 不碰前端UI
- ❌ 不碰FAQ生成逻辑

---

**下一步：等待用户确认后开始执行。**
