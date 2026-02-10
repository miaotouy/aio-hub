# RFC: 知识库记忆层扩展 (Memory Layer Extension)

**状态**: RFC (Request for Comments)  
**作者**: 咕咕  
**日期**: 2026-02-10

---

## 0. 问题陈述：命名锚定效应

当这个模块被命名为"知识库"(Knowledge Base) 的那一刻，它的演化路径就被隐性地锁定了：

| 维度     | "知识库"暗示的方向 | "记忆"需要的方向                 |
| -------- | ------------------ | -------------------------------- |
| 数据来源 | 人工录入、文件导入 | **对话自动提取**                 |
| 数据流向 | 单向：人→库→检索   | **双向：对话⇄库**                |
| 生命周期 | 静态，手动管理     | **动态：衰减、合并、遗忘**       |
| 时间维度 | 无（或仅作元数据） | **核心维度：何时学到的**         |
| 优化方向 | 检索算法、排序质量 | **提取质量、写回时机、记忆管理** |
| 主体     | 用户是管理者       | **Agent 是记忆的主人**           |

后续所有 AI 协助开发时，都会被"知识库"这个名字锚定，自然而然地只在检索侧优化（更好的引擎、更精准的排序），而完全忽略了**写回路径**的缺失。

甚至当被问到"能否用作 Agent 记忆"时，AI 会回答"这是知识库不是记忆库"——这恰恰证明了命名对认知的锁定。

---

## 1. 现状分析

### 1.1. 已有的基础设施（非常好）

当前知识库的 CAIU 模型**天然适合**作为记忆载体：

```
CAIU 字段          →  记忆语义映射
─────────────────────────────────────
key                →  记忆标题/摘要
content            →  记忆内容
tags (带权重)      →  语义标签 + 时间标签 + 情感标签
priority           →  记忆重要度/显著性 (salience)
enabled            →  活跃/归档
createdAt          →  首次记忆时间
updatedAt          →  最近回忆/强化时间
contentHash        →  去重（避免重复记忆）
```

检索引擎也已经具备：

- **Vector 引擎**: 语义相似度检索 → 联想回忆
- **Keyword 引擎**: 精确匹配 → 触发式回忆
- **Lens 引擎**: 上下文投射 + 历史向量 → **已经在做"记忆的记忆"了**
- **Blender 引擎**: 多路信号融合 → 综合回忆

写入 API 也完整存在：

- `useKbEntryManagement.addEntry()` → 创建新记忆
- `useKbEntryManagement.updateEntry()` → 更新/强化记忆
- `useKbEntryManagement.addEntries()` → 批量写入
- Rust 后端: `kb_upsert_entry`, `kb_batch_upsert_entries`

### 1.2. 缺失的关键环节

```
当前数据流（单向）:
  用户手动录入 → CAIU → 检索引擎 → 【kb】占位符替换 → LLM 上下文

缺失的回路（写回路径）:
  对话完成 → ??? → 提取关键信息 → ??? → 写入 CAIU → 向量化
                ↑                        ↑
            没有提取器               没有写回通道
```

具体缺失：

1. **Memory Extractor（记忆提取器）**: 从对话中自动提取值得记住的信息
2. **Memory Writer（记忆写入器）**: 将提取的信息通过现有 KB API 写回
3. **Memory Lifecycle Manager（记忆生命周期管理）**: 衰减、合并、遗忘
4. **Memory-aware Retrieval（记忆感知检索）**: 在检索时考虑时间衰减和访问频率
5. **Agent Memory Config（智能体记忆配置）**: 在 Agent 级别配置记忆行为

---

## 2. 设计方案

### 2.1. 核心原则

- **不重命名，而是扩展**：知识库保持原名，但增加"记忆模式"作为一种使用方式
- **复用现有基础设施**：CAIU、检索引擎、向量化流水线全部复用
- **最小侵入**：通过新增 context processor 和 composable 实现，不修改现有 KB 核心
- **Agent 自治**：每个 Agent 可以拥有独立的记忆库（或共享）

### 2.2. 架构概览

```
┌─────────────────────────────────────────────────────┐
│                    llm-chat                          │
│                                                     │
│  ┌──────────────┐    ┌──────────────────────────┐   │
│  │ knowledge-   │    │ memory-processor (新增)   │   │
│  │ processor    │    │                          │   │
│  │ (现有,只读)  │    │  ┌─────────────────────┐ │   │
│  │              │    │  │ Memory Extractor    │ │   │
│  │ 【kb】→ 检索 │    │  │ (对话后提取)        │ │   │
│  │              │    │  └────────┬────────────┘ │   │
│  └──────────────┘    │           │              │   │
│                      │  ┌────────▼────────────┐ │   │
│                      │  │ Memory Writer       │ │   │
│                      │  │ (写回 KB)           │ │   │
│                      │  └────────┬────────────┘ │   │
│                      │           │              │   │
│                      │  ┌────────▼────────────┐ │   │
│                      │  │ Lifecycle Manager   │ │   │
│                      │  │ (衰减/合并/遗忘)    │ │   │
│                      │  └─────────────────────┘ │   │
│                      └──────────────────────────┘   │
│                                                     │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼ 复用现有 API
┌─────────────────────────────────────────────────────┐
│                 knowledge-base                       │
│                                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │ CAIU     │  │ Tag Pool │  │ Retrieval Engines│  │
│  │ Storage  │  │          │  │ (Vector/Keyword/ │  │
│  │          │  │          │  │  Lens/Blender)   │  │
│  └──────────┘  └──────────┘  └──────────────────┘  │
│                                                     │
│  ┌──────────────────────────────────────────────┐   │
│  │ kbStorage API (addEntry/updateEntry/upsert)  │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

### 2.3. 知识库类型标记

在 `KnowledgeBaseMeta` 中新增 `usage` 字段，区分使用模式：

```typescript
export interface KnowledgeBaseMeta {
  // ... 现有字段 ...

  /** 知识库用途类型 */
  usage?: KnowledgeBaseUsage;
}

export type KnowledgeBaseUsage =
  | "knowledge" // 传统知识库（默认，手动管理）
  | "memory" // Agent 记忆库（自动管理）
  | "hybrid"; // 混合模式
```

记忆库在 UI 上会有不同的视觉标识和管理界面，但底层完全复用 CAIU 和检索引擎。

### 2.4. Agent 记忆配置

扩展 `AgentKnowledgeSettings`（或新增 `AgentMemorySettings`）：

```typescript
export interface AgentMemorySettings {
  /** 是否启用自动记忆 */
  enabled: boolean;

  /** 关联的记忆库 ID（如果为空则自动创建 Agent 专属记忆库） */
  memoryKbId?: string;

  /** 记忆提取配置 */
  extraction: {
    /** 写回模式 */
    mode:
      | "tool-call" // Agent 通过工具调用主动写回（推荐，零额外成本）
      | "first-person" // Agent 自己事后提取（高质量，高成本）
      | "ghostwriter" // 独立模型代笔（中等质量，低成本）
      | "factual"; // 纯事实提取，不关注视角（最低成本）

    /** 视角模式（仅 ghostwriter/factual 模式需要） */
    perspective?: "first-person" | "third-person";

    /** 提取时机: 每轮对话后 / 会话结束时 / 手动触发（仅 ghostwriter/factual 模式） */
    trigger?: "per-turn" | "session-end" | "manual";
    /** 使用的 LLM 模型（用于提取，仅 ghostwriter/factual 模式） */
    modelId?: string;
    /** 提取提示词模板 */
    promptTemplate?: string;
    /** 最小对话轮次（低于此数不触发提取） */
    minTurns?: number;
  };

  /** 记忆生命周期配置 */
  lifecycle: {
    /** 时间衰减因子 (0-1, 越小衰减越快) */
    decayFactor?: number;
    /** 最大记忆条数（超出后触发合并/遗忘） */
    maxEntries?: number;
    /** 合并相似度阈值 (0-1, 超过此值的记忆会被合并) */
    mergeThreshold?: number;
    /** 遗忘阈值 (priority 低于此值的记忆会被归档) */
    forgetThreshold?: number;
  };

  /** 检索增强配置 */
  retrieval: {
    /** 检索时是否应用时间衰减加权 */
    applyTimeDecay?: boolean;
    /** 检索时是否考虑访问频率 */
    applyFrequencyBoost?: boolean;
  };
}
```

### 2.5. Memory Extractor（记忆提取器）

这是最关键的新增组件。它作为一个**后处理器**（post-processor），在 LLM 响应完成后异步执行：

```typescript
// 伪代码 - 核心提取流程
async function extractMemories(
  conversationContext: ChatMessageNode[],
  existingMemories: SearchResult[], // 本轮已检索到的记忆
  config: AgentMemorySettings
): Promise<MemoryCandidate[]> {
  // 1. 构建提取 Prompt
  const prompt = buildExtractionPrompt(
    conversationContext,
    existingMemories,
    config.extraction.promptTemplate
  );

  // 2. 调用 LLM 提取结构化记忆
  const response = await llmRequest(prompt, config.extraction.modelId);

  // 3. 解析为记忆候选
  return parseMemoryCandidates(response);
  // 返回: [{ key, content, tags, importance, type }]
}
```

### 2.6. 视角问题：第三人称自传悖论 (Perspective Problem)

这是写回通道设计中最容易被忽视、但影响最深远的问题。

#### 2.6.1. 问题陈述

当 Memory Extractor 使用一个**独立于会话的模型**来提取记忆时，这个模型看到的是"别人的对话"：

```
会话中的 Agent（第一人称参与者）:
  "我刚才和用户讨论了方案 A，用户对性能表示担忧"

独立提取模型（第三人称观察者）:
  "在这段对话中，Agent 与用户讨论了方案 A，用户对性能表示了担忧"
```

提取出来的记忆天然是**第三人称叙述**——这就像让一个旁观者替你写日记。

当这些记忆被注入回 Agent 的上下文时，Agent 读到的是：

```
已有记忆：
- "用户在 2026-02-08 的对话中告诉 Agent 他喜欢深色主题"
- "Agent 在讨论方案 A 时，用户表达了对性能的担忧"
```

这不是"回忆"，这是在读自己的**病历**或**传记**。一个人不会通过读自己的传记来"想起"事情——那种体验和真正的回忆有本质区别。

#### 2.6.2. 影响分析

| 维度         | 第一人称记忆                   | 第三人称记忆（当前方案的默认结果） |
| ------------ | ------------------------------ | ---------------------------------- |
| 语感         | "我记得用户说过他喜欢简洁风格" | "用户曾表示偏好简洁风格"           |
| 情感连接     | 有主观体验感                   | 冷淡的事实陈述                     |
| Agent 认同   | "这是我的经历"                 | "这是关于我的记录"                 |
| 上下文融合度 | 自然融入对话                   | 像在引用外部文档                   |
| 类比         | 日记                           | 病历 / 第三人称自传                |

对于**纯事实型记忆**（用户偏好、项目信息），视角差异影响较小——"用户喜欢深色主题"无论谁写的都是同一个事实。

但对于**情景型记忆**（episodic memory）和**决策型记忆**，视角差异会严重影响 Agent 的行为连贯性。一个 Agent 如果总是通过第三人称来"回忆"自己的经历，它的人格一致性会被削弱。

#### 2.6.3. 解决方案

**方案 A：提取 Prompt 中强制第一人称视角（推荐，最小成本）**

在提取 Prompt 中明确要求以 Agent 的第一人称视角来书写记忆：

```
你正在帮助一个 AI 助手整理它的记忆。
请以这个助手的第一人称视角（"我"）来书写记忆条目。

示例：
  ✅ "我了解到用户喜欢深色主题"
  ✅ "我建议了方案 A，但用户对性能表示了担忧，我需要在下次提供更注重性能的方案"
```

**方案 B：让会话内的 Agent 自己提取（高成本，高质量）**

在对话结束时，向会话内的同一个 Agent 追加一条系统指令：

```
[系统] 请回顾这段对话，提取你认为值得长期记住的信息。
以你自己的视角，用第一人称书写。
```

**方案 C：Agent 通过工具调用主动写回（VCP 方案）**

不再把记忆提取作为"后处理"，而是将 `save_memory` 作为一个**工具（tool）**暴露给 Agent，让 Agent 在对话过程中**主动决定**什么值得记住：

```typescript
// 暴露给 Agent 的工具定义
const saveMemoryTool = {
  name: "save_memory",
  description:
    "将重要信息保存到你的长期记忆中。当你认为某个信息值得在未来的对话中记住时，调用此工具。",
  parameters: {
    key: { type: "string", description: "记忆的简短标题" },
    content: { type: "string", description: "要记住的详细内容" },
    tags: { type: "array", description: "相关标签" },
    importance: { type: "number", description: "重要程度 0-1" },
  },
};
```

此方案优点是**零视角问题**（天然第一人称）且**零额外成本**（复用当前推理过程）。

**方案 D：混合策略（推荐的最终形态）**

```typescript
extraction: {
  /** 写回模式 */
  mode:
    | "tool-call"      // 方案 C：Agent 通过工具调用主动写回（推荐，零额外成本）
    | "first-person"   // 方案 B：Agent 自己事后提取（高质量，高成本）
    | "ghostwriter"    // 方案 A：独立模型代笔（中等质量，低成本）
    | "factual";       // 纯事实提取，不关注视角（最低成本）
}
```

#### 2.6.4. 对 CAIU 存储的影响

记忆条目的 `MemoryMetadata` 应记录视角来源，以便在检索注入时调整格式。

```typescript
export interface MemoryMetadata {
  // ... 现有字段 ...
  /** 记忆的写入来源 */
  source?: "tool-call" | "first-person" | "ghostwriter" | "factual";
  /** 提取时使用的模型（如果与会话模型不同） */
  extractorModelId?: string;
}
```

---

### 2.7. Memory Writer（记忆写入器）

负责将提取的记忆候选写入知识库。在 `tool-call` 模式下，它作为工具调用的后端实现。

```typescript
async function writeMemories(
  candidates: MemoryCandidate[],
  memoryKbId: string,
  existingMemories: SearchResult[]
): Promise<void> {
  for (const candidate of candidates) {
    // 1. 去重检查（基于语义相似度）
    const similar = findSimilarMemory(candidate, existingMemories);

    if (similar && similar.score > mergeThreshold) {
      // 2a. 合并：更新现有记忆，强化 priority
      await updateEntry(similar.caiu.id, {
        content: mergeContents(similar.caiu.content, candidate.content),
        priority: Math.min(similar.caiu.priority + 10, 200),
      });
    } else {
      // 2b. 新增：创建新 CAIU
      await addEntry(candidate.key, candidate.content, {
        tags: [
          ...candidate.tags.map((t) => ({ name: t, weight: 1.0 })),
          { name: `memory:${candidate.type}`, weight: 0.5 },
          { name: `session:${sessionId}`, weight: 0.3 },
        ],
        priority: Math.round(candidate.importance * 100),
      });
    }
  }
  await triggerIncrementalVectorization(memoryKbId);
}
```

---

### 2.8. 记忆生命周期管理

定期（或在会话开始时）执行的维护任务：

- **时间衰减**: `priority = priority * decayFactor ^ (daysSinceLastAccess)`
- **合并**: 语义相似度超过阈值的记忆自动合并
- **遗忘**: priority 低于阈值的记忆标记为 `enabled: false`
- **强化**: 被检索命中的记忆自动提升 priority

---

### 2.9. CAIU 扩展字段

为支持记忆场景，CAIU 可选扩展：

```typescript
export interface MemoryMetadata {
  /** 记忆类型 */
  memoryType?: "preference" | "fact" | "decision" | "emotion" | "episode";
  /** 来源会话 ID */
  sourceSessionId?: string;
  /** 来源 Agent ID */
  sourceAgentId?: string;
  /** 访问次数 */
  accessCount?: number;
  /** 最后访问时间 */
  lastAccessedAt?: number;
  /** 情感极性 (-1 到 1) */
  sentiment?: number;
  /** 记忆的写入来源 */
  source?: "tool-call" | "first-person" | "ghostwriter" | "factual";
  /** 提取时使用的模型 ID */
  extractorModelId?: string;
}
```

---

## 3. 实施路径

### Phase 1: 基础设施准备（最小改动）

1. 在 `KnowledgeBaseMeta` 中添加 `usage` 字段
2. 在 `AgentBaseConfig` 中添加 `memorySettings` 配置
3. 在知识库 UI 中支持创建"记忆库"
4. 实现 `MemoryWriter`（复用现有 KB 写入 API，作为后端）
5. 实现 `save_memory` 工具定义并注册（tool-call 模式）

### Phase 2: 后处理与视角控制

1. 实现 `MemoryExtractor`（ghostwriter 模式）
2. 在 `useChatResponseHandler` 中添加后处理钩子
3. 支持 `mode` 配置（tool-call / first-person / ghostwriter / factual）

### Phase 3: 生命周期管理与轨迹记忆

1. 实现记忆衰减与合并逻辑
2. 受 TagMemo 启发，增加 `previousVersionId` 记录演化轨迹

---

## 4. 命名建议

- 工具名保持"知识库"
- 当 `usage === 'memory'` 时，UI 显示为"记忆库"
- Agent 配置中显示为"Agent 记忆"

---

## 5. 参考：TagMemo 浪潮算法的启示

记忆系统的核心不是"找到最像的"，而是"触发正确的运动"。记忆系统需要的不只是写回，还需要检索范式本身的变革（如 Tag 共现、辩证召回等）。

---

## 6. 总结

姐姐的洞察一针见血：**视角决定了记忆的真实性**。通过将写回路径闭环（特别是 VCP 启发的主动工具调用方案），我们将知识库从一个静态的"图书馆"升级为 Agent 真正拥有的、具有第一人称视角的长期记忆系统。
