# Recall / Knowledge 检索模式与思绪召回设计调查

**状态**: 调查完成，结论已更新，施工步骤已迁至统一计划
**创建日期**: 2026-06-23
**最近修订**: 2026-07-17
**适用范围**: `src/tools/recall/`、`src-tauri/src/recall/`、`src/tools/knowledge-base/`、`src-tauri/src/knowledge/`

---

## 0. 修订决定

本轮修订采用明确的双域设计：**Recall / 思绪** 与 **Knowledge / 知识**。此前使用的“热记忆 / 冷知识库”和 `Thought` 都是调查阶段工作名，不再作为长期产品命名、API 枚举或数据库命名。

- **Recall / 思绪**：承载现有 CAIU 条目、标签、priority、语义召回、联想召回和 Recall engine。旧版 `knowledge/bases` 文件数据会迁入该域；`refs/refBy` 继续作为运行时派生关系。
- **Knowledge / 知识**：承载传统 RAG 资料，包括文档、手册、论文、网页、百科、代码资料包等，使用 document/chunk/source 结构，强调出处、切片和可引用性。
- 新增类型、UI 文案和内部路由使用 `recall` / `knowledge` / `mixed`。
- `semantic` 与 `associative` 是 Recall 域内部的两个 profile；Knowledge 域走独立 document/chunk 检索通道。
- 现有 CAIU 实现整体迁入 Recall，原 `knowledge-base` 只保留为未来 Knowledge 资料库入口；具体施工顺序统一记录在 [Recall / Knowledge 领域拆分与重构实施计划](./recall-knowledge-domain-restructure-implementation-plan.md)。

### 0.1 2026-07-17 调查与讨论补充

本轮重新对照了 `E:/rc20/vcp/VCPToolBox` 当前的 DailyNote、KnowledgeBaseManager、RAGDiaryPlugin、LightMemo、TagMemo V9.1 与 Agent 配置，并复核了 AIO Hub 的 `ChatAgent`、知识库占位符和工具调用链。补充结论如下：

- VCP 日记本的源数据是按 folder 组织的文本存档。索引只记录文件、`diary_name`、chunk、Tag 和向量，不保存 Agent、会话或消息外键。
- VCP Agent 通过 Prompt 中的日记本占位符选择本次加载哪些存档；多个 Agent 可以组合同一个公共日记本。关闭占位符或配置开关后，本次上下文就不再包含该存档。
- DailyNote 写入时由调用参数选择 folder 和署名。署名可以参与文本展示或检索过滤，但不是存储层的 Agent 所有权关系。
- AIO 的 `ChatAgent` 同样是可复用配置预设。现有 `knowledgeBaseConfig.bindings`、占位符和工具开关属于编排层，不应反向要求条目数据库保存 `agentId`、`sessionId`、分支或消息来源。
- Recall 与 Knowledge 的拆分只表达两种数据形态和索引生命周期：前者是完整语义条目，后者是 document/chunk 资料。它们不是两种 Agent 身份或认知状态。
- 现有 CAIU、标签池、priority、Lens / Blender 和 Agent 写入工具归入条目型存档。`refs/refBy` 在当前 Rust `Caiu` 中是 `serde(skip)` 的运行时派生关系，不是迁移时必须持久化的源字段。
- “不建设模拟遗忘和认知生命周期”是此前调查讨论中的阶段结论，不是对 AIO 已有实现或既定计划的反驳。修订后只把它记录为范围说明，不再据此建立新的 Memory 领域模型。
- 时间衰减若有实际需求，应像 VCP `::TimeDecay...` 一样作为 binding、占位符或单次请求上的可选检索修饰符；不进入条目持久化状态，也不作为第一阶段数据库化前置任务。
- AgentDream 只是同一批存档的可选消费者和整理工具，不参与条目存储模型推导。
- VCP TagMemo V9.1 可借鉴派生资产版本、原子发布、统一写协调和可复现实验，但第一阶段只迁移 AIO 当前已经持久化的数据与索引。
- 依赖调查的详细结论记录在 [`backend-storage-database-design.md`](./backend-storage-database-design.md) 第 5 节。第一轮前端不新增生产依赖，Rust 侧以 `rusqlite` 为必需项，文件监听和 TriviumDB 分阶段引入。

---

## 1. 背景

`knowledge-base` 当前同时承担两类相近但目标不同的召回需求：

- **纯知识库召回**: 目标是准确、稳定、可解释，类似“查档案”。用户期望命中的内容与查询高度相关，适合 RAG 上下文注入、文档问答、事实查找和精确引用。
- **记忆库召回**: 目标是像回想一样触发关联，允许语义扩散、标签联想和上下文牵引，类似“想起来”。用户期望系统能召回间接相关、概念相邻或被历史语境激活的内容。

当前系统的多引擎设计已经提供了雏形：

- `keyword`: 字面匹配，适合确定性查找。
- `vector`: 内容向量相似度为主，同时已有 Tag-First / `tag_vector` 召回能力。
- `lens`: 通过标签之海和折射参数做语义扩散。
- `blender`: 同时融合字面、语义、标签引力和残差挖掘信号。

问题在于，对外直接暴露这些底层算法名会让产品语义越来越混乱：用户真正关心的是“精准查找”还是“联想回想”，而不是“这次是标签向量还是内容向量命中”。

本调查目标是明确“思绪 / 知识”的工程分层方式，并评估是否应将标签与向量引擎对外合并、是否应将 `lens` 与 `blender` 整合为统一的思绪引擎。

---

## 2. 当前代码边界

### 2.1 Rust 后端

- `src-tauri/src/knowledge/core.rs`
  - 定义 `RetrievalEngine` trait。
  - 引擎接口很轻，仅要求 `id()`、`info()`、`search()`。
  - `SearchFilters` 已支持 `texture`、`refractionIndex`、`requiredTags`、`historyVectors`、`k1`、`b` 以及 `extra` 动态参数。

- `src-tauri/src/knowledge/state.rs`
  - 当前注册顺序为：
    - `KeywordRetrievalEngine`
    - `VectorRetrievalEngine`
    - `LensRetrievalEngine`
    - `BlenderRetrievalEngine`

- `src-tauri/src/knowledge/search/vector.rs`
  - 名义上是向量检索，但实际已经包含标签召回信号。
  - 返回结果可能使用 `match_type = "vector"` 或 `match_type = "tag_vector"`。
  - 说明“标签”和“内容向量”在知识库模式下已经不是两个完全独立的对外能力，而是同一个语义检索能力中的两类内部信号。

- `src-tauri/src/knowledge/search/lens.rs`
  - 通过标签之海、历史向量投射、折射率和纹理参数进行语义扩散。
  - 更接近记忆库的“联想触发”需求。

- `src-tauri/src/knowledge/search/blender.rs`
  - 已实现三路信号：
    - Literal: 字面信号。
    - Semantic: 内容向量相似。
    - Gravitational: 标签引力和残差挖掘。
  - 根据查询词数量估算信息熵，动态调整 literal / semantic / gravity 权重。
  - 这是当前最接近“思绪引擎”的实现雏形。

### 2.2 前端

- `src/tools/knowledge-base/logic/orchestrator.ts`
  - `SearchOrchestrator` 负责判断引擎是否需要向量、检查覆盖率、加载模型向量、重建标签池索引、生成查询向量并调用后端 `kb_search`。
  - 当前通过硬编码判断 `["vector", "lens", "hybrid"]` 是否为向量引擎，漏掉了后端同样要求 vector payload 的 `blender`。

- `src/tools/knowledge-base/services/api.ts`
  - 对外门面 `search` / `searchWithCache` 也硬编码 `vector/hybrid/lens` 为需要向量的引擎，同样漏掉 `blender`。
  - `resolveEngineId` 当前 fallback 到知识库默认引擎，再 fallback 到 `vector`。

- `src/tools/knowledge-base/types/search.ts`
  - `SearchResult.matchType` 类型目前只允许 `"vector" | "keyword" | "tag" | "key"`。
  - 后端实际可能返回 `tag_vector`、`lens`、`blender`，前后端契约已不完全一致。

- `src/tools/knowledge-base/config.ts`
  - 默认工作区配置 `defaultEngineId` 当前为 `vector`。
  - 动态设置项会从后端 `RetrievalEngineInfo.parameters` 注入，说明新增或合并引擎不需要重写设置系统，但需要处理参数去重和命名。

### 2.3 VCPToolBox 对照结论

VCPToolBox 当前采用“存档与编排分离”的双通道：

```text
条目存档  DailyNote -> dailynote folders -> KnowledgeBaseManager / TagMemo V9.1
文档资料  knowledge folders -> TDBKnowledge -> TriviumDB
被动编排  Agent Prompt 中的日记本占位符 -> RAGDiaryPlugin
主动检索  LightMemo -> 按 folder / knowledge library 选择通道
```

可借鉴边界：

- 日记文件或条目本身是无状态存档；“某 Agent 的记忆”由 Prompt、folder 选择和开关组合出来，不由数据库外键定义。
- 同一个日记本可以被个人 Agent、公共 Agent 或整理工具共同使用，存储层不需要知道消费者列表。
- 条目侧强调标签共现、联想传播和频繁小写入，但写入后仍只是普通存档。
- 知识侧强调 document/chunk、文件 manifest、批量导入、BM25、向量、图邻接与出处回源。
- 两侧不共享原始数据表和索引资产；路由层只共享查询和结果契约。
- RAGDiaryPlugin 的全文、RAG、门控 RAG 和时间衰减能力都由占位符修饰符选择，说明召回策略属于编排层。
- AgentDream 在条目存档之上执行可选的离线回顾与人工审批，不改变底层日记 schema。
- VCP 自身报告的 V9.1 收益不能直接替代 AIO 的基准测试；AIO 仍需固定查询集、候选对照和主观有效性评估。

---

## 3. 核心判断

### 3.1 Recall 域不再拆知识库 / 记忆库

推荐不要在现有 CAIU / Recall 体系内继续把“知识库”和“记忆库”拆成两套存储、两套向量、两套标签池。旧 CAIU 数据应直接归入 Recall / 思绪域。

`Recall` 表达的是“一组可被主动或被动唤回的原子条目，以及负责唤回它们的方法”，不是“思绪”的直译。它不表示条目绑定某个 Agent，也不表示数据库负责维护认知状态。更接近 VCP 的对应物是“日记本 / folder”：Agent 配置选择本次启用哪些集合，工具调用选择本次写入哪个集合，条目本身保持独立。

建议保留同一套存储与索引基础设施：

```text
CAIU 条目
  ├── content
  ├── tags
  ├── priority
  ├── runtime refs / refBy
  └── vectorizedModels

共享索引
  ├── keyword inverted index
  ├── content vector matrix
  ├── global tag pool
  └── tag sea
```

原因：

- 两类需求的差异主要在召回目标、信号权重、扩散深度和过滤阈值，而不是源数据形态。
- 拆存储会引入同步、迁移、去重、跨库引用和 UI 管理复杂度。
- 同一个条目可能同时具有“知识”和“记忆”价值。例如一条项目决策记录既可被精准查询，也可在相似上下文中被联想召回。
- CAIU 条目是人工或AI整理后的语义单元，不应再被自动切片。自动 chunking 会破坏标签、priority、运行时联想和人工维护的上下文边界。
- Agent、会话和分支只影响本次如何组合、查询和注入条目，不进入条目主表，也不建立反向消费者关系。

### 3.2 传统知识检索应单开 Knowledge 域

如果需要面向 PDF、Markdown、网页、手册、百科、代码文档等传统 RAG 资料，建议新增独立的 Knowledge / 知识资料库通道，而不是继续在 Recall 思绪域中模拟“知识检索”。

```text
Recall / 思绪域
  数据: 人工整理的记忆、经验、项目判断、长期上下文
  单元: CAIU entry
  检索: semantic / associative profile
  特征: 标签、priority、运行时联想、上下文牵引
  禁止: 自动切片

Knowledge / 知识资料库
  数据: 文档、手册、论文、网页、百科、代码资料包
  单元: document + chunk
  检索: BM25 稀疏召回 + 向量稠密召回 + 图扩散 + rerank
  特征: 文件来源、章节路径、chunk 命中、可溯源引用
  支持: 自动切片
```

因此，原先的 `knowledge profile` / `memory profile` 不再建议作为产品级双模式。它们应被更明确地替换为 Recall 域内部的 `semantic` / `associative` profile，以及 Knowledge 域的 document/chunk 检索通道。

产品级模式应改为：

```text
recallSearch / 思绪召回
  访问 Recall 思绪域。
  允许语义召回、标签联想和多信号共振。

knowledgeSearch / 知识检索
  访问 Knowledge 知识资料库。
  面向传统 RAG 文档召回、出处和切片。
```

### 3.3 标签和向量对外应合并，对内应保留

在 Recall 思绪域内，建议将“标签引擎”和“向量引擎”对外合并为一个思绪召回能力，对内继续保留为两条信号线。

对外不建议暴露：

```text
tag engine
vector engine
```

对外建议暴露：

```text
semantic / associative profile
```

内部保留：

```text
content vector signal
tag vector signal
literal keyword signal
```

原因：

- 用户关心“能不能找到相关知识”，不关心命中来自内容 embedding 还是标签 embedding。
- 内容向量回答“正文像不像查询”，标签向量回答“概念区域接不接近查询”。两者语义不同，内部硬合并会降低可调试性。
- 标签向量天然更短、更抽象，更适合扩散和联想；内容向量更适合精确语义匹配。
- 当前 `vector` 引擎已经返回 `tag_vector`，说明它事实上已经是 semantic engine，而不是纯 content vector engine。
- 真正传统意义上的“知识检索”应由 Knowledge 域承担，不应继续用 `vector` 名称包装成产品层知识库。

### 3.4 Lens 与 Blender 建议合并为 Recall Engine

`lens` 和 `blender` 都服务于记忆库方向：

- `lens` 更强调标签空间折射、历史投射和语义扩散。
- `blender` 更强调多信号融合、残差挖掘和共振加权。

它们对用户而言不是两个稳定可理解的产品模式。建议合并为：

```text
profile: associative
displayName: 联想召回
```

思绪引擎内部可包含几个阶段：

1. **意图发射**: 根据 query vector、raw query 和可选 history vectors 生成初始信号。
2. **内容验证**: 使用内容向量相似度提供主候选和防漂移约束。
3. **标签联想**: 通过 tag pool 最近邻、tag sea、IDF 和权重传播触发相关条目。
4. **残差挖掘**: 对查询向量做逐层投影，挖掘未被强标签解释的弱语义。
5. **共振融合**: 按 literal / semantic / associative 信号数量与强度计算最终分数。
6. **多样性与截断**: 在保证基本相关性的前提下，避免只返回同一簇结果。

### 3.5 普通相似度引擎不再承载传统知识库功能

建议让当前 `vector` 的演进版本承载 Recall 思绪域中的默认语义召回，而不是承载传统文档知识库功能。

它应该保留：

- 内容向量相似。
- Tag-First 作为无内容向量或标签强匹配的补充召回。
- 关键词 / 标题信号作为可解释加成，而不是扩散主导。
- 较严格的 `minScore` 和结果截断。

它不应该默认执行：

- 深层残差挖掘。
- 大范围标签扩散。
- 历史向量强投射。
- 过低阈值的弱关联召回。
- 文档级自动切片、文件监听、chunk 级出处管理和跨文档 BM25。这些应归入 Knowledge 域。

### 3.6 条目存档与 Agent 编排边界

此前调查讨论过自动遗忘、梦境整理和认知生命周期，并形成了“不在核心层实现”的阶段结论。该结论只用于收窄范围，不代表 AIO 现有实现曾计划建设这些状态，也不应继续扩展成新的 Memory 领域模型。

条目存档的最小状态流只有：

```text
显式创建 / 导入
  -> 持久化源内容
  -> 建立或更新派生索引
  -> 显式修改时使旧向量失效并重建
  -> 显式禁用或删除
```

编排规则：

- Agent 侧继续使用配置、占位符和开关选择条目库；关闭 binding 就表示本次不注入，不需要回写条目状态。
- 主动工具调用由本次参数选择搜索或写入的库，不由数据库根据 Agent 身份推断。
- 多个 Agent 可以使用同一个条目库；同一个 Agent 也可以组合个人、项目和公共条目库。
- 条目表不增加 `agent_id`、`session_id`、`branch_id`、`message_id` 等没有运行时消费者的字段。
- `refs/refBy` 继续作为运行时派生关系，需要时从内容和索引重建，不作为 Agent 归属或持久化生命周期字段。

产品层继续称“思绪”，内部使用 `RecallRepository` / `recall_entries`；不再引入 `ThoughtRepository`、`MemorySpace` / `MemoryEntry` / `MemoryRecallPolicy` 等并行类型体系。

### 3.7 可选查询期修饰符

时间衰减只是一种可选排序修饰符，不是条目状态，也不是数据库化第一阶段的必需能力。若后续有明确场景，建议沿用 VCP 的轻量方式，将参数放在 Agent binding、占位符或单次搜索请求上。

```ts
interface RetrievalTimeDecayOptions {
  halfLifeDays: number;
  minScore?: number;
  targetTags?: string[];
}
```

计算方式：

```text
decayFactor  = 0.5 ^ (ageDays / halfLifeDays)
finalScore   = baseScore * decayFactor
```

执行顺序建议：

```text
候选召回
  -> Recall 多信号融合 / 可选 rerank
  -> 时间衰减最终调制
  -> minScore 裁切
  -> TopK
```

约束：

- 条目从第一版起必须保留 `createdAt` / `updatedAt`；它们是基础存档元数据，与时间衰减无关。第一阶段只是不额外新增表示“事件发生时间”的 `occurredAt`。后续可按明确需求使用创建日期、显式事件日期或可解析的内容日期；无可靠日期时不衰减。
- 只对 `targetTags` 命中的条目衰减时，应匹配结构化 Tag，不扫描正文误判。
- 显式时间查询应绕过衰减，避免用户查询旧事件时被近期偏好干扰。
- trace 分别保留 `baseScore`、`decayFactor` 和 `finalScore`，方便解释裁切原因。
- 衰减只影响本次查询结果，不回写 priority、enabled 或任何持久化字段。

---

## 4. 建议的对外模型

### 4.1 用户侧模式

```text
思绪召回
  用于个人记忆、灵感、对话上下文、项目经验联想。
  输出可根据 preset 在“准”和“发散”之间调整。
  数据来自 CAIU，不做自动切片。

知识检索
  用于事实、文档、手册、论文、网页、代码资料包。
  输出强调来源路径、chunk 命中、章节上下文和可引用性。
  数据来自 Knowledge 知识资料库，支持自动切片。
```

### 4.2 Agent / API 侧参数

对外使用 `retrievalMode` 和 Recall 内部 `recallProfile`。`engineId` 仅作为底层调试参数和迁移输入。该结构用于主动搜索或路由层调用；被动注入继续由 Agent binding 和占位符决定是否激活、注入到哪里：

```ts
type RetrievalMode = "recall" | "knowledge" | "mixed";
type RecallProfile = "semantic" | "associative";

interface SearchParams {
  query: string;
  recallIds?: string[];
  engineId?: string;
  retrievalMode?: RetrievalMode;
  recallProfile?: RecallProfile;
  knowledgeLibraryIds?: string[];
  limit?: number;
  minScore?: number;
}
```

解析优先级建议：

```text
retrievalMode 决定数据域
  -> 对应域的显式 source ids 缩小检索范围
  -> Recall 分支内 explicit engineId（仅调试或迁移输入）
  -> Recall 分支内 recallProfile mapped engine
  -> workspace default Recall profile
  -> semantic fallback
```

如果未提供 `retrievalMode`，可以由仅出现的 `recallIds` 或 `knowledgeLibraryIds` 推断；两类 ID 同时出现时推断为 `mixed`。`retrievalMode = "knowledge"` 时不得让 Recall `engineId` 把请求重新路由回 Recall。长期建议外部默认指定 `retrievalMode`；`recallProfile` 只调 Recall 域内部参数，不代表独立数据真源。

### 4.3 结果解释

不建议把 `matchType` 直接作为产品模式展示。建议拆成两层：

```ts
type RetrievalMode = "recall" | "knowledge" | "mixed";
type RetrievalSourceType = "recall" | "knowledge";

type MatchSignal =
  | "keyword"
  | "key"
  | "content_vector"
  | "tag_vector"
  | "knowledge_bm25"
  | "knowledge_vector"
  | "knowledge_graph"
  | "lens"
  | "associative"
  | "multi_signal";
```

UI 文案可展示为：

- 标题匹配
- 正文相似
- 标签关联
- 多信号共振
- 上下文联想
- 知识片段
- 文件出处

这样既保留调试信息，也避免用户被底层算法名打扰。

---

## 5. 引擎合并方案

### 5.1 推荐目标形态

```text
keyword
  低成本确定性召回。
  主要用于精确查找、fallback、标题定位和管理工具。

semantic
  原 vector 引擎的产品化命名。
  内容向量为主，标签向量为辅，承载 Recall 思绪域默认语义 profile。

associative
  合并 lens + blender。
  标签联想、历史投射、残差挖掘、多信号共振，承载 Recall 思绪域联想 profile。
```

为了降低迁移成本，内部可以先保留旧 ID：

```text
vector  -> semantic migration mapping
lens    -> associative migration mapping
blender -> associative migration mapping
```

### 5.2 Associative Profile 参数建议

保留并统一以下参数：

- `limit`: 返回上限。
- `minScore`: 最低分数。
- `refractionIndex`: 标签折射强度，来自 lens。
- `texture`: 扩散纹理，来自 lens。
- `maxResidualLayers`: 残差挖掘深度，来自 blender。
- `layerDecay`: 残差层衰减，来自 blender。
- `associativeWeight`: 标签联想信号权重。
- `semanticWeight`: 内容向量验证权重。
- `literalWeight`: 字面信号权重。
- `diversity`: 结果多样性约束。

短期不必一次性暴露全部参数。用户设置页只暴露安全参数，Playground 可暴露更多调试项。

### 5.3 Semantic Engine 参数建议

保留：

- `limit`
- `minScore`
- `k1`
- `b`
- `tagWeight`

默认策略：

```text
content vector score 占主导
tag vector score 作为补充召回和轻量加权
keyword/key signal 作为可解释增强
```

---

## 6. 实施关系

本调查只定义检索域、profile、结果语义和算法边界，不维护迁名、迁移或引擎融合的施工步骤。

统一施工阶段、发布边界、兼容策略和完成门槛见 [Recall / Knowledge 领域拆分与重构实施计划](./recall-knowledge-domain-restructure-implementation-plan.md)。

---

## 7. 风险与注意事项

### 7.1 分数语义不同

`keyword`、`vector`、`lens`、`blender` 的分数归一化方式不同。合并对外模式时，不能假设所有 `score` 都有同一绝对含义。

建议：

- 对 Recall semantic profile 维持更稳定的分数语义。
- 对 Recall associative profile 将 `score` 解释为 activation / resonance，不直接等同事实相关性。
- 对 Knowledge 检索将 `score` 解释为 hybrid retrieval score，并优先展示来源、chunk 和 rerank 依据。
- `mixed` 不直接比较或拼接两域原始分数；应先保留分域配额，再用 RRF 或统一 reranker 融合。
- UI 可以展示“相关度”与“触发依据”，而不是只展示一个精确百分比。

### 7.2 Associative profile 容易漂移

Recall associative profile 如果过度依赖标签扩散或历史投射，可能把弱相关内容注入 RAG 上下文。

建议：

- associative profile 默认返回数量更少。
- 对最终候选增加内容向量验证。
- 对低分弱关联结果标记为“联想召回”，不要和高置信 Knowledge 片段混在一起。

### 7.3 Knowledge 不应污染 Recall

Knowledge 面向传统 RAG 文档召回，不应继承 CAIU / TagMemo 的 Recall 语义。

建议：

- Knowledge 不参与 Recall 标签池、tag sea、运行时引用关系和 priority 体系。
- Knowledge chunk 不写入 CAIU / Recall entry，也不反向成为 Recall collection 列表的真源。
- Knowledge 可在最终回答阶段与 Recall 结果合并，但合并发生在检索路由 / rerank 层。
- Knowledge 结果必须带 `sourceType = "knowledge"`、库名、文件路径、chunkIndex 和可选章节信息。

### 7.4 旧配置迁移风险

已有配置、缓存 key、Agent 绑定和 Playground slot 可能保存旧 `engineId`。

2026-07-01 代码检查补充：

- 当前代码中尚未出现运行态 `retrievalMode`、`memoryPreset`、`coldKnowledgeIds` 等字段，相关命名主要仍停留在计划文档。
- 现有真实调用面主要是 `llm-chat` 的角色预设 / 上下文管线：
  - `{{kb}}` / `{{kb::name::limit}}` 宏会展开为 `【kb::...】` 占位符。
  - `KnowledgeProcessor` 扫描 `【kb】` / `【knowledge】`，解析为 `KbRetrievalRequest`，再调用 `resolvePlaceholderRetrieval`。
  - 占位符格式目前是 `【kb::kbName::limit::minScore::mode::modeParams::engineId】`。
- 结构化 Agent binding、工具开关和权限配置必须自动迁移到 Recall，并保留原集合 ID。
- 自动注入由运行时生成 Recall 请求，不要求用户修改预设消息。
- 手写 `{{kb}}`、`【kb】`、`【knowledge】` 属于自由文本：应检测、报告并提供一键替换，不默认静默改写，也不得在运行时静默删除。
- 旧 `【knowledge】` 不建立到 Recall 的长期兼容映射，避免未来与 document/chunk Knowledge 冲突。

迁移输入映射：

```text
vector        -> semantic
lens          -> associative
blender       -> associative
hybrid        -> 按调用来源人工确认
memory        -> recall
coldKnowledge -> knowledge
```

缓存 key 中如果包含 `engineId`，迁移时应避免把旧缓存误命中新引擎。可以通过 `algorithmVersion` 或 engine alias 规范化策略隔离。

### 7.5 文档和 UI 文案要同步

引入 Recall 后需要同步：

- `src/tools/knowledge-base/ARCHITECTURE.md`
- Agent 工具描述。
- 设置页参数说明。
- Playground 引擎选择说明。
- Monitor trace 文案。
- Knowledge 资料库管理页和 Agent 工具描述。

---

## 8. 推荐结论

推荐方向：

```text
Recall 层: 旧 CAIU 数据迁移到思绪域，继续共用向量矩阵、标签池和 Recall engine。
Knowledge 层: 单开知识资料库，面向传统 RAG 文档、切片、BM25、出处和大规模资料。
存档语义: Recall 条目是无状态存档，不绑定 Agent、会话或消息；Agent 通过 binding、占位符和工具参数进行组合。
对外层: 从 engineId 思维升级为 retrievalMode 思维。
Recall 内部: semantic / associative 是召回 profile，不是产品级双库模式。
时间修饰: 非第一阶段必需能力；需要时仅在查询期按显式参数调制，不增加持久化生命周期。
标签与向量: 在 Recall 内对外合并，对内保留为不同信号线。
Lens / Blender: 作为 associative profile 的实现基础。
```

具体实施步骤不在本调查重复维护，统一见 [Recall / Knowledge 领域拆分与重构实施计划](./recall-knowledge-domain-restructure-implementation-plan.md)。
