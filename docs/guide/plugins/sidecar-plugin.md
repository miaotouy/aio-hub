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
      "win32-x64": "dev-bin/win32-x64/file-hasher.exe",
      "darwin-x64": "dev-bin/darwin-x64/file-hasher",
      "linux-x64": "dev-bin/linux-x64/file-hasher"
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

`target/debug` 只表示 Cargo 为当前宿主平台生成的默认缓存目录；显式使用 `--target` 时产物位于 `target/<target-triple>/debug`。不要让 manifest 直接依赖这两种缓存布局。构建脚本应将二进制复制到 `dev-bin/<platform>/` 等稳定开发路径，发布时再复制到 ZIP 内的 `bin/` 并生成对应 manifest。

### 方法声明

Sidecar 插件同样需要在 `manifest.json` 的 `methods` 数组中声明可调用方法。

## 实现插件逻辑（普通 Sidecar）

Sidecar 插件通过 stdio 与主进程进行基于 JSON-RPC 的通信。

1. **启动**: AIO Hub 启动 `executable` 中指定的可执行文件。
2. **请求**: AIO Hub 向子进程的 `stdin` 发送 JSON 请求。
3. **响应**: 插件处理请求，并将 JSON 响应写入其 `stdout`。

API v3 普通 Sidecar 每次调用都会启动新进程，因此每个请求都必须校验宿主注入的顶层 `hostContext`：

```json
{
  "method": "calculateHash",
  "params": { "path": "example.bin" },
  "hostContext": {
    "pluginApiVersion": 3,
    "sidecarProtocolVersion": 3
  }
}
```

`hostContext` 由运行时生成，不读取或透传 manifest 中的同名配置。API v2 普通 Sidecar 不要求该字段。

## 编译

你需要通过插件构建脚本编译 Sidecar，并将可执行文件部署到 `manifest.json` 当前平台键指定的路径。验证必须针对该路径实际启动一次，不能只检查 Cargo 编译成功。

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

API v3 宿主会在首次启动请求的 `params` 中覆盖注入 `hostContext.pluginApiVersion` 和 `hostContext.sidecarProtocolVersion`。插件不能信任 manifest 自己声明的同名字段；每个新进程的首次启动检查必须验证宿主注入值，完成后普通业务调用不要求重复携带该字段。

### 进程生命周期

- **启动**: 当插件被启用（`enable`）时，主应用会自动启动常驻进程，并保持其 `stdin`、`stdout`、`stderr` 句柄。
- **退出**: 当插件被禁用（`disable`）或应用关闭时，主应用会向常驻进程的 `stdin` 发送 `shutdown` 指令。常驻进程应在收到指令后优雅退出，超时（默认 5 秒）未退出则会被主应用强制 kill。
- **命令超时恢复**: request 模式单条常驻命令默认最多等待 300 秒。API v3 长任务应使用 job 模式，以合法进度刷新无进度超时；取消宽限期结束仍无终态时才重启 sidecar。
- **进程代际**: 每次 spawn 都生成 `generationId`。pending request、stdout reader 和前端事件只属于该代际，旧进程的迟到输出不能完成新进程请求。

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

`progress` 是非终态消息，不会完成或移除对应的 pending 请求；只有同一 `id` 的 `result` 或 `error` 会结束本次命令。需要跨窗口或业务级关联部分结果时，可在无 `id` 的自定义事件 `data` 中携带调用方生成的流标识。

### API v3 长任务

长任务的提交命令应立即以 `result` 返回 `{ accepted: true, jobId }`。实际完成、失败和取消通过无请求 ID 的命名事件报告，所有事件必须携带同一 `jobId`。宿主取消后必须等待取消终态或确认 sidecar 已重启，才能释放任务使用的临时文件。

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
  "target": "example-file-hasher",
  "method": "hashFile",
  "params": {
    "path": "C:/Temp/example.bin"
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
