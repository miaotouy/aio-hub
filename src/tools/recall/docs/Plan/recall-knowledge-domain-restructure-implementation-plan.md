# Recall / Knowledge 领域拆分与重构实施计划

**状态**: Pre-Stage、Stage 0 至 Stage 6 已完成；Knowledge 前端工作台、索引状态与产品化向量化入口已补齐。Stage 7 的代码边界清理已完成，首次启动迁移接线、独立 appData / 真实目录副本验收与发布 smoke test 仍待执行。整个计划完成前不发布中间版本。
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

最终迁移成功后旧目录保持只读并记录迁移标记。未经过用户确认或既定清理版本，不自动删除旧目录。

---

## 3. 总体施工规则

1. 先完成 Pre-Stage 的按库备份与恢复能力及其真实往返验证；它是数据安全前置检查，不单独发布版本。验证通过后立即进入 Recall / Knowledge 重构施工。
2. 本文只维护**开发施工态**，直至 Stage 7 全部完成。每个提交只对目标架构、隔离夹具和工程检查负责，可以直接删除旧运行路径、重排 command 或暂时无法读取旧用户数据；不要求中间提交可升级、可给用户运行或可独立发布。
3. 中间态不启动指向真实 appData 的 Tauri 应用，也不让中间态代码访问真实用户目录。需要运行验证时必须使用独立临时 appData / 自动化夹具；这项隔离要求不等同于维持旧数据兼容。
4. 旧数据自动迁移、`.aio-kb` / legacy JSON / YAML 恢复、迁移报告、中断恢复、回滚说明和真实 Tauri smoke test 可以在施工期以隔离夹具实现和验证，但只在全量迁移完成后的最终发布版本接入真实用户目录。
5. Recall 领域切割、最终数据库导入、结构化 Agent 配置迁移、Chat 自动注入切换和 Knowledge 资料库建设构成同一个最终发布边界；施工顺序可以对任一领域直接硬切，不为阶段性兼容保留运行路径。
6. 检索算法融合晚于等价迁移。迁移基线必须能够证明相同输入在旧引擎与迁移后旧引擎上得到可解释的等价结果。
7. Knowledge 在 Recall 稳定前只保留模块入口，不提前复用 Recall 类型或模拟 document/chunk 功能。
8. 算法实验参数留在请求、profile、trace 或可删除缓存中，不向 `recall_entries` 增加实验字段。
9. 每个施工检查点完成后同步更新本文状态；调查结论发生变化时回写对应调查文档，但不在调查文档重新维护施工清单。

---

## 4. Pre-Stage：建立按库备份与恢复能力

**阶段状态**: 已完成。2026-07-17 用户完成真实导入/导出验证并确认未发现问题，正式解锁 Stage 0；该能力不单独发版。

### 目标

在现有 `knowledge-base` 文件存储和现有产品命名上补齐可操作的恢复通道，为后续破坏性迁名与数据库迁移保留经验证的源数据备份能力。

### 工作项

- 按 [重构前按库备份与恢复功能计划](./pre-restructure-library-backup-import-export-plan.md) 实现版本化 `.aio-kb` 单库备份包。
- 提供“导出全部”，一次选择目标目录后生成一个带根索引和库子目录的多库 ZIP 容器（不嵌套单库 ZIP）；保留单库 `.aio-kb` 导出，并支持导出选中库。
- 提供单个或多选备份包导入；默认恢复原库 ID，无冲突时保留条目 ID，冲突时默认导入为副本。
- 备份条目源字段、库级元数据和实际引用资产；向量、tag pool、HNSW 和运行时索引不进入备份包。
- 导出从持久化真源读取并执行完整性校验，不能依赖异步 warmup 是否已经把所有条目装入内存。
- 只读兼容当前 `kb_export_base` 生成的 legacy JSON / YAML；后续 `LegacyFileRecallImporter` 必须继续读取 `.aio-kb` v1。
- 在最终发布版本的迁移说明中提示用户可使用“导出全部”保留额外备份。

### 完成门槛

- 在独立临时 appData 上完成“现有多库数据 -> 导出全部 -> 多包导入 -> 字段与资产 hash 对比”的真实往返。
- 多库容器按索引将每个库作为独立导入单元；单库损坏不阻止其他库导入，并有结构化报告，单库 `.aio-kb` 仍可独立恢复。
- 重复导入不会静默覆盖；显式替换失败不会损坏原库或留下 workspace / 后端半完成状态。
- 前端检查、后端检查、单元测试、Vite build 和真实 Tauri smoke test 通过。
- 本能力及其真实往返验证完成后即可进入 Stage 0，无需形成独立发布版本。

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

验证结果：Recall 前端类型检查、19 项模块单测、Vite build、前端 lint、后端 Clippy 与真实 Tauri dev smoke test 均通过；smoke test 已确认 `AIO Hub` 主窗口成功创建。上述验证在 Stage 2 开工前完成，当时 Recall 仍从旧 `appData/knowledge/` 文件目录读取源数据；这是 Stage 1 的临时存储边界，不表示 Knowledge 领域继续拥有 Recall 运行时。当前硬切要求以 Stage 2.2 为准。

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

## 7. Stage 2：Recall 数据库真源硬切

### Stage 2.1：数据库基础层（已完成）

已锁定并引入 `rusqlite = 0.39.0`，新增 `recall.db` / `recall-vectors.db` 的独立 schema migration、SQLite repository、向量 BLOB 编解码和基础 CRUD 单测；`recall_initialize` 已幂等创建并注册 repository。`LegacyFileRecallImporter` 已能从旧 `bases`、模型索引、entry vectors 与 tag pool 生成结构化迁移报告，并保留 ID、源字段、tokens 和 content hash。数据库 repository warmup 已能重建条目、关键词索引、当前模型向量矩阵与标签池，且有旧目录不可用时仍能加载的回归测试。

本检查点只证明数据库能力可用；尚未接入正常启动和写路径，不承担用户升级责任。

### Stage 2.2：运行时硬切

**阶段状态**: 已完成代码切换。`recall_initialize` / `recall_warmup`、集合和条目 CRUD、批量写入、向量及标签池 commands 均已切至 SQLite repository；运行时不再扫描旧 `bases`、`vectors` 或 `tag_pool` 目录。前端 workspace 仅持久化 UI 配置，集合列表每次由 `recall_list_bases` 返回。已通过 TypeScript、Vite build、Rust storage 单测和 backend Clippy；Stage 2.3 将补齐进程重启、删除向量库与查询快照等闭环夹具。

### 目标

让正常 Recall 运行路径只消费 SQLite，并直接删除旧文件系统作为运行时真源的可能性。此阶段允许中间提交无法读取旧用户目录；开发验证只使用新的空数据库或由测试夹具导入的数据库。

### 工作项

- 让 `recall_initialize`、warmup 与集合列表从 repository 构造运行时读模型；删除旧 `bases/vectors/tag_pool` 扫描和文件 warmup 的正常启动分支。
- 将集合、条目、批量导入、向量和 tag pool 的全部写 command 切为“主库短事务 -> 内存同步 -> 派生向量清理 -> 监控事件”顺序；数据库写入失败时不得修改内存。
- 将 clone、导入、删除、重建等组合操作直接建模为 repository 事务或显式补偿，不保留旧目录拷贝作为隐式实现。
- Recall 集合列表改由数据库返回；前端 workspace 只保存 UI 配置、排序和最近选择，不再保存集合列表、统计或路径真源。
- 删除常规代码中 `recallStorage` 对 `workspace.json`、`bases/`、`vectors/` 和 `tag_pool/` 的读写依赖；旧文件 IO 只允许存在于 `LegacyFileRecallImporter`、备份恢复适配和迁移测试。

### 完成门槛

- 空 SQLite 数据库可完成集合、条目、向量化、关键词/向量检索、clone、删除和批量导入的完整开发闭环。
- 在隔离 appData 中导入基线夹具后，停止提供旧目录即可 warmup、浏览、编辑、搜索和重新向量化。
- `rg` 检查显示常规启动、command 与前端 store 不再调用旧目录扫描或 workspace 集合列表持久化。
- 前端 lint、类型检查、单元测试、Vite build，以及 Rust 单元测试、`cargo check` 和 backend check 通过；本检查点不运行真实用户 appData 的 Tauri dev。

### Stage 2.3：数据库真源闭环验证

**阶段状态**: 已完成。隔离夹具已覆盖 repository CRUD、批量事务失败全回滚、向量失效、tag pool、前端 workspace 不持久化集合列表，以及重建全部运行时对象后的 DB warmup。基线夹具导入 SQLite、删除旧目录并模拟进程重启后，keyword、vector、lens、blender 四类查询快照与旧引擎基线一致。删除 `recall-vectors.db` 后仍可浏览条目和执行关键词检索，并可重新写入向量。验证过程中修复了 SQLite 未持久化集合活动模型、warmup 误选备用模型的问题；主库 schema v2 现保存 `activeModelId`，旧数据库按最近索引模型降级选择。

### 目标

在不引入用户迁移逻辑的前提下，固定硬切后的数据库行为，避免 Stage 3 再回流旧文件语义。

### 工作项

- 以隔离夹具覆盖 repository CRUD、批量事务、向量失效、tag pool、前端列表降级和进程重启后的 DB warmup。
- 固定数据库真源下 keyword、vector、lens、blender 的代表查询快照；算法差异必须可解释。
- 删除 `recall-vectors.db` 后验证源条目仍可浏览、编辑和关键词搜索，并能重新向量化。

### 完成门槛

- 已不存在“读数据库、写旧目录”或“读旧目录、写数据库”的组合路径。
- 上述测试只依赖临时 appData；不需要也不得触发真实用户目录迁移。

### Stage 2.4：迁移实现与隔离验证

**阶段状态**: 代码与自动化验证已完成。旧文件目录的 `LegacyFileRecallImporter` 具备幂等导入、运行中状态续跑、主库/向量库分离状态和结构化报告；报告包含源/目标统计、模型统计、主库/向量库状态、问题列表、旧目录位置与恢复说明。legacy `contentHash` / `content_hash` 均参与向量有效性校验。`.aio-kb` v1、legacy JSON/YAML 由备份恢复适配器解析资产、冲突和副本语义后直接提交同一 SQLite repository；它们不并入只负责旧目录扫描的 `LegacyFileRecallImporter`，以避免丢失包级校验和资产恢复边界。模拟 `running` 状态与部分集合已提交后可幂等续跑。独立 appData Tauri smoke test 留待最终发布门槛统一执行。

本阶段完成最终发布所需的数据迁移实现和隔离验证，但不产生可发布版本，也不让中间态访问真实用户目录。

### 工作项

- 将旧文件目录、`.aio-kb` v1 与 legacy JSON / YAML 接入 `LegacyFileRecallImporter` 和恢复入口；自动迁移入口仅在最终发布时启用。
- 保留旧集合 ID 和条目 ID；字段映射只改语义名称，不重新生成 UUID。
- 主库与向量库分别记录迁移状态。向量损坏可以降级为待重建，但不得阻止已成功导入的源条目使用。
- 输出迁移报告、恢复说明和旧目录位置；旧目录迁移后只读且不自动删除。

### 迁移不变量

- 导入幂等；重复启动不会复制集合或条目。
- 主库成功标记只能在集合和条目事务提交、统计校验通过后写入。
- `createdAt`、`updatedAt`、priority、enabled、TagWithWeight 和 AssetRef 原值保留。
- `refs/refBy`、HNSW、矩阵和算法中间结果按派生数据重建。
- 内容 hash 不匹配的旧向量不得被判定为 ready。

### 完成门槛

- 基线夹具的集合数、条目数和内容 hash 完全一致。
- 可恢复向量的模型、维度、tokens 和覆盖统计一致；损坏向量生成明确报告。
- 模拟中断后再次启动可以幂等继续或安全回滚。
- 在独立 appData 上完成真实 Tauri 迁移 smoke test；结果作为最终发布门槛的输入，不在此阶段发版。

---

## 8. Stage 3：迁移 Agent、Chat 与工具配置

**阶段状态**: 已完成。Agent 读取时通过 `agentMigrationService` 一次性迁移 `knowledgeBaseConfig` / `knowledgeSettings`、旧 binding 和全部 `kb-*` 工具权限 key 为版本 3 的 `recallConfig` / `recallSettings` 与 `recall-*` key；迁移完成后删除旧结构化字段和权限 key，并覆盖完整迁移、半迁移与幂等状态。`RecallProcessor` 已独占默认 pipeline，严格解析 `【recall::key=value】`、按 collection ID 授权和检索、按注入位置生成 canonical 占位符；旧 `【kb】` 和历史位置参数 `【knowledge】` 只生成可定位告警，合法 `【knowledge::library=...】` 不会被误报。`{{recall}}` / `{{recall_list}}` 宏只接受命名参数，旧 Knowledge processor、`{{kb}}` / `{{kb_list}}` 宏及其注册入口已删除。Agent 思绪绑定设置、新建、编辑和导入均只写新结构。已通过 592 项前端单测、lint、TypeScript 与 Vite build。

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

**阶段状态**: 已完成。前端统一通过 `engineRequiresEmbedding` 消费后端 capability，并覆盖 vector、lens、blender、semantic、associative，store、service 与 orchestrator 不再维护各自的引擎 ID 列表。Rust / TypeScript 结果契约新增 key、keyword、content-vector、tag-vector、lens、blender、multi-signal 信号，以及包含算法版本、profile、候选分、融合分、minScore 判定和 rank 的 trace。产品 Chat 配置只传 `semantic` / `associative` profile，底层 engine ID 仅保留给 Playground 与显式调试。缓存 key 加入规范化 profile 和 `recall-profile-v1` 算法版本。正常 search engine 已删除旧文件向量按需加载分支。

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

**阶段状态**: 已完成。Rust 新增 `SemanticRecallEngine` 与 `AssociativeRecallEngine` facade，并与 keyword/vector/lens/blender 一同注册。semantic 复用内容向量为主、标签向量为辅的 Vector 引擎；associative 以候选扩展方式运行 Blender 与 Lens，再按 0.65 / 0.35 融合多信号并应用 profile 阈值和 TopK。Chat 默认 semantic；associative 默认 limit 4、minScore 0.45。数据库重启夹具已固定语义精确、语义改写、标签联想、历史牵引和弱相关噪声五类查询，trace 与 signals 均有断言。未新增持久化算法缓存。

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

**阶段状态**：后端、检索契约与前端产品化施工已完成。Knowledge 使用本计划允许的 SQLite manifest + 每库独立 `.kdb` + FTS5 过渡实现；已完成 library/document/chunk CRUD、增量覆盖、事务删除、重建、PDF/DOCX/HTML/文本解析、BM25、chunk embedding、hybrid、相邻 chunk graph 和来源回溯。前端已提供文档/分块主从浏览、批量导入失败隔离、检索信号展示、Embedding 模型选择、向量覆盖率与批次进度。Agent 使用独立 `knowledgeConfig` / `knowledgeSettings` 与稳定 library ID binding；严格 Knowledge processor、`{{knowledge}}` / `{{knowledge_list}}` 已落地，主动 `recall` / `knowledge` / `mixed` 路由已通过无 UI 的 `retrieval` Agent registry 接入实际工具调用路径，mixed 先保留分域配额再按 RRF 融合。当前没有产品化文件夹同步入口，因此未引入 watcher/ingest queue；TriviumDB 继续等待文件组恢复、锁和跨平台验证，不进入本阶段运行路径。真实 WebView 与真实模型调用仍归最终发布验收。

### 目标

在 Recall 边界稳定后，把原 Knowledge 空壳建设为真正的传统 RAG 资料库。

### 工作项

- 实现 Knowledge library repository、manifest migration 和 library CRUD。
- 接入文件导入、解析、切片、embedding、BM25、图关系和来源回溯。
- 实现 Knowledge 前端交互和产品化向量化入口，包括模型选择、向量覆盖状态、批次进度、失败后重试和检索信号说明。
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

**阶段状态**：代码与文档边界清理已完成，最终发布接线待人工验收。常规 pipeline 只注册 Recall / Knowledge processor 和宏，共享 tokenizer 只登记两个 namespace；Recall 编辑器和公共 Agent 类型已移除长期 `KB` / `KnowledgeBase` 命名，旧 `knowledgeBaseConfig`、`kbId`、旧目录 IO 只保留在版本化 migration、legacy importer、备份恢复和隔离夹具中。设置页已提供只读迁移状态、报告导出和双重确认清理入口；后端只有在主数据/向量报告均完整、无问题且目录指纹一致时才允许删除旧 `bases` / `vectors` / `tag_pool`，并保留同目录下的新 Knowledge manifest 与 libraries。迁移报告样例见 [`recall-knowledge-migration-report-sample.md`](recall-knowledge-migration-report-sample.md)。首次启动自动迁移、真实用户目录只读标记和发布二进制 smoke test 仍按最终发布门槛执行，不在施工期访问真实用户 appData。

### 工作项

- 删除旧 `kb_*` command、旧 Agent 工具 ID、旧宏和旧占位符 parser；共享信封 tokenizer 只保留 `recall` / `knowledge` 两个已登记 namespace。
- 删除 Recall 代码中的 `KnowledgeBase*`、`Kb*`、`Thought*` 长期类型名。
- 清理仅为旧文件系统运行时保留的 IO 和目录扫描路径，保留独立 legacy importer / restore 工具。
- 为用户提供旧目录状态、迁移报告、导出和确认清理入口。
- 更新架构文档、Agent 配置说明、工具说明和群公告中的破坏性变更说明。

### 最终发布门槛

仅在 Stage 0 至 Stage 7 的目标结构、迁移实现和验证全部完成后，才构建首个包含本重构的发布版本。此时一次性接入真实用户目录的迁移裁决、迁移报告、恢复说明和旧目录只读标记；此前任何中间态均不承担升级或发布兼容。

- 以真实用户目录副本和独立 appData 分别完成完整迁移、重启恢复、回滚路径与 Tauri smoke test；不得用中间态直接试运行真实用户目录。
- 最终发布二进制首次启动时执行幂等迁移，并保留旧目录、迁移报告和可操作的恢复路径。
- 仅在全量迁移验收通过后发布，不拆分备份版、数据库版、Recall 版或 Agent/Chat 迁移版。

### 完成门槛

- 常规运行路径不再读取旧 `bases/vectors/tag_pool`。
- `rg` 检查旧领域词仅存在于 legacy importer、migration、历史说明和兼容测试中。
- 用户确认清理前仍可通过导出或旧目录恢复源条目。

---

## 13. 验证矩阵

每个施工阶段至少执行：

- 前端 lint、类型检查、单元测试和 Vite build。
- Rust 单元测试、`cargo check` 和项目既有 backend check。
- Pre-Stage 执行 `.aio-kb` 单库、批量、资产、冲突、损坏包、ZIP 路径安全和独立 appData 往返测试。
- Repository CRUD、批量事务、损坏输入、幂等导入和中断恢复测试。
- Agent 配置导入/导出、binding、工具权限、自动注入和旧占位符告警测试。
- Recall / Knowledge 占位符分别覆盖 canonical serialize、乱序 parse、URL 编解码、重复目标、未知/跨域参数、非法值、未授权 ID、多占位符同消息和跳过历史消息；增加两个域同时出现但不串参数、不串结果的集成测试。
- 宏测试覆盖 `{{recall}}` / `{{recall_list}}`、`{{knowledge}}` / `{{knowledge_list}}` 及其命名参数展开；明确断言不存在 `【mixed】` 和位置参数输出。
- keyword、semantic、associative 的固定查询集回归。
- 桌面 Tauri 真实运行态 smoke test；中间阶段仅针对独立临时 appData，真实用户目录验证只在最终发布门槛执行。
- 移动端依赖变更通过项目真实 Tauri build 验证；普通 Cargo 探针不能替代。

最终发布前必须输出一份迁移报告样例，至少包含：

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
