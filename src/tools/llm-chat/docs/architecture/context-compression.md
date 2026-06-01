# LLM Chat: 上下文压缩功能说明

本文档描述了 LLM Chat 中上下文压缩功能的实际实现架构与交互逻辑。

## 1. 设计理念：非破坏性遮罩

与传统的“上下文截断（直接丢弃旧消息）”不同，本项目采用**非破坏性遮罩**方案：

- **压缩不是删除**：原始消息依然保留在对话树中。
- **摘要替代**：将一组旧消息折叠为一个“摘要节点”，在构建 LLM 上下文时，使用摘要内容替代被隐藏的原始消息。
- **视觉反馈**：在 UI 上，被压缩的消息以半透明遮罩形式显示，确保用户对上下文变化有感知。

## 2. 核心功能

### 2.1. 触发机制

由 `triggerMode` 与 `autoTrigger` 两个维度共同决定，**不再是简单的"自动/对话后/手动"三分法**。逻辑封装在 [`useContextCompressor.ts`](../../composables/features/useContextCompressor.ts) 中：

- **触发维度 ([`triggerMode`](../../types/llm.ts:382))**：决定"用什么指标判断该不该压缩"，取值为 `"token" | "count" | "both"`：
  - **`token`**（默认）：仅当当前活跃路径的总 Token 数超过 `tokenThreshold`（默认 80000）时判定为需要压缩。
  - **`count`**：仅当当前路径的有效消息条数超过 `countThreshold`（默认 50）时判定为需要压缩。
  - **`both`**：Token 或消息条数任一超阈值即判定为需要压缩（**OR 关系**，见 [`shouldCompress()`](../../composables/features/useContextCompressor.ts:66)）。
  - **公共门槛**：所有模式都还要先满足 `minHistoryCount`（默认 15）这一最小历史条数门槛，否则直接早退（见 [`useContextCompressor.ts:52`](../../composables/features/useContextCompressor.ts:52)）。
- **自动触发开关 ([`autoTrigger`](../../types/llm.ts:380))**：默认 `true`，决定"满足触发条件后是否自动执行"。设为 `false` 时即便阈值满足也不会自动压缩，仅保留手动入口。`useChatResponseHandler` 在每次助手消息完成后会异步调用 [`checkAndCompress()`](../../composables/features/useContextCompressor.ts:421)，由该函数同时检查 `enabled` 与 `autoTrigger`。
- **手动触发**: 用户可通过 [`manualCompress()`](../../composables/features/useContextCompressor.ts:450)（工具栏按钮）调用，**忽略 `autoTrigger` 与 `triggerMode` 的阈值判断**，但仍受 `enabled` 与保护区数量限制约束。

### 2.1.1 配置位置与动态开关

- **配置位置**: 压缩配置位于智能体的模型参数 ([`LlmParameters.contextCompression`](../../types/llm.ts:226)) 中，类型为 [`ContextCompressionConfig`](../../types/llm.ts:376)，实现了按 Agent 的精细化控制。
- **动态开关**: 工具栏中的压缩按钮会根据当前智能体是否启用了压缩功能（`isContextCompressionEnabled`）动态决定其可用性。

### 2.2. 增量摘要生成

系统支持**增量摘要（续写）**能力：

- 如果压缩范围涉及之前的摘要节点，系统会调用续写 Prompt（`CONTINUE_CONTEXT_COMPRESSION_PROMPT`）。
- LLM 会参考“旧摘要”和“新消息”生成一份涵盖全量历史的新摘要，避免信息在多次压缩中丢失。

### 2.3. 压缩范围策略

- **保护区**：通过 `protectRecentCount`（默认 10）保留最近 N 条消息不被压缩，以维持 LLM 的短期记忆和对话连贯性。
- **压缩量**：通过 `compressCount`（默认 20）控制单次压缩的最大消息条数，从最早的可见消息开始执行。
- **可逆性**：虽然压缩节点在构建 LLM 上下文时会替代原始消息，但原始消息节点并未被删除，用户可以随时展开查看或回滚。

## 3. 技术实现

### 3.1. 数据结构

压缩节点是一个特殊的 `ChatMessageNode`，其元数据包含：

- `isCompressionNode: true`：标识此为摘要节点。
- `compressedNodeIds: string[]`：记录被此节点“遮罩”隐藏的消息 ID 列表。
- `originalTokenCount` / `originalMessageCount`：记录压缩前的统计数据。

### 3.2. UI 表现

- **消息列表**：[`MessageList.vue`](src/tools/llm-chat/components/message/MessageList.vue) 会计算当前路径上所有被隐藏的节点 ID。
- **遮罩效果**：[`ChatMessage.vue`](src/tools/llm-chat/components/message/ChatMessage.vue) 接收 `isCompressed` 属性，被压缩的消息会呈现半透明状态（`opacity: 0.5`）。
- **摘要渲染**：使用专门的 [`CompressionMessage.vue`](src/tools/llm-chat/components/message/CompressionMessage.vue) 组件展示摘要内容及压缩统计。

## 4. 配置管理

配置项已集成在**智能体（Agent）参数设置**中，通过 [`ContextCompressionConfigPanel.vue`](src/tools/llm-chat/components/agent/parameters/ContextCompressionConfigPanel.vue) 进行管理。

主要配置项包括：

- **启用开关**：是否开启此智能体的压缩功能。
- **自动触发开关**：是否在发送时自动检测。
- **触发阈值**：基于 Token 数或消息数。
- **保护区设置**：保留最近不压缩的消息数量。
- **提示词自定义**：支持自定义初始摘要和续写摘要的 Prompt 模板。

---

_注：本功能由 `useContextCompressor` 核心模块驱动，确保了在保持长文本会话能力的同时，最大限度降低 Token 消耗。_

