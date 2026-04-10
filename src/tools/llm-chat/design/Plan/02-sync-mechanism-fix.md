# LLM Chat 重构计划阶段 02：同步机制修复与双向通信

## 1. 问题背景

- **单向同步冲突**: 悬浮窗创建会话后，本地 Store 更新，但主窗口未同步。主窗口随后发起的全量同步会覆盖悬浮窗的本地状态，导致新会话消失，输入框因找不到当前会话而禁用。
- **状态覆盖**: 缺乏版本控制，主窗口可能用旧的索引覆盖悬浮窗正在编辑的最新会话信息。
- **同步开销**: 流式生成时，频繁的全树 Diff 计算导致 CPU 占用过高。

## 2. 解决方案：操作驱动同步 (Action-Driven Sync)

改变“同步状态”为“同步意图”。悬浮窗不直接修改核心数据，而是请求主窗口代为修改。

### 2.1 建立操作代理机制

- 悬浮窗的所有写操作（`createSession`, `deleteSession`, `updateSession`）必须通过 `bus.requestAction` 转发给主窗口。
- 主窗口作为唯一的“真值源 (Single Source of Truth)”，负责 IO 操作和状态广播。

### 2.2 引入版本校验

- 在 `ChatSessionIndex` 和 `ChatSessionDetail` 中严格使用 `updatedAt`。
- `useStateSyncEngine` 在应用同步补丁前，检查接收到的 `updatedAt` 是否晚于本地。

### 2.3 优化流式同步通道

- 新增 `STREAMING_DELTA` 通道，专门用于传输 `{ nodeId, delta }`。
- 流式生成期间，主窗口仅通过该通道推送增量，不再触发全量树同步。

## 3. 执行计划

### 步骤 1：操作转发适配 (`llmChatStore.ts`)

- [ ] 封装 `executeAction` 辅助函数。判断当前窗口类型：
  - 如果是 `main` 或 `detached-tool`: 直接执行本地逻辑。
  - 如果是 `detached-component`: 调用 `bus.requestAction` 并返回。
- [ ] 将 `createSession`, `deleteSession`, `updateSession` 改为使用此代理模式。

### 步骤 2：同步引擎升级 (`useLlmChatSync.ts`)

- [ ] **索引通道 (SESSIONS)**: 修改为仅监听 `sessionIndexMap`。
- [ ] **详情通道 (CURRENT_SESSION_DATA)**: 仅同步当前活跃会话的详情 Map。
- [ ] **冲突拦截**: 在 `useStateSyncEngine` 的接收回调中，对比 `updatedAt` 时间戳。

### 步骤 3：流式增量通道实现

- [ ] 在 `useChatResponseHandler.ts` 中，检测到流式更新时，通过 `bus.emit('streaming-delta', ...)` 发送增量。
- [ ] 在 `MessageList.vue` 中监听该事件，直接手动更新本地消息内容，绕过响应式系统的大规模 Diff。

### 步骤 4：验收与回归测试

- [ ] **场景测试**: 在悬浮窗点击“新建会话”，确认主窗口侧边栏立即出现。
- [ ] **压力测试**: 在长对话流式生成时，观察主窗口和悬浮窗的 CPU 占用是否显著下降。
- [ ] **异常测试**: 模拟断网或主窗口卡死，确认悬浮窗不会因同步失败而导致数据回滚。

## 4. 额外注意事项

- **窗口类型识别**: 必须准确区分 `detached-tool` (拥有数据的独立窗口) 和 `detached-component` (无数据的 UI 片段)。
- **持久化触发**: 所有的 Action 执行完后，必须显式调用 `persistSession` 以确保磁盘数据同步。

## 5. 相关文档文件

- `src/tools/llm-chat/composables/chat/useLlmChatSync.ts` (同步逻辑)
- `src/tools/llm-chat/stores/llmChatStore.ts` (操作代理)
- `src/tools/llm-chat/composables/chat/useChatResponseHandler.ts` (流式推送)
