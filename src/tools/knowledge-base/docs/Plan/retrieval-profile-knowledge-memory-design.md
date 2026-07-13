# Knowledge Base 检索模式与思绪引擎设计调查

**状态**: 调查完成，待决策  
**创建日期**: 2026-06-23  
**适用范围**: `src/tools/knowledge-base/`、`src-tauri/src/knowledge/`

---

## 0. 2026-07-01 修订决定

本轮修订改为更明确的双域设计：**Thought / 思绪** 与 **Knowledge / 知识**。此前文档里的“热记忆 / 冷知识库”只是过渡称呼，不再作为长期产品命名、API 枚举或数据库命名。

- **Thought / 思绪**：承载现有 CAIU 条目、标签、priority、refs/refBy、语义召回、联想召回和 thought engine。旧版 `knowledge/bases` 文件数据会在数据库化迁移时转换到该域。
- **Knowledge / 知识**：承载传统 RAG 资料，包括文档、手册、论文、网页、百科、代码资料包等，使用 document/chunk/source 结构，强调出处、切片和可引用性。
- `memory` / `coldKnowledge` 只作为旧配置或旧 API 的兼容 alias；新增类型、UI 文案和内部路由应使用 `thought` / `knowledge` / `mixed`。
- `semantic` 与 `thought` 不再代表两套库，而是 Thought 域内部的两个 preset；Knowledge 域走独立 document/chunk 检索通道。

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

---

## 3. 核心判断

### 3.1 Thought 域不再拆知识库 / 记忆库

推荐不要在现有 CAIU / Thought 体系内继续把“知识库”和“记忆库”拆成两套存储、两套向量、两套标签池。数据库化迁移时，应直接把旧 CAIU 数据归入 Thought / 思绪域。

建议保留同一套存储与索引基础设施：

```text
CAIU 条目
  ├── content
  ├── tags
  ├── priority
  ├── refs / refBy
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
- CAIU 条目是人工或AI整理后的语义单元，不应再被自动切片。自动 chunking 会破坏标签、priority、refs、思绪联想和人工维护的上下文边界。

### 3.2 传统知识检索应单开 Knowledge 域

如果需要面向 PDF、Markdown、网页、手册、百科、代码文档等传统 RAG 资料，建议新增独立的 Knowledge / 知识资料库通道，而不是继续在 Thought 思绪域中模拟“知识检索”。

```text
Thought / 思绪域
  数据: 人工整理的记忆、经验、项目判断、长期上下文
  单元: CAIU entry
  检索: semantic / thought 参数预设
  特征: 标签、priority、refs、思绪联想、上下文牵引
  禁止: 自动切片

Knowledge / 知识资料库
  数据: 文档、手册、论文、网页、百科、代码资料包
  单元: document + chunk
  检索: BM25 稀疏召回 + 向量稠密召回 + 图扩散 + rerank
  特征: 文件来源、章节路径、chunk 命中、可溯源引用
  支持: 自动切片
```

因此，原先的 `knowledge profile` / `memory profile` 不再建议作为产品级双模式。它们应被更明确地替换为 Thought 域内部的 `semantic` / `thought` preset，以及 Knowledge 域的 document/chunk 检索通道。

产品级模式应改为：

```text
thoughtSearch / 思绪召回
  访问 Thought 思绪域。
  允许语义召回、标签联想和 thought 共振。

knowledgeSearch / 知识检索
  访问 Knowledge 知识资料库。
  面向传统 RAG 文档召回、出处和切片。
```

### 3.3 标签和向量对外应合并，对内应保留

在 Thought 思绪域内，建议将“标签引擎”和“向量引擎”对外合并为一个思绪召回能力，对内继续保留为两条信号线。

对外不建议暴露：

```text
tag engine
vector engine
```

对外建议暴露：

```text
semantic / thought preset
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

### 3.4 Lens 与 Blender 建议合并为 Thought Engine

`lens` 和 `blender` 都服务于记忆库方向：

- `lens` 更强调标签空间折射、历史投射和语义扩散。
- `blender` 更强调多信号融合、残差挖掘和共振加权。

它们对用户而言不是两个稳定可理解的产品模式。建议合并为：

```text
engineId: thought
displayName: 思绪引擎
```

思绪引擎内部可包含几个阶段：

1. **意图发射**: 根据 query vector、raw query 和可选 history vectors 生成初始信号。
2. **内容验证**: 使用内容向量相似度提供主候选和防漂移约束。
3. **标签联想**: 通过 tag pool 最近邻、tag sea、IDF 和权重传播触发相关条目。
4. **残差挖掘**: 对查询向量做逐层投影，挖掘未被强标签解释的弱语义。
5. **共振融合**: 按 literal / semantic / associative 信号数量与强度计算最终分数。
6. **多样性与截断**: 在保证基本相关性的前提下，避免只返回同一簇结果。

### 3.5 普通相似度引擎不再承载传统知识库功能

建议让当前 `vector` 的演进版本承载 Thought 思绪域中的默认语义召回，而不是承载传统文档知识库功能。

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

短期可以保持 `engineId`，新增可选的 `retrievalMode` 和 Thought 内部 `thoughtPreset`：

```ts
type RetrievalMode = "thought" | "knowledge" | "mixed";
type ThoughtPreset = "semantic" | "thought";

interface SearchParams {
  query: string;
  kbIds?: string[];
  engineId?: string;
  retrievalMode?: RetrievalMode;
  thoughtPreset?: ThoughtPreset;
  knowledgeLibraryIds?: string[];
  limit?: number;
  minScore?: number;
}
```

解析优先级建议：

```text
retrievalMode
  > explicit knowledgeLibraryIds / kbIds 路由
  > explicit engineId
  > thoughtPreset mapped engine
  > workspace default thought preset
  > semantic fallback
```

长期建议外部默认指定 `retrievalMode`。`engineId` 仅保留给 Playground、调试和兼容旧配置。`thoughtPreset` 只调 Thought 域内部参数，不代表独立数据真源。

### 4.3 结果解释

不建议把 `matchType` 直接作为产品模式展示。建议拆成两层：

```ts
type RetrievalMode = "thought" | "knowledge" | "mixed";
type RetrievalSourceType = "thought" | "knowledge";

type MatchSignal =
  | "keyword"
  | "key"
  | "content_vector"
  | "tag_vector"
  | "knowledge_bm25"
  | "knowledge_vector"
  | "knowledge_graph"
  | "lens"
  | "thought"
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
  内容向量为主，标签向量为辅，承载 Thought 思绪域默认语义 preset。

thought
  合并 lens + blender。
  标签联想、历史投射、残差挖掘、多信号共振，承载 Thought 思绪域思绪 preset。
```

为了降低迁移成本，内部可以先保留旧 ID：

```text
vector  -> semantic alias
lens    -> thought compatibility mode 或 deprecated alias
blender -> thought compatibility mode 或 deprecated alias
```

### 5.2 Thought Engine 参数建议

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

## 6. 迁移路径

### Phase 1: 修契约和命名，不重写算法

目标是先减少当前引擎分歧造成的 bug。

建议修改：

- 新增统一 helper：根据 `RetrievalEngineInfo.requiresEmbedding` 判断是否需要查询向量，不再硬编码 `vector/lens/hybrid`。
- 修复 `blender` 在前端检索路径中没有生成 vector payload 的问题。
- 扩展 `SearchResult.matchType` 类型，至少覆盖 `tag_vector`、`lens`、`blender`。
- 在 UI 显示名上将 `vector` 从“向量检索”调整为“语义检索”。
- 在文档中声明标签和内容向量是 semantic engine 的内部信号。

### Phase 2: 引入 retrieval mode 与 Thought preset

建议新增：

```ts
retrievalMode?: "thought" | "knowledge" | "mixed";
thoughtPreset?: "semantic" | "thought";
```

映射关系：

```text
thought + semantic preset -> vector / semantic
thought + thought preset  -> thought
knowledge                 -> Knowledge 知识资料库检索通道
mixed                     -> Thought + Knowledge 双路召回后合并 / rerank
```

兼容策略：

- 如果调用方传了 `engineId`，继续尊重 `engineId`。
- 如果调用方没有传 `engineId` 但传了 `thoughtPreset`，按 preset 映射。
- 如果调用方传了 `retrievalMode = "knowledge"`，不进入 Thought 引擎，而是路由到 Knowledge 资料库。
- 如果调用方传了 `retrievalMode = "mixed"`，Thought 和 Knowledge 双路召回，结果必须保留 `sourceType` 后再合并。
- 旧配置中的 `defaultEngineId` 保留，后续可迁移为 `defaultThoughtPreset`。
- 旧 `retrievalMode = "memory"` 兼容映射到 `thought`；旧 `retrievalMode = "coldKnowledge"` 兼容映射到 `knowledge`，但不要在新 UI 和新文档中继续暴露。

### Phase 3: 合并 Lens / Blender 为 Thought

实现方式有两种：

方案 A：新增 `thought.rs`，复用 / 迁移 `lens.rs` 和 `blender.rs` 的核心函数。

优点：

- 语义清晰。
- 旧引擎可以保留为 alias 或 compatibility wrapper。
- 方便重新整理参数和日志。

缺点：

- 短期有重复代码。

方案 B：直接改造 `blender.rs` 为 `thought.rs`，把 lens 的折射阶段迁入。

优点：

- 最贴近当前“思绪引擎”雏形。
- 代码少一份。

缺点：

- 对旧 `blender` 行为影响较大，需要兼容层。

推荐方案 A，先新增再迁移，避免一次性破坏 Playground 和历史配置。

### Phase 4: 引入 Knowledge 产品层

- 普通搜索入口默认展示“思绪召回 / 知识检索”。
- 思绪召回内部可提供“语义 / 思绪”两个 preset，但不再表现为两套库。
- 知识检索新增独立资料库管理入口，支持导入文件夹、扫描、切片、重建、删除和查看来源。
- 切片功能只在 Knowledge 域出现，Thought 编辑器不提供自动切片。
- Playground 保留底层引擎选择，用于调参。
- Agent 工具描述从“检索引擎 keyword/vector”升级为“检索模式 thought/knowledge”，同时保留 `engineId` 高级参数。
- 监控页面将 trace step 从固定“向量召回”改为更通用的“检索召回”或按引擎返回阶段名。

---

## 7. 风险与注意事项

### 7.1 分数语义不同

`keyword`、`vector`、`lens`、`blender` 的分数归一化方式不同。合并对外模式时，不能假设所有 `score` 都有同一绝对含义。

建议：

- 对 Thought 语义 preset 维持更稳定的分数语义。
- 对 Thought 思绪 preset 将 `score` 解释为 activation / resonance，不直接等同事实相关性。
- 对 Knowledge 检索将 `score` 解释为 hybrid retrieval score，并优先展示来源、chunk 和 rerank 依据。
- UI 可以展示“相关度”与“触发依据”，而不是只展示一个精确百分比。

### 7.2 思绪 preset 容易漂移

Thought 思绪 preset 如果过度依赖标签扩散或历史投射，可能把弱相关内容注入 RAG 上下文。

建议：

- 思绪 preset 默认返回数量更少。
- 对最终候选增加内容向量验证。
- 对低分弱关联结果标记为“联想召回”，不要和高置信 Knowledge 片段混在一起。

### 7.3 Knowledge 不应污染 Thought

Knowledge 面向传统 RAG 文档召回，不应继承 CAIU / TagMemo 的 Thought 语义。

建议：

- Knowledge 不参与 Thought 标签池、tag sea、refs/refBy 和 priority 体系。
- Knowledge chunk 不写入 CAIU / Thought entry，也不反向成为 workspace.bases 的真源。
- Knowledge 可在最终回答阶段与 Thought 结果合并，但合并发生在检索路由 / rerank 层。
- Knowledge 结果必须带 `sourceType = "knowledge"`、库名、文件路径、chunkIndex 和可选章节信息。

### 7.4 旧配置兼容

已有配置、缓存 key、Agent 绑定和 Playground slot 可能保存旧 `engineId`。

2026-07-01 代码检查补充：

- 当前代码中尚未出现运行态 `retrievalMode`、`memoryPreset`、`coldKnowledgeIds` 等字段，相关命名主要仍停留在计划文档。
- 现有真实调用面主要是 `llm-chat` 的角色预设 / 上下文管线：
  - `{{kb}}` / `{{kb::name::limit}}` 宏会展开为 `【kb::...】` 占位符。
  - `KnowledgeProcessor` 扫描 `【kb】` / `【knowledge】`，解析为 `KbRetrievalRequest`，再调用 `resolvePlaceholderRetrieval`。
  - 占位符格式目前是 `【kb::kbName::limit::minScore::mode::modeParams::engineId】`。
- 因此兼容层不需要先行单独落地。后续 Thought / Knowledge 重构时，把 chat 角色预设配置、`knowledgeBaseConfig`、`knowledgeSettings` 和占位符解析一起迁移即可。
- 角色预设中的旧占位符只要符合现有可识别格式，就可以作为迁移输入统一转换；不符合格式的内容保留为普通文本或在导入/迁移报告中提示。

建议保留兼容映射：

```text
vector  -> semantic
lens    -> thought
blender -> thought
hybrid  -> semantic 或 knowledge，需按调用来源确认
memory  -> thought，仅兼容旧配置
coldKnowledge -> knowledge，仅兼容旧配置
```

缓存 key 中如果包含 `engineId`，迁移时应避免把旧缓存误命中新引擎。可以通过 `algorithmVersion` 或 engine alias 规范化策略隔离。

### 7.5 文档和 UI 文案要同步

如果代码中新增 `thought`，需要同步：

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
Thought 层: 旧 CAIU 数据迁移到思绪域，继续共用向量矩阵、标签池和 thought engine。
Knowledge 层: 单开知识资料库，面向传统 RAG 文档、切片、BM25、出处和大规模资料。
对外层: 从 engineId 思维升级为 retrievalMode 思维。
Thought 内部: semantic / thought 只是思绪 preset，不再是产品级双库模式。
标签与向量: 在 Thought 内对外合并，对内保留为不同信号线。
Lens / Blender: 合并为 thought preset 的实现基础，旧 ID 保留兼容。
```

优先实施顺序：

1. 修复前端向量引擎判断，改为使用 `requiresEmbedding` 或统一 helper。
2. 扩展 `matchType` 类型，修复当前前后端契约不一致。
3. 将 `vector` 的显示语义调整为“思绪语义召回”。
4. 引入 `retrievalMode: "thought" | "knowledge" | "mixed"` 与 `thoughtPreset: "semantic" | "thought"`。
5. 新增 Knowledge 通道，切片、文件扫描和传统文档召回只在该通道出现。
6. 新增 `thought` preset，并逐步吸收 `lens` / `blender`。

这条路线能先解决当前工程裂缝，又避免在 CAIU / Thought 内制造两套数据真源。传统知识检索需求交给 Knowledge 域，Thought 召回继续服务记忆、经验、判断和上下文联想。

