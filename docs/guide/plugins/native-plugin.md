# 原生插件开发 (Native Plugin)

原生插件通过动态链接库 (DLL/SO/Dylib) 直接由 Tauri 后端加载到主进程中，具有以下优势：

- **高性能**: 作为原生代码在主进程内运行，没有跨进程通信开销。
- **长期运行**: 生命周期与主应用后端绑定，适合需要常驻的服务。
- **无第三方进程**: 简化了部署和管理，降低了资源消耗。
- **强大的能力**: 可以访问系统底层 API，实现更复杂的功能。

## 编写 manifest.json

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

### `native` 配置项

- **`library`**: 一个对象，按平台 (`windows`, `macos`, `linux`) 指定动态库文件的相对路径。
- **`reloadable`** (可选, 默认为 `false`): 是否支持运行时安全重载。
  - `false`: 插件加载后无法安全卸载，禁用插件需要重启应用。适用于有状态或管理全局资源的服务。
  - `true`: 插件支持在不重启应用的情况下被禁用和重新启用。要求插件本身是无状态的，或者能正确处理资源的清理和重新初始化。

### 方法声明

由于原生插件没有 TypeScript 代码可供扫描，**必须**在 `manifest.json` 的 `methods` 数组中显式声明所有可调用方法。每个方法的字段与 JS 插件 `getMetadata()` 中的一致。

> 通用字段详见 [插件开发总览 - Manifest 通用字段](./index.md#manifest-通用字段)

## 实现插件逻辑 (ABI 契约)

为了让 AIO Hub 能以统一的方式调用所有原生插件，每个动态库都必须导出一个遵循特定签名的 C-ABI 函数：`call`。

### 导出函数 `call`

- **签名**: `unsafe extern "C" fn call(method_name: *const c_char, payload: *const c_char) -> *mut c_char`
- **参数**:
  - `method_name`: C 字符串，表示要调用的方法名。
  - `payload`: C 字符串，表示 JSON 格式的参数。
- **返回值**:
  - `*mut c_char`: C 字符串，表示 JSON 格式的返回值。**此内存必须由插件分配**。

### 内存管理

为避免内存泄漏，插件应同时导出一个 `free_string` 函数，用于让 AIO Hub 后端释放 `call` 函数返回的内存。

- **签名**: `unsafe extern "C" fn free_string(ptr: *mut c_char)`

### Rust 实现示例

这是一个原生插件的 `lib.rs` 示例，它实现了一个 `add` 方法：

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

## 运行时安全与热重载

AIO Hub 的原生插件系统实现了基于引用计数的安全调用机制：

- 当一个插件方法被调用时，其引用计数会增加。
- 调用结束后，引用计数会减少。
- 只有当插件的 `reloadable` 标记为 `true` 且引用计数为零时，该插件才能被安全地卸载。

这个机制确保了即使在插件更新或禁用时，正在进行的调用也不会被中断，从而保证了应用的稳定性。

## 构建配置示例

一个典型的 Rust 原生插件 `Cargo.toml`：

```toml
[package]
name = "my_native_plugin"
version = "1.0.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]  # 关键：编译为动态链接库

[dependencies]
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
```

编译命令：

```bash
cargo build --release
```

生成的动态库路径需与 `manifest.json` 中的 `library` 字段匹配。

## 下一步

- 想开发独立子进程插件？请参阅 [Sidecar 插件开发](./sidecar-plugin.md)
- 想了解通用的调用与配置方式？请参阅 [插件开发总览](./index.md)
