# 多开局系统 (Greeting System) 设计方案

> **状态**: RFC  
> **创建时间**: 2025-05-27  
> **关联模块**: llm-chat

## 1. 需求概述

实现独立于预设消息的"多开局"功能，参考 SillyTavern 的 First Message / Alternate Greetings 机制：

- **独立性**: 不塞入现有的 `presetMessages` 系统，避免增加预设消息处理的复杂度
- **真实节点**: 在会话中显示为第一条消息，作为真实的 `ChatMessageNode` 存在于消息树中
- **分支切换**: 多个开局作为兄弟节点，复用现有的左右切换机制，切换始终可用
- **固化语义**: 会话中发送过消息后，开局节点的内容**固化为快照**，不再跟随 Agent 配置中 greetings 的修改。未固化时，开局内容保持与 Agent 配置同步

## 2. 现有架构分析

### 2.1 预设消息的局限

当前 `presetMessages` + `displayPresetCount` 的方案：

- 预设消息是**虚拟的**，不存在于消息树中
- 通过 `getActivePathWithPresets()` 在渲染时动态拼接到消息列表前面
- 标记 `isPresetDisplay: true` 仅用于 UI 区分
- 不支持分支切换、编辑等交互操作
- ST 导入时 `first_mes` / `alternate_greetings` 被塞入 presetMessages，只能通过 enable/disable 切换，体验差

### 2.2 可复用的基础设施

- **消息树**: `ChatMessageNode` 的 `parentId` / `childrenIds` 天然支持兄弟关系
- **分支切换**: `BranchNavigator.switchToSibling()` + `switchToSiblingBranch()` 已实现左右切换
- **会话创建**: `createSession()` 目前只创建根节点，可以在此基础上扩展
- **活跃路径**: `currentActivePath` 从 `activeLeafId` 向上遍历，过滤根节点后返回

## 3. 数据模型设计

### 3.1 Agent 新增字段

```typescript
// types/agent.ts - AgentBaseConfig 中新增
interface AgentBaseConfig {
  // ... 现有字段 ...

  /**
   * 开局消息列表
   *
   * 独立于 presetMessages，在创建会话时作为真实节点插入消息树。
   * 多个开局作为根节点的子节点（兄弟关系），支持分支切换。
   * 会话中发送消息后内容固化，不再跟随 Agent 配置变化。
   */
  greetings?: GreetingMessage[];
}

/**
 * 开局消息定义
 */
interface GreetingMessage {
  /** 唯一标识（用于追踪来源） */
  id: string;
  /** 开局名称（UI 显示用，如 "默认开场白"、"冷淡版"） */
  name?: string;
  /** 消息内容（支持宏） */
  content: string;
  /** 消息角色（通常为 assistant，也可以是 user 用于特殊场景） */
  role: "assistant" | "user";
  /** 附件（可选） */
  attachments?: Asset[];
}
```

### 3.2 消息节点标记

开局消息插入消息树后，通过 `metadata` 标记其身份和状态：

```typescript
// 开局节点的 metadata 中新增
metadata: {
  // ... 现有字段 ...

  /** 标记此节点为开局消息 */
  isGreeting?: boolean;
  /** 开局消息的来源 ID（对应 GreetingMessage.id） */
  greetingId?: string;
  /**
   * 开局是否处于活跃状态（未固化）
   * - true: 内容跟随 Agent 配置实时同步
   * - false/undefined: 内容已固化为快照
   */
  greetingLive?: boolean;
}
```

### 3.3 消息树结构示意

```
Root (system, 空内容)
├── Greeting A (assistant, "你好！我是...") ← 兄弟节点，可左右切换
├── Greeting B (assistant, "嗯...又见面了")
└── Greeting C (assistant, "今天想聊什么？")
```

当用户在 Greeting A 下发送消息后（所有开局固化，但分支切换仍可用）：

```
Root (system, 空内容)
├── Greeting A (assistant, 已固化) ← 当前活跃路径
│   └── User Message (user, "你好")
│       └── Assistant Reply (assistant, "...")
├── Greeting B (assistant, 已固化) ← 仍可切换查看
└── Greeting C (assistant, 已固化) ← 仍可切换查看
```

## 4. 核心流程设计

### 4.1 会话创建时插入开局

修改 `useSessionManager.createSession()`：

```typescript
const createSession = (agentId: string, name?: string) => {
  // ... 现有逻辑：创建根节点 ...

  const agent = agentStore.getAgentById(agentId);

  // 新增：插入开局消息
  if (agent.greetings && agent.greetings.length > 0) {
    const greetingNodes: ChatMessageNode[] = [];

    for (const greeting of agent.greetings) {
      const greetingNode: ChatMessageNode = {
        id: generateNodeId(),
        parentId: rootNodeId,
        childrenIds: [],
        content: greeting.content, // 宏在此时展开
        role: greeting.role,
        status: "complete",
        isEnabled: true,
        timestamp: now,
        attachments: greeting.attachments,
        metadata: {
          isGreeting: true,
          greetingId: greeting.id,
          greetingLive: true, // 标记为活跃，内容跟随 Agent 配置
          agentId: agent.id,
          agentName: agent.name,
          agentDisplayName: agent.displayName || agent.name,
          agentIcon: agent.icon,
        },
      };

      greetingNodes.push(greetingNode);
      detail.nodes[greetingNode.id] = greetingNode;
      rootNode.childrenIds.push(greetingNode.id);
    }

    // activeLeafId 指向第一个开局
    detail.activeLeafId = greetingNodes[0].id;
  }

  // ... 后续逻辑 ...
};
```

### 4.2 固化机制（两阶段模型）

"固化"是指开局节点从**活跃状态**（跟随 Agent 配置）转变为**快照状态**（内容固定，成为真正的历史节点）。

#### 4.2.1 活跃阶段（`greetingLive: true`）

- 开局节点已存在于消息树中，有真实的 content
- 当 Agent 的 `greetings` 配置被修改时，同步更新所有关联会话中**未固化**的开局节点内容
- 分支切换正常可用

#### 4.2.2 固化触发

当用户在会话中**发送第一条消息**时，所有开局节点同时固化：

```typescript
/**
 * 固化会话中的所有开局节点
 * 触发时机：sendMessage 流程中，创建用户消息节点之前
 */
function solidifyGreetings(session: ChatSessionDetail): void {
  const rootNode = session.nodes[session.rootNodeId];
  if (!rootNode) return;

  for (const childId of rootNode.childrenIds) {
    const child = session.nodes[childId];
    if (child?.metadata?.isGreeting && child.metadata.greetingLive) {
      // 移除活跃标记，内容从此固定为快照
      child.metadata.greetingLive = false;
    }
  }
}
```

#### 4.2.3 固化后的行为

- 开局节点的 content 不再跟随 Agent 配置变化
- 分支切换**仍然可用**（切换不会搞乱消息，每个分支是独立路径）
- 开局节点成为真正的历史消息，与普通助手消息无异
- 可以正常编辑、删除

#### 4.2.4 判定是否已固化

```typescript
/**
 * 判断会话的开局是否已固化
 * 条件：任何一个开局节点的 greetingLive 为 false 或不存在
 *       或者任何一个开局节点有子节点
 */
function isGreetingSolidified(session: ChatSessionDetail): boolean {
  const rootNode = session.nodes[session.rootNodeId];
  if (!rootNode) return false;

  for (const childId of rootNode.childrenIds) {
    const child = session.nodes[childId];
    if (child?.metadata?.isGreeting) {
      // 有子节点 或 greetingLive 已为 false → 已固化
      if (child.childrenIds.length > 0 || !child.metadata.greetingLive) {
        return true;
      }
    }
  }

  return false;
}
```

### 4.3 Agent 配置同步逻辑

当 Agent 的 `greetings` 被修改时，需要同步未固化的会话：

```typescript
/**
 * 同步 Agent greetings 配置到未固化的会话
 * 触发时机：Agent 编辑保存时
 */
function syncGreetingsToLiveSessions(
  agent: ChatAgent,
  sessionDetailMap: Map<string, ChatSessionDetail>
): void {
  for (const [, session] of sessionDetailMap) {
    if (isGreetingSolidified(session)) continue;

    const rootNode = session.nodes[session.rootNodeId];
    if (!rootNode) continue;

    // 检查开局是否属于当前 Agent
    const liveGreetings = rootNode.childrenIds
      .map((id) => session.nodes[id])
      .filter((n) => n?.metadata?.isGreeting && n.metadata.greetingLive);

    if (liveGreetings.length === 0) continue;
    if (liveGreetings[0]?.metadata?.agentId !== agent.id) continue;

    // 重建开局节点：移除旧的，根据新配置重新创建
    rebuildLiveGreetings(session, agent);
  }
}
```

### 4.4 分支切换

开局节点的分支切换**始终可用**，无论是否固化。理由：

- 每个开局是独立的分支路径
- 切换只是改变 `activeLeafId`，不会影响其他分支的内容
- 固化后切换到另一个开局分支，该分支下可能没有后续消息（空分支），这是正常的
- 完全复用现有的 `BranchNavigator.switchToSibling()` 机制，无需任何拦截

### 4.5 上下文管道适配

开局消息作为真实节点存在于消息树中，`session-loader` 会自然地将其加载到活跃路径中。**无需修改上下文管道**。

宏处理策略：

- 创建会话时对开局内容执行一次宏展开（如 `{{user}}`、`{{char}}`）
- Agent 配置同步时重新执行宏展开
- 固化后内容不再变化

### 4.6 与 displayPresetCount 的关系

引入 greeting 系统后：

- `displayPresetCount` 仍然控制预设消息的虚拟显示（用于 system prompt 等的可视化）
- greeting 是真实节点，不需要 `displayPresetCount` 参与
- ST 导入时，`first_mes` / `alternate_greetings` 应迁移到 `greetings` 字段而非 `presetMessages`

## 5. UI 交互设计

### 5.1 会话中的开局显示

- 开局消息作为消息列表的第一条消息显示
- 如果有多个开局，显示分支切换指示器（`◀ 1/3 ▶`），与普通消息的分支切换一致
- 未固化时可以加一个微妙的视觉提示（如淡色边框或标签），表示内容可能随 Agent 配置变化

### 5.2 Agent 编辑器中的开局管理

在 Agent 编辑器中新增"开局消息"分区（独立于"预设消息"分区）：

- 支持添加/删除/排序多个开局
- 每个开局支持编辑名称、内容、角色
- 支持预览效果

### 5.3 新建会话时的开局选择（可选增强）

如果 Agent 有多个开局，新建会话时可以：

- **方案 A（推荐）**: 默认使用第一个，用户在会话中通过分支切换选择 → 简单，复用现有机制
- **方案 B**: 弹出选择器让用户选一个 → 增加交互步骤，但更直观

建议先实现方案 A，后续根据反馈考虑方案 B。

## 6. ST 兼容性

### 6.1 导入映射

```
ST first_mes          → greetings[0] (role: assistant)
ST alternate_greetings → greetings[1..N] (role: assistant)
```

### 6.2 迁移策略

对于已有的 Agent（通过 ST 导入，first_mes 在 presetMessages 中）：

- `agentMigrationService` 新增迁移规则
- 检测 presetMessages 中标记为 "First Message" / "Alternate Greeting" 的条目
- 将其迁移到 `greetings` 字段
- 从 presetMessages 中移除
- 相应调整 `displayPresetCount`

## 7. 实现步骤

### Phase 1: 数据层

1. 定义 `GreetingMessage` 类型
2. 在 `AgentBaseConfig` 中新增 `greetings` 字段
3. 在 `ChatMessageNode.metadata` 中新增 `isGreeting` / `greetingId` / `greetingLive`

### Phase 2: 核心逻辑

4. 修改 `useSessionManager.createSession()` 插入开局节点
5. 实现 `solidifyGreetings()` 固化逻辑，集成到 `sendMessage` 流程
6. 实现 `syncGreetingsToLiveSessions()` Agent 配置同步逻辑

### Phase 3: UI

7. 消息气泡中识别开局节点，复用现有分支切换指示器
8. Agent 编辑器新增"开局消息"管理分区

### Phase 4: 兼容性

9. 修改 ST 导入逻辑，将 first_mes 映射到 greetings
10. 实现 Agent 数据迁移规则

## 8. 边界情况

| 场景                     | 处理方式                                                                       |
| ------------------------ | ------------------------------------------------------------------------------ |
| Agent 没有 greetings     | 会话创建后 activeLeafId 指向根节点，行为与现在一致                             |
| 只有 1 个 greeting       | 插入单个节点，不显示切换指示器                                                 |
| 切换开局后发送消息       | 消息挂在当前开局节点下，所有开局同时固化。其他开局分支仍可切换查看             |
| 删除开局节点             | 允许（与普通消息删除一致），但需确认是否影响子节点                             |
| 编辑开局节点（未固化）   | 允许，但下次 Agent 同步时可能被覆盖                                            |
| 编辑开局节点（已固化）   | 允许，与编辑普通消息一致                                                       |
| 开局内容包含宏           | 创建会话时展开；Agent 同步时重新展开                                           |
| Agent greetings 数量变化 | 未固化时重建所有开局节点；已固化时不影响                                       |
| 撤销/重做                | 开局插入不记入撤销栈（属于会话初始化）；固化操作也不记入（随发送消息自动触发） |
| 导出会话                 | 开局节点作为普通消息导出（已固化的快照）                                       |
| 跨窗口同步               | 开局节点是真实节点，自然随会话数据同步                                         |
| 多个开局分支都发送了消息 | 理论上不会发生（第一次发送时所有开局同时固化），但即使发生也不影响功能         |
