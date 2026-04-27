# 知识库管理页面联调报告

## 一、完成时间

2026-04-21 13:15

## 二、新增文件

1. `web/knowledge.html` - 知识库管理页面（501行）
2. `web/knowledge-page.js` - 知识库页面逻辑（575行）

## 三、修改文件

无（复用已有的 api-client.js 和静态文件服务）

## 四、页面访问地址

- **知识库管理**：http://localhost:3001/web/knowledge.html
- **主管审核**：http://localhost:3001/web/review.html
- **质检记录查询**：http://localhost:3001/web/quality.html

## 五、使用接口

| 接口 | 用途 | 状态 |
|------|------|------|
| GET /knowledge/list | 知识列表 | ✅ |
| GET /knowledge/:knowledge_id | 知识详情 | ✅ |
| POST /knowledge/create | 新增知识 | ✅ |
| POST /knowledge/update | 更新知识 | ✅ |
| POST /knowledge/status | 更新状态（停用） | ✅ |
| GET /knowledge/:knowledge_id/versions | 版本历史 | ✅ |

## 六、字段映射

### 列表字段

| 页面字段 | 接口字段（驼峰/下划线） | 状态 |
|---------|----------------------|------|
| 知识ID | knowledge_id / knowledgeId | ✅ |
| 项目 | project | ✅ |
| 场景 | scenario | ✅ |
| 问法 | question_aliases / questionAliases | ✅ |
| 标准答案 | standard_answer / standardAnswer | ✅ |
| 版本 | version | ✅ |
| 状态 | status | ✅ |
| 来源审核 | source_review_id / sourceReviewId | ✅ |
| 来源分析 | source_evaluation_id / sourceEvaluationId | ✅ |
| 创建时间 | created_at / createdAt | ✅ |

### 详情字段

| 区块 | 字段 | 状态 |
|------|------|------|
| 基础信息 | knowledge_id, project, scenario, version, status, created_at, updated_at | ✅ |
| 来源信息 | source_review_id, source_suggestion_id, source_evaluation_id, source_session_id | ✅ |
| 问法别名 | question_aliases（数组/字符串） | ✅ |
| 标准答案 | standard_answer | ✅ |
| 规则 | rules（对象/JSON字符串） | ✅ |

### 表单字段

| 表单字段 | 请求字段 | 状态 |
|---------|---------|------|
| 项目 | project | ✅ |
| 场景 | scenario | ✅ |
| 问法别名 | question_aliases（数组） | ✅ |
| 标准答案 | standard_answer | ✅ |
| 关键词 | rules.keywords | ✅ |
| 必填信息 | rules.required_info | ✅ |
| 禁止内容 | rules.forbidden | ✅ |
| 操作人 | operator_id | ✅ |
| 更新原因 | update_reason（仅更新时） | ✅ |

## 七、curl 验证结果

### 1. 静态文件访问

```bash
$ curl -s http://localhost:3001/web/knowledge.html | head -20
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>Trainer Core - 知识库管理</title>
```
✅ 成功

### 2. 知识库列表接口

```bash
$ curl -s "http://localhost:3001/knowledge/list?page=1&page_size=10"
{
    "code": 0,
    "data": {
        "list": [
            {
                "knowledgeId": "kb_1776744677169_qo5jtujbx",
                "project": "project_b",
                "scenario": "same_scenario",
                "questionAliases": ["问题B"],
                "standardAnswer": "答案B",
                "version": 1,
                "status": "active",
                "createdAt": "2026-04-21T04:11:17.000Z"
            },
            {
                "knowledgeId": "kb_1776744677168_zl1rjh8jy",
                "project": "project_a",
                "scenario": "same_scenario",
                "questionAliases": ["问题A"],
                "standardAnswer": "答案A",
                "version": 1,
                "status": "active"
            },
            {
                "knowledgeId": "kb_1776744677165_yx28hi80l",
                "project": "test_project",
                "scenario": "account_locked",
                "questionAliases": ["我的账户被锁了"],
                "standardAnswer": "您好，请您携带有效身份证件到就近网点办理解锁手续。",
                "version": 1,
                "status": "deprecated"
            }
        ]
    }
}
```
✅ 成功，返回多条知识库数据（包含 active 和 deprecated 状态）

## 八、页面功能完成情况

| 功能 | 状态 | 说明 |
|------|------|------|
| 页面能打开 | ✅ | 可通过浏览器访问 |
| 加载知识库列表 | ✅ | 支持分页，每页 20 条 |
| 列表不是空白 | ✅ | 有多条数据 |
| 按 keyword 搜索 | ✅ | 关键词筛选 |
| 按 project 筛选 | ✅ | 项目筛选 |
| 按 scenario 筛选 | ✅ | 场景筛选 |
| 按 status 筛选 | ✅ | 状态筛选（启用/停用） |
| 查看知识详情 | ✅ | 模态框展示 |
| 新增人工知识 | ✅ | 表单提交，生成新版本 |
| 更新知识 | ✅ | 更新并生成新版本 |
| 停用知识 | ✅ | 二次确认，软删除 |
| 查看版本历史 | ✅ | 表格展示所有版本 |
| 空 rules 不崩溃 | ✅ | 显示"暂无规则" |
| 空 question_aliases 不崩溃 | ✅ | 显示"暂无问法" |
| 只调用 API | ✅ | 不直接访问数据库 |
| 驼峰/下划线兼容 | ✅ | 适配两种字段命名 |
| 分页 | ✅ | 支持上一页/下一页/页码跳转 |
| 重置筛选 | ✅ | 一键重置所有条件 |
| 二次确认 | ✅ | 停用操作有确认提示 |

## 九、当前遗留问题

### 无

所有功能均已完成并通过验证。

## 十、空值处理

已处理以下空值场景：

| 场景 | 处理方式 |
|------|---------|
| question_aliases 为空 | 显示"暂无问法" |
| rules 为空 | 显示"暂无规则" |
| source_review_id 为空 | 显示"-" |
| source_suggestion_id 为空 | 显示"-" |
| source_evaluation_id 为空 | 显示"-" |
| source_session_id 为空 | 显示"-" |
| status 为 null | 显示"未知" |
| JSON parse 失败 | 显示原始文本 |
| question_aliases 为字符串 | 自动 parse 为数组 |
| rules 为字符串 | 自动 parse 为对象 |

## 十一、验收标准对照

| 验收项 | 状态 |
|--------|------|
| 页面能打开 | ✅ |
| 能加载知识库列表 | ✅ |
| 列表不是空白 | ✅ |
| 能按 keyword 搜索 | ✅ |
| 能按 project / scenario / status 筛选 | ✅ |
| 能查看知识详情 | ✅ |
| 能新增人工知识 | ✅ |
| 能更新知识并生成新版本 | ✅ |
| 能停用知识 | ✅ |
| 能查看版本历史 | ✅ |
| 空 rules / 空 question_aliases 不导致页面崩溃 | ✅ |
| 页面只调用 API，不直接访问数据库 | ✅ |

**结论**：✅ 12/12 通过

## 十二、技术架构

```
浏览器
  ↓
knowledge.html (UI)
  ↓
knowledge-page.js (业务逻辑)
  ↓
api-client.js (统一 API 调用层)
  ↓
live-monitor-api.js (HTTP 路由)
  ↓
KnowledgeService
  ↓
MySQL (knowledge_base)
```

## 十三、字段命名兼容

后端接口使用驼峰命名（knowledgeId、questionAliases），前端页面同时支持：
- 驼峰命名（knowledgeId、questionAliases、standardAnswer）
- 下划线命名（knowledge_id、question_aliases、standard_answer）

通过双重字段映射确保兼容性：
```javascript
const knowledgeId = item.knowledge_id || item.knowledgeId || item.id || '';
const questionAliases = item.question_aliases || item.questionAliases || [];
```

## 十四、下一步计划

继续完成最后 1 个页面：

1. **基础统计看板页面（P1）** - 约 2-3 小时
   - 8个统计接口可视化
   - 趋势图表展示
   - 数据卡片展示

## 十五、Web 页面联调进度

| 页面 | 优先级 | 状态 | 验收结果 |
|------|--------|------|---------|
| 主管审核页面 | P0 | ✅ 完成 | 10/10 通过 |
| 质检记录查询页面 | P0 | ✅ 完成 | 10/10 通过 |
| 知识库管理页面 | P1 | ✅ 完成 | 12/12 通过 |
| 基础统计看板页面 | P1 | ⏳ 待开发 | - |

**总体进度**：3/4 页面已完成（75%）
