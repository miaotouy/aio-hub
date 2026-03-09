# LLM Chat 续写与补全功能说明文档

本文档描述了 LLM Chat 工具中已实现的“续写 (Continue)”与“输入补全 (Input Completion)”功能的架构与使用方式。

## 1. 功能概述

该功能旨在解决长文本生成中断、内容增量补充以及写作辅助等场景。它包含两个核心维度：

1.  **消息续写**: 在对话历史中的任意消息节点基础上继续生成。
2.  **输入补全**: 在输入框撰写过程中，请求 AI 协助完成后续文本。

## 2. 消息续写 (Message Continuation)

### 2.1 交互入口

- **位置**: 消息操作栏 (`MessageMenubar.vue`) -> 更多菜单 (`Menu`)。
- **选项**:
  - **续写消息**: 使用当前智能体或临时指定的模型从该节点继续生成。
  - **选择模型续写**: 弹出模型选择器，指定特定模型进行续写。

### 2.2 实现原理

1.  **分支创建**: 调用 `nodeManager.createContinuationBranch`。
    - 如果是 **Assistant 消息续写**：新节点内容初始为空，父节点为当前消息。在请求时，当前消息被标记为 `prefix: true`。
    - 如果是 **User 消息续写**：新节点为 Assistant 角色，父节点为当前 User 消息，实现“角色换位”式的接话。
2.  **请求执行**: `useChatHandler` 调用 `executeRequest` 并设置 `isContinuation: true`。
3.  **协议适配**:
    - **DeepSeek**: 将最后一条 Assistant 消息标记为 `prefix: true`。
    - **Claude/Gemini**: 利用 Prefill 特性，将前缀内容作为 Assistant 消息放入消息列表末尾。
    - **通用模式**: 对于不支持原生 Prefix 的模型，通过 System Prompt 引导模型从指定位置开始续写。

## 3. 输入框补全 (Input Completion)

### 3.1 交互入口

- **位置**: 输入框工具栏 (`MessageInputToolbar.vue`) -> 更多工具 (`MoreHorizontal`)。
- **功能**:
  - **智能补全**: 触发 AI 对当前输入框内容的补全。
  - **指定补全模型**: 允许用户为补全功能设置一个独立的模型（不同于当前对话智能体），设置后会在工具栏显示星形图标 (`Sparkles`) 标识。

### 3.2 实现原理

1.  **独立请求**: `useChatHandler.completeInput` 发起一个不创建 Chat Node 的临时 LLM 请求。
2.  **上下文构建**:
    - `system`: 引导模型作为写作助手，仅输出补全部分，不要重复输入。
    - `user`: 传递当前输入框的文本内容。
3.  **结果回填**: 获取响应后，将文本直接追加到 `inputManager` 绑定的变量中。

## 4. 技术细节

### 4.1 协议定义 (`src/llm-apis/common.ts`)

```typescript
export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string | LlmMessageContent[];
  /**
   * 是否作为续写前缀 (DeepSeek / Claude Prefill)
   * 如果为 true，该消息必须是列表中的最后一条，且 role 通常为 assistant
   */
  prefix?: boolean;
}
```

### 4.2 状态管理 (`src/tools/llm-chat/stores/llmChatStore.ts`)

- `continueGeneration(nodeId, options)`: 封装了续写逻辑的调用与生成状态管理。
- `completeInput(content, options)`: 封装了补全逻辑并将结果写回输入管理器。

## 5. 注意事项

- **Token 统计**: 续写的前缀内容在计费时被视为 `prompt_tokens`。系统在预估时已将其包含在内。
- **模型兼容性**: 并非所有模型都完美支持 `prefix` 模式。在不支持的模型上，系统会回退到基于 Prompt 引导的“模拟续写”模式。
