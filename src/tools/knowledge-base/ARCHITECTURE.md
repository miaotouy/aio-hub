# Knowledge（知识资料库）架构说明

Knowledge 是 AIO Hub 的文档资料与来源回溯领域，与 Recall 思绪领域独立持久化、独立绑定和独立检索。

## 存储

- `knowledge/knowledge_meta.db` 保存 library manifest、schema migration、embedding 模型与维度。
- `knowledge/libraries/{libraryId}.kdb` 是每库独立的 SQLite 文件，包含 document、chunk、FTS5、chunk vector 和相邻 chunk graph edge。
- library 文件采用 UUID 路径约束；删除先隔离为 tombstone，再删除 manifest，失败时恢复文件。
- 文档增量导入以 `sourcePath` 为稳定键，在单事务中替换 chunk、FTS、向量和图边。

当前使用计划允许的 SQLite + FTS5 过渡实现。TriviumDB 的跨平台文件组、锁和恢复验证完成前，不进入运行路径。

## 前端

- `KnowledgeBase.vue` 提供 library CRUD、文件导入、文档删除、重建、搜索和来源展示。
- `fileParser.ts` 复用现有 PDF、DOCX、HTML 与文本解析能力，不将二进制文档交给 Rust 猜测格式。
- `service.ts` 是唯一 IPC 边界；`store.ts` 只维护 Knowledge library/document 状态。
- `vectorizeKnowledgeLibrary()` 已提供通过共享 embedding API 批量向量化 chunk 的服务能力。Knowledge 前端交互设计和产品化向量化入口按 2026-07-17 决策暂时跳过；恢复施工前不能把该服务能力描述为用户可操作闭环。已有 embedding 模型的资料库在 `auto` 检索时生成 query vector 并使用 hybrid，否则退化为 BM25。

Knowledge 前端不导入 Recall store、entry、priority、tag pool 或 workspace。

## Chat 与 Agent

- Agent 使用 `knowledgeConfig`、稳定 `libraryId` binding 和独立 `knowledgeSettings`。
- 占位符只接受 `library`、`strategy`、`limit`、`min-score`、`when=always`、`citation`。
- `{{knowledge}}` / `{{knowledge_list}}` 只生成 canonical `【knowledge::key=value】`，不接受位置参数。
- 检索结果携带 `sourceType=knowledge`、library、source path、document、chunk index、heading、signals 和 score。

## 跨域路由

`src/services/retrievalRouter.ts` 提供主动 `recall | knowledge | mixed` 路由，`src/tools/retrieval/retrieval.registry.ts` 将其注册为实际 Agent 工具调用入口。mixed 先截取 Recall / Knowledge 分域配额，再按 RRF 融合；原始分数仅保留在 trace 中，不参与跨域比较。

## 验证边界

自动测试覆盖 library/document/chunk 往返、增量覆盖、删除级联、向量库隔离、BM25/semantic、来源回溯、严格占位符、未授权 library 和 mixed RRF。真实 Tauri 文件对话框、PDF worker、WebView 和独立 appData smoke test 保留为发布前人工门槛。
