# Recall（思绪）架构说明

> 最后更新：2026-08-01

Recall 是 AIO Hub 的完整语义条目与召回领域。它管理思绪集、原子条目、标签、优先级、向量及检索运行时，不负责文档切片、文件同步或来源回溯；后者属于独立的 Knowledge 文档资料域。

本文描述 Stage 3 完成后的代码边界。Recall 运行时已以 SQLite 为真源；Agent 配置、宏和占位符已迁至 `recallConfig`、`recallSettings`、`{{recall}}` 与 `【recall::key=value】` 契约。旧字段只作为版本化迁移输入，不代表领域所有权仍属于 Knowledge。

## 1. 领域边界

### 1.1 核心模型

- `RecallCollection`：思绪集，聚合条目索引、集合配置和向量化状态。
- `RecallEntry`：完整语义条目，包含 `key`、Markdown `content`、带权标签、`priority`、启用状态、内容哈希与资产引用。
- `RecallResult`：召回结果，包含条目、思绪集信息、分数、匹配类型与高亮信息。
- `RecallSearchFilters`：集合、标签、启用状态、分数与数量等过滤条件。

Recall 条目不自动切片，也不保存文档 manifest、文件监听状态或检索算法中间结果。旧名称 CAIU 只应出现在迁移夹具、备份格式或历史说明中。

### 1.2 Knowledge 边界

`src/tools/knowledge-base/` 与 `src-tauri/src/knowledge.rs` 当前是 Knowledge 文档资料域空壳，不导入 Recall store、service、action 或 entry 类型，也不注册 Rust command。未来的 document、chunk、source、文件同步、BM25 和出处回源能力在该边界内独立实现。

## 2. 模块结构

### 2.1 前端 `src/tools/recall/`

- `recall.registry.ts`：注册 `/recall` UI，以及 `recall-basic`、`recall-admin` Agent 工具。
- `Recall.vue`、`views/`、`components/`：工作区、统计、监控、实验室与设置界面。
- `stores/recallCollectionStore.ts`：Pinia 运行态，管理工作区、当前集合、条目缓存、向量状态和监控缓冲区。
- `services/api.ts`：供 llm-chat 等外部模块使用的 Recall 门面；外部消费方不应直接导入内部 store 或 orchestrator。
- `logic/orchestrator.ts`：索引与向量同步的业务编排；产品检索统一由 pipeline service 执行。
- `logic/placeholderRetrieval.ts`：被动召回请求的执行与格式化。
- `composables/`：集合、条目、索引、搜索、向量同步、监控及备份交互。
- `core/`：Embedding、检索策略、查询准备与标签生成等纯逻辑。
- `types/`：Recall 对外类型与迁移期兼容契约；`types/pipeline.ts` 定义检索管线 v1 wire contract。
- `utils/recallStorage.ts`：Recall repository IPC 薄客户端和 UI workspace 配置管理。

### 2.2 后端 `src-tauri/src/recall/`

- `core.rs`：`RecallCollection`、`RecallEntry`、`RecallResult` 与公共过滤器。
- `retrieval_pipeline.rs`：artifact store、module registry、pipeline compiler、串行 Runner 与 trace v1 契约。
- `retrieval_modules.rs`：生产检索模块、内置 preset 定义与公共过滤/finalizer；当前已提供 `algorithmic` 与 `comprehensive` 可执行链路。
- `state.rs`：`RecallState`，持有内存数据库、标签池、管线 artifact store 和检索缓存。
- `commands/`：集合、条目、向量、标签、pipeline、备份和检索缓存的 `recall_*` Tauri commands。
- `index/`：集合内存索引、倒排索引和向量矩阵。
- `ops.rs`：预热、模型向量加载和内存读模型同步。
- `io.rs`：Stage 2 前对旧文件目录的读写。
- `tag_pool.rs`：按 Embedding 模型隔离的标签向量运行时。
- `monitor.rs`：`recall-monitor` 事件和心跳 command。

`src-tauri/src/lib.rs` 管理 `RecallState`，并在 Tauri `setup` 阶段初始化 repository 与内存读模型；`src-tauri/src/commands.rs` 注册 `recall_*` commands。Knowledge 空壳不持有 Recall 状态，也不导出命令。

## 3. 检索管线

检索管线模块化已冻结 `recall-retrieval-pipeline-v1` 契约和
`algorithmic / comprehensive` 两个预设 ID。Rust 与 TypeScript 通过
`recall-pipeline-contract-v1.json` 共享序列化夹具；旧 ID 迁移规则使用
`recall-retrieval-migration-v1`。后端已有生产 module registry、compiler、串行 Runner、
公共过滤/finalizer 和两个内置预设，并通过独立 IPC 提供 preset 列表、编译与运行。
`algorithmic` 不声明外部产物依赖，不读取查询向量，也不会触发 Embedding 请求。

`algorithmic` 显示名为“算法召回”，`comprehensive` 显示名为“综合召回”；
旧 `keyword/vector/lens/blender/semantic/associative` 不属于新预设列表。
Recall service、Chat 被动召回、Agent tool、Agent 配置、管理页局部搜索和 Playground 已通过 pipeline service 使用预设；
该 service 先编译配置，再按编译结果准备外部产物并执行 Runner。legacy `RetrievalEngine`
registry、`recall_search` / `recall_list_engines` commands 及 Keyword、Vector、Lens、Blender
实现已经删除；旧 ID 只由版本化迁移器、夹具和历史 trace 读取。`comprehensive` 已包含
关键词、内容向量与原子标签图模块，并复用同一请求的查询向量 bundle：`tag-vector-recall`
输出标签种子，`bounded-tag-propagation` 生成受限的查询能量场，`tag-to-entry-expansion`
输出 `tag-graph` 候选。当前稳定预设不包含查询残差标签扩展，也不以标签上下文改写
内容向量召回使用的原始查询向量。该能力如后续立项，只能先进入 Playground 自定义管线，
并使用独立的基础、残差和合并种子 artifact；legacy Blender 的 residual mining 实现不会迁移。
生产管线不再调用 Lens engine。

Agent 编辑器通过 `recall_list_retrieval_presets` 读取产品预设摘要，不在组件内复制预设
显示名、描述或 override 范围。全局和绑定级 `limit` 控件使用 `allowedOverrides` 的整数
schema；全局预设变更后调用同一 compiler 获取 external requirements，并结合 Recall 全局
活动 Embedding 模型执行 capability 预检。预检使用请求序号隔离异步结果，较早的 compile
响应不能覆盖较新的预设或 limit。该预检只判断编辑期可知的全局模型路由；条目向量、标签池
等集合相关资产仍由实际运行的 prepare 阶段校验和准备。

Playground 使用 `useRetrievalPipelineRun` 执行 `idle -> compiling -> ready -> preparing ->
running -> outcome` 状态机。controller 只接受与当前 `runId + configHash` 一致的响应；新运行
或取消会提升本地世代，较晚返回的旧 compile/run 结果不会覆盖当前槽位。工作面固定比较两个
产品预设，支持多查询批量回放、阶段摘要和完整 trace；槽位可从当前预设模板打开阶段编辑器。
`recall_list_retrieval_modules` 仅返回后端已注册模块，`recall_compile_custom_retrieval_pipeline`
和 `recall_run_custom_retrieval_pipeline` 会将配置规范化为 `playground-custom`、限制节点数，
并复用同一 compiler/runner 校验和 trace。custom 只作为临时 Playground 执行身份，不可作为
产品 preset、fallback 目标或持久化 workspace 配置。槽位模型选择、legacy engine 参数、覆盖率
交互和运行结果持久化已删除。

完整的稳定契约见
`docs/architecture/retrieval-pipeline-contract.md`；当前施工状态见
`docs/Plan/recall-retrieval-pipeline-modularization-plan.md`。

## 4. 核心流程

### 4.1 初始化与预热

1. Tauri `setup` 调用 `RecallState::initialize`，在主窗口创建前幂等建立 SQLite repository。
2. 同一后端初始化临界区从 `recall.db` 构建 `InMemoryDatabase`，并从 `recall-vectors.db` 恢复向量矩阵和标签池索引。
3. `recall_initialize` 作为兼容 command 复用同一幂等入口；`recall_warmup` 只用于显式重建派生读模型。
4. `recallCollectionStore` 只加载 `workspace.json` UI 配置和集合列表，不管理数据库生命周期。

### 4.2 条目写入与向量化

1. 前端创建或更新 `RecallEntry`，维护内容哈希和集合元数据。
2. `recall_upsert_entry` 或批量 command 持久化条目并同步内存索引。
3. 前端索引编排器调用配置的 Embedding 模型，向量缓存按内容和模型复用结果。
4. `recall_update_entry_vector` 写入模型隔离的向量表并刷新向量矩阵。
5. 标签向量通过 `recall_sync_tag_vectors` 更新，HNSW 索引可按需重建。

### 4.3 搜索与 Chat 召回

1. 调用方通过 `services/api.ts` 构造预设查询；旧 `engineId` 只由版本化迁移器读取，旧 `profile` 由占位符或 Agent migration 转换为预设。
2. service 编译管线，以 `presetId`、配置哈希、算法版本和 Embedding 身份查询缓存。
3. 缓存未命中时，Runner 仅在编译结果声明 `query-embedding` 时准备主/次查询的融合向量，并将 bundle 交给各检索模块复用。
4. Runner 执行候选、归一化、融合、过滤和 finalizer；前端按需格式化结果并执行字符上限截断。
5. Chat 的 `RecallProcessor` 解析严格命名参数协议、校验 Agent binding 授权，构造 `RecallRetrievalRequest` 并调用 Recall service；旧自由文本语法只生成告警。

Chat processor、`{{recall}}` 宏、占位符编排器、Agent action 和普通 service 都不接受
逐请求 Embedding 模型覆盖；pipeline service 只读取 `WorkspaceConfig.defaultEmbeddingModel`，
缓存也使用这一完整模型身份。`{{recall}}` 会保留 binding `presetId`，使手动宏与自动注入
路径使用同一预设。上述后台入口的错误处理只记录日志或返回结构化失败，不调用用户提示或
交互对话框。

`WorkspaceConfig.embeddingAssetGeneration` 记录当前活动模型的 `modelIdentity`、版本化
`generationId` 和激活时间。旧 workspace 首次加载时会补齐该字段；设置页从已有模型切换或
清空模型前会提示覆盖率影响，确认后轮换 generation 并清空当前检索缓存。query bundle
携带同一 `assetGeneration`，使模块 trace 可以关联实际活动资产代际。

检索结果缓存使用 `recall_retrieval_cache_*` commands。缓存键包含规范化后的主/次查询、`recallIds`、标签、融合权重、数量、阈值、预设、编译配置哈希、Embedding 身份、活动资产代际和算法版本；任一字段变化都会形成不同缓存项。

## 5. IPC 与事件

- Tauri command 前缀统一为 `recall_*`，前端参数使用 camelCase，例如 `recallId`、`recallIds`。
- Rust 返回前端的结构体使用 `#[serde(rename_all = "camelCase")]`。
- 监控事件为 `recall-monitor`，备份进度事件为 `recall-backup-progress`。
- `recall_run_retrieval_pipeline` 为 success、empty、fallback、failed 和 cancelled 结果发送 RAG 监控事件；payload 可选携带完整 `recall-pipeline-trace-v1`、结构化错误及 requested/actual preset。历史 `recall_search` 事件可能携带 engine metadata 和 legacy 条目 trace，同一前端组件按 `executionPath` 兼容展示。
- llm-chat 等外部模块优先通过 `src/tools/recall/services/api.ts` 访问 Recall。

## 6. 存储与迁移边界

旧版只读迁移源位于：

```text
appData/knowledge/
├── workspace.json
├── bases/{recallId}/
│   ├── meta.json
│   └── entries/{entryId}.json
├── vectors/{recallId}/
│   ├── models.json
│   └── {modelHash}/{entryId}.vec
└── tag_pool/{modelHash}/
    ├── registry.json
    └── vectors.bin
```

目录名和 `.aio-kb` v1 格式保持只读兼容，避免破坏用户源数据与已导出的备份。旧目录只能由 Recall legacy importer、备份格式夹具和迁移测试读取；备份恢复自身直接写入 SQLite repository，不能被 Knowledge 空壳作为业务存储使用。

新导出使用 `.aio-recall` 容器与 `aiohub.recall-collection@1`，manifest 同时声明 `dataSchemaVersion = 1` 和 `configSchemaVersion = 1`，主数据文件为 `collection.json`。多集合 ZIP 使用 `aiohub.recall-collection-backup-collection@1`、相同 schema 版本和 `collections/` 子目录。两种新格式都只保存集合源数据与引用资产，不保存向量、tag pool 或运行时索引；恢复后重建派生数据。导入器按 `format + formatVersion + dataSchemaVersion + configSchemaVersion` 严格分派，并继续读取旧 `aiohub.knowledge-library@1` `.aio-kb`、旧多库 ZIP 及 legacy JSON/YAML。

旧格式中的 “knowledge library / 知识库” 是重构前的产品命名，底层实际使用思绪条目结构，不天然等同于新版 Knowledge 文档资料域。检查旧包时后端返回 `legacyRecallBackup` 结构化告警；前端在导入前说明两种去向：完整恢复到 Recall / 思绪，或将旧条目的标题和 Markdown 正文不可逆转换成新版 Knowledge 文档。默认推荐思绪；仅当用户确认旧内容当作传统文档库使用时才进入二次确认并转换到 Knowledge。Knowledge 转换会为每个旧集合新建资料库，任一文档写入失败则删除本次新库；原备份不修改，但标签、优先级、启用状态、条目关联和附件不转换为 Knowledge 字段。

`appData/recall/recall.db` 与 `recall-vectors.db` 构成 Recall SQLite repository，并各自维护 migration 表；主库 schema v2 持久化集合活动模型，模型维度、tokens 和最后索引时间从向量库统计恢复。Tauri 启动阶段只初始化 repository、检测旧目录并 warmup 内存读模型，不执行旧用户数据迁移；`recall_initialize` 是幂等初始化入口。集合、条目、向量、标签池 command 与备份导入导出均以 repository 为真源。`LegacyFileRecallImporter` 负责旧集合、条目、向量与 tag pool 的幂等导入、运行状态续跑和结构化报告；执行迁移前必须校验 migration ID、source fingerprint 和用户确认，迁移可在中断后从已提交状态继续。迁移失败或验证未通过时必须保留源目录并返回原因，只有验证完成且用户再次确认后才能清理。

稳定的数据真源、写入顺序、备份格式、旧目录清理条件和迁移报告字段见 `docs/architecture/storage-migration-contract.md`。

## 7. 兼容与后续迁移

- `knowledgeBaseConfig`、`knowledgeSettings`、`kbId`、`kbName` 与 `kb-*` 权限 key 只由版本化 Agent migration 读取，迁移后立即删除。
- `{{kb}}` / `{{kb_list}}` 与旧 Knowledge processor 已删除；旧 `【kb】` / 历史位置参数 `【knowledge】` 仅生成可定位告警，不触发检索。
- 新 Agent 工具和 UI 已使用 `recall-basic`、`recall-admin`、`/recall`、`RecallCollection` 与 `RecallEntry`。
- 兼容配置必须在版本化迁移中统一转换，不能在各组件挂载时继续扩散临时修补。
- 新代码不得向 Knowledge 空壳导入 Recall 业务类型，也不得新增 `Thought` 作为第三套领域名。

检索管线的实施顺序与阶段完成门槛见
`docs/Plan/recall-retrieval-pipeline-modularization-plan.md`。

## 8. 验证要求

涉及 Recall 的变更至少验证：

- 前端 lint、类型检查、Recall 单元测试与 Vite build。
- Rust 单元测试或 Clippy / backend check。
- Tauri command、camelCase 参数、事件名和前端调用保持一致。
- 旧目录、`.aio-kb` v1、`.aio-recall` v1、集合与条目 UUID、Agent binding 在对应迁移阶段保持可恢复。
- 真实运行态行为使用具名 Tauri E2E preset 在真实 WebView 中验证，普通浏览器页面和独立人工清单不能替代。
