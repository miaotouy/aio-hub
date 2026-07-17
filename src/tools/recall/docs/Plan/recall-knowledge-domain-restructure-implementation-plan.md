# Recall / Knowledge 领域拆分与重构实施计划

**状态**: Pre-Stage、Stage 0 与 Stage 1 已完成；下一步进入 Stage 2，直接迁移到 Recall 数据库
**创建日期**: 2026-07-17
**最近修订**: 2026-07-17
**适用范围**: `src/tools/knowledge-base/`、计划新增的 `src/tools/recall/`、`src/tools/llm-chat/`、`src/tools/agent-manager/`、`src-tauri/src/knowledge/`、计划新增的 `src-tauri/src/recall/`

关联调查：

- [检索模式与思绪引擎设计调查](./retrieval-profile-knowledge-memory-design.md)
- [后端存储数据库化设计调查](./backend-storage-database-design.md)
- [重构前按库备份与恢复功能计划](./pre-restructure-library-backup-import-export-plan.md)

> 本文是两份调查的唯一施工顺序来源。调查文档负责记录架构结论、schema、算法边界和风险，不再分别维护 Phase 或实施顺序。

---

## 1. 已确认决策

### 1.1 领域命名

现有 CAIU 系统的中文产品名继续使用 **思绪**，英文领域名采用 **Recall**，不使用直译 `Thought`。

`Recall` 表达的是“一组可被主动或被动唤回的原子条目，以及负责唤回它们的方法”。它不表示条目一定是人的思想，也不表示条目归属于某个 Agent、会话或消息。

统一命名：

| 语义             | 中文 UI  | 英文 / 代码名         |
| ---------------- | -------- | --------------------- |
| 现有 CAIU 数据域 | 思绪     | Recall                |
| 思绪集合         | 思绪集   | `RecallCollection`    |
| 原子条目         | 思绪条目 | `RecallEntry`         |
| 数据访问层       | -        | `RecallRepository`    |
| 召回配置         | 召回配置 | `RecallSettings`      |
| Agent 绑定       | 思绪绑定 | `RecallBinding`       |
| 稳定语义召回     | 语义     | `semantic` profile    |
| 联想式多信号召回 | 联想     | `associative` profile |
| 文档资料域       | 知识     | Knowledge             |
| 双域上层编排     | 检索     | Retrieval             |

长期 API 采用：

```ts
type RetrievalMode = "recall" | "knowledge" | "mixed";
type RecallProfile = "semantic" | "associative";
type RetrievalSourceType = "recall" | "knowledge";
```

信息检索指标中的 recall 必须使用完整名称，例如 `recallRate` 或 `retrievalRecallRate`，避免与 Recall 领域名混淆。

### 1.2 领域切割

当前名为 `knowledge-base` 的实现实际上是完整语义条目系统。它的 CAIU、标签、priority、向量、tag pool、Lens / Blender、管理 UI、Agent 写入工具和被动召回能力整体迁入 Recall。

原 `knowledge-base` 不再承担 Recall 兼容实现。它保留为 Knowledge / 知识资料库的产品入口和模块空壳，后续只接收 document/chunk/source、文件同步、BM25、向量、图扩散和出处回源能力。

目标边界：

```text
Recall / 思绪
  数据: 完整语义条目、标签、priority、AssetRef
  索引: 倒排索引、条目向量、tag pool、运行时联想结构
  检索: semantic / associative
  禁止: 自动切片、文档 manifest、文件监听

Knowledge / 知识
  数据: document / chunk / source
  索引: BM25、向量、图关系、文件 manifest
  检索: 文档检索与出处回源
  禁止: 写入 Recall entry、复用 Recall priority 或 tag pool

Retrieval / 检索编排
  职责: 路由 recall / knowledge / mixed，统一结果契约与跨域融合
```

### 1.3 兼容与迁移态度

当前用户量较小，本轮接受一次明确的破坏性领域迁名，不为旧产品名和旧自由文本占位符建设长期兼容层。

但以下两类兼容必须严格区分：

- **用户源数据安全不可破坏**：旧 CAIU、集合元数据、向量、标签池、UUID 和结构化 Agent 绑定必须自动迁移、可校验、可回滚。
- **旧命名和自由文本语法可以结束兼容**：`knowledgeBaseConfig`、`kb-basic`、`{{kb}}`、`【kb】` 等旧名称完成迁移或明确告警后，不继续作为长期 API。

不得以“用户少”为理由静默丢失条目、重新生成 ID、清空绑定，或把失效占位符替换为空文本。

### 1.4 双域占位符协议

重构后的被动注入使用两个互不兼容的命名空间，禁止继续扩展旧的按位置参数语法：

```text
【recall】
【recall::collection=<collection-id>::profile=semantic::limit=8::min-score=0.35::when=always】
【knowledge】
【knowledge::library=<library-id>::strategy=hybrid::limit=8::min-score=0.35::when=always】
```

- 语法信封为 `【<domain>(::<key>=<value>)*】`，key 使用 ASCII kebab-case；参数顺序不影响语义，serializer 输出固定 canonical 顺序。
- Recall processor 只接受 `collection`、`profile`、`limit`、`min-score`、`when`、`gate-tags`、`every-turns`、`entries`；Knowledge processor 只接受 `library`、`strategy`、`limit`、`min-score`、`when`、`citation`。未知、重复（目标 key 除外）、无值、非法枚举和非法数值必须报错并带消息索引、原文和 key。
- `collection` / `library` 只使用稳定 ID。省略目标表示当前 Agent 已启用的同域 binding；显式目标必须属于这些 binding。占位符参数覆盖 binding 默认值，再覆盖域级默认值。
- serializer 使用 `encodeURIComponent` 处理 value；parser 解码并校验后才构造请求。不得接受 `kb`、`memory`、`thought` 或跨域别名，也不得让 `engineId` 从提示词进入运行时。
- `mixed` 继续是主动 `RetrievalMode` 和路由层能力；需要双域上下文时使用两个占位符，不建设 `【mixed】`。

---

## 2. 目标结构

### 2.1 前端模块

```text
src/tools/
├── recall/
│   ├── recall.registry.ts
│   ├── Recall.vue
│   ├── actions/
│   ├── components/
│   ├── composables/
│   ├── core/
│   ├── logic/
│   ├── services/
│   ├── stores/
│   └── types/
└── knowledge-base/
    ├── knowledge-base.registry.ts
    ├── KnowledgeBase.vue
    └── 后续 Knowledge document/chunk 实现
```

Recall 与 Knowledge 不互相导入业务 store、entry 类型或 repository。后续确有共享需求时，只在上层 Retrieval 契约中共享查询与结果类型。

### 2.2 Rust 模块

```text
src-tauri/src/
├── recall/
│   ├── commands/
│   ├── index/
│   ├── search/
│   ├── storage/
│   ├── repository.rs
│   └── state.rs
└── knowledge/
    ├── library/
    ├── ingest/
    ├── repository.rs
    └── search/
```

现有 `src-tauri/src/knowledge/` 中属于 CAIU 的实现迁到 `recall/`。Knowledge 空壳只保留未来资料库所需边界，不继续导出 `kb_*` CAIU command。

### 2.3 数据目录

最终目录：

```text
appData/
├── recall/
│   ├── recall.db
│   └── recall-vectors.db
└── knowledge/
    ├── knowledge_meta.db
    └── libraries/
        └── {libraryId}.tdb 文件组
```

旧版导入源：

```text
appData/knowledge/
├── bases/
├── vectors/
└── tag_pool/
```

旧数据直接导入最终 `recall.db + recall-vectors.db`，不新增 `appData/thought/`，也不先创建一套 JSON 形式的 Recall 过渡目录。

导入成功后旧目录保持只读并记录迁移标记。未经过用户确认或既定清理版本，不自动删除旧目录。

---

## 3. 总体施工规则

1. 先完成 Pre-Stage 并发布一个可按库备份、可恢复的稳定版本；该版本真实往返验证通过前，不开始 Recall / Knowledge 重构施工。
2. 后续施工按下列 Stage 0-7 依次推进；阶段内部可以拆分提交，但不得发布不可读取旧数据或用户备份的中间状态。
3. Recall 领域切割、最终数据库导入、结构化 Agent 配置迁移和 Chat 自动注入切换属于同一个发布边界。
4. 检索算法融合晚于等价迁移。迁移基线必须能够证明相同输入在旧引擎与迁移后旧引擎上得到可解释的等价结果。
5. Knowledge 在 Recall 稳定前只保留模块入口，不提前复用 Recall 类型或模拟 document/chunk 功能。
6. 算法实验参数留在请求、profile、trace 或可删除缓存中，不向 `recall_entries` 增加实验字段。
7. 每个阶段完成后同步更新本文状态；调查结论发生变化时回写对应调查文档，但不在调查文档重新维护施工清单。

---

## 4. Pre-Stage：发布按库备份与恢复版本

**阶段状态**: 已完成。2026-07-17 用户完成真实导入/导出验证并确认未发现问题，正式解锁 Stage 0。

### 目标

在现有 `knowledge-base` 文件存储和现有产品命名上补齐用户可操作的恢复通道，让用户可以在后续破坏性迁名与数据库迁移前主动备份源数据。

### 工作项

- 按 [重构前按库备份与恢复功能计划](./pre-restructure-library-backup-import-export-plan.md) 实现版本化 `.aio-kb` 单库备份包。
- 提供“导出全部”，一次选择目标目录后生成一个带根索引和库子目录的多库 ZIP 容器（不嵌套单库 ZIP）；保留单库 `.aio-kb` 导出，并支持导出选中库。
- 提供单个或多选备份包导入；默认恢复原库 ID，无冲突时保留条目 ID，冲突时默认导入为副本。
- 备份条目源字段、库级元数据和实际引用资产；向量、tag pool、HNSW 和运行时索引不进入备份包。
- 导出从持久化真源读取并执行完整性校验，不能依赖异步 warmup 是否已经把所有条目装入内存。
- 只读兼容当前 `kb_export_base` 生成的 legacy JSON / YAML；后续 `LegacyFileRecallImporter` 必须继续读取 `.aio-kb` v1。
- 发布说明提示用户在后续重构版本前执行一次“导出全部”。

### 完成门槛

- 在独立临时 appData 上完成“现有多库数据 -> 导出全部 -> 多包导入 -> 字段与资产 hash 对比”的真实往返。
- 多库容器按索引将每个库作为独立导入单元；单库损坏不阻止其他库导入，并有结构化报告，单库 `.aio-kb` 仍可独立恢复。
- 重复导入不会静默覆盖；显式替换失败不会损坏原库或留下 workspace / 后端半完成状态。
- 前端检查、后端检查、单元测试、Vite build 和真实 Tauri smoke test 通过。
- 该功能已经作为重构前稳定版本发布；未达到此门槛不得进入 Stage 0。

---

## 5. Stage 0：冻结迁移基线

**阶段状态**: 已完成。版本化跨前后端基线夹具已覆盖多集合、重复标签、多模型向量、禁用条目、AssetRef、损坏向量边界、四类检索查询、Agent 工具 ID、自动注入、宏和旧占位符行为；现有文件目录、`.aio-kb` v1、legacy JSON / YAML 均已纳入可重复测试输入。2026-07-17 已通过知识模块后端测试、全量前端单测、lint、TypeScript、Vite build 和 backend Clippy。

### 目标

建立可以判断“领域迁名和数据库迁移没有改变现有行为”的基线。

### 工作项

- 固定一组包含多集合、重复标签、多模型向量、禁用条目、AssetRef 和损坏边界数据的迁移夹具。
- 记录旧版集合、条目、向量覆盖、tag pool、tokens 和 workspace 列表统计。
- 固定 keyword、vector、lens、blender 的代表查询与结果快照；分数允许浮点误差，但命中集合和过滤语义必须可解释。
- 记录 Agent 自动注入、手写占位符、主动工具搜索和写入的当前行为。
- 将已发布的 `.aio-kb` v1、legacy JSON / YAML 和现有文件目录同时纳入迁移输入夹具。

### 完成门槛

- 迁移夹具可重复创建。
- 旧版统计和检索基线可由自动测试读取。
- 已定义迁移成功、部分成功、失败回滚三种可观察状态。
- `.aio-kb` v1 可独立恢复到当前文件存储，并可被计划中的 `LegacyFileRecallImporter` 读取。

---

## 6. Stage 1：建立 Recall 领域并搬迁现有实现

**阶段状态**: 已完成。2026-07-17 已将 CAIU 前端、Rust 后端、Agent actions、索引、tag pool、检索引擎与监控能力整体迁入 Recall；新增 `/recall`、`recall-basic`、`recall-admin` 和 `recall_*` Tauri commands。`/knowledge-base` 已改为不导入 Recall store/action/service 的 Knowledge 空壳，Rust Knowledge 模块不注册任何 command。旧 Agent 结构化配置、宏与占位符仍按 Stage 0 基线保留，统一留待 Stage 3 进行版本化迁移。

验证结果：Recall 前端类型检查、19 项模块单测、Vite build、前端 lint、后端 Clippy 与真实 Tauri dev smoke test 均通过；smoke test 已确认 `AIO Hub` 主窗口成功创建。由于 Stage 2 尚未开始，Recall 当前仍从旧 `appData/knowledge/` 文件目录读取源数据；这是计划内的临时存储边界，不表示 Knowledge 领域继续拥有 Recall 运行时。

### 目标

先完成代码所有权切割，不在这一阶段改变 Lens / Blender 算法行为。

### 工作项

- 新增前端 `src/tools/recall/` 和 Rust `src-tauri/src/recall/`。
- 将 CAIU 管理 UI、store、service、Agent actions、索引、tag pool、检索引擎和监控能力迁入 Recall。
- 将对外类型改为 `RecallCollection`、`RecallEntry`、`RecallResult` 等正式名称；旧 `Caiu` 类型只允许保留在 legacy importer DTO 或尚未完成迁移的内部边界。
- 新增 `recall_*` Tauri commands，并同步注册到 `generate_handler![]`。
- 新增 `/recall` 工具入口和 `recall-basic`、`recall-admin` Agent 工具。
- 将原 `/knowledge-base` 入口改为 Knowledge 空壳，不挂载 Recall store、Recall actions 或 CAIU UI。
- 保持旧算法实现与参数不变，为下一阶段数据迁移提供稳定消费者。

### 完成门槛

- Recall 模块可以在测试数据上独立完成原有 CAIU 浏览、编辑、向量化、搜索和 Agent action。
- Knowledge 空壳编译通过，且不能写入 Recall 数据。
- 新代码不再新增 `Thought` / `thought` 领域命名。

---

## 7. Stage 2：直接迁移到 Recall 数据库

### 目标

一次性把旧文件系统真源导入最终 Recall 数据库，消除多真源漂移。

### 工作项

- 锁定并引入调查确认的 `rusqlite` 版本。
- 创建 `recall.db`、`recall-vectors.db` 和各自独立的 `schema_migrations`。
- 实现 `RecallRepository`、`SqliteRecallRepository` 和只用于迁移/恢复的 `LegacyFileRecallImporter`。
- 迁移旧 base、CAIU、向量模型索引、entry vectors 和 tag pool；恢复入口同时接受 `.aio-kb` v1 与 legacy JSON / YAML。
- 保留旧集合 ID 和条目 ID；字段映射只改语义名称，不重新生成 UUID。
- 主库与向量库分别记录迁移状态。向量损坏可以降级为待重建，但不得阻止已成功导入的源条目使用。
- warmup 从 Recall repository 加载源数据并重建现有内存读模型。
- 写路径改为主库短事务、内存同步、派生向量清理和监控事件的既定顺序。
- Recall 集合列表改由数据库返回，前端 workspace 不再保存列表真源。

### 迁移不变量

- 导入幂等；重复启动不会复制集合或条目。
- 主库成功标记只能在集合和条目事务提交、统计校验通过后写入。
- `createdAt`、`updatedAt`、priority、enabled、TagWithWeight 和 AssetRef 原值保留。
- `refs/refBy`、HNSW、矩阵和算法中间结果按派生数据重建。
- 内容 hash 不匹配的旧向量不得被判定为 ready。
- 旧目录在迁移后保持只读，不自动删除。

### 完成门槛

- 基线夹具的集合数、条目数和内容 hash 完全一致。
- 可恢复向量的模型、维度、tokens 和覆盖统计一致；损坏向量生成明确报告。
- 删除 `recall-vectors.db` 后仍可浏览、编辑和关键词搜索，并能重新向量化。
- 模拟中断后再次启动可以幂等继续或安全回滚。

---

## 8. Stage 3：迁移 Agent、Chat 与工具配置

### 目标

让结构化配置自动完成迁名，让自由文本旧语法以可见方式退出。

### 结构化配置自动迁移

```text
knowledgeBaseConfig   -> recallConfig
knowledgeSettings     -> recallSettings
kbId                  -> recallId
kbName                -> recallName
kb-basic              -> recall-basic
kb-admin              -> recall-admin
defaultEngineId       -> defaultRecallProfile 或显式 legacyEngineId
```

- binding 迁移保留原集合 ID、名称、enabled、mode、modeParams、limit、minScore 和 group。
- Agent 的工具开关、方法开关、自动批准和 override 中涉及旧工具 ID 的 key 必须同步迁移。
- 配置迁移使用 Agent 配置版本号和幂等 migration，不在各组件挂载时零散修补。

### Chat 自动注入

- 自动注入改为直接构造 Recall 请求，不需要用户修改预设文本。
- 新宏使用 `{{recall}}` / `{{recall_list}}`；带参数形式与占位符共享命名参数，例如 `{{recall::collection=<collection-id>::limit=8}}`。
- 新占位符使用 1.4 节定义的 `【recall::key=value】` 协议，由 Recall processor 维护独立 schema；不把旧 `modeParams` 或 `engineId` 位置槽带入新语法。
- 新建共享的占位符信封 tokenizer、编码器和诊断类型，但 Recall / Knowledge 的参数白名单、默认值解析和请求构造必须分开实现。
- Agent Manager 的插入器按稳定集合 ID 生成 canonical 语法，显示名称只用于 UI；编辑器不得用集合名称反向拼接占位符。
- processor、日志、context analyzer 和 source metadata 使用 Recall 命名。

### 手写旧占位符

需要检测：

```text
{{kb}}
{{kb_list}}
【kb::...】
【knowledge::<position-args>】  // 历史上实际指向 CAIU；新版 `key=value` 语法不在此列
```

处理规则：

- 不默认批量改写自由文本，避免把教程、示例或引用误当成执行语法。
- 在 Agent 加载、导入和编辑时生成迁移报告，并提供按 Agent 的一键替换；只有旧名称能在该 Agent binding 中唯一解析时才可建议 `collection=<collection-id>`，歧义目标必须由用户选择。
- 运行时遇到旧占位符必须产生明确警告和可定位日志，不得静默替换为空。
- 旧 `【knowledge】` 不得继续指向 Recall；迁移扫描必须把裸 `【knowledge】` 和不含 `key=value` 的 `【knowledge::<position-args>】` 标记为“历史 CAIU 语法”，不能把合法的新 `【knowledge::library=...】` 误报或自动解释为旧文档资料库。
- 过渡告警窗口结束后删除旧 parser 分支，不建设永久 alias。

### 完成门槛

- 自动注入模式无需用户修改即可继续工作。
- 结构化 Agent binding 和工具权限迁移前后数量一致。
- 所有含旧自由文本语法的 Agent 都能在迁移报告中定位。
- 新版运行时不存在旧占位符导致的静默上下文丢失。
- Recall parser / serializer round-trip 后语义一致；非法参数、未授权集合 ID 与跨域参数均产生结构化错误。

---

## 9. Stage 4：收口 Recall 检索契约

### 目标

在融合算法前修复当前契约裂缝，并建立稳定的 profile 与结果语义。

### 工作项

- 统一通过 `RetrievalEngineInfo.requiresEmbedding` 或单一 capability helper 决定是否生成查询向量。
- 修复 blender 等需要向量但未被前端硬编码列表覆盖的问题。
- 扩展结果 signal 类型，覆盖 key、keyword、content vector、tag vector、lens、blender 和 multi-signal。
- 引入 `RecallProfile = "semantic" | "associative"`。
- 保留底层 `engineId` 仅供 Playground、调试和短期迁移映射；产品配置使用 profile。
- 缓存 key 加入规范化 profile / engine 和算法版本，避免迁移前后误命中。
- 统一 trace，区分候选召回、融合、过滤、minScore 和 TopK。

### 完成门槛

- capability 判断不再散落硬编码引擎 ID。
- 前后端结果枚举一致。
- semantic profile 可以作为数据库迁移后的稳定回归基线。
- associative 尚未融合时有明确的临时映射，不暴露不存在的行为。

---

## 10. Stage 5：融合 Recall 检索引擎

### 目标

将 Lens / Blender 的有效能力收口为 Recall 的 associative profile，同时保留 semantic profile 的稳定相关性语义。

### 工作项

- 新增 `recall.rs` 或等价的 Recall engine facade，复用现有 Lens / Blender 核心函数，不直接在旧文件上原地改名。
- semantic profile 以内容向量为主、标签向量为辅，维持相对稳定的相关性和阈值行为。
- associative profile 组合标签扩散、历史投射、残差挖掘和多信号融合，结果分数解释为 activation / resonance。
- Playground 保留底层引擎与参数，用于固定查询集对照。
- 默认注入优先 semantic；associative 默认更少结果、更高门槛，并提供充分 trace。
- 只有基准证明跨请求缓存有收益时，才在 `recall-vectors.db` 增加带 `algorithm_version`、`config_hash` 和 `source_hash` 的可删除缓存。

### 完成门槛

- 固定查询集覆盖精确查询、语义改写、标签联想、历史牵引和弱相关噪声。
- 旧 Lens / Blender 代表行为有对照报告，不要求分数完全相同，但差异必须可解释。
- associative 不降低默认被动注入的准确性和可控性。
- 删除算法缓存不影响源内容和基础检索。

---

## 11. Stage 6：建设 Knowledge 资料库

### 目标

在 Recall 边界稳定后，把原 Knowledge 空壳建设为真正的传统 RAG 资料库。

### 工作项

- 实现 Knowledge library repository、manifest migration 和 library CRUD。
- 接入文件导入、解析、切片、embedding、BM25、图关系和来源回溯。
- 桌面端需要文件夹同步时，引入已调查确认的 debounced watcher 和持久化 ingest queue。
- 通过 repository 隔离 TriviumDB；运行态、锁、文件组恢复或跨平台验证不通过时，允许使用 SQLite manifest + FTS5 过渡。
- 新增 Knowledge binding、`{{knowledge}}` / `{{knowledge_list}}` 宏和 1.4 节定义的 `【knowledge::key=value】` processor；目标使用稳定 library ID，不复用 Recall binding 或历史 `【knowledge】` 的 CAIU 语义。
- Knowledge parser 独立校验 `library`、`strategy`、`limit`、`min-score`、`when`、`citation`，第一阶段只接受 `when=always`；不得接受 Recall 的 `profile`、`entries`、`gate-tags` 或 `every-turns`。
- Agent Manager 将原 KB 占位符编辑器拆为 Recall / Knowledge 两个域编辑器，宏选择器和 context analyzer 明确展示来源域、稳定 ID、解析错误与注入结果。
- 实现 `retrievalMode = "knowledge"`，结果必须携带 library、source path、chunk index、heading 和 `sourceType`。
- 最后实现 `mixed` 双路召回；先保留分域配额，再使用 RRF 或统一 reranker，禁止直接比较两域原始分数。

### 完成门槛

- Knowledge 的导入、增量更新、删除、重建和来源回溯闭环可验证。
- 删除某个 Knowledge library 文件组不影响 Recall。
- Knowledge chunk 不进入 Recall entry、tag pool、priority 或 workspace 列表。
- `mixed` 结果可以解释每条内容的来源域和融合依据。
- Knowledge parser / serializer round-trip 后语义一致；未授权 library ID、Recall 参数和历史位置参数均不能触发检索。

---

## 12. Stage 7：清理旧边界

### 工作项

- 删除旧 `kb_*` command、旧 Agent 工具 ID、旧宏和旧占位符 parser；共享信封 tokenizer 只保留 `recall` / `knowledge` 两个已登记 namespace。
- 删除 Recall 代码中的 `KnowledgeBase*`、`Kb*`、`Thought*` 长期类型名。
- 清理仅为旧文件系统运行时保留的 IO 和目录扫描路径，保留独立 legacy importer / restore 工具。
- 为用户提供旧目录状态、迁移报告、导出和确认清理入口。
- 更新架构文档、Agent 配置说明、工具说明和群公告中的破坏性变更说明。

### 完成门槛

- 常规运行路径不再读取旧 `bases/vectors/tag_pool`。
- `rg` 检查旧领域词仅存在于 legacy importer、migration、历史说明和兼容测试中。
- 用户确认清理前仍可通过导出或旧目录恢复源条目。

---

## 13. 验证矩阵

每个可发布阶段至少执行：

- 前端 lint、类型检查、单元测试和 Vite build。
- Rust 单元测试、`cargo check` 和项目既有 backend check。
- Pre-Stage 执行 `.aio-kb` 单库、批量、资产、冲突、损坏包、ZIP 路径安全和独立 appData 往返测试。
- Repository CRUD、批量事务、损坏输入、幂等导入和中断恢复测试。
- Agent 配置导入/导出、binding、工具权限、自动注入和旧占位符告警测试。
- Recall / Knowledge 占位符分别覆盖 canonical serialize、乱序 parse、URL 编解码、重复目标、未知/跨域参数、非法值、未授权 ID、多占位符同消息和跳过历史消息；增加两个域同时出现但不串参数、不串结果的集成测试。
- 宏测试覆盖 `{{recall}}` / `{{recall_list}}`、`{{knowledge}}` / `{{knowledge_list}}` 及其命名参数展开；明确断言不存在 `【mixed】` 和位置参数输出。
- keyword、semantic、associative 的固定查询集回归。
- 桌面 Tauri 真实运行态 smoke test。
- 移动端依赖变更通过项目真实 Tauri build 验证；普通 Cargo 探针不能替代。

发布前必须输出一份迁移报告样例，至少包含：

```text
源集合数 / 已迁移集合数
源条目数 / 已迁移条目数 / 跳过条目数
向量模型数 / 已迁移向量数 / 待重建向量数
标签向量数
已迁移 Agent binding 数
检测到旧占位符的 Agent 列表
旧数据目录位置
回滚或恢复说明
```

---

## 14. 明确不做

- 不建立 Thought 作为第三套领域名或兼容目录。
- 不把 Recall 条目绑定到 Agent、会话、分支或消息。
- 不在 Recall 条目主表保存召回路径、融合分数、时间衰减结果或认知生命周期状态。
- 不把旧 `【knowledge】` 长期映射到 Recall。
- 不复用位置参数、`kbName` 或显示名称设计新的 Recall / Knowledge 占位符，也不让一侧 processor 宽容忽略另一侧参数。
- 不建设 `【mixed】`、`{{mixed}}` 或提示词级跨域占位符；跨域合并只在 Retrieval 路由层进行。
- 不让 Knowledge 空壳暂时复用 Recall store 来伪装文档知识库。
- 不在 Recall 迁移和引擎融合尚未稳定时同时接入 Knowledge 文件监听与 TriviumDB。
- 不为了保留旧命名牺牲新领域边界，但也不以破坏性迁名为理由降低用户数据安全要求。
