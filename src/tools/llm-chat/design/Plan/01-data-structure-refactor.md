# LLM Chat 重构计划阶段 01：数据结构解耦与响应式修复

## 1. 问题背景

当前 `ChatSession` 类型在内存中采用混合结构（索引字段 + 详情字段），存在以下核心痛点：

- **同步冗余**：每次同步都要遍历整棵消息树，即使只是改了个会话名称。
- **状态丢失**：详情未加载时，索引中的 `messageCount` 等统计字段会被 `undefined` 或默认值覆盖。
- **响应式断裂**：为了兼容旧接口使用的 Proxy 方案导致 Vue 追踪失效，流式更新时 UI 不刷新。
- **索引不准**：`messageCount` 经常显示为 `-1`，因为计算逻辑依赖于已加载的 `nodes`。（**已修复**：存储层与逻辑层增加防御性计算）

## 2. 解决方案：物理隔离与 Map 化

将 Store 中的会话管理从 `Array` 模式切换为 `Map` 模式，并彻底分离索引与详情。

### 2.1 类型重新定义 (`src/tools/llm-chat/types/session.ts`)

- **`ChatSessionIndex`**: 仅包含 `id`, `name`, `updatedAt`, `createdAt`, `messageCount`, `displayAgentId`。
- **`ChatSessionDetail`**: 包含 `nodes`, `rootNodeId`, `activeLeafId`, `history`, `historyIndex`。
- **`ChatSession`**: (移除) 不再保留混合类型。所有业务逻辑必须明确区分是在操作索引还是详情。

### 2.2 Store 状态重构 (`src/tools/llm-chat/stores/llmChatStore.ts`)

- 替换 `sessions = ref<ChatSession[]>([]);` 为：
  - `sessionIndexMap = ref<Map<string, ChatSessionIndex>>(new Map())`
  - `sessionDetailMap = ref<Map<string, ChatSessionDetail>>(new Map())`
- 提供 `sessionsIndex = computed(() => Array.from(sessionIndexMap.value.values()))` 供侧边栏使用。
- 移除 `currentSession` 的 Proxy 逻辑，改为直接返回 Map 中的引用。

## 3. 执行计划

### 步骤 1：类型定义调整

- [x] 修改 `src/tools/llm-chat/types/session.ts`，新增 `ChatSessionIndex` 和 `ChatSessionDetail` 接口。
- [x] **彻底移除旧的 `ChatSession` 定义**。让编译器在全工程范围内报错，通过类型驱动进行全量重构，拒绝“半吊子”兼容。

### 步骤 2：Store 核心改造

- [x] 在 `llmChatStore.ts` 中声明 `sessionIndexMap` 和 `sessionDetailMap`。
- [x] **重写 `loadSessions`**:
  - 调用 `sessionManager.loadSessionsIndex()` 填充 `sessionIndexMap`。
  - 仅为 `currentSessionId` 加载详情并填充 `sessionDetailMap`。
- [x] **重写 `switchSession`**:
  - 切换前检查 `sessionDetailMap` 是否有数据，无则异步加载。
- [x] **修复 Getters**:
  - `currentSession`: 返回 `sessionIndexMap.get(currentSessionId)`。
  - `currentSessionDetail`: (新增) 返回 `sessionDetailMap.get(currentSessionId)`。
  - `currentActivePath`: 改为依赖 `currentSessionDetail`，并增加空值防御。
- [x] **撤销/重做同步**:
  - 在 `switchSession` 中显式调用 `historyManager.clearHistory()` 或切换历史上下文。

### 步骤 3：逻辑层适配 (`useSessionManager.ts`)

- [x] **修改 `updateMessageCount`**: 接受 `id` 和 `nodes`，直接更新 `sessionIndexMap` 中的对应项。
- [x] **修改 `persistSession`**: 确保在保存详情文件（`session-xxx.json`）的同时，触发索引文件（`sessions.json`）的更新。

### 步骤 4：UI 表现适配

- [x] **侧边栏 (`SessionItem.vue`)**: 仅绑定 `sessionIndexMap` 中的数据。
- [x] **对话区 (`MessageList.vue`)**: 增加 `v-if` 保护，当 `sessionDetailMap` 对应数据加载中时显示 Loading。

## 4. 额外注意事项

- **Map 响应式**: 在 Vue 3 中，对 Map 的 `set/delete` 是响应式的，但要注意不要直接覆盖整个 Map 引用，除非是初始化。
- **初始化顺序**: 必须先填充索引 Map，再根据 `currentSessionId` 加载详情，否则 UI 会因为找不到 ID 而白屏。
- **-1 容错**: 在 `ChatSessionIndex` 中，`messageCount` 初始值应设为从索引文件读取的值，而非硬编码为 `-1`。（**已修复**：存储层 `createIndexItem` 已增加保护逻辑）
- **撤销逻辑断裂**: `useSessionNodeHistory` 之前是绑定在对象引用上的。重构后，切换 session 时必须确保历史管理器能感知到新的 `Detail` 引用。
- **禁止直接修改**: 所有对 `sessionIndexMap` 和 `sessionDetailMap` 的写操作必须封装在 Store 的 Action 中，禁止组件通过 `v-model` 或直接赋值修改 Map 内部成员。

## 5. 相关文档文件

- `src/tools/llm-chat/types/session.ts` (定义)
- `src/tools/llm-chat/stores/llmChatStore.ts` (状态)
- `src/tools/llm-chat/composables/session/useSessionManager.ts` (逻辑)
- `src/tools/llm-chat/components/sidebar/SessionItem.vue` (UI)
