# Recall 检索管线模块化设计与实施计划

**状态**: Phase 0、Phase 1 已完成；Phase 2 已落地纯算法生产模块；Phase 3 已落地内容/标签/Lens 候选；Phase 4 comprehensive 固定预设已可通过 bundle IPC 执行
**创建日期**: 2026-07-20
**最近修订**: 2026-07-22
**适用范围**: `src/tools/recall/`、`src-tauri/src/recall/`、Recall Playground、Agent Recall 配置、Recall Chat 召回入口

关联文档：

- [Recall 架构说明](../../ARCHITECTURE.md)
- [检索模式与思绪召回设计调查（已归档）](./Archived/retrieval-profile-knowledge-memory-design.md)
- [Recall / Knowledge 领域拆分与重构实施计划](./recall-knowledge-domain-restructure-implementation-plan.md)
- [Recall 自动化测试、精简 OAI 渠道与真实向量请求实施计划](./recall-automated-real-vector-testing-plan.md)
- [Phase 0 盘点与契约决策](./recall-retrieval-pipeline-phase0-inventory.md)
- [LLM Chat 上下文管道架构](../../../llm-chat/docs/architecture/context-pipeline.md)

> 本文记录现有 `RetrievalEngine` 体系的后续重构设想，不改变已完成的 Recall / Knowledge 领域拆分，也不把尚未实施的目标写成当前架构。实施完成前，现行行为仍以 `ARCHITECTURE.md` 和当前代码为准。

> **2026-07-21 现状对照**：`recall-automated-real-vector-testing-plan.md` 已完成 Phase 1 至 Phase 5 及 Tauri E2E 入口收口，但这不等于本计划的检索管线 Phase 1 至 Phase 6 已完成。当前生产路径仍由 Rust `RetrievalEngine`、`engineId`、`semantic` / `associative` facade 和前端 `SearchOrchestrator` 组成；Phase 0 只有已冻结的模块/artifact 数据类型与 wire fixture，尚未存在可执行模块 registry、pipeline compiler 或统一 Runner。
>
> **2026-07-22 施工优先级修订**：测试计划中的 deterministic、Ollama、external corpus 和恢复 lane 均是可复用的验收资产，但不再作为本计划 Phase 1 Runner 的前置阻塞。默认开发只运行与当前切片相关的 Vitest/Rust 测试和最小 mock smoke；真实 Ollama 保留为显式集成验证，完整 corpus 与二次启动恢复放在功能里程碑或发布收口。新测试必须围绕新 Runner 的契约补齐，不以继续扩展 legacy E2E 矩阵为施工目标。
>
> **2026-07-22 Phase 1 内核进度**：`src-tauri/src/recall/retrieval_pipeline.rs` 已提供显式 module registry、配置编译、依赖拓扑排序、artifact 运行时检查、串行 Runner、版本化 trace 和结构化失败响应；Rust 定向测试已用测试模块跑通完整空结果管线，并覆盖缺失 artifact、依赖环路、重复 finalizer 和非法参数。该内核尚未注册为生产 preset，也未接管 legacy `recall_search`。
>
> **2026-07-22 Phase 1/2 施工进度**：生产 registry 已注册查询规范化/分词、关键词候选、信号归一化、加权融合、priority rerank、policy/score filter 和 finalizer；`algorithmic` 可通过独立 compile/run IPC 执行，配置哈希不一致会在模块运行前拒绝。真实 Tauri `recall-pipeline` preset 已验证 `list -> compile -> run -> pipeline trace`、稳定运行元数据和零 Embedding 请求。现有产品仍走 legacy `recall_search`，因此旧 Keyword engine 的重复过滤、排序和 TopK 尚未删除。
>
> **2026-07-22 Phase 3 施工进度**：`content-vector-recall` 与 `tag-vector-recall` 已注册为独立生产模块，二者复用同一请求的 query embedding 和带 model/space identity 的不可变 bundle；缺失 Embedding 产物会返回 `external-requirement-missing`，模型不匹配的内容向量矩阵不会进入候选。Lens 的历史投射、折射和标签图传播仍在 legacy engine 中，尚未接入 `comprehensive`。
>
> **2026-07-22 Phase 4 施工进度**：Lens 原始能量已抽为 entry ID/raw score helper 并注册 `lens-association-recall`；`comprehensive` 固定管线复用 keyword/content-vector/tag-vector/Lens 四路候选，经统一归一化、显式加权融合、priority、公共过滤和 finalizer 输出。编译后只声明一个共享 query embedding requirement；真实 Tauri `recall-pipeline` lane 已用预生成 bundle 验证四路 trace、bundle identity 和零重复 Embedding 请求。当前权重仅作为版本化工程默认值，不宣称质量优于 legacy profile。
>
> 已可直接复用的测试前置资产包括：
>
> - `recall-migration-baseline-v1.json`、Rust `migration_baseline` 和对应 Vitest/Rust 测试已固定迁移输入、损坏向量边界、Agent/Chat 调用，以及 `keyword`、`vector`、`lens`、`blender`、`semantic`、`associative` 的代表性查询快照。它们只用于迁移夹具、算法盘点和故障诊断，不是召回质量样本，也不用于判断新旧实现孰优。
> - `tests/tauri-e2e/support/presets.ts` 已将确定性 Recall、Chat 注入/恢复、外部语料、Ollama、私有 Profile 和 native lane 收口为具名 E2E preset；根 `package.json` 只保留通用、纯逻辑和 native 三个入口。这里的 E2E preset 与本计划的检索 preset 是两个独立命名空间，不能互相替代。
> - Recall 向量化、语义检索、Chat evidence、SSE 完成态、同数据根二次进程恢复、external-sample/full 和真实 Ollama 已有真实 Tauri WebView 验收，且稳定 `data-testid`、请求摘要、状态回读和恢复探针已落地。
>
> Phase 0 已冻结 artifact/module/pipeline、preset/compile/run/trace/UI 状态机契约，完成旧算法与调用入口盘点，并建立旧 `engineId` / `profile` 到新预设的版本化迁移夹具。实际 compiler、外部产物准备、统一 Runner、pipeline trace 生成和真实窗口 `recall-pipeline` spec 从 Phase 1 开始施工。现有 E2E 只能证明旧检索路径的端到端可用性，不能证明召回结果符合某个用户的需要，也不能为新 Runner 的候选、分数、过滤或排序提供质量结论。

### 当前施工规则

1. 先实现一条最小垂直链路：preset 解析、compiler、Runner、一个可执行模块和最终结果输出。
2. 每完成一个模块，补充该模块的纯逻辑或契约测试；不提前施工后续 phase 的完整 E2E。
3. 新增测试必须能对应一个明确的不变量，例如 algorithmic 路径零 Embedding、查询向量单次生成与复用、阶段 artifact 传递、过滤/TopK 边界或 trace 完整性。
4. 发现 legacy 行为缺口时只维护已有 baseline；除非该缺口阻塞当前迁移切片，否则不扩展为新的验收 lane。

---

## 1. 背景与问题

Recall 当前注册以下底层引擎：

```text
keyword
vector
lens
blender
semantic
associative
```

产品运行时主要使用 `semantic` / `associative` facade，Playground 和调试入口继续暴露底层引擎。这个结构完成了产品命名收口，但仍存在以下问题：

1. `RetrievalEngine::search` 要求每个引擎直接返回最终 `RecallResult`，候选生成、信号计算、归一化、过滤、排序、截断和 trace 容易被重复实现。
2. `vector` 同时承担内容向量、标签向量、字面加成和最终排序，不是单一职责模块。
3. `blender` 内部重新执行字面、内容向量和标签引力计算，没有复用 `keyword` / `vector` 的稳定信号实现。
4. `associative` 在 facade 层再次运行并融合 Blender 与 Lens，形成“引擎包含引擎”的层级，配置和中间结果难以独立验证。
5. `requiresEmbedding` 绑定在引擎 ID 上。新增组合时必须新增引擎或维护 capability 映射，不能自然表达“当前配置是否真的需要发起查询向量请求”。
6. 各引擎分数语义不同，却可能在引擎内部提前执行 `minScore` 和 TopK，导致后续融合无法看到被提前裁掉的候选。

目标不是再增加一个“综合引擎”，而是取消以引擎为主要实现单元，把检索拆成可组合、可单测、可追踪的模块。原来的引擎名称只保留为 migration / legacy parser 的输入，不进入新 Runner 的可执行预设列表。

---

## 2. 目标与非目标

### 2.1 目标

1. Recall 产品 API 使用检索预设或管线 ID，不再要求调用方理解底层引擎。
2. 关键词、内容向量、标签向量、Lens 扩散、融合、过滤和排序均成为独立模块。
3. 同一个模块可以在完整管线中运行，也可以在 Playground、单测或诊断工具中单独运行。
4. 通过解析后的模块依赖决定是否生成查询向量；纯算法配置不得发起 Embedding 请求。
5. 综合配置复用纯算法候选和信号，不再重复实现字面检索。
6. 中间产物、原始分数、归一化分数、融合依据、过滤原因和最终排名均可进入结构化 trace。
7. 保持 Recall SQLite、内存索引、向量矩阵和 tag pool 的现有领域边界，不因管线化复制数据真源。
8. 建立新管线的确定性工程夹具、契约断言和性能基线；旧引擎输出只用于算法盘点、迁移排错和人工诊断，不作为质量门槛。

### 2.2 非目标

- 不把 Recall 模块做成可从远程加载任意代码的插件系统。
- 不允许普通产品配置构造任意无约束图。
- 不在本计划中合并 Recall 与 Knowledge 检索管线；两者继续保持独立数据域和结果语义。
- 不改变 Embedding 模型身份、向量空间隔离或条目向量持久化契约。
- 不要求第一阶段立即删除全部旧 `engineId`，但禁止继续基于旧接口扩展新算法。
- 不承诺不同信号的原始 score 可以直接比较，也不把融合分数展示为事实准确率。
- 不保证旧引擎与新管线的候选、分数、过滤结果或排序等价。迁移只保证受支持的配置和数据能够被识别、转换或给出可恢复问题。
- 不在本计划中设计或宣称已经具备 Recall 召回质量评测。固定语料、固定查询、结果重叠、rank 变化和旧版快照都不能自动推出“更好”或“更差”。
- 不套用 Knowledge 检索的相关性标注作为 Recall 的质量真值。Recall 允许由个人经历、时间上下文和联想产生有价值的跳跃，直接相关性只是可能的信号之一。

### 2.3 召回质量评测边界

当前仓库没有 Recall 质量评测协议，也没有能够作为真值的个性化标注数据。自动化测试可以验证同一输入是否确定、模块是否遵守契约、过滤与融合是否按配置执行、是否发生意外 Embedding 请求、缓存是否隔离以及性能是否退化；这些都属于工程正确性，不等于召回质量。

旧版与新版在同一查询上的候选、顺序和分数可以作为调试信息展示，但不得据此计算质量提升、回归率或版本优胜关系。结果重叠率、命中率、NDCG、MRR 等指标只有在评测对象、用户意图、时序上下文和人工标注协议明确后才有意义，现阶段不得由 AI 根据少量样例自行补全标签、权重或通过阈值。

若后续要建立 Recall 评测，应另立研究与产品方案，至少先回答：评测服务于哪类用户任务；如何记录查询发生时的个人上下文；如何区分无关噪声与“意外但有用”的跳跃；即时相关、延迟启发和叙事连续性分别如何采集反馈；哪些数据允许进入离线评测。该方案需要真实用户参与和明确的数据授权，不属于本次管线模块化的退出条件。缺少评测既不等于必须保持旧输出逐项等价，也不授权重构自动替换产品默认策略；模块化工程验收与默认策略变更必须分开决策。

---

## 3. 核心决策

### 3.1 引擎降级为预设

长期结构分为三层：

```text
产品层
  选择内置预设或已保存的自定义预设

编排层
  校验配置、解析依赖、准备外部产物、执行检索 DAG

模块层
  生成候选、计算信号、归一化、融合、重排、过滤、输出 trace
```

产品默认只需要两个内置预设，暂定 ID：

| 预设            | 是否请求查询向量 | 用途                                     |
| --------------- | ---------------- | ---------------------------------------- |
| `algorithmic`   | 否               | 低成本、确定性、离线可用的纯算法召回     |
| `comprehensive` | 是               | 融合字面、内容向量、标签与联想信号的召回 |

中文显示名、最终 ID 和默认参数在产品交互施工前确认。代码不得根据中文名称判断能力。

`semantic`、`associative` 和其他旧引擎 ID 只作为版本化迁移输入保留，不继续包装为需要维持旧算法语义的内置预设。迁移器把已知旧 ID 转成新预设并记录字段取舍与已知算法语义差异；未知 ID 返回可恢复问题。旧字段解析的存在不代表新管线需要复现旧候选、分数或排序。

### 3.2 固定阶段，不开放任意图

Chat 上下文管线适合按 priority 顺序修改同一个上下文。检索同时存在多路候选生成和汇合，不能只用线性 priority 表达。

Recall 使用阶段受约束的有向无环图：

```text
prepare
  -> retrieve（同阶段模块可并行）
  -> normalize
  -> fuse
  -> rerank / diversify
  -> filter
  -> finalize
```

约束：

- 阶段顺序固定，模块只能声明所在阶段和显式依赖。
- `retrieve` 允许多个候选模块并行执行。
- `fuse` 之前不得应用产品级 `minScore` 或最终 TopK。
- 候选模块可以设置独立的安全上限和粗过滤，但必须在 trace 中区分候选裁剪与最终过滤。
- 一个配置只能有一个最终分数生产路径和一个 finalizer。
- 配置编译失败时拒绝执行，不进行猜测式降级。

### 3.3 Embedding 是外部产物依赖

现有 Embedding Provider Adapter 和查询向量缓存位于前端 TypeScript 侧，后端 Rust 检索运行时不应为了管线化复制一套 Provider 调用能力。

管线编译器根据启用模块的 `requires` 汇总外部产物需求：

```text
没有模块依赖 queryEmbedding
  -> 不解析 Embedding route
  -> 不读取查询向量缓存
  -> 不发送 Embedding 请求

存在模块依赖 queryEmbedding
  -> 前端编排器使用现有 Adapter / 缓存生成一次
  -> 作为带 model / space 身份的输入产物交给后端
  -> 多个后端模块共享同一查询向量
```

`requiresEmbedding` 不再是长期的引擎布尔值。对外可继续返回编译后的 `externalRequirements`，供 UI 在执行前提示缺失配置。

---

## 4. 目标运行模型

### 4.1 管线阶段

| 阶段        | 职责                                             | 示例模块                                  |
| ----------- | ------------------------------------------------ | ----------------------------------------- |
| `prepare`   | 查询规范化、分词、标签匹配、输入产物校验         | `query-normalize`、`query-tags`           |
| `retrieve`  | 独立生成候选和原始信号                           | `keyword-recall`、`content-vector-recall` |
| `normalize` | 在各自信号域中执行确定的分数标定                 | `log-normalize`、`min-max-normalize`      |
| `fuse`      | 合并候选与多路信号，生成统一管线分数             | `weighted-fusion`、`rrf-fusion`           |
| `rerank`    | 去重、多样性、priority 加成或可选二次排序        | `priority-boost`、`diversity-rerank`      |
| `filter`    | enabled、集合、标签、最终阈值和授权范围过滤      | `entry-policy-filter`、`score-threshold`  |
| `finalize`  | TopK、加载最终条目、生成高亮、结果和结构化 trace | `result-finalizer`                        |

集合、授权、enabled 等能够安全缩小扫描范围的硬过滤可以在候选生成前下推；最终 trace 必须记录实际下推的过滤条件。会改变融合语义的 score 阈值不得静默下推。

候选预算必须和最终返回数量分开：

- `candidateBudget`：每路召回或融合前允许保留的候选上限，可为 Rerank、去重、时间路和联想保留余量。
- `limit`：finalizer 最终返回的条目数。
- `expansionBudget`：Expand、Associate 等会增加候选或正文成本的模块预算。

任何模块不得把 `limit` 当作自己的最终截断依据。只有 finalizer 负责产品级 TopK；候选模块的安全裁剪必须记录 `candidateTrimmed` 及原因。

### 4.2 统一中间产物

模块通过类型化 artifact store 交换数据，不直接相互调用：

```rust
pub enum ArtifactKey {
    NormalizedQuery,
    QueryTokens,
    MatchedTags,
    QueryEmbedding,
    CandidateSignals,
    NormalizedSignals,
    FusedCandidates,
    RankedCandidates,
    FinalResults,
}

pub struct CandidateSignal {
    pub recall_id: Uuid,
    pub entry_id: Uuid,
    pub signal_type: RecallSignalType,
    pub raw_score: f32,
    pub normalized_score: Option<f32>,
    pub source_module_id: String,
    pub details: serde_json::Value,
}
```

`CandidateSignal` 只引用条目 ID，候选阶段不得为每个分支复制完整 `RecallEntry`。finalizer 在候选范围稳定后统一加载条目和高亮信息。

查询级共享产物需要使用不可变的请求快照，不能让不同模块分别从全局可变状态读取：

```rust
pub struct RetrievalArtifactBundle {
    pub bundle_id: String,
    pub embedding_space: Option<String>,
    pub model_signature: Option<String>,
    pub asset_generation: Option<String>,
    pub algorithm_version: String,
    pub query_embedding: Option<Vec<f32>>,
    pub query_energy_field: Option<serde_json::Value>,
}
```

Tag 扩散、残差图、查询能量场等可能被多个模块消费的产物必须由同一请求持有同一 bundle。后台热更新创建新 bundle 后原子发布；正在执行的请求继续使用旧 bundle，禁止出现“旧残差 + 新传播核”的混合代际。

### 4.3 模块契约

概念接口如下，实际 Rust 类型在 Phase 0 冻结：

```rust
pub struct RetrievalModuleInfo {
    pub id: String,
    pub phase: RetrievalPhase,
    pub requires: Vec<ArtifactKey>,
    pub provides: Vec<ArtifactKey>,
    pub external_requirements: Vec<ExternalRequirement>,
    pub parameter_schema: serde_json::Value,
}

pub trait RetrievalModule: Send + Sync {
    fn info(&self) -> RetrievalModuleInfo;

    fn execute(
        &self,
        context: &RetrievalContext,
        artifacts: &mut RetrievalArtifacts,
        params: &serde_json::Value,
        trace: &mut RetrievalTrace,
    ) -> Result<(), RetrievalModuleError>;
}
```

模块必须满足：

- 同一输入、索引快照和配置下结果确定。
- 参数必须先通过 schema 校验，模块内部不读取 UI 配置或 workspace store。
- 不持久化源数据，不自行调用前端 API。
- 明确错误是否允许预设声明降级；默认失败策略是终止管线。
- 写入自己的 trace step，不能覆盖其他模块产物。
- 单模块运行时所需 artifact 可由 Playground 夹具或上游模块显式提供。

### 4.4 管线配置

```ts
interface RecallRetrievalPipelineV1 {
  schemaVersion: 1;
  id: string;
  displayName: string;
  algorithmVersion: string;
  candidateBudget: number;
  expansionBudget: number;
  nodes: Array<{
    id: string;
    moduleId: string;
    enabled: boolean;
    dependsOn?: string[];
    params: Record<string, unknown>;
    failurePolicy?: "abort" | "skip";
  }>;
}
```

Phase 0 的精确 TypeScript wire contract 位于 `types/pipeline.ts`，Rust 对应类型位于
`src-tauri/src/recall/retrieval_pipeline.rs`，共享序列化夹具为
`__fixtures__/recall-pipeline-contract-v1.json`。后续实现不得只修改单侧类型。

配置保存边界：

- 内置预设由代码版本化维护，workspace 只保存预设 ID 和允许覆盖的安全参数。
- 自定义 Playground 配置保存完整 schema、模块 ID、参数和算法版本。
- 不把解析后的执行计划持久化为真源；每次加载配置时重新校验和编译。
- 缓存 key 至少包含规范化查询、数据范围、Embedding 空间、预设或配置哈希、模块版本集合和 `algorithmVersion`。

---

## 5. 默认预设草案

### 5.1 纯算法召回 `algorithmic`

```text
query-normalize
  -> query-tokenize
  -> keyword-recall
  -> keyword-normalize
  -> key-priority-boost
  -> entry-policy-filter
  -> score-threshold
  -> result-finalizer
```

性质：

- 不依赖 `queryEmbedding`、条目向量或 tag pool 向量。
- Embedding route 缺失、离线或限流时仍可完整运行。
- 面向精确 key、关键词、标题、内容字面匹配和确定性 fallback。
- 可被综合预设直接复用为一条候选分支。

### 5.2 综合召回 `comprehensive`

```text
query-normalize
  -> query-tokenize
  -> query-tags
  -> [外部准备 queryEmbedding]
  -> 并行候选:
       keyword-recall
       content-vector-recall
       tag-vector-recall
       lens-association-recall
  -> per-signal-normalize
  -> weighted-fusion 或 rrf-fusion
  -> priority-boost
  -> diversity-rerank
  -> entry-policy-filter
  -> score-threshold
  -> result-finalizer
```

性质：

- 关键词分支与 `algorithmic` 使用同一个 `keyword-recall` 模块。
- 所有向量模块共享一个查询向量和同一个已确认的 Embedding 空间身份。
- 标签扩散、历史投射和残差挖掘可以作为独立可选模块逐步接入，不再需要新建引擎。
- 默认配置必须为每个信号保留原始分、归一化分、融合权重和候选去留原因。

### 5.3 旧 ID 迁移映射

旧 ID 不注册为新 Runner 的可执行预设，只由独立 migration / legacy parser 识别。建议映射如下，最终映射在 Phase 0 冻结：

| 旧 ID                            | 建议迁移目标    | 迁移说明                                                  |
| -------------------------------- | --------------- | --------------------------------------------------------- |
| `keyword`                        | `algorithmic`   | 保留纯文本、离线可用这一产品意图，不保证原分数和排序      |
| `vector`、`semantic`             | `comprehensive` | 转为新的多信号预设，不复刻旧 Vector 权重、阈值和裁剪顺序  |
| `lens`、`blender`、`associative` | `comprehensive` | 转为新的综合召回，不保留旧单分支或 `0.65 / 0.35` 融合语义 |
| 未知或已移除的第三方 ID          | 不自动映射      | 返回结构化迁移问题，由用户选择目标预设                    |

迁移只复制新预设仍有相同语义的通用字段，例如数据范围和最终 `limit`。旧 `minScore`、引擎权重、候选上限及其他动态参数不得直接套入新分数域；迁移报告需要列出目标预设、保留字段、丢弃字段和已知算法语义差异，但不得把个别查询的新旧结果差异写成质量结论。迁移完成后持久化新 schema，正常运行路径不再解析旧 ID。旧检索缓存和已持久化结果直接失效，不尝试转换到新算法版本。

---

## 6. 配置编译与执行

### 6.1 编译步骤

1. 根据 preset ID 解析内置配置或读取自定义配置。
2. 校验 `schemaVersion`、模块存在性、参数 schema 和阶段合法性。
3. 根据 `requires` / `provides` 建立依赖图并拒绝环路、缺失产物和重复 finalizer。
4. 汇总外部需求，例如查询向量、模型 ID、Embedding 空间或历史向量。
5. 生成稳定的配置哈希和模块版本集合。
6. 返回可执行计划及前端必须补齐的外部产物清单。

### 6.2 执行步骤

1. 前端 Recall service 请求编译预设；此时尚未执行任何外部 Embedding 请求。
2. 编译器返回完整的 `externalRequirements` 和 `candidateBudget`，前端使用现有 Provider Adapter、查询向量缓存和模型配置一次性补齐外部产物。
3. 后端准备数据库、索引、tag pool 和只读检索上下文，并固定本次请求的 `RetrievalArtifactBundle`。
4. 唯一的 Recall Runner 按阶段执行；Chat 被动召回、主动工具、服务 API 和 Playground 都必须调用同一 Runner。
5. 同一 retrieve 阶段中无依赖关系的模块允许并行，但候选归并必须使用稳定顺序和显式 tie-break。
6. Runner 收集模块耗时、候选数、错误、候选裁剪原因、降级原因和产物摘要。
7. finalizer 统一应用最终 `limit`，生成 `RecallResult` 和版本化 trace。

第一阶段可以串行执行 retrieve 模块以降低并发改造风险，但契约不得假设模块有固定先后顺序。新管线的确定性、缓存隔离和并发基准稳定后再引入后端并行。

### 6.3 降级规则

- `algorithmic` 不存在 Embedding 降级问题。
- `comprehensive` 缺少 Embedding route 时默认拒绝执行并返回结构化缺失能力，不静默伪装为综合召回。
- 产品可显式提供 `fallbackPresetId: "algorithmic"`；发生降级时结果和 trace 必须记录请求预设、实际预设和原因。
- 单个实验模块只有在配置明确设置 `failurePolicy: "skip"` 且它不是下游必需产物的唯一生产者时才允许跳过。
- 所有降级都必须写入 `requestedPresetId`、`actualPresetId`、`fallbackReason` 和受影响模块；不能只返回空结果或只写日志。

---

## 7. Trace、分数与缓存

### 7.1 Trace

现有单层 `RecallTrace` 扩展为管线级 trace：

```ts
interface RecallPipelineTraceV1 {
  traceVersion: "recall-pipeline-trace-v1";
  runId: string;
  pipelineId: string;
  requestedPresetId?: string;
  actualPresetId?: string;
  algorithmVersion: string;
  configHash: string;
  bundleId?: string;
  candidateBudget: number;
  expansionBudget: number;
  finalLimit: number;
  externalRequirements: string[];
  steps: Array<{
    nodeId: string;
    moduleId: string;
    phase: string;
    durationMs: number;
    inputCount?: number;
    outputCount?: number;
    status: "completed" | "skipped" | "failed";
    reason?: string;
    candidateTrimmed?: number;
    trimReason?: string;
  }>;
}
```

结果级 trace 继续记录每个条目的信号、融合分、阈值判断和 rank，并通过 `pipelineId + configHash` 关联运行 trace。

### 7.2 分数规则

- 候选模块只产生原始信号，不声明跨模块统一分数。
- 归一化模块必须声明输入信号类型、算法和参数。
- Weighted fusion 只消费已归一化信号；RRF 只消费每路稳定 rank。
- 产品级 `minScore` 只作用于融合后的最终分数。
- 单路候选粗阈值使用独立参数名，例如 `candidateFloor`，不得复用最终 `minScore`。
- UI 展示“相关度”或“激活度”时必须来自预设定义，不能把所有 pipeline score 解释成同一种概率。

### 7.3 缓存

缓存隔离至少包含：

```text
normalized query
recall IDs / tags / enabled policy
external artifact identity
embedding space identity（如适用）
pipeline ID
config hash
module versions
algorithm version
artifact bundle / asset generation
```

单模块缓存只在基准证明有收益且失效边界明确时引入。源条目、条目向量和 tag pool 仍由现有 repository 与索引生命周期管理。

---

## 8. UI 交互调查与改造

本节基于 2026-07-21 的现有前端实现补充。目标不是重新设计 Recall 的整体视觉，而是把管线编译、外部能力准备、执行、降级和 trace 的新语义完整映射到已有 Vue / Element Plus 交互中。测试计划施工期间已补齐 Recall、Agent Recall 和 Chat 的稳定 E2E selectors，但界面状态和数据契约仍是旧引擎体系。

### 8.1 现状调查

| 交互面            | 当前实现                                                                                                                                                                                                   | 管线化后的缺口                                                                                                                                                    |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Agent Recall 设置 | `agent-manager/.../RecallSection.vue` 只提供全局 `semantic / associative` 选择；`RecallBindingItem.vue` 的绑定类型虽有 `profile`，界面没有逐集合覆盖入口                                                   | 需要改为稳定预设选择，并清楚表达“继承全局”与“本集合覆盖”；不能向普通用户暴露模块 DAG                                                                              |
| Chat 占位符       | `recall-placeholder.ts` 的 `profile` 只接受 `semantic / associative`，Agent 编辑器自动生成对应文本                                                                                                         | 需要新增预设参数契约和 legacy 解析；用户手写提示词不能被无提示重写或默认为另一预设                                                                                |
| Playground        | `PlaygroundView.vue` 最多并排 4 个 `SearchSlot.vue`，每槽直接选择底层引擎并读取 `requiresEmbedding`；已增加语义化 `data-testid` 供真实窗口测试，但全量检索仍没有统一运行状态，槽位失败只写 `console.error` | 需要预设副本、阶段列表、编译问题、外部需求、运行 trace 和并列诊断结果；现有 selector 可复用，但 4 列布局无法容纳阶段与 trace 信息，诊断差异也不能被解释为质量排名 |
| 向量准备          | `SearchSlot.vue`、`PlaygroundView.vue` 和 `SearchOrchestrator` 分别做覆盖率检查；`VectorCoverageDialog.vue` 提供补全、忽略和取消                                                                           | 需要由编译结果驱动准备步骤；区分“缺少 Embedding route”“条目向量覆盖不完整”“索引未加载”；后台 Chat 不得弹交互对话框                                                |
| Recall 全局设置   | `getRecallSettingsConfig()` 把所有引擎参数合并进“检索与索引策略”，并写入全局 `vectorIndex`                                                                                                                 | 全局设置只应保留 Embedding、索引资产、请求和缓存基础设施；运行时预设/模块参数必须归属于 Agent 安全覆盖或 Playground 配置                                          |
| 执行状态          | `useRecallSearchManager.ts` 和 `useRecallSearch.ts` 主要暴露 `loading + results`；失败、取消和空结果都可能落成空数组                                                                                       | 无法可靠展示阻塞、显式降级、部分成功、失败和真正空结果，也无法防止旧请求晚返回覆盖新查询                                                                          |
| 结果详情          | `RecallResultDetailDialog.vue` 只展示条目和百分比“匹配分值”，不展示现有 `signals / trace`                                                                                                                  | 管线分数不是概率；需要展示分数语义、信号贡献、请求预设、实际预设、过滤和排名路径                                                                                  |
| 监控              | `RagTraceContent.vue` 使用通用步骤时间线，并把 score 绘制成相似度百分比进度条                                                                                                                              | 需要消费版本化 pipeline trace，展示阶段、模块、候选数、跳过/失败原因和降级；旧 trace 仍需可读                                                                     |
| 工作区持久化      | `WorkspaceConfig.playground` 保存槽位 `engineId`、参数、查询和完整结果；`defaultEngineId` 仍在类型与默认配置中，但设置页没有对应选择器                                                                     | 完整结果和 trace 会迅速膨胀且重启后过期；旧引擎字段需要版本化迁移，不能继续作为隐藏真源                                                                           |
| 重复/闲置入口     | 2026-07-21 静态扫描确认 Recall 的 `SearchPanel.vue`、`EngineSelector.vue` 无产品引用，`useRecallSearch.ts` 仅被前者使用；store、service 和 Playground 各有搜索路径                                         | Phase 0 仍需把动态入口与删除影响形成清单；不能为闲置组件再实现一套管线适配                                                                                        |

调查结论：UI 改造的最小边界不只是替换 Playground 下拉框。Agent 配置、占位符生成、运行响应、结果详情、监控、工作区 schema 和错误反馈必须一起迁移，否则用户会同时遇到 profile、engine 和 preset 三套概念。

### 8.2 前端所需契约

UI 不应从模块 ID 推断能力。除 4.4 的完整管线配置外，后端或 Recall service 需要提供以下面向交互的只读摘要，实际命名在 Phase 0 冻结：

```ts
interface RecallPresetSummary {
  id: string;
  displayName: string;
  description: string;
  visibility: "product" | "playground";
  stability: "stable" | "experimental";
  allowedOverrides: Array<{
    key: string;
    schema: Record<string, unknown>;
  }>;
}

interface RecallPipelineCompileResult {
  runId: string;
  valid: boolean;
  pipelineId: string;
  configHash: string;
  algorithmVersion: string;
  candidateBudget: number;
  expansionBudget: number;
  externalRequirements: Array<{
    kind: string;
    status: "ready" | "missing" | "partial";
    blocking: boolean;
    details?: Record<string, unknown>;
  }>;
  issues: Array<{
    severity: "error" | "warning";
    nodeId?: string;
    fieldPath?: string;
    code: string;
    message: string;
  }>;
  stages: Array<{
    phase: string;
    nodeIds: string[];
  }>;
  moduleVersions: Record<string, string>;
}

interface RecallPipelineRunResponse {
  runId: string;
  outcome: "success" | "empty" | "fallback" | "failed" | "cancelled";
  requestedPresetId: string;
  actualPresetId: string;
  configHash: string;
  results: RecallResult[];
  trace?: RecallPipelineTraceV1;
  error?: { code: string; message: string; nodeId?: string };
}
```

交互契约要求：

- 列表预览可以只请求 `RecallPresetSummary`；只有选中预设或编辑配置时才编译。
- `allowedOverrides` 是常规产品可编辑参数的唯一来源；Playground 的完整模块参数来自 module schema。
- `externalRequirements` 同时包含是否阻塞和当前就绪状态。UI 不自行维护 `requiresEmbedding` 或引擎 ID 白名单。
- 每次运行携带 `runId + configHash`。查询、集合或配置已变化时，晚返回结果不得覆盖当前界面，只能作为过期运行留在诊断记录中。
- 错误必须带稳定 `code` 和可选 `nodeId / fieldPath`，使 UI 能把问题定位到参数或模块，而不是只弹一个通用 toast。
- 如果第一阶段无法真正中止 Tauri 任务，界面不得提供含义虚假的“取消执行”。最低实现是停止等待并丢弃该 `runId` 的晚返回；只有后端支持按 `runId` 协作取消后才显示真正的取消按钮。

### 8.3 常规产品与 Agent 配置

常规产品入口维持低复杂度：

- 默认只展示 `visibility = product` 且 `stability = stable` 的预设，不展示阶段、模块 ID、融合算法名或 arbitrary JSON。
- `AgentRecallSettings.defaultProfile` 迁移为 `defaultPresetId`；`RecallBinding.profile` 迁移为可选 `presetId`。绑定项默认显示“继承：<预设显示名>”，用户显式覆盖后才保存集合级值。
- `RecallSection.vue` 的预设选择项显示名称、简短用途和能力摘要，例如“需要 Embedding”或“离线可用”。能力摘要来自最近一次编译结果，不根据 ID 拼文案。
- 选择预设后仅展示 `allowedOverrides`。`limit`、`minScore` 等覆盖项必须标出作用域；当预设不支持统一 `minScore` 时隐藏或替换为该预设声明的安全参数，不能沿用旧 profile 默认值。
- 配置页只做能力预检，不自动发送 Embedding 请求。缺少模型 route 时在字段附近显示可定位错误和“前往模型设置”操作，保存策略由配置 schema 决定。
- Chat 运行属于非交互后台路径，不弹出覆盖率、模型选择或补全向量对话框。它按预设的失败/降级策略执行，并把实际预设和原因写入 Chat pipeline log 与 Recall monitor。
- 建议自动生成的新占位符使用 `preset=<id>`，最终参数名在 Phase 0 冻结；解析器在迁移期继续接受 `profile=semantic|associative`，通过版本化映射转换为新预设并记录配置字段与算法语义差异。对用户手写的 preset message 只做可定位诊断，不进行普通字符串批量替换。
- Recall 全局设置页移除动态注入的引擎运行参数，只保留 Embedding 模型、索引资产、请求设置、向量化和缓存。预设安全覆盖放在 Agent Recall 设置，完整模块参数只放在 Playground，避免同一参数出现三处真源。
- Agent 导入、导出、复制和预设 round-trip 必须覆盖 `defaultPresetId`、绑定级 `presetId` 和 fallback 策略，不能只改编辑器表单。

### 8.4 Playground 信息架构

Playground 首期继续使用阶段分组列表，不建设自由拖拽画布。建议把现有“最多 4 个窄槽位”改为“配置 A / 配置 B 最多两个可见工作面”，其他配置通过保存、复制和切换复用。这里的 A/B 只表示在相同运行上下文中并列检查两份配置，服务于算法排错、trace 检查和性能观察，不提供自动质量评分或推荐结论。两列也为模块参数、结果和 trace 保留可读宽度。

Playground 分为四个稳定区域：

1. **运行上下文**：查询、思绪集范围、标签/授权过滤、最终 `limit`，以及单查询或可复现的工程夹具模式。上下文变更后，现有结果标记为“已过期”，不冒充当前配置结果。
2. **配置工作面**：选择内置/已保存预设，复制为草稿，按固定阶段查看模块，编辑 schema 参数，保存副本、恢复预设和删除自定义配置。
3. **结果与诊断**：显示每个配置的运行状态、最终结果、共同候选、仅 A/仅 B、rank 变化和耗时。它们是可观察差异，不是相关性标签或优劣指标；分数域不兼容时不计算 score 差值。
4. **诊断面板**：显示编译问题、external requirements、阶段候选数、模块耗时、跳过/失败原因和原始 trace；默认折叠到当前关注的阶段。

具体交互：

- 选择预设或修改参数时只触发防抖编译，不自动执行检索。显式点击“运行”或在查询框回车才执行，避免编辑综合管线时反复调用 Embedding。
- 编译期间保留上一次有效结果并显示“配置待验证”；编译失败时禁用运行按钮，问题列表点击后聚焦对应阶段、模块和字段。
- 模块开关只在依赖仍可满足时可操作。关闭上游造成下游缺失时，编辑草稿可保留，但必须显示阻塞问题，不能静默连带删除用户参数。
- 从内置预设开始编辑时先生成草稿副本；内置定义本身只读。未保存变更、恢复预设和切换配置时使用明确的离开确认。
- 单模块运行使用独立的 fixture 区，列出缺少的输入 artifact，并允许从最近一次完整运行引用不可变快照；不能隐式读取当前全局可变 store。
- “全量检索”改为统一的 batch run。界面展示总进度和每个配置/查询的独立状态；一个分支失败不清空另一个分支的成功结果。
- 工程夹具批量重放必须固定数据快照、外部产物身份和配置哈希。报告展示查询级成功/失败、结果集合差异、rank 变化、阶段耗时和降级，明确标注“仅供诊断，不代表召回质量”；不计算汇总命中率或自动给出配置推荐。
- Playground 草稿可导入/导出版本化 JSON，但导入先编译并展示问题，不直接覆盖当前草稿。

### 8.5 外部能力准备与覆盖率

编译与运行之间增加显式 `preparing` 阶段：

- `queryEmbedding` 缺失 route 是阻塞能力问题；“综合预设 + 未配置模型”不得显示为无结果。
- 条目向量覆盖不完整是数据准备问题。Playground 可以提供“补全后运行”“按当前覆盖运行”“取消”，但只有预设明确允许 partial coverage 时才显示第二项，且 trace 记录缺失数和用户选择。
- 索引加载、tag pool 重建等无用户决策的步骤显示内联进度，不反复打开模态框。
- 同一次 batch run 先按 artifact identity 聚合准备任务，同模型、同空间、同数据范围只检查和准备一次，再共享给 A/B 配置。
- 向量补全是独立长任务，进度和失败详情继续复用现有向量化基础设施。关闭进度对话框不等于取消任务；按钮文案和状态必须与实际后端能力一致。
- 常规 Chat、Agent 工具和其他后台调用不进入上述交互分支，只能选择预配置的 `abort / fallback / allow-partial` 策略；默认不允许静默 partial。

### 8.6 结果、分数与 trace 展示

结果列表保持适合扫描的紧凑布局，但需要补齐以下语义：

- 主列表显示 rank、条目 key、思绪集、匹配摘要和预设定义的 `scoreLabel`。默认显示原始数值，不再统一乘以 100 加百分号。
- `RecallResultDetailDialog.vue` 增加“条目 / 信号 / 执行路径”三个视图。信号视图展示模块、原始分、归一化分、融合权重/贡献；执行路径展示 requested/actual preset、config hash、候选来源、rank 变化和阈值判断。
- 候选被过滤的原因属于运行诊断，不伪装成最终结果。Playground 可从阶段候选表查看；常规产品只显示最终结果及必要的降级提示。
- A/B 诊断可以展示集合关系和 rank：共同候选、仅 A、仅 B、rank delta。只有 score semantics 和归一化算法一致时才允许展示分数差；任何差异都不得自动解释为相关性增减或质量提升。
- 发生 fallback 时在结果区顶部持续显示 requested preset、actual preset 和原因，不能只用一次性消息提示。
- 空结果单独显示有效运行摘要，包括实际预设、过滤条件和“运行成功但无命中”；失败状态保留上一轮结果并明确标记其已过期。

### 8.7 Monitor 改造

`RagTraceContent.vue` 和 `types/monitor.ts` 需要从通用 `name / duration / details` 步骤升级为 versioned pipeline payload：

- 摘要行展示 requested/actual preset、总耗时、最终命中数、是否缓存命中和降级状态。
- 时间线按固定 phase 分组，模块行展示 `completed / skipped / failed`、输入/输出候选数、耗时和原因。
- 分数不再用“相似度百分比进度条”表达。结果摘要显示 score label 和数值，详细信号进入展开区。
- 原始 JSON drawer 保留，便于无法预见的模块字段诊断；可复制的 trace 必须包含 trace version 和 config hash。
- Phase 5 至 Phase 6 期间保留 legacy trace adapter，使历史日志和旧引擎事件仍能打开；未知 trace version 显示“仅原始数据可用”，不能导致整个监控列表渲染失败。

### 8.8 组件与状态收口

| 当前文件                                                            | 计划动作                                                                           |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `agent-manager/.../RecallSection.vue`                               | profile 选择迁移为稳定 preset；渲染 capability 与 allowed overrides                |
| `agent-manager/.../RecallBindingItem.vue`                           | 增加继承/覆盖预设交互，并显示当前生效预设                                          |
| `views/PlaygroundView.vue`                                          | 改为统一运行上下文、A/B 工作面和 batch run 状态所有者                              |
| `components/SearchSlot.vue`                                         | 拆为配置工作面、结果列表和诊断面板；不再自行判断 Embedding 或持有覆盖率编排        |
| `config.ts`、`views/SettingsView.vue`                               | 移除动态引擎运行参数合并；保留检索依赖的基础设施设置                               |
| `composables/useRecallSearchManager.ts`                             | 替换为唯一的 pipeline compile/run composable，管理 run token、状态机和过期响应     |
| `components/RecallResultDetailDialog.vue`                           | 展示信号与 pipeline trace，移除统一百分比分数语义                                  |
| `components/monitor/RagTraceContent.vue`                            | 消费 versioned pipeline trace 并兼容 legacy payload                                |
| `types/search.ts`、`types/monitor.ts`、`types/recall-collection.ts` | 新增 preset/compile/run/trace/UI 持久化类型，逐步移除产品侧 engine capability 类型 |
| `SearchPanel.vue`、`EngineSelector.vue`、`useRecallSearch.ts`       | Phase 0 确认无动态引用后删除，不为闲置入口重复适配                                 |
| `recallCollectionStore.search`、`services/api.ts`、Agent action     | 收口到同一 service/Runner；UI store 不再维护独立 engine 分支                       |

状态机至少包含：

```text
idle
  -> compiling
  -> blocked | ready
  -> preparing
  -> running
  -> success | empty | fallback | failed | cancelled
```

错误与反馈规则：

- 编译和参数错误就地显示；外部能力缺失显示在运行区；瞬时成功通知才使用 `customMessage`。
- 加载中保留布局和上一轮结果，避免结果区域跳动；新结果提交时再原子替换。
- 搜索、配置切换、折叠区和详情入口需要可见 focus 状态、键盘操作和可访问名称；图标按钮继续使用现有 Lucide 图标与 tooltip。
- A/B 工作面在常见桌面宽度下最多两列；窄窗口降为单列或显式切换 A/B，不产生 4 个 `min-width: 320px` 列的横向裁切。
- 主题、边框、文字和 loading 背景继续使用项目变量，不为管线编辑器引入第二套视觉系统。

### 8.9 持久化与迁移

- 为 Recall workspace 增加配置 schema version。旧 Playground `engineId` 通过 5.3 的版本化规则映射到新 preset；只迁移语义仍然一致且由目标 preset 明确接收的字段。
- Playground 只持久化选中集合、可选的查询草稿、A/B 配置引用和自定义 pipeline 草稿，不持久化 `RecallResult[]`、运行 trace、loading、error 或 external requirement 状态。
- `WorkspaceConfig.defaultEngineId` 和运行时 `searchSettings.engineId` 在调用方清零后删除；未知旧 ID 产生可恢复的迁移问题，不静默改成产品默认预设。
- Agent `defaultProfile / binding.profile` 使用版本化 migration 转成新 preset ID；导入旧 Agent 时同样执行并产生结构化报告。报告必须明确新算法不承诺复现旧候选和排序，但不对变化作质量判断。
- 文本占位符在兼容期读取旧 `profile`；若 Phase 0 确定使用 `preset`，新 UI 只生成该参数。移除 legacy parser 前必须有扫描报告证明没有现存 Agent 仍依赖旧参数。
- 内置 preset 更新后，已保存的“引用预设”使用新版本并在运行前重新编译；用户“复制为自定义”的配置固定自己的 schema 和 algorithm version，不被静默改写。

### 8.10 UI 验收场景

至少覆盖以下真实交互：

1. 未配置模型时运行 `algorithmic`，不出现模型提示、不发送 Embedding 请求并正常得到成功或空结果。
2. 未配置 Embedding route 时运行 `comprehensive`，运行前显示阻塞问题；配置了 fallback 时明确显示实际运行 `algorithmic`。
3. Playground 检测到部分条目缺向量，补全、允许 partial 和取消三条路径的按钮、运行结果及 trace 一致。
4. 非法模块参数或缺失 artifact 时运行按钮禁用，点击问题可定位到对应字段。
5. A 成功、B 失败时保留 A 结果；共同命中统计不把失败或尚未运行的 B 当作空结果参与计算。
6. 运行期间修改查询、集合或配置，旧 `runId` 返回后不覆盖新状态。
7. 成功无命中、编译阻塞、运行失败、显式 fallback 和用户取消展示为五种不同状态。
8. 结果详情和 Monitor 对 pipeline score 使用正确 label，不统一渲染为概率百分比。
9. 重启后恢复 Playground 配置但不恢复过期结果；旧 `engineId` workspace 和旧 Agent profile 能迁移到新预设，并能查看保留字段、丢弃字段和算法语义差异。
10. 真实 Tauri WebView 下验证 compile -> prepare -> run -> trace 往返、模型设置跳转、向量补全和 legacy trace 展开；普通浏览器 mock 不能替代这些 IPC 场景。

视口至少检查 `1024x768`、`1440x900` 和高 DPI Windows 缩放下的单/双工作面，不允许按钮文字截断、模块问题遮挡参数或结果详情超出对话框。

---

## 9. 实施阶段

测试计划中的 Phase 1 至 Phase 5 已完成，提供了本节可复用的 fixture、真实窗口 runner 和验收 lane；本节 Phase 编号只描述检索管线施工进度。当前检索管线 Phase 0 已完成，Phase 1 的执行内核已开始施工但尚未完成公共尾部和产品接线，不能按测试计划状态顺延为 Phase 5。

### Phase 0：盘点旧实现并冻结新契约

- [x] 保存 `keyword`、`vector`、`lens`、`blender`、`semantic`、`associative` 的代表查询输出。现有证据由共享 migration baseline fixture、Rust 引擎/Facade 快照和 Agent/Chat baseline 测试共同组成，只用于理解旧逻辑、维护迁移夹具和排查实现错误。
- [x] 把旧实现整理成算法与配置迁移清单，明确旧算法版本、输入字段、裁剪/归一化/过滤/排序步骤和去留决策。详见 Phase 0 盘点文档；代表查询输出只作调试材料。
- [x] 盘点各引擎重复的候选裁剪、归一化、过滤、排序和 TopK 逻辑。
- [x] 冻结 artifact、module info、pipeline schema、错误和 trace v1 契约，并由 Rust/TypeScript 共享 wire fixture 约束序列化。
- [x] 冻结 preset summary、compile result、run response 和 UI 状态机契约，明确 error code、`runId + configHash` 与过期响应规则。
- [x] 明确内置预设为 `algorithmic`（算法召回）与 `comprehensive`（综合召回），均为 `product/stable`；legacy ID 不进入可执行预设列表。
- [x] 完成 `SearchPanel`、`EngineSelector`、`useRecallSearch` 的静态引用复核；三者目前不在产品渲染路径中。
- [x] 继续复核 store search、service、Playground、Chat processor 和 Agent tool 的动态调用，形成完整保留/删除清单。
- [x] 冻结旧 ID 到新预设的版本化迁移规则；新增 workspace Playground、Agent settings/binding、占位符、Agent 工具参数、缓存 key 和未知 ID 夹具，覆盖字段保留/丢弃报告与旧结果持久化清理。
- [x] 建立可复用的真实窗口测试底座：稳定 selectors、确定性 mock Chat/Embedding、请求证据、同数据根进程恢复、外部语料和真实 Ollama lane 已具备。
- [x] 冻结独立 E2E ID `recall-pipeline`、spec 路径和运行元数据契约；不注册伪造 Runner 结果的空 spec。真实 `compile -> prepare -> run -> pipeline trace` 装配随 Phase 1 Runner 实现。

退出门槛：仅新增契约、算法与配置迁移清单和共享 wire/migration 工程测试，不改变现有产品检索路径。Phase 0 冻结 `executionPath=retrieval-pipeline` 等真实窗口元数据；因为 Runner 属于 Phase 1，本阶段不以合成响应冒充新 Runner E2E。不要求也不宣称完成召回质量评测。

### Phase 1：建立 Runner 与公共尾部阶段

- [x] 新增模块 registry、配置编译器、artifact store 和串行阶段 Runner 内核；当前只由测试模块驱动，尚未接入生产检索路径。
- [x] 抽取集合/enabled/标签硬过滤、最终 score threshold、排序、TopK、条目加载和 trace finalizer。
- [x] 第一阶段保持 retrieve 串行，为后续并行保留契约。
- [x] 用确定性测试模块跑通完整管线，并拒绝非法依赖、环路、缺失 artifact、重复 finalizer 和非法参数。
- [x] 支持生产模块单独运行和真实确定性 fixture。
- [x] 注册 `recall-pipeline` E2E preset 与真实 spec，覆盖 compile -> prepare -> run -> pipeline trace，并断言运行元数据区别于 legacy engine 路径。

退出门槛：用测试模块跑通完整管线；非法依赖、环路、缺失 artifact、重复 finalizer 和非法参数均被拒绝。

### Phase 2：拆分纯算法路径

- [x] 从 Keyword 引擎抽取查询分词、倒排候选、key/title/content 字面信号和归一化模块。
- [x] 建立 `algorithmic` 预设，并让旧 `keyword` 配置通过 migration 映射到该预设。
- [ ] 删除 Keyword 内部的最终过滤、排序和截断重复实现。
- [x] 证明未解析模型、未访问向量缓存且未发送 Embedding 请求。

退出门槛：`algorithmic` 满足模块契约、确定性、过滤/排序规则和性能基线；离线和未配置模型环境可完整运行。工程夹具验证的是实现是否按已声明算法执行，不把结果排序当作用户相关性真值。

### Phase 3：拆分向量与联想信号

- [x] 从 Vector 引擎抽取内容向量候选和标签向量候选。
- [x] 从 Lens 抽取标签空间扩散与历史投射模块。
- [ ] 将 Blender 的 literal / semantic / gravity / resonance 拆成复用模块和融合配置，不再重复检索逻辑。
- [ ] 完成内容向量、标签向量、Lens 和 Blender 可复用能力的取舍；旧逻辑只有在记录明确的产品决策、影响范围和恢复方案后才能淘汰，不为旧 ID 建立等价预设，也不把工程夹具差异当作淘汰依据。
- [x] 查询向量只生成一次并被所有依赖模块共享。

退出门槛：拆分后的模块满足各自的新契约、确定性和性能基线；查询向量只生成一次。旧 ID 与新模块的算法步骤差异、删除项和替代项有书面说明，并使用新的算法版本和缓存空间；说明不包含无依据的质量判断。

### Phase 4：建立综合预设

- [x] 建立 `comprehensive` 预设并复用 `keyword-recall`。
- [ ] 实现并记录 weighted fusion 与 RRF 的分数语义、配置约束、性能和 trace 差异；没有独立 Recall 评测方案前，不根据固定查询集自动选出“更优”方案。
- [ ] 为候选上限、各路归一化、最终阈值、priority 和多样性参数定义合法范围、默认值来源和版本边界。默认值属于显式产品决策，不得包装成自动标定结果。
- [ ] 用工程夹具覆盖精确字面信号、向量分支、标签/历史分支、空候选、无向量数据和确定性 tie-break；不为“弱相关”或“有价值跳跃”自动编写真值标签。
- [ ] 建立显式 `fallbackPresetId` 降级路径。

退出门槛：综合预设通过编译、执行、分数语义、trace、缓存隔离、确定性和性能测试。产品默认融合方案及参数必须记录决策人、依据和适用边界；在独立 Recall 评测方案建立前，不声称其质量优于现行 profile，也不以自动生成的查询/标签作为替换默认值的依据。

### Phase 5：产品接入与迁移收口

- [ ] Recall service、Chat processor、Agent tool metadata、设置页和 Agent 配置改用 preset ID。
- [ ] Agent 编辑器实现全局预设、绑定级继承/覆盖、allowed overrides 和 capability 预检；Chat 后台执行不得弹交互对话框。
- [ ] 冻结新占位符预设参数名（建议 `preset`），旧 `profile` 由 legacy parser 映射；旧 Agent 配置和 `engineId` 通过版本化迁移转换，并输出包含字段取舍与算法语义差异的结构化报告。
- [ ] UI 只消费编译后的 external requirements 和参数 schema，完成 `idle -> compile -> prepare -> run -> outcome` 状态机与 stale run 防护。
- [ ] Playground 切换为双配置诊断工作面、阶段模块编辑、工程夹具批量重放、统一 batch run 和 trace 调试界面；界面不输出质量评分或配置优胜结论。
- [ ] 结果详情与 Monitor 展示 score semantics、信号贡献、requested/actual preset、降级和版本化 trace，并兼容旧 trace。
- [ ] Playground workspace 不再持久化结果和运行态；确认无动态引用后删除重复/闲置搜索组件和 engine capability 分支。
- [ ] 缓存 key 切换到 pipeline/config/module version 契约。
- [ ] 更新 `ARCHITECTURE.md`、工具指南和相关 Chat 文档。

退出门槛：常规产品调用不再发送底层 engine ID；旧用户配置可迁移、问题可定位、迁移前配置有备份可恢复，但不保证恢复旧运行时检索行为；成功、空结果、阻塞、降级、失败和取消在真实 Tauri UI 中可区分。若本阶段同时替换产品默认策略，必须有独立于工程测试的明确产品决策与回滚路径，不能以新旧结果对照报告代替该决策。

### Phase 6：删除旧引擎运行时

- [ ] 确认没有产品、Agent、Chat、测试或迁移外代码直接调用旧 `RetrievalEngine`。
- [ ] 删除旧引擎 registry 和已被模块替代的重复实现。
- [ ] 只在独立 legacy migration 层保留旧 ID 解析。
- [ ] 评估 retrieve 阶段并行化并增加确定性排序保障。

退出门槛：后端只有模块 registry 和 pipeline runner；移除旧引擎实现及其行为夹具不会影响现行产品运行。legacy migration 夹具继续保留，用于保证旧配置能够得到确定的转换结果或结构化问题。

---

## 10. 验证要求

### 10.1 单元测试

- 配置 schema、依赖图、阶段顺序、环路和 artifact 完整性。
- 每个模块的确定性输入输出、参数边界和错误语义。
- 原始信号、归一化、融合、过滤、TopK 和 trace 分层正确。
- 纯算法预设零 Embedding 调用。
- 多模块共享一次查询向量。
- 显式降级与禁止静默降级。

### 10.2 新管线工程回归测试

- 新预设和模块的契约、确定性、分数计算语义、trace 完整性与性能基线。
- 六个旧引擎/Facade 的代表输出只用于算法盘点、迁移排错和人工诊断，不生成质量回归率，也不作为测试通过条件。
- 可以复用 migration baseline、smoke/curated corpus 和 external corpus 作为可复现输入，但断言只覆盖明确的算法规则和工程不变量，例如已知字面信号、候选 ID 去重、过滤条件、稳定 tie-break、阶段产物和 trace。不得由主题标签自动推导 expected relevance/rank，也不得把旧 `semantic` 精确分数当作质量真值。
- 数据库重启、向量库缺失、tag pool 缺失和缓存失效。
- 多集合、集合级阈值、禁用条目、标签过滤和授权范围。
- 相同最终分数下的稳定 tie-break，避免并行执行改变结果顺序。
- pipeline/config/module/embedding space 任一身份变化后不得误命中旧缓存。

### 10.3 UI 与迁移测试

- preset 列表按 visibility/stability 过滤，常规产品不暴露模块和 legacy 引擎；旧 ID 不进入可执行 preset 列表。
- Agent 全局预设与绑定级继承/覆盖 round-trip；旧 `profile` 和旧 `engineId` 迁移后配置可加载，字段取舍和算法语义差异可追踪，但不要求保持旧检索行为，也不对结果变化作质量判断。
- compile issue 可定位字段，blocking requirement 禁用运行，allowed override 以 schema 为唯一来源。
- `runId / configHash` 过期响应隔离，A/B 单边失败，batch partial failure 和重复点击运行。
- success、empty、fallback、failed、cancelled 和 compile blocked 的独立渲染；上一轮结果保留但明确标记过期。
- 无模型纯算法路径不出现模型 UI；综合路径缺 route、缺条目向量、partial coverage 和显式 fallback 的交互分支。
- 分数 label、信号详情和 pipeline trace 不被统一解释为百分比；legacy monitor payload 可展开。
- workspace 迁移保留配置但丢弃旧结果/运行态；未知 legacy ID 返回可恢复问题而不是静默默认。

### 10.4 工程验证

- Recall 前端 lint、类型检查、单元测试和 Vite build。
- Rust 单元测试、Clippy / backend check。
- Tauri IPC 参数保持 camelCase，错误和 trace 可从真实 WebView 往返。
- 真实 Tauri 环境使用隔离数据根验证无模型纯算法检索、综合检索、显式降级、向量补全、Playground 单模块执行和旧 workspace/Agent 迁移。
- 真实窗口用例使用稳定 `data-testid` 或可访问名称，并保存失败截图、前后端日志和 mock 请求摘要；普通浏览器 mock 只覆盖纯前端状态，不替代 Tauri IPC。

现有 Tauri E2E 底座通过通用入口和具名测试 preset 运行：

```powershell
bun run test:tauri:e2e -- --preset recall-vector
bun run test:tauri:e2e -- --preset recall-curated
bun run test:tauri:e2e -- --preset recall-chat
bun run test:tauri:e2e -- --preset corpus-sample
bun run test:tauri:e2e -- --preset corpus-full
bun run test:tauri:e2e -- --preset ollama-vector
bun run test:tauri:e2e -- --preset ollama-chat
```

这些入口当前覆盖旧 `semantic` / vector 工作流、Chat 注入和持久化。管线施工后应在 `tests/tauri-e2e/support/presets.ts` 中增加或调整具名装配，使运行元数据明确记录 retrieval pipeline ID、config hash、algorithm version、requested/actual preset 和 trace version；不要重新把 spec 路径和长参数组合写回根 `package.json`。

---

## 11. 风险与控制

### 11.1 过度配置化

风险：用户可以构造无法解释或无法运行的图。

控制：固定阶段、编译期依赖检查、常规产品只开放内置预设和安全参数；完整配置仅在 Playground 使用。

### 11.2 新分数语义不清

风险：新管线虽然允许改变旧引擎的归一化和裁剪顺序，但如果没有稳定定义，用户无法理解阈值、比较结果或判断版本升级影响。

控制：为每个新预设定义 score label、归一化、阈值作用域和可比较边界；任何语义变化都提升算法版本并隔离缓存。旧分数只出现在迁移报告和历史 trace 中，不直接迁入新阈值配置。

### 11.3 IPC 往返和重复 Embedding

风险：分布式编排导致模块间多次请求前端或重复生成查询向量。

控制：一次编译汇总全部 external requirements，前端一次补齐，后端一次执行，不允许 Rust 模块反向调用前端。

### 11.4 并行执行不确定性

风险：HashMap 合并顺序或同分候选导致结果抖动。

控制：第一阶段串行；并行化后以显式 entry ID tie-break 和稳定归并保证相同输入得到相同顺序。

### 11.5 模块粒度失控

风险：模块过大重新退化为引擎，模块过小则配置和 trace 噪声过高。

控制：模块边界以“可独立产生一种候选/信号或完成一个排名阶段”为准；简单数值步骤只有在需要独立替换、测试或观测时才拆分。

### 11.6 UI 状态与实际执行脱节

风险：关闭进度框被误认为取消、晚返回结果覆盖新查询、空数组掩盖失败，或 UI 显示的预设与实际 fallback 不一致。

控制：以 `runId + configHash` 关联编译、准备、运行和 trace；返回结构化 outcome；未实现后端取消前不提供虚假取消语义；结果区持续展示 requested/actual preset。

### 11.7 配置和 trace 持久化膨胀

风险：Playground 把完整结果、条目正文和多级 trace 写入 workspace，导致频繁保存、配置膨胀和重启后展示过期数据。

控制：workspace 只保存配置真源和轻量 UI 偏好；结果、trace、运行错误和 capability 状态属于会话态或有边界的诊断存储，不写入 workspace 配置。

### 11.8 把工程差异误写成召回质量

风险：固定查询、新旧结果重叠、rank delta 或模块消融看起来可量化，容易被继续包装成质量分数或版本优胜结论。对高度个性化且允许联想跳跃的 Recall，这些数字没有用户意图、时间上下文和反馈协议就没有统一方向；结果更相似或更直接都不必然更好。

控制：测试报告和 Playground 将上述数据明确标为工程诊断；不计算 Recall 质量总分，不设置自动优胜阈值，不让 AI 自动补写相关性标签。召回质量评测必须通过独立方案建立，并由真实用户参与定义与验证。

---

## 12. Phase 0 决策与后续产品事项

Phase 0 已确认：

- 使用 `algorithmic / comprehensive`，显示名为“算法召回 / 综合召回”。
- `priority` 只在 rerank 阶段应用一次。
- 纯算法首期不把标签文本匹配作为额外评分信号；标签仍可作 policy 过滤。
- 自定义管线首期只属于 Playground；首期最多两个可见诊断工作面。
- 新占位符字段为 `preset`，结构化 API 字段为 `presetId`。
- `comprehensive` 默认阻塞，只有显式配置才回退 `algorithmic`；默认不静默 partial coverage。
- legacy parser 保留到 Phase 6，并以迁移扫描结果作为删除门槛。

仍需在对应实施阶段作产品决策：

1. Phase 4 的综合预设默认使用 weighted fusion、RRF，还是分层融合；该选择必须记录决策依据、适用边界和算法版本，不能由现有 baseline 自动决定。
2. 是否在首期之后允许把自定义管线发布为工作区级高级预设；首期仍只在 Playground 保存。
3. 是否另立 Recall 质量评测研究计划；如需建立，先确定目标用户、反馈采集、隐私边界和“意外但有用”跳跃的判定方式，而不是直接复用 Knowledge 检索相关性指标。

上述后续事项不阻塞 Phase 1 的 compiler/Runner 基础设施。Phase 0 不替换现有默认检索行为。

---

## 13. VCPToolBox 调研补充

2026-07-20 对 `E:/rc20/vcp/VCPToolBox` 的 RAG 实现进行了对照调查。该项目的热记忆管线包含纯文本快速路径、BM25 稀疏候选、向量召回、TagMemo 查询增强、历史分段 Shotgun、时间路、TimeDecay、Rerank/RRF、Associate 和 Expand；其冷知识库另有 BM25 + 向量 + 图扩散通道。相关实现入口为 `KnowledgeBaseManager.js`、`modules/knowledgeBase/searchService.js`、`Plugin/RAGDiaryPlugin/RAGDiaryPlugin.js` 和 `Plugin/LightMemo/LightMemo.js`。

### 13.1 采纳的工程经验

1. **纯算法快速路径**：在编译管线之前判断是否需要 Embedding；无向量预设不得先生成查询向量再决定跳过。
2. **请求级共享产物**：同一请求的查询增强向量、energy field、TagMemo bundle 和历史分段由 Artifact Store 统一持有，避免多占位符、多集合或多模块重复计算。
3. **虚拟联合索引**：多集合保持物理索引独立，但请求内先合并候选，再执行全局去重、重排和 TopK；不允许每个集合先截断造成配额偏差。
4. **固定资产代际**：模型签名、Embedding 空间、图、残差、传播核和算法版本形成不可变 bundle，后台更新以原子发布替换活动 bundle。
5. **候选超集诊断**：模块对照使用同一候选超集，分别观察原始 KNN、增强向量、重排和融合造成的结果变化；它只隔离算法步骤的影响，不证明模块收益或召回质量。
6. **不同任务分层**：TagMemo 面向叙事连续性和结构候选，Rerank 面向直接相关性；二者是不同阶段，不互相替代，也不能只用直接相关性评价整条 Recall 管线。

### 13.2 明确不采用的做法

- 不采用 `::TagMemo+::Rerank+::Truncate` 这类字符串修饰符作为长期配置格式；产品配置必须先解析为有 schema 的管线。
- 不让 BM25、Rerank、TagMemo 等功能在主动工具和被动 Chat processor 中各自复制一套编排；二者必须共享同一个 Runner。
- 不允许未知模块或不支持的组合被静默忽略；配置编译必须返回结构化错误。
- 不把 `score`、`hybridScore`、`rerankScore`、`rrfScore` 和 `geoScore` 当成同一分数域；每个模块必须声明原始分、归一化分和融合输入。
- 不把昂贵的全文 Expand 放在最终候选稳定之前；优先在 finalizer 前确认候选，再执行正文回源和上下文预算控制。

### 13.3 对当前实施顺序的影响

VCP 调研不改变 Phase 0 至 Phase 6 的总体顺序，但把以下项目提升为 Phase 0/1 的硬契约：

- `candidateBudget`、`limit` 和 `expansionBudget` 分离；
- `RetrievalArtifactBundle` 的身份、生命周期和原子发布；
- 被动、主动和 Playground 共用 Runner；
- 无 Embedding 请求的可证明快速路径；
- 固定候选超集的模块消融诊断，不从差异自动推导质量结论；
- 多集合先合并后全局重排和 TopK。
