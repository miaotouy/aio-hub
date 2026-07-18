# Knowledge（知识资料库）架构说明

Knowledge 是 AIO Hub 的文档资料与来源回溯领域，与 Recall 思绪领域独立持久化、独立绑定和独立检索。它面向 PDF、DOCX、HTML、Markdown、代码与文本资料，基本单元是 `document + chunk + source`，不承载 Recall entry、标签池、priority 或联想召回状态。

详细产品与交互方案见 [Knowledge 资料库产品与交互设计](./docs/Plan/knowledge-base-product-interaction-design.md)。

## 1. 存储与索引

- `knowledge/knowledge_meta.db` 保存 library manifest、schema migration、当前 Embedding space、显式调用 route 与维度摘要。
- `knowledge/libraries/{libraryId}.kdb` 是每库独立的 SQLite 文件，包含 document、chunk、FTS5、`embedding_spaces`、按 `space_id` 隔离的 chunk vector 和相邻 chunk graph edge。
- library 文件采用 UUID 路径约束；删除先隔离为 tombstone，再删除 manifest，失败时恢复文件。
- 文档以 `sourcePath` 为稳定键。重复导入在单事务中替换 document、chunk、FTS、向量和图边。
- `knowledge_get_index_status` 从数据库实时计算当前 `space_id` 的向量覆盖率，不把 UI 缓存当作真源。`embedding_route_key` 只负责调用路由，旧 `model_id` 向量会事务迁移为逐 route 隔离的 legacy space，不按名称自动合并。
- 同 descriptor 的模型 route 可由用户确认后只切换 `embedding_route_key`；不同 identity 或请求契约会生成新 `space_id` 并独立保留向量。
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

- Agent 使用 `knowledgeAccess` 保存 `enabled`、稳定 `allowedLibraryIds`、`allowSearchAll`、`allowDocumentRead` 和 `allowResearch`。
- `access.ts` 是共享授权解析边界，负责 ID 去重、默认值、查询范围校验、越权错误、已删除/暂不可用状态和目录格式。宏、Knowledge 工具、Chat 显式引用与 Agent Manager 必须复用该边界。
- `{{knowledge_list}}` 在用户指定的预设位置展开授权资料库目录，只读取摘要，不执行检索；宏缺失时不自动注入。名称和状态从资料库真源实时解析，持久化只保存 ID。
- 不注册 `{{knowledge}}` 或 `【knowledge::...】`，上下文管道也没有 Knowledge processor。普通消息和 Agent 授权不会触发 Knowledge 检索。
- 独立的 `knowledge.listLibraries`、`knowledge.search`、`knowledge.read` 是后续原子工具入口；现有 Retrieval 上层组合能力不替代工具层权限校验。
- mixed 检索只属于上层显式编排，先保留 Recall 与 Knowledge 的分域配额，再使用 RRF 融合，不直接比较两域原始分数。

## 5. 后续施工顺序

后续以 `docs/Plan/knowledge-base-implementation-checklist.md` 为唯一施工清单：先完成独立 Knowledge 原子工具和 Chat 结构化显式引用，再补齐配置分层、持久 ingest queue、目录同步、原子版本替换、诊断工作台和二阶研究任务。真实路径、模型调用与恢复行为必须在隔离 appData 的 Tauri WebView 中验收。
