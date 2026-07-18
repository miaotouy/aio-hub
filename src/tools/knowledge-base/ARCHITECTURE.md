# Knowledge（知识资料库）架构说明

Knowledge 是 AIO Hub 的文档资料与来源回溯领域，与 Recall 思绪领域独立持久化、独立绑定和独立检索。它面向 PDF、DOCX、HTML、Markdown、代码与文本资料，基本单元是 `document + chunk + source`，不承载 Recall entry、标签池、priority 或联想召回状态。

详细产品与交互方案见 [Knowledge 资料库产品与交互设计](./docs/Plan/knowledge-base-product-interaction-design.md)。

## 1. 存储与索引

- `knowledge/knowledge_meta.db` 保存 library manifest、schema migration、Embedding 模型与维度。
- `knowledge/libraries/{libraryId}.kdb` 是每库独立的 SQLite 文件，包含 document、chunk、FTS5、chunk vector 和相邻 chunk graph edge。
- library 文件采用 UUID 路径约束；删除先隔离为 tombstone，再删除 manifest，失败时恢复文件。
- 文档以 `sourcePath` 为稳定键。重复导入在单事务中替换 document、chunk、FTS、向量和图边。
- `knowledge_get_index_status` 从数据库实时计算当前模型键的向量覆盖率，不把 UI 缓存当作真源。当前实现仍以 `profileId:modelId` 作为路由与向量分区的过渡键，旧裸 `modelId` 保持读取兼容；该耦合已确认需要按 [模型身份与 Embedding 空间设计](../../../docs/design/model-identity-and-embedding-space-design.md) 拆分，设计完成但尚未实施。
- `rebuild_library` 重新切分全部文档并清除当前语义索引配置，避免旧向量与新 chunk 混用。

当前运行路径使用 SQLite + FTS5。TriviumDB 的跨平台文件组、锁和恢复验证完成前不进入运行路径。

## 2. 前端边界

- `KnowledgeBase.vue` 是资料库工作台，提供 library CRUD、批量文件导入、文档与分块主从浏览、索引状态、检索测试和来源展示。
- `components/KnowledgeVectorDialog.vue` 提供 Embedding 模型选择、覆盖率、批次进度、模型切换确认和失败后重试。
- `fileParser.ts` 复用现有 PDF、DOCX、HTML 与文本解析能力，不将二进制文档交给 Rust 猜测格式。
- `service.ts` 是唯一 IPC 边界；`store.ts` 管理 library、document、chunk、result 与 index status 运行态。
- Embedding 模型选项由共享 `useEmbeddingModelOptions()` 提供，Knowledge 不复制模型能力判断。
- 批量导入以文件为失败隔离单元。成功文件立即保留，失败项汇总提示，可重新选择重试。

Knowledge 前端不导入 Recall store、entry、priority、tag pool 或 workspace。

## 3. 检索策略

- `keyword`：只使用 BM25，导入后立即可用。
- `semantic`：只使用当前 library manifest 指定模型的 chunk vector。
- `hybrid`：融合 BM25 与 vector，并允许相邻 chunk graph 扩展。
- `auto`：有可用 query vector 时走 hybrid，否则退化为 BM25。

结果必须保留 `libraryId`、`documentId`、`sourcePath`、`chunkIndex`、`heading`、`sourceType = knowledge` 和命中 signals。UI 展示原始相关度与信号类型，不将不同策略的分数伪装为统一百分比。

## 4. Chat 与 Agent

- Agent 使用 `knowledgeConfig`、稳定 `libraryId` binding 和独立 `knowledgeSettings`。
- 占位符只接受 `library`、`strategy`、`limit`、`min-score`、`when=always`、`citation`。
- `{{knowledge}}` / `{{knowledge_list}}` 与 `【knowledge::key=value】` 只指向文档资料库。
- 主动检索通过 retrieval registry 的 `knowledge` / `mixed` 路由进入统一工具调用链。
- mixed 检索先保留 Recall 与 Knowledge 的分域配额，再使用 RRF 融合，不直接比较两域原始分数。

## 5. 下一阶段

目录同步不是本轮已完成能力。需要时按以下顺序引入：

1. source root 与 include/exclude 规则。
2. debounced 原生 watcher，包含文件稳定性检查。
3. 持久化 ingest queue，状态为 pending、processing、failed、completed，并支持 lease 恢复与有限重试。
4. 工作台增加“来源”视图和失败任务检查器。
5. 在隔离 appData、真实目录副本和 Tauri WebView 中完成增删改、崩溃恢复与模型切换验收。
