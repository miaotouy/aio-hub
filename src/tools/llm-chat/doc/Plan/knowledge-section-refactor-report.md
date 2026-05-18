# KnowledgeSection 重构方案：精简记忆系统配置

**状态**: Implementing
**日期**: 2025-05-18
**参考**: VCP 6.2+ 记忆管理系统（RAGDiaryPlugin）
**涉及文件**:

- `src/tools/llm-chat/components/agent/agent-editor/sections/KnowledgeSection.vue`
- `src/tools/llm-chat/types/agent.ts` (`AgentKnowledgeSettings`)
- `src/tools/llm-chat/core/context-processors/knowledge-processor.ts`
- `src/tools/llm-chat/core/context-utils/knowledge-cache.ts`

---

## 1. 问题诊断

当前 `KnowledgeSection.vue` 的高级设置混合了两种截然不同的设计思路，导致 UI 臃肿且语义混乱：

| 维度     | 传统 RAG 知识库（当前 UI 的刻板印象） | 本项目实际定位（记忆系统）                | VCP 参考                           |
| -------- | ------------------------------------- | ----------------------------------------- | ---------------------------------- |
| 数据来源 | 扔文档进去，自动按大小切片            | 用户手动创建 CAIU 条目                    | 用户/AI 手动写日记条目             |
| 检索触发 | 每次对话自动检索                      | 标签门控 / 关键词触发 / 静态加载          | 相似度阈值门控 / 楼层门控 / 无条件 |
| 核心单元 | 文档片段 (chunk)                      | 原子知识单元 (CAIU: key + content + tags) | 日记条目 (.txt/.md)                |
| 召回数量 | 固定 TopK                             | 上限 + 分数截断                           | 动态 K 值 + Truncate 硬截断        |
| 结果处理 | 多轮聚合、衰减加权                    | 每次独立检索                              | 每次独立检索，无历史混入           |
| 模型配置 | 每个 Agent 单独配                     | 全局统一                                  | 全局统一                           |
| 缓存策略 | 向量相似度阈值匹配                    | 精确文本匹配                              | 精确匹配 + TTL 过期                |

**结论**: 项目的知识库模块是**条目式记忆系统**，不是文档分片 RAG。但 Agent 编辑器的设置 UI 按传统 RAG 的刻板印象堆了一堆不适用的配置。

---

## 1.1 设计理念对照

| 设计理念                              | 我们的对应                              | 状态                  |
| ------------------------------------- | --------------------------------------- | --------------------- |
| `[[日记本]]` 无条件 RAG 检索          | `mode: "always"`                        | ✅ 已有               |
| `《《日记本》》` 相似度阈值门控 + RAG | `mode: "gate"` (关键词门控)             | ✅ 已有，可扩展       |
| `{{日记本}}` 全文注入                 | `mode: "static"` + `all`                | ✅ 已有               |
| `::RoleValve` 楼层门控                | `mode: "turn"` (轮次门控)               | ✅ 已有               |
| `::Truncate` 硬性分数截断             | `defaultMinScore`                       | ✅ 已有，需强调       |
| 动态 K 值（话题复杂度决定）           | `defaultLimit` 作为上限                 | ⚠️ 语义需调整         |
| 全局 Embedding 模型                   | `WorkspaceConfig.defaultEmbeddingModel` | ⚠️ Agent 级重复了     |
| 精确匹配缓存 + TTL                    | `findByText()`                          | ⚠️ 多了向量相似度缓存 |
| 无历史结果聚合                        | —                                       | ❌ 当前多了聚合逻辑   |
| `::TagMemo` 语义组增强                | 知识库的 Tag 系统                       | ✅ 已有基础           |
| `::Rerank` 精排                       | 未来可扩展                              | 📋 规划中             |

---

## 2. 逐项分析

### 2.1 应该移除的设置

| 设置项                                          | 当前位置           | 移除原因                                                                                                                                         |
| ----------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Embedding 模型** (`embeddingModelId`)         | Agent 级别         | 知识库全局已有 `WorkspaceConfig.defaultEmbeddingModel`，每个 Agent 再配一个既占空间又造成混乱。应统一使用全局配置。                              |
| **缓存相似度阈值** (`cacheSimilarityThreshold`) | aggregation 子对象 | 缓存命中应该是**完全一致**才命中（精确文本匹配），不需要向量相似度阈值。当前 `findByText()` 已经实现了精确匹配，`findSimilar()` 是多余的复杂度。 |
| **启用结果聚合** (`enableResultAggregation`)    | aggregation 子对象 | 对记忆系统来说，每次检索是独立的。把历史轮次的结果按衰减混进来没有实际意义——用户手动编写的条目不会因为"上一轮也被召回"就变得更相关。             |
| **结果衰减因子** (`resultDecay`)                | aggregation 子对象 | 随结果聚合一起移除。                                                                                                                             |
| **最大聚合轮次** (`maxHistoryTurns`)            | aggregation 子对象 | 随结果聚合一起移除。                                                                                                                             |
| **查询衰减因子** (`queryDecay`)                 | aggregation 子对象 | 向量加权平均（将历史查询向量混入当前查询）是传统多轮 RAG 的做法。对于记忆系统，当前用户消息就是查询本身，不需要历史向量污染。                    |

### 2.2 应该保留并调整的设置

| 设置项                               | 调整内容                                                                                                                              |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| **默认检索引擎** (`defaultEngineId`) | 保留，无需改动                                                                                                                        |
| **默认召回数量** (`defaultLimit`)    | 语义调整：改为"召回上限"。明确这是一个**上限**，实际截断以 `minScore` 为主要依据。即使 limit=50，只有 3 条超过分数阈值就只返回 3 条。 |
| **默认最低分数** (`defaultMinScore`) | 保留，这是**实际截断依据**。应在 UI 中强调其重要性。                                                                                  |
| **召回字数上限** (`maxRecallChars`)  | 保留                                                                                                                                  |
| **结果模板** (`resultTemplate`)      | 保留                                                                                                                                  |
| **门控扫描深度** (`gateScanDepth`)   | 保留                                                                                                                                  |
| **上下文窗口** (`contextWindow`)     | ⚠️ **语义重大调整**：从"取最近 N 条用户消息"改为"取最近 N 轮完整对话"。详见 §2.4                                                      |
| **启用检索缓存** (`enableCache`)     | 保留，但简化逻辑：只做精确文本匹配，移除向量相似度匹配                                                                                |
| **空结果提示** (`emptyText`)         | 保留                                                                                                                                  |

### 2.4 查询构建策略的根本性改变（向量空间融合）

**当前实现** (`buildContextQuery()`, knowledge-processor.ts:430-479):

```typescript
// 拼接 [User]: xxx\n[AI]: xxx\n[Tool]: xxx 字符串，整体送入 embedding
private buildContextQuery(context: PipelineContext): string {
  // ... 按轮提取，拼接为带角色标记的文本
  return rounds.join("\n\n");
}
```

**新策略**（向量空间融合）：

**不在文本层面拼接角色标记**。策略是**向量空间融合**：

```javascript
// 1. 分别提取
userContent = this._extractTextFromContent(lastUserMessage.content);
aiContent = this._extractTextFromContent(lastAiMessage.content);

// 2. 分别净化（按角色定制）
userContent = this.sanitizeForEmbedding(userContent, "user"); // → 去系统通知 + HTML + Emoji + 工具标记
aiContent = this.sanitizeForEmbedding(aiContent, "assistant"); // → 去 HTML + Emoji + 工具标记

// 3. 分别向量化
const [userVector, aiVector] = await Promise.all([
  this.getSingleEmbeddingCached(userContent),
  this.getSingleEmbeddingCached(aiContent),
]);

// 4. 在向量空间加权平均（默认 user 0.7 : AI 0.3）
const queryVector = this._getWeightedAverageVector([userVector, aiVector], [0.7, 0.3]);
```

而 `[AI]: ${aiContent}\n[User]: ${userContent}` 这个带角色标记的拼接**只用于日志显示**，从未送入 Embedding API。

**为什么这样做**:

1. **零噪音**: Embedding 输入是纯净的自然语言，没有 `[User]:` 这种人造标记污染向量空间
2. **可控权重**: User 意图占 70%，AI 上下文占 30%，精确控制语义贡献度
3. **角色定制净化**: User 消息去系统通知，AI 消息去工具调用标记，互不干扰
4. **空消息容错**: 如果 user 为空（只发图片），仅用 AI 向量；如果 AI 为空（首轮），仅用 user 向量
5. **长度天然受控**: 分别 embed 意味着每个输入都是单条消息长度，不会超出模型 token 限制

**对比两种方案**:

| 维度     | 文本拼接（当前）     | 向量空间融合（目标）      |
| -------- | -------------------- | ------------------------- |
| 角色标记 | 会被 embed 进去      | 不存在于 embedding 输入中 |
| 权重控制 | 无（文本等权拼接）   | 可配置（默认 0.7:0.3）    |
| 净化策略 | 统一管线             | 按角色定制                |
| API 调用 | 1 次                 | 2 次（可并行）            |
| 长度风险 | AI 回复过长可能超限  | 天然受控                  |
| 缓存命中 | 基于拼接文本精确匹配 | 基于 user+AI 文本组合匹配 |

**对 `contextWindow` 语义的影响**:

| 维度   | 当前实现              | 重构后                    |
| ------ | --------------------- | ------------------------- |
| 单位   | "条用户消息"          | "轮完整对话"              |
| 默认值 | 1（最后一条用户消息） | 1（最后一轮 User+AI）     |
| 内容   | 仅用户文本            | 用户 + AI回复（分别处理） |
| 融合   | 文本拼接              | 向量空间加权平均          |

**对缓存策略的影响**:

缓存 key 改为基于 `userText + aiText` 的组合哈希。核心价值不变：

- **同一轮内多个占位符**仍然可以共享缓存（一个 Agent 绑定多个知识库时，user+AI 文本相同）
- **重试 (Regenerate) 场景**：用户重试时，user 文本不变 + 上一轮 AI 回复不变，直接命中缓存
- 向量相似度缓存的价值因此降低（每轮查询足够独特），进一步验证了移除它的合理性

**重构方案**:

```typescript
/**
 * 上下文查询部件：分别提取最近 N 轮的 user 和 assistant 文本
 */
interface ContextQueryParts {
  /** 用户消息文本（已净化，用于 embedding） */
  userText: string;
  /** AI 回复文本（已净化，用于 embedding） */
  aiText: string;
  /** 合并文本（仅用于日志显示和 Tag 提取，不送入 embedding） */
  combinedForDisplay: string;
}

/**
 * 提取上下文查询部件
 * 取最近 N 轮对话，分别收集 user 和 assistant 文本
 */
private extractContextParts(context: PipelineContext): ContextQueryParts {
  const { messages, agentConfig } = context;
  const windowSize = agentConfig.knowledgeSettings?.contextWindow ?? 1;

  const userParts: string[] = [];
  const aiParts: string[] = [];
  let i = messages.length - 1;
  let roundCount = 0;

  while (i >= 0 && roundCount < windowSize) {
    // 向前找到一条 user 消息
    while (i >= 0 && messages[i].role !== "user") {
      i--;
    }
    if (i < 0) break;

    const userIdx = i;

    // 收集 user 消息
    const userContent = messages[userIdx].content;
    if (typeof userContent === "string" && userContent.trim()) {
      userParts.unshift(userContent.trim());
    }

    // 收集紧随其后的 assistant 消息
    for (let j = userIdx + 1; j < messages.length; j++) {
      const msg = messages[j];
      if (msg.role === "user") break;
      if (typeof msg.content !== "string") continue;

      if (msg.role === "assistant" && msg.content.trim()) {
        aiParts.unshift(msg.content.trim());
      }
      // tool 消息的语义贡献较低，暂不纳入
    }

    roundCount++;
    i = userIdx - 1;
  }

  const userText = userParts.join("\n");
  const aiText = aiParts.join("\n");
  const combinedForDisplay = aiText
    ? `[User]: ${userText}\n[AI]: ${aiText}`
    : userText;

  return { userText, aiText, combinedForDisplay };
}

/**
 * 构建上下文查询向量（向量空间融合策略）
 * 分别 embed user 和 AI 文本，然后加权平均
 */
private async buildContextQueryVector(
  context: PipelineContext,
  effectiveComboId: string | undefined,
): Promise<{ vector: number[] | null; userText: string; aiText: string; combinedForDisplay: string }> {
  const parts = this.extractContextParts(context);

  // 分别通过 preprocessQuery 净化（主要用于 Tag 提取和停用词过滤）
  const kbStore = useKnowledgeBaseStore();
  const tagPool = kbStore.globalStats.allDiscoveredTags;

  const userProcessed = preprocessQuery(parts.userText, { tagPool });
  const aiProcessed = parts.aiText
    ? preprocessQuery(parts.aiText, { tagPool, enableTagMatching: false }) // AI 文本不做 Tag 匹配，避免噪音
    : { cleanedQuery: "", tokens: [], matchedTags: [] };

  // 合并 Tag 匹配结果（仅来自 user 文本）
  const matchedTags = userProcessed.matchedTags;

  // 分别向量化（并行）
  const [userVector, aiVector] = await Promise.all([
    userProcessed.cleanedQuery
      ? this.embedText(userProcessed.cleanedQuery, effectiveComboId)
      : Promise.resolve(null),
    aiProcessed.cleanedQuery
      ? this.embedText(aiProcessed.cleanedQuery, effectiveComboId)
      : Promise.resolve(null),
  ]);

   // 向量空间加权平均（默认 user 0.7, AI 0.3）
  let finalVector: number[] | null = null;
  if (userVector && aiVector) {
    const weights = [0.7, 0.3]; // TODO: 可配置化
    finalVector = this.weightedAverageVector([userVector, aiVector], weights);
  } else {
    finalVector = userVector || aiVector;
  }

  return {
    vector: finalVector,
    userText: userProcessed.cleanedQuery,
    aiText: aiProcessed.cleanedQuery,
    combinedForDisplay: parts.combinedForDisplay,
  };
}

/**
 * 加权平均向量计算
 */
private weightedAverageVector(vectors: number[][], weights: number[]): number[] {
  const dim = vectors[0].length;
  const result = new Array(dim).fill(0);
  let weightSum = 0;

  for (let i = 0; i < vectors.length; i++) {
    if (!vectors[i]) continue;
    const w = weights[i] || 0;
    weightSum += w;
    for (let j = 0; j < dim; j++) {
      result[j] += vectors[i][j] * w;
    }
  }

  if (weightSum === 0) return vectors[0];
  for (let j = 0; j < dim; j++) {
    result[j] /= weightSum;
  }
  return result;
}

/**
 * 单文本向量化（封装 vectorCacheManager）
 */
private async embedText(text: string, effectiveComboId: string | undefined): Promise<number[] | null> {
  if (!text || !effectiveComboId) return null;
  const profileId = getProfileId(effectiveComboId);
  const pureModelId = getPureModelId(effectiveComboId);
  if (!profileId || !pureModelId) return null;

  const { getProfileById } = useLlmProfiles();
  const profile = getProfileById(profileId);
  if (!profile) return null;

  return vectorCacheManager.getVector(text, profile, pureModelId);
}
```

---

### 2.3 处理器逻辑需要同步调整

`knowledge-processor.ts` 中的以下逻辑需要配合清理：

1. **`buildContextVector()`** 中的加权平均逻辑（`computeWeightedVector`）→ 移除 decay 加权，直接返回当前查询向量
2. **`aggregateResults()`** → 整个方法移除
3. **缓存查找** 中的 `findSimilar()` 调用 → 移除，只保留 `findByText()`
4. **`knowledge-cache.ts`** 中的 `findSimilar()` 方法 → 可保留但不再被调用（或标记为 deprecated）

---

## 3. 重构后的 `AgentKnowledgeSettings` 类型

```typescript
export interface AgentKnowledgeSettings {
  /** 默认检索引擎 ID (vector | keyword | blender) */
  defaultEngineId?: string;

  /**
   * 召回上限 (1-50)
   * 这是一个上限，实际截断以 minScore 为准。
   * 即使设为 50，如果只有 3 条超过分数阈值，就只返回 3 条。
   */
  defaultLimit?: number;

  /** 召回总字数上限 (0表示不限制) */
  maxRecallChars?: number;

  /**
   * 最低相关度分数 (0.0-1.0)
   * 低于此分数的条目直接丢弃，不会被召回。
   * 这是实际的截断依据，比 limit 更重要。
   */
  defaultMinScore?: number;

  /** 检索结果的格式化模板 */
  resultTemplate?: string;

  /** 无结果时的占位文本 */
  emptyText?: string;

  /** 标签门控 (gate) 模式默认扫描消息深度 */
  gateScanDepth?: number;

  /**
   * 查询上下文窗口（轮数）
   * 取最近 N 轮完整对话（User + AI + Tool）组合为检索查询。
   * 不是仅取用户消息，而是取完整一轮交互。
   */
  contextWindow?: number;

  /**
   * 是否启用检索结果缓存
   * 缓存策略：精确文本匹配，完全一致才命中。
   */
  enableCache?: boolean;
}
```

对比当前类型，移除了：

- `embeddingModelId` → 使用知识库全局配置
- `aggregation` 整个子对象 → 拍平 `contextWindow` 和 `enableCache` 到顶层，其余删除

---

## 4. 重构后的 UI 设置项（精简版）

高级设置从当前的 **15 项** 精简为 **9 项**：

1. 默认检索引擎
2. 召回上限（语义调整）
3. 最低分数阈值（强调为主要截断依据）
4. 召回字数上限
5. 门控扫描深度
6. 上下文窗口
7. 启用检索缓存
8. 结果模板
9. 空结果提示

---

## 5. 迁移策略

由于 `AgentKnowledgeSettings` 是持久化到用户配置文件中的，需要做数据迁移：

1. 读取旧配置时，将 `aggregation.contextWindow` 提升到顶层 `contextWindow`
2. 将 `aggregation.enableCache` 提升到顶层 `enableCache`
3. 忽略 `embeddingModelId`、`aggregation.queryDecay`、`aggregation.cacheSimilarityThreshold`、`aggregation.enableResultAggregation`、`aggregation.resultDecay`、`aggregation.maxHistoryTurns`
4. 在 `ensureConfig()` 或 Agent 加载时做兼容处理

---

## 6. 影响范围

- **UI**: `KnowledgeSection.vue` 的 `knowledgeAdvancedSettings` computed 需要重写
- **类型**: `AgentKnowledgeSettings` 接口需要重构
- **处理器**: `knowledge-processor.ts` 需要：
  - **重写 `buildContextQuery()`**：从"仅取用户消息"改为"取最近 N 轮完整对话（User + AI + Tool）"
  - 移除聚合和向量衰减逻辑（`aggregateResults()`, `computeWeightedVector()`）
  - 简化缓存查找（移除 `findSimilar()` 调用，只保留 `findByText()`）
- **缓存**: `knowledge-cache.ts` 的 `findSimilar()` 不再被调用（保留方法但标记 deprecated）
- **迁移**: 需要在 Agent 加载时做旧数据兼容

---

## 7. 处理器逻辑调整详情

### 7.1 `knowledge-processor.ts` 变更

#### 7.1.1 查询构建重写：从文本拼接改为向量空间融合（核心变更）

**移除**:

- `buildContextQuery()` 方法（文本拼接 `[User]: xxx\n[AI]: xxx`）
- `buildContextVector()` 方法（单文本整体 embed）

**新增**:

- `extractContextParts()` — 分别提取 user/AI 文本
- `buildContextQueryVector()` — 分别 embed + 加权平均
- `weightedAverageVector()` — 向量加权平均工具方法
- `embedText()` — 单文本向量化封装

**execute() 主流程变更**:

```diff
  // 旧流程：文本拼接 → 统一 embed
- const rawQuery = this.buildContextQuery(context);
- const { cleanedQuery, matchedTags } = preprocessQuery(rawQuery, { tagPool });
- queryText = cleanedQuery;
- if (isVectorNeeded) {
-   vector = await this.buildContextVector(queryText, effectiveComboId);
- }

  // 新流程：分别提取 → 分别净化 → 分别 embed → 加权平均
+ const { vector: queryVector, userText, aiText, combinedForDisplay, matchedTags } =
+   await this.buildContextQueryVector(context, effectiveComboId);
+ vector = queryVector;
+ queryText = userText; // 缓存 key 和关键词检索仍基于 user 文本
```

**缓存 key 变更**:

```diff
  // 旧：基于拼接后的 rawQuery
- cached = enableCache ? sessionCache.findByText(rawQuery) : null;

  // 新：基于 user + AI 文本组合
+ const cacheKey = `${userText}|||${aiText}`;
+ cached = enableCache ? sessionCache.findByText(cacheKey) : null;
```

#### 7.1.2 聚合与衰减逻辑移除

```diff
- // 4. 历史结果聚合
- if (aggregation?.enableResultAggregation) {
-   results = this.aggregateResults(results, history, aggregation);
- }
+ // 聚合逻辑已移除：每次检索独立，不混入历史结果
```

```diff
  // buildContextVector 整个方法移除（被 buildContextQueryVector 替代）
- private async buildContextVector(...) { ... }
```

#### 7.1.3 缓存查找简化

```diff
  // 缓存查找：移除向量相似度匹配
- cached = aggregation?.enableCache && vector
-   ? sessionCache.findSimilar(vector, aggregation.cacheSimilarityThreshold || 0.95)
-   : null;
+ // 只保留精确文本匹配缓存（已在前面的 findByText 中处理）
```

**缓存核心价值（精确匹配仍然有效的场景）**:

1. **同一轮多占位符**: Agent 绑定了 3 个知识库，每个占位符的 user+AI 文本相同，第 2、3 次直接命中缓存
2. **重试 (Regenerate)**: 用户点击重试时，或者换模型回复，user 文本 + 上一轮 AI 回复都没变，直接命中缓存，省去向量化和检索开销

### 7.2 `knowledge-cache.ts` 变更

- `findSimilar()` 方法保留但标记 `@deprecated`，不再被处理器调用
- `cosineSimilarity()` 同上

### 7.3 检索逻辑保持不变的部分

以下逻辑保持不变：

- 占位符扫描和解析
- 激活模式判断（always / gate / turn / static）
- 查询预处理（清洗、分词、Tag 匹配）
- 向量化和检索调用
- 分数过滤（minScore）
- 字数限制过滤
- 结果格式化和注入
- 自动注入（保底注入）逻辑

---

## 8. 未来可扩展方向（参考 VCP）

以下功能不在本次重构范围内，但记录为未来方向：

| 功能          | VCP 对应                | 优先级                         |
| ------------- | ----------------------- | ------------------------------ |
| Rerank 精排   | `::Rerank`              | 中                             |
| 时间感知检索  | `::Time` 时间跨度拟合   | 中                             |
| 语义组增强    | `::Group` / `::TagMemo` | 低（已有 Tag 系统基础）        |
| 动态 K 值     | 基于话题复杂度自动调整  | 低                             |
| 父文档展开    | `::Expand`              | 低（我们的条目本身就是完整的） |
| 缓存 TTL 过期 | 带 TTL 的 LRU 缓存      | 低                             |
