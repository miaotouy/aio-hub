# Sidecar 插件开发

Sidecar 插件以独立的子进程运行，通过标准输入/输出 (stdio) 与 AIO Hub 后端通信。这种模式是语言无关的，只要能编译成可执行文件并遵循通信协议即可。

适用于：

- 计算密集型任务（如图像处理、大规模数据计算）
- 需要隔离环境或沙箱
- 使用 AIO Hub 未内置的语言（Python、Go、Node.js 等）
- 需要长连接的低延迟场景（本地 OCR 引擎、自动化执行引擎）

## 编写 manifest.json

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

### `sidecar` 配置项

- **`executable`**: 一个对象，按平台和架构 (`<os>-<arch>`) 指定可执行文件的相对路径。
- **`args`**: 启动可执行文件时传递的命令行参数数组。
- **`resident`** (可选): 是否为持久型模式（见下文）。

### 方法声明

Sidecar 插件同样需要在 `manifest.json` 的 `methods` 数组中声明可调用方法。

## 实现插件逻辑（普通 Sidecar）

Sidecar 插件通过 stdio 与主进程进行基于 JSON-RPC 的通信。

1. **启动**: AIO Hub 启动 `executable` 中指定的可执行文件。
2. **请求**: AIO Hub 向子进程的 `stdin` 发送 JSON 请求。
3. **响应**: 插件处理请求，并将 JSON 响应写入其 `stdout`。

## 编译

你需要自行编译 Sidecar 插件，并将可执行文件放置在 `manifest.json` 中指定的路径。

## 持久型 Sidecar 插件 (Resident Mode)

对于需要长连接、低延迟、事件流或需要常驻后台运行的场景（如本地 OCR 引擎、自动化执行引擎），AIO Hub 支持**持久型 Sidecar 插件（Resident Mode）**。

### 声明常驻模式

在 `manifest.json` 的 `sidecar` 配置块中声明 `"resident": true`：

```json
{
  "id": "paddle-ocr",
  "type": "sidecar",
  "sidecar": {
    "executable": {
      "win32-x64": "bin/aiohub-paddle-ocr-windows-x64.exe"
    },
    "resident": true,
    "startupMethod": "healthCheck",
    "startupParams": {}
  }
}
```

- **`resident`**: 必须设为 `true`。
- **`startupMethod`** (可选): 进程启动后自动执行的健康检查或初始化方法。推荐使用 `healthCheck` / `warmup` 这类语义明确的方法，避免复用业务方法和空参数伪造检查。
- **`startupParams`** (可选): 初始化方法所需的参数。

### 进程生命周期

- **启动**: 当插件被启用（`enable`）时，主应用会自动启动常驻进程，并保持其 `stdin`、`stdout`、`stderr` 句柄。
- **退出**: 当插件被禁用（`disable`）或应用关闭时，主应用会向常驻进程的 `stdin` 发送 `shutdown` 指令。常驻进程应在收到指令后优雅退出，超时（默认 5 秒）未退出则会被主应用强制 kill。

### JSON-RPC 通信协议规范

常驻 Sidecar 进程通过 `stdin` 接收命令，并通过 `stdout` 输出响应或主动推送事件。

#### 前端 → Sidecar (命令格式)

```typescript
interface ResidentCommand {
  id: number; // 唯一请求 ID，用于匹配响应
  method: string; // 调用的方法名
  params: Record<string, unknown>; // 方法参数
}
```

#### Sidecar → 前端 (响应与事件格式)

所有输出必须是**单行 JSON**（JSON Lines 格式）：

```typescript
type SidecarOutput =
  | { id: number; type: "progress" | "result" | "error"; data: unknown }
  | { type: "event"; event: string; data: unknown };
```

**进度事件（带 id）**：

```json
{
  "id": 42,
  "type": "progress",
  "data": { "message": "正在识别 1/2", "percent": 50 }
}
```

**成功结果（带 id）**：

```json
{ "id": 42, "type": "result", "data": { "results": [...] } }
```

**错误事件（带 id）**：

```json
{ "id": 42, "type": "error", "data": "模型文件损坏" }
```

**主动推送事件（无 id）**：用于向前端实时推送状态变更、日志等。

```json
{
  "type": "event",
  "event": "status",
  "data": { "status": "running", "stepIndex": 4 }
}
```

## Sidecar 间中转协议 (Broker 模式)

当常驻 Sidecar A（如自动化引擎）需要调用常驻 Sidecar B（如 OCR 引擎）时，**不允许直接启动 B**，必须通过主应用进行中转。

### Sidecar A 发送中转请求（通过 stdout）

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

- **`type`**: 固定为 `"forward"`。
- **`id`**: 调用方侧的唯一 ID，用于匹配最终响应。
- **`target`**: 目标常驻 Sidecar 的插件 ID。
- **`method` / `params`**: 目标 Sidecar 的方法名和参数。

### 主应用转发并推回结果

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

## 统一临时文件管理规范

为了避免临时文件混乱，所有 Sidecar 插件应遵循主应用的统一临时文件规范：

- **临时目录**: `${appDataDir}/temp/aiohub-shared/`
- **文件命名**: `{sourceId}_{timestamp}_{uuid}.png`
- **自动清理**: 主应用启动时会自动扫描并删除超过 24 小时的残留临时文件。
- **优先路径**: 插件接口应优先支持 `path` 文件路径输入，以减少 base64 传输压力。

## 下一步

- 想了解通用的调用与配置方式？请参阅 [插件开发总览](./index.md)
- 想使用 Rust 实现 Sidecar？仓库提供了 [example-file-hasher](https://github.com/miaotouy/aiohub-plugin-example-file-hasher) 作为参考。
