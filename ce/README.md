# CE 目录 - 实验性功能 (Community Edition / Experimental)

## 目录定位
本目录包含**实验性功能**和**独立工具脚本**，这些功能：
1. 尚未完全集成到主业务流程
2. 作为独立脚本运行，不参与主链路
3. 可能在未来迁移到正式模块或废弃

## 与正式模块的关系
| ce/ 文件 | 对应正式模块 | 状态 |
|---------|------------|------|
| `alert-router.js` | `core/alert-router.js` | 已迁移到 core，待删除 |
| `training-workbench.js` | `core/training-workbench.js` | 已迁移到 core，待删除 |
| `show-training-workbench.js` | 脚本工具 | 保留（调试用） |
| `shadow-run-daily.js` | `scripts/shadow-run-daily.js` | 已复制到 scripts，待删除 |
| `shadow-run-review.js` | `scripts/shadow-run-review.js` | 已复制到 scripts，待删除 |
| `training-queue-processor.js` | `scripts/training-queue-processor.js` | 已复制到 scripts，待删除 |

## 文档说明
- `README.md` - 本文件
- `shadow-run-guide.md` - 影子运行指南（参考文档）
- `supervisor-decision-card.md` - 主管决策卡片说明（参考文档）

## TODO: 清理计划
以下文件已迁移到正式模块，应在确认无引用后删除：
- [ ] `alert-router.js` (已迁移到 core/)
- [ ] `training-workbench.js` (已迁移到 core/)
- [ ] `shadow-run-daily.js` (已复制到 scripts/)
- [ ] `shadow-run-review.js` (已复制到 scripts/)
- [ ] `training-queue-processor.js` (已复制到 scripts/)

## 职责边界
### CE 目录应该包含：
1. 实验性功能原型
2. 独立运行的调试工具
3. 参考文档和示例

### CE 目录不应该包含：
1. 已迁移到正式模块的代码（应删除）
2. 主业务流程代码（应放在 core/ 或 services/）
3. 生产环境使用的功能（应放在正式模块）
