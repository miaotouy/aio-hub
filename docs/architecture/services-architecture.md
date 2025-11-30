# 服务与插件系统架构

本文档详细介绍了 AIO Hub 的服务层架构，包括服务注册表、统一执行器和插件系统。

## 1. 设计理念

AIO Hub 的服务系统旨在解决**能力复用**和**外部调用**的问题，而不是强制性的内部架构约束。

- **面向 Agent 与外部调用**: 服务注册表 (`registry.ts`) 的主要目的是暴露能力给 Agent (通过 LLM 工具调用) 或其他插件。它充当了一个"半文档化"的接口定义。
- **非强制性内部使用**: 对于仅在 GUI 内部使用的工具（如 `api-tester`），或者仅在特定模块间共享的逻辑，**不需要**强制注册到服务层。直接导入组件或函数是更高效、类型更安全的方式。
- **统一的插件接口**: 无论是内置的核心服务，还是动态加载的第三方插件，都通过统一的 `ToolRegistry` 接口进行管理。

## 2. 核心组件

### 2.1 服务注册表 (`registry.ts`)

`ToolRegistryManager` 是一个单例管理器，负责维护所有已注册工具的生命周期。

- **职责**:
  - 存储工具实例。
  - 管理工具的初始化 (`initialize`) 和清理 (`dispose`)。
  - 提供查询和获取工具的 API。
- **使用场景**:
  - 当你需要遍历所有可用工具时（例如生成 Agent 可用的工具列表）。
  - 当你需要通过 ID 动态调用某个工具时。

### 2.2 统一执行器 (`executor.ts`)

`execute` 函数提供了一个标准化的调用入口，实现了关注点分离。

```typescript
export interface ToolCall<TParams = Record<string, any>> {
  service: string; // 服务 ID
  method: string;  // 方法名
  params: TParams; // 参数
}
```

- **工作流程**:
  1. 接收 `ToolCall` 请求。
  2. 在注册表中查找对应的服务实例。
  3. 验证方法是否存在。
  4. 执行方法并捕获异常。
  5. 返回标准化的 `ServiceResult`。

### 2.3 插件管理器 (`plugin-manager.ts`)

负责加载和管理扩展插件。支持三种类型的插件：

1.  **JavaScript 插件**:
    - 运行在渲染进程（前端）。
    - 适用于 UI 扩展、文本处理、简单的逻辑计算。
    - 支持热重载 (HMR)。
2.  **Native 插件 (Rust)**:
    - 通过 DLL/dylib/so 动态加载到主进程。
    - 适用于高性能计算、系统底层交互。
    - 通过 C-ABI 与主程序通信。
3.  **Sidecar 插件**:
    - 独立子进程（任意语言）。
    - 通过 stdio (JSON-RPC) 通信。
    - 适用于环境隔离或使用特定语言库的场景。

## 3. 最佳实践：注册 vs 直接导入

在开发新工具时，应根据以下标准判断是否需要注册服务：

### ✅ 需要注册的情况
- **Agent 能力**: 该工具提供的功能需要被 AI Agent 调用（例如"读取文件"、"执行 OCR"）。
- **跨插件调用**: 该工具的功能需要暴露给其他动态加载的插件使用。
- **通用能力**: 该工具提供了项目级的通用能力（如 `asset-manager`）。

### ❌ 无需注册的情况
- **纯 GUI 工具**: 如 `api-tester`，它只是一个可视化的 API 调试器，其核心逻辑（发送 HTTP 请求）是通用的，不需要作为服务暴露。
- **内部逻辑**: 仅在工具内部使用的辅助函数或类。
- **紧耦合组件**: 必须与特定 UI 状态绑定的逻辑。

### 💡 内部调用建议
对于项目内部的代码复用，**直接导入 (`import`)** 始终是首选：
- **类型安全**: 完整的 TypeScript 类型检查和自动补全。
- **性能**: 没有查找和反射开销。
- **可维护性**: 明确的依赖关系，方便重构和查找引用。

仅当需要**动态性**（如根据配置加载不同实现）或**解耦**（如插件系统）时，才使用服务注册表。

## 4. 示例

### 注册服务

```typescript
// my-tool/index.ts
import { toolRegistryManager } from "@/services/registry";

const myService = {
  id: "my-tool",
  // ... 实现接口
  async doSomething(params: { text: string }) {
    return params.text.toUpperCase();
  }
};

// 注册
toolRegistryManager.register(myService);
```

### 动态调用 (通过执行器)

```typescript
import { execute } from "@/services/executor";

const result = await execute({
  service: "my-tool",
  method: "doSomething",
  params: { text: "hello" }
});
```
