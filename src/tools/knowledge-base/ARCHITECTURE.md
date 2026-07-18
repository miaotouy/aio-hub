# Knowledge（知识资料库）架构说明

Knowledge 是 AIO Hub 的文档资料与来源回溯领域，与 Recall 思绪领域独立持久化、独立绑定和独立检索。它面向 PDF、DOCX、HTML、Markdown、代码与文本资料，基本单元是 `document + chunk + source`，不承载 Recall entry、标签池、priority 或联想召回状态。

详细产品与交互方案见 [Knowledge 资料库产品与交互设计](./docs/Plan/knowledge-base-product-interaction-design.md)。

## 1. 存储与索引

- Knowledge repository 必须以项目统一的 `get_app_data_dir(app.config())` 为数据根，使默认、自定义、便携和隔离实例与其他应用数据遵守同一路径契约。不得直接使用 Tauri `app.path().app_data_dir()` 建立第二个数据根。
- `knowledge/knowledge_meta.db` 只保存 library ID、名称、说明、目录时间戳和 manifest schema migration。它不保存单库数据库绝对路径，也不是索引配置或活动向量身份的事实来源。
- `knowledge/libraries/{libraryId}.kdb` 是每库独立的 SQLite 文件，包含版本化 `library_metadata`、索引配置快照、活动 Embedding space/route/维度、document、chunk、FTS5、`embedding_spaces`、按 `space_id` 隔离的 chunk vector 和相邻 chunk graph edge。
- library 文件采用 UUID 路径约束，并始终从当前数据根派生；整个数据根移动或复制后不会引用旧位置。删除先隔离为 tombstone，再删除 manifest，失败时恢复文件。
- Knowledge 在正式发布前的数据根分裂不提供迁移兼容：不探测、不合并、不搬运旧 Tauri 默认目录中的开发期数据，验收和开发直接使用全新隔离数据根。
- `knowledge_sources` 保存独立文件或目录来源，`knowledge_source_files` 保存稳定文件身份、原始 SHA-256、parser 版本、当前 document 和最近状态；`knowledge_ingest_tasks` 持久化 pending/processing/retry/failed/completed/cancelled、有限重试、取消与 lease。文件在入队哈希前后必须保持 size/mtime 稳定，原始 checksum 或 parser 版本未变化时跳过重复解析。
- 目录来源使用显式递归范围、ignore 规则且不跟随符号链接。重扫复用同一 ingest queue；新增/修改文件进入 upsert，缺失文件进入 delete，移动等价于旧路径 delete + 新路径 upsert。删除任务完成前旧 document 继续可用。
- 文档以 `sourcePath` 为稳定键。任务完成时校验 lease、入队 checksum 与 parser 版本，并在单个 library transaction 中原子提交 document 版本、chunk、FTS、graph、source file 和 task 状态。
- 更新已有文档时，旧活动空间的 chunk/vector 复制到 `knowledge_semantic_fallback_chunks`。新 document/chunk/FTS 立即成为关键词真值；语义检索在当前版本向量未全覆盖时继续读取旧快照，最后一个缺失 chunk 的向量落库后在同一事务中删除快照并切换到新版本。配置重建会明确清空回退快照。
- `knowledge_get_index_status` 从 library 数据库实时读取活动空间并计算当前 `space_id` 的向量覆盖率，不把 manifest 或 UI 缓存当作真源。`embedding_route_key` 只负责调用路由，旧 `model_id` 向量会事务迁移为逐 route 隔离的 legacy space，不按名称自动合并。
- 同 descriptor 的模型 route 可由用户确认后只切换 `embedding_route_key`；不同 identity 或请求契约会生成新 `space_id` 并独立保留向量。
- `rebuild_library` 在单个 library WAL 数据库事务内提交配置、重切分全部文档、重建 FTS/graph，并清除旧活动向量身份，避免旧向量与新 chunk 混用。
- 禁止用 WAL 模式下的 `ATTACH` 多数据库事务宣称配置与索引具备崩溃原子性。SQLite 的 attached database 在 rollback-journal 模式下可借助 super-journal 协调多文件提交，但 WAL 模式没有对应的跨 WAL 原子提交保证；进程或设备在提交窗口中断时，可能出现 library 已提交而 manifest 未提交，或相反。普通 SQL 异常触发的 `ROLLBACK` 测试只能证明运行中错误回滚，不能证明这种崩溃窗口安全。
- 因此配置、活动向量身份、document、chunk、FTS、vector 和 graph 必须在同一个 library DB 的 WAL 事务中提交，`library_metadata` 是运行时唯一真值。manifest 只保存目录元数据；即使其摘要更新失败，也只能形成可重建的目录缓存过期，不能改变检索、摄取或重建所使用的配置。任何重新引入跨库强一致写入的方案，都必须先给出与实际 journal mode 一致的崩溃恢复证明和进程终止测试，否则按数据一致性严重问题停止施工。
- 旧 manifest `config_json` 和活动向量字段只作为一次性迁移输入：首次初始化 library metadata 时写入单库数据库，确认成功后运行时不再读取这些旧字段。迁移必须可重入，进程中断后可从任一已提交状态继续。

当前运行路径使用 SQLite + FTS5。TriviumDB 的跨平台文件组、锁和恢复验证完成前不进入运行路径。

## 2. 前端边界

- `KnowledgeBase.vue` 是资料库工作台，提供 library CRUD、批量文件导入、文档与分块主从浏览、索引状态、检索测试和来源展示。
- `components/KnowledgeVectorDialog.vue` 提供 Embedding 模型选择、覆盖率、批次进度、模型切换确认和失败后重试。
- `formats.ts` 是格式能力单一来源，统一导出类别、标签、扩展名、MIME、parser、验证等级、能力说明、文件选择 filter 和 DropZone accept。
- `fileParser.ts` 按 capability 分派 PDF、DOCX、HTML 与文本解析。未知扩展名读取后执行文本/二进制检测；已知不支持格式和伪装成文本的二进制不会进入索引。扫描 PDF 无文本层时明确返回 OCR 未支持。
- `importService.ts` 提供唯一的 `selectImportPaths()` 与 `importPaths(paths)`；点击选择、空状态拖放和已有文档覆盖层复用同一批处理、去重、进度和文件级失败契约。
- `ingestQueue.ts` 将唯一导入入口接到 Rust 持久队列，按 `ingestQueueConcurrency` 并发领取任务并使用配置的 lease/重试上限；Knowledge store 初始化时恢复各库未完成任务。worker 解析后回传原始 SHA-256 与 parser 版本，Rust 负责最终一致性校验。未打开 Knowledge store 时任务保持持久化但不在后台调用前端 parser。
- 自动向量化只请求当前活动空间缺失的当前 chunk。模型失败不会回滚已完成的 document、关键词索引或旧语义快照；实际 descriptor 与活动空间不一致时停止写入并要求显式重建。
- `service.ts` 是唯一 IPC 边界；`store.ts` 管理 library、document、chunk、result 与 index status 运行态。
- Embedding 模型选项由共享 `useEmbeddingModelOptions()` 提供，Knowledge 不复制模型能力判断。
- 批量导入以文件为失败隔离单元。成功文件立即保留，失败项保存文件名、绝对路径、validation/read/parse/ingest 阶段和原因。H5 只取得 `File.name` 时不伪造来源路径，提示改用文件选择器。

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
- `application.ts` 提供独立的 `knowledge.listLibraries`、`knowledge.search`、`knowledge.read` 应用服务：所有入口先从 `ToolContext` 解析 Agent 快照，再校验授权、可用状态和能力权限。`research.ts` 只编排这些原子服务，不建立第二套检索或授权路径。
- `search` 按 library 独立调用底层检索，使不同 Embedding 空间分别生成 query vector 和候选；跨库只按 RRF rank score 融合，原始 score 与 signals 仅用于解释。`auto` 返回实际策略和降级原因，结果按字符预算裁剪并可选补充相邻 chunk。
- `read` 支持 chunk ID、document + chunk index 邻域、heading 和字符范围，强制字符预算并返回前后 chunk 定位和完整来源字段。
- 工具结果通过 `ToolMethodResult.executionMetadata` 把来源、耗时外的实际策略和失败类型写入可见工具事件。现有 Retrieval 上层组合入口复用同一权限范围，不能旁路访问未授权 Knowledge 库。
- `KnowledgeReference` 是 `ChatMessageNode` 的独立版本化字段。`schemaVersion: 1` 保存稳定 `libraryIds`、mode 和发送时显示快照；名称快照只用于历史展示，执行前始终用 ID 重新校验当前 Agent 权限、资料库可用性和索引状态。
- `useChatInputManager` 以草稿 schema v3 按会话保存和跨窗口同步未发送引用。输入区独立 Knowledge 按钮只列已授权库，引用标记与发送控件分行布局；有 `allowResearch` 权限时可以显式切换到 research mode。
- 显式 search 发送时创建 `user -> tool -> assistant` 节点链。`tool` 节点先显示执行态，成功后保存实际策略、命中来源和 user message 关联并进入 LLM 上下文；失败时保留可见错误事件、删除未执行的 assistant 节点，不退化为普通文本发送。没有引用的消息不进入该分支。
- 显式 research 复用同一节点链，由当前 Agent 编排。Knowledge 工具节点持续保存轮次、调用数和证据字符进度，支持取消；完成、失败或取消都保留已收集引用、查询、空缺、潜在冲突和终止原因，随后由当前 Agent 基于结构化证据生成最终回答。
- mixed 检索只属于上层显式编排，先保留 Recall 与 Knowledge 的分域配额，再使用 RRF 融合，不直接比较两域原始分数。

## 5. 后续施工顺序

后续以 `docs/Plan/knowledge-base-implementation-checklist.md` 为唯一施工清单。配置分层、持久 ingest queue、目录同步、原子版本替换、诊断工作台和二阶研究任务均已进入运行路径；最终仍需按清单完成跨模块回归和隔离 appData 的真实 Tauri 全链路验收。
