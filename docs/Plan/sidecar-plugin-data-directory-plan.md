# Sidecar 插件专属数据目录支持计划

创建日期：2026-06-29
状态：Implemented / 待真实 Sidecar 运行态验收

## 1. 背景与痛点

目前 AIO Hub 的插件系统支持三种形态：**JavaScript 插件**、**原生插件 (Native Plugin)** 和 **Sidecar 插件**。

- **JavaScript 插件**：拥有完善的持久化数据支持。在 [`plugin-manager.ts`](../../src/services/plugin-manager.ts:378) 中，主应用为其创建了专属的 `plugins-data/{pluginId}` 目录，并通过 `context.storage` 注入给插件。JS 插件读写数据非常安全，升级时不会丢失。
- **原生插件 (Native Plugin)**：高性能的后端插件，通过动态链接库加载到主进程。
- **Sidecar 插件**：独立的后端进程插件。目前主应用在启动 Sidecar 进程时，**完全没有传递任何关于专属数据目录的信息**。这导致 Sidecar 插件如果需要持久化数据（如用户导入的自定义模型、自定义配置文件），只能写在插件安装目录下。

* **致命风险**：主应用在更新、重装或修复插件时，会清空并重建整个插件安装目录（`appDataDir/plugins/paddle-ocr`）。这导致 **Sidecar 插件的所有持久化数据和自定义模型会在插件升级时被物理抹除**。

为了支持 `aiohub-paddle-ocr` 插件迁移到 PP-OCRv6 并引入**模型外置与追加机制**，主应用必须进行升级，补全 Sidecar 插件的专属数据目录支持。

## 2. 设计方案：环境变量注入

最优雅、侵入性最小、且最符合跨平台规范的做法是：**在主应用启动 Sidecar 子进程时，自动创建该插件的专属数据目录，并通过环境变量注入给子进程。**

### 2.1 环境变量定义

- **变量名**：`AIOHUB_PLUGIN_DATA_DIR`
- **变量值**：插件专属的持久化数据目录绝对路径（`{appDataDir}/plugins-data/{pluginId}`）。
- **行为**：主应用在启动子进程前，必须确保该目录在物理上已创建（`std::fs::create_dir_all`）。

### 2.2 优势

1.  **零协议破坏**：不需要修改现有的 JSON-RPC 通信协议，也不需要为 `recognizeBatch` 等方法增加路径参数。
2.  **双端完美对齐**：Sidecar 插件的数据目录与 JS 插件的 `context.storage` 物理路径完全一致，保证了插件生态的统一性。
3.  **升级安全**：数据目录位于 `plugins-data/` 下，与 `plugins/` 安装目录物理隔离，插件升级、重装绝对不会影响用户数据。
4.  **开箱即用**：Sidecar 插件的 Rust/Python/Node 代码只需读取环境变量即可，无需复杂的初始化握手。

---

## 3. 具体实现细节

### 3.1 改造 `src-tauri/src/commands/sidecar_plugin.rs`（一次性 Sidecar 模式）

在 `execute_sidecar` 启动子进程前，计算并创建数据目录，然后注入环境变量：

```rust
// 1. 计算插件专属数据目录：appDataDir/plugins-data/{plugin_id}
let app_data_dir = crate::get_app_data_dir(app.config());
let plugin_data_dir = app_data_dir.join("plugins-data").join(&request.plugin_id);

// 2. 确保目录存在
if !plugin_data_dir.exists() {
    let _ = std::fs::create_dir_all(&plugin_data_dir);
}

// 3. 启动子进程时注入环境变量
let mut child = Command::new(&executable_full_path)
    .args(&request.args)
    .stdin(Stdio::piped())
    .stdout(Stdio::piped())
    .stderr(Stdio::piped())
    .current_dir(&plugin_dir)
    .env("AIOHUB_PLUGIN_DATA_DIR", &plugin_data_dir) // 注入环境变量
    .spawn()
    .map_err(|e| format!("启动进程失败: {}", e))?;
```

### 3.2 改造 `src-tauri/src/commands/sidecar_plugin_manager.rs`（常驻 Sidecar 模式）

在 `sidecar_spawn_resident` 启动常驻进程时注入：

```rust
// 1. 计算并创建数据目录
let app_data_dir = crate::get_app_data_dir(app.config());
let plugin_data_dir = app_data_dir.join("plugins-data").join(&plugin_id);

if !plugin_data_dir.exists() {
    let _ = std::fs::create_dir_all(&plugin_data_dir);
}

// 2. 启动子进程时注入环境变量
let mut child = Command::new(&executable_full_path)
    .args(&args)
    .stdin(Stdio::piped())
    .stdout(Stdio::piped())
    .stderr(Stdio::piped())
    .current_dir(&working_dir)
    .env("AIOHUB_PLUGIN_DATA_DIR", &plugin_data_dir) // 注入环境变量
    .spawn()
    .map_err(|e| format!("启动进程失败: {}", e))?;
```

---

## 4. 依赖此特性的插件升级计划：`aiohub-paddle-ocr` (PP-OCRv6)

`aiohub-paddle-ocr` 插件在迁移到 PP-OCRv6 官方 ONNX 链路时，将深度依赖主应用的这次升级：

1.  **内置模型（只读）**：随插件包分发，存放在插件根目录下的 `models/`（即 `std::env::current_dir().join("models")`）。包含默认的 `ppocr-v6-small` 和只读的 `registry.json`。
2.  **自定义模型与追加清单（可写）**：存放在 `AIOHUB_PLUGIN_DATA_DIR` 目录下。
    - 用户导入的 `.onnx` 模型文件将被拷贝至 `AIOHUB_PLUGIN_DATA_DIR/custom_models/{modelId}/`。
    - 追加的模型清单记录在 `AIOHUB_PLUGIN_DATA_DIR/custom_registry.json` 中。
3.  **Rust 端合并逻辑**：

    ```rust
    let builtin_registry = read_registry(std::env::current_dir()?.join("models/registry.json"));

    let custom_registry = std::env::var("AIOHUB_PLUGIN_DATA_DIR")
        .map(|path| read_registry(PathBuf::from(path).join("custom_registry.json")))
        .unwrap_or_default();

    let merged_registry = merge(builtin_registry, custom_registry);
    ```

## 5. 验收门槛

1.  主应用成功编译，且在启动任何 Sidecar 插件时，日志中能正确打印注入的 `AIOHUB_PLUGIN_DATA_DIR` 路径。
2.  物理检查系统 `appDataDir/plugins-data/{pluginId}` 目录已被自动创建。
3.  Sidecar 插件进程能成功通过 `std::env::var("AIOHUB_PLUGIN_DATA_DIR")` 读取到该路径，并拥有完整的读写权限。

## 6. 实施记录

- 2026-06-29：主应用已在 `src-tauri/src/utils.rs` 中新增共享目录创建 helper 与环境变量常量。
- 2026-06-29：一次性 Sidecar (`execute_sidecar`) 与常驻 Sidecar (`sidecar_spawn_resident`) 均已在 `spawn()` 前创建 `appDataDir/plugins-data/{pluginId}`，并注入 `AIOHUB_PLUGIN_DATA_DIR`。
- 2026-06-29：已通过 `bun run check:backend` 后端检查。真实插件运行态的日志、目录物理存在性与子进程读写权限仍需结合 Sidecar 插件启动验收。
