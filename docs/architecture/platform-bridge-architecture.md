# 桌面平台隔离层

更新日期：2026-11-03

## 职责与调用路径

桌面端的宿主 SDK、系统事件、资源协议和浏览器宿主能力集中在 `src/platform/`。本轮保留当前 Tauri 运行方式，为后续替换 Electron 适配实现提供集中入口。

```text
组件 / composable / service / 工具
  ├─ platform/core + platform/modules：已有语义化门面
  ├─ platform/native：现有 SDK 契约兼容入口
  └─ platform/browser：浏览器剪贴板、弹窗兼容入口
       ↓
     宿主 SDK / Web API
```

`src/platform/native/` 中的兼容入口保留原包的函数签名、类型、类实例、同步/异步行为和原始错误。业务导入路径已改到该目录，未来可按能力替换内部实现。兼容入口当前仍使用 Tauri 的对象模型；Electron 的窗口类、Channel、文件监听和更新对象需要在后续适配阶段实现等价契约。

## 能力清单

| 能力                           | 隔离入口                                                                           | 迁移时需保留的契约                                                            |
| ------------------------------ | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| IPC 与二进制通道               | `native/core.ts`                                                                   | `invoke` 泛型、二进制入参、第三个请求选项、原始拒绝值、Channel、资源 URL 转换 |
| 事件                           | `native/events.ts`                                                                 | `event` / `id` / `payload` 包络、监听目标、`emitTo`、解绑函数                 |
| 窗口 / WebView / DPI           | `native/window.ts`、`native/webview.ts`、`native/webview-window.ts`、`native/geometry.ts`                     | 当前窗口、窗口创建与查找、几何类型、关闭/尺寸/拖放事件                        |
| 文件与路径                     | `native/fs.ts`、`native/path.ts`、`native/sdk.ts`                                  | 二进制读写、目录项、文件监听清理、路径基目录与资源解析                        |
| 对话框 / 剪贴板 / 外部打开     | `native/dialog.ts`、`native/clipboard.ts`、`native/opener.ts`              | 选择结果与取消、原始权限错误、图片剪贴板、默认应用与文件管理器定位            |
| 应用与操作系统                 | `native/app.ts`、`native/os.ts`、`modules/system.ts`                               | 名称、版本、平台、架构、语言及平台能力可用性                                  |
| 进程 / Shell / 更新 / 协议唤醒 | `native/process.ts`、`native/shell.ts`、`native/updater.ts`、`native/deep-link.ts` | 生命周期、子进程/sidecar、更新进度与对象释放、启动 URL 与后续唤醒             |
| 原生 HTTP                      | `native/http.ts`                                                                   | fetch 的请求选项、响应流、取消及当前宿主网络行为                              |
| 浏览器宿主                     | `browser/index.ts`                                                                 | 剪贴板方法绑定、富文本/图片条目、用户激活与权限异常、弹窗返回句柄             |
| 本地资源与媒体                 | `modules/assets.ts`、`modules/media.ts`                                            | 资源 URL、预览 CSP 来源、字幕字体地址、Linux 媒体授权申请与释放               |

桌面应用持久化根目录继续经 `src/utils/appPath.ts` 的 `getAppConfigDir()` 解析，以保留便携模式。`src/utils/mediaSource.ts`、`src/utils/nativeDesktopCapabilities.ts` 保留转发入口，原实现分别移至平台的 `media`、`system` 模块。

## 语义化门面与兼容入口

- `core/bridge.ts` 继续提供现有的 `invoke`、`listen`、`emit`。这里的事件回调接收 payload，异常会包装成 `PlatformError`。
- `native/core.ts` 与 `native/events.ts` 保留 SDK 兼容语义：事件回调接收完整包络，命令拒绝值保持原样。已有调用迁入时沿用这一契约，避免错误处理、IPC 通道和日志写入行为变化。
- 日志模块通过兼容 IPC 入口落盘，避免桥接层记录自身失败时递归进入日志网关。
- `modules/window.ts` 的 `onWindowDestroyed` 隔离宿主窗口销毁事件名，输出 `label` / `windowLabel`；分离窗口管理器据此恢复主窗口状态。`onFileDropPaths` 集中现有应用拖放事件名与路径载荷。
- `core/env.ts` 集中处理运行时探测。缓存运行时用于现有门面；`hasTauriRuntimeMarker()` 为惰性存储及显式注入宿主的测试保留直接检测能力。
- 浏览器兼容入口保留弹窗句柄，供 PDF 打印预览等场景继续使用。外部链接已有的 `openExternalUrl` 门面保持独立。

## 维护与验证

新增或变更桌面宿主能力时，先在隔离层定义入口。`@tauri-apps/*` 的直接导入限于 `src/platform/native/`；业务层的浏览器剪贴板、弹窗和宿主全局标记同样通过平台入口访问。根 `check` 和 `check:ci` 均调用 `check:platform-isolation`。

该检查通过 TypeScript AST 与 Vue SFC script 解析静态/动态/类型导入、重导出和测试 mock，并保留模板示例与依赖清单字符串。平台兼容测试保护 IPC 的二进制/选项/错误、事件包络和解绑、浏览器权限与弹窗句柄；媒体租约和草稿存储沿用相关行为测试。

## Electron 适配接续

1. 按上述清单提供 preload 的受控能力实现，适配窗口对象、事件目标、二进制通道与文件监听清理。
2. 统一剪贴板权限与可行动错误；保留兼容入口的拒绝语义，调用方迁入新语义门面时同步调整。
3. 为 `onWindowDestroyed`、媒体租约、资源来源与字幕字体提供 Electron 实现。
4. 标题栏的 `data-tauri-drag-region` 当前保留，随 Electron 窗口拖拽区域适配一起处理。该声明属于宿主窗口集成，现阶段不改变其运行行为。

实施进度见[平台隔离层计划](../Plan/frontend-platform-bridge-isolation-plan.md)。
