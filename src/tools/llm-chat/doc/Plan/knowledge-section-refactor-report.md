# KnowledgeSection 重构方案：对齐记忆系统定位

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

## 1.1 VCP 设计理念对照

VCP 的记忆系统验证了我们的方向：

| VCP 设计                              | 我们的对应                              | 状态                  |
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

### 2.4 查询构建策略的根本性改变（对齐 VCP）

**当前实现** (`buildContextQuery()`, knowledge-processor.ts:436-444):

```typescript
// 只取 user 角色的消息
const userMessages = messages.filter((m) => m.role === "user" && typeof m.content === "string");
const recent = userMessages.slice(-windowSize);
return recent.map((m) => m.content).join("\n");
```

**VCP 的实际做法**（从 RAG_RETRIEVAL_DETAILS 日志确认）:

VCP 将最新一轮完整对话（User + AI + Tool）清洗组合后作为查询文本，格式为：

```
[User]: {用户消息}
[AI]: {AI 完整回复（含意图分析、策略、正文）}
[Tool]: {工具调用结果}
```

**为什么 VCP 这样做**:

1. **语义丰富度**: AI 的回复通常包含对用户意图的解读、关键词提取、话题分析等，这些信息能极大提升检索精准度
2. **空消息容错**: 如果用户只发了图片（无文本）或只说了"继续"，仅靠用户消息根本无法构建有效查询
3. **工具结果关联**: 工具调用的结果（如 MaidName、timestamp）提供了额外的元数据线索，有助于匹配相关记忆

**对 `contextWindow` 语义的影响**:

| 维度   | 当前实现              | 重构后（对齐 VCP）         |
| ------ | --------------------- | -------------------------- |
| 单位   | "条用户消息"          | "轮完整对话"               |
| 默认值 | 1（最后一条用户消息） | 1（最后一轮 User+AI+Tool） |
| 内容   | 仅用户文本            | 用户 + AI回复 + 工具结果   |
| 格式   | 纯文本拼接            | 带角色标记的结构化文本     |

**对缓存策略的影响**:

由于查询文本现在包含 AI 回复（每次都不同），精确文本匹配缓存的**跨轮次**命中率会降为零。但这不影响其核心价值：

- **同一轮内多个占位符**仍然可以共享缓存（一个 Agent 绑定多个知识库时，查询文本相同）
- **重试 (Regenerate) 场景**：用户重试时，查询文本完全一致（用户消息不变 + 上一轮 AI 回复不变），精确匹配缓存直接命中，避免重复向量化和检索开销
- 向量相似度缓存的价值因此降低（每轮查询足够独特），进一步验证了移除它的合理性

**重构方案**:

```typescript
/**
 * 构建上下文感知查询文本（对齐 VCP 策略）
 * 取最近 N 轮完整对话（User + AI + Tool）组合为检索查询
 */
private buildContextQuery(context: PipelineContext): string {
  const { messages, agentConfig } = context;
  const windowSize = agentConfig.knowledgeSettings?.contextWindow || 1;

  // 从消息列表末尾向前，按"轮"提取
  // 一"轮" = 最近的 user 消息 + 紧随其后的 assistant/tool 消息
  const rounds: string[] = [];
  let i = messages.length - 1;
  let roundCount = 0;

  while (i >= 0 && roundCount < windowSize) {
    // 向前找到一条 user 消息
    while (i >= 0 && messages[i].role !== "user") {
      i--;
    }
    if (i < 0) break;

    const userIdx = i;
    const parts: string[] = [];

    // 收集这条 user 消息
    const userContent = messages[userIdx].content;
    if (typeof userContent === "string" && userContent.trim()) {
      parts.push(`[User]: ${userContent.trim()}`);
    }

    // 收集紧随其后的 assistant 和 tool 消息
    for (let j = userIdx + 1; j < messages.length; j++) {
      const msg = messages[j];
      if (msg.role === "user") break; // 遇到下一条 user 就停止
      if (typeof msg.content !== "string") continue;

      if (msg.role === "assistant" && msg.content.trim()) {
        parts.push(`[AI]: ${msg.content.trim()}`);
      } else if (msg.role === "tool" && msg.content.trim()) {
        parts.push(`[Tool]: ${msg.content.trim()}`);
      }
    }

    if (parts.length > 0) {
      rounds.unshift(parts.join("\n"));
      roundCount++;
    }
    i = userIdx - 1;
  }

  return rounds.join("\n\n");
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
   * 类似 VCP 的动态 K 值概念：这是一个上限，实际截断以 minScore 为准。
   * 即使设为 50，如果只有 3 条超过分数阈值，就只返回 3 条。
   */
  defaultLimit?: number;

  /** 召回总字数上限 (0表示不限制) */
  maxRecallChars?: number;

  /**
   * 最低相关度分数 (0.0-1.0)
   * 类似 VCP 的 ::Truncate 硬截断：低于此分数的条目直接丢弃，不会被召回。
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
   * 对齐 VCP 策略：不是仅取用户消息，而是取完整一轮交互。
   */
  contextWindow?: number;

  /**
   * 是否启用检索结果缓存
   * 缓存策略：精确文本匹配（同 VCP 的缓存设计），完全一致才命中。
   */
  enableCache?: boolean;
}
```

对比当前类型，移除了：

- `embeddingModelId` → 使用知识库全局配置（同 VCP 全局统一模型）
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
  - **重写 `buildContextQuery()`**：从"仅取用户消息"改为"取最近 N 轮完整对话（User + AI + Tool）"，对齐 VCP 查询策略
  - 移除聚合和向量衰减逻辑（`aggregateResults()`, `computeWeightedVector()`）
  - 简化缓存查找（移除 `findSimilar()` 调用，只保留 `findByText()`）
- **缓存**: `knowledge-cache.ts` 的 `findSimilar()` 不再被调用（保留方法但标记 deprecated）
- **迁移**: 需要在 Agent 加载时做旧数据兼容

---

## 7. 处理器逻辑调整详情

### 7.1 `knowledge-processor.ts` 变更

#### 7.1.1 `buildContextQuery()` 重写（核心变更）

```diff
- /**
-  * 构建上下文感知查询文本 (滑动窗口)
-  */
- private buildContextQuery(context: PipelineContext): string {
-   const { messages, agentConfig } = context;
-   const windowSize = agentConfig.knowledgeSettings?.aggregation?.contextWindow || 1;
-   const userMessages = messages.filter((m) => m.role === "user" && typeof m.content === "string");
-   const recent = userMessages.slice(-windowSize);
-   return recent.map((m) => m.content).join("\n");
- }
+ /**
+  * 构建上下文感知查询文本（对齐 VCP 策略）
+  * 取最近 N 轮完整对话（User + AI + Tool）组合为检索查询
+  */
+ private buildContextQuery(context: PipelineContext): string {
+   // 实现见 §2.4 的重构方案代码
+ }
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
  // buildContextVector 中移除加权平均
- if (aggregation?.queryDecay && aggregation.queryDecay < 1.0) {
-   if (history.length > 0) {
-     return this.computeWeightedVector(currentVector, history, aggregation.queryDecay);
-   }
- }
+ // 直接返回当前查询向量，不做历史向量混合
  return currentVector;
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

1. **同一轮多占位符**: Agent 绑定了 3 个知识库，每个占位符的查询文本相同，第 2、3 次直接命中缓存
2. **重试 (Regenerate)**: 用户点击重试时，或者换模型回复，查询文本完全一致（用户消息 + 上一轮 AI 回复都没变），直接命中缓存，省去向量化和检索开销

### 7.2 `knowledge-cache.ts` 变更

- `findSimilar()` 方法保留但标记 `@deprecated`，不再被处理器调用
- `cosineSimilarity()` 同上

### 7.3 检索逻辑保持不变的部分

以下逻辑与 VCP 设计一致，保持不变：

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
