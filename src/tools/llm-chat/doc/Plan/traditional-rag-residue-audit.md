# 传统 RAG 残留全面审计报告

**状态**: Implementing
**日期**: 2025-05-18
**关联**: [knowledge-section-refactor-report.md](./knowledge-section-refactor-report.md)

---

## 摘要

经过全项目排查，传统 RAG 残留**不止** refactor-report 中列出的 4 个文件。残留分布在 **5 个代码文件** 和 **7 个文档文件** 中，涉及类型定义、处理器逻辑、UI 配置、搜索索引和用户文档。

---

## 1. 代码层残留（活代码，需要重构）

### 1.1. `knowledge-processor.ts`

**路径**: [`src/tools/llm-chat/core/context-processors/knowledge-processor.ts`](src/tools/llm-chat/core/context-processors/knowledge-processor.ts)

| 行号     | 残留内容                                                                             | 性质                                        |
| -------- | ------------------------------------------------------------------------------------ | ------------------------------------------- |
| L142     | `const aggregation = agentConfig.knowledgeSettings?.aggregation`                     | 读取已废弃的 aggregation 配置               |
| L160     | `agentConfig.knowledgeSettings?.embeddingModelId \|\| comboId`                       | Agent 级 Embedding 模型覆盖（应统一用全局） |
| L192-195 | `sessionCache.findSimilar(vector, aggregation.cacheSimilarityThreshold \|\| 0.95)`   | 向量相似度缓存查找（应移除）                |
| L214     | `if (aggregation?.enableCache)`                                                      | 缓存开关挂在 aggregation 下                 |
| L233-236 | `if (aggregation?.enableResultAggregation) { results = this.aggregateResults(...) }` | 历史结果聚合调用                            |
| L269     | `history.length > (aggregation?.maxHistoryTurns \|\| 10)`                            | 历史轮次上限控制                            |
| L436-444 | `buildContextQuery()` 整个方法                                                       | 只取 user 消息，不取完整轮次                |
| L484-490 | `computeWeightedVector()` 调用                                                       | 向量加权平均（Context Projection）          |
| L502-523 | `computeWeightedVector()` 方法体                                                     | 完整的加权平均实现                          |
| L528-560 | `aggregateResults()` 方法体                                                          | 完整的时间衰减聚合实现                      |

### 1.2. `knowledge-cache.ts`

**路径**: [`src/tools/llm-chat/core/context-utils/knowledge-cache.ts`](src/tools/llm-chat/core/context-utils/knowledge-cache.ts)

| 行号     | 残留内容                                 | 性质                         |
| -------- | ---------------------------------------- | ---------------------------- |
| L31-43   | `findSimilar(vector, threshold)` 方法    | 向量余弦相似度缓存匹配       |
| L68-78   | `cosineSimilarity(v1, v2)` 私有方法      | 为 findSimilar 服务          |
| L92      | `TurnRecord.queryVector?: number[]` 字段 | 仅用于 computeWeightedVector |
| L113     | `history: TurnRecord[]`                  | 存储历史轮次（聚合用）       |
| L139-148 | `getSessionHistory()` 函数               | 为聚合逻辑提供历史数据       |

> **注意**: `TurnRecord` 接口本身和 `getSessionHistory()` 在移除聚合后仍有保留价值（用于调试/监控），但 `queryVector` 字段可以移除。

### 1.3. `agent.ts` (类型定义)

**路径**: [`src/tools/llm-chat/types/agent.ts`](src/tools/llm-chat/types/agent.ts:249)

| 行号     | 残留内容                                                                                                                                    | 性质                                    |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| L249-250 | `embeddingModelId?: string`                                                                                                                 | Agent 级 Embedding 模型（应统一用全局） |
| L261-277 | `aggregation?: { contextWindow, queryDecay, enableCache, cacheSimilarityThreshold, enableResultAggregation, resultDecay, maxHistoryTurns }` | 整个 aggregation 子对象                 |

### 1.4. `KnowledgeSection.vue` (UI)

**路径**: [`src/tools/llm-chat/components/agent/agent-editor/sections/KnowledgeSection.vue`](src/tools/llm-chat/components/agent/agent-editor/sections/KnowledgeSection.vue)

| 行号     | 残留内容                                                               | 性质                                 |
| -------- | ---------------------------------------------------------------------- | ------------------------------------ |
| L45      | `embeddingModelId: ""` 默认值                                          | Agent 级模型配置                     |
| L48-57   | `aggregation: { ... }` 完整默认值                                      | 6 个传统 RAG 参数                    |
| L60-69   | `aggregation` 初始化逻辑                                               | 确保 aggregation 存在                |
| L208-209 | `LlmModelSelector` + `modelPath: "knowledgeSettings.embeddingModelId"` | Embedding 模型选择器 UI              |
| L260-261 | `modelPath: "knowledgeSettings.aggregation.contextWindow"`             | 上下文窗口（路径错误，应提升到顶层） |
| L274-276 | `modelPath: "knowledgeSettings.aggregation.enableCache"`               | 缓存开关（路径错误）                 |
| L286-288 | `cacheSimilarityThreshold` 设置项                                      | 应移除                               |
| L299-301 | `queryDecay` 设置项                                                    | 应移除                               |
| L313-317 | `enableResultAggregation` 设置项 + groupCollapsible                    | 应移除                               |
| L325-327 | `resultDecay` 设置项                                                   | 应移除                               |
| L338-340 | `maxHistoryTurns` 设置项                                               | 应移除                               |

### 1.5. `agentEditConfig.ts` (搜索索引)

**路径**: [`src/tools/llm-chat/components/agent/agent-editor/agentEditConfig.ts`](src/tools/llm-chat/components/agent/agent-editor/agentEditConfig.ts:55)

| 行号   | 残留内容                                                     | 性质                       |
| ------ | ------------------------------------------------------------ | -------------------------- |
| L55    | `{ id: "kbEnableCache", ... }`                               | 缓存搜索条目（路径需更新） |
| L57-60 | `{ id: "kbCacheThreshold", label: "缓存相似度阈值" }`        | 应移除                     |
| L61    | `{ id: "kbQueryDecay", label: "查询衰减因子" }`              | 应移除                     |
| L63-66 | `{ id: "kbEnableResultAggregation", label: "启用结果聚合" }` | 应移除                     |
| L67    | `{ id: "kbResultDecay", label: "结果衰减因子" }`             | 应移除                     |
| L68    | `{ id: "kbMaxHistoryTurns", label: "最大聚合轮次" }`         | 应移除                     |

---

## 2. 文档层残留（描述过时，需要更新）

### 2.1. 内部架构文档

| 文件                                                                           | 行号     | 过时描述                                             |
| ------------------------------------------------------------------------------ | -------- | ---------------------------------------------------- |
| [`src/tools/llm-chat/ARCHITECTURE.md`](src/tools/llm-chat/ARCHITECTURE.md:189) | L189     | "向量相似度匹配"                                     |
| 同上                                                                           | L190-193 | "结果聚合与衰减"、"向量投影"、"时间衰减"、"多轮聚合" |

### 2.2. 用户文档

| 文件                                                                                                                                                  | 行号   | 过时描述                                                        | 严重程度 |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------------------------------------------------------------- | -------- |
| [`docs/user-guide/tools/knowledge-base/agent-integration.md`](docs/user-guide/tools/knowledge-base/agent-integration.md:76)                           | L76    | "将最近 3 轮的对话向量进行加权聚合（Context Projection）"       | 🔴 高    |
| 同上                                                                                                                                                  | L78    | "利用时间衰减算法对结果进行重排序"                              | 🔴 高    |
| 同上                                                                                                                                                  | L88-89 | 参数表中的"查询衰减"和"结果聚合"                                | 🔴 高    |
| [`docs/user-guide/tools/llm-chat/context-pipeline/knowledge-processor.md`](docs/user-guide/tools/llm-chat/context-pipeline/knowledge-processor.md:22) | L22    | "Embedding 模型: 必须指定一个有效的 Embedding 模型"             | 🟡 中    |
| 同上                                                                                                                                                  | L31    | "查询衰减与聚合"                                                | 🔴 高    |
| [`docs/user-guide/tools/llm-chat/settings/context-pipeline.md`](docs/user-guide/tools/llm-chat/settings/context-pipeline.md:155)                      | L155   | "向量余弦相似度的双重缓存"                                      | 🔴 高    |
| 同上                                                                                                                                                  | L156   | "历史结果聚合：支持时间衰减加权"                                | 🔴 高    |
| 同上                                                                                                                                                  | L160   | "聚合策略"                                                      | 🟡 中    |
| [`docs/user-guide/tools/llm-chat/agents/parameters.md`](docs/user-guide/tools/llm-chat/agents/parameters.md:34)                                       | L34    | "Embedding 模型: 指定用于计算向量相似度的模型"（暗示 Agent 级） | 🟡 中    |

### 2.3. 不算残留但需注意的

| 文件                                                                                                         | 说明                                                                                                                |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| [`src/tools/knowledge-base/ARCHITECTURE.md`](src/tools/knowledge-base/ARCHITECTURE.md:28) L28                | Lens 引擎的 `history_vectors` 是**后端引擎自身的特性**（Rust 实现），不是前端聚合逻辑。这是合理的设计，不需要移除。 |
| [`docs/architecture/embedding-infrastructure.md`](docs/architecture/embedding-infrastructure.md:7) L7        | "为 RAG 和语义搜索提供统一的向量生成接口"——这是基础设施的正确定位，不算残留。                                       |
| [`docs/user-guide/tools/embedding-playground.md`](docs/user-guide/tools/embedding-playground.md)             | "RAG 检索模拟"——这是 playground 的合法功能，不算残留。                                                              |
| [`src/tools/llm-chat/macro-engine/macros/knowledge.ts`](src/tools/llm-chat/macro-engine/macros/knowledge.ts) | 宏引擎本身没有传统 RAG 残留，逻辑干净。                                                                             |

---

## 3. 影响范围总结

```
传统 RAG 残留分布图:

┌─────────────────────────────────────────────────────────────┐
│  代码层 (5 文件)                                             │
│                                                             │
│  types/agent.ts ──────► embeddingModelId + aggregation{}    │
│       │                                                     │
│       ▼                                                     │
│  KnowledgeSection.vue ──► 7 个 UI 设置项 + 默认值初始化     │
│       │                                                     │
│       ▼                                                     │
│  agentEditConfig.ts ──► 5 个搜索索引条目                    │
│       │                                                     │
│       ▼                                                     │
│  knowledge-processor.ts ──► aggregateResults()              │
│       │                      computeWeightedVector()        │
│       │                      findSimilar() 调用             │
│       │                      buildContextQuery() (仅user)   │
│       ▼                                                     │
│  knowledge-cache.ts ──► findSimilar() + cosineSimilarity()  │
│                          TurnRecord.queryVector              │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  文档层 (7 文件)                                             │
│                                                             │
│  ARCHITECTURE.md (llm-chat) ──► "结果聚合与衰减" 段落       │
│  agent-integration.md ──► RAG Pipeline 流程描述 + 参数表    │
│  knowledge-processor.md ──► "查询衰减与聚合" + Agent模型    │
│  context-pipeline.md (settings) ──► "双重缓存" + "聚合"     │
│  parameters.md ──► Agent 级 Embedding 模型描述              │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. 清理优先级建议

| 优先级 | 范围                                              | 理由                                     |
| ------ | ------------------------------------------------- | ---------------------------------------- |
| P0     | `knowledge-processor.ts` 中的聚合/衰减逻辑        | 活代码，每次检索都在执行无意义的聚合计算 |
| P0     | `types/agent.ts` 的 `aggregation` 子对象          | 类型定义是所有下游的源头                 |
| P1     | `KnowledgeSection.vue` 的 UI 设置项               | 用户可见的无效配置，造成困惑             |
| P1     | `knowledge-processor.ts` 的 `buildContextQuery()` | 查询策略需要对齐 VCP（取完整轮次）       |
| P1     | `embeddingModelId` Agent 级覆盖                   | 简化配置层级                             |
| P2     | `knowledge-cache.ts` 的 `findSimilar()`           | 标记 deprecated 或直接移除               |
| P2     | `agentEditConfig.ts` 搜索索引                     | 跟随 UI 变更同步清理                     |
| P3     | 用户文档更新                                      | 代码重构完成后统一更新                   |
| P3     | `ARCHITECTURE.md` 更新                            | 同上                                     |

---

## 5. 与 refactor-report 的差异

refactor-report 已覆盖的：

- ✅ `knowledge-processor.ts` 的核心逻辑变更
- ✅ `knowledge-cache.ts` 的 `findSimilar()` 标记
- ✅ `types/agent.ts` 的类型重构
- ✅ `KnowledgeSection.vue` 的 UI 精简

refactor-report **未覆盖**的（本次审计新发现）：

- ❌ `agentEditConfig.ts` 的搜索索引条目清理
- ❌ `src/tools/llm-chat/ARCHITECTURE.md` 的描述更新
- ❌ `docs/user-guide/tools/knowledge-base/agent-integration.md` 的 RAG Pipeline 描述
- ❌ `docs/user-guide/tools/llm-chat/context-pipeline/knowledge-processor.md` 的过时描述
- ❌ `docs/user-guide/tools/llm-chat/settings/context-pipeline.md` 的"双重缓存"和"聚合"描述
- ❌ `docs/user-guide/tools/llm-chat/agents/parameters.md` 的 Agent 级模型描述
- ❌ `knowledge-cache.ts` 中 `getSessionHistory()` 和 `TurnRecord` 的角色重新定义

---

## 6. 结论

传统 RAG 残留总计涉及 **12 个文件**（5 代码 + 7 文档），其中：

- **活代码残留**: 约 150 行需要移除/重写
- **UI 配置残留**: 6 个设置项需要移除，2 个需要路径迁移
- **文档残留**: 约 15 处描述需要更新

建议将 `agentEditConfig.ts` 和所有文档更新纳入 refactor-report 的影响范围，确保一次性清理干净。
