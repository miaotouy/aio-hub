# 前端平台隔离层与 Electron 迁移准备

> 状态：桌面宿主调用已集中到 `src/platform/`；Electron 适配待实施。
>
> 更新日期：2026-11-03
>
> 上级规划：[Electron 迁移主计划](./electron-migration-master-plan.md)
>
> 当前契约：[桌面平台隔离层](../architecture/platform-bridge-architecture.md)

> 后续进展（2026-11-03）：Electron 基础宿主已接入，当前运行方式和剩余能力见[Electron 桌面开发](../guide/electron-development.md)。以下阶段零记录保留原始 Tauri 契约收拢范围。

## 1. 本轮范围与实现

为 Electron 迁移提供集中替换入口，沿用当前 Tauri 运行行为。桌面端 `src/` 的直接 SDK 导入、动态导入、类型引用和测试 mock 已迁入平台入口；移动端沿用独立工程安排。

| 范围                                          | 实现入口                                                                                                                              | 处理方式                                                            |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| IPC、Channel、资源 URL、事件                  | `native/core.ts`、`native/events.ts`                                                                                                  | 保留原始参数、返回值、错误与完整事件包络                            |
| 窗口、WebView、几何类型                       | `native/window.ts`、`native/webview.ts`、`native/webview-window.ts`、`native/geometry.ts`                                             | 集中 SDK 对象模型；销毁事件通过 `modules/window.ts` 提供语义入口    |
| 文件、路径、对话框、剪贴板、外部打开          | `native/fs.ts`、`native/path.ts`、`native/sdk.ts`、`native/dialog.ts`、`native/clipboard.ts`、`native/opener.ts`                      | 保留既有调用契约，应用持久化根目录继续通过 `getAppConfigDir()` 解析 |
| 应用、系统、HTTP、进程、Shell、更新、协议唤醒 | `native/app.ts`、`native/os.ts`、`native/http.ts`、`native/process.ts`、`native/shell.ts`、`native/updater.ts`、`native/deep-link.ts` | 通过能力命名的入口集中访问                                          |
| 浏览器剪贴板、弹窗                            | `browser/index.ts`                                                                                                                    | 保留权限异常、方法绑定与弹窗句柄                                    |
| 宿主检测、资源协议、字幕字体、媒体租约        | `core/env.ts`、`modules/assets.ts`、`modules/media.ts`                                                                                | 集中宿主标记、CSP 来源、资源转换与原生媒体授权实现                  |
| 原生桌面能力可用性                            | `modules/system.ts`                                                                                                                   | 原工具路径保留转发入口                                              |

以上路径均相对于 `src/platform/`。

`native/` 当前以 SDK 转发实现兼容，提供稳定的业务导入位置。Electron 阶段仍需逐项实现这些契约，尤其是窗口对象、Channel、文件监听、更新资源释放与事件目标。

## 2. 与原方案的实施调整

原方案提出把所有调用迁入带日志、类型字典和统一异常处理的 `core/bridge.ts`。本轮采用兼容入口优先：

- 既有业务继续使用 SDK 的完整事件包络与原始拒绝值，二进制参数和第三个 IPC 选项保持透传。
- 已有语义化 `core/bridge.ts` 及 `modules/` 门面继续服务现有调用方。其 payload 事件回调、`PlatformError` 包装属于独立契约。
- 日志落盘走兼容 IPC，避免桥接层记录自身错误时递归调用日志网关。
- `CommandMap` 保留现有覆盖范围；全命令类型化另行按领域推进。
- 使用 TypeScript AST 与 Vue SFC 解析检查边界，接入 `check`、`check:ci`。检查覆盖导入、重导出、动态/类型导入、mock，以及业务代码的剪贴板、弹窗和宿主标记访问。

这次调整将导入路径收拢与业务行为变更分开实施，缩小迁移阶段的回归范围。

## 3. 验证记录

验证日期：2026-11-03。

| 验证                                | 结果                                                                                                           |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `bun run check:frontend`            | 通过                                                                                                           |
| `bun run check:platform-isolation`  | 通过，SDK 直接导入集中于 `src/platform/native/`                                                                |
| `bun run check:tauri-commands`      | 通过，命令名与参数键匹配当前 Rust 注册                                                                         |
| 平台与媒体相关定向测试              | 7 个文件、29 项通过                                                                                            |
| `bun run build:vite`                | 通过，保留已有 eval 与包体积警告                                                                               |
| `bun run lint`                      | 通过，保留已有警告                                                                                             |
| 全量桌面 `src` 测试（排除临时快照） | 391 个文件通过、3 个文件失败；2775 项通过、3 项失败、1 项跳过                                                  |
| 真实 Tauri 运行态                   | UTF-8/二进制文件读写、事件定向发送与包络、最大化/还原、窗口配置保存、字幕字体 URL 均通过；文本差异页面正常挂载 |

全量测试命令为 `bun run test:run -- src --exclude '**/.tmp/**'`。3 项失败均在未修改的 HEAD 快照复现：

- `skill-manager.proxy.test.ts`：运行时说明文案的预期与实现不同。
- `web-canvas.test.ts`：内存预览内容预期为原文本，实际返回带 HTML 结构的内容。
- `RichTextRenderer.lifecycle.test.ts`：原始批次内容的首尾空白与 CRLF 预期不同。

这些既有问题保持原样。原生文件选择对话框及各工具完整流程随对应功能适配继续走查。平台测试保护二进制参数、IPC 选项、原始错误、事件包络/目标/解绑、浏览器剪贴板及弹窗句柄、资源 URL 和窗口销毁/文件拖放载荷；相关媒体、存储、日志与路径测试沿用现有行为契约。

## 4. Electron 接续工作

1. 建立最小 Electron 主进程与受控 preload，加载当前前端。
2. 按能力实现 `native/` 内部适配，保留 IPC 参数、原始错误、事件包络及窗口生命周期契约。
3. 实现二进制 Channel、文件监听清理、Shell/sidecar、更新对象释放、协议唤醒和多窗口通信。
4. 为本地资源、字幕字体、媒体授权提供 Electron 实现；随窗口适配调整标题栏 `data-tauri-drag-region`。
5. 明确统一剪贴板权限与失败反馈。既有语义门面的浏览器 fallback 仍保留吞写入错误、读取失败返回空文本的历史行为；调整时同步迁移调用方。
6. 按领域扩充命令类型映射，逐步迁入语义门面；以公开行为测试与真实窗口验证覆盖相应风险。

架构与维护入口见[桌面平台隔离层](../architecture/platform-bridge-architecture.md)，后续工程排期见[Electron 迁移主计划](./electron-migration-master-plan.md)。
