# VCP 内置文件请求协议 (internal_request_file) 适配

本文档详细描述了 `vcp-connector` 模块中内置文件请求协议的实现细节、架构边界与安全考量。

## 1. 架构边界：超栈追踪与 FileOperator 的关系

当远端部署的 VCP 主服务器尝试调用本地 AIO Hub 去读取本机文件时，会触发 **超栈追踪 (Hyper-Stack-Trace)** 机制。此时，VCP 主服务器会通过 WebSocket 向 AIO Hub 发送一个 `internal_request_file` 内部工具调用请求。

为了确保跨节点文件读取能够完美对接，AIO Hub 必须严格按照 VCP 协议规范实现该内置工具。在适配该逻辑时，开发者必须明确以下架构边界，避免过度设计：

1. **超栈追踪不依赖完整的 `FileOperator` 插件**：
   - 超栈追踪的核心是主服务器端的 `FileFetcherServer` 拦截 `file://` URL，并通过 WebSocket 向源节点请求文件数据。
   - 源节点（AIO Hub）**只需要实现 `internal_request_file` 这个协议级内置工具**，能够根据传入的 `fileUrl` 读取本地文件并返回 Base64 即可。
   - **无需（也不应该）将 VCP 的 `FileOperator` 插件（包含 `WriteFile`, `DeleteFile`, `ApplyDiff` 等写操作）完整移植到 AIO Hub 中**。

2. **安全考量（最小特权原则）**：
   - 完整的 `FileOperator` 包含敏感的写操作和删除操作。如果将其完整暴露给远端 VCP，远端的 AI Agent 将拥有对用户本地文件系统的完全控制权，这会带来极大的安全隐患。
   - 通过仅实现 `internal_request_file` 只读接口，AIO Hub 能够完美支持 AI 跨节点读取上下文（如读取用户本地的截图、文档、日志等），同时将安全风险控制在最小范围内。

## 2. 入参规范

VCP 发送的请求数据结构如下：

```json
{
  "requestId": "req_unique_id_123",
  "toolName": "internal_request_file",
  "toolArgs": {
    "fileUrl": "file:///C:/Users/User/Desktop/image.png"
  }
}
```

- `fileUrl` (字符串, 必需): 必须是以 `file://` 开头的标准文件 URL。

## 3. 核心实现步骤与避坑指南

1. **协议与路径转换 (跨平台兼容)**
   - 接收到 `fileUrl` 后，必须将其安全地转换为本地绝对路径。
   - **避坑**：不要简单地使用字符串截取（如 `slice(7)`），这在 Windows 下会导致路径格式错误（例如多出或缺少斜杠，或者无法处理 `%20` 等 URL 编码空间）。
   - **推荐做法**：在前端/Tauri 侧，使用标准 URL 解析库进行转换：
     ```typescript
     // 跨平台安全转换 file:// URL 为本地绝对路径
     function fileUrlToPath(fileUrl: string): string {
       const url = new URL(fileUrl);
       // 在 Windows 下，url.pathname 可能是 "/C:/Users/..."，需要去掉开头的斜杠
       let decodedPath = decodeURIComponent(url.pathname);
       if (process.platform === "win32" && decodedPath.startsWith("/")) {
         decodedPath = decodedPath.slice(1);
       }
       // 替换斜杠为平台特定的路径分隔符
       return decodedPath.replace(/\//g, path.sep);
     }
     ```

2. **安全沙箱校验 (防拖取敏感文件)**
   - 由于 AIO Hub 运行 in 用户本地，拥有本地文件系统的读写权限，而 VCP 主服务器可能部署在公网。
   - **安全防线**：必须对解析后的本地路径进行安全校验！严禁读取系统敏感目录（如 `.ssh`、浏览器数据、系统配置等）。建议只允许读取用户选择的白名单目录，或者在读取前弹出用户确认。

3. **文件读取与 Base64 编码**
   - 使用 Tauri API（如 `read_file_as_base64`）或 Node.js `fs.promises.readFile` 读取文件。
   - **避坑**：返回的 Base64 必须是**纯净的 Base64 编码字符串**，**绝对不能**带有 Data URI 前缀（如 `data:image/png;base64,`）。前缀的添加和解析由 VCP 主服务器的 `FileFetcherServer` 统一处理，节点端只负责传输纯净数据。

4. **MIME 类型探测**
   - 使用 Tauri API 或 `mime-types` 库，根据文件扩展名探测 MIME 类型。如果无法探测，必须返回默认值 `application/octet-stream`。

5. **响应数据结构对齐 (最关键的对接点)**
   - **致命陷阱**：VCP 主服务器的 `FileFetcherServer` 在接收到响应后，会严格校验 `result.status === 'success'` 和 `result.fileData`。如果 AIO Hub 返回的结构不一致，会导致远端解析失败。
   - **标准响应格式**：
     ```json
     {
       "type": "tool_result",
       "data": {
         "requestId": "req_unique_id_123",
         "status": "success",
         "result": {
           "status": "success", // 🌟 必须有这个嵌套的 status 字段！
           "fileData": "iVBORw0KGgoAAAANSUhEUg...", // 🌟 纯净的 Base64 字符串
           "mimeType": "image/png" // 🌟 探测到的 MIME 类型
         }
       }
     }
     ```

## 4. TypeScript / Tauri 标准实现范例

以下是在 [`vcpNodeProtocol.ts:269`](../services/vcpNodeProtocol.ts) 中处理 `internal_request_file` 的标准实现代码：

```typescript
import { invoke } from "@tauri-apps/api/core";
import * as path from "path";

async function handleInternalRequestFile(
  requestId: string,
  toolArgs: any
): Promise<void> {
  const { fileUrl } = toolArgs;

  if (!fileUrl || !fileUrl.startsWith("file://")) {
    throw new Error(
      "Invalid or missing fileUrl parameter for internal_request_file."
    );
  }

  try {
    // 1. 跨平台路径转换
    const url = new URL(fileUrl);
    let filePath = decodeURIComponent(url.pathname);
    // Windows 路径特殊处理
    const isWindows = await invoke<boolean>("is_windows_platform"); // 假设有此 Tauri 命令，或通过 window.__TAURI__ 判断
    if (isWindows && filePath.startsWith("/")) {
      filePath = filePath.slice(1);
    }
    // 转换为平台特定的路径分隔符
    const normalizedPath = isWindows ? filePath.replace(/\//g, "\\") : filePath;

    // 2. 安全校验 (示例：限制在允许的目录下)
    const isAllowed = await checkPathSafety(normalizedPath);
    if (!isAllowed) {
      throw new Error(
        `Access denied: Path '${normalizedPath}' is not in allowed directories.`
      );
    }

    // 3. 调用 Tauri 命令读取文件为 Base64
    // 对应 Tauri 后端：fs::read (或自定义的 read_file_as_base64)
    const fileData = await invoke<string>("read_file_as_base64", {
      path: normalizedPath,
    });

    // 4. 探测 MIME 类型
    const mimeType =
      (await invoke<string>("get_file_mime_type", { path: normalizedPath })) ||
      "application/octet-stream";

    // 5. 严格对齐 VCP 协议回传结果
    this.sendJson({
      type: "tool_result",
      data: {
        requestId,
        status: "success",
        result: {
          status: "success", // 🌟 必须嵌套 status: 'success'
          fileData, // 🌟 纯净的 Base64 数据
          mimeType, // 🌟 MIME 类型
        },
      },
    });

    console.log(
      `[VcpNodeProtocol] Successfully sent file ${normalizedPath} to VCP server.`
    );
  } catch (error: any) {
    console.error(
      `[VcpNodeProtocol] Failed to handle internal_request_file:`,
      error.message
    );

    // 失败时回传错误信息
    this.sendJson({
      type: "tool_result",
      data: {
        requestId,
        status: "error",
        error: error.message || "Failed to read local file.",
      },
    });
  }
}
```
