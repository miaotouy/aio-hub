# Knowledge（知识资料库）架构说明

Knowledge 是 AIO Hub 的文档资料与来源回溯领域，与 Recall 思绪领域独立持久化、独立绑定和独立检索。它面向 PDF、DOCX、HTML、Markdown、代码与文本资料，基本单元是 `document + chunk + source`，不承载 Recall entry、标签池、priority 或联想召回状态。

详细产品与交互方案见 [Knowledge 资料库产品与交互设计](./docs/Plan/knowledge-base-product-interaction-design.md)。

## 1. 存储与索引

- `knowledge/knowledge_meta.db` 只保存 library ID、名称、说明、受管文件路径、目录时间戳和 manifest schema migration。它是资料库目录，不是索引配置或活动向量身份的事实来源。
- `knowledge/libraries/{libraryId}.kdb` 是每库独立的 SQLite 文件，包含版本化 `library_metadata`、索引配置快照、活动 Embedding space/route/维度、document、chunk、FTS5、`embedding_spaces`、按 `space_id` 隔离的 chunk vector 和相邻 chunk graph edge。
- library 文件采用 UUID 路径约束；删除先隔离为 tombstone，再删除 manifest，失败时恢复文件。
- 文档以 `sourcePath` 为稳定键。重复导入在单事务中替换 document、chunk、FTS、向量和图边。
- `knowledge_get_index_status` 从 library 数据库实时读取活动空间并计算当前 `space_id` 的向量覆盖率，不把 manifest 或 UI 缓存当作真源。`embedding_route_key` 只负责调用路由，旧 `model_id` 向量会事务迁移为逐 route 隔离的 legacy space，不按名称自动合并。
- 同 descriptor 的模型 route 可由用户确认后只切换 `embedding_route_key`；不同 identity 或请求契约会生成新 `space_id` 并独立保留向量。
- `rebuild_library` 在单个 library WAL 数据库事务内提交配置、重切分全部文档、重建 FTS/graph，并清除旧活动向量身份，避免旧向量与新 chunk 混用。
- 禁止用 WAL 模式下的 `ATTACH` 多数据库事务宣称配置与索引具备崩溃原子性。manifest 摘要若在单库事务提交后更新失败，只能视为可重建缓存过期；运行时仍从 `library_metadata` 读取真值。
- 旧 manifest `config_json` 和活动向量字段只作为一次性迁移输入：首次初始化 library metadata 时写入单库数据库，确认成功后运行时不再读取这些旧字段。迁移必须可重入，进程中断后可从任一已提交状态继续。

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
- `semantic`：只使用当前 library metadata 指定活动空间的 chunk vector。
- `hybrid`：融合 BM25 与 vector，并允许相邻 chunk graph 扩展。
- `auto`：有可用 query vector 时走 hybrid，否则退化为 BM25。

结果必须保留 `libraryId`、`documentId`、`sourcePath`、`chunkIndex`、`heading`、`sourceType = knowledge` 和命中 signals。UI 展示原始相关度与信号类型，不将不同策略的分数伪装为统一百分比。

## 4. Chat 与 Agent

- Agent 使用 `knowledgeAccess` 保存 `enabled`、稳定 `allowedLibraryIds`、`allowSearchAll`、`allowDocumentRead` 和 `allowResearch`。
- `access.ts` 是共享授权解析边界，负责 ID 去重、默认值、查询范围校验、越权错误、已删除/暂不可用状态和目录格式。宏、Knowledge 工具、Chat 显式引用与 Agent Manager 必须复用该边界。
- `{{knowledge_list}}` 在用户指定的预设位置展开授权资料库目录，只读取摘要，不执行检索；宏缺失时不自动注入。名称和状态从资料库真源实时解析，持久化只保存 ID。
- 不注册 `{{knowledge}}` 或 `【knowledge::...】`，上下文管道也没有 Knowledge processor。普通消息和 Agent 授权不会触发 Knowledge 检索。
- `application.ts` 提供独立的 `knowledge.listLibraries`、`knowledge.search`、`knowledge.read` 应用服务：所有入口先从 `ToolContext` 解析 Agent 快照，再校验授权、可用状态和能力权限。
- `search` 按 library 独立调用底层检索，使不同 Embedding 空间分别生成 query vector 和候选；跨库只按 RRF rank score 融合，原始 score 与 signals 仅用于解释。`auto` 返回实际策略和降级原因，结果按字符预算裁剪并可选补充相邻 chunk。
- `read` 支持 chunk ID、document + chunk index 邻域、heading 和字符范围，强制字符预算并返回前后 chunk 定位和完整来源字段。
- 工具结果通过 `ToolMethodResult.executionMetadata` 把来源、耗时外的实际策略和失败类型写入可见工具事件。现有 Retrieval 上层组合入口复用同一权限范围，不能旁路访问未授权 Knowledge 库。
- `KnowledgeReference` 是 `ChatMessageNode` 的独立版本化字段。`schemaVersion: 1` 保存稳定 `libraryIds`、mode 和发送时显示快照；名称快照只用于历史展示，执行前始终用 ID 重新校验当前 Agent 权限、资料库可用性和索引状态。
- `useChatInputManager` 以草稿 schema v3 按会话保存和跨窗口同步未发送引用。输入区独立 Knowledge 按钮只列已授权库，引用标记与发送控件分行布局；research mode 在 Phase 4 前不暴露。
- 显式 search 发送时创建 `user -> tool -> assistant` 节点链。`tool` 节点先显示执行态，成功后保存实际策略、命中来源和 user message 关联并进入 LLM 上下文；失败时保留可见错误事件、删除未执行的 assistant 节点，不退化为普通文本发送。没有引用的消息不进入该分支。
- mixed 检索只属于上层显式编排，先保留 Recall 与 Knowledge 的分域配额，再使用 RRF 融合，不直接比较两域原始分数。

## 5. 后续施工顺序

后续以 `docs/Plan/knowledge-base-implementation-checklist.md` 为唯一施工清单：下一步补齐配置分层、持久 ingest queue、目录同步、原子版本替换和诊断工作台，再实现二阶研究任务。真实路径、模型调用与恢复行为必须在隔离 appData 的 Tauri WebView 中验收。
