# Recall 检索管线模块化设计与实施计划

**状态**: Phase 0、Phase 1 已完成；Phase 2 至 Phase 4 已形成可执行的 `algorithmic` / `comprehensive` 生产管线；Phase 5 已接入 service、Chat 与 Agent，Playground、Monitor、fallback 和旧运行时清理待完成
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

本文是实施计划，当前架构仍以 `ARCHITECTURE.md` 和代码为准。历史施工记录不在正文逐日保留；下表是 2026-07-22 的唯一状态基线。

| 范围              | 当前状态                                                                                                     | 剩余工作                                                                           |
| ----------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| Runner 与公共尾部 | registry、compiler、artifact store、串行 Runner、trace、结构化失败和公共过滤/finalizer 已投入生产            | 旧引擎删除前保持兼容，不再扩展 legacy 算法                                         |
| `algorithmic`     | 已通过独立 compile/run IPC、service 和真实 Tauri lane 执行；零 Embedding 路径已有测试                        | 随 Phase 6 删除 Keyword engine 的重复尾部                                          |
| `comprehensive`   | 已复用 keyword/content-vector/tag-vector/Lens 四路候选和单个 query embedding bundle，采用 weighted fusion v1 | 补齐分数语义、参数边界、fallback 和工程夹具；Lens 尚有 legacy 能力待取舍           |
| 产品接入          | Recall service、Chat、Agent tool metadata、Agent 全局预设和绑定级继承/覆盖已使用 `presetId`                  | Agent capability/allowed overrides、Playground、Monitor、结果详情和 workspace 收口 |
| Embedding 模型    | 常规产品路径读取 Recall 全局活动模型，不提供逐查询覆盖                                                       | 补全局模型切换后的资产代际接线与验证；Playground 的非活动模型诊断另列后续能力      |
| 旧运行时          | `recall_search`、旧 engine registry 和 Playground 旧路径仍保留                                               | Phase 6 在调用扫描和迁移验证后删除                                                 |

可复用验收资产包括 migration baseline、确定性 Tauri `recall-pipeline` preset、Chat/恢复、external corpus 和 Ollama lane。日常施工运行与当前切片相关的 Vitest、Rust 测试和最小 mock smoke；Ollama、完整 corpus 与二次启动恢复放在里程碑或发布收口。

### 当前施工规则

1. 后续模块继续复用现有 preset、compiler、Runner 和公共尾部，不新建旁路编排。
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

这些 legacy 引擎仍在后端注册；Recall service、Chat 和 Agent 已转向新管线，Playground、`recall_search` 和迁移基线仍使用旧入口。旧结构存在以下问题：

1. `RetrievalEngine::search` 要求每个引擎直接返回最终 `RecallResult`，候选生成、信号计算、归一化、过滤、排序、截断和 trace 容易被重复实现。
2. `vector` 同时承担内容向量、标签向量、字面加成和最终排序，不是单一职责模块。
3. `blender` 内部重新执行字面、内容向量和标签引力计算，没有复用 `keyword` / `vector` 的稳定信号实现。
4. `associative` 在 facade 层再次运行并融合 Blender 与 Lens，形成“引擎包含引擎”的层级，配置和中间结果难以独立验证。
5. `requiresEmbedding` 绑定在引擎 ID 上。新增组合时必须新增引擎或维护 capability 映射，不能自然表达“当前配置是否真的需要发起查询向量请求”。
6. 各引擎分数语义不同，却可能在引擎内部提前执行 `minScore` 和 TopK，导致后续融合无法看到被提前裁掉的候选。

目标是取消以引擎为主要实现单元，把检索拆成可组合、可单测、可追踪的模块。Phase 6 完成后，旧引擎名称只保留为 migration / legacy parser 输入，不进入新 Runner 的可执行预设列表。

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
9. 将 Recall 的活动 Embedding 模型保持为 Recall 域全局设置；常规 Chat、Agent 和服务查询不能按请求切换模型或隐式创建新的向量空间。

### 2.2 非目标

- 不把 Recall 模块做成可从远程加载任意代码的插件系统。
- 不允许普通产品配置构造任意无约束图。
- 不在本计划中合并 Recall 与 Knowledge 检索管线；两者继续保持独立数据域和结果语义。
- 不套用 Knowledge 的“库绑定模型、查询时再选择与库相同模型”交互范式。Recall 常规查询不暴露模型选择，模型切换属于 Recall 全局资产迁移或 Playground 诊断，不是查询参数。
- 不要求第一阶段立即删除全部旧 `engineId`，但禁止继续基于旧接口扩展新算法。
- 不在本计划中建立 Recall 质量评测或选择产品默认策略的研究协议。

### 2.3 召回质量评测边界

当前没有可作为 Recall 质量真值的标注协议。自动化测试只验证工程不变量：确定性、模块契约、过滤和融合规则、Embedding 请求、缓存隔离及性能退化。旧新结果的候选、排序和分数可用于迁移诊断，不作为质量门槛或默认策略依据。

后续如需质量评测，应另立研究与产品方案，明确用户任务、时序上下文、反馈采集和数据授权。本计划只要求每个算法版本的行为可解释、可追踪、可回滚。

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

产品层提供两个已冻结的内置预设：

| 预设            | 是否请求查询向量 | 用途                                     |
| --------------- | ---------------- | ---------------------------------------- |
| `algorithmic`   | 否               | 低成本、确定性、离线可用的纯算法召回     |
| `comprehensive` | 是               | 融合字面、内容向量、标签与联想信号的召回 |

显示名分别为“算法召回”和“综合召回”。能力由编译结果和参数 schema 描述，代码不根据显示名或预设 ID 推断 Embedding 需求。

两个预设当前均标记为 `product/stable`。这里的 `stable` 表示 schema、执行路径和迁移 ID 受兼容性约束，不表示召回质量结论，也不指定应用应默认选择哪一个预设。

`semantic`、`associative` 和其他旧引擎 ID 只作为版本化迁移输入保留，不继续包装为需要维持旧算法语义的内置预设。迁移器把已知旧 ID 转成新预设并记录字段取舍与已知算法语义差异；未知 ID 返回可恢复问题。旧字段解析的存在不代表新管线需要复现旧候选、分数或排序。

### 3.2 固定阶段，不开放任意图

Chat 上下文管线适合按 priority 顺序修改同一个上下文。检索同时存在多路候选生成和汇合，不能只用线性 priority 表达。

Recall 使用阶段受约束的有向无环图：

```text
prepare
  -> retrieve（同阶段模块可并行）
  -> normalize
  -> fuse
  -> rerank
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

### 3.4 Recall 全局持有活动 Embedding 模型

Recall 与 Knowledge 的模型选择边界不同。Knowledge 可以由每个库固定自己的向量模型，并在查询时选择该库已经使用的相同模型；Recall 不采用这种逐库、逐查询选择范式。Recall 域只维护一个面向常规产品路径的活动 Embedding 模型/空间身份，由 Recall 全局设置统一配置，同时用于条目与标签向量化、Chat 被动召回、Agent 主动检索和普通 service 查询向量。

约束如下：

- Chat、Agent binding、占位符、产品预设和普通 service request 不得声明 `embeddingModel`、`embeddingModelId`、`embeddingProfileId` 或同义覆盖字段；Chat 临时切换生成模型也不得影响 Recall 的 Embedding 模型。
- `externalRequirements` 只声明是否需要查询向量及其期望身份，不把模型选择权交给调用方。前端编排器必须从 Recall 全局配置解析活动模型，并校验它与条目向量、标签向量和 bundle 的模型/空间身份一致。
- 更改 Recall 全局模型是向量资产代际切换，不是一次普通查询偏好变更。切换后必须产生新的模型/空间身份，隔离缓存并显式处理条目与标签向量覆盖；不得在 Chat 查询时按需为任意模型静默扩建向量库。
- 只有 Recall Playground 的独立诊断上下文可以在后续提供模型覆盖；该值不得进入 Agent、Chat、产品预设或 Recall 全局活动模型。
- Playground 使用非活动模型时，只能查询该模型身份下已明确准备的匹配资产；缺少资产时阻塞或要求用户显式准备，不能回退到活动模型的向量，也不能用一个模型的查询向量搜索另一个模型的条目矩阵。

Phase 5 先完成全局活动模型下的统一管线 UI。非活动模型的资产保留、占用和清理另列后续能力，不阻塞旧 Playground 迁移。

---

## 4. 目标运行模型

### 4.1 管线阶段

| 阶段        | 职责                                             | 示例模块                                  |
| ----------- | ------------------------------------------------ | ----------------------------------------- |
| `prepare`   | 查询规范化、分词、标签匹配、输入产物校验         | `query-normalize`、`query-tags`           |
| `retrieve`  | 独立生成候选和原始信号                           | `keyword-recall`、`content-vector-recall` |
| `normalize` | 在各自信号域中执行确定的分数标定                 | `log-normalize`、`min-max-normalize`      |
| `fuse`      | 合并候选与多路信号，生成统一管线分数             | `weighted-fusion`                         |
| `rerank`    | 去重、priority 加成或可选二次排序                | `priority-boost`                          |
| `filter`    | enabled、集合、标签、最终阈值和授权范围过滤      | `entry-policy-filter`、`score-threshold`  |
| `finalize`  | TopK、加载最终条目、生成高亮、结果和结构化 trace | `result-finalizer`                        |

集合、授权、enabled 等能够安全缩小扫描范围的硬过滤可以在候选生成前下推；最终 trace 必须记录实际下推的过滤条件。会改变融合语义的 score 阈值不得静默下推。

候选预算必须和最终返回数量分开：

- `candidateBudget`：每路召回或融合前允许保留的候选上限，为去重、重排和联想保留余量。
- `limit`：finalizer 最终返回的条目数。
- `expansionBudget`：v1 契约中的保留字段，当前内置预设固定为 `0`；引入实际扩展模块前不增加对应 UI 和验收要求。

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

当前生产 bundle 主要承载查询向量及其模型、空间和算法身份。`asset_generation` 与 `query_energy_field` 是已冻结的扩展字段；只有出现生产消费者后，才增加后台发布、资源管理和 UI 验收要求。

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
- Embedding 模型不是常规预设参数或 `allowedOverrides`。产品运行只解析 Recall 全局活动模型；Playground 的诊断模型选择属于独立运行上下文，不写入可供 Chat/Agent 使用的管线配置。
- 不把解析后的执行计划持久化为真源；每次加载配置时重新校验和编译。
- 缓存 key 至少包含规范化查询、数据范围、Embedding 空间、预设或配置哈希、模块版本集合和 `algorithmVersion`。

---

## 5. 内置预设

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
  -> weighted-fusion
  -> priority-boost
  -> entry-policy-filter
  -> score-threshold
  -> result-finalizer
```

性质：

- 关键词分支与 `algorithmic` 使用同一个 `keyword-recall` 模块。
- 所有向量模块共享一个查询向量和同一个已确认的 Embedding 空间身份。
- Lens 当前只接入原始关联候选；历史投射、折射和标签图传播在 Phase 3 决定迁移或淘汰。
- 默认配置必须为每个信号保留原始分、归一化分、融合权重和候选去留原因。

`comprehensive` v1 使用 weighted fusion。RRF、多样性和其他融合策略属于后续实验模块，不是 v1 退出条件；引入时必须使用新的算法版本和缓存空间。

### 5.3 旧 ID 迁移映射

旧 ID 不注册为新 Runner 的可执行预设，只由独立 migration / legacy parser 识别。Phase 0 已冻结以下映射：

| 旧 ID                            | 建议迁移目标    | 迁移说明                                                  |
| -------------------------------- | --------------- | --------------------------------------------------------- |
| `keyword`                        | `algorithmic`   | 保留纯文本、离线可用这一产品意图，不保证原分数和排序      |
| `vector`、`semantic`             | `comprehensive` | 转为新的多信号预设，不复刻旧 Vector 权重、阈值和裁剪顺序  |
| `lens`、`blender`、`associative` | `comprehensive` | 转为新的综合召回，不保留旧单分支或 `0.65 / 0.35` 融合语义 |
| 未知或已移除的第三方 ID          | 不自动映射      | 返回结构化迁移问题，由用户选择目标预设                    |

迁移只复制新预设仍有相同语义的通用字段，例如数据范围和最终 `limit`。旧 `minScore`、引擎权重和候选上限不直接套入新分数域；迁移报告列出目标预设、保留字段、丢弃字段和算法差异。迁移完成后持久化新 schema，旧检索缓存和已持久化结果直接失效。

---

## 6. 配置编译与执行

### 6.1 编译步骤

1. 根据 preset ID 解析内置配置或读取自定义配置。
2. 校验 `schemaVersion`、模块存在性、参数 schema 和阶段合法性。
3. 根据 `requires` / `provides` 建立依赖图并拒绝环路、缺失产物和重复 finalizer。
4. 汇总外部需求，例如查询向量、期望的模型/Embedding 空间身份或历史向量；常规产品编译从 Recall 全局配置解析该身份，不接受调用方的模型覆盖。
5. 生成稳定的配置哈希和模块版本集合。
6. 返回可执行计划及前端必须补齐的外部产物清单。

### 6.2 执行步骤

1. 前端 Recall service 请求编译预设；此时尚未执行任何外部 Embedding 请求。
2. 编译器返回完整的 `externalRequirements` 和 `candidateBudget`，前端使用现有 Provider Adapter、查询向量缓存和 Recall 全局活动模型一次性补齐外部产物；只有 Playground 诊断运行可显式传入受控模型上下文。
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
- Weighted fusion 只消费已归一化信号，并在 trace 中保留各路权重与贡献。
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

本节记录尚未完成的交互迁移。Agent 和 Chat 已使用 preset；Playground、结果详情和 Monitor 仍保留旧引擎的数据与展示语义。

### 8.1 现状调查

| 交互面            | 当前实现                                                                                                                               | 管线化后的缺口                                                                                                            |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Agent Recall 设置 | 已支持全局 preset、绑定级继承/覆盖和 legacy profile 迁移                                                                               | preset 列表、能力摘要和可编辑参数改为消费 `PresetSummary`、compile result 与 `allowedOverrides`；补 round-trip 和能力预检 |
| Chat 占位符       | 新文本使用 `preset`，legacy `profile` 由兼容解析映射；后台调用已进入 Recall service                                                    | 验证后台路径不弹交互对话框，并把实际预设、Embedding 身份和失败原因写入日志/Monitor                                        |
| Playground        | 最多并排 4 个 `SearchSlot.vue`，每槽仍直接选择底层引擎和 Embedding 模型，并持有独立运行状态                                            | 改为最多两个 preset/pipeline 工作面，统一 compile/prepare/run、外部需求、batch 状态和 trace                               |
| 向量准备          | `SearchSlot.vue`、`PlaygroundView.vue` 和 `SearchOrchestrator` 分别做覆盖率检查；`VectorCoverageDialog.vue` 提供补全、忽略和取消       | 需要由编译结果驱动准备步骤；区分“缺少 Embedding route”“条目向量覆盖不完整”“索引未加载”；后台 Chat 不得弹交互对话框        |
| Recall 全局设置   | `getRecallSettingsConfig()` 把所有引擎参数合并进“检索与索引策略”，并写入全局 `vectorIndex`                                             | 全局设置只应保留 Embedding、索引资产、请求和缓存基础设施；运行时预设/模块参数必须归属于 Agent 安全覆盖或 Playground 配置  |
| 执行状态          | `useRecallSearchManager.ts` 和 `useRecallSearch.ts` 主要暴露 `loading + results`；失败、取消和空结果都可能落成空数组                   | 无法可靠展示阻塞、显式降级、部分成功、失败和真正空结果，也无法防止旧请求晚返回覆盖新查询                                  |
| 结果详情          | `RecallResultDetailDialog.vue` 只展示条目和百分比“匹配分值”，不展示现有 `signals / trace`                                              | 管线分数不是概率；需要展示分数语义、信号贡献、请求预设、实际预设、过滤和排名路径                                          |
| 监控              | `RagTraceContent.vue` 使用通用步骤时间线，并把 score 绘制成相似度百分比进度条                                                          | 需要消费版本化 pipeline trace，展示阶段、模块、候选数、跳过/失败原因和降级；旧 trace 仍需可读                             |
| 工作区持久化      | `WorkspaceConfig.playground` 保存槽位 `engineId`、参数、查询和完整结果；`defaultEngineId` 仍在类型与默认配置中，但设置页没有对应选择器 | 完整结果和 trace 会迅速膨胀且重启后过期；旧引擎字段需要版本化迁移，不能继续作为隐藏真源                                   |
| 重复/闲置入口     | `SearchPanel.vue`、`EngineSelector.vue` 无产品引用，`useRecallSearch.ts` 仅被前者使用；store、service 和 Playground 仍有多条搜索路径   | Playground 接线后复核动态引用并删除闲置组件和 engine capability 分支                                                      |

剩余 UI 工作分两组：先收口 Playground 的运行状态和 workspace，再让结果详情与 Monitor 消费同一版 trace。Agent 只补 schema 驱动和能力预检，不重复迁移已完成的 preset 字段。

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
- Embedding 模型字段不得出现在产品预设的 `allowedOverrides`、Agent binding 或 Chat request 中；Playground 诊断模型上下文使用独立契约，不能伪装成模块参数。
- `externalRequirements` 同时包含是否阻塞和当前就绪状态。UI 不自行维护 `requiresEmbedding` 或引擎 ID 白名单。
- 每次运行携带 `runId + configHash`。查询、集合或配置已变化时，晚返回结果不得覆盖当前界面，只能作为过期运行留在诊断记录中。
- 错误必须带稳定 `code` 和可选 `nodeId / fieldPath`，使 UI 能把问题定位到参数或模块，而不是只弹一个通用 toast。
- 如果第一阶段无法真正中止 Tauri 任务，界面不得提供含义虚假的“取消执行”。最低实现是停止等待并丢弃该 `runId` 的晚返回；只有后端支持按 `runId` 协作取消后才显示真正的取消按钮。

### 8.3 常规产品与 Agent 配置

常规产品入口维持低复杂度：

- 默认只展示 `visibility = product` 且 `stability = stable` 的预设，不展示阶段、模块 ID、融合算法名或 arbitrary JSON。
- `AgentRecallSettings.defaultPresetId` 和 `RecallBinding.presetId` 已落地；`defaultProfile / profile` 只保留在迁移输入。
- `RecallSection.vue` 继续显示全局预设和绑定继承/覆盖，但选项、用途和能力摘要改为读取 preset summary 与最近一次编译结果。
- 选择预设后仅展示 `allowedOverrides`。`limit`、`minScore` 等覆盖项必须标出作用域；当预设不支持统一 `minScore` 时隐藏或替换为该预设声明的安全参数，不能沿用旧 profile 默认值。
- Agent/Chat 配置页不展示 Recall Embedding 模型选择器；模型只在 Recall 全局设置中配置。配置页只做能力预检，不自动发送 Embedding 请求；缺少模型 route 时显示可定位错误和“前往 Recall 设置”操作。
- Chat 运行属于非交互后台路径，不弹出覆盖率、模型选择或补全向量对话框，也不继承 Chat 当前/临时生成模型作为 Recall Embedding 模型。它按 Recall 全局活动模型及预设的失败/降级策略执行，并把实际预设、Embedding 身份和原因写入 Chat pipeline log 与 Recall monitor。
- 自动生成的新占位符使用已冻结的 `preset=<id>`；解析器在迁移期继续接受 `profile=semantic|associative`。对用户手写文本只做可定位诊断，不进行普通字符串批量替换。
- Recall 全局设置页移除动态注入的引擎运行参数，只保留 Embedding 模型、索引资产、请求设置、向量化和缓存。预设安全覆盖放在 Agent Recall 设置，完整模块参数只放在 Playground，避免同一参数出现三处真源。
- Agent 导入、导出、复制和预设 round-trip 必须覆盖 `defaultPresetId`、绑定级 `presetId` 和 fallback 策略，不能只改编辑器表单。

### 8.4 Playground 信息架构

Playground 首期使用阶段分组列表，不建设自由拖拽画布。现有四槽布局改为配置 A / B 两个工作面，在相同查询、数据范围和 Recall 全局活动模型下运行。非活动模型对比属于后续诊断能力，不进入本阶段退出条件。

Playground 分为四个稳定区域：

1. **运行上下文**：查询、思绪集范围、标签/授权过滤、最终 `limit` 和工程夹具模式。上下文变更后，现有结果标记为过期。
2. **配置工作面**：选择内置/已保存预设，复制为草稿，按固定阶段查看模块，编辑 schema 参数，保存副本、恢复预设和删除自定义配置。
3. **结果与诊断**：显示每个配置的运行状态、最终结果、共同候选、仅 A/仅 B、rank 变化和耗时；分数域不兼容时不计算 score 差值。
4. **诊断面板**：显示编译问题、external requirements、阶段候选数、模块耗时、跳过/失败原因和原始 trace；默认折叠到当前关注的阶段。

具体交互：

- 选择预设或修改参数时只触发防抖编译，不自动执行检索。显式点击“运行”或在查询框回车才执行，避免编辑综合管线时反复调用 Embedding。
- 编译期间保留上一次有效结果并显示“配置待验证”；编译失败时禁用运行按钮，问题列表点击后聚焦对应阶段、模块和字段。
- 模块开关只在依赖仍可满足时可操作。关闭上游造成下游缺失时，编辑草稿可保留，但必须显示阻塞问题，不能静默连带删除用户参数。
- 从内置预设开始编辑时先生成草稿副本；内置定义本身只读。未保存变更、恢复预设和切换配置时使用明确的离开确认。
- 单模块运行使用独立的 fixture 区，列出缺少的输入 artifact，并允许从最近一次完整运行引用不可变快照；不能隐式读取当前全局可变 store。
- “全量检索”改为统一的 batch run。界面展示总进度和每个配置/查询的独立状态；一个分支失败不清空另一个分支的成功结果。
- 工程夹具批量重放固定数据快照、外部产物身份和配置哈希，报告查询级状态、结果集合差异、rank 变化、阶段耗时和降级。
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
| `agent-manager/.../RecallSection.vue`                               | 使用 preset summary 渲染能力和 allowed overrides                                   |
| `agent-manager/.../RecallBindingItem.vue`                           | 保留已完成的继承/覆盖交互，补当前生效预设与 capability 状态                        |
| `views/PlaygroundView.vue`                                          | 改为统一运行上下文、A/B 工作面和 batch run 状态所有者                              |
| `components/SearchSlot.vue`                                         | 拆为配置工作面、结果列表和诊断面板；不再自行判断 Embedding 或持有覆盖率编排        |
| `config.ts`、`views/SettingsView.vue`                               | 移除动态引擎运行参数合并；保留检索依赖的基础设施设置                               |
| `composables/useRecallSearchManager.ts`                             | 替换为唯一的 pipeline compile/run composable，管理 run token、状态机和过期响应     |
| `components/RecallResultDetailDialog.vue`                           | 展示信号与 pipeline trace，移除统一百分比分数语义                                  |
| `components/monitor/RagTraceContent.vue`                            | 消费 versioned pipeline trace 并兼容 legacy payload                                |
| `types/search.ts`、`types/monitor.ts`、`types/recall-collection.ts` | 新增 preset/compile/run/trace/UI 持久化类型，逐步移除产品侧 engine capability 类型 |
| `SearchPanel.vue`、`EngineSelector.vue`、`useRecallSearch.ts`       | Playground 接线后复核动态引用并删除                                                |
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
- Agent `defaultProfile / binding.profile` 已通过版本化 migration 转成新 preset ID；导入旧 Agent 时继续执行相同迁移并保留结构化问题。
- 文本占位符在兼容期读取旧 `profile`，新 UI 只生成 `preset`。移除 legacy parser 前必须有扫描报告证明没有现存 Agent 仍依赖旧参数。
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

本节只描述检索管线施工进度。自动化测试计划提供 fixture 和验收 lane，但不决定这里的 Phase 状态。

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
- [x] 注册独立 E2E ID `recall-pipeline` 和真实 spec，覆盖 `compile -> prepare -> run -> pipeline trace`。

退出门槛：契约、迁移规则、旧实现盘点和共享 fixture 已冻结。

### Phase 1：建立 Runner 与公共尾部阶段

- [x] 新增生产 module registry、配置编译器、artifact store 和串行阶段 Runner，并注册 compile/run IPC。
- [x] 抽取集合/enabled/标签硬过滤、最终 score threshold、排序、TopK、条目加载和 trace finalizer。
- [x] 第一阶段保持 retrieve 串行，为后续并行保留契约。
- [x] 用确定性测试模块跑通完整管线，并拒绝非法依赖、环路、缺失 artifact、重复 finalizer 和非法参数。
- [x] 支持生产模块单独运行和真实确定性 fixture。
- [x] 注册 `recall-pipeline` E2E preset 与真实 spec，覆盖 compile -> prepare -> run -> pipeline trace，并断言运行元数据区别于 legacy engine 路径。

退出门槛：生产模块可经 IPC 编译和执行；非法依赖、环路、缺失 artifact、重复 finalizer 和非法参数均被拒绝。

### Phase 2：拆分纯算法路径

- [x] 从 Keyword 引擎抽取查询分词、倒排候选、key/title/content 字面信号和归一化模块。
- [x] 建立 `algorithmic` 预设，并让旧 `keyword` 配置通过 migration 映射到该预设。
- [x] 证明未解析模型、未访问向量缓存且未发送 Embedding 请求。

退出门槛：`algorithmic` 满足模块契约和确定性，在离线或未配置模型时可运行。旧 Keyword 删除并入 Phase 6。

### Phase 3：拆分向量与联想信号

- [x] 从 Vector 引擎抽取内容向量候选和标签向量候选。
- [x] 从 Lens 抽取 entry ID/raw score 候选 helper，并注册 `lens-association-recall`。
- [ ] 决定 Lens 历史投射、折射和标签图传播是迁移为独立模块还是淘汰。
- [ ] 决定 Blender 的 gravity / resonance 是否需要新增模块；literal / semantic 继续复用现有候选，不复制检索逻辑。
- [ ] 记录 Vector、Lens 和 Blender 旧能力的保留/替代/删除清单及回滚边界。
- [x] 查询向量只生成一次并被所有依赖模块共享。

退出门槛：生产模块满足各自契约并共享一次查询向量；旧能力取舍有明确记录。

### Phase 4：建立综合预设

- [x] 建立 `comprehensive` 预设并复用 `keyword-recall`。
- [ ] 记录 weighted fusion v1 的分数语义、权重、配置约束、性能和 trace 字段；RRF 不属于 v1 退出条件。
- [ ] 为候选上限、各路归一化、最终阈值和 priority 定义合法范围、默认值来源和版本边界。
- [ ] 用工程夹具覆盖精确字面、内容向量、标签、Lens、空候选、无向量数据和确定性 tie-break。
- [ ] 建立显式 `fallbackPresetId` 降级路径。

退出门槛：weighted fusion v1 的语义和默认参数有版本化记录；综合预设通过编译、执行、trace、缓存隔离、确定性和性能测试；显式 fallback 可追踪。

### Phase 5：产品接入与迁移收口

- [x] Recall service、Chat processor、Agent tool metadata 和 Agent 运行配置改用 preset ID。
- [x] Agent 编辑器实现全局预设和绑定级继承/覆盖。
- [ ] Agent 编辑器从 preset summary / compile result 渲染 allowed overrides 和 capability 预检。
- [ ] 验证 Chat 后台执行不弹交互对话框，Agent、Chat、占位符和普通 service 只读取 Recall 全局活动模型。
- [ ] 完成全局活动模型切换后的资产代际标识、覆盖提示和缓存隔离验证。
- [x] 冻结新占位符预设参数名 `preset`，旧 `profile` 由 legacy parser 映射；旧 Agent 配置和 `engineId` 通过版本化迁移转换，并输出包含字段取舍与算法语义差异的结构化报告。
- [ ] UI 只消费编译后的 external requirements 和参数 schema，完成 `idle -> compile -> prepare -> run -> outcome` 状态机与 stale run 防护。
- [ ] Playground 切换为双配置诊断工作面，完成阶段模块编辑、工程夹具批量重放、统一 batch run 和 trace 调试；首期使用 Recall 全局活动模型。
- [ ] 结果详情与 Monitor 展示 score semantics、信号贡献、requested/actual preset、降级和版本化 trace，并兼容旧 trace。
- [ ] Playground workspace 不再持久化结果和运行态；确认无动态引用后删除重复/闲置搜索组件和 engine capability 分支。
- [x] 缓存 key 切换到 pipeline/config/module version 契约。
- [x] 更新 `ARCHITECTURE.md`、工具指南和相关 Chat 文档。

退出门槛：常规产品调用不发送底层 engine ID；旧配置可迁移且问题可定位；成功、空结果、阻塞、降级、失败和取消在真实 Tauri UI 中可区分。

### Phase 6：删除旧引擎运行时

- [ ] 确认没有产品、Agent、Chat、测试或迁移外代码直接调用旧 `RetrievalEngine`。
- [ ] 删除旧引擎 registry，以及 Keyword、Vector、Lens、Blender 和 facade 中已被模块替代的重复实现。
- [ ] 只在独立 legacy migration 层保留旧 ID 解析。

退出门槛：后端只有模块 registry 和 pipeline runner；移除旧引擎实现及其行为夹具不会影响现行产品运行。legacy migration 夹具继续保留，用于保证旧配置能够得到确定的转换结果或结构化问题。

retrieve 并行化、RRF、多样性重排和 Playground 非活动模型对比均为后续优化，不属于 Phase 6 删除旧运行时的条件。

---

## 10. 验证要求

### 10.1 单元测试

- 配置 schema、依赖图、阶段顺序、环路和 artifact 完整性。
- 每个模块的确定性输入输出、参数边界和错误语义。
- 原始信号、归一化、融合、过滤、TopK 和 trace 分层正确。
- 纯算法预设零 Embedding 调用。
- 多模块共享一次查询向量。
- 常规产品请求不能覆盖 Recall 全局活动模型；Chat 临时生成模型切换不改变查询向量的 Embedding 身份。
- 显式降级与禁止静默降级。

### 10.2 新管线工程回归测试

- 新预设和模块的契约、确定性、分数计算语义、trace 完整性与性能基线。
- 旧引擎输出只用于算法盘点和迁移排错；通过条件来自新模块的明确规则。
- migration baseline、smoke/curated corpus 和 external corpus 可作为输入，断言覆盖已知字面信号、候选去重、过滤条件、稳定 tie-break、阶段产物和 trace。
- 数据库重启、向量库缺失、tag pool 缺失和缓存失效。
- 多集合、集合级阈值、禁用条目、标签过滤和授权范围。
- 相同最终分数下的稳定 tie-break，避免并行执行改变结果顺序。
- pipeline/config/module/embedding space 任一身份变化后不得误命中旧缓存。
- 全局模型切换形成新的资产代际并隔离缓存；缺少新模型资产时不得复用旧模型矩阵或按 Chat 查询静默扩建向量库。

### 10.3 UI 与迁移测试

- preset 列表按 visibility/stability 过滤，常规产品不暴露模块和 legacy 引擎；旧 ID 不进入可执行 preset 列表。
- Agent 全局预设与绑定级继承/覆盖 round-trip；旧 `profile` 和旧 `engineId` 迁移后配置可加载，字段取舍和算法差异可追踪。
- Agent、Chat、占位符和产品 `allowedOverrides` 不出现 Embedding 模型字段；Recall 全局模型是常规产品路径的唯一模型真源。
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
bun run test:tauri:e2e -- --preset recall-pipeline
bun run test:tauri:e2e -- --preset recall-vector
bun run test:tauri:e2e -- --preset recall-curated
bun run test:tauri:e2e -- --preset recall-chat
bun run test:tauri:e2e -- --preset corpus-sample
bun run test:tauri:e2e -- --preset corpus-full
bun run test:tauri:e2e -- --preset ollama-vector
bun run test:tauri:e2e -- --preset ollama-chat
```

`recall-pipeline` 已覆盖新 Runner 的 compile/run/trace；其余入口覆盖 legacy vector、Chat、恢复、外部语料和真实模型场景。新增 UI 场景继续通过 `tests/tauri-e2e/support/presets.ts` 具名装配，不把 spec 路径和长参数组合写回根 `package.json`。

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

### 11.8 逐查询模型切换导致向量资产膨胀

风险：如果 Chat、Agent 或产品查询可以任意选择 Embedding 模型，每个模型都会派生条目向量、标签向量、矩阵/索引、查询缓存和覆盖状态，模型数与数据量相乘后会造成存储、内存、请求费用和维护成本不可控；模型身份误配还会产生无效检索结果。

控制：常规产品路径只使用 Recall 全局活动模型，不接受逐查询覆盖。全局模型切换按资产代际迁移处理，缓存和索引按模型/空间身份隔离。Playground 非活动模型对比另立实施项后再开放。

---

## 12. Phase 0 决策与后续产品事项

Phase 0 已确认：

- 使用 `algorithmic / comprehensive`，显示名为“算法召回 / 综合召回”。
- `comprehensive` v1 当前使用 weighted fusion；权重属于版本化内置配置，变化时提升算法版本并隔离缓存。
- `priority` 只在 rerank 阶段应用一次。
- 纯算法首期不把标签文本匹配作为额外评分信号；标签仍可作 policy 过滤。
- 自定义管线首期只属于 Playground；首期最多两个可见诊断工作面。
- 新占位符字段为 `preset`，结构化 API 字段为 `presetId`。
- `comprehensive` 默认阻塞，只有显式配置才回退 `algorithmic`；默认不静默 partial coverage。
- Recall 常规产品路径只使用全局活动 Embedding 模型；Chat、Agent、占位符和普通 service 不允许逐查询覆盖。
- legacy parser 保留到 Phase 6，并以迁移扫描结果作为删除门槛。

仍需在对应实施阶段作产品决策：

1. 是否在首期之后允许把自定义管线发布为工作区级高级预设；首期仍只在 Playground 保存。
2. 是否开放 Playground 非活动模型对比，以及对应资产的保留、占用展示和清理策略。
3. 是否另立 Recall 质量评测研究计划；如需建立，先确定目标用户、反馈采集、隐私边界和个性化召回的标注协议。

上述事项不阻塞 Phase 5 的全局活动模型 UI 收口，也不改变当前 weighted fusion v1。

---

## 13. VCPToolBox 调研补充

2026-07-20 曾对 `E:/rc20/vcp/VCPToolBox` 的 BM25、向量、TagMemo、RRF、Associate 和 Expand 实现做过对照调查。该调查用于发现可复用的工程约束，不直接决定 Recall v1 的模块集合。

已经进入当前设计的结论：

- 编译结果决定是否准备 Embedding，纯算法路径不先生成查询向量。
- 同一请求的外部产物由 artifact bundle 共享。
- 多集合候选合并后再执行公共过滤、排序和 TopK。
- 主动工具、被动 Chat 和 Playground 共用 Runner。
- 未知模块和不支持的组合在编译期返回结构化问题。

暂不进入当前退出条件的候选：

- RRF、TimeDecay、Expand、残差图、传播核和查询增强能量场。
- 面向上述模块的资源占用、原子热发布和完整消融工作台。
- `expansionBudget` 对应的产品 UI；该字段在 v1 中保持 `0`。

这些候选只有在出现明确使用场景和生产消费者后再立项，不反向扩大 Phase 1 至 Phase 6 的范围。
