# 多开局系统切换链路接线图 v1

> 状态: Implementation Guide
> 日期: 2026-04-29
> 前置文档: [`llm-chat-multi-greeting-implementation-v4.md`](llm-chat-multi-greeting-implementation-v4.md)
> 目的: 补充 v4 计划中缺失的实施细节，明确每个触点的函数签名和数据流向

---

## 1. 核心数据流向图

```
┌─────────────────────────────────────────────────────────────────────┐
│ Agent.presetMessages (含 group + variant 节点)                       │
│   group: { type: "group", childrenIds: [...], metadata: {          │
│     activeVariantId, groupName } }                                  │
│   variants: { metadata: { isVariant: true, parentGroupId } }       │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 【展示链路】resolvePresetMessages()                                  │
│   输入: messages[], overrides (来自 detail.variantOverrides)        │
│   输出: 展开后的平面数组，variant 副本携带 metadata:                │
│     { isPresetDisplay: true, parentGroupId, allVariantIds,         │
│       currentVariantIndex }                                         │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ getActivePathWithPresets()                                          │
│   调用 resolvePresetMessages(agent.presetMessages,                 │
│                               detail.variantOverrides)              │
│   过滤: 跳过 type === "group" 和 isVariant === true                │
│   切片: .slice(-displayPresetCount)                                │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ MessageList.getMessageSiblings()                                    │
│   if (msg.metadata?.parentGroupId) {                               │
│     从 msg.metadata.allVariantIds 构建虚拟 siblings                │
│     currentIndex = msg.metadata.currentVariantIndex                │
│   }                                                                 │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ MessageMenubar: v-if="siblings.length > 1" ✅                       │
│   @click 箭头 → emit('switch-variant', groupId, direction)         │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
        ChatMessage 转发 → MessageList 转发 → ChatArea 转发
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ store.switchVariant(sessionId, groupId, direction)                 │
│   1. 计算新 variantId                                               │
│   2. detail.variantOverrides[groupId] = newVariantId               │
│   3. 立即持久化 sessionManager.persistSession()                    │
│   4. computed 自动重算 → UI 更新                                    │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. 关键函数签名详解

### 2.1 `resolvePresetMessages` (新增工具函数)

**位置**: `src/tools/llm-chat/utils/chatPathUtils.ts` (新增函数)

**签名**:

```typescript
function resolvePresetMessages(
  messages: ChatMessageNode[],
  overrides: Record<string, string> = {},
  agent?: ChatAgent | null,
): ChatMessageNode[];
```

**参数**:

- `messages`: agent.presetMessages 原始数组
- `overrides`: 会话级覆盖 (来自 `detail.variantOverrides`)
- `agent`: 可选，用于回退到 Agent 级默认 activeVariantId

**返回**: 展开后的平面数组，其中：

- group 节点被移除
- 每个 group 的 active variant 被提升为独立消息
- variant 副本携带完整 metadata 用于虚拟 siblings

**实现逻辑**:

```typescript
function resolvePresetMessages(
  messages: ChatMessageNode[],
  overrides: Record<string, string> = {},
  agent?: ChatAgent | null,
): ChatMessageNode[] {
  const result: ChatMessageNode[] = [];

  // 1. 建立 variant 映射表
  const variantMap = new Map<string, ChatMessageNode>();
  messages
    .filter((m) => m.metadata?.isVariant)
    .forEach((v) => {
      variantMap.set(v.id, v);
    });

  // 2. 遍历并替换
  messages.forEach((msg) => {
    if (msg.type === "group") {
      // 路由逻辑：会话覆盖 > 组默认 > 第一个子节点
      const selectedId = overrides[msg.id] || msg.metadata?.activeVariantId || msg.childrenIds[0];

      const selectedVariant = variantMap.get(selectedId);
      if (selectedVariant) {
        // 计算当前 variant 在组内的索引
        const currentIndex = msg.childrenIds.indexOf(selectedId);

        // 返回带有组上下文的副本
        result.push({
          ...selectedVariant,
          metadata: {
            ...selectedVariant.metadata,
            isPresetDisplay: true,
            parentGroupId: msg.id,
            groupName: msg.metadata?.groupName,
            allVariantIds: msg.childrenIds,
            currentVariantIndex: currentIndex,
          },
        });
      }
    } else if (!msg.metadata?.isVariant) {
      // 普通消息直接加入
      result.push(msg);
    }
    // isVariant === true 的节点被跳过
  });

  return result;
}
```

### 2.2 `getActivePathWithPresets` (修改)

**位置**: `src/tools/llm-chat/utils/chatPathUtils.ts:15-60`

**修改点 1 - 调用 resolvePresetMessages**:

```typescript
export function getActivePathWithPresets(
  activePath: ChatMessageNode[],
  index: ChatSessionIndex | null,
  detail: ChatSessionDetail | null,
  agent: ChatAgent | null,
): ChatMessageNode[] {
  if (
    !index ||
    !detail ||
    !agent ||
    !agent.presetMessages ||
    !agent.displayPresetCount ||
    agent.displayPresetCount <= 0
  ) {
    return activePath;
  }

  // ✅ 新增：先展开 group
  const resolvedPresets = resolvePresetMessages(agent.presetMessages, detail.variantOverrides || {}, agent);

  const chatHistoryIndex = resolvedPresets.findIndex((msg: ChatMessageNode) => msg.type === "chat_history");

  if (chatHistoryIndex === -1) {
    return activePath;
  }

  // ✅ 修改：过滤条件增加排除 group 和 isVariant
  const presetsBeforePlaceholder = resolvedPresets.slice(0, chatHistoryIndex).filter(
    (msg: ChatMessageNode) =>
      msg.type !== "group" && // 排除 group 节点
      !msg.metadata?.isVariant && // 排除未展开的 variant
      (msg.role === "user" || msg.role === "assistant") &&
      msg.isEnabled !== false,
  );

  // 取最后 N 条进行展示
  const displayPresets = presetsBeforePlaceholder.slice(-agent.displayPresetCount);

  const markedPresets = displayPresets.map((msg: ChatMessageNode) => ({
    ...msg,
    metadata: {
      ...msg.metadata,
      isPresetDisplay: true,
      agentId: agent.id,
      agentName: agent.name,
      agentDisplayName: agent.displayName || agent.name,
      agentIcon: agent.icon,
      profileId: agent.profileId,
      modelId: agent.modelId,
    },
  }));

  return [...markedPresets, ...activePath];
}
```

### 2.3 `MessageList.getMessageSiblings` (修改)

**位置**: `src/tools/llm-chat/components/message/MessageList.vue:59-75`

**修改后**:

```typescript
const getMessageSiblings = (messageId: string) => {
  const message = props.messages.find((m) => m.id === messageId);

  // ✅ 新增：处理 variant 虚拟 siblings
  if (message?.metadata?.parentGroupId && message.metadata?.allVariantIds) {
    // 从 allVariantIds 构建虚拟 siblings
    const variantSiblings = message.metadata.allVariantIds
      .map((vid) =>
        props.messages.find((m) => m.metadata?.parentGroupId === message.metadata.parentGroupId && m.id === vid),
      )
      .filter(Boolean) as ChatMessageNode[];

    return {
      siblings: variantSiblings.length > 0 ? variantSiblings : [message],
      currentIndex: message.metadata.currentVariantIndex ?? 0,
    };
  }

  // 原有逻辑：普通预设消息
  if (message?.metadata?.isPresetDisplay) {
    return {
      siblings: [message],
      currentIndex: 0,
    };
  }

  // 原有逻辑：会话消息
  const siblings = store.getSiblings(messageId);
  const currentIndex = siblings.findIndex((s: ChatMessageNode) => store.isNodeInActivePath(s.id));
  return {
    siblings,
    currentIndex,
  };
};
```

**问题**: `allVariantIds` 只包含 ID，但 `props.messages` 中只有当前选中的 variant。

**解决方案**: 需要在 `resolvePresetMessages` 中为每个 variant 副本附加完整的 sibling 信息：

```typescript
// 在 resolvePresetMessages 中，为每个 variant 副本附加 siblings 预览
result.push({
  ...selectedVariant,
  metadata: {
    ...selectedVariant.metadata,
    isPresetDisplay: true,
    parentGroupId: msg.id,
    groupName: msg.metadata?.groupName,
    allVariantIds: msg.childrenIds,
    currentVariantIndex: currentIndex,
    // ✅ 新增：附加所有 siblings 的预览信息（用于显示）
    variantSiblingPreviews: msg.childrenIds
      .map((vid) => {
        const v = variantMap.get(vid);
        return v
          ? {
              id: v.id,
              name: v.name || `变体 ${msg.childrenIds.indexOf(vid) + 1}`,
              contentPreview: v.content.slice(0, 50),
            }
          : null;
      })
      .filter(Boolean),
  },
});
```

**修订后的 getMessageSiblings**:

```typescript
if (message?.metadata?.parentGroupId && message.metadata?.variantSiblingPreviews) {
  // 使用预览信息构建虚拟 siblings（仅用于显示计数和切换）
  return {
    siblings: message.metadata.variantSiblingPreviews.map((preview) => ({
      id: preview.id,
      role: message.role,
      content: preview.contentPreview,
      name: preview.name,
      metadata: { ...message.metadata, isVirtualSibling: true },
    })) as ChatMessageNode[],
    currentIndex: message.metadata.currentVariantIndex ?? 0,
  };
}
```

---

## 3. 事件链路逐层签名

### 3.1 MessageMenubar.vue

**修改位置**: `src/tools/llm-chat/components/message/MessageMenubar.vue`

**Props 扩展** (第 43-49 行):

```typescript
interface Props {
  message: ChatMessageNode;
  isSending: boolean;
  siblings: ChatMessageNode[];
  currentSiblingIndex: number;
  buttonVisibility?: ButtonVisibility;
}
```

**Emits 扩展** (第 50-66 行):

```typescript
interface Emits {
  // ... 现有 emits
  (e: "switch", direction: "prev" | "next"): void;
  (e: "switch-variant", groupId: string, direction: "prev" | "next"): void; // ✅ 新增
  // ...
}
```

**模板修改** (第 360-400 行):

```vue
<div v-if="siblings.length > 1" class="branch-control">
  <el-tooltip content="上一个版本" placement="top" :show-after="500">
    <button 
      class="menu-btn" 
      :disabled="currentSiblingIndex === 0" 
      @click="handleSwitchClick('prev')"
    >
      <ChevronLeft :size="16" />
    </button>
  </el-tooltip>
  <!-- ... -->
</div>
```

**Script 新增方法**:

```typescript
const handleSwitchClick = (direction: "prev" | "next") => {
  // ✅ 判断是否为 variant 切换
  if (props.message.metadata?.parentGroupId) {
    emit("switch-variant", props.message.metadata.parentGroupId, direction);
  } else {
    emit("switch", direction);
  }
};
```

### 3.2 ChatMessage.vue

**位置**: `src/tools/llm-chat/components/message/ChatMessage.vue`

**Emits 扩展**:

```typescript
interface Emits {
  // ... 现有 emits
  (e: "switch-sibling", direction: "prev" | "next"): void;
  (e: "switch-variant", groupId: string, direction: "prev" | "next"): void; // ✅ 新增
  // ...
}
```

**模板修改** (MessageMenubar 绑定处):

```vue
<MessageMenubar
  :message="message"
  :siblings="siblings"
  :current-sibling-index="currentSiblingIndex"
  @switch="emit('switch-sibling', $event)"
  @switch-variant="emit('switch-variant', $event)"  <!-- ✅ 新增 -->
  <!-- ... -->
/>
```

### 3.3 MessageList.vue

**位置**: `src/tools/llm-chat/components/message/MessageList.vue:22-35`

**Emits 扩展**:

```typescript
interface Emits {
  // ... 现有 emits
  (e: "switch-sibling", nodeId: string, direction: "prev" | "next"): void;
  (e: "switch-variant", groupId: string, direction: "prev" | "next"): void; // ✅ 新增
  // ...
}
```

**模板修改** (ChatMessage 绑定处，第 460-488 行):

```vue
<ChatMessage
  v-else
  :session-index="props.sessionIndex"
  :session-detail="props.sessionDetail"
  :message="msg"
  :siblings="getMessageSiblings(msg.id).siblings"
  :current-sibling-index="getMessageSiblings(msg.id).currentIndex"
  @switch-sibling="handleSwitchSibling(msg.id, $event)"
  @switch-variant="emit('switch-variant', $event)"  <!-- ✅ 新增透传 -->
  <!-- ... -->
/>
```

### 3.4 ChatArea.vue

**位置**: `src/tools/llm-chat/components/ChatArea.vue:50-67`

**Emits 扩展**:

```typescript
interface Emits {
  // ... 现有 emits
  (e: "switch-sibling", nodeId: string, direction: "prev" | "next"): void;
  (e: "switch-variant", groupId: string, direction: "prev" | "next"): void; // ✅ 新增
  // ...
}
```

**模板修改** (MessageList 绑定处，第 814-836 行):

```vue
<MessageList
  ref="messageListRef"
  :session-index="llmChatStore.currentSession"
  :session-detail="llmChatStore.currentSessionDetail"
  :messages="finalMessages"
  @switch-sibling="handleSwitchSibling"
  @switch-variant="emit('switch-variant', $event)"  <!-- ✅ 新增透传 -->
  <!-- ... -->
/>
```

### 3.5 LlmChat.vue (或主容器)

**位置**: `src/tools/llm-chat/LlmChat.vue` (假设存在)

**模板修改** (ChatArea 绑定处):

```vue
<ChatArea
  :messages="store.currentActivePathWithPresets"
  :is-sending="store.isSending"
  @switch-sibling="handleSwitchSibling"
  @switch-variant="handleSwitchVariant"  <!-- ✅ 新增 -->
  <!-- ... -->
/>
```

**Script 新增方法**:

```typescript
const handleSwitchVariant = (groupId: string, direction: "prev" | "next") => {
  const sessionId = store.currentSessionId;
  if (sessionId) {
    store.switchVariant(sessionId, groupId, direction);
  }
};
```

---

## 4. Store Action 实现

### 4.1 `llmChatStore.switchVariant`

**位置**: `src/tools/llm-chat/stores/llmChatStore.ts` (新增 action)

**签名**:

```typescript
async function switchVariant(sessionId: string, groupId: string, direction: "prev" | "next"): Promise<void>;
```

**实现**:

```typescript
async function switchVariant(sessionId: string, groupId: string, direction: "prev" | "next"): Promise<void> {
  return executeOrProxy("switch-variant", { sessionId, groupId, direction }, async () => {
    const detail = sessionDetailMap.value.get(sessionId);
    const index = sessionIndexMap.value.get(sessionId);
    if (!detail || !index) {
      logger.warn("切换 variant 失败：会话不存在", { sessionId });
      return;
    }

    const agentStore = useAgentStore();
    const agent = agentStore.currentAgentId ? agentStore.getAgentById(agentStore.currentAgentId) : null;

    if (!agent?.presetMessages) {
      logger.warn("切换 variant 失败：无预设消息", { sessionId });
      return;
    }

    // 1. 找到 group 节点
    const groupNode = agent.presetMessages.find((m) => m.id === groupId && m.type === "group");
    if (!groupNode || !groupNode.childrenIds || groupNode.childrenIds.length === 0) {
      logger.warn("切换 variant 失败：group 节点不存在或无子节点", { groupId });
      return;
    }

    // 2. 获取当前选中的 variantId
    const currentVariantId =
      detail.variantOverrides?.[groupId] || groupNode.metadata?.activeVariantId || groupNode.childrenIds[0];

    // 3. 计算新的 variantId
    const currentIndex = groupNode.childrenIds.indexOf(currentVariantId);
    if (currentIndex === -1) {
      logger.warn("切换 variant 失败：当前 variant 不在 group 中", {
        groupId,
        currentVariantId,
      });
      return;
    }

    let newIndex = currentIndex;
    if (direction === "prev") {
      newIndex = currentIndex > 0 ? currentIndex - 1 : groupNode.childrenIds.length - 1;
    } else {
      newIndex = currentIndex < groupNode.childrenIds.length - 1 ? currentIndex + 1 : 0;
    }

    const newVariantId = groupNode.childrenIds[newIndex];

    // 4. 更新 variantOverrides
    if (!detail.variantOverrides) {
      detail.variantOverrides = {};
    }
    detail.variantOverrides[groupId] = newVariantId;

    // 5. 立即持久化（不防抖，确保切换立即生效）
    const sessionManager = useSessionManager();
    sessionManager.persistSession(index, detail, currentSessionId.value);

    logger.info("已切换 variant", {
      sessionId,
      groupId,
      direction,
      oldVariantId: currentVariantId,
      newVariantId,
      newIndex,
    });

    // 6. computed 会自动重算，无需手动触发
  });
}
```

**返回值导出** (store 末尾):

```typescript
return {
  // ... 现有导出
  switchVariant, // ✅ 新增
};
```

---

## 5. 首条消息实例化逻辑

### 5.1 插入点

**位置**: `src/tools/llm-chat/composables/chat/useChatHandler.ts:161`

**当前代码**:

```typescript
// 使用指定的 parentId 或当前活跃叶节点作为父节点
const parentId = options?.parentId || session.activeLeafId || "";
```

**修改为**:

```typescript
// ✅ 新增：检查是否需要实例化 greeting
let parentId = options?.parentId || session.activeLeafId || "";

// 如果会话仍在根节点且 agent 有 greeting group，先实例化 greeting
if (parentId === session.rootNodeId && currentAgent) {
  const greetingNode = await instantiateGreetingIfNeeded(session, currentAgent, agentConfig, nodeManager);
  if (greetingNode) {
    parentId = greetingNode.id;
    logger.info("已自动实例化 greeting 节点", {
      greetingNodeId: greetingNode.id,
    });
  }
}

// 使用节点管理器创建消息对（使用处理后的内容）
const { userNode, assistantNode } = nodeManager.createMessagePair(session, processedContent, parentId);
```

### 5.2 实例化函数

**位置**: `src/tools/llm-chat/composables/chat/useChatHandler.ts` (新增辅助函数)

**签名**:

```typescript
async function instantiateGreetingIfNeeded(
  session: ChatSessionDetail,
  agent: ChatAgent,
  agentConfig: any,
  nodeManager: ReturnType<typeof useNodeManager>,
): Promise<ChatMessageNode | null>;
```

**实现**:

```typescript
async function instantiateGreetingIfNeeded(
  session: ChatSessionDetail,
  agent: ChatAgent,
  agentConfig: any,
  nodeManager: ReturnType<typeof useNodeManager>,
): Promise<ChatMessageNode | null> {
  // 1. 检查是否有 greeting group
  const greetingGroup = agent.presetMessages?.find(
    (m) =>
      (m.type === "group" && m.metadata?.groupName?.toLowerCase().includes("greeting")) ||
      m.metadata?.groupName?.toLowerCase().includes("开场"),
  );

  if (!greetingGroup || !greetingGroup.childrenIds || greetingGroup.childrenIds.length === 0) {
    return null;
  }

  // 2. 检查是否已实例化（防重复）
  const rootNode = session.nodes[session.rootNodeId];
  const hasGreeting = rootNode.childrenIds.some((childId) => {
    const child = session.nodes[childId];
    return child?.metadata?.isGreetingInstantiation === true;
  });

  if (hasGreeting) {
    logger.debug("greeting 已实例化，跳过");
    return null;
  }

  // 3. 解析当前选中的 variant
  const selectedVariantId =
    session.variantOverrides?.[greetingGroup.id] ||
    greetingGroup.metadata?.activeVariantId ||
    greetingGroup.childrenIds[0];

  const selectedVariant = agent.presetMessages?.find((m) => m.id === selectedVariantId);
  if (!selectedVariant) {
    logger.warn("无法找到选中的 greeting variant", { selectedVariantId });
    return null;
  }

  // 4. 创建 greeting 节点
  const greetingNode: ChatMessageNode = {
    id: `greeting-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    role: "assistant",
    content: selectedVariant.content,
    parentId: session.rootNodeId,
    childrenIds: [],
    timestamp: new Date().toISOString(),
    status: "complete",
    isEnabled: true,
    metadata: {
      isGreetingInstantiation: true,
      sourceGroupId: greetingGroup.id,
      sourceVariantId: selectedVariantId,
      agentId: agent.id,
      agentName: agent.name,
      agentDisplayName: agent.displayName || agent.name,
      agentIcon: agent.icon,
      profileId: agentConfig.profileId,
      modelId: agentConfig.modelId,
    },
  };

  // 5. 插入会话树
  session.nodes[greetingNode.id] = greetingNode;
  rootNode.childrenIds.push(greetingNode.id);
  session.activeLeafId = greetingNode.id;

  logger.info("已实例化 greeting 节点", {
    greetingNodeId: greetingNode.id,
    sourceGroupId: greetingGroup.id,
    sourceVariantId: selectedVariantId,
  });

  return greetingNode;
}
```

---

## 6. 类型定义补充

### 6.1 ChatSessionDetail 扩展

**位置**: `src/tools/llm-chat/types/session.ts:40`

**新增字段**:

```typescript
export interface ChatSessionDetail {
  // ... 现有字段

  /**
   * 会话级别的 Variant 覆盖
   * key: groupId, value: 用户选中的 variantId
   * 优先级高于 Agent 级的 activeVariantId
   */
  variantOverrides?: Record<string, string>;
}
```

### 6.2 ChatMessageNode.metadata 扩展

**位置**: `src/tools/llm-chat/types/message.ts` (metadata 接口)

**新增字段**:

```typescript
export interface ChatMessageNodeMetadata {
  // ... 现有字段

  // ===== Variant 相关 =====
  /** 标记该节点是箱组子节点，不参与独立注入扫描 */
  isVariant?: boolean;

  /** 父箱组 ID（仅 variant 节点） */
  parentGroupId?: string;

  /** 箱组显示名称（仅 group 节点或 variant 副本） */
  groupName?: string;

  /** 默认激活的 Variant ID（仅 group 节点，Agent 级默认值） */
  activeVariantId?: string;

  /** 所有同级 variant 的 ID 列表（仅 variant 副本，用于虚拟 siblings） */
  allVariantIds?: string[];

  /** 当前 variant 在组内的索引（仅 variant 副本） */
  currentVariantIndex?: number;

  /** 同级 variant 的预览信息（仅 variant 副本，用于显示） */
  variantSiblingPreviews?: Array<{
    id: string;
    name?: string;
    contentPreview: string;
  }>;

  /** 标记该节点是 greeting 实例化节点 */
  isGreetingInstantiation?: boolean;

  /** greeting 来源的 group ID */
  sourceGroupId?: string;

  /** greeting 来源的 variant ID */
  sourceVariantId?: string;
}
```

---

## 7. 持久化时机

**策略**: **立即持久化，不防抖**

**理由**:

1. variant 切换是用户的明确操作，应立即生效
2. 切换频率不高（不像输入框那样需要防抖）
3. 立即持久化确保刷新页面后状态不丢失

**实现位置**: `store.switchVariant` 第 5 步（见上文 §4.1）

---

## 8. 实施检查清单

在开始编码前，确认以下所有触点已明确：

- [ ] `resolvePresetMessages` 函数签名和实现逻辑
- [ ] `getActivePathWithPresets` 的过滤条件修改
- [ ] `MessageList.getMessageSiblings` 的虚拟 siblings 构建
- [ ] `MessageMenubar` 的 `switch-variant` emit 和 `handleSwitchClick` 方法
- [ ] `ChatMessage` 的 `switch-variant` 透传
- [ ] `MessageList` 的 `switch-variant` 透传
- [ ] `ChatArea` 的 `switch-variant` 透传
- [ ] `LlmChat.vue` 的 `handleSwitchVariant` 方法
- [ ] `store.switchVariant` action 实现
