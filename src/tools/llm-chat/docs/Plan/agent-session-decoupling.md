# Agent 与会话解耦实现方案

> **文档状态 (Status)**: `Draft`
> **版本 (Version)**: 1.0
> **日期 (Date)**: 2026-05-09
> **负责模块**: `llm-chat`

---

## 1. 背景与问题

### 1.1 核心痛点

目前 `llm-chat` 的底层逻辑将“智能体 (Agent)”与“会话 (Session)”进行了强绑定，导致了以下问题：

1. **冷启动障碍**：新用户进入工具后，必须先经历“创建智能体”的繁琐流程，否则无法开启任何对话。
2. **发送逻辑僵化**：发送消息的代码中强制检查 `currentAgentId`，若为空则拒绝发送，不支持“纯模型对话”场景。
3. **状态无法重置**：用户一旦在侧边栏或切换器中选定了某个智能体，就无法再回到“无智能体”的纯净模式，因为 UI 缺少“取消选择”的操作。
4. **UI 逻辑分裂**：头部 UI 存在硬编码判断，导致在某些状态下（如临时会话）即便选中了智能体也不显示，而消息列表却在渲染智能体的预设内容，造成用户困惑。

### 1.2 预期目标

1. **支持纯净模式**：会话创建和消息发送不再强制依赖智能体。
2. **虚拟智能体回退**：当未选择智能体时，系统在内存中实时构建一个“虚拟智能体”，提供基础能力（如工具调用支持），确保功能不失效。
3. **显式取消入口**：在智能体选择器中增加“取消选择（纯净模式）”选项，允许用户随时重置状态。

---

## 2. 技术方案

### 2.1 存储层：支持取消选择 (`agentStore.ts`)

修改 `selectAgent` 方法，允许传入 `null` 来显式清除当前的智能体绑定。

```typescript
// src/tools/llm-chat/stores/agentStore.ts

async selectAgent(agentId: string | null): Promise<void> {
  const { currentAgentId } = useLlmChatUiState();

  if (agentId === null) {
    currentAgentId.value = null;
    logger.info("已进入纯净模式（取消智能体选择）");
    return;
  }

  // 原有加载逻辑...
  currentAgentId.value = agentId;
}
```

### 2.2 逻辑层：发送逻辑解耦 (`useChatHandler.ts`)

提取 `getEffectiveAgentConfig` 函数。当没有选中的智能体时，不再抛出错误，而是根据以下优先级构建配置：

1. **会话级临时模型**（如果会话本身记录了当前想用的模型）。
2. **全局默认模型**（设置中心配置的模型）。
3. **兜底模型**（第一个可用的服务商模型）。

```typescript
// 虚拟 Agent 配置构建逻辑（伪代码）
const agentConfig = agentStore.currentAgentId
  ? agentStore.getAgentConfig(...)
  : buildVirtualAgentConfig(session, settings);
```

### 2.3 UI 层：增加重置入口 (`QuickAgentSwitch.vue`)

在智能体快速切换列表中，增加一个固定的“纯净模式”选项。

- **位置**：列表最上方或最下方。
- **交互**：点击后调用 `selectAgent(null)`。
- **视觉**：当 `currentAgentId` 为空时，此项呈现激活状态。

### 2.4 UI 层：头部状态一致性 (`ChatArea.vue`)

修正 `currentAgent` 计算属性，移除不合理的过滤逻辑。

- **逻辑**：只要 `agentStore.currentAgentId` 有值，头部就必须显示该智能体的信息。
- **纯净模式表现**：如果没有选中智能体，头部显示“纯净模式”图标（如 ZapOff）和当前使用的模型名称。

---

## 3. 执行计划

| 步骤 | 任务内容                                             | 涉及文件               |
| :--- | :--------------------------------------------------- | :--------------------- |
| 1    | 修改 Store 状态，支持 `currentAgentId` 为 `null`     | `agentStore.ts`        |
| 2    | 实现发送逻辑中的虚拟配置回退，移除强制 Agent 检查    | `useChatHandler.ts`    |
| 3    | 在 `QuickAgentSwitch.vue` 中添加“取消选择”按钮       | `QuickAgentSwitch.vue` |
| 4    | 修正 `ChatArea.vue` 头部显示逻辑，确保状态与底层同步 | `ChatArea.vue`         |
| 5    | 在智能体侧边栏右键菜单增加“取消选择”快捷操作         | `AgentsSidebar.vue`    |

---

## 4. 风险评估

- **工具调用兼容性**：需要确保在“纯净模式”下，基础工具（如文件读取）依然能通过虚拟配置正常工作。
- **预设消息缺失**：纯净模式没有 `presetMessages`，发送逻辑需确保在这种情况下不会因读取不到 System Prompt 而崩溃。
