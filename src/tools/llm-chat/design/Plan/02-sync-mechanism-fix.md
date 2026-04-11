# LLM Chat 重构计划阶段 02：同步机制修复与双向通信

> **状态**: Implementing
> **前置依赖**: 阶段 01（数据结构解耦与响应式修复）已完成
> **最后更新**: 2026-04-11（基于阶段 01 重构后的代码重新调查）

## 1. 现状调查结论

### 1.1 已完成的基础设施

阶段 01 已将 Store 重构为 `sessionIndexMap` + `sessionDetailMap` 的双 Map 结构（见 [`llmChatStore.ts`](../../stores/llmChatStore.ts:38-39)），类型定义已分离为 [`ChatSessionIndex`](../../types/session.ts:8) 和 [`ChatSessionDetail`](../../types/session.ts:40)。

同步引擎 [`useStateSyncEngine`](../../../../composables/useStateSyncEngine.ts:90) 已具备：

- JSON Patch 增量同步（`calculateDiff` + `applyPatches`）
- 版本号控制（`VersionGenerator.next()`，接收端忽略旧版本）
- `isApplyingExternalState` 防循环推送
- `deepEqual` 优化避免无变化更新

通信总线 [`useWindowSyncBus`](../../../../composables/useWindowSyncBus.ts:690) 已具备：

- `requestAction` / `onActionRequest` 操作代理（支持命名空间）
- `requestInitialState` / `onInitialStateRequest` 初始状态请求
- 心跳检测与重连机制

### 1.2 当前同步配置（[`useLlmChatSync.ts`](../../composables/chat/useLlmChatSync.ts:65)）

| 通道                                  | 数据源                            | 说明                              |
| ------------------------------------- | --------------------------------- | --------------------------------- |
| `SESSIONS`                            | `store.sessions`（索引数组）      | 仅同步 `ChatSessionIndex[]`       |
| `CURRENT_SESSION_DATA`                | `store.currentSessionDetail`      | 同步整个 `ChatSessionDetail` 对象 |
| `CURRENT_SESSION_ID`                  | `store.currentSessionId`          | 当前会话 ID                       |
| `IS_SENDING`                          | `store.isSending`                 | 发送状态                          |
| `GENERATING_NODES`                    | `store.generatingNodes`（转数组） | 正在生成的节点列表                |
| `AGENTS` / `CURRENT_AGENT_ID`         | agentStore                        | 智能体相关                        |
| `USER_PROFILES` / `GLOBAL_PROFILE_ID` | userProfileStore                  | 用户档案                          |
| `SETTINGS`                            | chatSettings                      | UI 偏好设置                       |
| `TOOL_PENDING_REQUESTS`               | toolCallingStore                  | 工具调用审批                      |

### 1.3 操作代理现状（[`useLlmChatSync.ts:179`](../../composables/chat/useLlmChatSync.ts:179)）

`handleActionRequest` 已注册为 `llm-chat` 命名空间处理器，覆盖了 `send-message`、`create-session`、`switch-session`、`abort-sending`、`regenerate-from-node`、消息编辑、分支管理以及工具调用审批等 20 多个操作。

但 [`llmChatStore.ts`](../../stores/llmChatStore.ts:285) 中的 Action 方法（如 `createSession`、`deleteSession`）**并未判断窗口类型**，直接执行本地逻辑。这意味着如果悬浮窗（`detached-component`）直接调用 Store Action 而非通过 `bus.requestAction`，会产生本地写入但主窗口不同步的问题。

### 1.4 核心瓶颈

1. **流式更新压力**：[`useChatResponseHandler.ts`](../../composables/chat/useChatResponseHandler.ts:59) 通过 `requestAnimationFrame` 节流更新 `session.nodes[nodeId].content`。每次更新都触发 `useStateSyncEngine` 对整个 `ChatSessionDetail` 的 watch → `calculateDiff` → JSON Patch 广播。对于含有数百个节点的消息树，这开销巨大。

2. **缺乏流式专用通道**：没有一条"只传文本增量"的轻量级路径。所有更新都混在全量 `CURRENT_SESSION_DATA` 通道中。

3. **Action 代理不彻底**：Store Action 内部没有窗口类型判断，依赖组件层自觉调用 `bus.requestAction`。

## 2. 解决方案

### 2.1 操作代理强制化

在 Store 的关键写操作中引入窗口类型检测。如果当前窗口是 `detached-component`，强制走 `bus.requestAction` 而非本地执行。

```typescript
// llmChatStore.ts 中的辅助函数
async function executeOrProxy<T>(action: string, params: any, localFn: () => T): Promise<T> {
  const bus = useWindowSyncBus();
  if (bus.windowType === "detached-component") {
    return bus.requestAction<any, T>(`llm-chat:${action}`, params);
  }
  return localFn();
}
```

### 2.2 流式增量通道（Streaming Delta Channel）

新增一条绕过 `useStateSyncEngine` 的轻量级通信路径，专门用于传输流式文本增量：

```
[Data Owner 窗口]                    [UI Proxy 窗口]
useChatResponseHandler               useLlmChatSync
  ├─ 修改本地 node.content             │
  └─ bus.emit('streaming-delta')  ──► 监听事件
                                       └─ 直接修改本地 Store 中的 node.content
                                          (设置 isApplyingExternalState = true)
```

**消息格式**：

```typescript
interface StreamingDeltaPayload {
  sessionId: string;
  nodeId: string;
  delta: string; // 增量文本
  isReasoning: boolean; // 是推理内容还是正文
}
```

### 2.3 同步引擎降频

在 `isSending` 期间，对 `CURRENT_SESSION_DATA` 通道的同步频率从 100ms debounce 提升到 2000ms。生成结束后执行一次全量同步作为兜底，确保最终一致性。

### 2.4 类型增强

在 `ChatSessionDetail` 中增加可选的 `updatedAt` 字段，用于兜底场景下的版本校验。

## 3. 执行计划

### 步骤 1：操作代理强制化

**目标文件**: [`stores/llmChatStore.ts`](../../stores/llmChatStore.ts)

- [ ] 新增 `executeOrProxy` 辅助函数，检测 `bus.windowType`：
  - `main` / `detached-tool`: 直接执行本地逻辑
  - `detached-component`: 调用 `bus.requestAction('llm-chat:xxx', params)` 并返回
- [ ] 改造以下 Action 使用代理模式：
  - `createSession` → 代理 `create-session`
  - `deleteSession` → 代理 `delete-session`
  - `updateSession` → 代理 `update-session`
  - `sendMessage` → 代理 `send-message`
  - `switchSession` → 代理 `switch-session`
- [ ] 在 [`useLlmChatSync.ts:179`](../../composables/chat/useLlmChatSync.ts:179) 的 `handleActionRequest` 中补充缺失的 `delete-session` 和 `update-session` 分支

### 步骤 2：流式增量通道实现

**发送端**: [`composables/chat/useChatResponseHandler.ts`](../../composables/chat/useChatResponseHandler.ts)

- [ ] 在 `handleStreamUpdate` 的 `requestAnimationFrame` 回调中，除了更新本地节点，还通过 `bus` 广播增量：
  ```typescript
  bus.syncState("chat:streaming-delta", { sessionId, nodeId, delta: state.buffer, isReasoning }, version, true);
  ```
  或使用更轻量的自定义消息类型。

**接收端**: [`composables/chat/useLlmChatSync.ts`](../../composables/chat/useLlmChatSync.ts)

- [ ] 注册 `streaming-delta` 消息监听器
- [ ] 收到增量后，直接定位 `sessionDetailMap.get(sessionId)?.nodes[nodeId]`，追加文本
- [ ] 设置 `isApplyingExternalState` 标志避免触发反向同步

### 步骤 3：同步引擎降频

**目标文件**: [`composables/chat/useLlmChatSync.ts`](../../composables/chat/useLlmChatSync.ts)

- [ ] 监听 `store.isSending` 的变化：
  - `true` → 对 `CURRENT_SESSION_DATA` 引擎暂停自动推送或调高 debounce（2000ms）
  - `false` → 恢复正常频率，并执行一次强制全量同步 (`engine.manualPush(true)`)
- [ ] 考虑在 `createChatSyncConfig` 中为 `CURRENT_SESSION_DATA` 提供可配置的降频选项

### 步骤 4：类型增强

**目标文件**: [`types/session.ts`](../../types/session.ts)

- [ ] 在 `ChatSessionDetail` 接口中增加可选字段 `updatedAt?: string`
- [ ] 在 `useSessionManager.persistSession` 中同步更新 Detail 的 `updatedAt`

### 步骤 5：验收与回归测试

- [ ] **场景 A**：悬浮窗点击"新建会话" → 确认通过 `requestAction` 转发 → 主窗口侧边栏立即出现新会话
- [ ] **场景 B**：长对话流式生成 → 观察悬浮窗与主窗口的 CPU 占用 → 对比降频前后差异
- [ ] **场景 C**：生成期间切换会话 → 确认增量通道正确停止旧会话的推送
- [ ] **场景 D**：生成结束后 → 确认全量同步兜底已执行，两端数据一致
- [ ] **场景 E**：主窗口与悬浮窗同时操作（如主窗口重命名、悬浮窗发消息） → 确认无数据覆盖

## 4. 注意事项

- **窗口类型识别**: 必须准确区分 `detached-tool`（拥有数据的独立窗口）和 `detached-component`（无数据的 UI 片段）。前者是 Data Owner，后者是 UI Proxy。
- **增量通道的有序性**: `requestAnimationFrame` 的调度顺序在单窗口内是有保证的，但跨窗口传输可能存在乱序。需要考虑是否需要序列号。
- **持久化触发**: 所有 Action 执行完后必须显式调用 `persistSession`。流式生成期间的增量保存由 `triggerIncrementalSave` 负责（已实现）。
- **兜底同步**: 即使有增量通道，生成结束时的全量同步是必须的。增量通道是"尽力而为"的性能优化，不保证 100% 可靠。

## 5. 相关文件

| 文件                                         | 改动类型                |
| -------------------------------------------- | ----------------------- |
| `stores/llmChatStore.ts`                     | 操作代理包装            |
| `composables/chat/useLlmChatSync.ts`         | 增量通道接收 + 同步降频 |
| `composables/chat/useChatResponseHandler.ts` | 增量通道发送            |
| `types/session.ts`                           | 类型增强                |
| `types/sync.ts`                              | 新增流式增量相关类型    |
