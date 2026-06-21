# 常驻 Sidecar 进程基础设施扩展计划

## 项目状态

- 插件类型：`sidecar`（基础设施层）
- 变更类型：新增常驻进程管理模式
- 关联计划：[`paddle-ocr-plugin-migration.md`](paddle-ocr-plugin-migration.md)、[`window-automator-plugin-migration.md`](window-automator-plugin-migration.md)

## 1. 背景与目标

当前主应用的 Sidecar 插件执行机制（[`src-tauri/src/commands/sidecar_plugin.rs`](../../src-tauri/src/commands/sidecar_plugin.rs:45)）采用**一次性 spawn 模式**：每次调用 `execute_sidecar` 都启动新进程、写入 stdin、等待 stdout 结束、进程退出。

这种模式对于低频调用（如 Smart OCR 手动框选）尚可接受，但对于以下场景存在严重性能瓶颈：

| 场景                          | 痛点                                                          |
| ----------------------------- | ------------------------------------------------------------- |
| **Paddle OCR 常驻化**         | 每次 OCR 需重新加载 MNN 模型（1.2s~2.0s），无法实现毫秒级响应 |
| **Window Automator 执行引擎** | 自动化流需要 Sidecar 内部闭环执行步骤循环，并实时推送状态事件 |

**目标**：扩展主应用的 Sidecar 插件系统，使其原生支持**常驻进程模式（Resident Mode）**，为所有需要长连接、低延迟、事件流的 Sidecar 插件提供统一基础设施。

---

## 2. 功能范围

### 基础设施侧负责

- Rust 后端：新增 `SidecarPluginManager`，管理常驻进程生命周期。
- Tauri Commands 注册：`sidecar_spawn_resident`、`sidecar_send_command`、`sidecar_kill_resident`。
- 事件流推送：将 Sidecar 推送的事件实时转发给前端 Tauri Event。
- **Sidecar 间中转（Broker 模式）**：支持常驻 Sidecar A 通过主应用中转调用常驻 Sidecar B。

### 前端 SDK / 插件系统侧负责

- 扩展 `aiohub-sdk` 的 `execute()` 函数，自动识别常驻模式并切换调用路径。
- 暴露 `onSidecarEvent(pluginId, callback)` 供插件 UI 订阅。

### 插件侧负责

- 各插件在 `manifest.json` 中声明 `sidecar.resident: true`。
- 插件 Sidecar 自身实现 JSON-RPC 长连接协议（由各插件计划覆盖）。

---

## 3. 架构设计

```
┌──────────────────────────────────────────────────────────┐
│                    主应用 (Rust Backend)                   │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │         SidecarPluginManager (新增)               │   │
│  │                                                   │   │
│  │  resident_processes: HashMap<PluginId, Handle>    │   │
│  │                                                   │   │
│  │  spawn_resident(plugin_id) → Result<()>           │   │
│  │  send_command(plugin_id, method, params) → Resp   │   │
│  │  kill_resident(plugin_id)                         │   │
│  │  on_event(plugin_id, callback)                    │   │
│  │  forward_command(src, target, method, params)→Resp │   │  ← 新增
│  └──────────────────────────────────────────────────┘   │
│                          │                               │
│         ┌────────────────┼────────────────┐              │
│         ▼                ▼                ▼              │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐          │
│  │ paddle-  │    │ window-  │    │ future-  │          │
│  │ ocr      │    │ automator│    │ plugin   │          │
│  │ (常驻)   │    │ (常驻)   │    │ (常驻)   │          │
│  └──────────┘    └──────────┘    └──────────┘          │
│                          │                               │
│                   Broker 通道 (A↔B 中转)                  │
└──────────────────────────────────────────────────────────┘
```

### 3.1 核心组件

#### 3.1.1 Rust 侧：`SidecarPluginManager`

新增模块 `src-tauri/src/commands/sidecar_plugin_manager.rs`（或扩展现有 `sidecar_plugin.rs`），提供：

- **进程生命周期管理**：
  - `spawn_resident(plugin_id, executable_path, args)` — 启动常驻进程，保持 stdin/stdout/stderr 句柄。
  - `kill_resident(plugin_id)` — 发送 `shutdown` 指令并等待进程退出，超时则强制 kill。
- **命令发送与响应匹配**：
  - `send_command(plugin_id, method, params)` → `Promise<Response>` — 通过 JSON-RPC `id` 字段匹配请求与响应。
- **事件流推送**：
  - `on_event(plugin_id, callback)` — 将 Sidecar 推送的 `progress`、`log`、`var_update` 等事件实时转发给前端。
- **Sidecar 间中转（Broker）**：
  - `forward_command(src_plugin_id, target_plugin_id, method, params)` → `Promise<Response>` — 当 Sidecar A 的 stdout 输出 `forward` 类型事件时，自动解析并调用常驻的 Sidecar B，将结果通过 `sidecar_resident_event` 推回给 Sidecar A。

#### 3.1.2 插件清单扩展：`manifest.json`

在 `manifest.json` 中增加常驻模式声明：

```json
{
  "id": "paddle-ocr",
  "type": "sidecar",
  "sidecar": {
    "executable": { "win32-x64": "target/.../aiohub-paddle-ocr.exe" },
    "resident": true,
    "startupMethod": "recognizeBatch",
    "startupParams": { "images": [] }
  }
}
```

---

## 4. 通信协议规范

### 4.1 JSON-RPC 命令格式（前端 → Sidecar）

```typescript
interface ResidentCommand {
  id: number;
  method: string;
  params: Record<string, unknown>;
}
```

### 4.2 JSON-RPC 事件格式（Sidecar → 前端）

所有事件均携带 `id` 以匹配请求：

```typescript
type SidecarOutput =
  | { id: number; type: "progress" | "result" | "error"; data: unknown }
  | { type: "event"; event: string; data: unknown };
```

**示例**：

```json
// 进度事件
{ "id": 42, "type": "progress", "data": { "message": "正在识别 1/2", "percent": 50 } }

// 结果事件
{ "id": 42, "type": "result", "data": { "results": [...] } }

// 错误事件
{ "id": 42, "type": "error", "data": "模型文件缺失" }

// 主动推送事件（无 id，由 Sidecar 主动发起）
{ "type": "event", "event": "status", "data": { "status": "running", "stepIndex": 4 } }
```

### 4.3 生命周期指令

```json
{ "id": 0, "method": "shutdown", "params": {} }
```

### 4.4 ↘ Sidecar 间中转协议（Broker 模式） ← 新增

当常驻 Sidecar A（如 window-automator）需要调用常驻 Sidecar B（如 paddle-ocr）时，**不允许直接 spawn B**，必须通过主应用中转：

#### Sidecar A 发送中转请求（通过 stdout）

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

| 字段     | 说明                                                        |
| -------- | ----------------------------------------------------------- |
| `type`   | 固定为 `"forward"`，SidecarPluginManager 识别此字段进行中转 |
| `id`     | 调用方侧的唯一 ID，用于匹配最终响应                         |
| `target` | 目标常驻 Sidecar 的插件 ID                                  |
| `method` | 目标 Sidecar 的方法名                                       |
| `params` | 目标 Sidecar 的参数                                         |

#### 主应用转发逻辑

1. `SidecarPluginManager` 在事件循环中识别 `type === "forward"` 的 stdout 输出。
2. 根据 `target` 查找常驻进程句柄。
3. 调用 `send_command_to_sidecar(target, method, params)`，生成新的内部 `internal_id`。
4. 等待目标 Sidecar 返回结果。
5. 通过 `sidecar_resident_event` 将结果推回给 Sidecar A 的 stdout：

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

---

## 5. 统一临时文件管理规范 ← 新增

当前 `smart-ocr` 和 `window-automator` 各自管理临时文件，可能导致目录混乱、清理遗漏。

### 5.1 统一约定

所有 Sidecar 和内置工具使用主应用开放的临时目录：

```
${appDataDir}/temp/aiohub-shared/
```

- 目录结构：按源模块名划分子目录，如 `ocr/`、`capture/`。
- 文件命名：`{sourceId}_{timestamp}_{uuid}.png`。
- 清理策略：**主应用启动时**扫描并删除超过 24 小时的残留文件。
- 文件协议：各 Sidecar 的输入协议支持 `path` 字段，优先使用。

### 5.2 Tauri Commands

- `write_temp_files(source, files: FileData[])` → 接收二进制数组，写入临时目录，返回路径列表。
- `cleanup_temp_files(paths: string[])` → 批量删除指定临时文件。

---

## 6. 实施步骤

### 阶段 A：Rust 后端 — 常驻进程管理器

1. **创建 `SidecarPluginManager` 状态**：
   - 在 `src-tauri/src/commands/` 下新建 `sidecar_plugin_manager.rs`。
   - 定义 `ResidentProcess` 结构体，持有 `Child` 句柄、`stdin` writer、事件回调。
   - 使用 `Arc<Mutex<HashMap<String, ResidentProcess>>>` 管理多个常驻进程。

2. **实现进程生命周期**：
   - `spawn_resident`：启动进程，spawn 异步任务持续读取 stdout/stderr，解析 JSON 事件并匹配 `id` 或触发回调。
   - `send_command`：生成唯一 `id`，写入 stdin，返回 `oneshot::Receiver` 等待匹配的响应。
   - `kill_resident`：发送 `shutdown` 指令，等待进程退出（超时 5s 后强制 kill）。

3. **实现 Broker 中转逻辑（新增）**：
   - 在 stdout 事件循环中识别 `type === "forward"` 的事件。
   - 调用 `forward_command(src, target, method, params)`：查找目标进程，调用 `send_command`，将返回结果通过 `sidecar_resident_event` 推回给源 Sidecar。

4. **注册 Tauri Commands**：
   - `sidecar_spawn_resident(plugin_id, executable_path, args)`
   - `sidecar_send_command(plugin_id, method, params)` → `Promise<Response>`
   - `sidecar_kill_resident(plugin_id)`
   - `write_temp_files(source, files)`（新增）
   - `cleanup_temp_files(paths)`（新增）
   - 在 [`src-tauri/src/lib.rs`](../../src-tauri/src/lib.rs:508) 的 `invoke_handler` 中注册。

### 阶段 B：前端 SDK / 插件系统扩展

1. **扩展 `aiohub-sdk` 的 `execute` 函数**：
   - 读取插件 manifest，判断 `sidecar.resident` 是否为 `true`。
   - 若常驻，调用 `invoke('sidecar_send_command', { pluginId, method, params })`。
   - 若一次性，走现有 `invoke('execute_sidecar', ...)` 流程。

2. **增加事件监听 API**：
   - 暴露 `onSidecarEvent(pluginId, callback)` 供插件 UI 订阅 Sidecar 主动推送的事件。

### 阶段 C：集成验证

1. **Paddle OCR 常驻验证**：
   - 启用 `paddle-ocr` 插件后，验证进程已启动且模型已加载。
   - 连续调用 `recognizeBatch`，验证后续调用延迟 < 100ms。
   - 禁用插件后，验证进程已退出。

2. **Window Automator 常驻验证**：
   - 验证执行引擎能够通过常驻连接接收 `start_flow` 指令并推送步骤事件。
   - 验证 OCR 步骤通过 Broker 模式调用 paddle-ocr 正常。

---

## 7. 与现有系统的兼容性

| 现有功能                                              | 兼容策略                                                           |
| ----------------------------------------------------- | ------------------------------------------------------------------ |
| `execute_sidecar` 一次性模式                          | **完全保留**，不声明 `resident: true` 的插件继续走原有流程         |
| `sidecar-output` 事件                                 | **保留**，常驻模式的事件通过新的 `sidecar-resident-event` 事件推送 |
| 现有插件（`example-*`、`hard-subtitle-extractor` 等） | **零影响**，它们不声明 `resident: true`，行为完全不变              |

---

## 8. 依赖关系

```
sidecar-resident-infrastructure  (本计划)
    ├── 阶段 A+B 完成后 → paddle-ocr / window-automator 即可接入
    └── 不阻塞：三个 plan 可同时设计，基础设施就绪后并行实现
```
