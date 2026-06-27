# 工具方法测试覆盖指南 (Tool Testing Guide)

本指南旨在指导开发者如何为 AIO Hub 中的各个工具模块（Tools）编写高质量、不依赖 UI 运行时的自动化单元测试。

---

## 1. 为什么要做工具方法测试？

在 AIO Hub 中，工具（Tool）不仅是前端 UI 的一个页面，更是 **LLM 智能体（Agent）可以主动调用的能力单元**。
如果工具的 `agentCallable` 方法在重构中被破坏，或者参数解析出现偏差，将直接导致 Agent 运行崩溃。

得益于系统核心基础设施的**环境自适应与优雅解耦**，我们现在可以：

- **脱离 Tauri 运行时**：在纯 Node/Bun 脚本环境下运行测试，无需启动完整的桌面客户端。
- **脱离 Pinia/Vue 状态**：无需激活 Vue 运行时或 Pinia Store 即可验证核心业务逻辑。
- **100% 自动化回归**：通过 Vitest 框架一键运行，确保重构安全。

---

## 2. 核心解耦原理

在编写测试前，了解系统是如何在测试环境下“优雅降级”的，有助于你更好地编写 Mock。

### 2.1. `ConfigManager` 内存降级机制

如果你的工具使用了 `createConfigManager` 来持久化配置，在测试环境下（非 Tauri 运行时），它会**自动检测并降级为内存存储模式（In-Memory Storage）**：

- 所有的 `load()`、`save()`、`update()` 操作都直接读写内存中的 `Map`。
- **开发者无需为配置读写编写任何 Mock 代码**，它在测试中表现得就像一个真实的文件系统。

### 2.2. `useToolsStore` 安全降级

工具发现服务在获取工具的 `icon` 和 `version` 等 UI 元数据时，对 `useToolsStore()` 进行了 `try-catch` 包装。在非 Pinia 激活的测试环境下，它会自动返回 `null` 并安全降级，不影响核心的方法调用与参数解析。

---

## 3. 测试目录与命名规范

每个工具的测试代码必须存放在其工具目录下的 `__tests__/` 目录中：

```
src/tools/{toolId}/
├── __tests__/
│   └── {toolId}.test.ts      # 核心测试用例文件
├── {toolId}.registry.ts      # 工具注册文件
└── ...
```

---

## 4. 实战：如何为你的工具编写测试？

为工具编写测试主要有两种思路：**直接测试实例方法**（推荐，最简单）和**通过 Tool Calling 框架集成测试**。

### 4.1. 场景 A：直接测试工具实例方法（推荐）

这是最直接、最高效的测试方式。你只需要直接 `new` 出你的工具类实例，传入参数并断言返回值。

```typescript
import { describe, it, expect } from "vitest";
import { MyDirectoryTool } from "../my-directory-tool";

describe("MyDirectoryTool 基础方法测试", () => {
  it("should list files correctly", async () => {
    const tool = new MyDirectoryTool();

    // 直接调用工具方法
    const result = await tool.listFiles({ path: "src/utils" });

    expect(result).toContain("configManager.ts");
  });
});
```

### 4.2. 场景 B：通过 Tool Calling 框架集成测试

如果你的工具包含复杂的**参数类型适配**、**安全策略（`checkSecurityPolicy`）**或**异步任务上报**，建议将其注册到 `toolRegistryManager` 中，模拟真实的 Agent 调用流。

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { toolRegistryManager } from "@/services/registry";
import { executeToolRequests } from "@/tools/tool-calling/core/executor";
import { MySecurityTool } from "../my-security-tool";

describe("MySecurityTool 安全策略集成测试", () => {
  beforeAll(async () => {
    // 注册工具到全局管理器
    await toolRegistryManager.register(new MySecurityTool());
  });

  afterAll(async () => {
    await toolRegistryManager.dispose();
  });

  it("危险写入操作应该触发审批拦截", async () => {
    // 模拟 ParsedToolRequest
    const requests = [
      {
        requestId: "req-1",
        toolName: "my-security-tool",
        command: "dangerousWrite",
        rawBlock: "",
        args: { path: "/etc/hosts", content: "127.0.0.1 localhost" },
      },
    ];

    const results = await executeToolRequests(requests, {
      config: {
        enabled: true,
        mode: "manual", // 手动审批模式
        autoApproveTools: {},
        // ... 其他默认配置
      },
      // 模拟用户在 UI 上点击了“拒绝”
      onBeforeExecute: async () => "rejected" as const,
    });

    expect(results[0].status).toBe("denied");
  });
});
```

---

## 5. 依赖 Mock 最佳实践

在纯脚本测试环境下，Tauri 的原生 API（如 `invoke`、`dialog`、`fs`）是不可用的。如果你的工具方法内部调用了这些 API，你必须在测试文件顶部进行 Mock。

### 5.1. Mock 常见的 Tauri 插件

项目在 `src/test/setup.ts` 中已经全局 Mock 了大部分常用的 Tauri 插件。如果你的工具使用了特殊的插件，可以像下面这样局部 Mock：

```typescript
import { vi, describe, it, expect } from "vitest";

// Mock 剪贴板插件
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({
  writeText: vi.fn().mockResolvedValue(undefined),
  readText: vi.fn().mockResolvedValue("mocked clipboard content"),
}));

// Mock 自定义 Tauri Command
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockImplementation((cmd, args) => {
    if (cmd === "my_custom_rust_command") {
      return "rust_result";
    }
    return null;
  }),
}));
```

### 5.2. 测试异步任务与进度上报

如果你的工具方法是一个耗时的异步任务，并且需要向 UI 上报进度，你可以通过 Mock `ToolContext` 来验证进度上报逻辑：

```typescript
import { describe, it, expect, vi } from "vitest";
import { MyAsyncTool } from "../my-async-tool";

describe("MyAsyncTool 进度上报测试", () => {
  it("应该在执行过程中正确上报进度", async () => {
    const tool = new MyAsyncTool();
    const reportStatusSpy = vi.fn();

    // 构造 Mock 上下文
    const mockContext = {
      reportStatus: reportStatusSpy,
    };

    await tool.longTask({ duration: 1 }, mockContext);

    // 断言进度上报是否被按顺序调用
    expect(reportStatusSpy).toHaveBeenCalledWith("任务开始执行", 0);
    expect(reportStatusSpy).toHaveBeenCalledWith("任务执行完成", 100);
  });
});
```

---

## 6. 完整测试模板

以下是一个开箱即用的测试文件模板，你可以直接复制到你的工具目录中修改使用：

```typescript
/**
 * {YourToolName} 单元测试
 *
 * 运行方式：
 *   bun run test src/tools/{your-tool-id}
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { toolRegistryManager } from "@/services/registry";
import { MyTool } from "../index"; // 引入你的工具实现

// 1. Mock 必要的 Tauri 依赖
vi.mock("@tauri-apps/plugin-fs", () => ({
  exists: vi.fn().mockResolvedValue(true),
  readTextFile: vi.fn().mockResolvedValue("file content"),
}));

describe("MyTool 单元测试", () => {
  let toolInstance: MyTool;

  beforeAll(async () => {
    toolInstance = new MyTool();
    // 如果需要集成测试，可以注册到管理器中
    await toolRegistryManager.register(toolInstance);
  });

  afterAll(async () => {
    await toolRegistryManager.dispose();
  });

  // 测试用例 1：基础功能
  it("应该正确处理基础输入", async () => {
    const result = await toolInstance.someMethod({ input: "hello" });
    expect(result).toBe("processed: hello");
  });

  // 测试用例 2：边界条件与容错
  it("输入为空时应该优雅报错或返回默认值", async () => {
    await expect(toolInstance.someMethod({ input: "" })).rejects.toThrow(
      "输入不能为空"
    );
  });

  // 测试用例 3：安全策略（如果实现了 checkSecurityPolicy）
  it("应该具备正确的安全策略声明", () => {
    if (typeof toolInstance.checkSecurityPolicy === "function") {
      const policy = toolInstance.checkSecurityPolicy("someMethod", {});
      expect(policy.status).toBe("allow");
    }
  });
});
```

---

## 7. 运行测试

在终端中执行以下命令，即可一键运行你编写的测试：

```bash
# 运行指定工具的测试
bun run test src/tools/{your-tool-id}

# 运行全量测试，确保没有破坏其他模块
bun run test:run
```
