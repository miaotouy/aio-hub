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
  - **platforms**: (可选) 支持的系统平台列表。如果不提供，默认支持所有平台。如果提供，系统会在加载时检查当前平台是否在列表中，若不匹配会记录警告。可选值：`win32-x64`、`win32-arm64`、`darwin-x64`、`darwin-arm64`、`linux-x64`、`linux-arm64`。
- **type**: 插件类型，对于 JS 插件，此值必须是 `javascript`
- **main**: JS 插件的入口文件路径，通常是 `index.js` (生产环境) 或 `index.ts` (开发环境)。

#### 可选字段

- **icon**: 插件图标
  - 可以是单个 emoji 字符（如 `"🔧"`）
  - 相对于插件根目录的图片路径（如 `"icon.png"`）
  - 或 `appdata://` 协议的路径
- **tags**: 标签数组，用于插件的分类和搜索（如 `["工具", "文本处理"]`）
- **settingsSchema**: 插件配置项的定义（详见下文 [插件配置系统](#插件配置系统-plugin-config-system)）
- **dependencies**: (可选) 插件依赖的其他插件及其版本范围（如 `{"chat-core": ">=1.0.0"}`）
- **optionalDependencies**: (可选) 可选依赖的插件（如 `{"theme-manager": "*"}`）
- **incompatibleWith**: (可选) 冲突的插件 ID 数组（如 `["old-chat-plugin"]`）
- **ui**: UI 组件配置（详见 UI 开发指南）
- **contributions**: 插件向宿主应用声明的扩展能力数组。每一项通过 `type` 标识扩展点，宿主模块按需消费对应类型。
- **permissions**: 权限声明（未来功能）

#### contributions 示例：注册 Smart OCR 引擎

`contributions` 是通用字段，不绑定某个具体模块。Smart OCR 只会消费其中 `type` 为 `ocr-engine` 的条目；插件未安装时，对应 OCR 引擎不会出现在主应用引擎列表中。

```json
{
  "contributions": [
    {
      "type": "ocr-engine",
      "id": "paddle-ocr",
      "name": "Paddle OCR",
      "description": "通过插件 sidecar 提供本地 OCR 识别",
      "method": "recognizeBatch",
      "modelProfiles": [{ "id": "ppocr-v5-mobile", "name": "PP-OCRv5 Mobile" }],
      "defaultModelProfile": "ppocr-v5-mobile"
      // "languages": [
      //   { "id": "ch", "name": "中文 + 英文" },
      //   { "id": "en", "name": "英文" }
      // ],
      // "defaultLanguage": "ch"
    }
  ]
}
```

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

#### 模块导入规范

AIO Hub 建立了 ESM 模块共享机制。在插件中，你应该通过标准的 `import` 语句访问主应用提供的核心库，而无需将其打包进插件。

```typescript
// 导入 Vue 核心 API
import { ref, onMounted } from "vue";

// 导入 AIO Hub SDK (包含常用工具和 API 定义)
import { pluginManager, customMessage } from "aiohub-sdk";

// 导入类型定义 (仅用于编译时)
import type { PluginContext, ServiceMetadata } from "aiohub-sdk";
```

> **注意**: 在 `vite.config.ts` 中，你需要将这些模块配置为 `external`（详见 UI 开发指南）。

#### 生命周期钩子

- **`activate(context: PluginContext)`**: (可选) 当插件被加载并启用时调用。这是插件初始化、注册监听器或处理器的理想位置。
- **`deactivate()`**: (可选) 当插件被禁用或卸载时调用。用于清理资源，例如注销监听器。

#### 插件上下文 (PluginContext)

`activate` 钩子接收的 `context` 对象提供了与宿主应用交互的核心能力：

- **`context.settings`**: 插件配置 API。
  - `get(key)`: 获取配置项。
  - `set(key, value)`: 保存配置项。
- **`context.storage`**: 插件专属文件存储 API。数据存储在用户目录下的 `plugins-data/{pluginId}` 中。
  - `readText(path)` / `writeText(path, data)`: 读写文本文件。
  - `readBinary(path)` / `writeBinary(path, data)`: 读写二进制文件。
  - `exists(path)`: 检查文件是否存在。
  - `remove(path)`: 删除文件或目录。
- **`context.environment`**: 宿主全局运行环境配置 API，只读访问用户在“运行环境”设置页中配置的外部依赖路径。
  - `get()`: 获取当前环境配置快照。
  - `getPath("ffmpeg" | "ffprobe" | "git")`: 获取常用可执行文件路径。
  - `getRuntimeCommand("javascript" | "python" | "shell" | "powershell")`: 获取脚本运行时命令。
  - `getDocumentConverterPath("libreOffice" | "abiWord")`: 获取文档转换器路径。
- **`context.chat`**: 聊天扩展 API。
  - `registerProcessor(processor)`: 注册聊天上下文处理器。

也可以在插件 UI 或普通模块中从 `aiohub-sdk` 直接导入同一个只读服务：

```typescript
import { pluginEnvironmentService } from "aiohub-sdk";

const ffmpegPath = pluginEnvironmentService.getPath("ffmpeg");
const pythonCommand = pluginEnvironmentService.getRuntimeCommand("python");
```

#### 暴露方法给 Agent (AI 调用)

为了让 Agent (内置 Chat) 能够发现并调用你的插件方法，你需要提供元数据声明。

**JS 插件推荐方式：在 `index.ts` 中导出 `getMetadata()`**

```typescript
import { ref } from "vue";
import type { PluginContext, ServiceMetadata } from "aiohub-sdk";

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
        agentCallable: true,
        parameters: [
          {
            name: "text",
            type: "string",
            description: "目标文本",
            required: true,
          },
        ],
        returnType: "Promise<string>",
      },
    ],
  };
}

export default {
  activate: (context: PluginContext) => {
    console.log("插件已激活");
  },
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
      "parameters": [{ "name": "input", "type": "number", "required": true }]
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

### 4. 持久型 Sidecar 插件 (Resident Sidecar Plugin)

对于需要长连接、低延迟、事件流或需要常驻后台运行的场景（如本地 OCR 引擎、自动化执行引擎），AIO Hub 支持**持久型 Sidecar 插件（Resident Mode）**。

#### 4.1 声明常驻模式

在 [`manifest.json`](plugins/README.md) 的 `sidecar` 配置块中声明 `"resident": true`：

```json
{
  "id": "paddle-ocr",
  "type": "sidecar",
  "sidecar": {
    "executable": {
      "win32-x64": "bin/aiohub-paddle-ocr-windows-x64.exe"
    },
    "resident": true,
    "startupMethod": "recognizeBatch",
    "startupParams": { "images": [] }
  }
}
```

- **`resident`**: 必须设为 `true`。
- **`startupMethod`** (可选): 进程启动后自动执行的初始化方法。
- **`startupParams`** (可选): 初始化方法所需的参数。

#### 4.2 进程生命周期

- **启动**: 当插件被启用（`enable`）时，主应用会自动启动常驻进程，并保持其 `stdin`、`stdout`、`stderr` 句柄。
- **退出**: 当插件被禁用（`disable`）或应用关闭时，主应用会向常驻进程的 `stdin` 发送 `shutdown` 指令。常驻进程应在收到指令后优雅退出，超时（默认 5 秒）未退出则会被主应用强制 kill。

#### 4.3 JSON-RPC 通信协议规范

常驻 Sidecar 进程通过 `stdin` 接收命令，并通过 `stdout` 输出响应或主动推送事件。

##### 前端 → Sidecar (命令格式)

```typescript
interface ResidentCommand {
  id: number; // 唯一请求 ID，用于匹配响应
  method: string; // 调用的方法名
  params: Record<string, unknown>; // 方法参数
}
```

##### Sidecar → 前端 (响应与事件格式)

所有输出必须是**单行 JSON**（JSON Lines 格式）。

```typescript
type SidecarOutput =
  | { id: number; type: "progress" | "result" | "error"; data: unknown }
  | { type: "event"; event: string; data: unknown };
```

- **进度事件 (带 id)**:
  ```json
  {
    "id": 42,
    "type": "progress",
    "data": { "message": "正在识别 1/2", "percent": 50 }
  }
  ```
- **成功结果 (带 id)**:
  ```json
  { "id": 42, "type": "result", "data": { "results": [...] } }
  ```
- **错误事件 (带 id)**:
  ```json
  { "id": 42, "type": "error", "data": "模型文件损坏" }
  ```
- **主动推送事件 (无 id)**: 用于向前端实时推送状态变更、日志等。
  ```json
  {
    "type": "event",
    "event": "status",
    "data": { "status": "running", "stepIndex": 4 }
  }
  ```

#### 4.4 Sidecar 间中转协议 (Broker 模式)

当常驻 Sidecar A（如自动化引擎）需要调用常驻 Sidecar B（如 OCR 引擎）时，**不允许直接启动 B**，必须通过主应用进行中转。

##### 1. Sidecar A 发送中转请求 (通过 stdout)

```json
{
  "type": "forward",
  "id": 100,
  "target": "paddle-ocr",
  "method": "recognizeBatch",
  "params": {
    "images": [
      { "blockId": "wa", "imageId": "cap_1", "path": "C:/Temp/aio_cap_123.png" }
    ]
  }
}
```

- `type`: 固定为 `"forward"`。
- `id`: 调用方侧的唯一 ID，用于匹配最终响应。
- `target`: 目标常驻 Sidecar 的插件 ID。
- `method` / `params`: 目标 Sidecar 的方法名和参数。

##### 2. 主应用转发并推回结果

主应用会自动调用目标 Sidecar B，并将结果通过 `forward_result` 事件推回给 Sidecar A 的 `stdin`：

```json
{
  "type": "event",
  "event": "forward_result",
  "data": {
    "id": 100,
    "targetId": "paddle-ocr",
    "result": { "results": [...] },
    "error": null
  }
}
```

#### 4.5 统一临时文件管理规范

为了避免临时文件混乱，所有 Sidecar 插件应遵循主应用的统一临时文件规范：

- **临时目录**: `${appDataDir}/temp/aiohub-shared/`
- **文件命名**: `{sourceId}_{timestamp}_{uuid}.png`
- **自动清理**: 主应用启动时会自动扫描并删除超过 24 小时的残留临时文件。
- **优先路径**: 插件接口应优先支持 `path` 文件路径输入，以减少 base64 传输压力。

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

## 插件配置系统 (Plugin Config System)

AIO Hub 提供了一个统一、健壮且类型安全的配置管理机制。插件的所有配置需求都在 [`manifest.json`](plugins/README.md) 中明确声明，作为唯一的“事实来源”。

### 1. 声明配置 Schema (`settingsSchema`)

插件开发者通过在 [`manifest.json`](plugins/README.md:22) 中定义 `settingsSchema` 对象来声明其配置项。主应用会根据此定义**自动生成设置界面**。

```json
{
  "id": "my-translator-plugin",
  "settingsSchema": {
    "version": "1.1.0",
    "properties": {
      "apiKey": {
        "type": "string",
        "secret": true,
        "default": "",
        "label": "API Key",
        "description": "请输入您的翻译服务 API Key。"
      },
      "defaultLanguage": {
        "type": "string",
        "default": "en",
        "label": "默认目标语言",
        "description": "设置默认翻译的目标语言。",
        "enum": ["en", "zh", "jp", "fr"]
      },
      "enableCache": {
        "type": "boolean",
        "default": true,
        "label": "启用缓存",
        "description": "缓存翻译结果以提高性能和节省配额。"
      }
    }
  }
}
```

#### 字段详解

- **`version` (必填)**: 配置的语义化版本号 (SemVer)。当 `properties` 结构发生变化时（增/删/改），开发者**必须**提升此版本号，以触发自动迁移逻辑。
- **`properties` (必填)**: 包含配置项定义的键值对对象。
  - `type`: 配置项类型，可选值：`string`、`number`、`boolean`。
  - `default`: 默认值，类型必须与 `type` 一致。
  - `label`: 在设置 UI 中显示的友好名称。
  - `description`: 在 UI 中显示的详细说明或提示。
  - `secret` (可选): 若为 `true`，UI 会将其渲染为密码输入框，且其值在日志中会被屏蔽。
  - `enum` (可选): 提供一个可选值列表，UI 会自动渲染为下拉选择框。

### 2. 配置存储与隔离

插件配置与插件包本身分离存储，确保在插件更新或重装时配置数据不会丢失。

- **存储路径**: `{appDataDir}/plugins-config/{plugin-id}/config.json`
- **卸载清理**: 卸载插件时，系统会自动删除对应的配置目录，彻底清理数据。

### 3. 配置自动迁移与升级

当主应用加载插件时，如果检测到已保存的配置版本低于 [`manifest.json`](plugins/README.md:22) 中的版本，将自动执行智能合并：

1. **保留用户数据**: 用户已修改的配置项值会被保留。
2. **添加新配置**: 新增的配置项及其默认值会被自动加入。
3. **移除旧配置**: 新版 Schema 中已不存在的旧配置项会被自动舍弃。

### 4. 插件内部 API

在插件逻辑中，可以通过注入的 [`PluginContext`](docs/guide/plugin-development-guide.md) 对象的 `settings` 属性与配置系统交互：

```typescript
export default {
  async translate(params, toolContext) {
    // 获取注入的插件上下文（包含 settings）
    const context = params.context;

    // 安全地获取配置
    const apiKey = await context.settings.get("apiKey");
    const lang = await context.settings.get("defaultLanguage");

    if (!apiKey) {
      throw new Error("API Key 未配置！");
    }

    // 更新配置（保存操作会自动进行防抖处理）
    await context.settings.set("enableCache", false);

    return "...";
  },
};
```

- **`context.settings.get(key: string): Promise<T>`**: 获取单个配置项的值。
- **`context.settings.getAll(): Promise<Record<string, T>>`**: 获取所有配置项。
- **`context.settings.set(key: string, value: T): Promise<void>`**: 更新单个配置项的值。

---

## 插件钩子与动态注入系统 (Hook & Patch System)

为了给开发者提供不同层级的扩展能力，AIO Hub 引入了**“结构化接口保底，动态 Patch 赋能”**的插件钩子与动态注入系统。

| 层级                 | 机制                     | 稳定性 | 灵活性 | 适用场景                     |
| :------------------- | :----------------------- | :----- | :----- | :--------------------------- |
| **L1: 结构化钩子**   | `hooks.tap()`            | 极高   | 低     | 核心数据加工、拦截关键逻辑   |
| **L2: UI 占位符**    | `registerSlot()`         | 高     | 中     | 在预留位置注入按钮、面板     |
| **L3: Service 代理** | `patch(service, method)` | 中     | 高     | 官方未预留钩子时的“魔改”拦截 |
| **L4: 自由注入**     | 全局 CSS / DOM Patch     | 低     | 极高   | 深度修改样式、强行注入 DOM   |

### 1. 依赖管理与拓扑排序

为了解决“魔改”插件之间的冲突，并确保插件按正确顺序加载，您可以在 [`manifest.json`](plugins/README.md) 中声明依赖关系：

```json
{
  "id": "my-advanced-plugin",
  "dependencies": {
    "chat-core": ">=1.0.0"
  },
  "optionalDependencies": {
    "theme-manager": "*"
  },
  "incompatibleWith": ["old-chat-plugin"]
}
```

主应用的插件加载器在激活插件前会构建依赖图并执行**拓扑排序**，确保被依赖的插件先初始化，且其 API 已暴露。同时，系统会自动执行 **DAG 环路检测**，若存在循环依赖（如 `A -> B -> A`）将拒绝加载并记录错误。

### 2. L1: 结构化钩子系统 (Hook System)

用于宿主主动预留的扩展点，支持三种类型的钩子：

- **Waterfall**: 数据加工（如：修改发送的消息文本）。
- **Bail**: 逻辑拦截（如：前置权限检查，返回 `false` 则中断操作）。
- **Sync**: 事件广播（如：应用启动完成）。

#### 注册钩子示例

```typescript
export default {
  activate(context: PluginContext) {
    // 注册一个消息发送前置处理器
    context.hooks.tap(
      "beforeSendMessage",
      async (message) => {
        // 加工数据并返回
        message.text = message.text.trim();
        return message;
      },
      { priority: 100 }
    ); // 支持设置优先级
  },
};
```

### 3. L2: UI 插槽系统 (UI Slot System)

允许插件在主应用预留的 `ExtensionPoint` 占位符处动态注入自定义的 Vue 组件。

```typescript
import MyButton from "./components/MyButton.vue";

export default {
  activate(context: PluginContext) {
    // 在聊天输入区工具栏注入一个自定义按钮
    context.ui.registerSlot("chat-input-toolbar", MyButton, {
      customProp: "value",
    });
  },
};
```

### 4. L3: Service Patch (Monkey Patch API)

这是最强大的“魔改”能力。插件可以直接拦截并替换宿主内部 Service 的方法。

```typescript
export default {
  activate(context: PluginContext) {
    // 拦截 chatStore 的 sendMessage 方法
    context.patch("chatStore", "sendMessage", async (original, ...args) => {
      console.log("拦截到发送请求，参数为:", args);

      // 执行原逻辑（洋葱模型）
      const result = await original(...args);

      console.log("发送完成，结果为:", result);
      return result;
    });
  },
};
```

#### 冲突处理与洋葱模型

当多个插件 Patch 同一个方法时，系统遵循**洋葱模型**：

1. **执行顺序**: 根据拓扑排序结果，依赖图顶层的插件（被依赖最少的）处于洋葱最外层。
2. **传递责任**: 每个 Patch 处理器接收 `original` 参数。插件**必须**决定是否调用 `await original(...args)`。
3. **隔离性**: 如果某个插件的 Patch 崩溃，内部的 `try...catch` 会自动回退到 `original` 逻辑，确保后续插件和宿主功能不受阻断。

### 5. L4: 自由注入 (Oil Monkey Style)

#### 全局 CSS 注入

在 [`manifest.json`](plugins/README.md) 中声明样式表，系统会在加载时自动注入：

```json
"contributes": {
  "stylesheets": ["style.css"]
}
```

#### DOM Patch (MutationObserver 辅助)

插件可以使用宿主提供的工具函数，在特定 DOM 元素出现时挂载自定义组件或注入样式：

```typescript
import MyFloatingPanel from "./components/MyFloatingPanel.vue";

export default {
  activate(context: PluginContext) {
    // 注入全局样式
    context.ui.injectStyle(`
      .my-custom-highlight {
        border: 2px solid var(--el-color-primary);
      }
    `);

    // 监听特定 DOM 出现并挂载组件
    context.ui.observe(".chat-input-area", (el) => {
      const container = document.createElement("div");
      el.appendChild(container);

      // 手动挂载 Vue 组件
      context.ui.mount(MyFloatingPanel, container, {
        title: "快捷面板",
      });
    });
  },
};
```

### 6. 自动清理与容错机制

为了防止插件卸载后留下“烂摊子”，系统提供了完善的自动清理机制：

- **自动撤销**: 插件注销（`deactivate`）时，系统会自动清理该插件关联的所有 `Proxy` 拦截器、`Hook` 监听器、注入的 `<style>` 标签以及挂载的 Vue 实例。
- **错误边界 (Error Boundary)**: 所有插件生命周期函数（`activate`）和回调（`tap`/`patch`/`observe`）均运行在宿主的错误边界内，单个插件崩溃绝不会导致主应用白屏。

---

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
- 推荐使用 `aiohub-sdk` 提供的 `logger` 记录日志：

```typescript
import { createModuleLogger } from "aiohub-sdk";

const logger = createModuleLogger("plugins/my-plugin");

async function myMethod({ input }: any): Promise<string> {
  logger.info("处理输入", { input });
  // ...
  return "result";
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
          hasProgress: true, // 支持进度汇报
          cancellable: true, // 支持取消
          estimatedDuration: 30000, // 预估耗时 30 秒（毫秒）
        },
        parameters: [
          {
            name: "filePath",
            type: "string",
            description: "文件路径",
            required: true,
          },
          {
            name: "options",
            type: "object",
            description: "处理选项",
            required: false,
          },
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

- **JavaScript 插件**: 生产环境下需要将 TypeScript 编译为 JavaScript (ESM 格式)。推荐使用 Vite 的库模式进行构建。
- **原生/Sidecar 插件**: 需要提供预编译好的二进制文件。

所有插件最终都应打包为 `.zip` 文件进行分发。一个典型的 JS 插件包结构如下：

```
my-plugin.zip
├── manifest.json
├── index.js      (编译后的插件逻辑)
├── MyUI.js       (编译后的 UI 组件)
├── style.css     (可选，UI 样式表)
├── icon.svg      (可选，插件图标)
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
