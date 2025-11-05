# AIO Hub 插件开发指南

本文档介绍如何为 AIO Hub 开发插件。

## 插件系统概述

AIO Hub 的插件系统基于现有的服务架构，支持三种类型的插件：

- **JavaScript 插件**: 轻量级的前端插件，运行在前端渲染进程，适用于文本处理、UI 交互等场景。
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

插件清单定义了插件的元数据和接口：

```json
{
  "id": "my-plugin",
  "name": "我的插件",
  "version": "1.0.0",
  "description": "插件描述",
  "author": "你的名字",
  "host": {
    "appVersion": ">=2.0.0"
  },
  "type": "javascript",
  "main": "index.js",
  "methods": [
    {
      "name": "myMethod",
      "description": "方法描述",
      "parameters": [
        {
          "name": "input",
          "type": "string",
          "required": true,
          "description": "参数描述"
        }
      ],
      "returnType": "Promise<string>"
    }
  ]
}
```

### 3. 实现插件逻辑

在 `index.ts` 中实现插件的具体功能：

```typescript
interface MyMethodParams {
  input: string;
}

async function myMethod({ input }: MyMethodParams): Promise<string> {
  // 实现你的逻辑
  return `处理结果: ${input}`;
}

// 导出插件接口
export default {
  myMethod,
};
```

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

所有类型的插件都会自动注册到服务注册表，可以通过统一的 `execute` 执行器调用：

```typescript
import { execute } from '@/services/executor';

const result = await execute({
  service: 'my-plugin', // 插件的 id
  method: 'myMethod',   // manifest 中定义的方法名
  params: { input: 'hello' }
});

if (result.success) {
  console.log(result.data);
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
import { createModuleLogger } from '@/utils/logger';

const logger = createModuleLogger('plugins/my-plugin');

async function myMethod({ input }: MyMethodParams): Promise<string> {
  logger.info('处理输入', { input });
  // ...
  return result;
}
```

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
    logger.error('处理失败', error);
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

## 示例插件

项目内置了三种类型的插件示例，可供参考：

- **JavaScript 插件**: `plugins/example-text-processor/`
- **原生插件**: `plugins/native-example/`
- **Sidecar 插件**: `plugins/example-file-hasher/`

## 注意事项

1.  **插件 ID 必须唯一**: 避免与其他插件冲突。
2.  **遵循语义化版本**: 使用 semver 格式（如 `1.0.0`）。
3.  **完整的文档**: 提供 README.md 说明插件用途和使用方法。
4.  **类型定义**: 在 manifest.json 中准确定义方法签名。
5.  **向后兼容**: 升级时保持 API 兼容性。

## 技术细节

### 插件加载流程

1.  应用启动时，`autoRegisterServices` 会调用插件加载器。
2.  插件加载器扫描 `plugins/` 目录。
3.  读取每个插件的 `manifest.json`。
4.  根据插件类型 (`javascript`, `native`, `sidecar`) 创建对应的插件适配器。
5.  创建插件代理对象。
6.  注册到服务注册表。

### 服务架构集成

插件通过 `PluginProxy` 适配器实现了 `ToolService` 接口，因此：

- 可以通过 `serviceRegistry.getService()` 获取。
- 可以通过 `execute()` 执行。
- 与内置服务使用相同的调用方式。

## 后续开发

- [ ] 插件权限系统
- [ ] 插件市场 UI
- [ ] 插件生命周期钩子
- [ ] 插件间通信机制