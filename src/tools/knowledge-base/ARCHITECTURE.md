# Knowledge（知识资料库）架构说明

Knowledge 是 AIO Hub 的文档资料与来源回溯领域。当前处于 Recall / Knowledge 拆分计划 Stage 1 的模块空壳阶段，仅提供 `/knowledge-base` 产品入口，不包含文档导入、切片、索引或检索实现。

## 当前边界

- `knowledge-base.registry.ts` 只注册 Knowledge UI，不暴露 Agent 工具。
- `KnowledgeBase.vue` 只展示占位状态，不导入 Recall store、service、action 或 entry 类型。
- `src-tauri/src/knowledge.rs` 不注册 command，也不持有 `RecallState`。
- 当前旧 `appData/knowledge/` 目录仍由 Recall 的迁移期 IO 使用，不属于 Knowledge 新领域的运行时实现。

## 目标能力

后续阶段将在该边界内独立实现：

- document、chunk、source 与 library 数据模型。
- 文件导入、解析、切片、增量同步和来源回溯。
- BM25、向量与图关系索引。
- `knowledge` 检索策略、稳定 library ID binding 及独立占位符协议。

Knowledge 不得写入 `RecallEntry`、复用 Recall priority 或 tag pool，也不得通过导入 Recall store 临时模拟文档资料库。

## 计划与验证

施工顺序、目标存储和跨域检索契约见 `../recall/docs/Plan/recall-knowledge-domain-restructure-implementation-plan.md`。在 Knowledge 实现落地前，变更必须保持空壳可编译、无 Rust command、无 Recall 业务依赖。
