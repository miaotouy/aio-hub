# VCP 推送消息集成计划

> **关联文档**:
>
> - [VCP 工具集成 Phase 2](./vcp-tool-integration-phase2-implementation-plan.md)
> - [VCP 推送机制分析 (Kilo 整理)](./vcp-tool-integration-RFC.md) (注：需补充链接)
> - [协议定义](./vcp-tool-integration-RFC.md)

---

## 1. 背景与目标

**目标**：将 VCP 后端推送的异步任务消息（如 `task_id` 回调、知识库归档提示）接入 AIO 的通知系统，实现消息分级触达。

**现状**：
- `vcpConnectorStore.ts` 的 `parseMessage` 函数目前仅解析 5 种结构化消息（RAG、思维链等）。
- 后端推送的通用日志（如 `task_id: 12345`）会被直接过滤丢弃。
- 缺少与 AIO 全局通知系统（`useNotification`）的对接。

**预期效果**：
- VCP 推送的通用日志能在 VCP 监控页面中正常显示。
- 包含特定关键词（如 `task_id`、`归档`）的消息能自动触发 UI 通知。
- 重要消息进入持久化通知中心，普通消息仅做即时浮动提示。

---

## 2. VCP 推送消息分析

### 2.1 消息来源与路径

VCP 推送主要通过以下 WebSocket 通道：

| 通道 | 路径 | 用途 |
| :--- | :--- | :--- |
| **VCPLog** (推荐) | `/VCPlog/VCP_Key=...` | 通用日志、系统通知（我们主要用这个） |
| Observer | `/vcpinfo/VCP_Key=...` | RAG、思维链等结构化监控消息 |
| Distributed | `/vcp-distributed-server/VCP_Key=...` | 工具执行回调、节点通信 |

**核查修正**：根据 VCP 本家代码 (`modules/vcpLoop/toolExecutor.js`)，`vcp_log` 类型的消息主要通过 `webSocketServer.broadcast(..., 'VCPLog')` 定向发送给 `VCPLog` 通道。建议 AIO 连接时优先使用 `/VCPlog/` 路径。

### 2.2 目标消息类型

我们需要重点接入的是 **VCPLog 通道** 中的通用日志消息，通常具有以下结构：

```json
{
  "type": "vcp_log",
  "data": {
    "source": "DistPluginManager",
    "tool_name": "archive_knowledge_base",
    "content": "task_id: 67890 | 知识库归档成功",
    "status": "success" // VCP 本家常用字段：AIO 计划中遗漏了
  }
}
```

### 2.3 关键词提取规则

为了实现智能通知，我们需要从 `content` 和 `status` 中提取关键信息：

| 字段 | 关键词/正则 | 消息类型 | 通知策略 |
| :--- | :--- | :--- | :--- |
| `content` | `/(?:task_id\|任务)\s*[:：]?\s*(\d+)/i` | 异步任务启动 | 持久化通知 (Info) |
| `content` | `error` / `failed` | 任务失败 | 持久化通知 (Error) |
| `status` | `status === 'error'` | 后端报错 | 持久化通知 (Error) |
| `content` | `归档成功` / `完成` / `success` | 任务完成 | 即时浮动提示 (Success) |
| 其他 | - | 通用日志 | 仅存入历史记录 |

---

## 3. 详细实施方案

### 3.1 协议扩展

**文件**：`src/tools/vcp-connector/types/protocol.ts`

**变更**：
1. 在 `VcpMessageType` 中增加 `vcp_log`。
2. 新增 `VcpLogMessage` 接口。

```typescript
// src/tools/vcp-connector/types/protocol.ts

export type VcpMessageType = 
  | "RAG_RETRIEVAL_DETAILS"
  | "META_THINKING_CHAIN"
  | "AGENT_PRIVATE_CHAT_PREVIEW"
  | "AI_MEMO_RETRIEVAL"
  | "PLUGIN_STEP_STATUS"
  | "vcp_log" // 新增
  | "UNKNOWN";

export interface VcpLogMessage extends VcpBaseMessage {
  type: "vcp_log";
  data: {
    source?: string;
    tool_name?: string;
    content: string;
    status?: "success" | "error"; // VCP 本家常用字段
    level?: "info" | "warn" | "error"; // 可选，用于判断通知级别
  };
}
```

### 3.2 Store 逻辑升级

**文件**：`src/tools/vcp-connector/stores/vcpConnectorStore.ts`

**变更 1：放行 vcp_log 类型**

修改 `parseMessage` 函数，允许 `vcp_log` 通过过滤：

```typescript
// src/tools/vcp-connector/stores/vcpConnectorStore.ts

function parseMessage(rawData: unknown): VcpMessage | null {
  // ... 现有逻辑 ...

  const validTypes: VcpMessageType[] = [
    "RAG_RETRIEVAL_DETAILS",
    "META_THINKING_CHAIN",
    "AGENT_PRIVATE_CHAT_PREVIEW",
    "AI_MEMO_RETRIEVAL",
    "PLUGIN_STEP_STATUS",
    "vcp_log", // 新增
  ];

  if (!validTypes.includes(type as VcpMessageType)) return null;

  // ... 后续逻辑 ...
}
```

**变更 2：集成通知系统**

修改 `addMessage` 函数，引入通知分发器：

```typescript
// src/tools/vcp-connector/stores/vcpConnectorStore.ts

import { useNotification } from "@/composables/useNotification";
import customMessage from "@/utils/customMessage";

function addMessage(msg: VcpMessage) {
  if (filter.value.paused) return;

  messages.value.push(msg);
  // ... 现有统计逻辑 ...

  // ================== [新增] 通知分发逻辑 ==================
  if (msg.type === "vcp_log") {
    handleVcpLogNotification(msg as VcpLogMessage);
  }
  // ========================================================
}

// 新增：通知处理器
function handleVcpLogNotification(msg: VcpLogMessage) {
  const content = msg.data?.content || "";
  const toolName = msg.data?.tool_name;
  const status = msg.data?.status; // VCP 本家的 status 字段

  // 1. 提取任务 ID (兼容 "task_id: 123" 和 "任务 123")
  const taskIdMatch = content.match(/(?:task_id|任务)\s*[:：]?\s*(\d+)/i);
  const taskId = taskIdMatch ? taskIdMatch[1] : null;

  // 2. 智能路由
  const notify = useNotification();

  // 优先级 1：后端明确报错 (status === 'error')
  if (status === "error") {
    notify.error(
      "VCP 执行错误",
      `${toolName ? toolName + ': ' : ''}${content}`,
      { source: "VCP" }
    );
    return;
  }

  // 优先级 2：包含任务 ID
  if (taskId) {
    notify.info(
      `VCP 任务通知`,
      `任务已启动 (ID: ${taskId})${toolName ? ` - ${toolName}` : ""}`,
      { source: "VCP" }
    );
    return;
  }

  // 优先级 3：内容中包含错误关键字
  if (content.toLowerCase().includes("error") || content.toLowerCase().includes("failed")) {
    notify.error(
      "VCP 执行错误",
      content,
      { source: "VCP" }
    );
    return;
  }

  // 优先级 4：成功/完成类关键字 -> 即时浮动提示
  if (content.includes("归档") || content.includes("完成") || content.includes("成功")) {
    customMessage.success(content);
    return;
  }
}
```

### 3.3 UI 展示优化

**文件**：`src/tools/vcp-connector/components/monitor/MessageMonitorPage.vue`

虽然 `JsonViewer` 已经能通过 fallback 渲染任意 JSON，但为了更友好，可以考虑：
- 针对 `vcp_log` 类型的消息，优先展示 `content` 字段作为摘要，而不是直接展示整段 JSON。

---

## 4. 任务清单

- [ ] **协议扩展**：在 `protocol.ts` 中定义 `vcp_log` 类型。
- [ ] **Store 升级**：修改 `vcpConnectorStore.ts`：
  - [ ] 引入 `useNotification` 和 `customMessage`。
  - [ ] 修改 `parseMessage` 放行 `vcp_log`。
  - [ ] 实现 `handleVcpLogNotification` 通知分发器。
- [ ] **测试验证**：
  - [ ] 模拟发送 `vcp_log` 消息，验证 Store 是否正确解析。
  - [ ] 验证 `task_id` 提取逻辑。
  - [ ] 验证浮动提示与持久化通知的触发是否符合预期。

---

## 5. 相关文件变更

| 文件路径 | 变更类型 | 说明 |
| :--- | :--- | :--- |
| `src/tools/vcp-connector/types/protocol.ts` | 修改 | 增加 `vcp_log` 类型定义 |
| `src/tools/vcp-connector/stores/vcpConnectorStore.ts` | 修改 | 增加消息放行与通知分发逻辑 |
