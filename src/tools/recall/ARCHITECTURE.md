# Recall（思绪）架构说明

Recall 是 AIO Hub 的完整语义条目与召回领域。它管理思绪集、原子条目、标签、优先级、向量及检索运行时，不负责文档切片、文件同步或来源回溯；后者属于独立的 Knowledge 文档资料域。

本文描述 Stage 1 完成后的代码边界。Stage 2 开始前，Recall 仍读取旧 `appData/knowledge/` 文件存储以保护现有用户数据；Stage 3 完成前，Agent 配置、宏和占位符仍保留旧 `knowledgeBaseConfig`、`{{kb}}` 与 `【kb::...】` 契约。它们是迁移期兼容面，不代表领域所有权仍属于 Knowledge。

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
- `logic/orchestrator.ts`：索引、向量同步和搜索的业务编排。
- `logic/placeholderRetrieval.ts`：兼容期被动召回请求的解析结果执行与格式化。
- `composables/`：集合、条目、索引、搜索、向量同步、监控及备份交互。
- `core/`：Embedding、检索策略、查询准备与标签生成等纯逻辑。
- `types/`：Recall 对外类型与迁移期兼容契约。
- `utils/recallStorage.ts`：Stage 2 前的旧文件存储薄客户端和 workspace 管理。

### 2.2 后端 `src-tauri/src/recall/`

- `core.rs`：`RecallCollection`、`RecallEntry`、`RecallResult`、过滤器及 `RetrievalEngine` 接口。
- `state.rs`：`RecallState`，持有内存数据库、检索引擎、标签池和检索缓存。
- `commands/`：集合、条目、向量、标签、搜索、备份和检索缓存的 `recall_*` Tauri commands。
- `index/`：集合内存索引、倒排索引和向量矩阵。
- `search/`：Keyword、Vector、Lens 与 Blender 引擎实现。
- `ops.rs`：预热、模型向量加载和内存读模型同步。
- `io.rs`：Stage 2 前对旧文件目录的读写。
- `tag_pool.rs`、`tag_sea.rs`：按 Embedding 模型隔离的标签向量与关联运行时。
- `monitor.rs`：`recall-monitor` 事件和心跳 command。

`src-tauri/src/lib.rs` 只管理 `RecallState`；`src-tauri/src/commands.rs` 注册 `recall_*` commands。Knowledge 空壳不持有 Recall 状态，也不导出命令。

## 3. 检索引擎

所有引擎实现 `RetrievalEngine`，由 `RecallState` 按 `engineId` 选择：

- `keyword`：Jieba 分词和倒排索引，使用词频及非线性缩放评分。
- `vector`：余弦相似度语义检索，可结合标签池进行 Tag-First 召回与长度归一化。
- `lens`：结合历史向量投射、标签亲和力和空间反转进行扩散式检索。
- `blender`：融合字面、语义与标签引力信号，并进行残差挖掘和动态权重调整。

当前保留旧引擎行为，为 Stage 2 数据迁移提供稳定消费者。`semantic` / `associative` profile 的统一契约和引擎融合属于后续阶段。

## 4. 核心流程

### 4.1 初始化与预热

1. `recallCollectionStore` 加载 `workspace.json` 和 Recall 配置。
2. 前端调用 `recall_initialize`，确保旧存储目录存在。
3. `recall_warmup` 扫描旧集合元数据与条目，构建 `InMemoryDatabase`。
4. 后台按已发现模型加载向量矩阵和标签池索引。

### 4.2 条目写入与向量化

1. 前端创建或更新 `RecallEntry`，维护内容哈希和集合元数据。
2. `recall_upsert_entry` 或批量 command 持久化条目并同步内存索引。
3. 前端索引编排器调用配置的 Embedding 模型，向量缓存按内容和模型复用结果。
4. `recall_update_entry_vector` 写入模型隔离的向量文件并刷新向量矩阵。
5. 标签向量通过 `recall_sync_tag_vectors` 更新，HNSW 索引可按需重建。

### 4.3 搜索与 Chat 召回

1. 调用方通过 `services/api.ts` 或 Recall 内部编排器构造查询。
2. 主查询执行清洗和标签匹配；需要向量时生成或融合查询向量。
3. `recall_search` 根据 `engineId`、集合 ID、标签、阈值和数量执行过滤、计算与排序。
4. 后端发送 `recall-monitor` trace，前端按需格式化结果并执行字符上限截断。
5. Chat 兼容处理器仍识别旧占位符和 Agent binding，但最终构造 `RecallRetrievalRequest` 并调用 Recall service。

检索结果缓存使用 `recall_retrieval_cache_*` commands。缓存键包含规范化查询、`recallIds`、标签、数量、阈值、引擎和模型；任一字段变化都会形成不同缓存项。

## 5. IPC 与事件

- Tauri command 前缀统一为 `recall_*`，前端参数使用 camelCase，例如 `recallId`、`recallIds`。
- Rust 返回前端的结构体使用 `#[serde(rename_all = "camelCase")]`。
- 监控事件为 `recall-monitor`，备份进度事件为 `recall-backup-progress`。
- llm-chat 等外部模块优先通过 `src/tools/recall/services/api.ts` 访问 Recall。

## 6. 临时存储边界

Stage 2 前的真实存储仍位于：

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

目录名和 `.aio-kb` v1 格式在迁移完成前保持不变，避免破坏用户源数据与备份兼容。它们只能由 Recall 迁移期 IO、备份恢复和未来 `LegacyFileRecallImporter` 访问，不能被 Knowledge 空壳作为业务存储使用。

Stage 2 将数据幂等迁移到 `appData/recall/recall.db` 与 `recall-vectors.db`；旧目录在校验和用户确认前不得删除。

## 7. 兼容与后续迁移

- Stage 3 前保留 `knowledgeBaseConfig`、`knowledgeSettings`、`kbId`、`kbName`、`{{kb}}` 与旧 `【kb::...】` 语法。
- 新 Agent 工具和 UI 已使用 `recall-basic`、`recall-admin`、`/recall`、`RecallCollection` 与 `RecallEntry`。
- 兼容配置必须在版本化迁移中统一转换，不能在各组件挂载时继续扩散临时修补。
- 新代码不得向 Knowledge 空壳导入 Recall 业务类型，也不得新增 `Thought` 作为第三套领域名。

实施顺序、迁移不变量和阶段完成门槛见 `docs/Plan/recall-knowledge-domain-restructure-implementation-plan.md`。

## 8. 验证要求

涉及 Recall 的变更至少验证：

- 前端 lint、类型检查、Recall 单元测试与 Vite build。
- Rust 单元测试或 Clippy / backend check。
- Tauri command、camelCase 参数、事件名和前端调用保持一致。
- 旧目录、`.aio-kb` v1、集合与条目 UUID、Agent binding 在对应迁移阶段保持可恢复。
- 真实运行态行为使用 Tauri dev / WebView 验证，普通浏览器页面不能替代。
