# Knowledge Base 后端存储数据库化设计调查

**状态**: 调查完成，待实施  
**创建日期**: 2026-06-23  
**适用范围**: `src/tools/knowledge-base/`、`src-tauri/src/knowledge/`

---

## 0. 2026-07-01 修订决定

本轮修订采用更激进的结构和命名边界：后续数据库化不再把 CAIU 与传统 RAG 资料都包装成“知识库”的不同形态，而是明确拆成两个域。

- **Thought / 思绪域**：承载现有 CAIU 条目、标签、priority、refs/refBy、思绪联想、语义召回和 thought engine。旧版文件系统中的 `bases/entries/vectors/tag_pool` 在数据库化迁移时转换到该域。
- **Knowledge / 知识域**：承载 PDF、Markdown、网页、手册、论文、代码资料包等传统资料检索，采用 document/chunk/source 结构，支持切片、文件同步、BM25、向量和图扩散。
- 不再使用“冷知识库 / coldKnowledge”作为产品命名或长期 API 命名。此前文档中的 cold knowledge 语义统一改为 **Knowledge / 知识资料库**。
- 因为数据库化尚未开始，迁移阶段应一次性完成命名和 schema 转换，不再为了旧文件目录里的 `knowledge` / `kb_*` 命名额外保守。
- 兼容层只保留在命令/API 边界，例如短期仍可保留 `kb_*` Tauri command；数据库、内部 repository、新类型和 UI 文案应使用 `thought` 与 `knowledge`。

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

- Thought 域的 base meta、entry index、entry vectors、model coverage 入 SQLite。
- HNSW index 继续作为内存派生结构。
- `VectorMatrix` 继续作为检索时内存结构。
- Thought 域 `tag_pool` 的 registry 和 vector 数据可以进入 SQLite，但 HNSW 索引不持久化，按需重建。

---

## 4. 推荐目标架构

采用 knowledge-base 专属数据目录，但按语义域拆成 Thought 与 Knowledge。数据库化是一次结构重命名机会，不再沿用 `knowledge.db` 承载 CAIU 的旧语义。

```text
appData/knowledge/
├── thought.db
├── thought-vectors.db
└── knowledge/
    ├── knowledge_meta.db
    └── libraries/
        └── {libraryId}.tdb
```

这仍符合项目内已有移动端 SQLite 计划中的“一模块自有数据库”方向，避免把工具数据混入全局数据库，同时把思绪源内容、大体积可重建检索资产、传统资料知识库隔离开。

`thought.db` 是 Thought / 思绪域唯一不可丢的主库：

- 思绪库元数据。
- CAIU / thought entry 源内容。
- Thought assets / segments 等可检索对象的源记录。
- 内容 hash、基础配置、workspace 中的知识库列表真源。

`thought-vectors.db` 是 Thought / 思绪域派生检索资产库：

- entry / asset embeddings。
- 后续如 Thought 内部需要 segment，不等同于 Knowledge 域自动 chunk。
- 模型覆盖、tokens 统计和向量化时间。
- tag vectors。
- 预计算召回 artifact、召回边、召回路径和算法版本缓存。

`knowledge/` 是 Knowledge / 知识资料库：

- 面向 PDF、Markdown、TXT、HTML、JSON、代码文档、网页归档等低频变更资料。
- 支持自动切片、文件监听、document/chunk 结构、文件路径出处和章节上下文。
- 使用 TriviumDB 类后端保存向量、payload、文本索引和图关系。
- 使用独立 manifest SQLite 记录文件 hash、mtime、chunk node id 和库元数据。
- 不写入 Thought 域 `thought_entries`，不参与 Thought tag pool、refs/refBy、priority 和思绪引擎。

关键原则：

- 删除 `thought-vectors.db` 后，应用仍应能启动、浏览思绪源内容、执行关键词检索，并显示需要重新向量化。
- `thought-vectors.db` 中的数据必须能由 `thought.db`、当前模型配置和检索配置重新生成。
- `thought-vectors.db` 不能反向成为源内容状态、思绪库列表或用户配置的唯一依据。
- 初期不建议拆成每个知识库一个向量 DB。跨库检索、迁移、tag pool、全局模型统计和清理逻辑都会明显变复杂。
- 删除某个 `{libraryId}.tdb` 后，只影响对应知识资料库的文档检索能力，不应影响 Thought 思绪域。
- Knowledge manifest 是文件索引与同步状态，不是 Thought 源内容真源。

建议 Rust 后端直接访问数据库。前端继续通过现有 `kb_*` Tauri commands 访问，不建议让前端直接用 SQL 插件读写知识库数据。

目标结构：

```text
Frontend Vue
  ↓ invoke kb_*
Rust commands
  ↓
ThoughtRepository trait
  ├── SqliteThoughtRepository
  └── LegacyFileThoughtImporter 仅迁移/回退期使用
  ↓
thought.db + thought-vectors.db

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

TriviumDB 适合作为 Knowledge / 知识资料库后端，而不建议直接替代 Thought / 思绪域的 `thought.db + thought-vectors.db`。

适用范围：

- 大规模、低频变更、以文件为边界的传统资料。
- 需要自动切片、BM25 稀疏召回、向量召回、图扩散和来源追溯的场景。
- 需要按资料库独立加载、关闭和重建的场景。

不适用范围：

- Thought entry 主数据。
- 用户人工整理的记忆、经验、项目判断和长期上下文。
- TagMemo / thought 引擎所依赖的标签之海、refs/refBy、priority 和记忆联想关系。

推荐目录：

```text
appData/knowledge/knowledge/
├── knowledge_meta.db
└── libraries/
    ├── {libraryId}.tdb
    └── {libraryId}.tdb.quiver      # 如果 TriviumDB 后端生成独立 ANN 派生索引
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
- Payload 不应保存全文。百万级 chunk 时 payload 和图关系会带来常驻内存压力，全文应从源文件或专门正文存储回源读取。
- TriviumDB 自身不是文件索引器，需要 `knowledge_meta.db` 记录文件和 chunk 到 node id 的映射，支持精准更新和删除。
- 知识资料库可以按 library 拆成多个 `.tdb`，这与 Thought 不建议按思绪库拆向量 DB 不冲突。Knowledge 天然以资料集隔离，跨库检索由路由层合并结果。
- 切片功能只属于 Knowledge 域。Thought 思绪域不提供自动切片入口。

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
retrievalMode = "thought"
  -> Thought 思绪域
  -> semantic / thought preset

retrievalMode = "knowledge"
  -> Knowledge 知识资料库
  -> TriviumDB search_hybrid / search_advanced

retrievalMode = "mixed"
  -> 双路召回
  -> 结果标注 sourceType 后统一 rerank / merge
```

结果必须带来源类型：

```ts
type RetrievalSourceType = "thought" | "knowledge";

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

### 5.2 可选 `sqlx`

适合后续如果项目统一转向 async DB 层，或希望 compile-time checked query。但当前阶段会增加迁移面，不是最小风险路径。

### 5.3 Knowledge 域可实验 `triviumdb`

Knowledge / 知识资料库可以单独实验 TriviumDB，但不应阻塞 Thought 主存储数据库化。

当前调查结论：

- npm 最新版本为 `triviumdb@0.7.1`，crates.io 当前可见版本为 `triviumdb@0.7.0`。
- Node 绑定已暴露 `insert`、`batchInsert`、`link`、`search`、`searchHybrid`、`searchAdvanced`、`indexText`、`buildTextIndex`、`filterWhere`、`query`、`flush`、`migrate` 等能力。
- Rust crate 可作为 Tauri 后端候选，但实际 API、构建体积、平台兼容和锁行为必须在 AIO 仓库内单独验证。
- 如果 Rust crate 接入成本过高，可以先保留 Knowledge repository 抽象，后端实现从 SQLite manifest + 当前内存检索起步，后续替换为 TriviumDB。

---

## 6. 建议 Schema

Schema 按数据库归属分层：

- `thought.db`：Thought 稳定源内容和用户配置，迁移必须保守。
- `thought-vectors.db`：Thought 向量、tag pool、预计算召回等可重建检索资产，允许更积极地按算法版本演进。
- `knowledge/knowledge_meta.db`：Knowledge library manifest、文件索引和 chunk 到 node id 的映射。
- `knowledge/libraries/{libraryId}.tdb`：Knowledge library 的检索后端数据。

### 6.1 `thought_bases`

思绪库元数据表，位于 `thought.db`。

```sql
CREATE TABLE thought_bases (
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

CREATE INDEX idx_thought_bases_updated_at ON thought_bases(updated_at DESC);
```

### 6.2 `thought_entries`

Thought entry 主表，位于 `thought.db`。旧版 CAIU entry 在迁移时转换为 thought entry。

```sql
CREATE TABLE thought_entries (
  id TEXT PRIMARY KEY,
  thought_id TEXT NOT NULL,
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
  FOREIGN KEY (thought_id) REFERENCES thought_bases(id) ON DELETE CASCADE
);

CREATE INDEX idx_thought_entries_base_updated ON thought_entries(thought_id, updated_at DESC);
CREATE INDEX idx_thought_entries_base_key ON thought_entries(thought_id, key);
CREATE INDEX idx_thought_entries_base_enabled ON thought_entries(thought_id, enabled);
CREATE INDEX idx_thought_entries_content_hash ON thought_entries(content_hash);
```

说明：

- `tags_json` 保留 `TagWithWeight[]` 原结构，避免初期拆表导致前后端类型大改。
- `assets_json` 保留 `AssetRef[]`。
- 后续如需要高频标签统计，可增加 `thought_entry_tags` 规范化表。

### 6.3 `thought_entry_vectors`

条目向量表，位于 `thought-vectors.db`。

```sql
CREATE TABLE thought_entry_vectors (
  thought_id TEXT NOT NULL,
  entry_id TEXT NOT NULL,
  model_id TEXT NOT NULL,
  dimension INTEGER NOT NULL,
  vector_blob BLOB NOT NULL,
  tokens INTEGER NOT NULL DEFAULT 0,
  content_hash TEXT,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (thought_id, entry_id, model_id),
  FOREIGN KEY (thought_id) REFERENCES thought_bases(id) ON DELETE CASCADE,
  FOREIGN KEY (entry_id) REFERENCES thought_entries(id) ON DELETE CASCADE
);

CREATE INDEX idx_thought_entry_vectors_model ON thought_entry_vectors(model_id);
CREATE INDEX idx_thought_entry_vectors_entry ON thought_entry_vectors(entry_id);
```

说明：

- `vector_blob` 使用 `f32` little-endian 二进制展开存储。
- `content_hash` 用于判断向量是否对应当前内容。
- `vector_status` 不建议作为主字段持久化，应由 `thought_entries.content_hash` 与 `thought_entry_vectors.content_hash` 派生。
- 后续支持多模态检索时，建议升级为更通用的 `thought_embeddings`：
  - `target_type`：`entry` / `chunk` / `asset` / `tag`。
  - `target_id`：目标对象 ID。
  - `modality`：`text` / `image` / `audio` / `video` / `mixed`。
  - 继续保留 `model_id`、`dimension`、`vector_blob`、`content_hash`。
  - 这样新增图片 embedding、OCR chunk embedding、音频转写 embedding 时，不需要为每种模态新增一套向量表。

### 6.4 `thought_models`

每个思绪库的模型索引和统计表，替代 `vectors/{kbId}/models.json`，位于 `thought-vectors.db`。

```sql
CREATE TABLE thought_models (
  thought_id TEXT NOT NULL,
  model_id TEXT NOT NULL,
  dimension INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  last_indexed_at INTEGER,
  PRIMARY KEY (thought_id, model_id),
  FOREIGN KEY (thought_id) REFERENCES thought_bases(id) ON DELETE CASCADE
);
```

### 6.5 `thought_tag_vectors`

全局标签向量池，按模型隔离，位于 `thought-vectors.db`。

```sql
CREATE TABLE thought_tag_vectors (
  model_id TEXT NOT NULL,
  tag TEXT NOT NULL,
  tag_index INTEGER NOT NULL,
  dimension INTEGER NOT NULL,
  vector_blob BLOB NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (model_id, tag)
);

CREATE UNIQUE INDEX idx_thought_tag_vectors_model_index
ON thought_tag_vectors(model_id, tag_index);
```

说明：

- 替代 `tag_pool/{modelHash}/registry.json + vectors.bin`。
- HNSW index 继续不入库，启动或首次使用时从该表重建。

### 6.6 `thought_workspace`

可选表，位于 `thought.db`。用于保存 knowledge-base 工具中 Thought 域的工作区配置，替代前端 `workspace.json` 中不稳定的索引部分。

```sql
CREATE TABLE thought_workspace (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL
);
```

建议：

- `config` 和 `lastActiveBaseId` 可以继续暂存在前端 `workspace.json`，短期减少改动。
- `bases` 列表不应继续作为前端真源，应由 `kb_list_bases` / 后续 `thought_list_bases` 从数据库返回。

### 6.7 `schema_migrations`

```sql
CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at INTEGER NOT NULL
);
```

Thought 主库、Thought 向量库和 Knowledge manifest 库应各自维护 migration 记录。可以使用同名 `schema_migrations` 表，但版本号语义应按数据库独立管理，不要让向量库的算法缓存迁移阻塞主库源内容读取。

### 6.8 预计算召回资产

预计算召回路径属于 `thought-vectors.db`，定位是可删除、可重建的物化检索资产，而不是源内容真源。

建议先保留为版本化 artifact：

```sql
CREATE TABLE thought_recall_artifacts (
  id TEXT PRIMARY KEY,
  thought_id TEXT,
  artifact_type TEXT NOT NULL,
  algorithm TEXT NOT NULL,
  algorithm_version TEXT NOT NULL,
  model_id TEXT,
  config_hash TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE thought_recall_edges (
  artifact_id TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  score REAL NOT NULL,
  rank INTEGER NOT NULL,
  PRIMARY KEY (artifact_id, source_type, source_id, target_type, target_id, channel),
  FOREIGN KEY (artifact_id) REFERENCES thought_recall_artifacts(id) ON DELETE CASCADE
);

CREATE INDEX idx_thought_recall_edges_source
ON thought_recall_edges(artifact_id, source_type, source_id, rank);
```

说明：

- `algorithm_version` 用于隔离 Lens / Blender / hybrid / rerank 等检索算法升级。
- `config_hash` 记录权重、topK、融合策略等运行配置。
- `source_hash` 记录依赖的 entry / chunk / embedding 版本。
- 算法升级时可以写入新 artifact，旧 artifact 后台清理，避免频繁修改主库 schema。

---

## 7. Repository 层设计

新增后端模块建议：

```text
src-tauri/src/knowledge/storage/
├── mod.rs
├── repository.rs
├── sqlite.rs
├── migrations.rs
├── vector_migrations.rs
├── vector_blob.rs
└── legacy_import.rs
```

### 7.1 Thought Repository 接口

建议抽象出最小必要接口：

```rust
pub trait ThoughtRepository: Send + Sync {
    fn initialize(&self) -> Result<(), String>;

    fn list_bases(&self) -> Result<Vec<KnowledgeBaseMeta>, String>;
    fn load_base_meta(&self, thought_id: Uuid) -> Result<Option<KnowledgeBaseMeta>, String>;
    fn save_base_meta(&self, meta: &KnowledgeBaseMeta) -> Result<(), String>;
    fn delete_base(&self, thought_id: Uuid) -> Result<(), String>;

    fn load_entries(&self, thought_id: Uuid) -> Result<Vec<Caiu>, String>;
    fn load_entry(&self, thought_id: Uuid, entry_id: Uuid) -> Result<Option<Caiu>, String>;
    fn upsert_entry(&self, thought_id: Uuid, entry: &Caiu) -> Result<(), String>;
    fn upsert_entries(&self, thought_id: Uuid, entries: &[Caiu]) -> Result<(), String>;
    fn delete_entries(&self, thought_id: Uuid, entry_ids: &[Uuid]) -> Result<(), String>;

    fn upsert_entry_vector(
        &self,
        thought_id: Uuid,
        entry_id: Uuid,
        model_id: &str,
        vector: &[f32],
        tokens: Option<u32>,
        content_hash: Option<&str>,
    ) -> Result<(), String>;

    fn load_vectors(
        &self,
        thought_id: Uuid,
        model_id: &str,
    ) -> Result<Option<(Vec<(Uuid, Vec<f32>)>, usize, usize)>, String>;

    fn delete_vectors_for_entries(&self, thought_id: Uuid, entry_ids: &[Uuid]) -> Result<(), String>;
    fn clear_vectors_except_model(&self, thought_id: Option<Uuid>, keep_model_id: &str) -> Result<u32, String>;

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

## 8. 迁移策略

### Phase 1: 引入数据库和 Repository，不改前端契约

目标：

- 新增 `thought.db` 和 `thought-vectors.db`
- 新增 `knowledge/knowledge_meta.db` 的空 schema，为后续 Knowledge 域预留正式入口
- 新增 repository 层
- `kb_initialize` 创建数据库和 schema
- 现有 `kb_*` command 名称、参数、返回结构保持不变

这一阶段前端不应感知存储实现变化，但后端内部命名应直接使用 Thought / Knowledge，不再新增 `kb_*` 数据库表。

注意：

- `thought.db` 初始化失败应阻止思绪功能继续写入，避免源内容损坏。
- `thought-vectors.db` 初始化失败可以降级为无向量缓存状态，但必须向前端返回可理解的错误或状态。
- Thought 主库、Thought 向量库、Knowledge manifest 的 migration 分开执行。主库 migration 优先，向量库或 Knowledge manifest 失败不应阻塞已有 Thought 源内容浏览。

### Phase 2: Legacy 文件导入并 Thought 化

启动时检测：

- `knowledge/thought.db` 或 `knowledge/thought-vectors.db` 不存在或缺少迁移标记
- 旧目录 `knowledge/bases/` 存在

执行导入：

1. 导入 `bases/{kbId}/meta.json` 到 `thought_bases`，旧 `kbId` 作为 Thought base id 保留。
2. 导入 `entries/{entryId}.json` 到 `thought_entries`，旧 CAIU entry 转换为 thought entry。
3. 导入 `vectors/{kbId}/models.json` 和 `{entryId}.vec` 到 `thought-vectors.db` 的 `thought_models`、`thought_entry_vectors`。
4. 导入 `tag_pool/{modelHash}` 到 `thought-vectors.db` 的 `thought_tag_vectors`。
5. 写入迁移标记。
6. 旧目录保留，不立即删除，并记录 `legacy_kb_id -> thought_id` 的迁移日志，方便排查。

注意：

- 导入应幂等。
- 对损坏 JSON 或维度不一致向量应跳过并记录日志，不中断整个迁移。
- `modelHash -> model_id` 优先从 `models.json` 反查；缺失时保守使用目录名。
- 这一步是正式语义转换边界：迁移完成后，旧文件中的“知识库”在新模型中属于 Thought / 思绪域；真正 Knowledge / 知识资料库只来自后续 document/chunk 导入入口。
- 角色预设中的旧知识库占位符和关联配置不需要先行单独兼容。当前实际调用主要来自 `llm-chat` 的 `{{kb}}` / `【kb::...】` / `【knowledge::...】` 链路，数据库化和 Thought / Knowledge 重构时应同步迁移：
  - `knowledgeBaseConfig.bindings` 中的旧 `kbId` 映射到迁移后的 `thought_id`。
  - 旧占位符中能被现有格式识别的 `kbName`、`limit`、`minScore`、`mode`、`modeParams`、`engineId` 转换为新的 Thought preset / engine 参数。
  - 无法识别的占位符不应静默改写，应保留原文并写入迁移报告。

### Phase 3: warmup 改造

将 `warmup_knowledge_base` 从文件扫描改为：

1. 从 `thought_bases` 加载 base meta。
2. 从 `thought_entries` 加载 entries。
3. 根据 `meta.vectorization.model_used` 或当前模型从 `thought_entry_vectors` 加载向量。
4. 重建 `TextInvertedIndex`、`key_to_id`、`VectorMatrix`。

`InMemoryBase` 继续保留。

### Phase 4: 写路径事务化

以下 command 必须改为数据库事务：

- `kb_upsert_entry`
- `kb_batch_upsert_entries`
- `kb_batch_patch_entries`
- `kb_delete_entry`
- `kb_batch_delete_entries`
- `kb_update_entry_vector`
- `kb_clear_legacy_vectors`
- `kb_clear_all_other_vectors`
- `kb_sync_tag_vectors`
- `kb_clear_tag_pool`

顺序建议：

1. `thought.db` 源内容事务成功。
2. 如涉及向量或召回缓存，再写入 `thought-vectors.db`。
3. 同步内存 `InMemoryBase`。
4. 推送监控事件。

如内存同步失败，应记录错误并允许下一次 warmup 修复，数据库仍为真源。涉及两个数据库时，不建议跨库伪装强事务；源内容更新成功但向量缓存失败时，应清理或标记相关向量为过期，让后续重新向量化修复。

### Phase 5: 前端 workspace 收口

当前 `workspace.bases` 是漂移源。建议改为：

- `kbStorage.loadWorkspace()` 只加载配置和 `lastActiveBaseId`。
- `bases` 列表改由 `kb_list_bases` 返回。
- 创建 / 克隆 / 删除知识库后，前端调用后端命令并刷新列表。
- 新增正式 `kb_delete_base`，不要继续使用通用 `delete_file_force` 删除目录。

---

## 9. 状态派生规则

数据库化后建议减少持久化冗余状态。

### 9.1 `vector_status`

不建议持久化为主字段。

派生规则：

```text
如果存在 thought_entry_vectors(thought_id, entry_id, model_id)
并且 thought_entry_vectors.content_hash == thought_entries.content_hash
则 vectorStatus = ready
否则 vectorStatus = none
```

这能避免内容更新后 meta 状态和真实向量不一致。

### 9.2 `vectorized_models`

派生自：

```sql
SELECT model_id
FROM thought_entry_vectors
WHERE thought_id = ? AND entry_id = ? AND content_hash = ?
```

如果前端类型暂时仍需要 `vectorizedModels` 字段，可在 Rust 返回 `KnowledgeBaseMeta` 时动态填充。

### 9.3 `total_tokens`

条目级 tokens 来自 `thought_entry_vectors.tokens`。

思绪库级 tokens 可按模型聚合，也可以维护在 `thought_models.total_tokens`。若维护统计字段，必须在向量写入/删除事务中同步更新。

---

## 10. 需要特别注意的坑点

### 10.1 内容更新必须清理旧向量

当前 `kb_upsert_entry` 检测 content hash 变化后会删除旧向量文件。数据库化后应在同一事务中：

1. 更新 `thought_entries.content_hash`。
2. 删除该 entry 的旧 `thought_entry_vectors`。
3. 更新内存 `vector_store`。
4. 返回前端时显示未向量化。

### 10.2 批量写入不能逐条提交

`kb_batch_upsert_entries` 和向量同步高频调用，必须用事务批量提交，否则 SQLite 写性能会退化。

### 10.3 `InMemoryBase::remove_entry` 当前依赖 entries 缓存

当前 `remove_entry` 只有在 `base.entries.remove(id)` 命中时才会清理 `meta.entries`、倒排索引和向量矩阵。数据库化后如果允许懒加载，需要确保删除路径能清理 meta/index，即使完整 entry 未加载。

### 10.4 标签池模型 ID 与 safe model ID

当前文件目录使用 `get_safe_model_id(model_id)`。数据库表应保存原始 `model_id`，不要继续用 safe model ID 作为业务主键。迁移旧数据时再处理 safe ID 反查。

### 10.5 前端 `workspace.bases` 必须降级

如果只把 Rust 后端改成 SQLite，而前端仍保存独立 `workspace.bases`，数据库化无法彻底解决列表漂移问题。

### 10.6 导出功能仍需稳定 JSON 格式

`kb_export_base` 当前返回 `KnowledgeBase { meta, entries }`。数据库化后仍应保持该导出结构，保证用户数据可迁移、可备份。

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

### 11.2 兼容性测试

准备一份旧版 `appData/knowledge` fixture：

- 多知识库。
- 多 entries。
- 多模型向量。
- 部分损坏 `.vec`。
- 缺失 `models.json`。
- tag pool 有 registry 但 vectors 长度不匹配。

验证迁移后：

- `kb_list_bases` 数量一致。
- `kb_load_base_meta` 条目一致。
- `kb_load_entry` 内容一致。
- `kb_check_vector_coverage` 结果符合预期。
- `kb_search` 关键词搜索结果一致。
- 加载同模型向量后，向量搜索结果基本一致。

### 11.3 性能基准

至少比较：

- 冷启动 warmup 耗时。
- 加载指定模型向量耗时。
- 批量导入 100 / 1000 条耗时。
- 批量写入 100 / 1000 个向量耗时。
- keyword / vector / lens / blender 检索耗时。
- Knowledge 资料库 100 / 1000 / 10000 chunk 入库耗时。
- Knowledge search_hybrid 查询耗时、跨库合并耗时和结果回源读取耗时。

---

## 12. 建议实施顺序

### 12.1 Thought 思绪域数据库化

1. 新增 `storage` 模块、migration、SQLite 初始化。
2. 实现 `SqliteThoughtRepository` 的 base / entry 基础 CRUD。
3. 改造 `kb_initialize`、`kb_warmup`、`kb_list_bases`、`kb_load_base_meta`。
4. 实现旧文件导入，并在导入时完成 `kb` / CAIU 到 Thought 的 schema 转换。
5. 改造 entry 写路径。
6. 改造 vector 写入、加载和覆盖率检查。
7. 改造 tag pool 持久化。
8. 新增 `kb_delete_base`。
9. 前端 workspace 收口，`bases` 从后端列表派生。
10. 补测试和性能基准。

### 12.2 Knowledge 资料库 TriviumDB 实验线

该线建议在 Thought 主存储稳定后并行推进，避免把两个风险面绑在一起。

1. 新增 `knowledge_library` 后端模块和 repository trait。
2. 实现 `knowledge/knowledge_meta.db` manifest、library CRUD 和 migration。
3. 验证 `triviumdb` Rust crate 在 Tauri 目标平台的编译、体积、锁和 API 行为。
4. 若 Rust crate 可用，实现 `TriviumKnowledgeRepository`。
5. 若 Rust crate 暂不可用，先保留 repository 抽象，以 SQLite manifest + 内存检索或后续 N-API 桥接方案过渡。
6. 实现文件导入、切片、embedding、document/chunk node 写入和图关系写入。
7. 实现文件更新 / 删除的精准 node 清理。
8. 实现 `knowledge_search` / `kb_search` 路由扩展，结果带 `sourceType = "knowledge"`。
9. 前端新增知识资料库管理入口，切片配置只在该入口出现。
10. 增加 Knowledge 入库、检索、删除、重建和跨库合并测试。

---

## 13. 结论

`knowledge-base` 的数据库化应分成两条边界清晰的路线：

- Thought / 思绪域：聚焦“可靠持久层 + 稳定迁移 + 消除多真源漂移”，不重写现有检索引擎。
- Knowledge / 知识资料库：单开传统 RAG 资料馆，支持自动切片、文件同步、BM25 + 向量 + 图扩散和来源追溯。

推荐最终状态：

- `thought.db` 是 Thought 思绪域唯一不可丢的源内容真源。
- `thought-vectors.db` 保存 Thought 可重建的向量、tag pool 和预计算召回资产。
- `InMemoryDatabase` 是 Thought 可重建的运行时读模型。
- 向量和标签池进入 SQLite，但矩阵、HNSW 和算法融合结果仍以可重建读模型或 artifact 处理。
- `knowledge/` 保存传统文档知识资料库，每个 library 可对应独立 `.tdb`。
- Knowledge 使用 `knowledge_meta.db` 做文件和 chunk manifest，不写入 Thought `thought_entries`。
- 自动切片只属于 Knowledge 域，Thought 不提供自动切片入口。
- 前端不直接读写知识库数据库。
- `workspace.json` 不再保存知识库列表真源。

这样可以在控制风险的前提下解决当前文件系统存储的长期维护问题，同时保留 Rust 检索后端已有的性能优势，并为 TriviumDB 类 Knowledge 资料库留出独立演进空间。

