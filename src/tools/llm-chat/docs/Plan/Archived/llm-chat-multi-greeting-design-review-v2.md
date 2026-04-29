# 多开局方案审查报告 v2 —— 修正版

> 日期: 2026-04-29
> 审查范围: [`docs/Plan/llm-chat-multi-greeting-design.md`](docs/Plan/llm-chat-multi-greeting-design.md)
> 触发原因: v1 审查报告误判了 `type: "group"` 与锚点系统的冲突，本报告修正该结论

## 0. v1 审查的误判与修正

v1 报告断言方案 B（箱组消息）不可行，核心论据是"`type: "group"` 会撞上锚点语义"。这个判断是**错误的**。

实际代码中：

- [`classifyPresetMessages()`](src/tools/llm-chat/core/context-processors/injection-assembler.ts:31) 按 **`injectionStrategy`** 分类消息，不是按 `type`。
- 锚点判断 [`type !== "message"`](src/tools/llm-chat/core/context-processors/injection-assembler.ts:535) 出现在骨架遍历阶段。只要 group 在进入骨架之前被展开（active variant 提升为普通消息，group 节点移出数组），就不会触发锚点分支。
- [`getActivePathWithPresets()`](src/tools/llm-chat/utils/chatPathUtils.ts:15) 只用 [`type === "chat_history"`](src/tools/llm-chat/utils/chatPathUtils.ts:26) 找占位符，与 group type 无关。
- [`AgentPresetEditor`](src/tools/llm-chat/components/agent/assets/AgentPresetEditor.vue:576) 判锚点用的是 [`anchorRegistry.hasAnchor(type)`](src/tools/llm-chat/components/agent/assets/AgentPresetEditor.vue:577)，group 不在注册表中，会走**普通消息分支**——这正是我们想要的行为。

**结论：方案 B 在数据语义层面不存在结构冲突。** 但原计划的实施路径存在多处细节不足，需要补充。

---

## 1. 方案 B 可以做的确认

姐姐的 UX 要求是：

> 多开局作为预设展示消息暴露在聊天流里，用 MessageMenubar 的分支切换箭头在多个开局之间切换

方案 B（箱组消息 + 虚拟 siblings 映射 + MessageMenubar 箭头切换）是能实现这个目标的。但要落地，需要澄清几个原计划没说清楚的关键细节。

## 2. 原计划的不足与需要补充的细节

### 2.1 原计划对展示链路的改动点描述不全

原计划 4.5 节说"在 MessageMenubar.vue 增加虚拟 siblings 映射即可复用分支 UI"，但 siblings 的实际计算链条是：

```
getActivePathWithPresets (chatPathUtils.ts)
  → 标记 isPresetDisplay 副本
  → MessageList.getMessagesiblings() (MessageList.vue:59)
    → isPresetDisplay → siblings: [message] (单元素)  ← 这里截断了
    → 非预设 → store.getSiblings() → BranchNavigator.getSiblings()
  → ChatMessage :siblings + MessageMenubar :siblings
```

需要改的地方不是 "Menubar 一处"，而是**至少**：

| 位置 | 改动 | 说明 |
|---|---|---|
| [`chatPathUtils.ts`](src/tools/llm-chat/utils/chatPathUtils.ts:15) | group 展开 | 遇到 group 时，取 active variant 作为展示副本 |
| [`MessageList.vue`](src/tools/llm-chat/components/message/MessageList.vue:59) | siblings 计算 | 对 variant 展示副本返回所有同级 variants 作为虚拟 siblings |
| [`MessageMenubar.vue`](src/tools/llm-chat/components/message/MessageMenubar.vue:360) | 箭头解锁 + 事件 | 对 preset variant 启用 `branch-control`，emit `switch-variant` |
| [`ChatArea.vue`](src/tools/llm-chat/components/ChatArea.vue) | 事件透传 | 透传 `switch-variant` 到 store |

### 2.2 原计划没说清楚 variant 状态的**存储位置**

这是方案 B 最核心的设计决策。原计划 4.6 节说"`ChatSessionDetail` 中增加 `variantOverrides`"，但没展开：

- **Agent 级**（改 `agent.presetMessages[group].metadata.activeVariantId`）：所有会话共享同一选择，切换全局生效。但这正是现状的 `isEnabled` 互斥方案的问题——改一个会话的全局。
- **会话级**（`ChatSessionDetail.variantOverrides: Record<string, string>`）：每个会话可以独立选择不同的开局。这才能解决"多会话独立开局"的需求。

**建议**：采用会话级存储。展示时优先读取 `variantOverrides`，回退到 Agent 的 `activeVariantId` 作为默认。结构：

```typescript
// ChatSessionDetail 新增
variantOverrides?: Record<string, string>; // groupId → variantId

// ChatMessageNode.metadata 新增（在预设消息上，非运行时）
groupName?: string;       // 箱组显示名称
activeVariantId?: string; // 默认激活的子版本 ID（Agent 级默认值）
isVariant?: boolean;      // 是箱组子节点，不可独立注入
```

### 2.3 原计划没覆盖 `ChatSessionDetail` 持久化和同步链路

如果新增会话级 [`variantOverrides`](src/tools/llm-chat/types/session.ts:40)，需要同步改：

| 操作 | 文件 | 改动 |
|---|---|---|
| 类型 | [`types/session.ts`](src/tools/llm-chat/types/session.ts:40) | 加字段 |
| 会话创建 | [`useSessionManager.createSession()`](src/tools/llm-chat/composables/session/useSessionManager.ts:72) | 传递初始 variant |
| 会话更新 | [`useSessionManager.updateSession()`](src/tools/llm-chat/composables/session/useSessionManager.ts:203) | 白名单 |
| 存储/加载 | [`useChatStorageSeparated`](src/tools/llm-chat/composables/storage/useChatStorageSeparated.ts) | 序列化/反序列化 |
| store 同步 | [`llmChatStore.ts`](src/tools/llm-chat/stores/llmChatStore.ts) | `updateSession` 路径 |
| 分离窗口 | [`executeOrProxy`](src/tools/llm-chat/stores/llmChatStore.ts:231) | 同步到子窗口 |

### 2.4 原计划对"首条消息实例化"的描述太模糊

原计划 4.6 节第 3 点说"用户发送第一条消息时，当前选中的 Variant 被拷贝为真实会话节点"。

当前 [`sendMessage()`](src/tools/llm-chat/composables/chat/useChatHandler.ts:55) 的父节点选择逻辑：

```typescript
// useChatHandler.ts
const parentId = options?.parentId ?? detail.activeLeafId ?? detail.rootNodeId;
```

如果需要实例化开局 greeting，结构变化是：

```
实例化前: root (activeLeafId)
实例化后: root → assistant greeting (activeLeafId 移到这)
发送首条后: root → assistant greeting → user → assistant
```

需要在 `sendMessage()` 的早期阶段（创建消息对之前）判断"会话是否仍在根节点 + agent 是否有 greeting group"，若是则先实例化 greeting 节点。需要补充：

1. 实例化的触发条件判断
2. greeting 节点写入 `detail.nodes`
3. 更新 `rootNode.childrenIds` 和 `activeLeafId`
4. 在 greeting 节点 metadata 中写入 Agent 快照（供后续导出/上下文引用）
5. 防止重复实例化（会话已有 greeting 节点时不重复创建）

### 2.5 原计划低估了预设编辑器的改动复杂度

[`AgentPresetEditor.vue`](src/tools/llm-chat/components/agent/assets/AgentPresetEditor.vue:1) 当前是**扁平数组 + 分页 + 单层拖拽**模型。引入 group 后：

| 问题 | 影响 |
|---|---|
| 分页可能切分 group + variants | 需要保证 group 和 variants 在同一页（或分页按 group 整体计算） |
| 单层 `VueDraggableNext` 无法表达嵌套 | 需要双层 draggable，或 group 整体拖拽 |
| `cleanMessagesForExport` 按 `isAnchorType` 过滤 | group 不会被锚点过滤掉，但 variants 标记了 `isVariant` 需要被跳过 |
| `AgentPresetBatchDialog` 也是扁平模型 | 需要适配 |
| 系统锚点补齐时 group 插入位置 | group 不在锚点注册表中，不会受影响 |

**实际改动量评估**：编辑器是方案 B 中改动最大的部分，需要分层展开 UI + 嵌套拖拽。但这个改动是**用户可见且有价值**的——它在编辑器中直观展示了"这是一个多选一组"。

## 3. 关键数据流改造（修正版）

### 3.1 导入链路

```
parseCharacterCard() → 不再拍扁为多个 isEnabled 互斥的 preset
  ├─ first_mes → group Variant #0 (activeVariantId 指向它)
  ├─ alternate_greetings → Variant #1, #2, ...
  └─ 不创建 chat_history 占位符（导入服务本身就不创建，保持不变）
```

### 3.2 展示链路

```
getActivePathWithPresets():
  1. 找到 chat_history 占位符位置（同现状）
  2. 提取占位符之前的启用 user/assistant 预设消息（同现状）
  3. ★ 遇到 type: "message" 但 metadata.groupName 存在的 → 查找 group 节点
  4. ★ 找到 group 的 activeVariantId → 提取对应 Variant
  5. ★ 标记 isPresetDisplay + isGroupVariant + groupId + variantIds
  6. 取最后 displayPresetCount 条（同现状，group 展开后算一条）
```

### 3.3 上下文管道（最小侵入）

```diff
  injectionAssembler.execute():
+   // Step 0: 展开箱组（在 classifyPresetMessages 之前）
+   // 遍历 presetMessages，遇到 group 节点时：
+   //   1. 找到 activeVariantId 对应的 variant
+   //   2. 将其内容/角色提升为一条独立的普通消息 (type: "message")
+   //   3. 用提升后的消息替换 group 节点在数组中的位置
+   //   isVariant 子节点被跳过
+ 
    // Step 1: classifyPresetMessages（按 injectionStrategy，不受 group 影响）
    // Step 2-5: 现有逻辑不变
```

展开只需要加 ~40 行，放在 `classifyPresetMessages` 之前即可。管道的其他部分零改动。

### 3.4 聊天 UI 分支切换链路

```
MessageMenubar:
  v-if="siblings.length > 1"  ← 对 group variant 启用
  @switch('prev'|'next') → emit('switch-variant', direction)
    → ChatArea 透传
      → store.switchVariant(sessionId, groupId, direction)
        → 更新 sessionDetail.variantOverrides[groupId]
        → 触发 currentActivePathWithPresets 重新计算
        → MessageList 重新渲染（带新的 variant 内容）
```

### 3.5 实例化（首条消息触发）

```
sendMessage()
  ├─ 检测: activeLeafId === rootNodeId && agent 有 greeting group
  ├─ 创建 greeting 节点（assistant, 内容=当前 active variant.content）
  │   ├─ parentId = rootNodeId
  │   ├─ 写入 detail.nodes
  │   ├─ 更新 root.childrenIds
  │   └─ 设置 metadata.agentId, .modelId, .isGreetingInstantiation
  ├─ 更新 activeLeafId → greeting 节点
  └─ 继续现有 sendMessage 流程（parentId = greeting.id）
```

---

## 4. 文件改动清单（重评估）

| 阶段 | 文件 | 改动量 | 说明 |
|---|---|---|---|
| 1. 类型 | [`types/message.ts`](src/tools/llm-chat/types/message.ts) | 小 | metadata 加 `groupName?`, `isVariant?` |
| 1. 类型 | [`types/session.ts`](src/tools/llm-chat/types/session.ts) | 小 | 加 `variantOverrides?` |
| 1. 类型 | [`types/agent.ts`](src/tools/llm-chat/types/agent.ts) | 小 | `activeVariantId?` 在预设消息 metadata |
| 2. 解析 | [`sillyTavernParser.ts`](src/tools/llm-chat/services/sillyTavernParser.ts) | 中 | 拍扁 → 聚合为 group |
| 3. 管道 | [`injection-assembler.ts`](src/tools/llm-chat/core/context-processors/injection-assembler.ts) | 小 | 展开 group（~40行，classify 之前） |
| 4. 展示 | [`chatPathUtils.ts`](src/tools/llm-chat/utils/chatPathUtils.ts) | 中 | group 展开 + variant 元数据标记 |
| 4. 展示 | [`MessageList.vue`](src/tools/llm-chat/components/message/MessageList.vue) | 小 | `getMessageSiblings` 虚拟 siblings |
| 4. 展示 | [`MessageMenubar.vue`](src/tools/llm-chat/components/message/MessageMenubar.vue) | 小 | 解锁 `branch-control` + variant 事件 |
| 4. 展示 | [`ChatArea.vue`](src/tools/llm-chat/components/ChatArea.vue) | 小 | 事件透传 |
| 5. Store | [`llmChatStore.ts`](src/tools/llm-chat/stores/llmChatStore.ts) | 中 | variant 切换 action + 实例化逻辑 |
| 5. Store | [`useSessionManager.ts`](src/tools/llm-chat/composables/session/useSessionManager.ts) | 小 | variant 字段持久化 |
| 5. Store | [`useChatStorageSeparated.ts`](src/tools/llm-chat/composables/storage/useChatStorageSeparated.ts) | 小 | 序列化 |
| 6. 编辑器 | [`AgentPresetEditor.vue`](src/tools/llm-chat/components/agent/assets/AgentPresetEditor.vue) | 大 | 分层展开 + 嵌套拖拽 + 组管理 |
| 6. 编辑器 | [`AgentPresetBatchDialog.vue`](src/tools/llm-chat/components/agent/assets/AgentPresetBatchDialog.vue) | 小 | 适配 group |
| 7. 发送 | [`useChatHandler.ts`](src/tools/llm-chat/composables/chat/useChatHandler.ts) | 中 | 实例化 greeting 节点 |
| 8. 兼容 | 各类导出/预览 | 小 | variant 跳过 `isVariant` 节点 |

---

## 5. 核心风险点（修正版）

| 风险 | 等级 | 说明 | 缓解 |
|---|---|---|---|
| 编辑器嵌套拖拽 | 中 | `VueDraggableNext` 单层变双层，分页逻辑需重算 | 先做 UI layout，拖拽可后续优化 |
| 分页切分 group | 中 | group + 5 variants 可能跨页 | 分页按 group 整体计算占用行数，或 group 始终完整显示 |
| 会话级 variantOverrides 与 Agent 重新导入的冲突 | 低 | 重新导入角色卡后 group 结构变了，旧 variantOverrides 引用的 variantId 可能不存在 | 加载时校验 variantId 是否仍在 group 中，不存在的回退到默认 |
| 实例化时机 | 低 | 用户在切换开局后不发送消息就切换会话，状态需保持 | variantOverrides 已持久化在会话上，切换会话不丢失 |

---

## 6. 结论

**方案 B 可以做**。我在 v1 报告中的否决是错误的——`type: "group"` 不会与锚点系统冲突，因为 `classifyPresetMessages` 按 `injectionStrategy` 分类而非按 `type`，且 group 在进入骨架前被展开为普通消息。

**但原计划的实施细节需要进行以下补充**：

1. 明确 variant 状态存储在**会话级** `variantOverrides` 而非 Agent 级
2. 补齐 [`ChatSessionDetail`](src/tools/llm-chat/types/session.ts:40) 的持久化/同步/加载链路
3. 详细设计首条消息实例化的触发条件和防重复机制
4. 承认预设编辑器改动量大（分层展开 + 嵌套拖拽），是实施中最重的部分
5. 明确 siblings 计算链条的完整改动路径（不仅是 Menubar 一处）

**建议**：批准方案 B 的方向，但要求 AI 在执行前先产出**分阶段的详细实施计划**，特别是预设编辑器的分层 UI 设计和实例化逻辑的伪代码。
