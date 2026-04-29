# 多开局系统实施指南

> 状态: Implementation Guide
> 日期: 2026-04-29
> 前置: [`llm-chat-multi-greeting-architecture.md`](llm-chat-multi-greeting-architecture.md)
> 范围: `src/tools/llm-chat`
> 
> 本文档是施工的完整操作手册，整合了数据结构变更、解析器路由实现、事件链路接线图、编辑器解耦方案、Store Action 和实例化逻辑。

---

## 1. 数据结构变更

### 1.1 `ChatMessageNode` 扩展

**文件**: [`types/message.ts`](src/tools/llm-chat/types/message.ts)

```typescript
export interface ChatMessageNode {
  // ... 现有字段不变
  type?: MessageType | "group"; // 新增 "group" 类型
  name?: string; // [复用] 组名 (type="group") 或 变体名 (isVariant=true)

  metadata?: {
    // ... 现有字段不变

    /** 箱组显示名称（仅 group 节点或 variant 副本） */
    groupName?: string;

    /** 默认激活的 Variant ID（仅 group 节点，Agent 级默认值） */
    activeVariantId?: string;

    /** 标记该节点是箱组子节点，不参与独立注入扫描 */
    isVariant?: boolean;

    /** 父箱组 ID（仅 variant 节点或展示副本） */
    parentGroupId?: string;

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
  };
}
```

### 1.2 `MessageType` 联合类型

**文件**: [`types/common.ts`](src/tools/llm-chat/types/common.ts)

```typescript
export type MessageType = "message" | "system" | "chat_history" | "group";
//                                                              ↑ 新增
```

### 1.3 `ChatSessionDetail` 扩展

**文件**: [`types/session.ts`](src/tools/llm-chat/types/session.ts:40)

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

### 1.4 Group 与 Variant 的存储关系

```
agent.presetMessages = [
  // 普通消息（不变）
  { id: "msg1", type: "message", role: "system", content: "..." },

  // 箱组节点
  {
    id: "group-greeting",
    type: "group",
    role: "assistant",            // 组统一角色
    content: "",                  // group 节点本身无内容
    name: "开场白",               // 组显示名称
    childrenIds: ["var-0", "var-1", "var-2"],  // 指向 Variants
    injectionStrategy: {          // 组级注入配置
      type: "depth",
      depth: 0
    },
    metadata: {
      groupName: "开场白",
      activeVariantId: "var-0"    // Agent 级默认
    }
  },

  // Variant 子节点（不独立参与注入扫描）
  { id: "var-0", type: "message", role: "assistant", content: "你好！", name: "默认问候", metadata: { isVariant: true } },
  { id: "var-1", type: "message", role: "assistant", content: "Hello!", name: "英文问候", metadata: { isVariant: true } },
  { id: "var-2", type: "message", role: "assistant", content: "こんにちは！", name: "日语问候", metadata: { isVariant: true } },

  // chat_history 锚点（不变）
  { id: "chat_history-placeholder", type: "chat_history", ... }
]
```

---

## 2. 解析器路由实现

### 2.1 `resolvePresetMessages` (新增工具函数)

**位置**: [`utils/chatPathUtils.ts`](src/tools/llm-chat/utils/chatPathUtils.ts) (新增函数)

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
- 每个 group 的 active variant 被提升为独立消息，携带完整 metadata（包含 `isPresetDisplay`、`parentGroupId`、`allVariantIds`、`currentVariantIndex`、`variantSiblingPreviews`）

**实现**:

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
            // 附加所有 siblings 的预览信息（用于 MessageMenubar 显示）
            variantSiblingPreviews: msg.childrenIds
              .map((vid, idx) => {
                const v = variantMap.get(vid);
                return v
                  ? {
                      id: v.id,
                      name: v.name || `变体 ${idx + 1}`,
                      contentPreview: v.content.slice(0, 50),
                    }
                  : null;
              })
              .filter(Boolean) as Array<{ id: string; name?: string; contentPreview: string }>,
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

**位置**: [`utils/chatPathUtils.ts`](src/tools/llm-chat/utils/chatPathUtils.ts:15-60)

**修改点**:

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

  const chatHistoryIndex = resolvedPresets.findIndex(
    (msg: ChatMessageNode) => msg.type === "chat_history"
  );

  if (chatHistoryIndex === -1) {
    return activePath;
  }

  // ✅ 修改：过滤条件增加排除 group 和 isVariant
  const presetsBeforePlaceholder = resolvedPresets.slice(0, chatHistoryIndex).filter(
    (msg: ChatMessageNode) =>
      msg.type !== "group" &&
      !msg.metadata?.isVariant &&
      (msg.role === "user" || msg.role === "assistant") &&
      msg.isEnabled !== false,
  );

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

### 2.3 上下文管道适配 (`injection-assembler.ts`)

**位置**: [`core/context-processors/injection-assembler.ts`](src/tools/llm-chat/core/context-processors/injection-assembler.ts)

**改动**: 在 `classifyPresetMessages` 之前调用 `resolvePresetMessages` 展开 group 节点。

```
injectionAssembler.execute():
  // Step 0: 展开箱组（在 classifyPresetMessages 之前）
  // 调用 resolvePresetMessages，将 group 节点替换为 active variant
  // isVariant 子节点被跳过

  // Step 1-5: 现有逻辑不变 (classifyPresetMessages → ... → assemble)
```

---

## 3. 聊天 UI 事件链路

### 3.1 数据流向图

```
Agent.presetMessages (含 group + variant 节点)
         │
         ▼
resolvePresetMessages(messages[], detail.variantOverrides)
  输出: 展开后的平面数组
         │
         ▼
getActivePathWithPresets()
  过滤: 跳过 type === "group" 和 isVariant === true
  切片: .slice(-displayPresetCount)
         │
         ▼
MessageList.getMessageSiblings()
  if (msg.metadata?.parentGroupId) {
    从 msg.metadata.variantSiblingPreviews 构建虚拟 siblings
    currentIndex = msg.metadata.currentVariantIndex
  }
         │
         ▼
MessageMenubar: v-if="siblings.length > 1" ✅
  @click 箭头 → emit('switch-variant', groupId, direction)
         │
         ▼
   ChatMessage 转发 → MessageList 转发 → ChatArea 转发
         │
         ▼
store.switchVariant(sessionId, groupId, direction)
  1. 计算新 variantId
  2. detail.variantOverrides[groupId] = newVariantId
  3. 立即持久化
  4. computed 自动重算 → UI 更新
```

### 3.2 逐层 Emit 签名

#### MessageMenubar.vue

**文件**: [`components/message/MessageMenubar.vue`](src/tools/llm-chat/components/message/MessageMenubar.vue)

**Emits 新增**:
```typescript
interface Emits {
  // ... 现有 emits
  (e: "switch-variant", groupId: string, direction: "prev" | "next"): void;
}
```

**模板修改** (branch-control 区域):

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
  <span class="branch-indicator">{{ currentSiblingIndex + 1 }}/{{ siblings.length }}</span>
  <el-tooltip content="下一个版本" placement="top" :show-after="500">
    <button 
      class="menu-btn" 
      :disabled="currentSiblingIndex === siblings.length - 1" 
      @click="handleSwitchClick('next')"
    >
      <ChevronRight :size="16" />
    </button>
  </el-tooltip>
</div>
```

**Script 新增方法**:
```typescript
const handleSwitchClick = (direction: "prev" | "next") => {
  // 判断是否为 variant 切换
  if (props.message.metadata?.parentGroupId) {
    emit("switch-variant", props.message.metadata.parentGroupId, direction);
  } else {
    emit("switch", direction);
  }
};
```

#### ChatMessage.vue

**文件**: [`components/message/ChatMessage.vue`](src/tools/llm-chat/components/message/ChatMessage.vue)

**Emits 新增**:
```typescript
interface Emits {
  (e: "switch-variant", groupId: string, direction: "prev" | "next"): void;
}
```

**模板**:
```vue
<MessageMenubar
  @switch-variant="emit('switch-variant', $event)"
  <!-- ... -->
/>
```

#### MessageList.vue

**文件**: [`components/message/MessageList.vue`](src/tools/llm-chat/components/message/MessageList.vue)

**Emits 新增**:
```typescript
interface Emits {
  (e: "switch-variant", groupId: string, direction: "prev" | "next"): void;
}
```

**getMessageSiblings 修改** (约第 59-75 行):

```typescript
const getMessageSiblings = (messageId: string) => {
  const message = props.messages.find((m) => m.id === messageId);

  // ✅ 新增：处理 variant 虚拟 siblings
  if (message?.metadata?.parentGroupId && message.metadata?.variantSiblingPreviews) {
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

  // 原有逻辑：普通预设消息
  if (message?.metadata?.isPresetDisplay) {
    return { siblings: [message], currentIndex: 0 };
  }

  // 原有逻辑：会话消息
  const siblings = store.getSiblings(messageId);
  const currentIndex = siblings.findIndex((s: ChatMessageNode) => store.isNodeInActivePath(s.id));
  return { siblings, currentIndex };
};
```

**模板** (ChatMessage 绑定处):
```vue
<ChatMessage
  @switch-variant="emit('switch-variant', $event)"
  <!-- ... -->
/>
```

#### ChatArea.vue

**文件**: [`components/ChatArea.vue`](src/tools/llm-chat/components/ChatArea.vue)

**Emits 新增**:
```typescript
interface Emits {
  (e: "switch-variant", groupId: string, direction: "prev" | "next"): void;
}
```

**模板** (MessageList 绑定处):
```vue
<MessageList
  @switch-variant="emit('switch-variant', $event)"
  <!-- ... -->
/>
```

#### LlmChat.vue (主容器)

**文件**: [`LlmChat.vue`](src/tools/llm-chat/LlmChat.vue)

**模板**:
```vue
<ChatArea
  @switch-variant="handleSwitchVariant"
  <!-- ... -->
/>
```

**Script**:
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

### 4.1 `switchVariant`

**位置**: [`stores/llmChatStore.ts`](src/tools/llm-chat/stores/llmChatStore.ts) (新增 action)

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

    // 3. 计算新的 variantId（支持循环切换）
    const currentIndex = groupNode.childrenIds.indexOf(currentVariantId);
    if (currentIndex === -1) {
      logger.warn("切换 variant 失败：当前 variant 不在 group 中", { groupId, currentVariantId });
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
      sessionId, groupId, direction,
      oldVariantId: currentVariantId, newVariantId, newIndex,
    });
    // 6. computed 会自动重算，无需手动触发
  });
}
```

### 4.2 `variantOverrides` 持久化链路

| 操作 | 文件 | 说明 |
|------|------|------|
| 会话创建 | [`useSessionManager.createSession()`](src/tools/llm-chat/composables/session/useSessionManager.ts:72) | 传递初始 variant（或留空使用默认） |
| 会话更新 | [`useSessionManager.updateSession()`](src/tools/llm-chat/composables/session/useSessionManager.ts:203) | `variantOverrides` 加入白名单 |
| 存储/加载 | [`useChatStorageSeparated`](src/tools/llm-chat/composables/storage/useChatStorageSeparated.ts) | 序列化/反序列化 |
| Store 同步 | [`llmChatStore.ts`](src/tools/llm-chat/stores/llmChatStore.ts) | `updateSession` 路径 |
| 分离窗口 | [`executeOrProxy`](src/tools/llm-chat/stores/llmChatStore.ts:231) | 同步到子窗口 |

---

## 5. 首条消息实例化逻辑

### 5.1 插入点

**位置**: [`composables/chat/useChatHandler.ts`](src/tools/llm-chat/composables/chat/useChatHandler.ts:161)

**修改**:

```typescript
// ✅ 新增：检查是否需要实例化 greeting
let parentId = options?.parentId || session.activeLeafId || "";

// 如果会话仍在根节点且 agent 有 greeting group，先实例化 greeting
if (parentId === session.rootNodeId && currentAgent) {
  const greetingNode = await instantiateGreetingIfNeeded(session, currentAgent, agentConfig, nodeManager);
  if (greetingNode) {
    parentId = greetingNode.id;
  }
}

// 使用节点管理器创建消息对
const { userNode, assistantNode } = nodeManager.createMessagePair(session, processedContent, parentId);
```

### 5.2 `instantiateGreetingIfNeeded` 函数

**位置**: [`composables/chat/useChatHandler.ts`](src/tools/llm-chat/composables/chat/useChatHandler.ts) (新增辅助函数)

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

  return greetingNode;
}
```

---

## 6. 编辑器中 `group` 类型适配

### 6.1 `AgentPresetEditor.vue` 适配

**文件**: [`components/agent/assets/AgentPresetEditor.vue`](src/tools/llm-chat/components/agent/assets/AgentPresetEditor.vue)

**改动要点**:

1. **列表渲染区分 `group` 节点**：

```
消息列表:
  [System] 系统提示词                 ← 普通消息（点击弹出 PresetMessageEditorDialog）
  ┌────────────────────────────────┐
  │ 📦 开场白 (3个变体)            │  ← group 消息（点击弹出 VariantGroupManagerDialog）
  │ 当前: 你好！                    │
  │ [编辑组]                        │
  └────────────────────────────────┘
  [chat_history] 占位符
```

2. **点击分发逻辑**:

```typescript
const handleMessageClick = (message: ChatMessageNode) => {
  if (message.type === "group") {
    openVariantGroupManager(message);
  } else {
    openPresetEditor(message);
  }
};
```

3. **分页适配**：group 整体算一行（或根据展开状态动态计算），防止 group + variants 跨页。

### 6.2 解析器适配

**文件**: [`services/sillyTavernParser.ts`](src/tools/llm-chat/services/sillyTavernParser.ts)

**改动**: 多开局拍扁逻辑 → 聚合为 group + variants。

```
改动前：first_mes + alternate_greetings → 全量拍入 presetMessages (isEnabled 互斥)
改动后：
  1. 创建 type: "group" 节点，groupName = "开场白"
  2. first_mes → 组内 Variant #0，name = "默认问候"，标记 isVariant: true
  3. alternate_greetings → 组内 Variant #1, #2, ...，name = "变体 N"，标记 isVariant: true
  4. 设置 group 节点的 activeVariantId = Variant #0 的 ID
  5. displayPresetCount 逻辑不变——箱组在预设列表中占一个位置
```

---

## 7. 编辑器解耦方案（阶段 A 独立）

### 7.1 目标架构

```
PresetMessageEditor.vue (纯编辑器，无壳，可嵌入任意容器)
  ├── 角色选择 (可隐藏)
  ├── 名称输入 (可隐藏)
  ├── 注入策略 (可隐藏)
  ├── 模型过滤 (可隐藏)
  ├── 工具栏 (宏/变量/知识库/复制/粘贴)
  └── RichCodeEditor + 预览

PresetMessageEditorDialog.vue (弹窗壳，给旧代码用)
  └── BaseDialog 包裹 PresetMessageEditor

VariantGroupManagerDialog.vue (箱组管理器弹窗) — 阶段 C
  ├── [顶部] 组属性编辑区
  │     ├── 组名称
  │     ├── 注入策略 (Group 级别)
  │     └── 模型过滤 (Group 级别)
  └── [主体] 左右分栏
        ├── [左侧 30%] Variant 列表
        │     ├── 列表项（变体名 + 摘要 + 设为默认⭐ + 删除🗑️）
        │     └── 新增 Variant 按钮
        └── [右侧 70%] PresetMessageEditor (纯编辑器直接嵌入)
              └── 编辑当前选中 Variant 的内容
```

### 7.2 `PresetMessageEditor.vue` Props 设计

```typescript
interface Props {
  // === 消息数据 ===
  modelValue: MessageForm; // v-model 绑定消息数据

  // === 上下文 ===
  agentName?: string;
  userProfile?: UserProfile | null;
  agent?: any;
  llmThinkRules?: LlmThinkRule[];
  richTextStyleOptions?: RichTextRendererStyleOptions;

  // === 控件可见性控制 ===
  hideRole?: boolean;       // Variant 场景：角色由组统一指定
  hideName?: boolean;       // 隐藏名称输入（无变体名场景）
  hideInjection?: boolean;  // Variant 场景：组统一管理注入策略
  hideModelMatch?: boolean; // Variant 场景：组统一管理模型过滤
  hideToolbar?: boolean;    // 隐藏工具栏
}
```

### 7.3 迁移路径

1. 去除 `BaseDialog` 壳：将现有 `PresetMessageEditor.vue` 中的 `<BaseDialog>` 标签剥离
2. 创建 `PresetMessageEditorDialog.vue`：新建弹窗壳，内部引用 `PresetMessageEditor`
3. 更新引用方：将 `AgentPresetEditor.vue` 中的 import 改为 `PresetMessageEditorDialog.vue`
4. 验证：弹窗编辑行为与重构前完全一致

---

## 8. 文件改动清单

| 阶段 | 文件 | 改动量 | 说明 |
|------|------|--------|------|
| **A. 编辑器解耦** | `editors/PresetMessageEditor.vue` | 中 | 去壳为纯编辑器组件 |
| **A. 编辑器解耦** | `editors/PresetMessageEditorDialog.vue` | **新文件** | 弹窗壳替代旧引用 |
| **B. 类型** | `types/message.ts` | 小 | metadata 扩展 + `type: "group"` |
| **B. 类型** | `types/common.ts` | 小 | `MessageType` 加 `"group"` |
| **B. 类型** | `types/session.ts` | 小 | `variantOverrides?` |
| **B. 解析** | `services/sillyTavernParser.ts` | 中 | 拍扁 → 聚合为 group |
| **B. 管道** | `core/context-processors/injection-assembler.ts` | 小 | 展开 group（~40行） |
| **C. 展示** | `utils/chatPathUtils.ts` | 中 | `resolvePresetMessages` + `getActivePathWithPresets` 修改 |
| **C. 展示** | `components/message/MessageList.vue` | 小 | `getMessageSiblings` 虚拟 siblings |
| **C. 展示** | `components/message/MessageMenubar.vue` | 小 | 解锁 `branch-control` + `switch-variant` |
| **C. 展示** | `components/message/ChatMessage.vue` | 小 | 事件透传 |
| **C. 展示** | `components/ChatArea.vue` | 小 | 事件透传 |
| **C. 展示** | `LlmChat.vue` | 小 | `handleSwitchVariant` |
| **C. 编辑器** | `editors/VariantGroupManagerDialog.vue` | **新文件** | 箱组管理器弹窗 |
| **C. 编辑器** | `assets/AgentPresetEditor.vue` | 中 | 列表渲染区分 group + 点击分发 |
| **D. Store** | `stores/llmChatStore.ts` | 中 | `switchVariant` action |
| **D. Store** | `composables/session/useSessionManager.ts` | 小 | `variantOverrides` 持久化 |
| **D. Store** | `composables/storage/useChatStorageSeparated.ts` | 小 | 序列化/反序列化 |
| **D. 发送** | `composables/chat/useChatHandler.ts` | 中 | `instantiateGreetingIfNeeded` |
| **E. 兼容** | `assets/AgentPresetBatchDialog.vue` | 小 | 适配 group |
| **E. 兼容** | 各类导出/预览 | 小 | 跳过 `isVariant` 节点 |

---

## 9. 实施阶段规划

### 阶段 A：编辑器解耦（纯重构，无功能变更）
- [ ] 重构 `PresetMessageEditor.vue`：剥离 `BaseDialog` 壳
- [ ] 新建 `PresetMessageEditorDialog.vue`
- [ ] 更新 `AgentPresetEditor.vue` 引用
- [ ] 验证：弹窗编辑行为与重构前完全一致

### 阶段 B：类型与解析
- [ ] 更新 `message.ts`、`common.ts`、`session.ts` 类型定义
- [ ] 修改 `sillyTavernParser.ts`：`alternate_greetings` → group + variants
- [ ] 修改 `injection-assembler.ts`：调用 `resolvePresetMessages` 展开 group

### 阶段 C：聊天 UI 与箱组管理器
- [ ] 实现 `resolvePresetMessages` + 修改 `getActivePathWithPresets`
- [ ] 修改 `MessageList.getMessageSiblings`（虚拟 siblings）
- [ ] 修改 `MessageMenubar`（`switch-variant` emit + `handleSwitchClick`）
- [ ] 事件透传链路：`ChatMessage` → `MessageList` → `ChatArea` → `LlmChat`
- [ ] 创建 `VariantGroupManagerDialog.vue`
- [ ] 适配 `AgentPresetEditor.vue`：group 渲染 + 点击分发

### 阶段 D：Store 与会话
- [ ] 实现 `store.switchVariant` action
- [ ] 修改 `useSessionManager`：`variantOverrides` 持久化
- [ ] 修改 `useChatStorageSeparated`：序列化
- [ ] 修改 `useChatHandler`：`instantiateGreetingIfNeeded`

### 阶段 E：测试与兼容
- [ ] 向后兼容验证：旧 Agent 数据正常加载和编辑
- [ ] 角色卡导入测试：多开局角色卡正确生成 group
- [ ] 会话切换开局测试：不同会话独立选择
- [ ] 实例化测试：首条消息触发 greeting 节点创建
- [ ] Agent 重导入后 variantOverrides 失效回退测试

---

## 10. 实施检查清单

在开始编码前，确认以下所有设计点已明确：

- [ ] `resolvePresetMessages` 函数签名和实现逻辑
- [ ] `getActivePathWithPresets` 的过滤条件修改
- [ ] `MessageList.getMessageSiblings` 的虚拟 siblings 构建（使用 `variantSiblingPreviews`）
- [ ] `MessageMenubar` 的 `switch-variant` emit 和 `handleSwitchClick` 方法
- [ ] 事件透传链路：`ChatMessage` → `MessageList` → `ChatArea` → `LlmChat` 无遗漏
- [ ] `store.switchVariant` action（含 executeOrProxy、持久化、循环切换）
- [ ] `instantiateGreetingIfNeeded` 触发条件和防重复机制
- [ ] `variantOverrides` 失效时的回退策略（加载时校验 ID 是否存在）
- [ ] 分页系统与 group 节点的兼容（group 始终完整显示在同一页）
- [ ] 持久化时机：variant 切换立即持久化（不防抖）