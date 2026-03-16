# AIO Hub 插件开发指南

本文档介绍如何为 AIO Hub 开发插件。

## 插件系统概述

AIO Hub 的插件系统基于现有的服务架构，支持三种类型的插件：

- **JavaScript 插件**: 轻量级的前端插件，运行在前端渲染进程，适用于文本处理、UI 交互、与宿主应用深度集成等场景。
- **原生插件 (Native Plugin)**: 高性能的后端插件，通过动态链接库 (DLL/SO/Dylib) 加载到主进程，实现与应用生命周期绑定的长期运行服务。
- **Sidecar 插件**: 独立的后端进程插件，语言无关，适用于计算密集型、需要隔离环境或使用 AIO Hub 未内置语言的场景。

## 开发 JavaScript 插件

### 1. 创建插件目录

在项目根目录的 `plugins/` 文件夹下创建你的插件目录：

```
plugins/
└── my-plugin/
    ├── manifest.json
    ├── index.ts
    └── README.md
```

### 2. 编写 manifest.json

插件清单定义了插件的元数据和 UI 入口，逻辑能力则完全由 `index.ts` 决定。

#### 必填字段

- **id**: 插件的唯一标识符（建议使用小写字母、数字和连字符）
- **name**: 插件的显示名称
- **version**: 插件版本（遵循语义化版本规范，如 `1.0.0`）
- **description**: 插件的简短描述
- **author**: 插件作者
- **host**: 主机要求
  - **appVersion**: AIO Hub 的最低版本要求（semver 格式）
  - **apiVersion**: (可选) 插件所依赖的插件系统 API 版本 (整数)。这是一个独立的版本号，仅在插件系统发生不兼容更新时才会增加。**推荐所有新插件填写此字段**，以确保兼容性。如果未提供，将跳过 API 版本检查。
- **type**: 插件类型，对于 JS 插件，此值必须是 `javascript`
- **main**: JS 插件的入口文件路径，通常是 `index.js` (生产环境) 或 `index.ts` (开发环境)。

#### 可选字段

- **icon**: 插件图标
  - 可以是单个 emoji 字符（如 `"🔧"`）
  - 相对于插件根目录的图片路径（如 `"icon.png"`）
  - 或 `appdata://` 协议的路径
- **tags**: 标签数组，用于插件的分类和搜索（如 `["工具", "文本处理"]`）
- **settingsSchema**: 插件配置项的定义（详见配置系统文档）
- **ui**: UI 组件配置（详见 UI 开发指南）
- **permissions**: 权限声明（未来功能）

#### 示例

```json
{
  "id": "my-plugin",
  "name": "我的插件",
  "version": "1.0.0",
  "description": "一个演示新版插件架构的示例",
  "author": "你的名字",
  "icon": "🔧",
  "tags": ["工具", "示例"],
  "host": {
    "appVersion": ">=0.4.6",
    "apiVersion": 2
  },
  "type": "javascript",
  "main": "index.ts"
}
```

### 3. 实现插件逻辑 (`index.ts`)

`index.ts` 是插件所有逻辑的唯一入口。你必须默认导出一个包含所有方法和生命周期钩子的对象。

#### 生命周期钩子

- **`activate(context: PluginContext)`**: (可选) 当插件被加载并启用时调用。
- **`deactivate()`**: (可选) 当插件被禁用或卸载时调用。

#### 暴露方法给 Agent (AI 调用)

为了让 Agent (内置 Chat) 能够发现并调用你的插件方法，你需要提供元数据声明。

**JS 插件推荐方式：在 `index.ts` 中导出 `getMetadata()`**
这种方式最灵活，且能避免在 `manifest.json` 中重复编写元数据。

```typescript
import type { PluginContext } from "@/services/plugin-types";
import type { ServiceMetadata } from "@/services/types";

async function activate(context: PluginContext) { ... }

// 实际业务逻辑方法
async function addTimestamp(params: { text: string }): Promise<string> {
  return `[${new Date().toISOString()}] ${params.text}`;
}

// 暴露元数据给 Agent
function getMetadata(): ServiceMetadata {
  return {
    methods: [
      {
        name: "addTimestamp",
        displayName: "添加时间戳",
        description: "为输入的文本添加当前 ISO 格式的时间戳前缀",
        agentCallable: true, // 必须设为 true 才能被 AI 发现
        parameters: [
          { name: "text", type: "string", description: "目标文本", required: true },
        ],
        returnType: "Promise<string>",
      },
    ],
  };
}

export default {
  activate,
  getMetadata,
  addTimestamp,
};
```

**Native/Sidecar 插件方式：在 `manifest.json` 中声明**
由于非 JS 插件没有 TS 代码可供扫描，必须在清单文件中声明：

```json
{
  "id": "my-native-tool",
  "methods": [
    {
      "name": "calculate",
      "description": "执行高性能计算",
      "agentCallable": true,
      "parameters": [
        { "name": "input", "type": "number", "required": true }
      ]
    }
  ]
}
```

#### 核心原则

1. **写一遍不写第二遍**：对于 JS 插件，尽量使用 `getMetadata()` 导出，这样逻辑和声明都在同一个文件里。
2. **Facade 可选**：如果你的导出方法参数本身就是扁平对象，可以直接导出，无需额外封装。
3. **Agent 友好**：确保 `description` 清晰，`agentCallable` 为 `true`。

### 4. 特定模块插件开发

AIO Hub 的不同模块（如 LLM Chat）提供了特定的扩展能力。

- **LLM Chat 插件**: 想要扩展聊天功能（如 Context Pipeline、聊天设置等），请参考 [LLM Chat 插件开发指南](./llm-chat-plugin-guide.md)。

## 开发原生插件 (Native Plugin)

原生插件通过动态链接库 (DLL/SO/Dylib) 直接由 Tauri 后端加载到主进程中，具有以下优势：

- **高性能**: 作为原生代码在主进程内运行，没有跨进程通信开销。
- **长期运行**: 生命周期与主应用后端绑定，适合需要常驻的服务。
- **无第三方进程**: 简化了部署和管理，降低了资源消耗。
- **强大的能力**: 可以访问系统底层 API，实现更复杂的功能。

### 1. 编写 manifest.json

与 JS 插件类似，原生插件也需要 `manifest.json`，但 `type` 需指定为 `native`，并提供 `native` 配置块。

```json
{
  "id": "my-native-plugin",
  "name": "我的原生插件",
  "version": "1.0.0",
  "description": "原生插件描述",
  "author": "你的名字",
  "host": {
    "appVersion": ">=2.0.0"
  },
  "type": "native",
  "native": {
    "reloadable": false,
    "library": {
      "windows": "target/release/my_native_plugin.dll",
      "macos": "target/release/libmy_native_plugin.dylib",
      "linux": "target/release/libmy_native_plugin.so"
    }
  },
  "methods": [
    {
      "name": "add",
      "description": "计算两个数的和",
      "parameters": [
        { "name": "a", "type": "number", "required": true },
        { "name": "b", "type": "number", "required": true }
      ],
      "returnType": "Promise<{sum: number}>"
    }
  ]
}
```

#### `native` 配置项

- `library`: 一个对象，按平台 (`windows`, `macos`, `linux`) 指定动态库文件的相对路径。
- `reloadable` (可选, 默认为 `false`): 是否支持运行时安全重载。
  - `false`: 插件加载后无法安全卸载，禁用插件需要重启应用。适用于有状态或管理全局资源的服务。
  - `true`: 插件支持在不重启应用的情况下被禁用和重新启用。这要求插件本身是无状态的，或者能够正确处理资源的清理和重新初始化。

### 2. 实现插件逻辑 (ABI 契约)

为了让 AIO Hub 能以统一的方式调用所有原生插件，每个动态库都必须导出一个遵循特定签名的 C-ABI 函数：`call`。

#### 导出函数 `call`

- **签名**: `unsafe extern "C" fn call(method_name: *const c_char, payload: *const c_char) -> *mut c_char`
- **参数**:
  - `method_name`: C 字符串，表示要调用的方法名。
  - `payload`: C 字符串，表示 JSON 格式的参数。
- **返回值**:
  - `*mut c_char`: C 字符串，表示 JSON 格式的返回值。**此内存必须由插件分配**。

#### 内存管理

为避免内存泄漏，插件应同时导出一个 `free_string` 函数，用于让 AIO Hub 后端释放 `call` 函数返回的内存。

- **签名**: `unsafe extern "C" fn free_string(ptr: *mut c_char)`

#### Rust 实现示例

这是一个原生插件的 `lib.rs` 示例，它实现了一个 `add` 方法。

```rust
use std::ffi::{CStr, CString};
use std::os::raw::c_char;
use serde::{Deserialize, Serialize};
use serde_json;

// 输入参数结构
#[derive(Deserialize)]
struct AddParams {
    a: i32,
    b: i32,
}

// 返回值结构
#[derive(Serialize)]
struct AddResult {
    sum: i32,
}

// 统一的入口函数
#[no_mangle]
pub unsafe extern "C" fn call(method_name_ptr: *const c_char, payload_ptr: *const c_char) -> *mut c_char {
    let method_name = CStr::from_ptr(method_name_ptr).to_str().unwrap_or("");
    let payload = CStr::from_ptr(payload_ptr).to_str().unwrap_or("");

    let result_str = match method_name {
        "add" => {
            match serde_json::from_str::<AddParams>(payload) {
                Ok(params) => {
                    let result = AddResult { sum: params.a + params.b };
                    serde_json::to_string(&result).unwrap_or_else(|e| format!(r#"{{"error":"{}"}}"#, e))
                }
                Err(e) => format!(r#"{{"error":"Invalid params: {}"}}"#, e),
            }
        }
        _ => format!(r#"{{"error":"Method '{}' not found"}}"#, method_name),
    };

    CString::new(result_str).unwrap().into_raw()
}

// 内存释放函数，由 AIO Hub 后端调用
#[no_mangle]
pub unsafe extern "C" fn free_string(ptr: *mut c_char) {
    if !ptr.is_null() {
        let _ = CString::from_raw(ptr);
    }
}
```

### 3. 运行时安全与热重载

AIO Hub 的原生插件系统实现了基于引用计数的安全调用机制。

- 当一个插件方法被调用时，其引用计数会增加。
- 调用结束后，引用计数会减少。
- 只有当插件的 `reloadable` 标记为 `true` 且引用计数为零时，该插件才能被安全地卸载。

这个机制确保了即使在插件更新或禁用时，正在进行的调用也不会被中断，从而保证了应用的稳定性。

## 开发 Sidecar 插件

Sidecar 插件以独立的子进程运行，通过标准输入/输出 (stdio) 与 AIO Hub 后端通信。这种模式是语言无关的，只要能编译成可执行文件并遵循通信协议即可。

### 1. 编写 manifest.json

`type` 必须为 `sidecar`，并提供一个 `sidecar` 配置块。

```json
{
  "id": "file-hasher",
  "name": "文件哈希计算器",
  "version": "0.1.0",
  "description": "计算文件的 SHA-256 哈希值的示例 Sidecar 插件",
  "author": "AIO Hub Team",
  "type": "sidecar",
  "sidecar": {
    "executable": {
      "win32-x64": "target/debug/file-hasher.exe",
      "darwin-x64": "target/debug/file-hasher",
      "linux-x64": "target/debug/file-hasher"
    },
    "args": []
  },
  "methods": [
    {
      "name": "calculateHash",
      "description": "计算文件的哈希值",
      "parameters": [
        {
          "name": "path",
          "type": "string",
          "required": true
        }
      ]
    }
  ]
}
```

#### `sidecar` 配置项

- `executable`: 一个对象，按平台和架构 (`<os>-<arch>`) 指定可执行文件的相对路径。
- `args`: 启动可执行文件时传递的命令行参数数组。

### 2. 实现插件逻辑 (通信协议)

Sidecar 插件通过 stdio 与主进程进行基于 JSON-RPC 的通信。

1.  **启动**: AIO Hub 启动 `executable` 中指定的可执行文件。
2.  **请求**: AIO Hub 向子进程的 `stdin` 发送 JSON 请求。
3.  **响应**: 插件处理请求，并将 JSON 响应写入其 `stdout`。

### 3. 编译

你需要自行编译你的 Sidecar 插件，并将可执行文件放置在 `manifest.json` 中指定的路径。

## 调用插件

所有插件的方法都会被自动发现并注册到服务注册表，可以通过统一的 `execute` 执行器调用：

```typescript
import { execute } from "@/services/executor";

// 调用上面示例中定义的 addTimestamp 方法
const result = await execute({
  service: "my-plugin", // 插件的 id
  method: "addTimestamp", // 插件导出的方法名
  params: { text: "hello from executor" },
});

if (result.success) {
  console.log(result.data); // 输出: "[2025-12-13T...] hello from executor"
} else {
  console.error(result.error);
}
```

## 开发模式

### 自动加载与热重载 (HMR)

在开发模式下（`bun run tauri dev`），插件会自动从 `plugins/` 目录加载，并尽可能提供热重载支持：

- **JavaScript 插件**: 主应用的 Vite 开发服务器会自动处理 JS 插件，提供强大的热重载能力。
  - **原生 TypeScript 支持**: 开发时可直接使用 TypeScript (`.ts`) 编写插件逻辑。由于 AIO Hub 使用 `bun` 作为开发运行时，TS 文件无需手动编译即可被原生支持和执行。
  - **UI 组件热重载**: 推荐使用 Vue 单文件组件 (`.vue`) 来构建插件 UI。这使得插件能与主程序共享同一个 HMR 流程，并获得 Vue DevTools 的完整支持（如组件检查、跳转到源码等），开发体验最佳。
  - 虽然理论上可以使用其他 Vite 支持的库（如 React），但这未经测试，可能需要额外配置。
- **原生/Sidecar 插件**: 修改 `manifest.json` 会触发重载。对于 `native` 类型且标记为 `reloadable: true` 的插件，无需重启应用即可完成重载。

### 调试

- **JavaScript 插件**: 日志会输出到浏览器控制台。
- **原生/Sidecar 插件**: 日志会输出到 AIO Hub 后端的控制台。
- 推荐使用 `logger` 模块记录日志：

```typescript
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("plugins/my-plugin");

async function myMethod({ input }: MyMethodParams): Promise<string> {
  logger.info("处理输入", { input });
  // ...
  return result;
}
```

## 处理耗时任务与进度汇报

对于可能需要较长时间执行的操作（如文件上传、数据处理、网络请求等），插件可以利用 AIO Hub 的异步任务系统来提供更好的用户体验。

### 异步任务的优势

- **非阻塞执行**: 不会阻塞 UI 线程，用户可以继续使用应用
- **进度反馈**: 实时向用户展示任务进度
- **可取消**: 用户可以随时取消正在执行的任务
- **任务管理**: 统一的任务列表和状态查询

### 声明异步方法

在 `getMetadata()` 中，通过 `executionMode` 和 `asyncConfig` 标记方法为异步：

```typescript
export function getMetadata(): ServiceMetadata {
  return {
    methods: [
      {
        name: "processLargeFile",
        displayName: "处理大文件",
        description: "处理大型文件，支持进度汇报和取消",
        agentCallable: true,
        executionMode: "async", // 标记为异步方法
        asyncConfig: {
          hasProgress: true,      // 支持进度汇报
          cancellable: true,      // 支持取消
          estimatedDuration: 30000, // 预估耗时 30 秒（毫秒）
        },
        parameters: [
          { name: "filePath", type: "string", description: "文件路径", required: true },
          { name: "options", type: "object", description: "处理选项", required: false },
        ],
        returnType: "Promise<ProcessResult>",
      },
    ],
  };
}
```

### 实现异步方法

异步方法会通过方法的第二个参数 `context` (类型为 `ToolContext`) 接收任务上下文，包含以下能力：

```typescript
export interface ToolContext {
  reportStatus: (message: string, progress?: number) => void; // 汇报状态与进度 (0-100)
  signal?: AbortSignal; // 标准的 AbortSignal 对象，用于取消监听
  isAsync: boolean; // 是否处于异步任务模式
  taskId?: string; // 任务 ID（仅异步模式）
}
```

**完整示例**：

```typescript
async function processLargeFile(
  args: { filePath: string; options?: any },
  context?: ToolContext
) {
  // 如果没有上下文，说明是普通同步调用
  const isAsync = context?.isAsync ?? false;

  try {
    // 步骤 1: 读取文件
    context?.reportStatus("正在读取文件...", 0);
    const fileContent = await readFile(params.filePath);
    
    // 检查是否被取消
    if (context?.signal?.aborted) throw new Error("AbortError");
    
    // 步骤 2: 解析数据
    context?.reportStatus("正在解析数据...", 30);
    const parsedData = await parseData(fileContent);
    
    if (context?.signal?.aborted) throw new Error("AbortError");
    
    // 步骤 3: 处理数据（模拟耗时操作）
    context?.reportStatus("正在处理数据...", 50);
    for (let i = 0; i < 100; i++) {
      // 定期检查取消状态
      if (i % 10 === 0) {
        if (context?.signal?.aborted) throw new Error("AbortError");
        context?.reportStatus(`处理进度: ${i}%`, 50 + i / 2);
      }
      await processChunk(parsedData[i]);
    }
    
    // 步骤 4: 保存结果
    context?.reportStatus("正在保存结果...", 95);
    const result = await saveResult(parsedData);
    
    context?.reportStatus("处理完成", 100);
    return result;
    
  } catch (error) {
    // AbortError 会被系统自动处理，无需特殊处理
    if (error.name === "AbortError") {
      throw error;
    }
    // 其他错误正常抛出
    throw new Error(`处理失败: ${error.message}`);
  }
}
```

### 最佳实践

1. **合理的进度粒度**: 不要过于频繁地汇报进度（建议间隔至少 100ms），避免性能开销
2. **有意义的进度消息**: 提供清晰的状态描述，让用户了解当前在做什么
3. **定期检查取消**: 在循环或长时间操作中定期调用 `checkCancellation()`
4. **优雅降级**: 支持无异步上下文时的直接调用（用于测试或内部调用）
5. **准确的预估时间**: `estimatedDuration` 应尽量接近实际耗时，帮助用户判断是否等待

### 注意事项

- `executionMode: "async"` 的方法会返回任务 ID 而非实际结果，调用方需要通过任务管理器查询结果
- `checkCancellation()` 会抛出 `AbortError`，系统会自动捕获并标记任务为已取消
- 进度值范围为 0-100，超出范围会被自动限制
- 异步任务系统会自动记录日志和错误，插件无需额外处理

## 最佳实践

### 1. 类型安全

为插件参数和返回值定义 TypeScript 接口：

```typescript
interface ProcessOptions {
  text: string;
  caseSensitive?: boolean;
}

async function process(options: ProcessOptions): Promise<string> {
  const { text, caseSensitive = false } = options;
  // ...
}
```

### 2. 错误处理

使用 try-catch 处理异常，并抛出有意义的错误信息：

```typescript
async function myMethod({ input }: MyMethodParams): Promise<string> {
  try {
    // 可能出错的代码
    return processInput(input);
  } catch (error) {
    logger.error("处理失败", error);
    throw new Error(`处理失败: ${error.message}`);
  }
}
```

### 3. 异步操作

所有插件方法都应该是异步的 (`async`)，并返回一个 `Promise`。

```typescript
async function fetchData({ url }: FetchParams): Promise<Data> {
  const response = await fetch(url);
  return await response.json();
}
```

## 生产环境

### 编译与打包

- **JavaScript 插件**: 生产环境下需要将 TypeScript 编译为 JavaScript。
- **原生/Sidecar 插件**: 需要提供预编译好的二进制文件。

所有插件最终都应打包为 `.zip` 文件进行分发：

```
my-plugin.zip
├── manifest.json
├── index.js      (JS 插件)
├── my_plugin.dll (原生/Sidecar 插件)
└── README.md
```

## 插件市场（未来功能）

- 将插件发布到官方市场
- 按平台智能分发
- 一键安装和更新

## 示例插件仓库

我们提供了多个开源的示例插件仓库，覆盖了从简单到复杂的不同场景。开发者可以克隆这些仓库来学习，或者将其作为自己插件的模板。

### JavaScript 插件 (纯逻辑) - `example-text-processor`

- **仓库地址**: [aiohub-plugin-example-text-processor](https://github.com/miaotouy/aiohub-plugin-example-text-processor)
- **描述**: 演示了最基础的 JavaScript 插件，只包含后端逻辑，没有 UI。适合学习插件的基本结构和方法定义。

### JavaScript 插件 (带 UI) - `example-hello-world`

- **仓库地址**: [aiohub-plugin-example-hello-world](https://github.com/miaotouy/aiohub-plugin-example-hello-world)
- **描述**: 演示了带 Vue UI 的 JavaScript 插件。这是学习 UI 集成的最佳起点，展示了 UI 如何与插件后端方法交互。

### Sidecar 插件 (Rust 后端 + Vue UI) - `example-file-hasher`

- **仓库地址**: [aiohub-plugin-example-file-hasher](https://github.com/miaotouy/aiohub-plugin-example-file-hasher)
- **描述**: 一个功能完整的 Sidecar 插件，使用 Rust 处理文件哈希计算，并提供 Vue UI 进行交互。展示了独立构建流程、前后端通信等进阶用法。

### 原生插件 (Rust) - `native-example`

- **仓库地址**: [aiohub-plugin-example-native](https://github.com/miaotouy/aiohub-plugin-example-native)
- **描述**: 演示了如何使用 Rust 创建高性能的原生插件。代码示例遵循了与 AIO Hub 主进程交互所需的 ABI 契约。

## 注意事项

1.  **插件 ID 必须唯一**: 避免与其他插件冲突。
2.  **遵循语义化版本**: 使用 semver 格式（如 `1.0.0`）。
3.  **完整的文档**: 提供 README.md 说明插件用途和使用方法。
4.  **向后兼容**: 升级时保持 API 兼容性。

## 技术细节

### 插件加载流程

1.  应用启动时，`autoRegisterServices` 会调用插件加载器。
2.  插件加载器扫描 `plugins/` 目录。
3.  读取每个插件的 `manifest.json`。
4.  根据插件类型 (`javascript`, `native`, `sidecar`) 创建对应的插件适配器。
5.  对于 JS 插件，动态导入其 `index.ts` (开发模式) 或 `index.js` (生产模式) 的默认导出对象。
6.  调用插件的 `activate` 钩子（如果存在），并注入 `PluginContext`。
7.  创建插件代理对象，动态暴露其所有导出的方法。
8.  注册到服务注册表。

### 服务架构集成

插件通过 `PluginProxy` 适配器实现了 `ToolService` 接口，因此：

- 可以通过 `serviceRegistry.getService()` 获取。
- 可以通过 `execute()` 执行。
- 与内置服务使用相同的调用方式。

## 后续开发

- [ ] 插件权限系统
- [ ] 插件市场 UI
- [x] 插件生命周期钩子
- [ ] 插件间通信机制
