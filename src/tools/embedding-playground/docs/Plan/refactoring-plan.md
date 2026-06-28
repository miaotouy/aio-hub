# Embedding 测试场重构与翻新计划书

本计划书旨在对 `Embedding 测试场` 进行深度重构与翻新，解决用户无法直观进行 A vs B 极简对比的痛点，并引入多模型横向对比、RAG 跨模型阈值校准等高级功能，同时通过彻底的模块解耦提升代码的可维护性。

---

## 1. 核心痛点与重构目标

1. **极简 A vs B 对比缺失**：
   - **痛点**：用户吐槽“AIO 里怎么没有直接输入 A 和 B 比向量相似度的功能”。现有的 1:N 列表排行适合批量召回测试，但对于最基础的双文本对比显得过于繁琐。
   - **目标**：引入 **极简 A vs B 对比模式**。当对比组中只有 1 个文本时，UI 自动自适应为大字号、双栏或仪表盘式的极简对比卡片，直接出分，并展示维度、耗时等元数据。

2. **多模型横向对比与 RAG 阈值校准缺失**：
   - **痛点**：不同的 Embedding 模型由于训练数据、维度和损失函数的不同，其相似度分数的**绝对值分布（Scale）完全不同**。例如，OpenAI 的 `text-embedding-ada-002` 相似度普遍偏高（不相关文本也常在 `0.7` 以上），而 BGE 或 Cohere 的分布更广。如果 RAG 系统直接更换模型而不调整阈值，会导致召回率暴跌或噪音泛滥。
   - **目标**：引入 **多模型横向对比模式 (Multi-Model Arena)**，支持多选模型并行计算，并提供 **“跨模型阈值校准器”**，自动估算并推荐目标模型的等效阈值。

3. **全局模型选择器冲突**：
   - **痛点**：顶部的 `LlmModelSelector` 是全局单选的。在多模型对比模式下，全局单选框会与多选需求产生冲突，且切换标签页时模型选择容易被意外覆盖。
   - **目标**：**彻底去掉顶部全局模型选择器**，让每个标签页（模式）在内部自主管理最适合自己的模型选择交互（单选/多选）。

---

## 2. 全新架构设计 (5 大核心模式)

重构后，`EmbeddingPlayground` 将划分为 5 个独立的、各司其职的标签页（模式）：

```text
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                                   Embedding 测试场                                        │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ [ 🎯 极简 A vs B ]  [ 📊 1:N 语义排行 ]  [ ⚔️ 多模型竞技场 ]  [ 🔍 检索模拟 ]  [ 🔧 基础调试 ] │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

### 2.1 🎯 模式一：极简 A vs B 对比 (`QuickCompare.vue`)

- **定位**：提供最纯粹、最快速的双文本对比体验。
- **模型选择**：内部自理。支持“单模型”或“多模型横向对比”切换。
- **输入**：左右两个大文本框（文本 A、文本 B），贴入即比。
- **结果展示**：
  - _单模型下_：大字号显示相似度分数，配合精美的环形进度条，并展示维度、耗时、Token数。
  - _多模型下_：以卡片列表或柱状图，并排展示选中的多个模型对 A vs B 的打分差异。

### 2.2 📊 模式二：1:N 语义排行 (`SimilarityArena.vue`)

- **定位**：聚焦于**单个模型**下，基准文本（Anchor）与大量对比文本的语义距离排行（优化现有功能，剥离多模型逻辑）。
- **模型选择**：内部自理（单选）。
- **输入**：Anchor 文本，1:N 对比文本组。
- **结果展示**：优雅的排行列表、分数进度条。

### 2.3 ⚔️ 模式三：多模型竞技场 & RAG 校准器 (`MultiModelArena.vue`)

- **定位**：专门用于 RAG 系统模型迁移、可用性评估、参数校准。
- **模型选择**：内部自理（多选）。
- **输入**：Anchor 文本，1:N 对比文本组。
- **结果展示**：
  - **打分矩阵表格 (Score Matrix)**：直观的 Heatmap 表格，行是文本，列是模型。
  - **排序一致性对比 (Rank Consistency)**：并排展示不同模型对这些文本的排序变化，评估 Top-K 召回抖动。
  - **跨模型阈值校准器 (Threshold Calibrator)**：输入基准模型和基准阈值，自动计算并推荐其他模型的等效推荐阈值。

### 2.4 🔍 模式四：检索模拟 (`RetrievalSimulator.vue`)

- **定位**：模拟 RAG 系统的召回阶段。
- **模型选择**：内部自理（单选）。
- **交互**：左侧管理知识库（一键向量化），右侧输入 Query 检索，Top-K 召回，阈值过滤。

### 2.5 🔧 模式五：基础调试 (`RawDebugger.vue`)

- **定位**：获取原始向量 JSON，测试维度和性能。
- **模型选择**：内部自理（单选）。
- **交互**：输入文本，获取原始向量 JSON。

---

## 3. 文件组织结构

```text
src/tools/embedding-playground/
├── components/
│   ├── QuickCompare.vue        # [新增] 极简 A vs B 对比
│   ├── SimilarityArena.vue     # [重构] 单模型 1:N 语义排行
│   ├── MultiModelArena.vue     # [新增] 多模型竞技场 & RAG 校准器
│   ├── RetrievalSimulator.vue  # [重构] 检索模拟
│   └── RawDebugger.vue         # [重构] 基础调试
├── docs/
│   └── Plan/
│       └── refactoring-plan.md # [本文档] 重构计划书
├── store.ts                    # [重构] Pinia Store（文本数据共享，模型选择解耦）
├── EmbeddingPlayground.vue     # [重构] 主入口组件（仅负责标签页导航，Header 干净无全局选择器）
└── embedding-playground.registry.ts
```

---

## 4. Store 状态设计 (`store.ts`)

为了防止切换标签页时，各个模式的模型选择互相覆盖，我们将模型选择状态完全解耦并局部化。Store 仅保留跨组件共享的文本数据与各模式独立的模型绑定：

```typescript
import { defineStore } from "pinia";
import { ref } from "vue";
import type { LlmProfile } from "@/types/llm-profiles";
import type { SimilarityAlgorithm } from "./composables/useVectorMath";

export const useEmbeddingPlaygroundStore = defineStore(
  "embedding-playground",
  () => {
    // --- 共享文本数据（方便用户在不同模式间切换时，输入的文本不丢失） ---
    const anchorText = ref("人工智能");
    const comparisonTexts = ref<string[]>([
      "机器学习",
      "深度学习",
      "神经网络",
      "美味的红烧肉",
    ]);
    const rawInput = ref(
      "自然语言处理（NLP）是计算机科学、人工智能和语言学领域的分支学科。它致力于让计算机能够理解、解释和生成人类语言。"
    );
    const searchQuery = ref("如何构建桌面应用程序？");

    // --- 共享算法配置 ---
    const similarityAlgorithm = ref<SimilarityAlgorithm>("cosine");

    // --- 各模式独立的模型选择状态（避免互相覆盖） ---
    // 1. 极简对比
    const quickCompareProfile = ref<LlmProfile | null>(null);
    const quickCompareModelId = ref("");
    const quickCompareCombos = ref<string[]>([]); // 多选模型 combo 列表 ("profileId:modelId")
    const quickCompareIsMulti = ref(false); // 是否启用多模型对比

    // 2. 1:N 语义排行
    const similarityProfile = ref<LlmProfile | null>(null);
    const similarityModelId = ref("");

    // 3. 多模型竞技场
    const multiArenaCombos = ref<string[]>([]); // 多选模型 combo 列表

    // 4. 检索模拟
    const retrievalProfile = ref<LlmProfile | null>(null);
    const retrievalModelId = ref("");
    const searchTopK = ref(3);
    const searchThreshold = ref(0.2); // 默认 20%

    // 5. 基础调试
    const rawProfile = ref<LlmProfile | null>(null);
    const rawModelId = ref("");
    const rawDimensions = ref<number | undefined>(undefined);

    // --- 检索模拟知识库数据 ---
    const knowledgeBase = ref<{ text: string; embedding?: number[] }[]>([
      { text: "AIO Hub 是一款桌面 AI 工具。" },
      { text: "Embedding 是 RAG 的核心组件，用于将文本转换为向量。" },
      { text: "Vue 3 是一个渐进式 JavaScript 框架。" },
      { text: "Tauri 用于构建更小、更快、更安全的跨平台桌面应用。" },
      { text: "Rust 语言以内存安全和高性能著称。" },
    ]);

    return {
      // 共享文本与算法
      anchorText,
      comparisonTexts,
      rawInput,
      searchQuery,
      similarityAlgorithm,

      // 极简对比状态
      quickCompareProfile,
      quickCompareModelId,
      quickCompareCombos,
      quickCompareIsMulti,

      // 1:N 排行状态
      similarityProfile,
      similarityModelId,

      // 多模型竞技场状态
      multiArenaCombos,

      // 检索模拟状态
      retrievalProfile,
      retrievalModelId,
      searchTopK,
      searchThreshold,
      knowledgeBase,

      // 基础调试状态
      rawProfile,
      rawModelId,
      rawDimensions,
    };
  }
);
```

---

## 5. 核心算法与计算逻辑

### 5.1 增量缓存机制 (Incremental Cache)

在多模型对比和 1:N 排行中，我们将继续使用并优化现有的二级缓存机制：

- **结构**：`Map<ModelId, Map<TextContent, number[]>>`
- **逻辑**：
  1. 每次对比时，系统自动对比“当前文本组”与“该模型的缓存池”。
  2. 仅对未命中的文本发起 API 请求。
  3. 请求成功后自动合并新旧向量。
  4. 在多模型模式下，使用 `Promise.all` 并行请求各个模型未命中的向量，确保极速响应。

### 5.2 跨模型阈值校准算法 (Threshold Calibration)

为了帮助 RAG 系统进行模型迁移时的参数校准，我们实现一个基于**百分位数对齐 (Percentile Alignment)** 的校准算法：

1. **输入**：
   - 基准模型 $M_{base}$，基准阈值 $T_{base}$。
   - 当前测试集文本对 $D = \{(Anchor, Text_i)\}$。
2. **计算步骤**：
   - 计算基准模型 $M_{base}$ 对所有文本对的分数集合 $S_{base} = \{Score(M_{base}, d) \mid d \in D\}$。
   - 计算目标模型 $M_{target}$ 对所有文本对的分数集合 $S_{target} = \{Score(M_{target}, d) \mid d \in D\}$。
   - 找出 $T_{base}$ 在 $S_{base}$ 中的百分位排名（Percentile Rank）$P$。
   - 计算 $S_{target}$ 中对应百分位 $P$ 的分数值，作为推荐的等效阈值 $T_{target}$。
3. **降级策略**：若测试集样本过少（如少于 3 个），则退化为简单的线性映射或直接提示样本不足。

---

## 6. 实施步骤与里程碑

### 阶段一：基础重构 (Milestone 1)

- [x] 创建并完善本重构计划文档。
- [x] 重构 `store.ts`，解耦模型选择状态。
- [x] 重构 `EmbeddingPlayground.vue`，去掉顶部全局选择器，更新为 5 标签页导航。

### 阶段二：极简对比与排行重构 (Milestone 2)

- [x] 新建 `QuickCompare.vue`，实现极简 A vs B 对比（单模型仪表盘，多模型并排卡片）。
- [x] 重构 `SimilarityArena.vue`，将单选模型选择器移入组件内部，剥离多模型逻辑。

### 阶段三：多模型竞技场与校准器 (Milestone 3)

- [x] 新建 `MultiModelArena.vue`。
- [x] 实现多模型打分矩阵表格（Heatmap 效果）。
- [x] 实现排序一致性对比视图。
- [x] 实现跨模型阈值校准器面板。

### 阶段四：检索模拟与基础调试适配 (Milestone 4)

- [x] 重构 `RetrievalSimulator.vue`，将单选模型选择器移入组件内部。
- [x] 重构 `RawDebugger.vue`，将单选模型选择器移入组件内部。
- [x] 运行 `check:frontend` 进行全量类型检查，确保无编译错误。

---

## 7. 实施记录

- 已新增 `EmbeddingModelPicker.vue`，统一承载 Embedding 模型单选与多选 UI。
- 已新增 `useEmbeddingModelOptions.ts` 和 `useEmbeddingCache.ts`，集中处理模型 combo 解析、可用 Embedding 模型筛选和按模型隔离的增量缓存。
- 极简 A vs B 模式复用共享 `anchorText` 与 `comparisonTexts[0]` 作为文本 A/B，便于和 1:N、多模型模式之间同步测试样本。
- 检索模拟在切换模型时会清空已有文档向量和查询缓存，避免跨模型混用旧 embedding；搜索阈值现在会实际参与结果过滤。
- 已同步更新 `src/tools/embedding-playground/ARCHITECTURE.md`。
