# LLM Chat 消息事件透传优化方案

> **状态**: Draft → Implementing  
> **日期**: 2026-04-29  
> **范围**: MessageMenubar → ChatMessage/ToolCallMessage → MessageList → ChatArea → LlmChat

## 1. 背景

当前消息操作事件从 `MessageMenubar` 到 `LlmChat` 存在 4~5 层逐层 emit 透传，大量事件在中间层（ChatArea、MessageList）仅做纯粹的转发（pass-through），无任何额外逻辑。这种模式导致：

- **冗余代码**：每层都需定义相同的 emit 接口、编写转发 handler
- **低可维护性**：修改一个操作需要跨 4 个文件同步变更
- **参数注入耦合**：MessageList 层手动添加 `msg.id`，容易遗漏

## 2. 目标

将消息操作事件在 **MessageList 层直接调 Store 终止传递**，消除 ChatArea 和 LlmChat 层的透传代码。

### 2.1. 优化前后对比

```
优化前:
MessageMenubar → ChatMessage/ToolCallMessage → MessageList → ChatArea → LlmChat → Store

优化后:
MessageMenubar → ChatMessage/ToolCallMessage → MessageList → Store
```

### 2.2. 受影响文件

| 文件                                                                       | 变更类型                   |
| -------------------------------------------------------------------------- | -------------------------- |
| [`MessageList.vue`](src/tools/llm-chat/components/message/MessageList.vue) | 重写事件处理，直接调 Store |
| [`ChatArea.vue`](src/tools/llm-chat/components/ChatArea.vue)               | 移除透传 emit 和处理函数   |
| [`LlmChat.vue`](src/tools/llm-chat/LlmChat.vue)                            | 移除透传 handler           |

## 3. 事件分类与处理策略

### 3.1. 已在 MessageList 层终止的事件 ✅

| 事件                 | 当前处理                                              | 状态        |
| -------------------- | ----------------------------------------------------- | ----------- |
| `update-translation` | `store.updateMessageTranslation(msg.id, translation)` | 无需改动 ✅ |

### 3.2. 需改为 MessageList 直接调 Store 的事件 🔄

| Menubar emit      | 当前最终调用                               | MessageList 新实现                          |
| ----------------- | ------------------------------------------ | ------------------------------------------- |
| `delete`          | `store.deleteMessage(msgId)`               | `store.deleteMessage(msg.id)`               |
| `regenerate`      | `store.regenerateFromNode(msgId, options)` | `store.regenerateFromNode(msg.id, options)` |
| `switch-sibling`  | `store.switchToSiblingBranch(msgId, dir)`  | `store.switchToSiblingBranch(msg.id, dir)`  |
| `switch-branch`   | `store.switchBranch(nodeId)`               | `store.switchBranch(nodeId)`                |
| `toggle-enabled`  | `store.toggleNodeEnabled(msgId)`           | `store.toggleNodeEnabled(msg.id)`           |
| `abort`           | `store.abortNodeGeneration(msgId)`         | `store.abortNodeGeneration(msg.id)`         |
| `continue`        | `store.continueGeneration(msgId, opts)`    | `store.continueGeneration(msg.id, opts)`    |
| `create-branch`   | `store.createBranch(msgId)`                | `store.createBranch(msg.id)`                |
| `reparse-tools`   | `store.reparseNodeTools(msgId, ...)`       | `store.reparseNodeTools(msg.id, tmpModel)`  |
| `edit`            | `store.editMessage(msgId, content, atts)`  | `store.editMessage(msg.id, content, atts)`  |
| `save-to-branch`  | `store.createBranchFromEdit(msgId, ...)`   | `store.createBranchFromEdit(msg.id, ...)`   |
| `analyze-context` | 设置 `store.contextAnalyzer...` + 打开弹窗 | 直接操作 store                              |

### 3.3. 本地消费不冒泡的事件 ✅

| 事件                                                                   | 去向                                                 | 状态        |
| ---------------------------------------------------------------------- | ---------------------------------------------------- | ----------- |
| `copy`                                                                 | ChatMsg/TCM 本地 `navigator.clipboard` → 不向上 emit | 无需改动 ✅ |
| `translate` / `toggle-translation-visible` / `change-translation-mode` | 转为 `update-translation`，已在 MessageList 层终止   | 无需改动 ✅ |

## 4. 详细施工步骤

### Phase 1 — 高频核心操作

涉及 `delete`, `toggle-enabled`, `regenerate`, `switch-sibling`, `switch-branch`

#### 4.1.1. [`MessageList.vue`](src/tools/llm-chat/components/message/MessageList.vue) 修改

将以下模板绑定从 `emit(...)` 改为直接调 store：

```diff
- @delete="emit('delete-message', msg.id)"
+ @delete="store.deleteMessage(msg.id)"

- @regenerate="handleRegenerate(msg.id, $event)"
+ @regenerate="store.regenerateFromNode(msg.id, $event)"

- @switch-sibling="handleSwitchSibling(msg.id, $event)"
+ @switch-sibling="(dir) => { captureSwitchingMessagePosition(msg.id); store.switchToSiblingBranch(msg.id, dir) }"

- @switch-branch="handleSwitchBranch"
+ @switch-branch="(nodeId) => { captureSwitchingMessagePosition(msg.id) /* 注意参数是 Menubar 传的 nodeId */; store.switchBranch(nodeId) }"

- @toggle-enabled="emit('toggle-enabled', msg.id)"
+ @toggle-enabled="store.toggleNodeEnabled(msg.id)"
```

**注意** `switch-sibling` 和 `switch-branch` 需要保留 `captureSwitchingMessagePosition` 滚动位置保持逻辑。

删除对应的 handler 函数：

- `handleRegenerate` (第 312-314 行)
- `handleSwitchSibling` (第 320-324 行)
- `handleSwitchBranch` (第 326-330 行)

#### 4.1.2. [`ChatArea.vue`](src/tools/llm-chat/components/ChatArea.vue) 修改

移除 emit 监听和相关 handler：

```diff
- @delete-message="handleDeleteMessage"
- @regenerate="handleRegenerate"
- @switch-sibling="handleSwitchSibling"
- @switch-branch="handleSwitchBranch"
- @toggle-enabled="handleToggleEnabled"
```

删除 handler 函数：

- `handleDeleteMessage` (第 483 行)
- `handleRegenerate` (第 484-485 行)
- `handleSwitchSibling` (第 486 行)
- `handleSwitchBranch` (第 487 行)
- `handleToggleEnabled` (第 488 行)

移除 Emits 接口中对应项：

- `delete-message`
- `regenerate`
- `switch-sibling`
- `switch-branch`
- `toggle-enabled`

#### 4.1.3. [`LlmChat.vue`](src/tools/llm-chat/LlmChat.vue) 修改

移除 ChatArea emit 监听：

```diff
- @delete-message="handleDeleteMessage"
- @regenerate="handleRegenerate"
- @switch-sibling="handleSwitchSibling"
- @switch-branch="handleSwitchBranch"
- @toggle-enabled="handleToggleEnabled"
```

删除 handler 函数：

- `handleDeleteMessage` (第 248-250 行)
- `handleRegenerate` (第 240-245 行)
- `handleSwitchSibling` (第 253-255 行)
- `handleSwitchBranch` (第 258-260 行)
- `handleToggleEnabled` (第 263-265 行)

### Phase 2 — 编辑与分支操作

涉及 `edit`, `save-to-branch`, `create-branch`

#### 4.2.1. [`MessageList.vue`](src/tools/llm-chat/components/message/MessageList.vue)

```diff
- @edit="(newContent, attachments) => handleEditMessage(msg.id, newContent, attachments)"
+ @edit="(newContent, attachments) => store.editMessage(msg.id, newContent, attachments)"

- @save-to-branch="(newContent, attachments) => handleSaveToBranch(msg.id, newContent, attachments)"
+ @save-to-branch="(newContent, attachments) => store.createBranchFromEdit(msg.id, newContent, attachments)"

- @create-branch="handleCreateBranch(msg.id)"
+ @create-branch="() => { captureSwitchingMessagePosition(msg.id); store.createBranch(msg.id) }"
```

删除 handler：

- `handleEditMessage` (第 391-393 行)
- `handleSaveToBranch` (第 395-397 行)
- `handleCreateBranch` (第 332-336 行)

#### 4.2.2. [`ChatArea.vue`](src/tools/llm-chat/components/ChatArea.vue)

移除 emit 监听和相关 handler：

- `@edit-message`, `@save-to-branch`, `@create-branch`
- `handleEditMessage`, `handleSaveToBranch`, `handleCreateBranch`

移除 Emits 接口中对应项。

#### 4.2.3. [`LlmChat.vue`](src/tools/llm-chat/LlmChat.vue)

移除 emit 监听和相关 handler：

- `@edit-message`, `@save-to-branch`, `@create-branch`
- `handleEditMessage`, `handleSaveToBranch`, `handleCreateBranch`

### Phase 3 — 其他操作

涉及 `continue`, `abort`, `reparse-tools`, `analyze-context`

#### 4.3.1. [`MessageList.vue`](src/tools/llm-chat/components/message/MessageList.vue)

```diff
- @abort="emit('abort-node', msg.id)"
+ @abort="store.abortNodeGeneration(msg.id)"

- @continue="handleContinue(msg.id, $event)"
+ @continue="store.continueGeneration(msg.id, $event)"

- @reparse-tools="emit('reparse-tools', msg.id)"
+ @reparse-tools="() => { store.reparseNodeTools(msg.id, { temporaryModel: ... }) }"

- @analyze-context="emit('analyze-context', msg.id)"
+ @analyze-context="() => { store.contextAnalyzerNodeId = msg.id; store.contextAnalyzerVisible = true }"
```

> **reparse-tools 注意**：当前 LlmChat 的 handler 包含 `customMessage.info/error` 提示和 try/catch，需要在 MessageList 中复制该逻辑或封装。

删除 handler：

- `handleContinue` (第 316-318 行)

#### 4.3.2. [`ChatArea.vue`](src/tools/llm-chat/components/ChatArea.vue)

移除 emit 监听和相关 handler：

- `@abort-node`, `@continue`, `@reparse-tools`, `@analyze-context`
- `handleAbortNode`, `handleContinue`, `handleReparseTools`, `handleAnalyzeContext`

移除 Emits 接口中对应项。

#### 4.3.3. [`LlmChat.vue`](src/tools/llm-chat/LlmChat.vue)

移除 emit 监听和相关 handler：

- `@abort-node`, `@continue`, `@reparse-tools`, `@analyze-context`
- `handleAbortNode`, `handleContinue`, `handleReparseTools`, `handleAnalyzeContext`

### Phase 4 — 清理保留的事件

以下 emit 由 ChatArea 内部消费，**不需要**改动：

- `send` — MessageInput 发出，ChatArea 转发给 LlmChat（非消息操作）
- `abort` — MessageInput 发出，ChatArea 转发给 LlmChat（非消息操作）
- `complete-input` — 同上
- `select-continuation-model` — 同上
- `clear-continuation-model` — 同上

以下 emit 是 ChatArea 与其他组件的交互，**不需要**改动：

- ChatArea 内部 UI 事件（编辑智能体、设置等）

## 5. 实施顺序

```
Phase 1 → 高频核心操作 (delete, toggle-enabled, regenerate, switch-sibling, switch-branch)
       ↓
Phase 2 → 编辑与分支操作 (edit, save-to-branch, create-branch)
       ↓
Phase 3 → 其他操作 (continue, abort, reparse-tools, analyze-context)
       ↓
Phase 4 → 最终清理与类型检查
```

每完成一个 Phase，运行 `bun run check` 确保编译通过。

## 6. 注意事项

### 6.1. 跨窗口兼容

所有 Store 方法（如 `store.deleteMessage`, `store.regenerateFromNode` 等）必须能在分离窗口中正常工作。这些方法内部已有状态同步机制，无需额外处理。

### 6.2. 滚动位置保持

`handleSwitchSibling`, `handleSwitchBranch`, `handleCreateBranch` 依赖 `captureSwitchingMessagePosition` 保持滚动位置。改为直接调 Store 后需保留此逻辑。

### 6.3. 用户提示

`handleReparseTools` 当前在 LlmChat 层包含 `customMessage.info/error` 提示。有两种方案：

- **方案 A**：在 MessageList 中复制提示逻辑
- **方案 B**：将提示逻辑移入 Store 方法 `reparseNodeTools` 内部（更优，符合"逻辑集中"原则）

### 6.4. 类型检查

完成后必须运行：

```bash
bun run check
```

## 7. 验证清单

- [ ] Phase 1: 删除消息 — 确认可删除 + 分离窗口同步
- [ ] Phase 1: 切换启用状态 — 确认 UI 更新
- [ ] Phase 1: 重新生成 — 确认生成正确 + 分离窗口同步
- [ ] Phase 1: 切换兄弟分支 — 确认切换 + 滚动位置保持
- [ ] Phase 1: 切换到指定分支 — 确认切换 + 滚动位置保持
- [ ] Phase 2: 编辑消息 — 确认保存 + 分离窗口同步
- [ ] Phase 2: 保存到分支 — 确认创建新分支
- [ ] Phase 2: 创建分支 — 确认创建 + 滚动位置保持
- [ ] Phase 3: 续写 — 确认生成正确
- [ ] Phase 3: 终止生成 — 确认停止
- [ ] Phase 3: 重新解析工具 — 确认用户提示正确
- [ ] Phase 3: 上下文分析 — 确认弹窗打开
- [ ] 分离窗口：所有操作在分离窗口中正常工作
- [ ] `bun run check` 无类型错误
