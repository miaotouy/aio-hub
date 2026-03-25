# VCP 异步任务对接 AIO 异步任务系统 - 执行计划

## 1. 背景

VCP (VCPToolBox) 已经实现了异步工具支持，能够通过 `vcp_tool_status` 实时广播进度，并通过 `plugin_async_callback` (映射为 `vcp_tool_result`) 返回最终结果。
AIO (All-in-one-tools) 拥有一套成熟的异步任务系统 (`TaskManager`)。
本计划旨在打通两者，使 VCP 的异步工具执行过程能在 AIO 的任务监控界面（如 `AsyncTaskMonitor`）中实时展现。

## 2. 核心逻辑流

1.  **发起请求**: AIO 调用 `VcpToolProxy` 执行工具。
2.  **识别异步**: VCP 返回结果中包含 `taskId` (VCP 侧的任务 ID)。
3.  **创建镜像任务**: `VcpBridgeFactory` 或 `VcpToolProxy` 捕获到 `taskId` 后，在 AIO 的 `TaskManager` 中创建一个状态为 `running` 的任务。
4.  **进度同步**:
    - VCP 发送 `vcp_tool_status` 消息。
    - AIO `VcpNodeProtocol` 接收并转发给 `TaskManager`。
    - `TaskManager` 更新对应任务的进度和日志。
5.  **结果同步**:
    - VCP 发送 `vcp_tool_result` (最终结果)。
    - AIO 标记任务为 `completed`。

## 3. 详细修改步骤

### 3.1. 协议与类型定义

- **文件**: `src/tools/vcp-connector/types/distributed.ts`
- **动作**:
  - 增加 `VcpToolStatusData` 接口。
  - 在 `VcpDistributedMessage` 中增加 `vcp_tool_status` 类型。

### 3.2. 消息分发层

- **文件**: `src/tools/vcp-connector/stores/vcpConnectorStore.ts`
- **动作**:
  - 在 `handleDistributedMessage` 中增加对 `vcp_tool_status` 的路由，调用 `nodeProtocol.handleVcpToolStatus`。

### 3.3. 协议处理层 (核心)

- **文件**: `src/tools/vcp-connector/services/vcpNodeProtocol.ts`
- **动作**:
  - 实现 `handleVcpToolStatus(data: any)`。
  - 逻辑：通过 `vcpBridgeFactory.handleToolStatus(data)` 进行中转。

### 3.4. 桥接工厂与任务关联

- **文件**: `src/tools/vcp-connector/services/VcpBridgeFactory.ts`
- **动作**:
  - 维护 `vcpTaskId` -> `aioTaskId` 的双向映射。
  - 在 `handleToolResult` 中：
    - 如果结果包含 `taskId` 且任务尚未在 AIO 侧登记，则调用 `taskManager.submitExternalTask` (需新增) 或手动创建任务元数据。
  - 实现 `handleToolStatus`：
    - 根据 `vcpTaskId` 找到 AIO 任务。
    - 调用 `taskManager.updateProgress` 或 `updateTask`。

### 3.5. 任务管理器增强

- **文件**: `src/tools/tool-calling/core/async-task/task-manager.ts`
- **动作**:
  - 暴露 `createExternalTask` 或类似的公共方法，允许外部系统（如 VCP）注入一个已经开始运行的任务。
  - 暴露 `updateTask` 的公共包装方法（目前 `updateTask` 是私有的）。

## 4. 验证方案

1. 启动 VCP 并开启 `VCPToolBridge` 插件。
2. 在 AIO 中连接 VCP 节点。
3. 在 `ToolCallingTester` 中调用一个已知的异步 VCP 工具（如 `VSearch`）。
4. 观察 `AsyncTaskMonitor` 是否出现新任务，且进度条是否随 VCP 日志实时更新。
5. 验证任务完成后，结果是否正确返回给调用者。
