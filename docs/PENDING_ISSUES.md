# 后续问题清单（不阻塞主线）

**生成时间**: 2026-04-16  
**状态**: 📝 已记录，等待后续处理  

---

## 一、高优先级问题（建议下一阶段处理）

### 1. scenarioName显示不匹配

**问题描述**: 
- 输入场景：`lanton_bank_transfer`（LantonPay银行转账指引）
- 输出显示：`转账成功但对方未到账`（另一个场景）

**影响**: 
- 训练反馈的场景名称不准确
- 用户可能困惑当前评估的是哪个场景

**可能原因**:
- scenario-loader的场景匹配逻辑有问题
- trainer.js或analysis-pipeline中scenarioId传递错误
- normalizeResult中scenarioName取值逻辑错误

**建议修复位置**:
- `core/scenario-loader.js` - 场景匹配逻辑
- `services/evaluation-service.js` normalizeResult() - scenarioName取值

**优先级**: 🔴 高  
**阻塞性**: 不阻塞主线，但影响用户体验

---

### 2. MySQL Repository未就绪

**问题描述**: 
```
[AlertRouter] 创建 training review 失败: RepositoryFactory.getMySQLRepositories is not a function
```

**影响**: 
- 训练记录无法保存到数据库
- review功能不可用
- 训练统计功能不可用

**当前状态**: 
- 告警路由已触发（training_queue）
- 但Repository创建失败（非阻塞错误）

**建议方案**:
- 方案A：实现MySQL Repository（需要数据库环境）
- 方案B：添加File-based Repository作为fallback
- 方案C：暂时禁用review创建，仅记录日志

**优先级**: 🔴 高  
**阻塞性**: 不阻塞训练评估，但阻塞数据持久化

---

## 二、中优先级问题（后续优化）

### 3. 告警路由日志混乱

**问题描述**: 
```
[AlertRouter] undefined 模式告警已禁用
```

**影响**: 
- 日志不清晰，难以调试
- 可能掩盖真实问题

**可能原因**: 
- `params.metadata?.entry_type` 在某些路径下为undefined
- routeAlert函数的防御性编程不足

**建议修复**:
```javascript
async function routeAlert(result, params) {
  const entryType = params.metadata?.entry_type;
  if (!entryType) {
    console.warn('[AlertRouter] entry_type 未定义，跳过告警路由');
    return;
  }
  // ...
}
```

**优先级**: 🟡 中  
**阻塞性**: 不阻塞功能

---

### 4. createErrorResult仍使用旧字段

**问题描述**: 
- 错误结果仍包含`projectId`, `mode`, `sessionId`, `employeeId`等旧字段
- 与标准协议不一致

**影响**: 
- 仅在错误场景下出现
- 正常流程不受影响

**建议修复**: 
- 统一改为`project`, `entry_type`, `session_id`, `agent_id`

**优先级**: 🟡 中  
**阻塞性**: 不阻塞主线（错误路径）

---

### 5. evaluateConversation未迁移

**问题描述**: 
- `evaluateConversation()` 函数仍使用旧协议（projectId, mode）
- 与`evaluate()`不一致

**影响**: 
- 多轮对话评估功能使用旧协议
- 当前TG训练链路不使用此函数

**建议修复**: 
- 按需迁移到标准协议
- 或标记为deprecated

**优先级**: 🟡 中  
**阻塞性**: 不阻塞主线（当前未使用）

---

### 6. checkAlerts使用旧结构

**问题描述**: 
```javascript
const level = result.result?.level || 'fail';
```

**影响**: 
- `result.result` 现在是字符串（pass/borderline/fail/risk）
- 不再是对象 `{level, issues, missing, nextAction}`
- 此行代码可能始终返回'fail'

**建议修复**: 
```javascript
const level = typeof result.result === 'string' ? result.result : (result.result?.level || 'fail');
```

**优先级**: 🟡 中  
**阻塞性**: 可能影响告警判断逻辑

---

## 三、低优先级问题（后续优化）

### 7. scenarioId传递路径不清晰

**问题描述**: 
- scenarioId存储在`metadata.scenarioId`
- 但analyzeTurn可能期望在顶层或其他位置

**影响**: 
- 场景加载可能失败
- 需要确认scenario-loader的读取逻辑

**建议**: 
- 统一scenarioId的传递路径
- 在协议文档中明确说明

**优先级**: 🟢 低  
**阻塞性**: 当前可工作，但需确认

---

### 8. 默认fallback逻辑缺失

**问题描述**: 
- formatter.js中当issues/strengths为空时，没有默认提示
- 用户可能看到空白区域

**影响**: 
- 用户体验不佳

**建议修复**: 
```javascript
if (result.issues && result.issues.length > 0) {
  // 显示问题项
} else {
  lines.push('*✅ 无明显问题*');
  lines.push('回复质量良好，继续保持！');
  lines.push('');
}
```

**优先级**: 🟢 低  
**阻塞性**: 不阻塞功能

---

### 9. TG消息长度限制

**问题描述**: 
- Telegram消息有4096字符限制
- 长评估结果可能被截断

**影响**: 
- 用户可能看不到完整反馈

**建议方案**: 
- 检测消息长度，超过限制时分段发送
- 或精简输出格式

**优先级**: 🟢 低  
**阻塞性**: 当前场景未触发

---

### 10. 多轮对话训练支持

**问题描述**: 
- 当前仅支持单轮对话评估（1轮user+1轮agent）
- 无法进行多轮对话训练

**影响**: 
- 训练场景受限

**建议方案**: 
- 扩展session管理，支持多轮对话上下文
- 使用`evaluateConversation()`而非`evaluate()`

**优先级**: 🟢 低  
**阻塞性**: 功能扩展，不阻塞当前

---

## 四、技术债务

### 11. 文件头注释更新

**待更新文件**:
- `services/evaluation-service.js` - 协议版本注释（部分已更新）
- `core/trainer.js` - 已更新为v5.2
- `app/telegram/formatter.js` - 需添加协议版本说明

**优先级**: 🟢 低  

---

### 12. 测试覆盖率

**当前状态**: 
- 核心测试通过（70/70）
- 但evaluation-service的新协议路径缺少专项测试

**建议新增测试**:
- `tests/evaluation-service-protocol.test.js` - 标准协议输入校验
- `tests/evaluation-service-routing.test.js` - 路由分流逻辑
- `tests/evaluation-service-errors.test.js` - 错误处理路径

**优先级**: 🟡 中  

---

## 五、文档更新

### 13. 协议文档完善

**待更新文档**:
- `docs/architecture.md` - 添加标准协议架构图
- `docs/runbook.md` - 更新调用链路说明
- 新增 `docs/PROTOCOL_V1.md` - 标准协议v1.0完整规范

**优先级**: 🟡 中  

---

## 六、总结

### 问题分级统计

| 优先级 | 数量 | 阻塞主线 |
|--------|------|---------|
| 🔴 高 | 2 | ❌ 否 |
| 🟡 中 | 5 | ❌ 否 |
| 🟢 低 | 4 | ❌ 否 |
| **总计** | **11** | **全部不阻塞** |

### 建议处理顺序

1. **下一阶段优先处理**: #1 scenarioName不匹配、#6 checkAlerts旧结构
2. **数据持久化准备**: #2 MySQL Repository
3. **代码质量优化**: #3 日志混乱、#4 错误结果旧字段
4. **功能扩展**: #5 evaluateConversation、#10 多轮对话
5. **用户体验**: #8 fallback逻辑、#9 消息长度
6. **技术债务**: #11 注释、#12 测试、#13 文档

---

**文档生成时间**: 2026-04-16  
**状态**: 📝 已记录，不阻塞主线推进  
**下一步**: 等待用户指示下一条主线任务
