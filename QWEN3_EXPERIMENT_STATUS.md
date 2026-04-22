# QWEN3_EXPERIMENT_STATUS

# 阶段标签
- status: STAGE_REPORT_ONLY
- line: MAIN_EXPERIMENT_LINE
- stage: CURRENT_STAGE_TARGET
- production: false

---

## 1. 当前阶段目标 (CURRENT_STAGE_TARGET)

- 基于 qwen3:4b 的本地质量评估实验支线
- 已完成：
  - JSON 输出验证（qwen3-json-utils.js）
  - 请求机制矩阵验证（test-qwen3-request-matrix.js）
  - adapter 封装（qwen3-adapter.js）
  - 灰度路由设计与测试（qwen3-gray-route.js + test-qwen3-gray-route.js）
  - 实验线标签体系建设（所有 qwen3-* 文件统一标记）
- 未做：
  - 真实生产灰度
  - 全量接入
  - live_monitor 接入

**当前位置：**
```
模型验证 ✓ → 请求机制 ✓ → adapter ✓ → 灰度设计 ✓ → 灰度测试脚本 ✓ → 标签体系 ✓
  ↓
下一步：最小接入验证（进行中）
```

---

## 2. 主实验线 (MAIN_EXPERIMENT_LINE)

### 代码模块
- `services/local-model/qwen3-json-utils.js` - JSON 输出适配工具
- `services/local-model/qwen3-adapter.js` - Qwen3 adapter 封装
- `services/local-model/qwen3-gray-route.js` - 灰度路由模块

### 测试脚本
- `scripts/test-qwen3-local.js` - JSON 输出隔离验证
- `scripts/test-qwen3-request-matrix.js` - 请求机制矩阵验证
- `scripts/test-qwen3-adapter.js` - adapter 隔离验证
- `scripts/test-qwen3-gray-route.js` - 灰度路由测试

### 输出目录
- `scripts/output/qwen3-local-test/`
- `scripts/output/qwen3-request-matrix/`
- `scripts/output/qwen3-adapter-test/`
- `scripts/output/qwen3-gray-route-test/`

---

## 3. 实验态模块 (EXPERIMENTAL_MODULE)

**范围：**
- 所有 `qwen3-*` 代码文件
- 所有 `test-qwen3-*` 测试脚本
- 所有 `scripts/output/qwen3-*` 输出目录

**约束：**
- ❌ 不可直接接入主链路
- ✅ 必须通过灰度开关使用
- ✅ 必须具备 fallback 回退机制
- ✅ 必须标记为 `@production false`

**标签规范：**

代码文件：
```javascript
/**
 * @status EXPERIMENTAL_MODULE
 * @line MAIN_EXPERIMENT_LINE
 * @stage CURRENT_STAGE_TARGET
 * @production false
 * @scope qwen3 local experiment only
 */
```

测试脚本：
```javascript
#!/usr/bin/env node
/**
 * @script test-qwen3-xxx
 * @status EXPERIMENTAL_MODULE
 * @line MAIN_EXPERIMENT_LINE
 * @report STAGE_REPORT_ONLY
 * @production false
 */
```

---

## 4. 阶段报告 (STAGE_REPORT_ONLY)

**范围：**
- 所有 `summary.md` / `summary.json` 文件
- 所有验证报告 / 完成报告
- 所有 `scripts/output/qwen3-*/` 目录下的报告

**说明：**
- 📌 仅记录阶段结果
- 📌 不作为长期设计基线
- 📌 可能随实验进展被更新或废弃

**已生成的报告：**
- `scripts/output/qwen3-gray-route-test/gray-route-test-summary.md` - 灰度路由测试报告
- `scripts/output/qwen3-adapter-test/` - adapter 验证报告
- `scripts/output/qwen3-request-matrix/` - 请求机制验证报告

---

## 5. 后续路径

**当前阶段：** 最小接入验证

**后续步骤（按顺序）：**
1. ✅ 最小接入验证（当前）- 在测试入口验证可控性
2. ⬜ 小范围灰度 - 可控入口，观察数据
3. ⬜ 扩大灰度范围 - 基于成功率 / fallback / 风险数据
4. ⬜ 主链路接入 - 最终决策

**禁止事项：**
- ❌ 不要全量接入
- ❌ 不要接 live_monitor
- ❌ 不要让真实用户数据走 qwen3
- ❌ 不要跳过最小接入验证直接"上线试试"

---

## 6. 验收状态

| 模块 | 状态 | 验收时间 |
|------|------|---------|
| qwen3-json-utils.js | ✅ 通过 | 2026-04-22 |
| qwen3-adapter.js | ✅ 通过 | 2026-04-22 |
| qwen3-gray-route.js | ✅ 通过 | 2026-04-22 |
| 灰度路由测试 | ✅ 通过 (8/8) | 2026-04-22 |
| 标签体系 | ✅ 通过 (7/7) | 2026-04-22 |
| 最小接入验证 | ✅ 通过 (4/4) | 2026-04-22 |

---

**最后更新：** 2026-04-22  
**维护者：** Qwen3 实验线团队  
**文档性质：** 阶段报告（STAGE_REPORT_ONLY）
