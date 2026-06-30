# 多会话架构现状调查与重构对齐报告

> **状态**: Manager 拆分 + 多会话核心/草稿/生命周期已施工；完整多窗口 UI 与后台会话服务待施工
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

3. **Manager 拆分与 Pinia facade 初步瘦身**
   - 新增 `stores/session/sessionAccessManager.ts`，统一 `sessionId/index/detail` 解析、active path 计算和 `nodeId -> sessionId` 反查。
   - 新增 `stores/session/sessionRuntimeManager.ts`，集中管理生成节点、AbortController、会话队列和按会话中止。
   - 新增 `stores/session/sessionHistoryManager.ts`，按会话懒创建历史管理器，提供 `getHistoryManager(sessionId)` / `undo(sessionId)` / `redo(sessionId)`。
   - 新增 `stores/session/sessionGenerationManager.ts`，承接 `sendMessage`、`continueGeneration`、`regenerateFromNode`、`completeInput` 和排队自动触发逻辑。

4. **多会话核心修正**
   - 非当前会话 `sendMessage` 使用目标会话的 active path，不再读取 `currentActivePath.value`。
   - `continueGeneration` / `regenerateFromNode` 会优先通过 `nodeId` 反查会话，并允许显式 `sessionId` 覆盖。
   - `abortSending(sessionId?)` 可按会话中止；无参数时保持当前会话兼容行为。
   - `useGraphActions` 兼容旧调用，同时支持显式 `sessionId`，图操作历史写入目标会话的 history manager。
   - `useLlmChatSync`、分离输入/聊天区域代理、`LlmChat.vue` 发送入口已补齐 `sessionId` 透传。

5. **会话级输入草稿**
   - `useChatInputManager` 内部改为 `sessionId -> draft`，draft 包含文本、附件、临时模型、续写模型。
   - `currentSessionId` 变化时由 store 驱动 `inputManager.setActiveSessionId(sessionId)`，切换会话会恢复各自草稿。
   - 旧 `llm-chat-input-draft` 会在首次绑定真实会话时迁移到该会话；新存储 key 为 `llm-chat-input-drafts`。
   - 新增 `moveDraftToSession(fromSessionId, toSessionId, mode)`，支持 `move` / `copy` 且保留附件。

6. **会话生命周期 Manager 剥离**
   - 新增 `stores/session/sessionLifecycleManager.ts`，承接创建、删除、批删、导入、清空空会话、索引刷新、更新、加载、切换、收藏夹、自动命名、导出 Markdown 与清空全部会话。
   - `llmChatStore.ts` 改为初始化并展开 `sessionLifecycle`，对外 API 名称保持不变。
   - 删除 / 批删 / 清理空会话 / 清空全部会话会统一联动 runtime、history 与 input draft 清理。
   - `sessionRuntimeManager.clearSessionRuntime(sessionId)` 已补强，会释放该会话节点关联的 `AbortController`、`generatingNodes` 与流式消息源。

### 5.2 实际实现补充

- 为排队生成新增了 `queuedSessionAgentIds`，用于保存同会话排队发送时显式传入的 Agent，避免后台会话排队后回落到 UI 当前 Agent。
- 对非当前会话调用 `sendMessage` 时，会清空目标会话 draft，不会清空当前输入框。
- 删除 / 批量删除 / 清空会话时会清理 runtime、history manager 和 draft，避免运行态残留。
- `sessionGenerationManager` 对 chat handler / session manager 采用惰性加载与测试可注入依赖，避免 manager 初始化时拉起完整聊天执行链。

### 5.3 已验证

- 已运行 `bun run check:frontend`，通过 `vue-tsc --noEmit`。
- 已新增并通过 manager 级测试：
  - 非当前会话发送使用目标会话 active path。
  - 两个会话并发生成时按会话中止互不污染。
  - draft copy/move 保留附件，源/目标状态符合预期。

### 5.4 尚未完成 / 后续范围

- 本轮没有实现完整 QQ 式多窗口 UI，也没有新增 `backgroundSessionService.ts`。
- `sessionGraphManager.ts` 尚未单独成文件；本轮是在 `useGraphActions` 内完成 session-aware 改造，并由 store 注入 `sessionDetailMap/getHistoryManager`。
- `CHAT_STATE_KEYS.IS_SENDING` 同步包仍存在；虽然发送态已由 `generatingNodes` 推导，后续仍可继续做同步状态降维。

---

## 6. 会话生命周期（Session Lifecycle）涉及范围深度调查

为了将目前仍堆积在 `llmChatStore.ts` facade 中的会话生命周期逻辑（创建、加载、切换、更新、删除、导入导出、收藏分类、自动命名等）彻底剥离到独立的 `sessionLifecycleManager.ts` 中，我们对这些操作的涉及范围、状态读写、外部依赖和跨模块联动进行了全方位的源码级调查。

### 6.1 生命周期操作大盘点

会话生命周期在 `llmChatStore.ts` 中占据了约 700 行代码（行 419 - 1090，以及 1220 - 1310），主要包含以下 8 个核心维度：

| 维度                          | 核心方法                                                                                                                                                                                                                                        | 职责描述                                                                                                    | 涉及状态 (State)                                                                                 |
| :---------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------- |
| **1. 创建 (Creation)**        | `createSession(agentId, name)`                                                                                                                                                                                                                  | 创建新会话，初始化根节点，插入未固化开场白，并设为当前活跃会话。                                            | `sessionIndexMap` (写), `sessionDetailMap` (写), `currentSessionId` (写)                         |
| **2. 加载 (Loading)**         | `loadSessions()`                                                                                                                                                                                                                                | 应用启动时按需加载：先加载轻量级索引，再仅针对当前活跃会话加载完整详情，最后触发索引自愈。                  | `sessionIndexMap` (写), `sessionDetailMap` (写), `currentSessionId` (写), `favoriteFolders` (写) |
| **3. 切换 (Switching)**       | `switchSession(sessionId)`                                                                                                                                                                                                                      | 切换当前活跃会话，按需加载目标会话详情，初始化历史堆栈，同步未固化开场白。                                  | `sessionIndexMap` (读), `sessionDetailMap` (写), `currentSessionId` (写)                         |
| **4. 更新 (Updating)**        | `updateSession(sessionId, updates)`                                                                                                                                                                                                             | 增量更新会话索引或详情，并触发单会话持久化。                                                                | `sessionIndexMap` (写), `sessionDetailMap` (写)                                                  |
| **5. 删除 (Deletion)**        | `deleteSession(sessionId)`<br>`batchDeleteSessions(sessionIds)`<br>`clearEmptySessions(options)`<br>`clearAllSessions()`                                                                                                                        | 删除单个/批量/空/全部会话，清理关联的运行态、历史管理器和输入草稿，若删除的是当前会话则自动切换到邻近会话。 | `sessionIndexMap` (写), `sessionDetailMap` (写), `currentSessionId` (写)                         |
| **6. 导入/导出 (IO)**         | `importSessions(sessions, strategy)`<br>`exportSessionAsMarkdown(sessionId)`                                                                                                                                                                    | 导入外部会话并解决冲突（保留/覆盖/重命名）；将指定会话或当前活跃路径导出为 Markdown。                       | `sessionIndexMap` (写), `sessionDetailMap` (写)                                                  |
| **7. 收藏与分类 (Favorites)** | `toggleFavorite(sessionId)`<br>`createFavoriteFolder(name, icon)`<br>`renameFavoriteFolder(id, name)`<br>`deleteFavoriteFolder(id)`<br>`moveSessionToFolder(id, folderId)`<br>`batchMoveSessionsToFolder(...)`<br>`reorderFavoriteFolders(ids)` | 管理收藏夹的增删改查、排序，以及会话与收藏夹的归属关系，并触发全局索引持久化。                              | `sessionIndexMap` (写), `favoriteFolders` (写)                                                   |
| **8. 自动命名 (Naming)**      | `generateSessionTopic(sessionId, force)`                                                                                                                                                                                                        | 检查会话是否满足自动命名条件，调用 LLM 自动生成简短标题并更新持久化。                                       | `sessionIndexMap` (写), `sessionDetailMap` (写)                                                  |

---

### 6.2 状态读写与所有权边界

在剥离生命周期时，必须严格遵守 Pinia 的状态修改规范。生命周期管理器作为 Store 的子模块，需要对以下状态进行读写：

1. **`sessionIndexMap` & `sessionDetailMap`**：
   - **读操作**：获取会话列表、查找邻近会话、检查会话是否存在。
   - **写操作**：在创建、删除、导入、更新、清理空会话时，需要直接 `set`、`delete` 或增量修改 Map 中的引用。
   - _设计注意_：为了避免响应式风暴，批量操作（如 `setSessions`、`batchDelete`）应采用一次性替换 Map 引用的方式。
2. **`currentSessionId`**：
   - **写操作**：在创建、切换、删除当前会话、清空会话时，需要修改此 Ref。
3. **`favoriteFolders`**：
   - **写操作**：在创建、重命名、删除、重排序收藏夹时，直接修改此数组。

---

### 6.3 外部依赖拓扑

生命周期逻辑并非孤立存在，它深度依赖项目中的多个底层 Composable 和 Service：

```mermaid
graph TD
    SLM[sessionLifecycleManager] -->|核心生命周期底层| SM[useSessionManager]
    SLM -->|按需加载/自愈/持久化| CS[useChatStorageSeparated]
    SLM -->|导入冲突解决| SI[sessionImportExportService]
    SLM -->|未固化开场白同步| GS[greetingService]
    SLM -->|自动生成标题| TN[useTopicNamer]
    SLM -->|导出 Markdown| EM[useExportManager]
    SLM -->|智能体/用户配置加载| AS[agentStore / userProfileStore]
```

- **`useSessionManager`**：提供了 `createSession`、`deleteSession`、`updateSession`、`loadSessionsIndex`、`persistSession`、`persistSessions`、`updateCurrentSessionId` 等底层原子操作。
- **`useChatStorageSeparated`**：负责底层的本地文件 I/O、索引修复（`repairIndex`）和自愈。
- **`greetingService`**：在切换会话或创建会话时，负责调用 `refreshLiveGreetingsIfNeeded` / `insertLiveGreetings` 动态同步未固化开场白。
- **`useTopicNamer`**：在 `generateSessionTopic` 中负责调用 LLM 提炼标题。

---

### 6.4 跨模块生命周期联动（清理契约）

当会话生命周期发生变化（特别是**删除**或**切换**）时，必须联动清理或更新其他子模块，防止内存泄漏或运行态残留：

```mermaid
graph LR
    Lifecycle[会话生命周期变化] -->|删除会话| Runtime[sessionRuntimeManager<br/>- 中止生成<br/>- 清理 AbortController<br/>- 移出队列]
    Lifecycle -->|删除会话| History[sessionHistoryManager<br/>- 销毁对应的历史管理器]
    Lifecycle -->|删除会话| Draft[useChatInputManager<br/>- 清空该会话的输入草稿]
    Lifecycle -->|切换会话| Draft2[useChatInputManager<br/>- 激活并恢复目标会话草稿]
    Lifecycle -->|清空全部| KB[knowledge-base<br/>- 调用 clearRetrievalCache 清空检索缓存]
```

1. **联动 `sessionRuntime`**：
   - 删除会话时，必须调用 `sessionRuntime.clearSessionRuntime(sessionId)`，中止该会话所有正在生成的节点，清理 `AbortController`，并从 `queuedSessionIds` 和 `queuedSessionAgentIds` 中移除。
2. **联动 `sessionHistory`**：
   - 删除会话时，必须调用 `sessionHistory.cleanupSession(sessionId)`，从 `historyManagerMap` 中销毁该会话的历史栈，释放内存。
3. **联动 `inputManager`**：
   - 切换会话时，必须调用 `inputManager.setActiveSessionId(sessionId)`，以恢复目标会话的草稿。
   - 删除会话时，必须调用 `inputManager.clearDraft(sessionId)`，清空其草稿。
   - 清空所有会话时，必须调用 `inputManager.clearAllDrafts()`。

---

## 7. 会话生命周期重构迁移规划

为了将生命周期逻辑从 `llmChatStore.ts` 优雅地剥离到 `stores/session/sessionLifecycleManager.ts`，我们制定了以下迁移方案。

### 7.1 目标架构设计

新建 `src/tools/llm-chat/stores/session/sessionLifecycleManager.ts`，其结构与 `sessionGenerationManager.ts` 保持一致，采用依赖注入和惰性加载模式。

```typescript
// stores/session/sessionLifecycleManager.ts

export interface LifecycleState {
  sessionIndexMap: Ref<Map<string, ChatSessionIndex>>;
  sessionDetailMap: Ref<Map<string, ChatSessionDetail>>;
  currentSessionId: Ref<string | null>;
  favoriteFolders: Ref<FavoriteFolder[]>;
}

export interface LifecycleManagers {
  runtime: ReturnType<typeof createSessionRuntimeManager>;
  history: ReturnType<typeof createSessionHistoryManager>;
  executeOrProxy: <T>(action: string, params: unknown, localFn: () => T | Promise<T>) => Promise<T>;
}

export function createSessionLifecycleManager(
  state: LifecycleState,
  managers: LifecycleManagers
) {
  // 惰性加载外部依赖，避免循环引用和初始化开销
  const getSessionManager = async () => {
    const { useSessionManager } = await import("../../composables/session/useSessionManager");
    return useSessionManager();
  };

  const getStorage = async () => {
    const { useChatStorageSeparated } = await import("../../composables/storage/useChatStorageSeparated");
    return useChatStorageSeparated();
  };

  const getInputManager = async () => {
    const { useChatInputManager } = await import("../../composables/input/useChatInputManager");
    return useChatInputManager();
  };

  // --- 核心生命周期方法实现 ---
  async function createSession(agentId: string, name?: string): Promise<string> { ... }
  async function deleteSession(sessionId: string): Promise<void> { ... }
  async function batchDeleteSessions(sessionIds: string[]): Promise<void> { ... }
  async function switchSession(sessionId: string): Promise<void> { ... }
  async function updateSession(sessionId: string, updates: Partial<...>): Promise<void> { ... }
  async function loadSessions(): Promise<void> { ... }
  function persistSessions(): void { ... }
  async function clearEmptySessions(options?: { preferredOrderIds?: string[] }): Promise<number> { ... }
  async function clearAllSessions(): Promise<void> { ... }

  // --- 收藏夹管理 ---
  async function toggleFavorite(sessionId: string): Promise<void> { ... }
  async function createFavoriteFolder(name: string, icon?: string): Promise<string> { ... }
  async function renameFavoriteFolder(folderId: string, name: string): Promise<void> { ... }
  async function deleteFavoriteFolder(folderId: string): Promise<void> { ... }
  async function moveSessionToFolder(sessionId: string, folderId: string | null): Promise<void> { ... }
  async function batchMoveSessionsToFolder(sessionIds: string[], folderId: string | null): Promise<void> { ... }
  async function reorderFavoriteFolders(folderIds: string[]): Promise<void> { ... }

  // --- 自动命名与导入导出 ---
  async function generateSessionTopic(sessionId?: string, force?: boolean): Promise<void> { ... }
  async function importSessions(sessions: ExportableChatSession[], strategy: ...): Promise<...> { ... }
  function exportSessionAsMarkdown(sessionId?: string): string { ... }

  return {
    createSession,
    deleteSession,
    batchDeleteSessions,
    switchSession,
    updateSession,
    loadSessions,
    persistSessions,
    clearEmptySessions,
    clearAllSessions,
    toggleFavorite,
    createFavoriteFolder,
    renameFavoriteFolder,
    deleteFavoriteFolder,
    moveSessionToFolder,
    batchMoveSessionsToFolder,
    reorderFavoriteFolders,
    generateSessionTopic,
    importSessions,
    exportSessionAsMarkdown,
  };
}
```

### 7.2 迁移步骤与安全保障

1. **第一步：创建 `sessionLifecycleManager.ts`**
   - 将 `llmChatStore.ts` 中的生命周期方法完整搬迁到新文件中。
   - 使用 `state` 引用读写 Pinia 状态，使用 `managers` 联动 Runtime 和 History。
   - 外部依赖（如 `useSessionManager`、`useChatStorageSeparated`、`useChatInputManager`、`useTopicNamer`）全部改为异步 `import()` 惰性加载，确保测试时可轻松 Mock。

2. **第二步：在 `llmChatStore.ts` 中集成与导出**
   - 在 Store 中初始化 `sessionLifecycle`：
     ```typescript
     const sessionLifecycle = createSessionLifecycleManager(
       {
         sessionIndexMap,
         sessionDetailMap,
         currentSessionId,
         favoriteFolders,
       },
       {
         runtime: sessionRuntime,
         history: sessionHistory,
         executeOrProxy,
       }
     );
     ```
   - 在 Store 的返回对象中，将生命周期方法展开或直接代理导出，保持向后兼容，确保 UI 层和外部调用无需修改任何一行代码。

3. **第三步：编写单元测试**
   - 针对 `sessionLifecycleManager` 编写完善的单元测试，覆盖：
     - 创建会话时是否正确插入开场白并初始化历史。
     - 删除当前会话时是否正确切换到邻近会话，并联动清理 Runtime、History 和 Draft。
     - 切换会话时是否按需加载详情并恢复草稿。
     - 收藏夹的增删改查与排序。
     - 自动命名触发逻辑。

<guguthink>
问：“别急，要考虑所谓的向后兼容真实需要吗？还是说其实可以囊括在重构计划中一起带走前往新世界”

这是一个非常深刻的架构师提问。
我们来分析一下“向后兼容”在当前重构中的真实处境：

1. `isSending` 的向后兼容：
   - 之前为了兼容分离窗口，在 `useLlmChatStateConsumer.ts` 里保留了 `CHAT_STATE_KEYS.IS_SENDING` 的订阅，但实际上 `isSending` 已经变成了 `computed(() => generatingNodes.value.size > 0)`。
   - 既然 `generatingNodes` 已经通过 `CHAT_STATE_KEYS.GENERATING_NODES` 完美同步了，那么分离窗口完全可以通过 `syncedGeneratingNodes.value.length > 0` 自动推导出 `isSending`！
   - 也就是说，`CHAT_STATE_KEYS.IS_SENDING` 这个同步状态包完全是冗余的！我们根本不需要在 IPC/WebSocket 上继续广播这个状态。
   - 我们可以直接在 `useLlmChatSync.ts` 和 `useLlmChatStateConsumer.ts` 中把 `IS_SENDING` 彻底干掉，让分离窗口直接用 `generatingNodes` 推导。这就是“一起带走前往新世界”，不需要背着历史包袱。

2. `useGraphActions` 的向后兼容：
   - 现在的 `useGraphActions` 签名绑定了 `currentSession` 和全局 `historyManager`。
   - 如果我们重构它的签名，使其接受 `getSessionDetail` 和 `getHistoryManager` 的 Getter，那么在 `llmChatStore.ts` 内部初始化它时，我们可以直接传入这两个 Getter。
   - 那么，在 `llmChatStore.ts` 导出的 `graphActions` 展开对象中，所有的图操作方法（如 `editMessage`）在 Store 层面暴露出来时，依然是原来的方法名。
   - 外部 UI 组件（比如 `MessageList.vue`、`MessageItem.vue`）调用 `store.editMessage(nodeId, content)` 时，因为我们在 Store 层面做了代理或者在 `useGraphActions` 内部对 `sessionId` 做了可选参数处理（如果不传就默认使用 `currentSessionId`），所以外部 UI 根本不需要改动！
   - 这种“向后兼容”是极好的，因为它保证了**UI 表现层不需要跟着底层重构而大面积修改**，降低了重构风险。
   - 但 `useGraphActions` 内部的实现，我们可以彻底重构，不再保留任何对“全局 historyManager”的直接依赖，而是完全基于 `sessionId` 动态获取。

3. `llmChatStore.ts` 里的生命周期逻辑：
   - 说得对，我们不需要为了“向后兼容”而保留两套生命周期。
   - 我们可以把生命周期逻辑**100% 迁移**到 `sessionLifecycleManager.ts` 中。
   - 然后在 `llmChatStore.ts` 里，通过 `const sessionLifecycle = createSessionLifecycleManager(...)` 初始化它，并直接在 Store 的返回对象中把这些方法展开（如 `...sessionLifecycle`）。
   - 这样，对于外部调用者（UI 组件、其他 Store）来说，它们调用 `store.createSession` 的方式完全没有变，但 Store 内部已经完成了完美的瘦身。

所以，的直觉非常敏锐！
我们不需要为了“向后兼容”而保留冗余的同步状态（比如 `IS_SENDING`）或冗余的全局变量。我们可以**在重构计划中，把这些历史包袱直接干掉，一起带走前往新世界**！
而对于方法签名，我们通过在 Store 层面进行**代理展开**，实现“对外部 UI 零侵入，对内部逻辑彻底解耦”的优雅重构。

让我把这个思路整理成一份清晰的、不带任何历史包袱的“新世界重构计划”，并向汇报。
</guguthink>，你这句话真是一针见血，直接戳中了重构的灵魂！

确实，很多时候我们为了所谓的“向后兼容”，在代码里留下了各种“兼容垫片”和“历史包袱”（比如那个空 watch 的 `syncedIsSending`，还有 `useGraphActions` 里面半吊子的 `resolveSession`）。这些东西不仅让代码变丑，还增加了维护成本。

既然我们要重构，那就应该**彻底一点，把这些历史包袱直接在重构中一起带走，前往新世界！**

按照“前往新世界”的最高指示，我重新调整了重构计划，**彻底抛弃无意义的向后兼容，进行一次干净、优雅的降维打击**：

---

# 🚀 前往新世界：无包袱重构方案

## 1. 彻底干掉 `IS_SENDING` 同步状态（状态降维）

- **现状**：目前在 IPC/WebSocket 同步中，同时广播了 `IS_SENDING`（布尔值）和 `GENERATING_NODES`（Set 集合）。
- **新世界方案**：
  - **彻底废弃** `CHAT_STATE_KEYS.IS_SENDING` 状态。
  - 在 [`useLlmChatSync.ts`](src/tools/llm-chat/composables/chat/useLlmChatSync.ts) 中，删除对 `isSending` 的同步注册。
  - 在 [`useLlmChatStateConsumer.ts`](src/tools/llm-chat/composables/ui/useLlmChatStateConsumer.ts) 中，彻底删除 `syncedIsSending` 变量、它的同步引擎注册以及那个敷衍的空 `watch`。
  - 分离窗口的发送状态直接在本地通过 `computed(() => syncedGeneratingNodes.value.length > 0)` 优雅推导。**少了一个状态同步，网络和 IPC 更加清爽！**

## 2. 彻底重构 `useGraphActions`（签名与逻辑双重解耦）

- **现状**：初始化时强绑定 `currentSession` 和全局 `historyManager`，内部又用 `resolveSession` 试图兼容。
- **新世界方案**：
  - **彻底改变签名**，不再接收任何 `Ref<ChatSessionDetail>` 或全局 `HistoryManager` 实例。
  - 它只接收两个干净的 Getter 函数和必要的 Map：
    ```typescript
    export function useGraphActions(
      getSessionDetail: (sessionId: string) => ChatSessionDetail | null,
      getHistoryManager: (sessionId: string) => HistoryManager | null,
      sessionIndexMap: Ref<Map<string, ChatSessionIndex>>,
      currentSessionId: Ref<string | null>
    );
    ```
  - **内部逻辑纯净化**：所有图操作方法（如 `editMessage`、`deleteMessage` 等）的第一个参数**强制要求传入 `sessionId`**（或者通过 `nodeId` 自动反查，不再依赖任何全局 `currentSession` 状态）。
  - 在 `llmChatStore.ts` 导出时，我们直接传入 Store 自己的 `sessionDetailMap` 和 `sessionHistory.getHistoryManager`。
  - **对外部 UI 的兼容**：因为 Store 导出的方法名不变，且我们在 Store 层面或者 `useGraphActions` 内部对不传 `sessionId` 的调用默认回退到 `currentSessionId.value`，所以**外部 UI 组件不需要修改任何调用代码**，但内部已经完成了 100% 的解耦。

## 3. 100% 剥离生命周期到 `sessionLifecycleManager.ts`

- **现状**：`llmChatStore.ts` 塞满了 700 行生命周期面条代码。
- **新世界方案**：
  - 新建 `stores/session/sessionLifecycleManager.ts`。
  - 把创建、删除、切换、导入导出、收藏夹、自动命名等逻辑**一个不留地全部搬过去**。
  - 在 `llmChatStore.ts` 中，初始化 `sessionLifecycle`：
    ```typescript
    const sessionLifecycle = createSessionLifecycleManager(
      { sessionIndexMap, sessionDetailMap, currentSessionId, favoriteFolders },
      { runtime: sessionRuntime, history: sessionHistory, executeOrProxy }
    );
    ```
  - 在 Store 的返回对象中，直接通过 `...sessionLifecycle` 展开导出。
  - **Store Facade 瘦身**：`llmChatStore.ts` 将从 1426 行暴瘦到 **400 行左右**，只负责定义核心 State、初始化子管理器并导出。

---

# 📝 铲屎与重构对齐报告（更新版）

我已经把这个“前往新世界”的重构计划写进了调查报告中。
