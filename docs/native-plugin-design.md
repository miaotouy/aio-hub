# 原生插件 (Native Plugin) 系统设计方案

## 1. 概述

本文档旨在为 AIO Hub 设计并实现一种新的插件类型——原生插件。该类型允许通过动态链接库 (DLL/SO/Dylib) 来扩展应用后端能力，实现高性能、与主进程长期共存的插件模式。

### 1.1. 动机

当前插件系统支持 `javascript` 和 `sidecar` 两种类型：
- **JavaScript 插件**：易于开发和分发，但运行在前端 JS 线程，不适合计算密集型或需要长期运行的后端任务。
- **Sidecar 插件**：通过独立的进程运行，语言无关，但存在进程管理开销、通信延迟和生命周期管理复杂等问题。

**原生插件** 将作为一种补充，它直接由 Tauri 后端加载到主进程中，具有以下优势：
- **高性能**：作为原生代码在主进程内运行，没有跨进程通信开销。
- **长期运行**：生命周期与主应用后端绑定，适合需要常驻的服务。
- **无第三方进程**：简化了部署和管理，降低了资源消耗。
- **强大的能力**：可以访问系统底层 API，实现更复杂的功能。

### 1.2. 核心设计

我们将引入一个新的插件类型 `native`。其核心工作流程如下：
1.  **加载**：Tauri 后端根据插件 `manifest.json` 中的路径，使用 `libloading` 等库加载原生动态库。
2.  **调用**：前端通过 `PluginProxy` 调用插件方法，该调用被转发为对 Tauri 后端的 `invoke` 请求。
3.  **执行**：Tauri 后端在内存中查找已加载的库，并调用其导出的标准 C-ABI 函数。
4.  **通信**：方法参数和返回值通过 JSON 字符串在前端和后端之间传递。

## 2. 前端架构变更

### 2.1. 类型定义 (`src/services/plugin-types.ts`)

我们需要对核心类型进行扩展。

1.  **`PluginType`**:
    ```typescript
    export type PluginType = 'javascript' | 'sidecar' | 'native';
    ```

2.  **`NativeConfig`**: 新增一个接口，用于定义原生插件的库文件路径。
    ```typescript
    /**
     * 原生插件配置
     */
    export interface NativeConfig {
      /** 按平台指定动态库文件路径 */
      library: Partial<Record<PlatformKey, string>>;
    }
    ```

3.  **`PluginManifest`**: 在清单中添加 `native` 配置项。
    ```typescript
    export interface PluginManifest {
      // ... 其他字段
      
      /** 插件类型 */
      type: PluginType;
      
      // ...
      
      /** Sidecar 配置 (type='sidecar' 时必需) */
      sidecar?: SidecarConfig;
      
      /** 原生插件配置 (type='native' 时必需) */
      native?: NativeConfig;
      
      // ...
    }
    ```

### 2.2. 原生插件适配器 (`src/services/native-plugin-adapter.ts`)

创建一个新的适配器 `NativePluginAdapter`，其职责与 `SidecarPluginAdapter` 类似，但通信方式更直接。

```typescript
// src/services/native-plugin-adapter.ts

import { invoke } from "@tauri-apps/api/core";
import type { PluginProxy, PluginManifest, PlatformKey } from "./plugin-types";
// ... 其他导入

export class NativePluginAdapter implements PluginProxy {
  public readonly id: string;
  public readonly manifest: PluginManifest;
  public enabled: boolean = false;
  // ... 其他属性

  constructor(manifest: PluginManifest, installPath: string, devMode: boolean = false) {
    // ... 初始化
  }

  async enable(): Promise<void> {
    if (this.enabled) return;
    logger.info(`启用 Native 插件: ${this.id}`);
    
    // 调用后端加载动态库
    const libraryPath = this.getLibraryPath();
    await invoke('load_native_plugin', {
      pluginId: this.manifest.id,
      libraryPath,
    });
    
    this.enabled = true;
  }

  disable(): void {
    if (!this.enabled) return;
    logger.info(`禁用 Native 插件: ${this.id}`);
    
    // 调用后端卸载动态库
    invoke('unload_native_plugin', { pluginId: this.manifest.id });
    
    this.enabled = false;
  }

  private getLibraryPath(): string {
    // ... 根据当前平台从 manifest.native.library 获取正确的库文件路径
    // ... 并与 installPath 结合成绝对路径
  }

  // 通过 Proxy 动态调用的方法
  private async callPluginMethod(methodName: string, params: any): Promise<any> {
    if (!this.enabled) {
      throw new Error(`插件 ${this.id} 未启用`);
    }

    const result = await invoke<string>('call_native_plugin_method', {
      pluginId: this.manifest.id,
      methodName,
      payload: JSON.stringify(params || {}),
    });

    try {
      return JSON.parse(result);
    } catch {
      // 如果返回的不是 JSON，则直接返回原始字符串
      return result;
    }
  }
  
  // ... 其他接口实现
}

// 创建代理的工厂函数
export function createNativePluginProxy(
  manifest: PluginManifest,
  installPath: string,
  devMode: boolean = false
): PluginProxy {
  const adapter = new NativePluginAdapter(manifest, installPath, devMode);
  // 使用 Proxy 包装 adapter 以实现动态方法调用
  // ... (逻辑同 createJsPluginProxy 和 createSidecarPluginProxy)
}
```

### 2.3. 插件加载器 (`src/services/plugin-loader.ts`)

在 `loadProdPlugins` 和 `loadDevPlugins` 中增加对 `native` 类型的处理。

```typescript
// 在 PluginLoader 类的加载方法中
// ...

// 根据插件类型加载
if (manifest.type === 'javascript') {
  // ...
} else if (manifest.type === 'sidecar') {
  // ...
} else if (manifest.type === 'native') {
  // 创建原生插件代理
  const proxy = createNativePluginProxy(manifest, pluginPath, /* devMode */);
  // 初始化配置和启用状态...
  result.plugins.push(proxy);
} else {
  logger.warn(`未知的插件类型: ${manifest.type}`, { pluginId });
}

// ...
```

## 3. 后端接口定义 (Tauri Commands)

需要在 Rust 后端实现以下几个 Tauri 命令来管理原生插件的生命周期和执行。

### 3.1. `load_native_plugin`

- **功能**: 加载一个动态库到内存中，并将其与一个 `pluginId` 关联。
- **签名**: `#[tauri::command] async fn load_native_plugin(plugin_id: String, library_path: String, state: tauri::State<'_, PluginState>) -> Result<(), String>`
- **逻辑**:
    1.  使用 `libloading::Library::new(library_path)` 加载库。
    2.  将加载的 `Library` 实例存入一个由 `Mutex` 包裹的 `HashMap<String, Library>` 中，`key` 为 `plugin_id`。
    3.  如果已存在相同的 `plugin_id`，则先卸载旧的再加载新的。

### 3.2. `unload_native_plugin`

- **功能**: 从内存中卸载一个动态库。
- **签名**: `#[tauri::command] async fn unload_native_plugin(plugin_id: String, state: tauri::State<'_, PluginState>) -> Result<(), String>`
- **逻辑**:
    1.  从 `HashMap` 中移除 `plugin_id` 对应的 `Library` 实例。
    2.  当 `Library` 实例被 `drop` 时，动态库会自动从进程中卸载。

### 3.3. `call_native_plugin_method`

- **功能**: 调用已加载动态库中的一个标准函数。
- **签名**: `#[tauri::command] async fn call_native_plugin_method(plugin_id: String, method_name: String, payload: String, state: tauri::State<'_, PluginState>) -> Result<String, String>`
- **逻辑**:
    1.  根据 `plugin_id` 从 `HashMap` 中获取 `Library` 实例。
    2.  使用 `library.get::<fn(*const c_char, *const c_char) -> *mut c_char>(b"call\0")` 获取标准 `call` 函数的符号。
    3.  将 `method_name` 和 `payload` 转换为 `CString`。
    4.  调用 `call` 函数，并传入方法名和参数。
    5.  获取返回的 `*mut c_char`，将其转换为 `String`，并释放指针内存。
    6.  将结果返回给前端。

## 4. 原生插件 ABI 契约

为了让 Rust 后端能以统一的方式调用所有原生插件，每个插件都必须导出一个遵循特定签名的 C-ABI 函数。

### 4.1. 导出函数

每个动态库必须导出一个名为 `call` 的 C-ABI 函数。

- **Rust 签名**:
  ```rust
  #[no_mangle]
  pub unsafe extern "C" fn call(method_name: *const c_char, payload: *const c_char) -> *mut c_char {
      // ... 实现
  }
  ```
- **参数**:
    - `method_name`: C 字符串，表示要调用的方法名。
    - `payload`: C 字符串，表示 JSON 格式的参数。
- **返回值**:
    - `*mut c_char`: C 字符串，表示 JSON 格式的返回值。**此内存必须由插件分配，并由调用方（Rust 后端）负责释放。**

### 4.2. 实现示例

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
                    serde_json::to_string(&result).unwrap_or_else(|e| format!("{{\"error\":\"{}\"}}", e))
                }
                Err(e) => format!("{{\"error\":\"Invalid params: {}\"}}", e),
            }
        }
        _ => format!("{{\"error\":\"Method '{}' not found\"}}", method_name),
    };

    CString::new(result_str).unwrap().into_raw()
}

// 内存释放函数（可选，但推荐），由 Rust 后端调用
#[no_mangle]
pub unsafe extern "C" fn free_string(ptr: *mut c_char) {
    if !ptr.is_null() {
        let _ = CString::from_raw(ptr);
    }
}
```
**注意**: Rust 后端在调用 `call` 后，需要使用 `CString::from_raw` 来接管返回的指针并安全地释放内存。

## 5. 工作流程图

```mermaid
sequenceDiagram
    participant FE as 前端 (Vue)
    participant PL as PluginLoader
    participant PA as NativePluginAdapter
    participant BE as 后端 (Tauri/Rust)
    participant DLL as 原生插件 (DLL)

    FE->>PL: loadAllPlugins()
    PL->>PA: createNativePluginProxy(manifest)
    PA-->>PL: proxy
    PL-->>FE: 返回所有插件代理

    FE->>PA: proxy.enable()
    PA->>BE: invoke('load_native_plugin', { id, path })
    BE->>DLL: 加载动态库到内存
    BE-->>PA: success
    PA-->>FE: success

    FE->>PA: proxy.someMethod({ data: '...' })
    PA->>BE: invoke('call_native_plugin_method', { id, method, payload })
    BE->>DLL: call('someMethod', '{ "data": "..." }')
    DLL-->>BE: 返回结果指针
    BE-->>PA: 返回结果字符串
    PA-->>FE: 返回解析后的结果