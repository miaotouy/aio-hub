# LLM Chat: 上下文注入机制架构设计

## 1. 背景与目标

为了提升 All-in-One Tools 中 LLM Chat 功能的灵活性和可扩展性，本项目旨在设计并实现一套先进的上下文注入机制。其核心目标是：

1.  **兼容高级预设格式**：为将来支持导入外部预设格式（如 SillyTavern 角色卡）的复杂上下文规则（如世界信息、作者备注的指定位置注入）奠定基础。
2.  **提升灵活性**：允许用户和未来的插件开发者更精确地控制智能体 (Agent) 的预设消息在对话历史中的插入位置。
3.  **确保扩展性**：设计一套面向未来的架构，支持多个、具名的注入锚点，为插件化开发提供便利。

## 2. 核心设计原则

*   **向后兼容 (Backward Compatibility)**：所有现存的智能体预设必须能够无缝工作，其行为与更新前完全一致。
*   **声明式定义 (Declarative Definition)**：上下文的结构应通过 `agent.presetMessages` 中的数据声明式地定义，而不是通过复杂的代码逻辑。核心构建函数应是纯函数。
*   **可扩展性 (Extensibility)**：架构应能轻松支持新的注入点和注入规则，而无需大规模重构核心逻辑。
*   **清晰与内聚 (Clarity & Cohesion)**：所有上下文构建逻辑应内聚在 `useChatContextBuilder.ts` 中，数据结构定义应清晰明了。

## 3. 方案设计

本方案的核心是从“单一历史占位符”模式升级为“多具名锚点系统”。

### 3.1. 数据结构扩展

我们将对 `src/tools/llm-chat/types/message.ts` 中的 `ChatMessageNode` 接口进行扩展，增加以下可选字段：

```typescript
// in: src/tools/llm-chat/types/message.ts
export interface ChatMessageNode {
  // ... existing fields

  /**
   * 上下文注入深度（相对于会話歷史）
   * - 正数: 从头开始的位置 (0 是最旧消息之前)
   * - 负数: 从末尾开始的位置 (-1 是最新消息之后)
   * @example 0 - 插入在所有历史记录之前
   * @example -1 - 插入在所有历史记录之后（但在用户新消息之前）
   */
  insertionPoint?: number;

  /**
   * 注入的锚点，相对于由 `anchorTarget` 指定的占位符。
   * 'before': 插入在占位符之前
   * 'after': 插入在占位符之后
   */
  anchorPoint?: 'before' | 'after';

  /**
   * 注入锚点的目标ID。
   * 如果未定义，则默认目标为 `type: 'chat_history'` 的主历史锚点。
   * 如果定义了值（例如 "world_info"），它将寻找 `type: 'placeholder'` 且 `id: 'world_info'` 的锚点。
   */
  anchorTarget?: string;
}

// 同时，扩展 `MessageType`
// in: src/tools/llm-chat/types/common.ts
export type MessageType =
  | 'message' // 普通预设消息
  | 'chat_history' // 历史消息占位符（主锚点）
  | 'user_profile' // 用户档案占位符
  | 'placeholder'; // 通用具名锚点
```

`type: 'placeholder'` 的节点自身不会被渲染为内容，而是作为注入点存在，其 `id` 就是锚点的名称。

### 3.2. 上下文构建流程重构 (`buildLlmContext`)

我们将采用“三阶段构建法”重构 `useChatContextBuilder.ts` 中的 `buildLlmContext` 函数。

#### 阶段一：扫描与分组 (Scan & Group)

1.  **扫描锚点**: 遍历 `presetMessages`，找出所有 `type: 'placeholder'` 和 `type: 'chat_history'` 的节点，记录所有可用锚点。`chat_history` 锚点被视为一个特殊的、ID 为 `__CHAT_HISTORY__` 的默认锚点。
2.  **消息分组**: 再次遍历 `presetMessages`，根据注入规则将它们分类：
    *   `systemMessages`: 所有 `role: 'system'` 的消息。
    *   `deepInsertionMessages`: 定义了 `insertionPoint` 的消息。
    *   `anchoredMessages`: 一个 `Map<string, { before: ChatMessageNode[], after: ChatMessageNode[] }>` 结构，用于存放需要注入到特定锚点前后的消息。
    *   `skeletonMessages`: 除去以上所有特殊消息后，剩下的、构成上下文骨架的普通消息和锚点节点。

#### 阶段二：核心上下文构建 (Core Context Assembly)

1.  获取 `sessionContext`（原始会话历史）。
2.  应用 Token 限制，对 `sessionContext` 进行截断。
3.  将 `deepInsertionMessages` 按 `insertionPoint` 规则注入到截断后的 `sessionContext` 中，形成“增强版会话历史”。

#### 阶段三：骨架填充 (Skeleton Population)

1.  创建一个空的结果数组 `finalUserAssistantMessages`。
2.  遍历 `skeletonMessages` 骨架：
    *   如果当前项是普通消息，直接推入结果数组。
    *   如果当前项是锚点：
        a.  从 `anchoredMessages` 中取出该锚点对应的 `before` 数组，推入结果数组。
        b.  如果这是主历史锚点 (`__CHAT_HISTORY__`)，则将“增强版会话历史”整个推入结果数组。
        c.  从 `anchoredMessages` 中取出该锚点对应的 `after` 数组，推入结果数组。
3.  最后，将 `systemMessages` 整体置于所有 `finalUserAssistantMessages` 之前，构成最终发送给 LLM 的消息列表。

### 3.3. Mermaid 流程图

```mermaid
graph TD
    A[开始: buildLlmContext] --> B{阶段一: 扫描与分组};
    B --> B1[扫描锚点 (placeholder, chat_history)];
    B --> B2[分组: System];
    B --> B3[分组: 深度注入];
    B --> B4[分组: 锚点注入];
    B --> B5[分组: 骨架];

    C[获取会话历史] --> D{阶段二: 核心上下文构建};
    D --> D1[Token 截断];
    B3 --> D2[注入 '深度' 消息];
    D1 --> D2 --> D3[生成 '增强版会话历史'];

    E{阶段三: 骨架填充};
    B5 --> E;
    B4 --> E;
    D3 --> E;

    E --> F[生成 User/Assistant 消息列表];
    B2 --> G[添加 System 消息];
    F --> G;

    G --> H[返回最终消息列表];
```

## 4. 扩展性分析

*   **多锚点支持**: 通过定义多个 `type: 'placeholder'` 的节点并赋予不同 `id`，可以轻松创建如 `{{world_info}}`, `{{author_note}}`, `{{example_dialogue}}` 等多个注入点，完全兼容 SillyTavern 的设计思想。
*   **插件化开发**: 未来的插件系统可以通过 API 向 `agent.presetMessages` 数组中动态添加 `ChatMessageNode`。例如，一个“代码解释器”插件可以注入一个 `system` 消息来声明可用工具，或通过 `anchorTarget` 将示例用法注入到主历史记录之前，整个过程无需修改聊天核心代码。
*   **向后兼容**: 没有定义任何新注入字段的现有智能体，在新的流程中，其所有预设消息都会被归类为 `skeletonMessages` 或 `systemMessages`，`chat_history` 作为一个无 `anchorTarget` 的默认锚点，其行为将与旧版完全一致。

## 5. 伪代码示例

一个高级预设的 `presetMessages` 可能如下所示：

```json
[
  { "role": "system", "content": "这是全局系统提示。" },
  { "id": "world_info_placeholder", "type": "placeholder", "role": "user" },
  {
    "role": "user",
    "content": "这是世界信息...",
    "anchorTarget": "world_info_placeholder",
    "anchorPoint": "before"
  },
  { "type": "chat_history", "role": "user" },
  {
    "role": "user",
    "content": "记住，你是一个乐于助人的助手。",
    "insertionPoint": -2
  }
]
```
