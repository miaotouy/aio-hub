# 多会话架构现状调查与重构对齐报告

> **状态**: Phase 1/2 已施工 / Phase 3/4 待施工
> **作者**: 咕咕 (Gugu_Kilo)
> **日期**: 2026-07-01
> **针对文档**: [`multi-session-architecture.md`](src/tools/llm-chat/docs/Plan/multi-session-architecture.md)

---

## 1. 施工前现状大盘点

在动手重构之前，我对 [`llmChatStore.ts`](src/tools/llm-chat/stores/llmChatStore.ts)、[`useChatHandler.ts`](src/tools/llm-chat/composables/chat/useChatHandler.ts)、[`useChatExecutor.ts`](src/tools/llm-chat/composables/chat/useChatExecutor.ts) 和 [`useGraphActions.ts`](src/tools/llm-chat/composables/visualization/useGraphActions.ts) 进行了深入的源码级调查。

我们发现，项目在之前的迭代中，为了支持**分离窗口同步**、**节点级中止**和**排队生成**，已经提前埋下了很多多会话友好的种子，但它们目前与全局状态处于一种“微妙的半解耦平衡”中。

### 1.1 已有的多会话友好设计（资产）

1. **数据结构天然支持**：`sessionIndexMap` 和 `sessionDetailMap` 已经是 Map 结构，支持按 `sessionId` 存储和按需加载。
2. **生成状态已节点化**：`generatingNodes` 是一个全局 `Set<string>`（存储正在生成的 `nodeId`），`abortControllers` 是一个全局 `Map<string, AbortController>`。
3. **已有按会话查询生成态的函数**：
   - `isSessionGenerating(sessionId)`：通过遍历会话节点是否在 `generatingNodes` 中来判断。
   - `getSessionGeneratingNodeIds(sessionId)`：获取指定会话中正在生成的节点。
   - `findSessionIdByNodeId(nodeId)`：通过节点 ID 反查所属会话。
4. **排队机制已会话隔离**：`queuedSessionIds` 记录了排队中的会话，`triggerQueuedGenerationForSession(sessionId)` 也是会话级触发的，避免了全局锁。

### 1.2 施工前隐式绑定与全局瓶颈（负债）

1. **`isSending` 曾是全局 Ref**：`isSending` 在 Store 中定义为 `ref(false)`。在 `sendMessage`、`continueGeneration`、`regenerateFromNode` 等主流程中，存在大量手动的 `isSending.value = true/false` 赋值。
2. **`historyManager` 绑定当前会话**：Store 中只有一个全局的 `historyManager` 实例，它在初始化时绑定了 `currentSessionDetail` 的 computed ref。
3. **`useGraphActions` 深度绑定当前会话和全局历史管理器**：
   - 初始化签名：`useGraphActions(currentSession, currentSessionId, historyManager, sessionIndexMap)`。
   - 内部方法（如 `editMessage`、`deleteMessage`、`switchBranch` 等）全部隐式使用了传入的 `currentSession`（即当前会话）和全局 `historyManager`。
4. **主流程深度依赖 `agentStore.currentAgentId`**：
   - `useChatHandler.sendMessage` 内部直接读取 `agentStore.currentAgentId`。
   - `useChatExecutor.executeRequest` 内部也直接读取 `agentStore.currentAgentId`。
   - 这导致后台 SubAgent 无法在不干扰前台 UI 的情况下，使用独立的 Agent 执行生成。

---

## 2. 重构冲突点与“功能堆叠陷阱”识别

如果直接照着 RFC 计划干活，我们会立刻掉入以下编译错误和逻辑冲突的深渊：

### ⚠️ 陷阱一：`isSending` 改为 Computed 导致的写入报错

- **冲突**：RFC 计划将 `isSending` 改为由 `generatingNodes.value.size > 0` 推导的 computed 属性。
- **后果**：一旦改为 computed，现有 `sendMessage`、`continueGeneration`、`regenerateFromNode` 等方法中的 `isSending.value = true` 和 `isSending.value = false` 赋值语句将直接触发 **Vue 编译错误或运行时只读警告**。
- **对齐方案**：在将 `isSending` 改为 computed 的同时，**必须彻底清理**所有对 `isSending.value` 的手动赋值，改由 `generatingNodes` 的 `add/delete` 自动驱动。

### ⚠️ 陷阱二：`useGraphActions` 签名变更导致的历史记录丢失与编译崩溃

- **冲突**：RFC 计划将 `historyManager` 改为按 `sessionId` 缓存的 Map。
- **后果**：`useGraphActions` 在初始化时接收了全局的 `historyManager`。如果直接改变 `historyManager` 的生命周期，`useGraphActions` 内部的图操作将无法找到正确的历史管理器，导致撤销/重做栈混乱，甚至在非当前会话操作时崩溃。
- **对齐方案**：必须重构 `useGraphActions` 的设计。
  - **方案 A（渐进式，推荐）**：保持 `useGraphActions` 签名不变，但内部的方法（如 `editMessage`）在执行时，动态从 Store 获取对应会话的 `historyManager`。
  - **方案 B（彻底解耦）**：重构 `useGraphActions` 签名，使其不再在初始化时绑定 `currentSession` 和 `historyManager`，而是接收 `getSessionDetail(sessionId)` 和 `getHistoryManager(sessionId)` 的 Getter 函数。

### ⚠️ 陷阱三：排队自动触发与 `isSending` 的竞态条件

- **冲突**：`triggerQueuedGenerationForSession` 内部有手动的 `isSending.value = true` 赋值，且在 `finally` 块中检查 `generatingNodes.value.size === 0` 来重置 `isSending.value = false`。
- **后果**：如果清理了手动赋值，排队触发时的状态流转必须完全依赖 `generatingNodes` 的变化。如果节点状态更新不及时，可能会导致排队任务无法正确触发或状态闪烁。
- **对齐方案**：确保在调用 `chatHandler.regenerateFromNode` 或 `continueGeneration` 之前，目标节点已经正确加入 `generatingNodes` 集合。

---

## 3. 渐进式重构对齐方案

为了安全、优雅地实现多会话架构，我将重构方案细化为以下四个步骤，确保每一步都可编译、可测试、不破坏现有功能。

### 3.1 Phase 1: 消除 `isSending` 全局写入瓶颈

#### 目标

将 `isSending` 变为只读的 computed 属性，完全由 `generatingNodes` 驱动，消除所有手动的 `isSending.value = ...` 赋值。

#### 实施步骤

1. **修改 `llmChatStore.ts` 中的 `isSending` 定义**：
   ```typescript
   // 废弃全局 isSending ref，改为由 generatingNodes 驱动的 computed
   const isSending = computed(() => generatingNodes.value.size > 0);
   ```
2. **清理 Store 内部的手动赋值**：
   - 搜索并删除 `llmChatStore.ts` 中所有的 `isSending.value = true` 和 `isSending.value = false`。
   - 涉及方法：`sendMessage`、`continueGeneration`、`regenerateFromNode`、`triggerQueuedGenerationForSession`、`abortSending`、`abortNodeGeneration`。
3. **验证状态流转**：
   - 检查 `generatingNodes` 的 `add` 和 `delete` 是否在所有主流程的 `try...finally` 中被正确调用。
   - 确认前台 UI 的发送按钮禁用状态、加载动画依然能完美响应 `isSending`。

---

### 3.2 Phase 2: 解耦 Agent 依赖（支持后台 SubAgent）

#### 目标

让发送和生成主流程接受显式的 `agentId` 和 `sessionId`，不再隐式依赖全局 UI 状态。

#### 实施步骤

1. **重构 `useChatHandler.sendMessage` 签名**：

   ```typescript
   const sendMessage = async (
     session: ChatSessionDetail,
     content: string,
     _activePath: ChatMessageNode[],
     abortControllers: Map<string, AbortController>,
     generatingNodes: Set<string>,
     options?: {
       attachments?: Asset[];
       temporaryModel?: ModelIdentifier | null;
       parentId?: string;
       disableMacroParsing?: boolean;
       skipGeneration?: boolean;
       agentId?: string; // ★ 新增：显式指定 AgentId
     },
     currentSessionId?: string | null
   ): Promise<void>
   ```

   - 内部逻辑修改：
     ```typescript
     // 优先使用显式传入的 agentId，回退到全局选中的
     const effectiveAgentId = options?.agentId || agentStore.currentAgentId;
     if (!effectiveAgentId) throw new Error("请先选择一个智能体");
     ```

2. **重构 `useChatExecutor.executeRequest` 及其依赖**：
   - 确保 `executeRequest` 内部使用的 `agentConfig` 和 `executionAgent` 优先从传入的 `agentConfig` 参数中获取，而不是隐式读取 `agentStore.currentAgentId`。
3. **重构 Store 层的 `sendMessage` 签名**：

   ```typescript
   async function sendMessage(
     content: string,
     options?: {
       attachments?: Asset[];
       temporaryModel?: ModelIdentifier | null;
       parentId?: string;
       disableMacroParsing?: boolean;
       agentId?: string; // ★ 新增
       sessionId?: string; // ★ 新增：支持向非当前会话发送消息
     }
   ): Promise<void>;
   ```

   - 内部逻辑修改：

     ```typescript
     const targetSessionId = options?.sessionId || currentSessionId.value;
     if (!targetSessionId) throw new Error("请先创建或选择一个会话");

     const index = sessionIndexMap.value.get(targetSessionId);
     const detail = sessionDetailMap.value.get(targetSessionId);
     if (!index || !detail) throw new Error("会话不存在");

     // 后续逻辑全部使用 targetSessionId, index, detail，而非全局 currentSession
     ```

---

### 3.3 Phase 3: 会话级历史管理器与图操作解耦

#### 目标

让每个会话拥有独立的历史管理器实例，并使 `useGraphActions` 支持对任意会话执行图操作。

#### 实施步骤

1. **在 `llmChatStore.ts` 中引入 `historyManagerMap`**：

   ```typescript
   const historyManagerMap = new Map<
     string,
     ReturnType<typeof useSessionNodeHistory>
   >();

   function getHistoryManager(
     sessionId: string
   ): ReturnType<typeof useSessionNodeHistory> {
     let manager = historyManagerMap.get(sessionId);
     if (!manager) {
       const detailRef = computed(
         () => sessionDetailMap.value.get(sessionId) || null
       );
       manager = useSessionNodeHistory(detailRef as any);
       historyManagerMap.set(sessionId, manager);
     }
     return manager;
   }

   // 向后兼容全局 historyManager
   const historyManager = computed(() => {
     if (!currentSessionId.value) return null;
     return getHistoryManager(currentSessionId.value);
   });
   ```

2. **重构 `useGraphActions.ts` 的初始化与内部实现**：
   - 修改 `useGraphActions` 签名，使其接收 Getter 函数：
     ```typescript
     export function useGraphActions(
       getSessionDetail: (sessionId: string) => ChatSessionDetail | null,
       getHistoryManager: (sessionId: string) => HistoryManager | null,
       sessionIndexMap: Ref<Map<string, ChatSessionIndex>>,
       currentSessionId: Ref<string | null>
     );
     ```
   - 内部方法（如 `editMessage`）重构：

     ```typescript
     async function editMessage(
       sessionId: string, // ★ 新增参数
       nodeId: string,
       newContent: string,
       attachments?: Asset[]
     ): Promise<void> {
       const session = getSessionDetail(sessionId);
       const hm = getHistoryManager(sessionId);
       if (!session || !hm) return;

       // 原有逻辑，但使用传入的 session 和 hm，而非全局 currentSession.value
     }
     ```

   - 在 `useGraphActions` 内部提供向后兼容的包装，或者在 Store 导出时进行包装，确保现有 UI 调用（不带 `sessionId`）依然能正常工作。

---

### 3.4 Phase 4: 后台会话执行服务 (BackgroundSessionService)

#### 目标

提供一个干净的、独立于 UI 的后台会话执行服务，为未来的 SubAgent 和自动化任务打下坚实基础。

#### 实施步骤

1. **新建 `src/tools/llm-chat/services/backgroundSessionService.ts`**。
2. **实现核心 API**：
   - `createBackgroundSession(agentId, name)`：创建后台会话。
   - `sendToSession(sessionId, content, agentId, options)`：向指定会话发送消息。
   - `waitForCompletion(sessionId, timeout)`：通过监听 `generatingNodes` 变化，异步等待生成完成。
   - `getLatestResponse(sessionId)`：获取最新助手回复。

---

## 4. 验证与测试计划

为了确保重构不引入任何 Regression，我们在每个 Phase 完成后必须进行以下验证：

| 验证项        | 验证操作                           | 预期结果                                         |
| ------------- | ---------------------------------- | ------------------------------------------------ |
| **基础发送**  | 在前台正常发送消息、续写、重新生成 | 消息正常发送，流式响应顺畅，UI 状态正确          |
| **中止生成**  | 在生成过程中点击“停止”按钮         | 节点生成立即中止，状态正确修复为 complete/error  |
| **排队生成**  | 连续快速发送多条消息               | 消息正确进入排队，前一条完成后自动触发下一条     |
| **分离窗口**  | 打开分离窗口进行对话               | 分离窗口与主窗口状态完美同步，发送和中止代理正常 |
| **撤销/重做** | 执行编辑、删除后进行撤销/重做      | 树结构正确恢复，活动路径正确跳转                 |

---

## 5. 施工记录（2026-07-01）

### 5.1 已完成范围

1. **Phase 1: `isSending` 只读化**
   - `llmChatStore.isSending` 已从全局可写 `ref(false)` 改为 `computed(() => generatingNodes.value.size > 0)`。
   - 已清理 `sendMessage`、`continueGeneration`、`regenerateFromNode`、`triggerQueuedGenerationForSession`、`abortSending`、`abortNodeGeneration` 中的手动 `isSending.value = ...` 写入。
   - `useLlmChatStateConsumer` 不再写入 `store.isSending`；分离窗口的发送态由同步后的 `generatingNodes` 推导。

2. **Phase 2: 主发送链路 Agent / Session 解耦**
   - `store.sendMessage(content, { sessionId, agentId })` 已支持向指定会话发送，并保持默认回退当前会话 / 当前 Agent 的兼容行为。
   - `useChatHandler.sendMessage`、`regenerateFromNode`、`continueGeneration` 已支持显式 `agentId`。
   - `useChatExecutor.executeRequest` 已支持显式 `agentId`，执行 Agent 与传入的 `agentConfig` 对齐。
   - `llmChatService` 和 `llm-chat.registry` 的 `sendMessage` 类型已开放 `agentId` / `sessionId`。

### 5.2 实际实现补充

- 为排队生成新增了 `queuedSessionAgentIds`，用于保存同会话排队发送时显式传入的 Agent，避免后台会话排队后回落到 UI 当前 Agent。
- 对非当前会话调用 `sendMessage` 时，不会清空当前输入框，也不会清理当前会话的历史管理器；Phase 3 前仍不对非当前会话提供独立撤销/重做管理器。

### 5.3 已验证

- 已运行 `bun run check:frontend`，通过 `vue-tsc --noEmit`。
