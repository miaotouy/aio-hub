# VCP Connector 扩展指南

本文档为开发者提供如何扩展 `vcp-connector` 模块的指南，包括添加消息类型、内置工具、协议消息以及暴露本地工具。

## 1. 添加新的消息类型

如果你需要让 AIO Hub 监控并展示 VCP 服务器广播的新类型消息，请按照以下步骤操作：

1. **定义协议类型**：
   在 [`types/protocol.ts`](../types/protocol.ts) 中添加新的 `VcpMessageType` 值和对应的消息接口。

   ```typescript
   export type VcpMessageType =
     | "RAG_RETRIEVAL_DETAILS"
     | "META_THINKING_CHAIN"
     // ...
     | "MY_NEW_MESSAGE_TYPE"; // 🌟 新增类型
   ```

2. **注册联合类型**：
   将新类型加入 `VcpMessage` 联合类型中。

3. **注册解析校验**：
   在 [`vcpConnectorStore.ts`](../stores/vcpConnectorStore.ts) 的 `parseMessage()` 方法中的 `validTypes` 数组中注册新类型。

4. **添加计数统计**：
   在 [`vcpConnectorStore.ts`](../stores/vcpConnectorStore.ts) 的 `stats` 初始状态和 `addMessage()` 方法中添加对应的计数逻辑。

5. **配置关键词搜索**：
   在 [`vcpConnectorStore.ts`](../stores/vcpConnectorStore.ts) 的 `filteredMessages` 计算属性中，为新消息类型添加字段匹配规则。

6. **更新过滤面板 UI**：
   在 [`FilterPanel.vue`](../components/monitor/FilterPanel.vue) 的 `typeOptions` 中添加过滤选项，并在统计网格中添加计数显示。

7. **创建内容渲染组件**：
   在 `components/monitor/` 目录下创建新的 `MyNewCardContent.vue` 组件，用于渲染该消息类型的具体细节。

8. **注册卡片路由**：
   在 [`BroadcastCard.vue`](../components/monitor/BroadcastCard.vue) 中导入新组件，并在模板中添加对应的路由分支和 Lucide 图标。

---

## 2. 添加新的内置工具

内置工具是 VCP 协议强制要求的、节点必须暴露的工具（如 `internal_request_file`）。

1. **定义工具清单**：
   在 [`useVcpDistributedNode.ts`](../composables/useVcpDistributedNode.ts) 的 `BUILTIN_VCP_TOOLS` 数组中添加新工具的 `VcpToolManifest` 定义。

2. **实现执行逻辑**：
   在 [`vcpNodeProtocol.ts`](../services/vcpNodeProtocol.ts) 的 `handleExecuteTool()` 方法中添加特殊处理分支，拦截并执行该内置工具。

---

## 3. 添加新的分布式协议消息

分布式协议消息用于 AIO 节点与 VCP 主服务器之间的双向通信。

1. **定义消息类型**：
   在 [`types/distributed.ts`](../types/distributed.ts) 的 `VcpDistributedMessage` 联合类型中添加新类型。

2. **实现发送/处理方法**：
   在 [`vcpNodeProtocol.ts`](../services/vcpNodeProtocol.ts) 中添加对应的发送（出站）或处理（入站）方法。

3. **注册消息路由**：
   在 [`vcpConnectorStore.ts`](../stores/vcpConnectorStore.ts) 的 `handleDistributedMessage()` 方法中添加消息路由分支，将接收到的消息分发给 `VcpNodeProtocol` 或 Store 处理。

---

## 4. 让本地工具方法可被 VCP 远程调用

如果你开发了一个新的 AIO 本地工具，并希望 VCP 网络中的 AI Agent 能够远程调用它：

1. **实现标准接口**：
   确保你的工具实现了 `ToolRegistry` 接口，并已通过 `toolRegistryManager` 注册。

2. **标记暴露属性**：
   在工具的 `getMetadata()` 返回的方法列表中，将目标方法标记为 `distributedExposed: true`（或者标记为 `agentCallable: true`，后者会被自动发现服务扫描到）。

   ```typescript
   // 示例：在工具的 registry 文件中
   getMetadata() {
     return {
       id: 'my-tool',
       methods: [
         {
           name: 'my_method',
           description: '这是一个可以被远程调用的方法',
           distributedExposed: true, // 🌟 关键标记
           parameters: {
             // JSON Schema 参数定义
           }
         }
       ]
     };
   }
   ```

3. **规范方法签名**：
   方法签名应为 `(args: Record<string, any>) => Promise<any>`。

4. **确保安全性与幂等性**：
   确保方法实现是幂等且安全的，因为远程调用通常在后台静默执行，无法进行实时的人工交互确认（除非触发了工具调用审批系统）。
