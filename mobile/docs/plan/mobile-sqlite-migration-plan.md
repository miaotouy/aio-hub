# 移动端 SQLite 引入与持久化重构计划 (Mobile SQLite Migration Plan)

> 状态：待施工；2026-07-18 已按 [`mobile-sqlite-migration-investigation-report.md`](./mobile-sqlite-migration-investigation-report.md) 校正实施边界。
> 当前决议：聊天数据库通过 Rust 领域命令访问，默认采用 SQLx、原生 migration runner 和统一连接配置；前端不得执行任意 SQL。

## 1. 背景与现状

目前移动端（`mobile/`）的数据持久化采用的是**轻量级 JSON 文件方案**：

- **配置数据**：使用基于 `@tauri-apps/plugin-store` 封装的 `ConfigManager`，将设置、LLM 渠道等保存为单文件 JSON。
- **会话数据**：每个聊天会话保存为独立的 `{sessionId}.json` 文件，通过 `@tauri-apps/plugin-fs` 进行整文件读写。

同时移动端目前（撰写计划时）还未发布任何版本，还处于纯内部开发阶段，没有用户数据迁移负担

### 桌面端搜索的“暴力美学”

在调研桌面端的聊天记录搜索（`search_llm_data_stream`）实现后，我们发现桌面端采用的是**纯 Rust 裸奔扫文件**的方案：

1. 使用 `WalkDir` 遍历 `sessions/` 目录下的所有 JSON 文件。
2. 使用 `tokio::fs::read_to_string` 异步读取文件内容。
3. 使用 `stream.buffer_unordered(50)` 开启 **50 路并发** 暴力读取。
4. 先用 `regex` 进行全文预过滤，匹配成功后再进行 `serde_json` 反序列化，并提取上下文。
5. 通过 `tauri::ipc::Channel` 将结果流式（Stream）批量回传给前端。

### 为什么移动端不能照搬桌面端？

PC 端拥有强大的多核 CPU、超高速的 NVMe 固态硬盘以及充足的内存，50 路并发扫文件可以在几毫秒内完成。但在移动端（Android/iOS）：

1. **I/O 瓶颈**：手机闪存的随机读写性能远低于 PC，并发扫几十个 JSON 文件会导致严重的 I/O 阻塞，引起 UI 卡顿。
2. **能耗与发热**：高并发的 CPU 预过滤和反序列化会使 CPU 瞬间满载，导致手机发热、耗电激增。
3. **内存限制**：移动端 WebView 和后台进程的内存限制极严，一次性读取并解析大量 JSON 极易触发 OOM（Out of Memory）被系统强杀。

因此，**移动端在正式发布前，必须将聊天会话与消息数据迁移至 SQLite 数据库**。

---

## 2. 目标架构 (Target Architecture)

重构后将采用 **混合持久化架构**：

```
┌────────────────────────────────────────────────────────┐
│                      Pinia Stores                      │
└───────────┬──────────────────────────────┬─────────────┘
            │ 简单配置                               │ 复杂/海量数据
┌───────────▼────────────┐              ┌───▼──────────────┐
│     ConfigManager      │              │ Tauri commands   │
│ (app_settings.json 等)  │              │llm_chat_storage  │
└────────────────────────┘              └────────┬─────────┘
                                                 │ 读写
                                        ┌────────▼───────┐
                                        │ SQLx + migrations│
                                        │   llm_chat.db  │
                                        │Sessions/Msgs/  │
                                        │Attachments     │
                                        └────────────────┘
```

### 核心原则：工具自治与“一模块一数据库” (Database per Module)

AIO Hub 采用模块化工具架构，每个工具作为独立单元接入。为了避免模块间的数据耦合，**严禁使用单一的全局数据库（如 `aiohub.db`）承载所有工具的数据**。

1. **轻量配置保留 JSON**：`app_settings.json`、`llm_profiles.json` 等配置继续使用 `ConfigManager`，保持轻量和高开发效率。
2. **海量数据落地专属 SQLite**：每个需要数据库支持的工具，拥有自己独立的 `.db` 文件。例如 `llm-chat` 模块独占 `llm_chat.db`。
3. **领域写入保持同一事务边界**：聊天、资产等复杂数据模块仍遵循“一模块一数据库”，但数据库写入必须由各自 Rust 模块服务统一编排。前端只能调用领域级 command，不能通过 SQL 插件直接修改核心表。资产边界见 [`mobile-asset-manager-design.md`](./mobile-asset-manager-design.md)。
4. **跨库引用使用 ID 与 outbox**：聊天附件只保存全局 `asset_id` 和轻量快照，不保存资产路径。聊天事务同时写入 usage outbox，由后台幂等同步到 `asset_manager.db`，不尝试建立跨数据库外键。

**多数据库架构的优势**：

- **解耦与自治**：工具 A 的表结构重构或损坏，绝对不会波及工具 B。
- **插件化友好**：未来动态加载的第三方插件可以拥有自己独立的 `.db` 文件，无需侵入主应用的数据库。
- **备份与重置**：用户可以轻松重置单个工具的数据（直接删除对应的 `.db` 文件），而不会影响其他工具的配置和资产。

---

## 3. 数据库设计 (Database Schema)

> **设计前置阅读**：请先熟悉移动端 `llm-chat` 的类型定义，特别是 [`ChatSession`](../src/tools/llm-chat/types/session.ts) 和 [`ChatMessageNode`](../src/tools/llm-chat/types/message.ts) 的完整字段清单，以下 Schema 会对照这两个接口进行设计。

### 3.1. 会话表 `chat_sessions`

| 字段名             | 类型    | 约束        | 说明                                      |
| ------------------ | ------- | ----------- | ----------------------------------------- |
| `id`               | TEXT    | PRIMARY KEY | 会话 ID (UUID)                            |
| `name`             | TEXT    | NOT NULL    | 会话名称                                  |
| `root_node_id`     | TEXT    | NOT NULL    | 根节点 ID（role: system）                 |
| `active_leaf_id`   | TEXT    | NOT NULL    | 当前活跃的叶子节点 ID                     |
| `display_agent_id` | TEXT    |             | 绑定的智能体 ID                           |
| `message_count`    | INTEGER | NOT NULL, 0 | 消息数量快照（不含根节点），避免列表 JOIN |
| `is_favorite`      | INTEGER | NOT NULL, 0 | 是否收藏（0=否, 1=是），与桌面端对齐预留  |
| `created_at`       | TEXT    | NOT NULL    | 创建时间 (ISO 8601 UTC)                   |
| `updated_at`       | TEXT    | NOT NULL    | 更新时间 (ISO 8601 UTC)                   |

> **设计说明**：
>
> - `message_count`：虽然可通过 `SELECT COUNT(*)` 派生，但会话列表是最高频查询，缓存此值可避免每次 JOIN 子查询。应在消息增删时由应用层维护。
> - `is_favorite`：桌面端已有收藏功能（`ChatSessionIndex.isFavorite`），提前预留此列可以避免后续 migration，且 INTEGER DEFAULT 0 几乎零成本。
> - 时间字段统一使用 **UTC + `Z` 后缀**（如 `2024-01-01T00:00:00.000Z`），确保跨时区排序正确。

### 3.2. 消息节点表 `chat_messages`

| 字段名                   | 类型 | 约束              | 说明                                                  |
| ------------------------ | ---- | ----------------- | ----------------------------------------------------- |
| `id`                     | TEXT | PRIMARY KEY       | 消息 ID (UUID)                                        |
| `session_id`             | TEXT | NOT NULL, FK      | 所属会话 ID (ON DELETE CASCADE)                       |
| `parent_id`              | TEXT |                   | 父节点 ID（NULL 表示根节点）                          |
| `sibling_order`          | INT  | NOT NULL, 0       | 兄弟节点排列顺序（用于重建 childrenIds 的顺序）       |
| `last_selected_child_id` | TEXT |                   | 上次选择的子节点 ID（分支记忆导航）                   |
| `role`                   | TEXT | NOT NULL          | 角色 (user/assistant/system)                          |
| `type`                   | TEXT | DEFAULT 'message' | 消息类型，预留扩展（如 'tool_call', 'image' 等）      |
| `content`                | TEXT | NOT NULL, ''      | 消息文本内容                                          |
| `status`                 | TEXT | NOT NULL          | 状态 (generating/complete/error)                      |
| `timestamp`              | TEXT | NOT NULL          | 时间戳 (ISO 8601)                                     |
| `reasoning_content`      | TEXT |                   | 思考过程内容 (深度思考模型专用)                       |
| `metadata_json`          | TEXT |                   | 附加元数据 (JSON 格式，存 modelId/modelName/error 等) |

> **FOREIGN KEY**：`session_id` 引用 `chat_sessions(id)`，`ON DELETE CASCADE`。

### 3.3. 附件引用与 usage outbox

附件是聊天消息的一部分，但二进制原件属于全局可回收资产库。`chat_attachments` 只保存 `asset_id` 和原件被回收后仍可展示的轻量快照：

| 字段名 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | TEXT | PRIMARY KEY | 附件引用 ID |
| `message_id` | TEXT | NOT NULL, FK | 所属消息，随消息级联删除 |
| `asset_id` | TEXT | NOT NULL | 全局资产 ID，不建立跨数据库外键 |
| `kind` | TEXT | NOT NULL | image/audio/video/document/other |
| `display_name` | TEXT | NOT NULL | 删除原件后仍用于历史展示 |
| `mime_type` | TEXT | NOT NULL | MIME 快照 |
| `size_bytes` | INTEGER | NOT NULL | 原件大小快照 |
| `usage_policy` | TEXT | NOT NULL | advisory/blocking，默认 advisory |
| `extracted_text` | TEXT | | 转写、提取文本或摘要快照 |
| `sort_order` | INTEGER | NOT NULL | 消息内附件顺序 |
| `created_at` | TEXT | NOT NULL | UTC 时间 |

聊天数据和 `asset_manager.db` 不属于同一事务域。为避免“消息已保存但 usage 未登记”或“消息已删除但 usage 未释放”，聊天库增加 `asset_usage_outbox`。每条事件包含业务实体、操作和完整 usage payload；投递器严格按自增 `sequence` 调用资产服务的 `asset_replace_entity_usages`，成功后标记 `delivered_at`。应用在投递成功后崩溃只会导致重复投递，因此资产命令必须幂等。

附件与 usage outbox 直接进入初始 schema v1。移动端尚未发布且该 SQLite 计划尚未实施，不为已知错误的 `file_path` 方案保留 migration v2。

### 3.4. 索引设计

```sql
-- 会话列表按更新时间倒序（最频繁的列表查询）
CREATE INDEX idx_sessions_updated ON chat_sessions(updated_at DESC);

-- 加载某会话的所有消息并按兄弟顺序排列（会话进入时必查）
-- 复合索引 (session_id, sibling_order) 同时覆盖 WHERE 和 ORDER BY，避免 filesort
CREATE INDEX idx_messages_session ON chat_messages(session_id, sibling_order);

-- 查询某节点的子节点（分支导航时用到）
CREATE INDEX idx_messages_parent ON chat_messages(session_id, parent_id);

CREATE INDEX idx_attachments_message ON chat_attachments(message_id, sort_order);
CREATE INDEX idx_usage_outbox_pending ON asset_usage_outbox(delivered_at, sequence);
```

> **设计理由**：
>
> - `idx_messages_session` 是复合索引 `(session_id, sibling_order)`，覆盖 `WHERE session_id = ? ORDER BY sibling_order ASC` 查询（即 `loadSession()` 的核心路径），避免全表扫描 **和** 额外排序。如果只索引 `session_id`，SQLite 仍需对结果集做 filesort。
> - `idx_messages_parent` 支持根据 `session_id` 和 `parent_id` 快速定位子节点（分支切换时实际走 `WHERE session_id = ? AND parent_id = ?`）。
> - `idx_sessions_updated` 确保会话列表分页查询为索引覆盖扫描。

### 3.5. 全文搜索：使用 FTS5（替代 LIKE）

> **⚠️ 关键决策**：初版计划使用 `LIKE '%keyword%'` 做搜索，这在数据量增长后等价于全表扫描，性能退化严重。移动端应使用 SQLite 内置的 **FTS5** 虚拟表引擎。

```sql
-- 创建 FTS5 虚拟表，外挂 chat_messages 的实际数据
CREATE VIRTUAL TABLE chat_messages_fts USING fts5(
  content,
  reasoning_content,
  content=chat_messages,       -- 外置内容表
  content_rowid=rowid          -- rowid 映射
);

-- 保持同步的触发器（需要手动维护）
CREATE TRIGGER chat_messages_ai AFTER INSERT ON chat_messages BEGIN
  INSERT INTO chat_messages_fts(rowid, content, reasoning_content)
  VALUES (new.rowid, new.content, new.reasoning_content);
END;

CREATE TRIGGER chat_messages_ad AFTER DELETE ON chat_messages BEGIN
  INSERT INTO chat_messages_fts(chat_messages_fts, rowid, content, reasoning_content)
  VALUES ('delete', old.rowid, old.content, old.reasoning_content);
END;

CREATE TRIGGER chat_messages_au AFTER UPDATE ON chat_messages BEGIN
  INSERT INTO chat_messages_fts(chat_messages_fts, rowid, content, reasoning_content)
  VALUES ('delete', old.rowid, old.content, old.reasoning_content);
  INSERT INTO chat_messages_fts(rowid, content, reasoning_content)
  VALUES (new.rowid, new.content, new.reasoning_content);
END;
```

搜索查询示例：

```sql
SELECT m.*, s.name as session_name
FROM chat_messages_fts f
JOIN chat_messages m ON f.rowid = m.rowid
JOIN chat_sessions s ON m.session_id = s.id
WHERE chat_messages_fts MATCH ?
LIMIT 100;
```

> **FTS5 vs LIKE 对比**：
> | 维度 | LIKE '%keyword%' | FTS5 |
> | ---- | ---------------- | ---- |
> | 时间复杂度 | O(N) 全表扫描 | O(log N) 倒排索引 |
> | 百万级数据性能 | 数秒 | 毫秒级 |
> | 支持分词 | 否 | 支持 Simple / Porter / Unicode61 |
> | 支持高亮 | 否 | 内置 `highlight()` / `snippet()` |
>
> 考虑到移动端用户可能产生大量会话数据，FTS5 的初始维护成本远低于后期因 LIKE 性能问题再次重构。

### 3.6. Schema 版本管理 (Migration)

使用 SQLx 原生 migration runner，不在前端手写版本循环：

- migration SQL 文件随源码进入版本控制，由 `sqlx::migrate!()` 在 Rust 启动路径执行；
- 每个 migration 与版本记录同事务提交，失败时完整回滚；
- 自动测试覆盖每个历史 schema 到最新版的升级路径；
- 应用降级遇到更高 schema 时明确拒绝写入，不能尝试继续运行；
- `foreign_keys`、WAL、`busy_timeout` 和 `synchronous` 属于每条连接的 connect options，不写进一次性 migration 假设其永久生效。

### 3.7. `metadata_json` 编码策略

`metadata_json` 以 JSON 文本格式存储 [`ChatMessageNode.metadata`](../../src/tools/llm-chat/types/message.ts) 中除已拆列字段之外的完整对象。当前至少包含模型身份、错误、usage、Token 来源、上下文占用、请求时序和吞吐指标；后续新增未知字段也必须无损保留。

Rust storage codec 不能用手写字段白名单重建 metadata。编码时从完整 metadata 克隆后只移除明确拆列字段，解码时将拆列字段合并回 JSON 对象；固定样本和未知字段都要经过 SQLite round-trip 测试。

> **为什么不全部拆为独立列？**：
> 这些字段的特点是：**读取频繁但无需在 SQL WHERE 中过滤**（用户不会搜索"modelId = xxx 的消息"）。将它们塞进一个 TEXT 列，既减少列数、避免宽表，又保持前端接口一致性——读取后直接合并回 `ChatMessageNode.metadata` 对象，与 JSON 文件时代的序列化/反序列化逻辑基本一致。

### 3.8. 完整 DDL 总览

> 以下 DDL 是 Schema v1 草案，不是已冻结 migration。阶段零验证完成后还需按当前 TypeScript 类型、metadata codec、中文搜索策略和 `ManagedAssetRef` 契约复核，再拆入 SQLx migration 文件。

```sql
-- ============ 1. 会话表 ============
CREATE TABLE IF NOT EXISTS chat_sessions (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  root_node_id      TEXT NOT NULL,
  active_leaf_id    TEXT NOT NULL,
  display_agent_id  TEXT,
  message_count     INTEGER NOT NULL DEFAULT 0,
  is_favorite       INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_updated
  ON chat_sessions(updated_at DESC);

-- ============ 3. 消息表 ============
CREATE TABLE IF NOT EXISTS chat_messages (
  id                      TEXT PRIMARY KEY,
  session_id              TEXT NOT NULL,
  parent_id               TEXT,
  sibling_order           INTEGER NOT NULL DEFAULT 0,
  last_selected_child_id  TEXT,
  role                    TEXT NOT NULL,
  type                    TEXT NOT NULL DEFAULT 'message',
  content                 TEXT NOT NULL DEFAULT '',
  status                  TEXT NOT NULL DEFAULT 'complete',
  timestamp               TEXT NOT NULL,
  reasoning_content       TEXT,
  metadata_json           TEXT,
  FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_messages_session
  ON chat_messages(session_id, sibling_order);
CREATE INDEX IF NOT EXISTS idx_messages_parent
  ON chat_messages(session_id, parent_id);

-- ============ 4. 聊天附件引用 ============
CREATE TABLE IF NOT EXISTS chat_attachments (
  id              TEXT PRIMARY KEY,
  message_id      TEXT NOT NULL,
  asset_id        TEXT NOT NULL,
  kind            TEXT NOT NULL CHECK (kind IN ('image', 'audio', 'video', 'document', 'other')),
  display_name    TEXT NOT NULL,
  mime_type       TEXT NOT NULL,
  size_bytes      INTEGER NOT NULL,
  usage_policy    TEXT NOT NULL DEFAULT 'advisory'
                    CHECK (usage_policy IN ('advisory', 'blocking')),
  extracted_text  TEXT,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL,
  FOREIGN KEY (message_id) REFERENCES chat_messages(id) ON DELETE CASCADE,
  UNIQUE (message_id, asset_id)
);

CREATE INDEX IF NOT EXISTS idx_attachments_message
  ON chat_attachments(message_id, sort_order);

-- ============ 5. 资产 usage 同步 outbox ============
CREATE TABLE IF NOT EXISTS asset_usage_outbox (
  sequence        INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id        TEXT NOT NULL UNIQUE,
  entity_type     TEXT NOT NULL,
  entity_id       TEXT NOT NULL,
  operation       TEXT NOT NULL CHECK (operation IN ('replace', 'release')),
  payload_json    TEXT NOT NULL,
  attempt_count   INTEGER NOT NULL DEFAULT 0,
  last_error      TEXT,
  created_at      TEXT NOT NULL,
  delivered_at    TEXT
);

CREATE INDEX IF NOT EXISTS idx_usage_outbox_pending
  ON asset_usage_outbox(delivered_at, sequence);

-- ============ 6. FTS5 全文搜索 ============
CREATE VIRTUAL TABLE IF NOT EXISTS chat_messages_fts USING fts5(
  content,
  reasoning_content,
  content=chat_messages,
  content_rowid=rowid
);

CREATE TRIGGER IF NOT EXISTS chat_messages_ai AFTER INSERT ON chat_messages BEGIN
  INSERT INTO chat_messages_fts(rowid, content, reasoning_content)
  VALUES (new.rowid, new.content, new.reasoning_content);
END;

CREATE TRIGGER IF NOT EXISTS chat_messages_ad AFTER DELETE ON chat_messages BEGIN
  INSERT INTO chat_messages_fts(chat_messages_fts, rowid, content, reasoning_content)
  VALUES ('delete', old.rowid, old.content, old.reasoning_content);
END;

CREATE TRIGGER IF NOT EXISTS chat_messages_au AFTER UPDATE ON chat_messages BEGIN
  INSERT INTO chat_messages_fts(chat_messages_fts, rowid, content, reasoning_content)
  VALUES ('delete', old.rowid, old.content, old.reasoning_content);
  INSERT INTO chat_messages_fts(rowid, content, reasoning_content)
  VALUES (new.rowid, new.content, new.reasoning_content);
END;
```

---

## 4. 实施步骤 (Implementation Steps)

### 阶段零：Android/iOS 能力验证

- 建立最小 Rust + SQLx spike，验证数据库创建、关闭、重开和应用升级。
- 检查 FTS5 与 trigram 编译能力，并验证所有池连接的 `foreign_keys`、WAL、`busy_timeout` 和 `synchronous` 配置。
- 覆盖事务中途强杀恢复，以及 10 万条中英混合消息的索引、查询、加载和数据库体积基准。
- 在 `ui-tester` 增加“SQLite”验证板块，通过固定场景操作隔离测试库，展示结构化步骤与指标，并支持跨重启恢复和脱敏报告导出；不得暴露任意 SQL。
- 只有 Android 与 iOS 正式构建链均通过后，才冻结具体 crate feature 与连接参数。

验证 UI 的信息架构、安全隔离和场景定义见 [`platform-validation-workbench-plan.md`](../../src/tools/ui-tester/docs/Plan/platform-validation-workbench-plan.md)。

### 阶段一：Rust 存储骨架与 migrations

- 在 `mobile/src-tauri/src/` 新增 `llm_chat_storage.rs`，使用 SQLx 连接池与 `sqlx::migrate!()`；migration SQL 文件进入版本控制。
- command 至少覆盖 `list_chat_sessions`、`load_chat_session`、`persist_chat_changes`、`delete_chat_branch`、`delete_chat_session`、`search_chat_messages` 和 `drain_asset_usage_outbox`。
- `persist_chat_changes` 接收领域变更集并开启单一 transaction；前端不传 SQL，也不自行管理 transaction。
- 增加 migration 升级/回滚、foreign key、codec round-trip、未知 metadata 字段保留和 crash recovery 测试。

### 阶段二：会话与消息增量持久化

- 重构 `useSessionManager`，通过薄 Tauri command client 加载会话列表、单会话和提交 change set。
- Rust 侧只写入新增、编辑、删除和活跃分支变化，避免每次保存 O(N) 重写整段会话。
- `currentSessionId` 继续由 ConfigManager 管理；流式回复按节流快照落盘，不按 token 写数据库。
- JSON 实现只作为短期开发回退。Android/iOS 数据闭环通过后删除，不建设长期双写与迁移负担。

### 阶段三：附件与 usage outbox

- 等资产服务命令与 `ManagedAssetRef` 稳定后，再固化 `chat_attachments` 的写入和解析。
- 在消息变更 transaction 内写完整 usage replacement/release outbox；删除业务行前必须先写 release 事件。
- 应用启动、聊天提交和资产服务恢复时触发投递；失败事件独立重试，永久错误不能阻塞后续无关实体。
- 用故障注入覆盖“资产命令已成功但 delivered 未标记”、重复投递、附件替换、分支删除和会话删除。

### 阶段四：本地搜索

- query 编码、FTS 查询、rank、snippet 和结果上限均在 Rust storage 层实现，前端只传结构化搜索条件。
- 在真实中日韩与英文语料上决定 trigram、受限 `LIKE` 或 basic-search 降级策略，明确 1/2/3 字符和特殊字符行为。
- FTS 只有在双端真实 Tauri 运行态通过后才设为强依赖，否则保留 basic search 降级。

---

## 5. 潜在坑点与对策

1. **外键约束启用**：SQLite 默认不启用外键级联删除。必须通过 SQLx `SqliteConnectOptions` 为池中的每条连接设置 `foreign_keys(true)`，并用运行态检查确认，不能只在首条连接执行一次 pragma。
2. **流式生成期间的写入策略**：LLM 流式回复时 `content` 在持续增长，如果每个 token 都 `INSERT OR REPLACE` 整行，会导致：
   - FTS 触发器反复 delete + insert 重建索引条目，造成严重性能开销。
   - `INSERT OR REPLACE` 实际上是 DELETE + INSERT，rowid 会变化，进一步加剧 FTS 同步成本。

   **正确做法**：流式生成期间仅在内存中累积 content，生成完成（`status` 变为 `complete` 或 `error`）后**一次性写入**数据库。如果需要中途持久化（防崩溃），应使用 `UPDATE chat_messages SET content = ?, status = ? WHERE id = ?`（UPDATE 触发器只在内容实际变化时触发一次 FTS 重建，比 REPLACE 的 delete+insert 好得多）。

3. **树状结构组装性能**：从数据库读出扁平的消息列表后，在前端用 JS 组装成 `Record<string, ChatMessageNode>` 树状结构。对于超长会话（如 1000+ 消息），组装算法需保持 O(N) 复杂度：

```typescript
function buildTree(
  messages: ChatMessageRow[]
): Record<string, ChatMessageNode> {
  const nodes: Record<string, ChatMessageNode> = {};
  for (const msg of messages) {
    nodes[msg.id] = {
      id: msg.id,
      parentId: msg.parent_id,
      childrenIds: [], // 先置空，第二轮填充
      lastSelectedChildId: msg.last_selected_child_id,
      content: msg.content,
      role: msg.role,
      status: msg.status,
      timestamp: msg.timestamp,
      metadata: {
        ...JSON.parse(msg.metadata_json || "{}"),
        reasoningContent: msg.reasoning_content,
      },
    };
  }
  // 第二轮：填充 childrenIds
  for (const msg of messages) {
    if (msg.parent_id && nodes[msg.parent_id]) {
      nodes[msg.parent_id].childrenIds.push(msg.id);
    }
  }
  return nodes;
}
```

注意：`sibling_order` 保证了第二轮的 `push` 顺序与写入时的 `childrenIds` 顺序一致。**查询时必须 `ORDER BY sibling_order ASC`**，复合索引 `(session_id, sibling_order)` 已确保此排序为索引覆盖，无需额外 filesort。

4. **`metadata_json` 与 TypeScript 类型对齐**：编码/解码集中在 Rust storage codec，不在 `useSessionManager` 或业务组件中散布 `JSON.parse`。必须覆盖当前全部 metadata 字段、未知字段和可选 `timestamp` 的无损往返。
5. **FTS5 初始填充**：如果从 JSON 文件迁移到 SQLite 时已有存量数据，FTS5 虚拟表中的内容不会自动回填。需要在数据导入完成后运行一条重建命令来填充索引：
   ```sql
   INSERT INTO chat_messages_fts(chat_messages_fts) VALUES('rebuild');
   ```
   如果使用 `content=` 外置表模式，重建会从 `chat_messages` 中读取所有数据构建索引。
6. **连接池不是并发越高越好**：移动端 SQLite 仍是单写者模型。SQLx pool 初始控制在 2-4 条连接，所有连接使用相同 options；通过真机基准调整，避免增加写锁竞争。
7. **`MessageType` 的 NOT NULL DEFAULT 与前端 `undefined` 对齐**：Schema 中 `type TEXT NOT NULL DEFAULT 'message'`，但前端类型定义中 `type` 是可选字段（`type?: MessageType`）。写入时如果 TS 层 `type` 为 `undefined`，应在编码层显式填充为 `'message'`——`DEFAULT` 子句只在 SQL INSERT 完全省略该列时才生效，传 `null` 会违反 NOT NULL 约束。
8. **附件不保存路径**：`chat_attachments` 只能保存 `asset_id` 和轻量快照。预览与发送时通过资产服务解析；资产原件被主动回收后，根据资产 tombstone 的 `reclaimed` 状态显示“原件已清理”，不能把路径缓存回聊天库。
9. **跨库外键不可用**：`asset_id` 不指向聊天库内的表，SQLite 无法保证它与 `asset_manager.db` 同步。业务事务必须写 usage outbox，不能在事务提交后临时调用一次 `asset_register_usage` 便认为完成。
10. **outbox 顺序与幂等**：同一消息连续编辑附件可能产生多条 replacement 事件。投递器必须保持实体内顺序，资产服务必须以 `(module_id, entity_type, entity_id, role)` 为边界整体替换；这样崩溃重试和重复投递都不会产生僵尸 usage。
11. **删除顺序**：消息或会话删除时，要在同一聊天事务中先写 release outbox，再删除业务行。不能依赖 `ON DELETE CASCADE` 自动通知另一个数据库。
