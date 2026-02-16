# AIO Tool Calling System Design (Phase 1)

> **状态**: Implementing
> **作者**: 咕咕
> **日期**: 2026-02-16
> **关联**: [vcp-tool-integration-RFC.md](./vcp-tool-integration-RFC.md)

## 1. 概述

本设计文档详细描述了 AIO 内部工具调用系统 (Tool Calling System) 的架构。该系统旨在为 LLM 提供一种通用的工具发现与执行机制。

**核心原则**：

- **协议无关性**: 系统不与特定协议（如 VCP）强绑定，通过插件化协议层支持多种解析/生成格式。
- **函数式核心**: 核心逻辑由无状态纯函数组成，易于测试和复用。
- **工具自治**: 系统作为一个独立的工具模块 (`src/tools/tool-calling/`) 存在，自带测试与监控能力。

## 2. 核心架构

系统采用 **“引擎 + 协议插件”** 的分层架构。

### 2.1 模块结构

```
src/tools/tool-calling/
├── tool-calling.registry.ts      # 工具注册
├── ToolCallingTester.vue         # 独立测试页 (自带 UI)
├── core/                         # 函数式核心 (无状态逻辑)
│   ├── engine.ts                 # 调度引擎: 协调协议与执行流
│   ├── discovery.ts              # 工具发现: 扫描元数据
│   ├── executor.ts               # 工具执行: 路由到 Registry
│   └── protocols/                # 协议实现层 (可扩展)
│       ├── base.ts               # 协议接口定义
│       └── vcp-protocol.ts       # VCP 协议的具体实现
├── composables/                  # Vue 粘合层
│   └── useToolCalling.ts         # 供 llm-chat 调用的 Hook
└── types/                        # 领域模型定义
```

## 3. 详细设计

### 3.1 元数据增强 (src/services/types.ts)

在现有的 `ToolRegistry` 基础上，通过显式扩展支持 Agent 工具调用。

**核心原则**：

- **显式授权**: 只有标记了 `agentCallable: true` 的方法才会暴露给 LLM。
- **扁平化门面 (Flat Facade)**: 强烈建议不要直接暴露复杂的内部业务方法。应在 Registry 类中编写专门的“门面方法”，将复杂的对象参数拆解为扁平的基础类型参数（string, number, boolean），以减少模型幻觉并提高解析成功率。

**推荐模式示例**：

```typescript
// Registry 类实现
export default class MyToolRegistry implements ToolRegistry {
  // 内部业务方法（参数复杂）
  private async internalComplexTask(options: { path: string; deep: boolean; filter: string[] }) { ... }

  /**
   * [Agent Facade] 扁平化门面方法
   * 专门供 Agent 调用，参数简单明了
   */
  public async agent_doTask(path: string, deep: boolean = true) {
    return await this.internalComplexTask({ path, deep, filter: [] });
  }

  public getMetadata() {
    return {
      methods: [{
        name: 'agent_doTask',
        agentCallable: true, // 标记为 Agent 可用
        parameters: [
          { name: 'path', type: 'string', description: '目标路径' },
          { name: 'deep', type: 'boolean', description: '是否递归', defaultValue: true }
        ],
        // ...
      }]
    };
  }
}
```

```typescript
// 扩展 MethodMetadata
export interface MethodMetadata {
  // ... 现有字段 ...
  /**
   * 是否允许 Agent (LLM) 直接调用。
   * 开启此项后，该方法将出现在 {{tools}} 宏生成的 Prompt 中。
   */
  agentCallable?: boolean;

  /** 协议特定配置 */
  protocolConfig?: {
    /** VCP 格式的调用指令（可选，如果未提供，则根据参数自动生成） */
    vcpCommand?: string;
    /** 其他协议配置... */
  };
}
```

### 3.2 ToolDiscoveryService (命令自动生成器)

负责聚合所有可用工具并基于现有的 `ServiceMetadata` 自动生成注入 System Prompt 的文本。

- **输入**: `ToolCallConfig` (来自 Agent 配置)。
- **核心逻辑**:
  1.  **扫描**: 从 `toolRegistryManager` 获取所有工具。
  2.  **过滤**:
      - 首先检查 `method.agentCallable === true`。
      - 其次根据 `toolToggles` 和 `defaultToolEnabled` 过滤可用工具。
  3.  **提取**: 调用 `tool.getMetadata()` 获取结构化元数据。
  4.  **转换与校验**:
      - 自动将 `MethodMetadata` 转换为协议特定格式（如 VCP）。
      - **降级处理**: 如果检测到复杂的嵌套参数（`properties` 深度 > 1），生成器应在生成的 Prompt 中添加明确的格式说明，或在开发环境下发出警告，建议开发者提供扁平化的包装方法。

**VCP 文本块自动生成示例**:

```text
<<<[TOOL_DEFINITION]>>>
tool_name: 「始」directory_tree_generate「末」
description: 「始」生成指定目录的树状结构图「末」
parameters: 「始」
  - path (string, 必填): 绝对路径。
  - maxDepth (number): 最大深度，默认 3。
  - showFiles (boolean): 是否显示文件。
「末」
example: 「始」
<<<[TOOL_REQUEST]>>>
tool_name: 「始」directory_tree_generate「末」
path: 「始」E:/projects「末」
maxDepth: 「始」2「末」
<<<[END_TOOL_REQUEST]>>>
「末」
```

### 3.3 useToolCallExecutor

处理 LLM 的流式输出或最终回复。

- **解析器**: 监听文本流，识别 `<<<[TOOL_REQUEST]>>>` 块。
- **执行流**:
  1.  提取工具名和参数。
  2.  查找对应的 `ToolRegistry`。
  3.  执行方法（支持 `Promise`）。
  4.  捕获错误并格式化为 `ToolCallResult`。

### 3.4 宏集成与开关联动 ({{tools}})

在 `llm-chat` 宏引擎中注册 `{{tools}}`，它是 Agent 设置与 LLM 感知之间的桥梁。

#### 3.4.0 Agent 设置界面 (UI 联动)

为了让用户直观控制工具，`AgentEditor` 的“功能扩展”面板将新增 **工具调用配置区**：

- **动态工具列表**: 实时从 `ToolRegistryManager` 获取所有 `agentCallable` 工具。
- **三态开关控制**:
  - **总开关**: 一键启用/禁用该 Agent 的所有工具能力。
  - **个体开关**: 存储在 `toolToggles: Record<string, boolean>` 中。
  - **默认策略**: 设置新安装的插件工具是默认开启还是关闭。
- **实时预览**: 提供“查看生成的 Prompt”功能，方便姐姐调试工具描述是否符合预期。

#### 3.4.1 联动逻辑流程

1.  **总开关检查**: 如果 `agent.toolCallConfig.enabled` 为 `false`，宏直接返回空字符串。此时 LLM 不会收到任何工具定义，系统也不会尝试解析回复中的工具指令。
2.  **工具过滤**: 宏在执行时会遍历所有注册工具，并应用以下逻辑：
    - **显式配置优先**: 检查 `toolToggles[toolId]` 是否有值。如果有，则以该值为准。
    - **默认策略回退**: 如果 `toolToggles` 中没有该工具的记录，则使用 `defaultToolEnabled` 的值（即“新工具默认启用”或“新工具默认禁用”）。
3.  **Prompt 生成**: 仅将通过过滤且具有 `agentCallable` 标记的工具传递给 `ToolDiscoveryService` 进行文本转换。

#### 3.4.2 伪代码实现

```typescript
// src/tools/llm-chat/macro-engine/macros/tools.ts
execute: async (context) => {
  const config = context.agent?.toolCallConfig;

  // 1. 总开关关闭，彻底静默
  if (!config?.enabled) return "";

  // 2. 获取所有工具并根据 Agent 配置进行过滤
  const allTools = toolRegistryManager.getAllTools();
  const enabledTools = allTools.filter((tool) => {
    const toggle = config.toolToggles[tool.id];
    // 显式配置优先，否则回退到默认策略
    return toggle !== undefined ? toggle : config.defaultToolEnabled;
  });

  // 3. 仅对通过过滤的工具生成协议指令
  return toolDiscovery.generatePrompt(enabledTools, {
    protocol: config.protocol || "vcp", // 默认使用 VCP
  });
};
```

## 4. 工具调用测试页 (Tool Calling Tester)

为了确保系统的鲁棒性，将创建一个独立的工具模块用于测试。

### 4.1 功能点

- **工具模拟**: 展示当前所有已注册且可调用的工具。
- **Prompt 预览**: 实时查看 `{{tools}}` 宏生成的文本。
- **手动触发**: 输入 LLM 风格的文本（如 "请帮我执行 <<<[TOOL_REQUEST]>>>..."），点击解析并观察执行过程。
- **结果回显**: 展示工具执行的原始返回值和耗时。

### 4.2 路由与入口

- **ID**: `tool-calling-tester`
- **路径**: `src/tools/tool-calling-tester/`

## 5. 实施路线图

1.  **基础设施**: 定义 `src/services/tool-calling/` 下的基础类型和解析器。
2.  **发现服务**: 实现 `ToolDiscoveryService` 并集成到 `{{tools}}` 宏。
3.  **执行器**: 实现 `useToolCallExecutor`。
4.  **测试页**: 开发 `ToolCallingTester.vue`。
5.  **集成**: 修改 `llm-chat` 的 `ChatHandler`，在消息发送/接收流程中接入执行器。
