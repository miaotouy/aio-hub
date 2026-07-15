# 移动端 SQLite 持久化方案调查报告

> 调查日期：2026-07-15  
> 调查对象：[`mobile-sqlite-migration-plan.md`](./mobile-sqlite-migration-plan.md)  
> 调查范围：移动端 AI 聊天、笔记与 local-first 跨平台应用的本地持久化方案；Tauri v2、SQLite、事务、迁移与全文搜索能力。  
> 说明：本报告是定向技术样本调查，不是对整个移动应用市场的统计抽样。

## 1. 执行结论

现计划的三个大方向成立：

1. **聊天会话与消息从 JSON 文件迁到 SQLite 是正确选择。** Chatbox 的移动端实际经历了 `localStorage -> SQLite -> IndexedDB -> SQLite`，最终因为 WebView 中 IndexedDB 的清理风险和性能问题回到 SQLite；Jan 也明确在 Android/iOS 使用 SQLite，而桌面端继续使用 JSON/JSONL 文件。
2. **配置保留 JSON、海量业务数据进入数据库的混合持久化是合理的。** 同类项目普遍不会为了“统一”而把所有配置和缓存都强塞进关系表。
3. **按有独立生命周期的领域拆库是可行的。** Chatbox 已分别使用通用存储、会话元数据、图像生成等数据库；AppFlowy 也把关系数据与协同对象存储分开。AIO Hub 的“一工具一数据库”与模块自治目标相符，但应理解为 bounded context 边界，不必为每个小组件创建数据库。

但现计划的执行边界需要调整：

> **推荐把 `llm_chat.db` 的写入、事务、迁移、FTS 和 outbox 放到 Rust/SQLx 服务层，由前端调用领域命令；不推荐让前端直接通过 `@tauri-apps/plugin-sql` 编排核心事务。**

原因不是代码风格偏好，而是官方 SQL 插件当前的 JS API 只有 `load/get/execute/select/close`，没有事务句柄。底层使用 SQLx 连接池，前端依次执行 `BEGIN`、多条写入、`COMMIT` 时，不能保证这些语句落在同一条连接上。现计划要求“会话 + 消息 + 附件 + usage outbox”原子提交，这个约束不能建立在该 API 上。

## 2. 调查方法与样本

本次优先读取官方仓库和项目当前源码，而不是依赖二手文章。所有项目结论均固定到调查时的提交：

| 项目             | 样本定位                          | 调查提交                                   |
| ---------------- | --------------------------------- | ------------------------------------------ |
| Tauri SQL Plugin | AIO Hub 候选数据库桥接层          | `13c63af965a249c21b998a95d006aab2b687ca0c` |
| Jan              | Tauri v2 + AI 聊天 + Android/iOS  | `76573848f7d1ba9d8b363a0f6800cae7fbf387ec` |
| Chatbox          | AI 聊天 + Capacitor 移动端        | `8639c946c0baedfdd12bbc88ac10f5aa87431647` |
| Joplin           | 长期维护的跨平台笔记与全文搜索    | `0faa20d82708202a175e31dbe52f9d60dd82cb36` |
| AppFlowy         | Rust 核心 + Flutter + local-first | `5cf3a365dec0d59f64bad1ee4bb1050471a39b93` |
| LobeChat         | Web/PWA AI 聊天对照组             | `7cd62b70cfdec4c98f34e592291d295511b82c9d` |
| SQLite           | FTS5 tokenizer 官方实现           | `7193cc9c08b3d046baa4e9c06fba593d9971e146` |

## 3. 同类项目采用的方案

### 3.1 Jan：移动端 SQLite，数据库边界在 Rust

Jan 与 AIO Hub 的技术栈最接近：Tauri v2、Rust、Web 前端，并包含 Android/iOS 构建。

它的策略是：

- 桌面端继续使用 `thread.json` 与 `messages.jsonl`。
- Android/iOS 改用 Rust 侧 SQLx + SQLite。
- 在 Tauri command 内按平台切换文件实现与 SQLite 实现。
- 移动端数据库使用连接池，当前配置 `max_connections(5)`。
- `threads` 与 `messages` 分表，但业务对象主体仍以 `data TEXT` 保存 JSON，只把 `id`、`thread_id`、时间等热查询字段拆列。
- 当前实现通过 `CREATE TABLE IF NOT EXISTS` 初始化，没有完整的版本迁移与 FTS；因此它能证明架构方向，但不应原样照抄成熟度不足的部分。

这给 AIO Hub 的直接启示是：**Tauri 移动端聊天数据使用 SQLite 已有真实同类实践，而且复杂持久化放在 Rust 命令层。**

来源：

- [Jan 移动端 SQLite 实现](https://github.com/menloresearch/jan/blob/76573848f7d1ba9d8b363a0f6800cae7fbf387ec/src-tauri/src/core/threads/db.rs)
- [Jan 文件/SQLite 平台分流](https://github.com/menloresearch/jan/blob/76573848f7d1ba9d8b363a0f6800cae7fbf387ec/src-tauri/src/core/threads/commands.rs)
- [Jan SQLx 移动端依赖](https://github.com/menloresearch/jan/blob/76573848f7d1ba9d8b363a0f6800cae7fbf387ec/src-tauri/Cargo.toml)

### 3.2 Chatbox：移动端最终回到 SQLite，并逐步拆出结构化表

Chatbox 是本次最有价值的产品演进样本：

- 移动端存储历史为 `localStorage -> SQLite -> IndexedDB -> SQLite`。
- 项目文档明确说明，回到 SQLite 的原因是移动 WebView 中 IndexedDB 存在数据被清理风险，并且 SQLite 性能更稳定。
- 当前通过 `@capacitor-community/sqlite` 使用原生 SQLite。
- 旧的通用存储仍是 `key_value(key, value)`，会话整体可以保存为 JSON，降低迁移成本。
- 新的高频列表数据已经拆成结构化 `session_meta` 表，并为排序字段建索引。
- 图像生成使用独立数据库与结构化表，数组类字段继续存 JSON。
- 批量创建/删除使用 `executeSet(set, true)`，显式要求事务执行。
- 实际存在 `chatbox.db`、`chatbox-session-meta`、`chatbox-image-generation` 等边界，说明按领域拆库并非纯理论方案。

它说明业界常见迁移路径不是“一开始把所有字段完全范式化”，而是：

> 先把数据放入可靠的原生 SQLite，再把需要分页、筛选、排序、搜索和约束的热字段逐步结构化；低价值、演进快的字段保留 JSON。

AIO Hub 移动端当前尚未发布，可以直接采用更完整的结构化 schema，不必复制 Chatbox 的历史兼容层；但其混合列、领域拆库和事务批量 API 值得复用。

来源：

- [Chatbox 存储架构与移动端演进](https://github.com/chatboxai/chatbox/blob/8639c946c0baedfdd12bbc88ac10f5aa87431647/docs/storage.md)
- [Chatbox 移动端 SQLite 通用存储](https://github.com/chatboxai/chatbox/blob/8639c946c0baedfdd12bbc88ac10f5aa87431647/src/renderer/platform/storages.ts)
- [Chatbox 结构化会话元数据与事务批量写入](https://github.com/chatboxai/chatbox/blob/8639c946c0baedfdd12bbc88ac10f5aa87431647/src/renderer/storage/SQLiteSessionMetaStorage.ts)
- [Chatbox 图像生成独立数据库](https://github.com/chatboxai/chatbox/blob/8639c946c0baedfdd12bbc88ac10f5aa87431647/src/renderer/storage/SQLiteImageGenerationStorage.ts)

### 3.3 Joplin：平台驱动抽象、事务串行、版本迁移与 FTS 降级

Joplin 是验证“长期维护后会长成什么样”的样本：

- 移动端使用 `react-native-sqlite-storage`，桌面与 Web 使用不同驱动，但上层共享数据库抽象。
- 数据库升级按版本逐级执行，调查时已有 53 个版本节点。
- 每个版本的 schema 变更和版本号更新在同一个事务批次中执行。
- JS 侧事务额外使用 mutex 串行，避免多个 `BEGIN/COMMIT` 相互干扰。
- FTS 使用外置内容表与触发器同步，这一点与 AIO Hub 计划一致。
- Joplin 没有把 FTS 当成绝对可用能力：FTS 初始化失败时会降级，非拉丁文字也使用 basic search 路径。

Joplin 的关键经验是：**迁移必须可逐版本测试，事务必须绑定到同一数据库连接，全文搜索必须有能力探测和语言降级。**

来源：

- [Joplin 移动端 SQLite 驱动](https://github.com/laurent22/joplin/blob/0faa20d82708202a175e31dbe52f9d60dd82cb36/packages/app-mobile/utils/database-driver-react-native.ts)
- [Joplin 事务批处理与 mutex](https://github.com/laurent22/joplin/blob/0faa20d82708202a175e31dbe52f9d60dd82cb36/packages/lib/database.ts)
- [Joplin schema 迁移与 FTS 触发器](https://github.com/laurent22/joplin/blob/0faa20d82708202a175e31dbe52f9d60dd82cb36/packages/lib/JoplinDatabase.ts)
- [Joplin 搜索语言与 FTS 降级](https://github.com/laurent22/joplin/blob/0faa20d82708202a175e31dbe52f9d60dd82cb36/packages/lib/services/search/SearchEngine.ts)

### 3.4 AppFlowy：Rust 数据服务、嵌入式迁移与连接池配置

AppFlowy 是跨平台 local-first 应用，UI 使用 Flutter，但数据库核心在 Rust：

- Rust `flowy-sqlite` 模块封装 Diesel + SQLite。
- 使用嵌入式 migrations，而不是让 UI 层管理 `user_version`。
- 通过连接池统一设置 `busy_timeout`、`synchronous` 等连接参数。
- 关系型业务数据与协同对象数据库分开管理。
- 数据库生命周期、备份与恢复由 Rust 服务掌握。

这与 AIO Hub 的资产管理设计一致：**当数据库还承担文件、附件、outbox 或跨对象一致性时，数据库应成为原生服务的一部分，而不是 UI 的通用 SQL 客户端。**

来源：

- [AppFlowy SQLite 模块与嵌入式迁移](https://github.com/AppFlowy-IO/AppFlowy/blob/5cf3a365dec0d59f64bad1ee4bb1050471a39b93/frontend/rust-lib/flowy-sqlite/src/lib.rs)
- [AppFlowy 连接池配置](https://github.com/AppFlowy-IO/AppFlowy/blob/5cf3a365dec0d59f64bad1ee4bb1050471a39b93/frontend/rust-lib/flowy-sqlite/src/sqlite_impl/pool.rs)
- [AppFlowy 多数据库生命周期](https://github.com/AppFlowy-IO/AppFlowy/blob/5cf3a365dec0d59f64bad1ee4bb1050471a39b93/frontend/rust-lib/flowy-user/src/services/db.rs)

### 3.5 LobeChat：IndexedDB/PGlite 适合 Web，但不是移动 WebView 的优先参照

LobeChat 当前使用 Dexie/IndexedDB 作为本地缓存层，并提供 PGlite/PostgreSQL 数据库模式。这套方案适合浏览器、PWA 和服务端同构产品，但它不能直接证明 Tauri 移动端 WebView 应继续使用 IndexedDB。

结合 Chatbox 的真实回迁历史，AIO Hub 应将 LobeChat 视为 Web 对照组，而不是原生移动持久化的主要参考。

来源：

- [LobeChat Dexie 依赖](https://github.com/lobehub/lobe-chat/blob/7cd62b70cfdec4c98f34e592291d295511b82c9d/package.json)
- [LobeChat IndexedDB 本地缓存层](https://github.com/lobehub/lobe-chat/blob/7cd62b70cfdec4c98f34e592291d295511b82c9d/src/libs/swr/localDataCache.ts)

## 4. Tauri 官方 SQL 插件调查

调查时 `tauri-plugin-sql` v2 分支版本为 `2.4.0`，底层使用 SQLx 0.8 和捆绑 SQLite。捆绑的 `libsqlite3-sys` 明确启用了 `SQLITE_ENABLE_FTS5`，因此 FTS5 本身有可靠的编译基础。

但当前插件存在四个与本计划直接相关的边界：

1. **JS API 没有事务对象。** `guest-js/index.ts` 只暴露 `execute/select`，每次调用进入 Rust 后直接在 pool 上执行。
2. **`PRAGMA foreign_keys = ON` 是 per-connection。** 现计划在前端 `Database.load()` 后执行一次 pragma，最多只能保证拿到的那条连接；连接池后续创建或取出的其他连接不一定继承。`BEGIN/COMMIT` 也有同样的连接归属问题。
3. **官方已有 Rust migrations。** 插件支持在 `Builder::add_migrations()` 注册 SQLx migration，并在 `load()` 时执行。现计划自行在 JS 使用 `PRAGMA user_version`，实际上绕开了插件更可靠的迁移机制。
4. **iOS 支持标注不一致。** 同一提交中 `Cargo.toml` 的 platform metadata 标为 iOS full，但 README 的支持表仍标为 iOS `x`。这可能是文档滞后，但在 Android/iOS 双端正式验证之前不能把它当成已消除风险。

来源：

- [Tauri SQL 插件 JS API](https://github.com/tauri-apps/plugins-workspace/blob/13c63af965a249c21b998a95d006aab2b687ca0c/plugins/sql/guest-js/index.ts)
- [Tauri SQL 插件连接池执行方式](https://github.com/tauri-apps/plugins-workspace/blob/13c63af965a249c21b998a95d006aab2b687ca0c/plugins/sql/src/wrapper.rs)
- [Tauri SQL 插件 Rust migrations](https://github.com/tauri-apps/plugins-workspace/blob/13c63af965a249c21b998a95d006aab2b687ca0c/plugins/sql/README.md)
- [Tauri SQL 插件平台 metadata 与版本](https://github.com/tauri-apps/plugins-workspace/blob/13c63af965a249c21b998a95d006aab2b687ca0c/plugins/sql/Cargo.toml)
- [`libsqlite3-sys` 0.30.1 捆绑编译脚本](https://docs.rs/crate/libsqlite3-sys/0.30.1/source/build.rs)

## 5. 对现计划的评估

### 5.1 建议保留的设计

- ConfigManager 继续承载低频、扁平配置。
- `llm_chat.db` 独立于 `asset_manager.db`。
- 会话、消息、附件拆表，热查询字段结构化，长尾 metadata 保留 JSON。
- 消息树以 `parent_id + sibling_order` 持久化，加载后 O(N) 重建。
- 外置内容 FTS 表通过触发器同步。
- LLM 流式生成不按 token 落盘。
- 跨库不尝试外键，使用 ID + transactional outbox。
- 删除业务数据前先写 release outbox，并依赖资产命令幂等处理重复投递。

### 5.2 必须在实施前修正的问题

#### P0：事务边界改到 Rust

新增 `llm_chat_storage` Rust 模块，至少提供领域级命令：

- `list_chat_sessions`
- `load_chat_session`
- `persist_chat_changes`
- `delete_chat_branch`
- `delete_chat_session`
- `search_chat_messages`
- `drain_asset_usage_outbox`

`persist_chat_changes` 一次接收会话变更集，在同一 SQLx transaction 中写入 session、messages、attachments 和 outbox。前端不发送任意 SQL。

#### P0：使用原生 migration runner

不采用计划中的 JS `PRAGMA user_version` 循环。推荐使用 `sqlx::migrate!()` 或 Tauri SQL 插件自带的 Rust migration 机制，并满足：

- 每个 migration 与版本记录同事务提交。
- migration 文件进入源码版本控制。
- 从每个历史版本到最新版都有自动测试。
- 应用降级打开更高 schema 时明确拒绝，而不是继续读写。

#### P0：所有连接统一配置

通过 `SqliteConnectOptions` 配置每条池连接，而不是连接建立后从 JS 执行一次 pragma：

- `foreign_keys(true)`
- `journal_mode(Wal)`，并在 Android/iOS 真机验证
- `busy_timeout(...)`
- 明确 `synchronous` 策略，建议先以 `NORMAL` 做性能/可靠性测试
- 移动端 SQLite 单写者特性下将 pool 控制在 2-4 条连接，避免无收益的竞争

#### P0：重新定义中文全文搜索策略

当前 DDL 未指定 tokenizer，默认 `unicode61` 不等于可靠的中文分词。Joplin 对非拉丁文字直接走 basic search，说明成熟项目会显式处理这一限制。

建议首版采用以下可验证策略之一：

1. **优先方案：** FTS5 `trigram` 支持 3 个及以上 Unicode 字符的子串检索，1-2 字符查询降级到受限 `LIKE`；同时保留英文/数字查询行为测试。
2. **更完整方案：** Rust 侧使用确定性的中日韩分词/归一化，写入额外 `search_tokens` 列，再由 `unicode61` 索引。
3. **最低风险方案：** 首版只承诺拉丁文字 FTS，中文走 basic search，并在真实数据规模达到阈值后引入分词器。

无论选哪种，都应测试简体中文、繁体中文、日文、英文、emoji、引号、连字符以及 1/2/3 字符查询。SQLite 官方说明 trigram 适合子串匹配，但少于 3 个 Unicode 字符的模式无法使用 trigram 索引。

来源：

- [SQLite FTS5 trigram tokenizer](https://www.sqlite.org/fts5.html#the_trigram_tokenizer)
- [SQLite FTS5 unicode61 tokenizer](https://www.sqlite.org/fts5.html#unicode61_tokenizer)

#### P0：修正类型与 codec 的数据丢失风险

计划中的 `MessageMetadata` 示例已经落后于当前 `ChatMessageNode.metadata`。当前类型还包含：

- `agentId`
- `usage`
- `contentTokens`、`contentTokenSource`、`contentTokenizer`
- `contextUsage`
- `requestStartTime`、`requestEndTime`、`firstTokenTime`、`tokensPerSecond`

如果按计划示例白名单编码，这些字段会在 SQLite round-trip 后丢失。应使用共享 codec 做无损往返测试，并明确未知 metadata 字段的保留策略。

此外，schema 将 `timestamp` 定义为 `NOT NULL`，但当前 TypeScript 类型为可选；计划只处理了可选 `type`，没有处理 `timestamp`。需要在领域层统一补值或把 schema 语义改为允许缺省。

#### P1：避免每次保存重写整段会话

规范化到消息表后，如果 `persistSession()` 仍对会话内全部消息逐条 upsert，写放大仍为 O(N)。建议前端或 Rust 服务维护 change set，只写新增、编辑、删除和分支选择变化。

流式回复采用：

- 内存持续更新 UI。
- 每 1-3 秒或达到一定字符数做一次可选 crash-recovery checkpoint。
- 完成或错误时立即最终提交。
- FTS update trigger 改为 `AFTER UPDATE OF content, reasoning_content`，并加值变化条件，避免只更新 status/metadata 时重建索引。

#### P1：完善索引与查询

- `idx_messages_parent` 建议改为 `(session_id, parent_id, sibling_order)`，直接覆盖子节点有序查询。
- 会话列表数据量增长后使用 `(updated_at, id)` keyset pagination，而不是大 OFFSET。
- FTS 查询增加明确排序，如 `bm25()` 与更新时间的产品化组合；当前示例只有 `LIMIT 100`，结果顺序未定义。
- 用户输入必须由专用 FTS query encoder 转义，不能直接拼接引号和 `OR`。
- 时间字符串必须全部使用固定 UTC `toISOString()` 格式，否则 TEXT 排序不可靠。

#### P1：补齐计划遗漏的 `currentSessionId`

当前 `useSessionManager.loadSessions()` 还返回 `currentSessionId`，但目标 schema 没有保存位置。它属于轻量 UI 状态，建议继续放在 `ConfigManager`，不要为了一个键增加全局数据库或塞进任意 session 行。

#### P1：outbox 不应被单个永久错误全局阻塞

全局严格按 `sequence` 投递可以保证顺序，但一条永久失败事件会阻塞所有后续实体。更合理的语义是：

- 同一 `(module_id, entity_type, entity_id)` 严格有序。
- 不同实体允许继续投递。
- 超过阈值进入可诊断的 dead-letter 状态，并保留手动重试能力。
- 资产命令成功、聊天库标记 delivered 之前崩溃时允许重复投递，因此 `event_id` 和整体 replacement 语义必须幂等。

#### P2：明确备份与加密边界

- WAL 模式下不能在数据库打开时只复制 `.db` 文件作为备份，应使用 SQLite backup API、`VACUUM INTO` 或先 checkpoint/close。
- 多数据库架构的“单工具备份”很方便，但“全应用一致快照”不能天然保证，需要产品明确备份粒度。
- Chatbox 当前显式使用 `no-encryption`，Jan 也未展示聊天库加密；这说明未加密 SQLite 很常见，但不代表适合 AIO Hub 的隐私承诺。首版至少要记录威胁模型：依赖系统沙盒，还是引入 SQLCipher/安全密钥存储。

## 6. 推荐目标架构

```text
Pinia / composables
        |
        v
TypeScript ChatRepository（领域 DTO，不暴露 SQL）
        |
        v  Tauri invoke
Rust llm_chat_storage commands
        |
        +-- codec / validation
        +-- SQLx migrations
        +-- transaction + outbox
        +-- search query encoder
        |
        v
llm_chat.db
  chat_sessions
  chat_messages
  chat_attachments
  asset_usage_outbox
  chat_messages_fts

ConfigManager
  currentSessionId
  llm-chat UI preferences
```

如果坚持使用 `tauri-plugin-sql`，最低可接受方案是：

- schema migration 注册在 Rust Builder。
- 为需要原子提交的业务新增 Rust command，直接取得/管理事务连接。
- JS 插件只用于简单只读查询或不要求跨语句原子性的单条写入。

这会同时维护插件接口和自定义数据库服务，复杂度通常高于直接采用 Rust SQLx 服务，因此仅作为次选。

## 7. 方案决策矩阵

| 方案                       | 开发成本 | 事务可靠性       | Android/iOS 可控性        | FTS/迁移可控性 | 结论                       |
| -------------------------- | -------- | ---------------- | ------------------------- | -------------- | -------------------------- |
| JS 直用 `tauri-plugin-sql` | 低       | 低，缺少事务句柄 | 中，iOS 标注需验证        | 中             | 不用于核心聊天写入         |
| Rust + SQLx 领域服务       | 中       | 高               | 高                        | 高             | **推荐**                   |
| 插件 + 自定义事务 command  | 中高     | 高               | 高                        | 高             | 次选，双层维护             |
| IndexedDB/Dexie            | 低       | 中               | 低，依赖 WebView 生命周期 | 中             | 不推荐作为移动端主存储     |
| 继续 JSON 文件             | 低       | 低               | 中                        | 低             | 仅保留配置，不用于聊天主体 |

## 8. 建议实施顺序

### 阶段 0：双端能力验证

先做最小 Rust/SQLx spike，并在 Android 与 iOS 真机或正式构建链验证：

- 创建、关闭、重开数据库。
- `PRAGMA compile_options` 包含 FTS5。
- `CREATE VIRTUAL TABLE ... tokenize='trigram'` 可用。
- 每条连接的 `foreign_keys`、`journal_mode`、`busy_timeout` 符合预期。
- 事务中途强杀应用后没有半提交。
- 10 万条中英混合消息的索引构建、搜索、会话加载和数据库体积。

### 阶段 1：Rust 存储骨架与 migrations

- 新增 `llm_chat_storage.rs` 或模块内同级文件，不新增无必要的 `mod.rs`。
- 使用 SQLx migrations 创建 schema v1。
- 建立连接池与统一 connect options。
- 增加 schema、foreign key、codec round-trip 和 crash-recovery 测试。

### 阶段 2：会话与消息增量持久化

- 先迁移会话列表、单会话加载和消息 change set。
- `currentSessionId` 继续由 ConfigManager 管理。
- 保留旧 JSON 实现作为短期开发回退开关，双端验证完成后删除；移动端未正式发布，不需要长期数据迁移包袱。

### 阶段 3：附件与 usage outbox

- 与资产管理器命令契约一起落地。
- 用故障注入覆盖“资产命令成功但 delivered 未标记”等重复投递窗口。
- 验证分支删除、会话删除和附件替换的 release/replace 顺序。

### 阶段 4：全文搜索

- 在真实中日韩与英文语料上选定 tokenizer/fallback。
- 增加 query encoder、rank、snippet 与结果上限。
- 只有通过双端构建和真实 WebView/Tauri 运行态后，才把 FTS 设为强依赖；否则保留 basic search 降级。

## 9. 验收清单

- Android 与 iOS 均完成 Tauri 真实构建和数据库启动验证。
- 每个 migration 均可从上一版本升级，并在失败时完整回滚。
- `PRAGMA foreign_key_check` 无结果，删除会话能级联删除消息与附件。
- 当前全部 `ChatMessageNode` 字段经过 SQLite round-trip 后无损。
- 应用在 transaction 任意阶段被强杀，不出现半会话、孤儿附件或缺失 outbox。
- 同一 outbox 事件重复投递不会产生重复 usage。
- 中文 1/2/3 字查询、英文前缀、短语、引号和特殊字符行为有明确测试与产品定义。
- 10 万消息基准覆盖冷启动、会话列表、单会话加载、搜索、删除与索引重建。
- 备份过程包含 WAL 一致性策略，恢复后通过 `PRAGMA integrity_check`。
- 日志不记录消息正文、附件内容或其他敏感数据。

## 10. 最终建议

应继续推进 SQLite 迁移，不建议退回 JSON，也不建议改用 IndexedDB。现计划最需要的不是换数据库，而是把数据库的**所有权**从前端 SQL 调用提升到 Rust 领域服务。

建议最终决策为：

> **ConfigManager + 每领域独立 SQLite + Rust/SQLx 服务层 + 原生 migrations + 领域事务/outbox + 可降级的多语言 FTS。**

这与 Jan、Chatbox、Joplin、AppFlowy 的共同趋势一致，也能真正满足 AIO Hub 当前文档已经提出的附件、跨库 usage、模块自治和移动端资源约束。

