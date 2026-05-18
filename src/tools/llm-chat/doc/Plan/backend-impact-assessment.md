# 后端影响评估报告：知识库查询策略重构

**状态**: Completed
**日期**: 2025-05-18
**关联**: [knowledge-section-refactor-report.md](./knowledge-section-refactor-report.md)

---

## 1. 结论：后端 (Rust) 无需改动

经过完整的调用链追踪，确认本次重构**不涉及任何后端代码变更**。后端的知识库搜索系统是完全无状态的，所有"上下文感知"逻辑都在前端完成。

---

## 2. 调用链全景

```
┌─────────────────────────────────────────────────────────────────────┐
│  前端 (TypeScript)                                                   │
│                                                                     │
│  knowledge-processor.ts                                             │
│    ├─ buildContextQuery(context)                                    │
│    │    → 构建查询文本 (当前: 仅 user 消息; 重构后: 完整轮次)       │
│    │                                                                │
│    ├─ buildContextVector(queryText, ...)                             │
│    │    → vectorCacheManager.getVector() 获取当前查询向量            │
│    │    → computeWeightedVector() 加权历史向量 [将被移除]            │
│    │                                                                │
│    └─ searchKnowledge({ query, vector, limit, minScore, ... })      │
│         │                                                           │
│         ▼                                                           │
│  knowledge-service.ts                                               │
│    └─ SearchOrchestrator.search()                                   │
│         ├─ prepareSearchVector() → 优先用外部 vector_payload        │
│         └─ invoke("kb_search", {                                    │
│              query,          ← 纯文本字符串                         │
│              filters,        ← SearchFilters (limit, kbIds, etc.)   │
│              engineId,       ← "vector" | "keyword" | "lens" | ...  │
│              vectorPayload,  ← number[] | null                      │
│              model           ← 模型 ID 字符串                       │
│            })                                                       │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              │ Tauri IPC
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  后端 (Rust)                                                         │
│                                                                     │
│  kb_search command (commands/search.rs)                              │
│    ├─ 构建 QueryPayload::Text(query) 或 QueryPayload::Vector{...}  │
│    └─ engine.search(&payload, &filters, &context)                   │
│         │                                                           │
│         ├─ VectorRetrievalEngine  → 余弦相似度搜索                  │
│         ├─ KeywordRetrievalEngine → BM25 关键词搜索                 │
│         ├─ LensRetrievalEngine    → 透镜折射 + 图谱编织             │
│         └─ BlenderRetrievalEngine → 混合检索                        │
│                                                                     │
│  返回: Vec<SearchResult> (caiu + score + matchType + kbId + ...)    │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. 逐项分析

### 3.1 `buildContextQuery()` 重写 → 后端无感

| 维度             | 说明                                                  |
| ---------------- | ----------------------------------------------------- |
| 变更内容         | 从"仅取 user 消息"改为"取最近 N 轮完整对话"           |
| 影响后端的方式   | 改变了传给 `kb_search` 的 `query: String` 参数内容    |
| 后端是否需要适配 | **否** — 后端只接收一个字符串，不关心它是怎么拼出来的 |

### 3.2 `computeWeightedVector()` 移除 → 后端无感

| 维度             | 说明                                                                     |
| ---------------- | ------------------------------------------------------------------------ |
| 变更内容         | 不再将历史查询向量加权平均到当前向量中                                   |
| 影响后端的方式   | 传给 `kb_search` 的 `vectorPayload` 从"加权合成向量"变为"纯当前查询向量" |
| 后端是否需要适配 | **否** — 后端只接收一个 `Vec<f32>`，不关心它是否经过加权                 |

### 3.3 `aggregateResults()` 移除 → 后端无感

| 维度             | 说明                                       |
| ---------------- | ------------------------------------------ |
| 变更内容         | 不再将历史轮次的检索结果按衰减混入当前结果 |
| 影响后端的方式   | 无 — 聚合完全在前端完成，后端从未参与      |
| 后端是否需要适配 | **否**                                     |

### 3.4 缓存 `findSimilar()` 移除 → 后端无感

| 维度             | 说明                                              |
| ---------------- | ------------------------------------------------- |
| 变更内容         | 前端缓存从"向量相似度匹配"简化为"精确文本匹配"    |
| 影响后端的方式   | 无 — 缓存命中时直接跳过后端调用，未命中时正常调用 |
| 后端是否需要适配 | **否**                                            |

### 3.5 `embeddingModelId` Agent 级移除 → 后端无感

| 维度             | 说明                                                                           |
| ---------------- | ------------------------------------------------------------------------------ |
| 变更内容         | 不再支持 Agent 级别覆盖 Embedding 模型，统一使用全局配置                       |
| 影响后端的方式   | 传给 `kb_search` 的 `model` 参数来源变了（从 Agent 级 → 全局），但值的格式不变 |
| 后端是否需要适配 | **否**                                                                         |

---

## 4. Lens 引擎的 `history_vectors` 独立性确认

后端 `SearchFilters` 中有一个 `history_vectors: Option<Vec<Vec<f32>>>` 字段，被 Lens 引擎的 Phase 1 "上下文投射"使用：

```rust
// lens.rs L297-314
let mut projected_vector = query_vector.to_vec();
if let Some(history) = &filters.history_vectors {
    let tau = 0.5;
    for (i, h_vec) in history.iter().rev().enumerate() {
        let decay = (-tau * (i as f32 + 1.0)).exp();
        // ... 衰减加权
    }
}
```

**关键发现：llm-chat 的 knowledge-processor 从未传递过 `historyVectors` 参数。**

追踪路径：

1. `knowledge-processor.ts` 调用 `searchKnowledge()` — 参数中无 `historyVectors`
2. `knowledge-service.ts` 的 `searchKnowledge()` 接口定义中无此字段
3. `SearchOrchestrator.search()` 的 `extraFilters` 中也未包含

这意味着：

- Lens 引擎的 `history_vectors` 是为**知识库工具自身的搜索界面**设计的（用户手动搜索时可能传入）
- 前端 `computeWeightedVector()` 和后端 Lens 的 `history_vectors` 是**两套完全独立的上下文投射机制**
- 移除前端的 `computeWeightedVector()` 不会影响 Lens 引擎的任何功能

---

## 5. 前端适配范围确认（补充）

基于调用链分析，确认以下前端文件**不需要改动**：

| 文件                                        | 原因                                                     |
| ------------------------------------------- | -------------------------------------------------------- |
| `knowledge-service.ts`                      | 纯透传层，参数签名不变                                   |
| `SearchOrchestrator` (orchestrator.ts)      | 纯透传层，接口不变                                       |
| `knowledge-base/core/search.ts`             | `prepareSearchVector()` 只负责向量生成，不涉及上下文逻辑 |
| `knowledge-base/types/search.ts`            | `SearchFilters.historyVectors` 保留（Lens 引擎独立使用） |
| `knowledge-base/utils/vectorCache.ts`       | Embedding 向量缓存，与本次重构无关                       |
| `knowledge-base/utils/queryPreProcessor.ts` | 查询清洗逻辑，与本次重构无关                             |

---

## 6. 最终影响范围总结

```
本次重构的改动边界:

┌─────────────────────────────────────────────────────────────────┐
│  需要改动的文件 (全部在前端)                                     │
│                                                                 │
│  ① types/agent.ts                                               │
│     └─ AgentKnowledgeSettings 类型重构                          │
│                                                                 │
│  ② knowledge-processor.ts                                       │
│     ├─ buildContextQuery() 重写（取完整轮次）                   │
│     ├─ buildContextVector() 移除加权逻辑                        │
│     ├─ aggregateResults() 移除                                  │
│     ├─ computeWeightedVector() 移除                             │
│     └─ 缓存 findSimilar() 调用移除                             │
│                                                                 │
│  ③ knowledge-cache.ts                                           │
│     ├─ findSimilar() 标记 deprecated                            │
│     └─ TurnRecord.queryVector 可选保留（调试用）                │
│                                                                 │
│  ④ KnowledgeSection.vue                                         │
│     └─ UI 设置项精简 (15 → 9)                                  │
│                                                                 │
│  ⑤ agentEditConfig.ts                                           │
│     └─ 搜索索引条目清理                                        │
│                                                                 │
│  ⑥ 文档更新 (7 个文件)                                         │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  不需要改动的文件                                                │
│                                                                 │
│  后端 (Rust):                                                   │
│  ✓ commands/search.rs     — 接口签名不变                        │
│  ✓ commands/vector.rs     — 向量存储逻辑不变                    │
│  ✓ search/lens.rs         — history_vectors 独立使用            │
│  ✓ search/vector.rs       — 纯余弦相似度，无状态               │
│  ✓ search/keyword.rs      — 纯 BM25，无状态                    │
│  ✓ search/blender.rs      — 混合检索，无状态                    │
│  ✓ core.rs                — 类型定义不变                        │
│  ✓ state.rs               — 状态管理不变                        │
│                                                                 │
│  前端 (知识库模块):                                              │
│  ✓ knowledge-service.ts   — 透传层                              │
│  ✓ orchestrator.ts        — 透传层                              │
│  ✓ core/search.ts         — 向量准备逻辑不变                    │
│  ✓ types/search.ts        — SearchFilters 保持不变              │
│  ✓ utils/vectorCache.ts   — Embedding 缓存不变                  │
│  ✓ utils/queryPreProcessor.ts — 查询清洗不变                    │
└─────────────────────────────────────────────────────────────────┘
```

---

## 7. 风险评估

| 风险项                          | 级别    | 说明                                                                                                                       |
| ------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------- |
| 查询文本变长导致 Embedding 截断 | 🟡 低   | 完整轮次拼接后文本可能更长，但 Embedding 模型有自己的 token 限制会自动截断。且 `contextWindow` 默认值为 1-2 轮，不会过长。 |
| 移除向量加权后检索质量下降      | 🟡 低   | VCP 验证了"每次独立检索"的有效性。且加权逻辑从未被大多数用户显式启用（`queryDecay` 默认为 undefined）。                    |
| 数据迁移兼容性                  | 🟢 极低 | 旧配置中的 `aggregation` 字段被忽略即可，不会导致崩溃。只需在 `ensureConfig()` 中做字段提升。                              |
| Lens 引擎功能受损               | 🟢 无   | Lens 的 `history_vectors` 从未被 llm-chat 使用，完全独立。                                                                 |
