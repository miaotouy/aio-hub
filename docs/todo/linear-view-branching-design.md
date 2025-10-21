# 非线性对话架构：线性视图详细设计方案

> **文档版本**: v1.0  
> **最后更新**: 2025-01-21  
> **目标**: 为基于树状结构的非线性对话系统设计一套完整的技术方案，实现线性聊天界面中的分支管理、非破坏性编辑和灵活重试功能

---

## 目录

1. [核心概念与设计原则](#1-核心概念与设计原则)
2. [系统架构设计](#2-系统架构设计)
3. [数据层设计](#3-数据层设计)
4. [逻辑层设计](#4-逻辑层设计)
5. [UI 层设计](#5-ui-层设计)
6. [核心操作的数据流](#6-核心操作的数据流)
7. [API 接口设计](#7-api-接口设计)
8. [实现路线图](#8-实现路线图)

---

## 1. 核心概念与设计原则

### 1.1 核心概念

#### 活动路径 (Active Path)

- **定义**: 由 `activeLeafId` 唯一决定的，从根节点到该叶节点的**唯一路径**
- **作用**: 
  - 线性视图**只渲染**活动路径上的节点
  - 任何不在活动路径上的节点，无论其状态如何，都不会在线性视图中显示
- **切换方式**: 通过改变 `activeLeafId` 来切换整个线性视图显示的内容

#### 节点启用状态 (`isEnabled`)

- **定义**: 每个节点的布尔状态，默认为 `true`
- **作用**:
  - **UI 层面**: 在活动路径上的节点若 `isEnabled` 为 `false`，以半透明或删除线样式显示
  - **上下文构建**: 将活动路径转换为 LLM 上下文时，跳过 `isEnabled` 为 `false` 的节点
- **切换方式**: 用户通过 UI 操作直接修改，**不影响** `activeLeafId`

#### 关键原则

```
activeLeafId  → 决定"看哪条分支"
isEnabled     → 决定"这条分支上的哪句话要被 AI 忽略"
```

### 1.2 设计原则

1. **职责分离**: 路径选择与节点状态完全正交
2. **非破坏性**: 所有编辑操作创建新节点，旧节点保留
3. **数据驱动**: UI 是数据的纯粹投影，不维护状态
4. **单一数据源**: Pinia Store 是唯一的真理来源

---

## 2. 系统架构设计

### 2.1 分层架构

```
┌─────────────────────────────────────────────────────────────┐
│                     视图层 (View Layer)                      │
│  ┌──────────────────────┐    ┌────────────────────────┐    │
│  │  MessageList.vue     │    │  MessageItem.vue       │    │
│  │  (线性聊天视图)       │    │  (单条消息渲染)         │    │
│  └──────────┬───────────┘    └────────┬───────────────┘    │
│             │                          │                     │
│             │  props: messages         │  props: message    │
│             │  emit: events            │  emit: actions     │
└─────────────┼──────────────────────────┼─────────────────────┘
              │                          │
┌─────────────▼──────────────────────────▼─────────────────────┐
│                  逻辑层 (Logic Layer)                         │
│  ┌──────────────────┐  ┌──────────────┐  ┌───────────────┐ │
│  │  PathResolver    │  │ BranchNav    │  │ ContextBuilder│ │
│  │  (路径解析器)     │  │ (分支导航)    │  │ (上下文构建)   │ │
│  └────────┬─────────┘  └──────┬───────┘  └───────┬───────┘ │
│           │                   │                   │          │
└───────────┼───────────────────┼───────────────────┼──────────┘
            │                   │                   │
┌───────────▼───────────────────▼───────────────────▼──────────┐
│              状态管理层 (State Layer - Pinia)                 │
│  ┌────────────────────────────────────────────────────────┐ │
│  │              useLlmChatStore                           │ │
│  │  ┌──────────────────┐  ┌──────────────────────────┐  │ │
│  │  │  State           │  │  Getters                 │  │ │
│  │  │  - sessions      │  │  - currentActivePath     │  │ │
│  │  │  - currentSessId │  │  - llmContext            │  │ │
│  │  └──────────────────┘  │  - getSiblings           │  │ │
│  │  ┌──────────────────┐  └──────────────────────────┘  │ │
│  │  │  Actions         │                                 │ │
│  │  │  - sendMessage   │                                 │ │
│  │  │  - regenerate    │                                 │ │
│  │  │  - editMessage   │                                 │ │
│  │  │  - switchBranch  │                                 │ │
│  │  │  - toggleEnabled │                                 │ │
│  │  └──────────────────┘                                 │ │
│  └────────────────────────────────────────────────────────┘ │
└───────────────────────────┬────────────────────────────────┘
                            │
┌───────────────────────────▼────────────────────────────────┐
│           数据持久层 (Storage Layer)                        │
│  ┌────────────────────────────────────────────────┐       │
│  │  LocalStorage / IndexedDB                      │       │
│  │  - sessions (JSON)                             │       │
│  │  - currentSessionId                            │       │
│  └────────────────────────────────────────────────┘       │
└────────────────────────────────────────────────────────────┘
```

### 2.2 数据流图

```
用户操作 (User Action)
    │
    ▼
┌─────────────────────┐
│  UI Event Handler   │  例如: @regenerate="handleRegenerate"
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Store Action       │  例如: store.regenerateFromNode(nodeId)
└──────────┬──────────┘
           │
           ├─→ PathResolver.resolveActivePath(session)
           │       │
           │       └─→ 返回节点数组
           │
           ├─→ TreeManipulator.createNewNode(...)
           │       │
           │       └─→ 修改 session.nodes
           │
           ├─→ session.activeLeafId = newLeafId
           │
           └─→ persistSessions()
                   │
                   ▼
           ┌───────────────┐
           │  Getter 重算   │
           └───────┬───────┘
                   │
                   ▼
           ┌───────────────┐
           │  Vue 响应式    │
           └───────┬───────┘
                   │
                   ▼
           ┌───────────────┐
           │  UI 重新渲染   │
           └───────────────┘
```

---

## 3. 数据层设计

### 3.1 核心数据结构

数据结构定义见 [`src/tools/llm-chat/types.ts`](../src/tools/llm-chat/types.ts)

#### ChatMessageNode

```typescript
interface ChatMessageNode {
  id: string;                // UUID
  parentId: string | null;   // 父节点 ID，根节点为 null
  childrenIds: string[];     // 子节点 ID 列表（有序）
  content: string;
  role: 'user' | 'assistant' | 'system';
  status: 'generating' | 'complete' | 'error';
  isEnabled?: boolean;       // 默认 true
  timestamp: string;         // ISO 8601
  metadata?: { /* ... */ };
}
```

#### ChatSession

```typescript
interface ChatSession {
  id: string;
  nodes: Record<string, ChatMessageNode>;  // 节点字典
  rootNodeId: string;                      // 根节点 ID
  activeLeafId: string;                    // 当前活跃叶节点 ID
  name: string;
  currentAgentId: string | null;
  // ... 其他字段
}
```

### 3.2 数据约束

1. **双向引用一致性**: 
   - 若 A.childrenIds 包含 B.id，则 B.parentId === A.id
2. **根节点唯一性**: 
   - 每个 session 只有一个 parentId === null 的节点
3. **路径完整性**: 
   - 从 activeLeafId 回溯到根节点必须形成完整路径
4. **启用状态默认值**: 
   - isEnabled 默认为 true，缺失时视为 true

---

## 4. 逻辑层设计

### 4.1 PathResolver (路径解析器)

**职责**: 从树中提取活动路径

```typescript
class PathResolver {
  /**
   * 核心方法：解析活动路径
   * 注意：不过滤 isEnabled 状态
   */
  static resolveActivePath(session: ChatSession): ChatMessageNode[] {
    const path: ChatMessageNode[] = [];
    let currentId: string | null = session.activeLeafId;
    
    while (currentId !== null) {
      const node = session.nodes[currentId];
      if (!node) {
        console.error(`路径损坏: 节点 ${currentId} 不存在`);
        break;
      }
      path.unshift(node);
      currentId = node.parentId;
    }
    
    return path;
  }

  /**
   * 解析任意节点到根的路径
   */
  static resolvePathToNode(
    session: ChatSession, 
    nodeId: string
  ): ChatMessageNode[] {
    const path: ChatMessageNode[] = [];
    let currentId: string | null = nodeId;
    
    while (currentId !== null) {
      const node = session.nodes[currentId];
      if (!node) break;
      path.unshift(node);
      currentId = node.parentId;
    }
    
    return path;
  }
}
```

### 4.2 BranchNavigator (分支导航器)

**职责**: 管理分支的切换和遍历

```typescript
class BranchNavigator {
  /**
   * 获取节点的所有兄弟节点（包括自己）
   */
  static getSiblings(
    session: ChatSession, 
    nodeId: string
  ): ChatMessageNode[] {
    const node = session.nodes[nodeId];
    if (!node || !node.parentId) {
      return [node].filter(Boolean);
    }
    
    const parent = session.nodes[node.parentId];
    if (!parent) return [node];
    
    return parent.childrenIds
      .map(id => session.nodes[id])
      .filter(Boolean);
  }

  /**
   * 在兄弟节点间切换
   * @returns 新的 activeLeafId
   */
  static switchToSibling(
    session: ChatSession,
    currentNodeId: string,
    direction: 'prev' | 'next'
  ): string {
    const siblings = this.getSiblings(session, currentNodeId);
    if (siblings.length <= 1) return currentNodeId;
    
    const currentIndex = siblings.findIndex(n => n.id === currentNodeId);
    if (currentIndex === -1) return currentNodeId;
    
    let targetIndex: number;
    if (direction === 'next') {
      targetIndex = (currentIndex + 1) % siblings.length;
    } else {
      targetIndex = (currentIndex - 1 + siblings.length) % siblings.length;
    }
    
    const targetNode = siblings[targetIndex];
    return this.findLeafOfBranch(session, targetNode.id);
  }

  /**
   * 从某个节点开始，找到其所在分支的叶节点
   * 策略：优先选择第一个子节点（主干）
   */
  static findLeafOfBranch(
    session: ChatSession, 
    startNodeId: string
  ): string {
    let current = session.nodes[startNodeId];
    
    while (current && current.childrenIds.length > 0) {
      const nextId = current.childrenIds[0];
      current = session.nodes[nextId];
    }
    
    return current ? current.id : startNodeId;
  }

  /**
   * 判断某个节点是否在当前活动路径上
   */
  static isNodeInActivePath(
    session: ChatSession,
    nodeId: string
  ): boolean {
    const activePath = PathResolver.resolveActivePath(session);
    return activePath.some(n => n.id === nodeId);
  }
}
```

### 4.3 ContextBuilder (上下文构建器)

**职责**: 将路径转换为 LLM 上下文

```typescript
class ContextBuilder {
  /**
   * 构建 LLM 上下文
   * 在这里过滤 isEnabled === false 的节点
   */
  static buildLlmContext(
    path: ChatMessageNode[]
  ): Array<{ role: string; content: string }> {
    return path
      .filter(node => node.isEnabled !== false)
      .filter(node => node.role !== 'system') // 排除系统根节点
      .map(node => ({
        role: node.role,
        content: node.content,
      }));
  }
}
```

### 4.4 TreeManipulator (树操作器)

**职责**: 封装所有对节点树的原子操作

```typescript
class TreeManipulator {
  /**
   * 创建新节点并添加到树中
   */
  static createNode(
    session: ChatSession,
    data: Omit<ChatMessageNode, 'id' | 'timestamp' | 'childrenIds'>
  ): ChatMessageNode {
    const node: ChatMessageNode = {
      id: `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      childrenIds: [],
      timestamp: new Date().toISOString(),
      isEnabled: true,
      ...data,
    };
    
    session.nodes[node.id] = node;
    
    // 更新父节点的 childrenIds
    if (node.parentId) {
      const parent = session.nodes[node.parentId];
      if (parent && !parent.childrenIds.includes(node.id)) {
        parent.childrenIds.push(node.id);
      }
    }
    
    return node;
  }

  /**
   * 将某个节点的子节点嫁接到另一个节点
   */
  static transferChildren(
    session: ChatSession,
    fromNodeId: string,
    toNodeId: string
  ): void {
    const fromNode = session.nodes[fromNodeId];
    const toNode = session.nodes[toNodeId];
    
    if (!fromNode || !toNode) return;
    
    // 转移子节点
    toNode.childrenIds = [...fromNode.childrenIds];
    toNode.childrenIds.forEach(childId => {
      const child = session.nodes[childId];
      if (child) {
        child.parentId = toNode.id;
      }
    });
    
    // 清空原节点的子节点列表
    fromNode.childrenIds = [];
  }
}
```

---

## 5. UI 层设计

### 5.1 MessageList.vue

**职责**: 渲染活动路径上的消息列表

**输入**:
- `messages`: `ChatMessageNode[]` - 来自 `store.currentActivePath`
- `isSending`: `boolean`

**输出事件**:
- `delete-message(nodeId: string)`
- `regenerate(nodeId: string)`
- `switch-sibling(nodeId: string, direction: 'prev' | 'next')`
- `toggle-enabled(nodeId: string)`
- `edit-message(nodeId: string, newContent: string)`

### 5.2 MessageItem.vue (新组件)

**职责**: 渲染单条消息及其操作

**输入**:
```typescript
interface MessageItemProps {
  message: ChatMessageNode;
  siblings: ChatMessageNode[];   // 兄弟节点列表
  isInActivePath: boolean;        // 是否在活动路径上
  isSending: boolean;
}
```

**UI 结构**:
```vue
<template>
  <div 
    class="message-item" 
    :class="{
      'is-disabled': message.isEnabled === false,
      'is-user': message.role === 'user',
      'is-assistant': message.role === 'assistant'
    }"
  >
    <!-- 兄弟分支指示器 -->
    <div v-if="siblings.length > 1" class="branch-indicator">
      <button @click="$emit('switch-sibling', 'prev')">←</button>
      <span>{{ currentSiblingIndex + 1 }} / {{ siblings.length }}</span>
      <button @click="$emit('switch-sibling', 'next')">→</button>
    </div>

    <!-- 消息内容 -->
    <div class="message-content">
      <pre>{{ message.content }}</pre>
    </div>

    <!-- 操作按钮 -->
    <div class="message-actions">
      <button @click="$emit('copy')">复制</button>
      <button @click="$emit('edit')">编辑</button>
      <button @click="$emit('regenerate')">
        {{ message.role === 'user' ? '重新发送' : '重新生成' }}
      </button>
      <button @click="$emit('toggle-enabled')">
        {{ message.isEnabled === false ? '启用' : '禁用' }}
      </button>
    </div>
  </div>
</template>
```

**样式规则**:
```css
.message-item.is-disabled {
  opacity: 0.5;
  text-decoration: line-through;
}

.branch-indicator {
  /* 显眼的分支切换UI */
  background: var(--primary-color);
  color: white;
  padding: 4px 8px;
  border-radius: 4px;
}
```

---

## 6. 核心操作的数据流

### 6.1 重新生成 AI 消息

**触发**: 用户点击 AI 消息的"重新生成"按钮

**流程**:
```
1. UI: emit('regenerate', message.id)
2. ChatArea: store.regenerateAssistantMessage(nodeId)
3. Store Action:
   a. 找到目标节点 targetNode
   b. 找到父节点 parentNode
   c. session.activeLeafId = parentNode.id
   d. 调用 sendMessage(parentNode.content)
4. sendMessage:
   a. 创建新的 assistant 节点作为 parentNode 的子节点
   b. 发送 API 请求
   c. 更新新节点的内容
   d. session.activeLeafId = 新节点.id
5. UI 自动刷新（因为 currentActivePath getter 重新计算）
```

**数据变化**:
```
Before:
Root → User1 → Assistant1(旧) → User2 → Assistant2
                  ↑ activeLeafId 在这条路径上

After (点击 Assistant1 重新生成):
Root → User1 → Assistant1(旧)
            └→ Assistant1'(新) ← activeLeafId
```

### 6.2 编辑用户消息

**触发**: 用户编辑某条用户消息的内容

**流程**:
```
1. UI: emit('edit-message', nodeId, newContent)
2. Store Action: editUserMessage(nodeId, newContent)
3. 逻辑:
   a. 创建新用户消息节点 newNode
   b. newNode.parentId = oldNode.parentId
   c. 将 oldNode 的子节点嫁接到 newNode
      - newNode.childrenIds = oldNode.childrenIds
      - 更新每个子节点的 parentId
   d. 清空 oldNode.childrenIds
   e. 将 newNode 添加到父节点的 childrenIds
   f. 如果当前路径经过 oldNode，切换到 newNode 路径
      - session.activeLeafId = findLeafOfBranch(newNode.id)
4. UI 自动刷新
```

**数据变化**:
```
Before:
Root → User1(旧, "原内容") → Assistant1 → User2
          ↑ 用户编辑这个

After:
Root → User1(旧, "原内容")  [childrenIds: []]
    └→ User1'(新, "新内容") → Assistant1 → User2
                               ↑ activeLeafId 切换到新路径
```

### 6.3 切换分支

**触发**: 用户点击分支指示器的左右箭头

**流程**:
```
1. UI: emit('switch-sibling', nodeId, 'next')
2. Store Action: switchToSiblingBranch(nodeId, 'next')
3. 逻辑:
   a. 获取兄弟节点 siblings = BranchNavigator.getSiblings(session, nodeId)
   b. 找到当前节点在兄弟中的索引
   c. 计算目标节点索引（循环）
   d. 找到目标节点所在分支的叶节点
   e. session.activeLeafId = 叶节点.id
4. UI 自动刷新（整个消息列表内容改变）
```

### 6.4 禁用/启用节点

**触发**: 用户点击消息的"禁用"或"启用"按钮

**流程**:
```
1. UI: emit('toggle-enabled', nodeId)
2. Store Action: toggleNodeEnabled(nodeId)
3. 逻辑:
   node.isEnabled = !node.isEnabled
4. UI 局部刷新（该消息的样式改变，但列表不变）
```

---

## 7. API 接口设计

### 7.1 Store Getters

```typescript
getters: {
  /**
   * 当前活动路径（UI 渲染数据源）
   */
  currentActivePath(): ChatMessageNode[] {
    if (!this.currentSession) return [];
    return PathResolver.resolveActivePath(this.currentSession);
  },

  /**
   * LLM 上下文（过滤了 isEnabled === false 的节点）
   */
  llmContext(): Array<{ role: string; content: string }> {
    const path = this.currentActivePath;
    return ContextBuilder.buildLlmContext(path);
  },

  /**
   * 获取某个节点的兄弟节点
   */
  getSiblings: (state) => (nodeId: string): ChatMessageNode[] => {
    if (!state.currentSession) return [];
    return BranchNavigator.getSiblings(state.currentSession, nodeId);
  },

  /**
   * 判断节点是否在活动路径上
   */
  isNodeInActivePath: (state) => (nodeId: string): boolean => {
    if (!state.currentSession) return false;
    return BranchNavigator.isNodeInActivePath(state.currentSession, nodeId);
  },
}
```

### 7.2 Store Actions

```typescript
actions: {
  /**
   * 发送消息（核心逻辑，使用 llmContext）
   */
  async sendMessage(content: string): Promise<void> {
    // 使用 this.llmContext 构建上下文
    const context = this.llmContext;
    // ... 发送逻辑
  },

  /**
   * 从指定节点重新生成
   */
  async regenerateAssistantMessage(nodeId: string): Promise<void> {
    const session = this.currentSession;
    if (!session) return;

    const targetNode = session.nodes[nodeId];
    if (!targetNode || targetNode.role !== 'assistant') return;

    const parentNode = session.nodes[targetNode.parentId!];
    if (!parentNode) return;

    // 回退到父节点
    session.activeLeafId = parentNode.id;
    
    // 重新发送
    await this.sendMessage(parentNode.content);
  },

  /**
   * 编辑用户消息
   */
  editUserMessage(nodeId: string, newContent: string): void {
    const session = this.currentSession;
    if (!session) return;

    const oldNode = session.nodes[nodeId];
    if (!oldNode || oldNode.role !== 'user') return;

    // 创建新节点
    const newNode = TreeManipulator.createNode(session, {
      parentId: oldNode.parentId,
      content: newContent,
      role: 'user',
      status: 'complete',
    });

    // 嫁接子节点
    TreeManipulator.transferChildren(session, oldNode.id, newNode.id);

    // 更新父节点的 childrenIds
    if (oldNode.parentId) {
      const parent = session.nodes[oldNode.parentId];
      if (parent) {
        const index = parent.childrenIds.indexOf(oldNode.id);
        if (index !== -1) {
          parent.childrenIds.splice(index + 1, 0, newNode.id);
        }
      }
    }

    // 如果在活动路径上，切换到新分支
    const currentPath = this.currentActivePath;
    if (currentPath.some(n => n.id === nodeId)) {
      session.activeLeafId = BranchNavigator.findLeafOfBranch(session, newNode.id);
    }

    this.persistSessions();
  },

  /**
   * 切换到兄弟分支
   */
  switchToSiblingBranch(nodeId: string, direction: 'prev' | 'next'): void {
    const session = this.currentSession;
    if (!session) return;

    const newLeafId = BranchNavigator.switchToSibling(session, nodeId, direction);
    session.activeLeafId = newLeafId;
    
    this.persistSessions();
  },

  /**
   * 切换节点启用状态
   */
  toggleNodeEnabled(nodeId: string): void {
    const session = this.currentSession;
    if (!session) return;

    const node = session.nodes[nodeId];
    if (node) {
      node.isEnabled = !(node.isEnabled ?? true);
      this.persistSessions();
    }
  },
}
```

---

## 8. 实现路线图

### 阶段一：基础架构（1-2 天）

**目标**: 建立核心的路径管理机制

- [ ] 在 `store.ts` 中重构 `currentActivePath` getter
  - 移除 `isEnabled` 过滤逻辑
  - 使用 `PathResolver.resolveActivePath`
- [ ] 在 `store.ts` 中新增 `llmContext` getter
  - 调用 `ContextBuilder.buildLlmContext`
  - 在这里过滤 `isEnabled === false`
- [ ] 修改 `sendMessage` 和 `regenerateFromNode`
  - 使用 `llmContext` 而非 `currentMessageChain`
- [ ] 在 `store.ts` 中新增 `getSiblings` getter

**验证**:
- [ ] `currentActivePath` 返回完整路径，包括禁用节点
- [ ] `llmContext` 正确过滤禁用节点
- [ ] 发送消息时使用过滤后的上下文

### 阶段二：分支导航 UI（2-3 天）

**目标**: 让用户可以在兄弟分支间切换

- [ ] 创建 `BranchNavigator` 工具类
  - `getSiblings`
  - `switchToSibling`
  - `findLeafOfBranch`
- [ ] 在 `MessageList.vue` 中为每条消息传递 `siblings`
- [ ] 创建分支指示器组件
  - 显示 "N / M" (第几个 / 共几个)
  - 左右箭头按钮
- [ ] 实现 `switchToSiblingBranch` action
- [ ] 连接事件流

**验证**:
- [ ] 有多个兄弟节点时显示指示器
- [ ] 点击箭头可以切换分支
- [ ] 切换后消息列表正确更新

### 阶段三：消息编辑（3-4 天）

**目标**: 实现非破坏性的消息编辑

- [ ] 创建 `TreeManipulator` 工具类
  - `createNode`
  - `transferChildren`
- [ ] 实现 `editUserMessage` action
- [ ] 在 `MessageItem` 中添加编辑 UI
  - 可编辑文本框
  - 保存/取消按钮
- [ ] 连接事件流

**验证**:
- [ ] 编辑后创建新节点
- [ ] 子节点正确迁移
- [ ] 活动路径自动切换到新分支

### 阶段四：完善重试功能（2-3 天）

**目标**: 用户消息和 AI 消息都可以重试

- [ ] 重构 `regenerateAssistantMessage`
  - 使用新的路径管理逻辑
  - 只改变 `activeLeafId`，不修改 `isEnabled`
- [ ] 实现 `retryUserMessage` action
- [ ] 在 MessageItem 中为用户消息添加"重新发送"按钮
- [ ] 在 MessageItem 中为 AI 消息添加"重新生成"按钮

**验证**:
- [ ] 点击 AI 消息的重新生成，创建新分支
- [ ] 点击用户消息的重新发送，创建新分支
- [ ] 旧分支保留且可切换回去

### 阶段五：节点启用/禁用（1-2 天）

**目标**: 允许用户控制哪些消息参与上下文

- [ ] 实现 `toggleNodeEnabled` action
- [ ] 在 MessageItem 中添加启用/禁用按钮
- [ ] 添加禁用状态的视觉样式

**验证**:
- [ ] 禁用后消息变半透明或带删除线
- [ ] 禁用的消息不参与 LLM 上下文构建
- [ ] 禁用的消息仍然在线性视图中显示

### 阶段六：边界情况与测试（2-3 天）

**目标**: 处理各种边界情况，确保系统稳定

- [ ] 数据校验函数
  - 检查 `parentId` 和 `childrenIds` 一致性
  - 检查路径完整性
- [ ] 错误处理
  - 路径损坏时的降级策略
  - 节点不存在时的处理
- [ ] 单元测试
  - `PathResolver` 测试
  - `BranchNavigator` 测试
  - `ContextBuilder` 测试
- [ ] 集成测试
  - 完整的用户操作流程

**验证**:
- [ ] 所有边界情况都有妥善处理
- [ ] 不会因数据异常导致崩溃
- [ ] 测试覆盖率达标

---

## 附录

### A. 术语表

| 术语 | 定义 |
|------|------|
| 活动路径 | 从根节点到 activeLeafId 的唯一路径 |
| 兄弟节点 | 拥有相同父节点的节点 |
| 分支 | 从某个节点开始的子树 |
| 嫁接 | 将一组节点的父节点改为另一个节点 |
| 非破坏性编辑 | 通过创建新节点而非修改旧节点来实现变更 |

### B. 参考资料

- Cherry Studio 分析报告: `../../ToolsRC20/cherry-studio/docs/chat-page-analysis-report.md`
- ComfyTavern 分支设计: `../../ComfyTavern/DesignDocs/architecture/chat-history-branching-design.md`
- 当前系统分析: `./llm-chat-analysis-report.md`

---

**文档结束**