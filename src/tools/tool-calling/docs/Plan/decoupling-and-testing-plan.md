# Tool Calling 核心解耦与测试套件建设方案

- **状态**: Completed (已完成)
- **创建时间**: 2026-06-27
- **作者**: 咕咕 (Gugu_Kilo)

---

## 1. 背景与痛点

在 AIO Hub 的智能体工具调用（`tool-calling`）基础设施中，核心逻辑（解析、执行、发现、异步任务）目前与前端 UI 运行时环境存在两处**强绑定**，导致无法在纯开发环境（如 Bun/Node 脚本）下直接运行测试：

1. **Tauri 运行时强绑定**：
   - `taskManager` 依赖 `TaskStore`，而 `TaskStore` 使用了 `ConfigManager`。
   - `ConfigManager` 深度绑定了 Tauri 的 IPC（`invoke`）和文件系统插件（`@tauri-apps/plugin-fs`）。
   - 在纯 Bun/Node 脚本环境下运行测试时，会因为找不到 Tauri 运行时（`window.__TAURI_INTERNALS__ is not defined`）而直接崩溃。
2. **前端 Pinia Store 强绑定**：
   - `core/discovery.ts`（工具发现服务）直接导入并调用了 `useToolsStore` 来获取工具的 `icon` 和 `version`。
   - 在非 Vue/Pinia 激活的测试脚本环境下，调用 `useToolsStore()` 会抛出 `pinia not active` 错误。

这导致开发者在开发新的 Agent 方法时，无法通过自动化脚本进行快速验证，只能启动完整的 Tauri App 并在 UI 界面上手动点击测试，效率极低，且无法做到自动化回归。

---

## 2. 优雅解耦设计

为了实现“在开发环境中用测试脚本去测试各个方法”的目标，我们采取**环境自适应与优雅降级**的解耦设计：

### 2.1. `ConfigManager` 增加环境检测与内存模式降级

我们在 [`src/utils/configManager.ts`](../../../../utils/configManager.ts) 内部引入环境检测。如果检测到处于非 Tauri 环境（如测试脚本、Node/Bun 运行时），**自动降级为内存存储模式（In-Memory Storage）**：

```typescript
// 检测是否处于 Tauri 运行时环境
const isTauri =
  typeof window !== "undefined" && !!(window as any).__TAURI_INTERNALS__;
```

- **Tauri 环境**：保持原有的 `invoke` 和 `writeTextFile` 逻辑，功能完全不受影响。
- **非 Tauri 环境（测试脚本）**：自动切换到内存存储模式。所有的 `load`、`save`、`update` 操作都直接读写内存中的 Map，不调用任何 Tauri API。
- **收益**：不仅解决了 `tool-calling` 的测试问题，**未来所有使用 `ConfigManager` 的工具都可以直接在测试脚本中无缝运行**！

### 2.2. `useToolsStore` 安全调用

在 [`src/tools/tool-calling/core/discovery.ts`](../core/discovery.ts) 中，对 `useToolsStore` 的调用进行 `try-catch` 安全包装：

```typescript
function getToolsStoreSafe() {
  try {
    return useToolsStore();
  } catch {
    // 处于非 Pinia 环境（如测试脚本），安全降级
    return null;
  }
}
```

- 如果处于非 Pinia 环境，安全降级，不获取工具的 `icon` 和 `version`（测试环境下这些元数据不影响核心逻辑）。

---

## 3. 测试套件与规范设计

我们将使用项目现有的 **Vitest** 测试框架，在 [`src/tools/tool-calling/`](../../) 下新建 `__tests__/` 目录，构建一套**标准化的、不依赖 UI 的测试矩阵**。

### 3.1. 测试目录结构

```
src/tools/tool-calling/__tests__/
├── mock-tools.ts          # 专门用于测试的 Mock 工具集（包含同步、异步、超时、安全策略等方法）
└── tool-calling.test.ts   # 核心 Vitest 测试用例文件
```

### 3.2. Mock 工具设计 (`mock-tools.ts`)

定义一个符合 `ToolRegistry` 规范的测试工具，包含以下典型方法：

- `testSync(args)`: 基础同步方法，验证参数接收与返回值。
- `testAsync(args, context)`: 异步方法，模拟耗时任务与进度上报（`reportStatus`）。
- `testTimeout(args)`: 故意超时的同步方法，验证超时熔断。
- `testSecurity(args)`: 包含安全策略的方法，验证死区拦截（`block`）和强制审批（`approve`）。

### 3.3. 测试运行方式

使用项目现有的 Vitest 框架运行测试：

```bash
# 运行 tool-calling 的专属测试
bun run test src/tools/tool-calling

# 运行全量测试
bun run test:run
```

测试套件将覆盖以下核心维度并进行严格断言：

1. **协议解析测试**：
   - 验证 VCP 协议对单次调用、批量调用、转义围栏（`ESCAPE`）、未闭合标签的解析和容错能力。
2. **工具发现测试**：
   - 验证工具方法、异步标注、Prompt 生成的正确性。
3. **方法执行测试**：
   - **参数合并**：验证 `Schema 默认值 < Agent 预设 < LLM 实时参数` 的合并优先级。
   - **类型适配**：验证参数类型自动适配（如 `"true"` 转为 `true`，`"123"` 转为 `123`）。
   - **超时保护**：验证 `config.timeout` 超时自动熔断。
   - **安全策略**：验证死区拦截（`block`）和强制审批（`approve`）。
   - **异步任务**：验证异步任务（`executionMode: "async"`）的提交、进度上报和状态管理。

---

## 4. 开发者测试规范（如何用测试脚本覆盖新方法？）

当开发者在系统中开发了新的 Agent 可调用方法时，必须遵循以下规范进行测试覆盖：

1. **注册工具**：确保新工具已通过 `toolRegistryManager.register` 注册。
2. **编写测试用例**：在 `src/tools/tool-calling/__tests__/tool-calling.test.ts` 中，添加针对该工具方法的测试用例。
3. **验证参数与边界**：
   - 传入合法参数，断言返回值是否符合预期。
   - 传入非法或缺失参数，断言错误处理是否优雅。
   - 如果是异步方法，断言是否能正确提交任务并获取进度。
4. **一键运行**：在终端执行 `bun run test src/tools/tool-calling`，确保所有测试用例全部通过（Green）。

---

## 5. 延伸阅读与指南

为了让其他工具模块的开发者也能快速接入并编写自己的单元测试，我们编写了详细的：

- **[工具方法测试覆盖指南](../../../../docs/guide/tool-testing-guide.md)**：详细介绍了如何利用 `ConfigManager` 的内存降级机制，为任意工具编写不依赖 UI 的自动化单元测试。
