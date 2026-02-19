# Phase 2 施工计划：VCP 分布式节点（AIO → VCP 方向）

> **关联文档**:
>
> - [RFC: VCP 分布式协作 + AIO Function Calling 架构](./vcp-tool-integration-RFC.md)
> - [AIO Tool Calling System Design (Phase 1)](./aio-tool-calling-system-design.md)

---

## 📋 概述

**目标**：将 AIO 升级为 VCP 分布式节点，使其本地能力（工具）可被 VCP 主服务器远程调用。

**范围**：

- 升级现有 `vcp-connector` 工具，支持 `/vcp-distributed-server/` 端点。
- 实现双向 WebSocket 协议，处理 `register_tools`、`execute_tool`、`tool_result` 等消息。
- 将 AIO 本地工具（已标记 `distributedExposed: true`）转换为 VCP 格式并注册到 VCP 主服务器。
- 提供 UI 面板用于管理分布式节点状态、暴露工具列表。

**非目标**：

- 实现 VCP 远程工具消费（Phase 3）。
- 修改 VCP 主服务器协议（除非必要的小幅调整）。

---

## 🛠️ VCP 协议硬约束 (Protocol Specs)

为了确保 AIO 节点与 VCP 主服务器完美对齐，施工时**必须**严格遵守以下协议定义：

### 1. 连接与认证

- **端点路径**: `/vcp-distributed-server/VCP_Key=<key>`
- **认证方式**: 密钥通过 URL 路径传递，主服务器验证不通过将直接断开连接。
- **节点 ID**: 连接成功后，主服务器会分配 `dist-<clientId>` 格式的 ID。

### 2. 消息结构 (JSON)

#### AIO → VCP: 工具注册 (`register_tools`)

```json
{
  "type": "register_tools",
  "data": {
    "tools": [
      {
        "name": "string", // 对应 AIO 的 toolId:methodName
        "description": "string", // Prompt 描述
        "parameters": "object" // 参数 Schema
      }
    ]
  }
}
```

#### AIO → VCP: IP 上报 (`report_ip`)

_用于文件溯源，连接后应立即发送一次，后续定期发送。_

```json
{
  "type": "report_ip",
  "data": {
    "localIPs": ["string"],
    "publicIP": "string",
    "serverName": "string" // 用户配置的节点友好名称
  }
}
```

#### VCP → AIO: 执行请求 (`execute_tool`)

```json
{
  "type": "execute_tool",
  "data": {
    "requestId": "string",
    "toolName": "string",
    "toolArgs": "object"
  }
}
```

#### AIO → VCP: 执行结果 (`tool_result`)

```json
{
  "type": "tool_result",
  "data": {
    "requestId": "string",
    "status": "success" | "error",
    "result": "any",  // 成功时返回的数据
    "error": "string" // 失败时的错误消息
  }
}
```

### 3. 特殊工具：`internal_request_file`

VCP 分布式架构要求节点**必须**支持此内置工具，以实现跨节点文件传输。

- **输入**: `{ "fileUrl": "file:///..." }`
- **输出**: `{ "fileData": "Base64String", "mimeType": "string" }`

---

## 🧩 核心组件与依赖

### 2.1 依赖 Phase 1 的基础设施

- ✅ `ToolRegistryManager` 已扩展，支持 `distributedExposed` 字段。
- ✅ `MethodMetadata` 已包含 `agentCallable` 和 `distributedExposed`。
- ✅ `ToolDiscoveryService` 已实现工具发现与过滤。
- ✅ `VcpToolCallingProtocol` 已实现 VCP 格式的生成与解析。

### 2.2 新增/修改模块

| 模块                       | 路径                                                           | 说明                                           |
| :------------------------- | :------------------------------------------------------------- | :--------------------------------------------- |
| **VCP 分布式节点客户端**   | `src/tools/vcp-connector/services/vcpNodeProtocol.ts`          | 实现分布式节点协议（发送注册、接收执行）。     |
| **分布式节点 Store**       | `src/tools/vcp-connector/stores/vcpDistributedStore.ts`        | 管理节点连接状态、暴露工具列表、节点配置。     |
| **分布式节点 Composables** | `src/tools/vcp-connector/composables/useVcpDistributedNode.ts` | 封装节点生命周期、自动重连、工具注册逻辑。     |
| **WebSocket 升级**         | `src/tools/vcp-connector/composables/useVcpWebSocket.ts`       | 扩展以支持分布式节点端点，保持观察者模式兼容。 |
| **UI 面板**                | `src/tools/vcp-connector/components/distributed/`              | 节点状态、暴露工具列表、远程工具列表（预留）。 |
| **类型定义**               | `src/tools/vcp-connector/types/distributed.ts`                 | 分布式节点相关类型。                           |

---

## 📝 详细任务分解

### 任务 1：类型与 Store 扩展

- [ ] **扩展 `VcpConnectionMode`**（`src/tools/vcp-connector/types/protocol.ts`）：
  - 增加 `"distributed" | "both"` 枚举值。
- [ ] **新增 `VcpDistributedConfig`**（`src/tools/vcp-connector/types/distributed.ts`）：
  - 包含 `mode`、`serverName`、`exposedToolIds`、`autoRegisterTools` 等字段。
- [ ] **创建 `vcpDistributedStore`**（`src/tools/vcp-connector/stores/vcpDistributedStore.ts`）：
  - 管理当前节点 ID、连接状态、暴露工具列表、最近一次心跳时间。
  - 提供 `registerToolToVcp(toolId, methodName)` 等方法。

### 任务 2：WebSocket 连接升级

- [ ] **扩展 `useVcpWebSocket`**（`src/tools/vcp-connector/composables/useVcpWebSocket.ts`）：
  - 支持根据 `mode` 同时连接观察者端点 (`/vcpinfo`) 和分布式节点端点 (`/vcp-distributed-server/`)。
  - 保持现有观察者模式的消息处理不变。
- [ ] **实现分布式节点消息路由**：
  - 在 `onMessage` 中根据消息类型 (`register_tools_ack`, `execute_tool`, `update_static_placeholders`) 路由到 `vcpNodeProtocol` 处理。

### 任务 3：分布式节点协议实现

- [ ] **创建 `vcpNodeProtocol.ts`**（`src/tools/vcp-connector/services/vcpNodeProtocol.ts`）：
  - 实现 `sendRegisterTools(tools: VcpToolManifest[])`。
  - 实现 `sendReportIp(localIPs: string[], publicIP: string)`。
  - 实现 `sendUpdateStaticPlaceholders(placeholders: Record<string, string>)`。
  - 实现 `handleExecuteTool(requestId, toolName, toolArgs)`：
    - 校验 `distributedExposed` 权限。
    - 调用 `toolRegistryManager.execute(toolName, toolArgs)`。
    - 发送 `tool_result` 回传。
- [ ] **工具注册逻辑**：
  - 在连接建立后，自动收集所有 `distributedExposed: true` 的方法，转换为 `VcpToolManifest` 并发送 `register_tools`。
  - 支持 `exposedToolIds` 配置，仅注册指定工具。

### 任务 4：节点生命周期管理

- [ ] **创建 `useVcpDistributedNode`**（`src/tools/vcp-connector/composables/useVcpDistributedNode.ts`）：
  - 封装节点连接、注册、心跳、断线重连逻辑。
  - 监听 `toolRegistryManager` 的工具变更事件，动态更新注册信息（增量注册）。
- [ ] **心跳与健康检查**：
  - 定期发送 `report_ip` 或空心跳维持连接。
  - 断线后按指数退避重连。

### 任务 5：UI 面板开发

- [ ] **创建 `NodeStatusPanel.vue`**（`src/tools/vcp-connector/components/distributed/NodeStatusPanel.vue`）：
  - 显示节点 ID、连接状态、VCP 服务器地址、上行/下行流量统计。
  - 提供“断开连接”、“重新注册工具”等操作按钮。
- [ ] **创建 `ExposedToolsList.vue`**：
  - 列表展示已暴露给 VCP 的工具方法（ID、名称、描述、调用次数）。
  - 支持临时禁用某个工具的暴露（从 `exposedToolIds` 中移除）。
- [ ] **集成到主界面**：
  - 在 `VcpConnector.vue` 中增加“分布式节点”标签页，容纳上述面板。

### 任务 6：与 Phase 1 的集成点

- [ ] **`distributedExposed` 字段同步**：
  - 确保 `ToolRegistryManager` 在收集工具元数据时包含此字段。
  - 在 `ToolDiscoveryService` 中提供按 `distributedExposed` 过滤的方法，供节点注册使用。
- [ ] **协议格式对齐**：
  - `VcpToolCallingProtocol` 生成的工具定义需与 VCP 主服务器期望的 `VcpToolManifest` 格式兼容。
  - 可能需要调整字段映射（如 `commandIdentifier` → `tool_name`）。

### 任务 7：测试与验证

- [ ] **单元测试**：
  - `vcpNodeProtocol` 的消息序列化/反序列化。
  - 权限校验逻辑（`distributedExposed`）。
- [ ] **集成测试**：
  - 启动本地 VCP 测试服务器，验证 AIO 能成功注册工具并响应 `execute_tool`。
  - 模拟网络中断、重连场景。
- [ ] **UI 测试**：
  - 节点状态面板能正确反映连接状态变化。
  - 暴露工具列表能随配置动态更新。

---

## 🔗 数据流示例

### 2.1 节点注册流程

```
AIO 启动分布式节点模式
    ↓
连接至 VCP 主服务器 (WebSocket /vcp-distributed-server/)
    ↓
发送 register_tools [
    { tool_name: "directory_tree_generate", description: "...", parameters: [...] },
    { tool_name: "ocr_extract_text", ... }
]
    ↓
VCP 回复 register_tools_ack { status: "ok" }
    ↓
定期发送 report_ip { localIPs: ["192.168.1.100"], publicIP: "1.2.3.4" }
```

### 2.2 远程工具调用流程

```
VCP 用户请求工具 directory_tree_generate
    ↓
VCP 主服务器 → AIO (execute_tool {
    requestId: "req_123",
    toolName: "directory_tree_generate",
    toolArgs: { path: "D:\\work", maxDepth: 2 }
})
    ↓
AIO vcpNodeProtocol.handleExecuteTool
    ↓
校验 distributedExposed === true
    ↓
调用 toolRegistryManager.execute("directory_tree_generate", args)
    ↓
执行完成 → 发送 tool_result {
    requestId: "req_123",
    status: "success",
    result: { structure: [...], stats: {...} }
}
    ↓
VCP 主服务器接收结果，继续对话
```

---

## ⚠️ 风险与缓解

| 风险                              | 影响                                    | 缓解措施                                                      |
| :-------------------------------- | :-------------------------------------- | :------------------------------------------------------------ |
| **VCP 协议版本不兼容**            | AIO 注册的工具格式不被 VCP 主服务器识别 | 在开发阶段与 VCP 侧对齐协议字段；提供协议版本协商机制。       |
| **工具执行超时**                  | 远程调用悬挂，VCP 侧等待超时            | 设置合理的执行超时（如 30s），超时后返回 `tool_result` 错误。 |
| **网络抖动导致重复注册**          | VCP 侧工具列表重复                      | 注册时携带节点 ID 和工具指纹，VCP 侧去重。                    |
| **distributedExposed 默认值不当** | 意外暴露敏感工具                        | 默认值为 `false`；在 UI 中明确提示用户哪些工具将被暴露。      |

---

## 📅 实施顺序建议

1. **类型与 Store**（任务 1）→ 为后续开发提供类型支持。
2. **协议核心**（任务 3）→ 实现 `vcpNodeProtocol`，确保消息格式正确。
3. **WebSocket 升级**（任务 2）→ 建立双向连接，测试基础通信。
4. **节点生命周期**（任务 4）→ 实现自动注册、心跳、重连。
5. **UI 面板**（任务 5）→ 提供可视化管理和监控。
6. **集成与测试**（任务 6、7）→ 确保与 Phase 1 协同工作，完成端到端验证。

---

## 🧪 验收标准

- [ ] AIO 能以分布式节点模式连接到 VCP 主服务器（WebSocket 连接成功）。
- [ ] AIO 能自动将本地 `distributedExposed: true` 的工具注册到 VCP。
- [ ] VCP 主服务器能向 AIO 下发 `execute_tool`，AIO 能正确执行并返回 `tool_result`。
- [ ] 节点状态 UI 能实时反映连接状态、暴露工具数量。
- [ ] 网络中断后，AIO 能自动重连并重新注册工具。

---

## 📚 相关文件清单

| 文件路径                                                       | 变更类型 | 说明                                             |
| :------------------------------------------------------------- | :------- | :----------------------------------------------- |
| `src/tools/vcp-connector/types/protocol.ts`                    | 修改     | 扩展 `VcpConnectionMode`。                       |
| `src/tools/vcp-connector/types/distributed.ts`                 | 新增     | 定义分布式节点配置、状态类型。                   |
| `src/tools/vcp-connector/stores/vcpDistributedStore.ts`        | 新增     | 分布式节点状态管理。                             |
| `src/tools/vcp-connector/services/vcpNodeProtocol.ts`          | 新增     | 协议实现。                                       |
| `src/tools/vcp-connector/composables/useVcpDistributedNode.ts` | 新增     | 节点生命周期管理。                               |
| `src/tools/vcp-connector/composables/useVcpWebSocket.ts`       | 修改     | 支持双端点连接。                                 |
| `src/tools/vcp-connector/components/distributed/`              | 新增     | UI 面板组件。                                    |
| `src/tools/vcp-connector/VcpConnector.vue`                     | 修改     | 增加分布式节点标签页。                           |
| `src/services/types.ts`                                        | 修改     | 确保 `distributedExposed` 字段已存在。           |
| `src/services/registry.ts`                                     | 修改     | 在 `getMetadata()` 中返回 `distributedExposed`。 |

---

**完成 Phase 2 后，AIO 将具备作为 VCP 分布式节点的能力，为 Phase 3（VCP 远程工具消费）和 VCP 渠道感知（执行权转移）奠定基础。**
