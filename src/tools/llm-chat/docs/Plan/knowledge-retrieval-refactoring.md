# 知识库检索机制重构计划：固定单轮上下文检索

## 1. 背景与问题分析

在智能体（Agent）的知识库（RAG）检索流程中，原设计支持通过 `contextWindow`（上下文窗口轮数）配置来提取最近 $N$ 轮的对话历史，并将其拼接后作为检索的查询（Query）。

然而，在实际运行中，该机制暴露了以下严重问题：

1. **无加权的多轮拼接噪声**：系统在提取多轮历史时，只是简单地将多轮的 User 消息和 AI 消息分别用换行符 `\n` 拼接。由于缺乏时间衰减（Decay）或轮次加权机制，较早轮次的对话内容与最新一轮 of 对话内容在向量化时权重完全相同，引入了大量历史噪声，导致检索相关度急剧下降。
2. **冗余的 UI 配置项**：在智能体编辑器中的“知识库高级设置”中，向用户暴露了“上下文窗口（轮数）”的滑块。这不仅增加了用户的认知负担，还容易引导用户设置过大的窗口，从而劣化检索效果。
3. **设计定位冲突**：本项目知识库的定位是“条目式记忆系统”，而非长文本分片 RAG。记忆系统应当是高精度、即时响应的，固定以最近一对 AI/User 消息作为检索查询是最符合直觉且噪声最小的方案。

### 1.4. 双线并行的检索架构说明

需要明确的是，本项目的知识库检索采用**双线并行**的架构设计：

1. **被动召回线（Passive Retrieval / Context Pipeline）**：
   - **机制**：在 LLM 生成回复前，通过 Context Pipeline 自动扫描提示词中的占位符（如 `{{kb}}` 或 `【kb】`），自动检索并将结果注入到 Prompt 中。
   - **特点**：对延迟敏感，要求极高精度。由于是系统自动触发，极易受到历史多轮对话的噪声干扰。
   - **重构决策**：**此线必须彻底固定为“最近一对消息”**，消除多轮拼接，确保被动注入的上下文干净、精准。

2. **主动查询线（Active Retrieval / Tool Calling）**：
   - **机制**：智能体拥有主动调用知识库检索工具的能力（Function Calling）。
   - **特点**：当 LLM 发现需要更深、更广的历史或特定文档知识时，它会主动调用工具，传入精确的 query 去查。
   - **重构决策**：此线由 LLM 实时决策并控制，完全不受被动召回的 `contextWindow` 限制。双线并行确保了在简化被动召回的同时，不丧失复杂文档检索的灵活性。

---

## 2. 重构目标

- **逻辑固定化**：彻底废弃 `contextWindow` 配置，固定以最近一对 AI/User 消息作为检索的查询。
- **排除 Tool 消息噪声**：在提取 AI 侧上下文时，**严格只提取 `assistant` 消息，彻底排除 `tool` 消息**，避免工具调用的原始 JSON/数据污染检索向量。
- **UI 极简化**：从智能体编辑器中移除“上下文窗口（轮数）”设置项，降低用户配置成本。
- **代码清理**：清理类型定义、初始化逻辑、数据迁移逻辑以及架构文档中关于多轮检索的残留描述，保持代码库的整洁与高可维护性。

---

## 3. 详细修改方案

### 3.1. 检索逻辑层修改

**文件**：[`src/tools/llm-chat/core/context-processors/knowledge-processor.ts`](../../core/context-processors/knowledge-processor.ts)

- **修改点**：重构 `extractContextParts` 方法。
- **新逻辑**：
  1. 过滤出所有 `sourceType === "session_history"` 的历史消息。
  2. 从后往前寻找，提取**最后一条 User 消息**作为 `userText`。
  3. 提取该 User 消息之后、或者紧邻其前的 **最后一条 Assistant 消息**（如果有的话）作为 `aiText`。**严格排除 `tool` 消息**。
  4. 彻底移除 `windowSize` 变量及多轮循环拼接逻辑。

```typescript
  /**
   * 从对话上下文中提取最近一对 User 和 AI 文本（向量空间融合策略）
   * 固定仅提取最近一轮交互，且严格排除 tool 消息，避免多轮历史和工具调用数据引入噪声。
   */
  private extractContextParts(context: PipelineContext): {
    userText: string;
    aiText: string;
  } {
    const { messages } = context;

    // 仅筛选真实的会话历史消息
    const historyOnly = messages.filter(
      (m) => m.sourceType === "session_history"
    );

    if (historyOnly.length === 0) {
      return { userText: "", aiText: "" };
    }

    let userText = "";
    let aiText = "";

    // 1. 从后往前找到最后一条 user 消息
    let lastUserIdx = -1;
    for (let i = historyOnly.length - 1; i >= 0; i--) {
      if (historyOnly[i].role === "user") {
        lastUserIdx = i;
        break;
      }
    }

    if (lastUserIdx !== -1) {
      const userContent = historyOnly[lastUserIdx].content;
      if (typeof userContent === "string") {
        userText = userContent.trim();
      }

      // 2. 收集该 user 消息之后的 assistant 消息作为 AI 侧上下文（严格排除 tool 消息）
      const aiParts: string[] = [];
      for (let j = lastUserIdx + 1; j < historyOnly.length; j++) {
        const msg = historyOnly[j];
        if (msg.role === "user") break;
        if (typeof msg.content !== "string") continue;

        // 严格只提取 assistant 消息，排除 tool 消息
        if (msg.role === "assistant" && msg.content.trim()) {
          aiParts.push(msg.content.trim());
        }
      }
      aiText = aiParts.join("\n");
    }

    return { userText, aiText };
  }
```

### 3.2. UI 设置层修改

**文件**：[`src/tools/llm-chat/components/agent/agent-editor/sections/KnowledgeSection.vue`](../sections/KnowledgeSection.vue)

- **修改点 1**：从 `knowledgeAdvancedSettings` 计算属性中彻底移除 `kbContextWindow` 配置项。
- **修改点 2**：清理初始化与数据迁移逻辑。
  - 移除 `editForm.knowledgeSettings` 初始化中对 `contextWindow: 1` 的赋值。
  - 移除旧版 `aggregation` 数据提升迁移中对 `contextWindow` 的处理。
  - 移除确保默认值逻辑中对 `contextWindow` 的检查。

### 3.3. 类型定义层修改

**文件**：[`src/tools/llm-chat/types/agent.ts`](../../types/agent.ts)

- **修改点**：在 `AgentKnowledgeSettings` 接口中，将 `contextWindow` 标记为 `@deprecated`，并添加清晰的注释说明其已被废弃，检索已固定为最近一对消息。
- **原因**：保留字段定义但标记为废弃，可以确保旧的智能体配置文件在反序列化加载时不会抛出 TypeScript 类型错误，同时阻止新代码继续使用该字段。

```typescript
export interface AgentKnowledgeSettings {
  // ... 其他字段保持不变 ...

  /**
   * 查询上下文窗口（轮数）
   * @deprecated 已废弃。检索机制已重构，现在固定以最近一对 AI/User 消息作为检索查询，不再支持多轮窗口配置。
   */
  contextWindow?: number;
}
```

### 3.4. 架构文档同步

**文件**：[`src/tools/knowledge-base/ARCHITECTURE.md`](../../../knowledge-base/ARCHITECTURE.md)

- **修改点**：更新 `3.2. 检索流程 (Retrieval Flow)` 中的第 4 步描述。
- **修改前**：
  > - 从最近 N 轮对话中分别提取 User 文本 and AI 文本。
- **修改后**：
  > - 固定从最近一轮对话中分别提取最新的 User 文本和 AI 文本（严格排除 tool 消息，避免多轮历史和工具调用数据引入噪声）。

---

## 4. 验证与测试计划

1. **编译检查**：运行 `bun run check:frontend` 确保没有因移除或废弃字段导致的 TypeScript 编译错误。
2. **功能验证**：
   - 创建/编辑智能体，确认“知识库高级设置”中不再显示“上下文窗口（轮数）”滑块。
   - 在聊天会话中触发知识库检索，观察控制台日志或 RAG Trace，确保检索正常触发，且 `primaryQuery` 和 `secondaryQuery` 仅包含最近一轮的 User 和 AI 文本。
   - 检查旧版智能体配置导入，确保含有 `contextWindow` 字段的旧配置能平稳加载且不报错。
