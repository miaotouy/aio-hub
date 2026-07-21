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

---

## 8. 真实 Tauri 窗口 E2E

Vitest 和前面的 Mock 测试用于验证业务逻辑、参数契约和组件行为；它们不启动原生 WebView，也不能证明 Tauri IPC、窗口生命周期、绝对路径拖放或系统文件选择器可用。需要真实窗口时，使用项目新增的 WebdriverIO Tauri E2E 工具：

- 配置文件：[`tests/tauri-e2e/wdio.conf.ts`](../../tests/tauri-e2e/wdio.conf.ts)
- Smoke 用例：[`tests/tauri-e2e/specs/smoke.spec.ts`](../../tests/tauri-e2e/specs/smoke.spec.ts)
- 运行说明：[`tests/tauri-e2e/README.md`](../../tests/tauri-e2e/README.md)
- 运行命令：`bun run test:tauri:e2e`

### 8.1. 工具组成

真实窗口 E2E 由以下部分组成：

1. `@wdio/tauri-service`：WebdriverIO 的 Tauri service，负责启动应用并通过 embedded WebDriver 驱动 WebView。
2. `tauri-plugin-wdio`：仅在 debug 构建注册，提供 Tauri 侧的执行、日志和测试辅助能力。
3. `tauri-plugin-wdio-webdriver`：仅在 debug 构建注册，在应用内启动 embedded WebDriver server。
4. `tests/tauri-e2e/`：集中放置 WDIO 配置、真实窗口用例和运行说明，不把 E2E 逻辑混入业务工具目录。
5. `tests/windows-ui-automation/`：基于 .NET 8、FlaUI 5 和 UIA3 的 Windows 原生 helper，只负责系统文件/目录对话框，并由 WDIO 场景调用。

`@wdio/tauri-service` 当前固定为 `1.1.x`。`1.2.0` 存在对 `@wdio/native-utils` 导出不匹配的问题，升级前需要先确认上游依赖修复。

### 8.2. 首次运行

先生成前端产物并编译 debug binary：

```powershell
bun run build:vite
cargo build --manifest-path src-tauri/Cargo.toml
```

然后使用隔离数据根运行 E2E。不要让验收读取默认 appData、用户模型配置或真实会话：

```powershell
$env:AIO_E2E_ID_SUFFIX = "tauri-e2e"
$env:AIO_E2E_DATA_DIR = ".dev-data\\tauri-e2e"
$env:AIO_E2E_ARTIFACT_DIR = ".dev-data\\tauri-e2e\\artifacts"
bun run test:tauri:e2e
```

当 binary 不在默认位置时，显式设置：

```powershell
$env:AIO_E2E_BINARY = "E:\\path\\to\\aiohub.exe"
bun run test:tauri:e2e
```

配置默认使用单 worker，并保存前后端日志和 WDIO 产物。只运行某个 spec 时可以追加 WDIO 参数：

```powershell
bun run test:tauri:e2e -- --spec tests/tauri-e2e/specs/smoke.spec.ts
```

Recall、外部 corpus、Ollama、私有 Profile 和 Windows 原生验收使用具名
preset，避免在公共脚本和文档中重复 spec、重启与 scenario 组合。可先查看
每个 preset 的前置条件、缺失时的 skip/fail 规则和是否包含二次启动：

```powershell
bun run test:tauri:e2e -- --list-presets
bun run test:tauri:e2e -- --preset recall-vector
```

选择 preset 后不能再混用 `--spec`、`--restart-spec`、
`--required-scenarios`、`--corpus-mode`、`--vector-mode`、`--llm-profile`
或 `--native`。底层参数只用于没有 preset 的定向故障排查。

`tests/tauri-e2e/**` 已从 Vitest 的默认发现范围排除，`bun run test:run`
不会加载 WDIO 用例；真实窗口用例只通过 `bun run test:tauri:e2e` 执行。
E2E runner 会在未显式设置时为本次进程生成隔离的数据根、产物目录和
WebDriver 端口，并向 Tauri 子进程写入最终 `AIO_ID_SUFFIX`/`AIO_DATA_DIR`。
对外参数使用 `AIO_E2E_ID_SUFFIX`/`AIO_E2E_DATA_DIR`，避免 Bun 自动加载
`.env.local` 时把开发数据根带入验收。与其他 Tauri debug 实例并行时，
可通过 `AIO_E2E_WEBDRIVER_PORT` 显式指定空闲端口。

runner 会自动启动缺失的 Vite dev server、确定性的本地 OpenAI-compatible
Chat/Embedding mock，并在隔离数据根写入 E2E Profile。失败截图、WDIO 日志、
mock 请求摘要和 `e2e-run.json` 统一保存在产物目录；记录中不包含 API Key 或
Authorization header。

### 8.3. 编写真实窗口用例

真实窗口用例应优先使用稳定的 `data-testid`、可访问名称或明确的语义 selector，不要依赖坐标、动态文案或当前屏幕布局。每个场景都要：

- 在隔离数据根中准备 fixture；
- 通过真实 UI 触发操作；
- 断言页面状态、工具事件或持久化结果；
- 在失败时保留截图、前后端日志和 session 信息；
- 明确哪些步骤经过了 Tauri IPC，哪些步骤仍属于系统级人工边界。

### 8.4. 不能由 WDIO 单独替代的入口

WDIO 和 WebView2 CDP 只能直接控制 Tauri WebView。Windows 原生文件/目录选择器使用独立的 FlaUI/UIA3 helper：

```powershell
bun run test:tauri:e2e:native
```

该短别名由 `native` preset 装配；需要统一通用入口时可运行
`bun run test:tauri:e2e -- --preset native`。

该入口只在 Windows 10 及以上、已登录且未锁屏的交互式桌面运行。helper 与 AIO Hub 必须属于同一用户和相同完整性级别。原生 selector 按进程、Owner/模态窗口、AutomationId、ControlType 和 UIA Pattern 定位；Win10 Common Item Dialog 的 `#32770` 仅作为辅助信号，不依赖“打开”“文件名”等本地化文案。每次动作前保存 UIA 树，失败时额外保存桌面截图。详细契约见 [`tests/windows-ui-automation/README.md`](../../tests/windows-ui-automation/README.md)。

绝对路径拖放、桌面窗口激活和系统级窗口排列仍需继续扩展 Windows UI Automation runner 或执行可见桌面人工验收。拖放必须从真实 Explorer 文件项执行指针拖动，不能用直接 `invoke`、repository 调用或伪造 H5 `File` 冒充通过。

普通浏览器页面测试仍可用于纯前端 Mock 场景，但不能替代真实 Tauri E2E。

## 9. Android 模拟器访问本地模型的验收边界

Android 模拟器中的回环地址、宿主机网关和 ADB 端口映射依赖本机工具与模拟器实现，
相关设备清单、探测命令和实测结果不写入仓库文档。执行本地模型连通性检查时，应在
设备内请求真实 HTTP API 并核对成功响应，不要只依据 TCP 工具的退出码，也不要为了
临时验收把本地模型服务公开到局域网。

模拟器到宿主机模型服务连通只能证明网络路径成立，不能单独证明：

- 模型支持当前附件类型或 OpenAI-compatible 多模态格式；
- AIO Hub 的 `ManagedAssetRef` 已经由 Rust 原生传输正确解析并发送；
- 流式响应、取消、前后台切换和大文件行为正确；
- Android 真机或 iOS 具备相同行为。

资产附件门禁仍必须在真实应用流程中选择托管资产、发送到明确支持该附件类型的
模型并收到有效响应；Android 真机门禁不得用模拟器或本机端口映射代替。测试记录
应注明设备类型、系统版本、模拟器标识、连接方式、模型 ID 和实际请求结果，不得
记录 API Key、Authorization header 或其他凭据。
