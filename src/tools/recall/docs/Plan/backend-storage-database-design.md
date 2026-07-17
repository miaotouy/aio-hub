# Recall / Knowledge 后端存储数据库化设计调查

**状态**: 调查完成，依赖已复核，施工步骤已迁至统一计划
**创建日期**: 2026-06-23
**最近修订**: 2026-07-17
**适用范围**: `src/tools/recall/`、`src-tauri/src/recall/`、`src/tools/knowledge-base/`、`src-tauri/src/knowledge/`

---

## 0. 修订决定

本轮修订采用更激进的结构和命名边界：后续数据库化不再把 CAIU 与传统 RAG 资料都包装成“知识库”的不同形态，而是明确拆成两个域。

- **Recall / 思绪域**：承载现有 CAIU 条目、标签、priority、语义召回和联想召回。旧版文件系统中的 `bases/entries/vectors/tag_pool` 在数据库化迁移时转换到该域。当前 `refs/refBy` 是 `serde(skip)` 的运行时派生关系，不作为源字段迁移。
- **Knowledge / 知识域**：承载 PDF、Markdown、网页、手册、论文、代码资料包等传统资料检索，采用 document/chunk/source 结构，支持切片、文件同步、BM25、向量和图扩散。
- 不再使用“冷知识库 / coldKnowledge”作为产品命名或长期 API 命名。此前文档中的 cold knowledge 语义统一改为 **Knowledge / 知识资料库**。
- 因为数据库化尚未开始，迁移阶段应一次性完成命名和 schema 转换，不再为了旧文件目录里的 `knowledge` / `kb_*` 命名额外保守。
- 现有 CAIU 实现整体迁入 Recall，原 `knowledge-base` 只保留为未来 Knowledge 资料库入口。数据库、内部 repository、新类型和 UI 文案使用 `recall` 与 `knowledge`，不再新增 `thought_*` 或 `kb_*` 长期命名。
- 具体领域切割、配置迁移和发布顺序统一记录在 [Recall / Knowledge 领域拆分与重构实施计划](./recall-knowledge-domain-restructure-implementation-plan.md)。
- 数据库化开始前先按 [重构前按库备份与恢复功能计划](./pre-restructure-library-backup-import-export-plan.md) 发布现有文件存储的备份版本；该版本产生的 `.aio-kb` v1 是后续迁移器的正式输入之一。

### 0.1 2026-07-17 依赖与平台复核

本轮在仓库当前 Rust 1.91 工具链下复核了 SQLite、文件监听、全文检索和 TriviumDB 候选依赖，并执行了本机编译探针。

结论：

- AIO 已有 `jieba-rs`、`rayon`、`nalgebra`、`hnsw_rs`、`blake3`、`walkdir`、`ignore`、`encoding_rs`，Recall 检索和第一版 Knowledge 预处理不需要重复引入同类库。
- 前端已有 `pdfjs-dist`、`mammoth`、`@mozilla/readability`、`turndown`，第一轮复用现有解析能力，不新增 Rust PDF / DOCX / HTML 解析依赖。
- Recall 数据库化和 Knowledge manifest 的必需新增依赖只有 `rusqlite`。
- Knowledge 文件夹监听使用稳定版 `notify-debouncer-full`；首轮不跟随 `notify` 9.x RC。
- TriviumDB 仅作为 Knowledge 的可替换实验后端，不进入 Recall 主存储，也不阻塞 SQLite 迁移。
- 第一轮不新增 Tantivy、SQLx、连接池、迁移框架、第二套 ANN 或 Tauri SQL 前端插件。

已验证版本与结果：

| 候选                     | 调查版本 | 结果                                                                                 |
| ------------------------ | -------- | ------------------------------------------------------------------------------------ |
| `rusqlite`               | `0.40.1` | 在 Rust 1.91 下因 `libsqlite3-sys 0.38.1` 使用未稳定 `cfg_select` 而编译失败，不采用 |
| `rusqlite`               | `0.39.0` | Windows + bundled SQLite 编译通过；作为当前锁定版本                                  |
| `notify`                 | `8.2.0`  | 当前稳定线，MSRV 1.77                                                                |
| `notify-debouncer-full`  | `0.6.0`  | 与 notify 8.x 对应的稳定线，MSRV 1.77                                                |
| `triviumdb` Rust crate   | `0.7.0`  | Windows 与 `aarch64-linux-android` `cargo check` 通过；运行态和 iOS 尚需验证         |
| `triviumdb` Node package | `0.7.1`  | VCPToolBox 当前使用版本；不能假定与 Rust crate 0.7.0 API / 存储格式完全一致          |

Android 的 bundled SQLite 独立探针因本机未向普通 Cargo 命令注入 `aarch64-linux-android-clang` 而停在 C 编译器发现阶段。这不构成库不兼容结论，但必须通过项目真实 `tauri android build` 再确认。依赖的详细选型见第 5 节。

### 0.2 2026-07-17 VCP 日记存档与 AIO Agent 编排复核

本轮进一步核对了 `E:/rc20/vcp/VCPToolBox` 的 DailyNote、KnowledgeBaseManager、RAGDiaryPlugin、LightMemo 和实际 Agent 配置。

VCP 的日记系统采用简单的“存档与编排分离”模型：

- 源内容是按 folder 组织的日记文件，写入参数只有目标 folder、署名、日期、正文和 Tag 等内容字段。
- SQLite 索引只保存文件路径、`diary_name`、chunk 正文、Tag、向量和派生资产，不保存 Agent、会话、分支或消息外键。
- Agent Prompt 通过日记本占位符选择本次加载哪些 folder；同一个公共日记本可以被多个 Agent 组合使用。
- 主动检索和写入由本次 LightMemo / DailyNote 调用参数选择范围。署名可以作为正文和检索过滤条件，但不是数据库所有权关系。

AIO 数据库化据此采用以下约束：

- Recall 条目是无状态存档。`recall.db` 不增加 `agent_id`、`session_id`、`branch_id`、`message_id` 等运行时归属字段。
- Agent binding、占位符、工具开关和注入位置继续留在 Agent 配置与上下文管道中；数据库不维护反向绑定列表。
- 第一阶段只迁移 AIO 当前已经持久化的 base、CAIU、向量、模型统计和 tag pool。CAIU 的 `createdAt` / `updatedAt` 是基础源字段，必须完整保留；运行时 `refs/refBy`、检索路径和算法中间结果均可重建，不提升为源数据。
- 时间衰减等能力若后续有明确需求，作为 binding、占位符或单次请求修饰符实现，不要求第一阶段新增条目生命周期字段。

---

## 1. 背景

`knowledge-base` 当前是一套本地 RAG 后端：

- 前端负责 UI、LLM Embedding 调用、索引编排和检索编排。
- Rust 后端负责文件 IO、内存索引、关键词检索、向量矩阵检索、Lens / Blender 等高级检索算法、标签池 HNSW 索引和监控事件。

当前持久化采用文件系统数据库形态：

```text
appData/knowledge/
├── bases/
│   └── {kbId}/
│       ├── meta.json
│       └── entries/
│           └── {entryId}.json
├── vectors/
│   └── {kbId}/
│       ├── models.json
│       └── {modelHash}/
│           └── {entryId}.vec
└── tag_pool/
    └── {modelHash}/
        ├── registry.json
        └── vectors.bin
```

这套结构在早期开发中直观、可调试，但随着条目、向量、标签池和检索状态增多，已经暴露出冷启动扫描、索引漂移、批量写入一致性和删除清理不完整等问题。

本调查的目标是明确后端存储数据库化方向，而不是立即重写检索算法。

---

## 2. 当前关键代码边界

### 2.1 Rust 后端

- `src-tauri/src/knowledge/io.rs`
  - 定义 `appData/knowledge` 目录结构。
  - 提供 `save_entry`、`delete_entry`、`save_kb_meta` 等 JSON 文件写入函数。

- `src-tauri/src/knowledge/index/db.rs`
  - 定义 `InMemoryDatabase` 与 `InMemoryBase`。
  - `InMemoryBase` 不是普通缓存，而是运行时读模型：
    - `meta`
    - `entries`
    - `key_to_id`
    - `text_index`
    - `vector_store`
  - `sync_entry` 同时维护条目缓存、Key 映射、倒排索引和 `meta.entries`。

- `src-tauri/src/knowledge/ops.rs`
  - `warmup_knowledge_base` 从文件系统加载 meta、entries 和 vectors，并同步到内存。
  - `load_vectors_to_vec` 扫描 `.vec` 文件并组装向量。
  - `scan_all_vectorized_models` 通过物理目录反推条目的向量化状态。
  - `batch_upsert_entries_logic` 负责批量条目写入和内存同步。

- `src-tauri/src/knowledge/commands/entry.rs`
  - 条目 CRUD 仍以文件写入为持久化真源。

- `src-tauri/src/knowledge/commands/vector.rs`
  - 单条向量写入为 `{entryId}.vec` JSON 文件。
  - 加载模型向量时再组装到 `VectorMatrix`。

- `src-tauri/src/knowledge/tag_pool.rs`
  - 标签池使用 `registry.json + vectors.bin` 持久化。
  - HNSW index 只存在内存中，可重建。

### 2.2 前端

- `src/tools/knowledge-base/utils/kbStorage.ts`
  - `workspace.json` 由 `ConfigManager` 管理。
  - `workspace.bases` 仍保存知识库列表索引。
  - 创建、克隆、删除知识库时需要同时更新后端数据和前端 workspace 索引。

- `src/tools/knowledge-base/stores/knowledgeBaseStore.ts`
  - 初始化时先读 workspace，再调用 `kb_initialize`、`kb_warmup`。
  - 统计、向量状态和列表状态依赖后端 meta 与前端 workspace 的共同结果。

- `src/tools/knowledge-base/composables/useKbManagement.ts`
  - 当前单库导出调用 `kb_export_base`，再由前端写为 JSON / YAML。
  - 当前没有整库导入、格式版本、冲突策略、完整性校验或资产打包闭环，不能直接视为重构前完整备份。

---

## 3. 核心判断

### 3.1 数据库化不应替换内存检索模型

推荐方向：

```text
SQLite 持久化真源
        ↓ warmup / 按需加载
Rust InMemoryDatabase 派生读模型
        ↓
Keyword / Vector / Lens / Blender 检索引擎
```

原因：

- 当前检索性能依赖 Rust 内存结构：
  - Jieba 倒排索引
  - 展平 `Vec<f32>` 向量矩阵
  - rayon 并行余弦相似度
  - HNSW 标签池索引
  - Lens / Blender 的运行时数学计算
- SQLite 适合作为可靠持久层，但不适合直接替代这些实时检索结构。
- 直接用 SQL 查询替代 `InMemoryBase` 会导致检索路径大改，风险远高于收益。

### 3.2 当前最大问题不是“文件格式”，而是“多真源漂移”

当前存在至少三类真源：

- 后端 `meta.json`
- 后端 entries / vectors 物理文件
- 前端 `workspace.json` 中的 `bases`

这些数据之间通过启动扫描、状态补偿和手动同步维持一致。数据库化应优先消灭这些漂移点，而不是只把 JSON 文件搬进 SQLite。

### 3.3 标签池和向量矩阵应分层处理

推荐：

- Recall 域的 collection meta、entry index、entry vectors、model coverage 入 SQLite。
- HNSW index 继续作为内存派生结构。
- `VectorMatrix` 继续作为检索时内存结构。
- Recall 域 `tag_pool` 的 registry 和 vector 数据可以进入 SQLite，但 HNSW 索引不持久化，按需重建。

---

## 4. 推荐目标架构

按语义域拆成 Recall 与 Knowledge，并使用独立数据目录。数据库化是一次结构重命名机会，不再让 `appData/knowledge` 长期承载 CAIU 运行时数据。

```text
appData/
├── recall/
│   ├── recall.db
│   └── recall-vectors.db
└── knowledge/
    ├── knowledge_meta.db
    └── libraries/
        └── {libraryId}.tdb
```

这仍符合项目内已有移动端 SQLite 计划中的“一模块自有数据库”方向，避免把工具数据混入全局数据库，同时把思绪源内容、大体积可重建检索资产、传统资料知识库隔离开。

`recall.db` 是 Recall / 思绪域唯一不可丢的主库：

- 思绪集合元数据。
- CAIU / Recall entry 源内容。
- CAIU 中现有的 AssetRef、标签、priority、enabled 等内容字段。
- 内容 hash、基础配置、workspace 中的知识库列表真源。

`recall-vectors.db` 是 Recall / 思绪域派生检索资产库：

- entry / asset embeddings。
- 模型覆盖、tokens 统计和向量化时间。
- tag vectors。
- 后续经基准证明有必要时再增加的算法缓存；第一阶段不预建召回路径或认知状态表。

`knowledge/` 是 Knowledge / 知识资料库：

- 面向 PDF、Markdown、TXT、HTML、JSON、代码文档、网页归档等低频变更资料。
- 支持自动切片、文件监听、document/chunk 结构、文件路径出处和章节上下文。
- 使用 TriviumDB 类后端保存向量、payload、文本索引和图关系。
- 使用独立 manifest SQLite 记录文件 hash、mtime、chunk node id 和库元数据。
- 不写入 Recall 域 `recall_entries`，不参与 Recall tag pool、priority、运行时引用关系和召回引擎。

关键原则：

- 删除 `recall-vectors.db` 后，应用仍应能启动、浏览思绪源内容、执行关键词检索，并显示需要重新向量化。
- `recall-vectors.db` 中的数据必须能由 `recall.db`、当前模型配置和检索配置重新生成。
- `recall-vectors.db` 不能反向成为源内容状态、思绪集合列表或用户配置的唯一依据。
- Recall 条目不绑定 Agent、会话或消息。Agent 通过 binding、占位符和工具参数决定本次读取或写入哪些思绪集合。
- 初期不建议拆成每个思绪集合一个向量 DB。跨集合检索、迁移、tag pool、全局模型统计和清理逻辑都会明显变复杂。
- 删除某个 `{libraryId}.tdb` 后，只影响对应知识资料库的文档检索能力，不应影响 Recall 思绪域。
- Knowledge manifest 是文件索引与同步状态，不是 Recall 源内容真源。

建议 Rust 后端直接访问数据库。Recall 前端通过 `recall_*` Tauri commands 访问，不让前端直接用 SQL 插件读写数据。

目标结构：

```text
Recall Frontend Vue
  ↓ invoke recall_*
Rust commands
  ↓
RecallRepository trait
  ├── SqliteRecallRepository
  └── LegacyFileRecallImporter 仅迁移/回退期使用
  ↓
recall/recall.db + recall/recall-vectors.db

KnowledgeRepository / KnowledgeLibraryRepository trait
  ├── SqliteKnowledgeManifestRepository
  └── TriviumKnowledgeRepository
  ↓
knowledge/knowledge_meta.db + knowledge/libraries/{libraryId}.tdb

Rust runtime
  ├── InMemoryDatabase
  ├── TextInvertedIndex
  ├── VectorMatrix
  └── ModelTagPool + HNSW
```

### 4.1 TriviumDB 知识资料库追加设计

TriviumDB 适合作为 Knowledge / 知识资料库后端，而不建议直接替代 Recall / 思绪域的 `recall.db + recall-vectors.db`。

适用范围：

- 大规模、低频变更、以文件为边界的传统资料。
- 需要自动切片、BM25 稀疏召回、向量召回、图扩散和来源追溯的场景。
- 需要按资料库独立加载、关闭和重建的场景。

不适用范围：

- Recall entry 主数据。
- 用户人工整理的记忆、经验、项目判断和长期上下文。
- Recall engine 所依赖的标签之海、priority 和运行时派生联想关系。

推荐目录：

```text
appData/knowledge/
├── knowledge_meta.db
└── libraries/
    ├── {libraryId}.tdb
    ├── {libraryId}.tdb.vec         # 默认 Mmap 模式的向量基础层
    ├── {libraryId}.tdb.wal         # 运行期 WAL
    ├── {libraryId}.tdb.lock        # 进程级独占锁
    └── {libraryId}.tdb.flush_ok    # .tdb / .vec 一致性提交标记
```

知识资料库数据模型：

```text
library
  ├── document node
  │   ├── source_path
  │   ├── title
  │   ├── checksum
  │   └── file metadata
  └── chunk nodes
      ├── source_path
      ├── chunk_index
      ├── text_preview
      ├── checksum
      └── optional section / heading metadata

graph edges
  document -[contains]-> chunk
  chunk[i] -[next]-> chunk[i+1]
  chunk[i+1] -[prev]-> chunk[i]
```

关键约束：

- 同一 `.tdb` 同一时刻只能由一个后端实例打开，Tauri 后端必须集中管理句柄。
- TriviumDB 0.7.0 默认 Mmap 模式不是逻辑上的单文件部署；备份、移动、删除和恢复必须把 `.tdb`、`.vec`、`.wal`、`.lock`、`.flush_ok` 作为一个 library 文件组处理。ROM 模式才会把向量合并回单文件。
- Payload 不应保存全文。百万级 chunk 时 payload 和图关系会带来常驻内存压力，全文应从源文件或专门正文存储回源读取。
- TriviumDB 自身不是文件索引器，需要 `knowledge_meta.db` 记录文件和 chunk 到 node id 的映射，支持精准更新和删除。
- 知识资料库可以按 library 拆成多个 `.tdb`，这与 Recall 不建议按思绪集合拆向量 DB 不冲突。Knowledge 天然以资料集隔离，跨库检索由路由层合并结果。
- 切片功能只属于 Knowledge 域。Recall 思绪域不提供自动切片入口。

推荐 manifest schema：

```sql
CREATE TABLE knowledge_libraries (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  root_path TEXT,
  db_path TEXT NOT NULL,
  embedding_model_id TEXT NOT NULL,
  dimension INTEGER NOT NULL,
  config_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE knowledge_files (
  id TEXT PRIMARY KEY,
  library_id TEXT NOT NULL,
  source_path TEXT NOT NULL,
  checksum TEXT NOT NULL,
  mtime INTEGER NOT NULL,
  size INTEGER NOT NULL,
  doc_node_id INTEGER,
  status TEXT NOT NULL DEFAULT 'ready',
  updated_at INTEGER NOT NULL,
  UNIQUE(library_id, source_path),
  FOREIGN KEY (library_id) REFERENCES knowledge_libraries(id) ON DELETE CASCADE
);

CREATE TABLE knowledge_chunks (
  id TEXT PRIMARY KEY,
  library_id TEXT NOT NULL,
  file_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  node_id INTEGER NOT NULL,
  checksum TEXT NOT NULL,
  heading TEXT,
  start_offset INTEGER,
  end_offset INTEGER,
  UNIQUE(library_id, file_id, chunk_index),
  FOREIGN KEY (library_id) REFERENCES knowledge_libraries(id) ON DELETE CASCADE,
  FOREIGN KEY (file_id) REFERENCES knowledge_files(id) ON DELETE CASCADE
);

CREATE INDEX idx_knowledge_files_library ON knowledge_files(library_id);
CREATE INDEX idx_knowledge_chunks_file ON knowledge_chunks(file_id);
CREATE INDEX idx_knowledge_chunks_node ON knowledge_chunks(library_id, node_id);
```

检索路由：

```text
retrievalMode = "recall"
  -> Recall 思绪域
  -> semantic / associative profile

retrievalMode = "knowledge"
  -> Knowledge 知识资料库
  -> TriviumDB search_hybrid / search_advanced

retrievalMode = "mixed"
  -> 双路召回
  -> 结果标注 sourceType 后统一 rerank / merge
```

结果必须带来源类型：

```ts
type RetrievalSourceType = "recall" | "knowledge";

interface KnowledgeHit {
  sourceType: "knowledge";
  libraryId: string;
  libraryName: string;
  sourcePath: string;
  chunkIndex: number;
  score: number;
  text: string;
  heading?: string;
}
```

---

## 5. 数据库选型建议

### 5.1 推荐 `rusqlite`

理由：

- 当前 `knowledge` 后端大量代码是同步函数和 `RwLock` 内存模型。
- 向量 BLOB、事务批量写入、schema migration 用 `rusqlite` 足够直接。
- 避免为了 `sqlx` 引入较大 async 改造。
- 知识库写入路径由 Rust command 控制，数据库操作不需要暴露给前端。

当前建议锁定：

```toml
rusqlite = {
  version = "=0.39.0",
  default-features = false,
  features = ["bundled", "backup", "cache"]
}
```

选择说明：

- `bundled` 保证桌面端使用一致的 SQLite 构建，并已确认底层启用 FTS5。
- `backup` 用于迁移前备份和后续在线备份。
- `cache` 支持高频固定查询使用 prepared statement cache。
- 不使用 `bundled-full`，避免无需求地启用 load extension、CSV vtab、hooks 等大范围能力。
- 不使用最新 `0.40.1`，直到项目工具链升级并重新验证。
- SQLite 调用保持在 Rust 后端；前端不得直接打开数据库。

并发策略第一阶段使用单 writer、短事务和现有 Tokio blocking 调度，不新增连接池。只有性能基准证明单连接成为瓶颈后，才评估 reader connection 或 pool。

Knowledge 第一版可用 SQLite FTS5 建立稀疏索引。中文文本由现有 `jieba-rs` 预分词后写入专用 FTS 列，原文仍保存在 chunk 源记录或源文件中；不依赖 SQLite 默认 tokenizer 直接完成中文分词。

### 5.2 可选 `sqlx`

适合后续如果项目统一转向 async DB 层，或希望 compile-time checked query。但当前阶段会增加迁移面，不是最小风险路径。

### 5.3 Knowledge 域可实验 `triviumdb`

Knowledge / 知识资料库可以单独实验 TriviumDB，但不应阻塞 Recall 主存储数据库化。

当前调查结论：

- npm 最新版本为 `triviumdb@0.7.1`，crates.io 当前可见版本为 `triviumdb@0.7.0`。
- Node 绑定已暴露 `insert`、`batchInsert`、`link`、`search`、`searchHybrid`、`searchAdvanced`、`indexText`、`buildTextIndex`、`filterWhere`、`query`、`flush`、`migrate` 等能力。
- Rust crate 默认 feature 不启用 Node / Python binding，可直接作为 Tauri Rust 依赖；本轮 Windows 与 Android target 编译探针已通过。
- crate 使用 Rust 2024 edition、mmap、WAL 和进程级独占文件锁。编译通过不代表 iOS、移动端后台切换、大文件 mmap 和异常恢复已经验证。
- crate 内置字符 2-Gram BM25、向量检索和图扩散；采用它后不应再并行引入 Tantivy 或另一套 ANN。
- 建议精确锁定 `triviumdb = "=0.7.0"`，并通过 `KnowledgeLibraryRepository` 隔离 API。升级前必须验证现有 library 文件组的可读性和迁移策略。
- 如果 Rust crate 接入成本过高，可以先保留 Knowledge repository 抽象，后端实现从 SQLite manifest + 当前内存检索起步，后续替换为 TriviumDB。

建议实验依赖：

```toml
triviumdb = { version = "=0.7.0", optional = true }

[features]
knowledge-trivium = ["dep:triviumdb"]
```

### 5.4 Knowledge 文件监听

稳定版建议：

```toml
[target.'cfg(not(any(target_os = "android", target_os = "ios")))'.dependencies]
notify-debouncer-full = "=0.6.0"
```

- 使用 full debouncer 而不是直接消费原始 notify 事件，保留 rename / delete / create 的稳定关联和去重能力。
- `notify-debouncer-full` 会重导出 `notify`，通常不需要再声明直接依赖。
- watcher 只负责产生稳定文件事件，实际导入进入持久化 ingest queue，不在 watcher callback 中直接解析和向量化。
- 移动端第一阶段不启用文件夹监听，避免把移动平台文件权限、后台生命周期和 watcher 差异绑进桌面端施工。

### 5.5 第一轮明确不新增的依赖

- `tantivy`：FTS5 或 TriviumDB 已覆盖第一阶段 BM25；再增加 Tantivy 会形成第三套索引生命周期和 tokenizer。
- `sqlx` / `tauri-plugin-sql`：会扩大 async 改造面或把数据库暴露给前端。
- `r2d2_sqlite` / `deadpool-sqlite`：没有基准证明需要连接池。
- `rusqlite_migration`：当前最新版要求 Rust 1.95；项目自有 `schema_migrations` 已足够。
- `pdf-extract` / `lopdf` / Rust DOCX parser：先复用现有前端解析器与明确的 import adapter。
- `usearch` 或其他 ANN：Recall 已有 HNSW；Knowledge 选择 TriviumDB 后不再叠加同类后端。
- `bytemuck`：向量 BLOB 必须显式使用 little-endian，继续采用 `f32::to_le_bytes`，不为切片转换新增直接依赖。

---

## 6. 建议 Schema

Schema 按数据库归属分层：

- `recall/recall.db`：Recall 稳定源内容和用户配置，迁移必须保守。
- `recall/recall-vectors.db`：Recall 向量、tag pool，以及后续按基准需要增加的可重建算法缓存；允许更积极地按算法版本演进。
- `knowledge/knowledge_meta.db`：Knowledge library manifest、文件索引和 chunk 到 node id 的映射。
- `knowledge/libraries/{libraryId}.tdb`：Knowledge library 的检索后端数据。

### 6.1 `recall_collections`

思绪集合元数据表，位于 `recall.db`。

```sql
CREATE TABLE recall_collections (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  author TEXT,
  icon TEXT,
  tags_json TEXT NOT NULL DEFAULT '[]',
  config_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_recall_collections_updated_at ON recall_collections(updated_at DESC);
```

### 6.2 `recall_entries`

Recall entry 主表，位于 `recall.db`。旧版 CAIU entry 在迁移时转换为 Recall entry。

```sql
CREATE TABLE recall_entries (
  id TEXT PRIMARY KEY,
  collection_id TEXT NOT NULL,
  key TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  tags_json TEXT NOT NULL DEFAULT '[]',
  assets_json TEXT NOT NULL DEFAULT '[]',
  priority INTEGER NOT NULL DEFAULT 100,
  enabled INTEGER NOT NULL DEFAULT 1,
  content_hash TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (collection_id) REFERENCES recall_collections(id) ON DELETE CASCADE
);

CREATE INDEX idx_recall_entries_collection_updated ON recall_entries(collection_id, updated_at DESC);
CREATE INDEX idx_recall_entries_collection_key ON recall_entries(collection_id, key);
CREATE INDEX idx_recall_entries_collection_enabled ON recall_entries(collection_id, enabled);
CREATE INDEX idx_recall_entries_content_hash ON recall_entries(content_hash);
```

说明：

- `tags_json` 保留 `TagWithWeight[]` 原结构，避免初期拆表导致前后端类型大改。
- `assets_json` 保留 `AssetRef[]`。
- `created_at` 是条目首次创建时间，`updated_at` 是最后修改时间；两者从第一版 schema 起就是必需源字段，与是否实现时间衰减无关。旧数据迁移必须保留原值，确实缺失时才使用迁移时刻并记录告警。
- 不增加 Agent、会话、分支或消息归属列；这些信息不参与当前条目读取、检索或清理。
- Rust `Caiu.refs/ref_by` 带有 `serde(skip)`，继续由运行时计算，不增加持久化关系表。
- 第一阶段不为时间衰减额外新增 `occurred_at`。`created_at` 表示存档创建时间；如后续确有区分“存档创建时间”和“内容所述事件发生时间”的需求，再单独定义事件日期字段及迁移语义。
- 后续如需要高频标签统计，可增加 `recall_entry_tags` 规范化表。

### 6.3 `recall_entry_vectors`

条目向量表，位于 `recall-vectors.db`。

```sql
CREATE TABLE recall_entry_vectors (
  collection_id TEXT NOT NULL,
  entry_id TEXT NOT NULL,
  model_id TEXT NOT NULL,
  dimension INTEGER NOT NULL,
  vector_blob BLOB NOT NULL,
  tokens INTEGER NOT NULL DEFAULT 0,
  content_hash TEXT,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (collection_id, entry_id, model_id)
);

CREATE INDEX idx_recall_entry_vectors_model ON recall_entry_vectors(model_id);
CREATE INDEX idx_recall_entry_vectors_entry ON recall_entry_vectors(entry_id);
```

说明：

- `vector_blob` 使用 `f32` little-endian 二进制展开存储。
- `content_hash` 用于判断向量是否对应当前内容。
- SQLite 不支持跨数据库外键。`recall-vectors.db` 不声明指向 `recall.db` 的 FK；孤儿清理和级联删除由 repository 根据 `collection_id` / `entry_id` 执行，内容一致性由 hash 派生。
- `vector_status` 不建议作为主字段持久化，应由 `recall_entries.content_hash` 与 `recall_entry_vectors.content_hash` 派生。
- 后续支持多模态检索时，建议升级为更通用的 `recall_embeddings`：
  - `target_type`：`entry` / `chunk` / `asset` / `tag`。
  - `target_id`：目标对象 ID。
  - `modality`：`text` / `image` / `audio` / `video` / `mixed`。
  - 继续保留 `model_id`、`dimension`、`vector_blob`、`content_hash`。
  - 这样新增图片 embedding、OCR chunk embedding、音频转写 embedding 时，不需要为每种模态新增一套向量表。

### 6.4 `recall_models`

每个思绪集合的模型索引和统计表，替代 `vectors/{kbId}/models.json`，位于 `recall-vectors.db`。

```sql
CREATE TABLE recall_models (
  collection_id TEXT NOT NULL,
  model_id TEXT NOT NULL,
  dimension INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  last_indexed_at INTEGER,
  PRIMARY KEY (collection_id, model_id)
);
```

### 6.5 `recall_tag_vectors`

全局标签向量池，按模型隔离，位于 `recall-vectors.db`。

```sql
CREATE TABLE recall_tag_vectors (
  model_id TEXT NOT NULL,
  tag TEXT NOT NULL,
  tag_index INTEGER NOT NULL,
  dimension INTEGER NOT NULL,
  vector_blob BLOB NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (model_id, tag)
);

CREATE UNIQUE INDEX idx_recall_tag_vectors_model_index
ON recall_tag_vectors(model_id, tag_index);
```

说明：

- 替代 `tag_pool/{modelHash}/registry.json + vectors.bin`。
- HNSW index 继续不入库，启动或首次使用时从该表重建。

### 6.6 `recall_workspace`

可选表，位于 `recall.db`。用于保存 Recall 域的工作区配置，替代前端 `workspace.json` 中不稳定的索引部分。

```sql
CREATE TABLE recall_workspace (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL
);
```

建议：

- `config` 和 `lastActiveCollectionId` 可以继续暂存在前端 `workspace.json`，短期减少改动。
- collection 列表不应继续作为前端真源，应由 `recall_list_collections` 从数据库返回。

### 6.7 `schema_migrations`

```sql
CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at INTEGER NOT NULL
);
```

Recall 主库、Recall 向量库和 Knowledge manifest 库应各自维护 migration 记录。可以使用同名 `schema_migrations` 表，但版本号语义应按数据库独立管理，不要让向量库的算法缓存迁移阻塞主库源内容读取。

### 6.8 算法缓存暂缓

VCP TagMemo V9.1 使用版本化派生资产解决复杂图计算的原子发布和缓存复用问题，但 AIO 第一阶段只是把现有文件存储迁移到 SQLite，不预建召回路径、召回边或认知状态表。

只有基准证明某项 associative 计算需要跨请求复用时，才在 `recall-vectors.db` 增加带 `algorithm_version`、`config_hash` 和 `source_hash` 的可删除缓存。该能力不得反向改变 `recall.db` 的条目 schema。

---

## 7. Repository 层设计

新增后端模块建议：

```text
src-tauri/src/recall/storage/
├── commands.rs
├── repository.rs
├── sqlite.rs
├── migrations.rs
├── vector_migrations.rs
├── vector_blob.rs
└── legacy_import.rs
```

### 7.1 Recall Repository 接口

建议抽象出最小必要接口：

```rust
pub trait RecallRepository: Send + Sync {
    fn initialize(&self) -> Result<(), String>;

    fn list_collections(&self) -> Result<Vec<RecallCollection>, String>;
    fn load_collection(&self, collection_id: Uuid) -> Result<Option<RecallCollection>, String>;
    fn save_collection(&self, collection: &RecallCollection) -> Result<(), String>;
    fn delete_collection(&self, collection_id: Uuid) -> Result<(), String>;

    fn load_entries(&self, collection_id: Uuid) -> Result<Vec<RecallEntry>, String>;
    fn load_entry(&self, collection_id: Uuid, entry_id: Uuid) -> Result<Option<RecallEntry>, String>;
    fn upsert_entry(&self, collection_id: Uuid, entry: &RecallEntry) -> Result<(), String>;
    fn upsert_entries(&self, collection_id: Uuid, entries: &[RecallEntry]) -> Result<(), String>;
    fn delete_entries(&self, collection_id: Uuid, entry_ids: &[Uuid]) -> Result<(), String>;

    fn upsert_entry_vector(
        &self,
        collection_id: Uuid,
        entry_id: Uuid,
        model_id: &str,
        vector: &[f32],
        tokens: Option<u32>,
        content_hash: Option<&str>,
    ) -> Result<(), String>;

    fn load_vectors(
        &self,
        collection_id: Uuid,
        model_id: &str,
    ) -> Result<Option<(Vec<(Uuid, Vec<f32>)>, usize, usize)>, String>;

    fn delete_vectors_for_entries(&self, collection_id: Uuid, entry_ids: &[Uuid]) -> Result<(), String>;
    fn clear_vectors_except_model(&self, collection_id: Option<Uuid>, keep_model_id: &str) -> Result<u32, String>;

    fn load_tag_pool(&self, model_id: &str) -> Result<ModelTagPool, String>;
    fn save_tag_pool(&self, pool: &ModelTagPool) -> Result<(), String>;
}
```

该接口的重点不是一次性抽象完美，而是把 commands 从直接文件 IO 中解耦出来。

### 7.2 向量 BLOB 编解码

建议集中在 `vector_blob.rs`：

- `Vec<f32> -> Vec<u8>`：`f32::to_le_bytes`
- `&[u8] -> Vec<f32>`：按 4 字节 chunks 解析
- 校验 `bytes.len() % 4 == 0`
- 校验 `vector.len() == dimension`

---

## 8. 迁移约束

本调查只记录数据库迁移必须满足的不变量，不维护施工阶段。具体步骤、发布边界和完成门槛见 [Recall / Knowledge 领域拆分与重构实施计划](./recall-knowledge-domain-restructure-implementation-plan.md)。

约束如下：

- 旧 `appData/knowledge/bases|vectors|tag_pool` 直接导入最终 `appData/recall/recall.db + recall-vectors.db`，不建立过渡性的 Recall JSON 目录。
- 已发布的 `aiohub.knowledge-library` `.aio-kb` v1 和 legacy `KnowledgeBase { meta, entries }` JSON / YAML 也是正式恢复输入；它们用于用户主动恢复，不替代正常启动时对旧 appData 的自动迁移。
- 旧集合 ID 和条目 ID 原样保留；字段只改变领域名称，不重新生成 UUID。
- 主库和向量库分别维护 migration 状态。主库失败必须阻止 Recall 继续写入；向量库失败可以降级为待重建状态。
- 导入必须幂等。损坏 JSON、无法反查的模型 ID 和维度不一致向量进入迁移报告，不中断其他有效源条目导入。
- `createdAt`、`updatedAt`、priority、enabled、TagWithWeight 和 AssetRef 原值保留；`refs/refBy`、矩阵、HNSW 和算法中间结果重建。
- 旧目录在迁移成功后保持只读，不自动删除。
- 结构化 Agent binding 保留原集合 ID 并自动迁移；自由文本占位符的处理策略由总施工计划定义，不属于数据库 schema。
- Recall 主库、Recall 向量库和 Knowledge manifest 不声明跨库外键，也不承诺跨库强事务。
- 源内容先在 `recall.db` 短事务提交，再同步内存读模型；内容 hash 变化后对 `recall-vectors.db` 执行幂等清理。
- 派生向量清理失败时，hash 不匹配必须保证旧向量不会被判断为 ready。
- Recall collection 列表由数据库返回，前端 workspace 不再保存第二份列表真源。

---

## 9. 状态派生规则

数据库化后建议减少持久化冗余状态。

### 9.1 `vector_status`

不建议持久化为主字段。

派生规则：

```text
如果存在 recall_entry_vectors(collection_id, entry_id, model_id)
并且 recall_entry_vectors.content_hash == recall_entries.content_hash
则 vectorStatus = ready
否则 vectorStatus = none
```

这能避免内容更新后 meta 状态和真实向量不一致。

### 9.2 `vectorized_models`

派生自：

```sql
SELECT model_id
FROM recall_entry_vectors
WHERE collection_id = ? AND entry_id = ? AND content_hash = ?
```

如果前端类型仍需要 `vectorizedModels` 字段，可在 Rust 返回 `RecallCollection` 时动态填充。

### 9.3 `total_tokens`

条目级 tokens 来自 `recall_entry_vectors.tokens`。

思绪集合级 tokens 可按模型聚合，也可以维护在 `recall_models.total_tokens`。若维护统计字段，必须在向量写入/删除事务中同步更新。

### 9.4 查询修饰符不进入主库状态

`created_at` / `updated_at` 始终属于条目基础数据。时间衰减、Tag 定向增强等后续能力属于 binding、占位符或单次请求参数；它们可以在查询 trace 中记录本次计算值，但不回写 entry，也不要求主库预先增加额外生命周期字段。第一阶段不实现时间衰减。

---

## 10. 需要特别注意的坑点

### 10.1 内容更新必须清理旧向量

当前 `kb_upsert_entry` 检测 content hash 变化后会删除旧向量文件。数据库化后不能把两个数据库描述成同一事务，正确顺序是：

1. 在 `recall.db` 事务中更新 entry 和 `content_hash` 并提交。
2. 更新内存 `vector_store`；失败时由下一次 warmup 修复。
3. 幂等删除 `recall-vectors.db` 中该 entry 的旧向量；删除失败时依靠 hash 不匹配派生为未向量化。
4. 返回前端时显示未向量化，并允许后续重新生成向量。

### 10.2 批量写入不能逐条提交

`kb_batch_upsert_entries` 和向量同步高频调用，必须用事务批量提交，否则 SQLite 写性能会退化。

### 10.3 `InMemoryBase::remove_entry` 当前依赖 entries 缓存

当前 `remove_entry` 只有在 `base.entries.remove(id)` 命中时才会清理 `meta.entries`、倒排索引和向量矩阵。数据库化后如果允许懒加载，需要确保删除路径能清理 meta/index，即使完整 entry 未加载。

### 10.4 标签池模型 ID 与 safe model ID

当前文件目录使用 `get_safe_model_id(model_id)`。数据库表应保存原始 `model_id`，不要继续用 safe model ID 作为业务主键。迁移旧数据时再处理 safe ID 反查。

### 10.5 前端 `workspace.bases` 必须降级

如果只把 Rust 后端改成 SQLite，而前端仍保存独立 `workspace.bases`，数据库化无法彻底解决列表漂移问题。

### 10.6 导出功能仍需稳定 JSON 格式

`kb_export_base` 当前返回 `KnowledgeBase { meta, entries }`。迁移器必须继续读取该 legacy JSON / YAML 格式，但它缺少资产二进制、格式版本和完整性信息，只能作为内容恢复兼容输入。

数据库化前先实现版本化 `.aio-kb` v1：每个包只对应一个库，包含 manifest、`library.json` 和被引用资产；一次全量导出仍按库生成多个独立包。向量、tag pool、HNSW 和运行时索引不进入包，恢复后重建。完整格式、冲突策略和发布门槛见 [重构前按库备份与恢复功能计划](./pre-restructure-library-backup-import-export-plan.md)。

新的 Recall 导出使用带格式版本的 `aiohub.recall-collection`，但 `LegacyFileRecallImporter` 必须长期只读兼容 `.aio-kb` v1，不得要求用户先回退到旧版应用转换备份。

### 10.7 备份不能直接复制内存读模型

当前 `kb_warmup` 异步加载完整条目，而 `kb_export_base` 直接复制 `InMemoryBase.entries`。用户在预热完成前触发导出时，不能用“通常已经加载完”作为完整性保证。

重构前备份命令必须从文件持久化真源读取，或在命令内部显式完成全量加载和数量校验；压缩资产时不得长期持有知识库写锁。导出先写临时文件，ZIP 可重新打开且 manifest checksum 复核通过后再原子重命名。导入使用 staging 目录，后端库目录提交成功后才更新前端 workspace。

---

## 11. 测试建议

### 11.1 Repository 单元测试

- 初始化空数据库。
- 创建知识库。
- upsert entry。
- batch upsert entry。
- patch entry。
- delete entry。
- upsert vector。
- load vectors。
- clear vectors。
- tag pool save/load。
- legacy import 幂等。
- `.aio-kb` v1 单库导出、批量按库导出、legacy JSON / YAML 读取、资产 hash 去重、冲突副本和显式替换。
- ZIP 路径穿越、checksum 错误、重复条目 ID、超限解压和中断 staging 回滚。
- 删除 `recall.db` 中的 collection / entry 后，向量库孤儿清理幂等且可重试。
- 删除或重建 `recall-vectors.db` 不影响 Recall 条目浏览、编辑和关键词检索。

### 11.2 迁移测试

准备一份旧版 `appData/knowledge` fixture：

- 多知识库。
- 多 entries。
- 重构前 `.aio-kb` v1 和 legacy JSON / YAML 备份。
- 多模型向量。
- 部分损坏 `.vec`。
- 缺失 `models.json`。
- tag pool 有 registry 但 vectors 长度不匹配。

验证迁移后：

- `recall_list_collections` 数量一致。
- `recall_load_collection` 条目一致。
- `recall_load_entry` 内容一致。
- `recall_check_vector_coverage` 结果符合预期。
- `recall_search` 关键词搜索结果一致。
- 加载同模型向量后，向量搜索结果基本一致。
- Agent binding 和工具调用仍可组合同一思绪集合，数据库迁移不引入 Agent 所有权限制；旧自由文本占位符按总施工计划产生迁移报告。

### 11.3 性能基准

至少比较：

- 冷启动 warmup 耗时。
- 加载指定模型向量耗时。
- 批量导入 100 / 1000 条耗时。
- 批量写入 100 / 1000 个向量耗时。
- keyword / vector / lens / blender 检索耗时。
- Knowledge 资料库 100 / 1000 / 10000 chunk 入库耗时。
- Knowledge search_hybrid 查询耗时、跨库合并耗时和结果回源读取耗时。
- TriviumDB Windows / macOS / Linux 的 library 文件组恢复、锁冲突和异常退出恢复。

---

## 12. 实施关系

数据库调查不再维护 Recall 数据库化和 Knowledge 实验线的具体顺序。统一施工阶段、发布边界、依赖启用时机和完成门槛见 [Recall / Knowledge 领域拆分与重构实施计划](./recall-knowledge-domain-restructure-implementation-plan.md)。

---

## 13. 结论

`knowledge-base` 的数据库化应分成两条边界清晰的路线：

- Recall / 思绪域：聚焦“可靠持久层 + 稳定迁移 + 消除多真源漂移”，数据库层不承担检索算法融合。
- Knowledge / 知识资料库：单开传统 RAG 资料馆，支持自动切片、文件同步、BM25 + 向量 + 图扩散和来源追溯。

推荐最终状态：

- `recall.db` 是 Recall 思绪域唯一不可丢的源内容真源。
- `recall-vectors.db` 保存 Recall 可重建的向量、tag pool，以及后续按基准需要增加的算法缓存。
- Recall 条目是无状态存档，不绑定 Agent、会话、分支或消息；Agent 编排关系继续保存在配置、占位符和单次工具参数中。
- `InMemoryDatabase` 是 Recall 可重建的运行时读模型。
- 向量和标签池进入 SQLite，但矩阵、HNSW 和算法融合结果仍以可重建读模型或 artifact 处理。
- `knowledge/` 保存传统文档知识资料库，每个 library 可对应独立 `.tdb`。
- Knowledge 使用 `knowledge_meta.db` 做文件和 chunk manifest，不写入 Recall `recall_entries`。
- 自动切片只属于 Knowledge 域，Recall 不提供自动切片入口。
- 前端不直接读写知识库数据库。
- `workspace.json` 不再保存知识库列表真源。

这样可以在控制风险的前提下解决当前文件系统存储的长期维护问题，同时保留 Rust 检索后端已有的性能优势，并为 TriviumDB 类 Knowledge 资料库留出独立演进空间。
