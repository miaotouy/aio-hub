# 桌面平台隔离层

更新日期：2026-11-04

## 职责与调用路径

桌面端的宿主 SDK、系统事件、资源协议和浏览器宿主能力集中在 `src/platform/`。Tauri 与 Electron 通过同一组业务入口运行。Electron 主进程与 preload 位于根目录 `electron/`，开发与预览入口见[Electron 桌面开发](../guide/electron-development.md)。

```text
组件 / composable / service / 工具
  ├─ platform/core + platform/modules：已有语义化门面
  ├─ platform/native：现有 SDK 契约兼容入口
  └─ platform/browser：浏览器剪贴板、弹窗兼容入口
       ↓
     ├─ Tauri SDK / Web API
     └─ platform/electron → 受控 preload → Electron 主进程
```

`src/platform/native/` 保留现有公开类型，并根据 preload 标记选择实现。Tauri 分支沿用 SDK 原函数；Electron 分支实现已迁移能力，待迁移能力显式返回 `CAPABILITY_UNAVAILABLE`。窗口对象的当前适配范围为基础窗口管理；Channel、文件监听、更新对象等按后续阶段补齐。

## 业务能力与启动分层

`core/capabilities.ts` 按当前宿主和操作系统返回业务能力状态：`available`、`reasonCode` 和可展示的 `reason`。当前覆盖后台 JavaScript 运行时、系统代码格式化、窗口自动化、屏幕监控及外部播放器覆盖层；`modules/system.ts` 的既有布尔入口复用这些状态。宿主类型与 OS 信息各自保留原语义。

后台运行时启动前检查能力；显式调用通过 `requireHostCapability()` 返回 `CAPABILITY_UNAVAILABLE`，连接失败时释放已建立的事件订阅。界面用原因字段说明当前限制，并保留编辑、导出或前端处理入口。后续迁移某项业务后端时同步更新其能力定义及相关调用。

## 能力清单

| 能力                           | 隔离入口                                                                                  | 迁移时需保留的契约                                                            |
| ------------------------------ | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| IPC 与二进制通道               | `native/core.ts`                                                                          | `invoke` 泛型、二进制入参、第三个请求选项、原始拒绝值、Channel、资源 URL 转换 |
| 事件                           | `native/events.ts`                                                                        | `event` / `id` / `payload` 包络、监听目标、`emitTo`、解绑函数                 |
| 窗口 / WebView / DPI           | `native/window.ts`、`native/webview.ts`、`native/webview-window.ts`、`native/geometry.ts` | 当前窗口、窗口创建与查找、几何类型、关闭/尺寸/拖放事件                        |
| 文件与路径                     | `native/fs.ts`、`native/path.ts`、`native/sdk.ts`                                         | 二进制读写、目录项、文件监听清理、路径基目录与资源解析                        |
| 对话框 / 剪贴板 / 外部打开     | `native/dialog.ts`、`native/clipboard.ts`、`native/opener.ts`                             | 选择结果与取消、原始权限错误、图片剪贴板、默认应用与文件管理器定位            |
| 应用与操作系统                 | `native/app.ts`、`native/os.ts`、`modules/system.ts`                                      | 名称、版本、平台、架构、语言及平台能力可用性                                  |
| 进程 / Shell / 更新 / 协议唤醒 | `native/process.ts`、`native/shell.ts`、`native/updater.ts`、`native/deep-link.ts`        | 生命周期、子进程/sidecar、更新进度与对象释放、启动 URL 与后续唤醒             |
| 原生 HTTP                      | `native/http.ts`                                                                          | fetch 的请求选项、响应流、取消及当前宿主网络行为                              |
| 浏览器宿主                     | `browser/index.ts`                                                                        | 剪贴板方法绑定、富文本/图片条目、用户激活与权限异常、弹窗返回句柄             |
| 本地资源与媒体                 | `modules/assets.ts`、`modules/media.ts`                                                   | 资源 URL、预览 CSP 来源、字幕字体地址、Linux 媒体授权申请与释放               |

桌面应用持久化根目录继续经 `src/utils/appPath.ts` 的 `getAppConfigDir()` 解析，以保留便携模式。`src/utils/mediaSource.ts`、`src/utils/nativeDesktopCapabilities.ts` 保留转发入口，原实现分别移至平台的 `media`、`system` 模块。

## 语义化门面与兼容入口

- `core/bridge.ts` 继续提供现有的 `invoke`、`listen`、`emit`。这里的事件回调接收 payload，异常会包装成 `PlatformError`。
- `native/core.ts` 与 `native/events.ts` 保留 SDK 兼容语义：事件回调接收完整包络，命令拒绝值保持原样。已有调用迁入时沿用这一契约，避免错误处理、IPC 通道和日志写入行为变化。
- 日志模块通过兼容 IPC 入口落盘，避免桥接层记录自身失败时递归进入日志网关。
- `modules/window.ts` 的 `onWindowDestroyed` 隔离宿主窗口销毁事件名，输出 `label` / `windowLabel`；分离窗口管理器据此恢复主窗口状态。`onFileDropPaths` 集中现有应用拖放事件名与路径载荷。
- `core/env.ts` 集中处理运行时探测。缓存运行时用于现有门面；`hasTauriRuntimeMarker()` 保留 Tauri 专用检测；`hasNativeRuntimeMarker()` 为 Electron/Tauri 持久化与显式注入宿主的测试提供直接检测能力。
- 浏览器兼容入口保留弹窗句柄，供 PDF 打印预览等场景继续使用。外部链接已有的 `openExternalUrl` 门面保持独立。

## 维护与验证

新增或变更桌面宿主能力时，先在隔离层定义入口。`@tauri-apps/*` 的直接导入限于 `src/platform/native/`；业务层的浏览器剪贴板、弹窗和宿主全局标记同样通过平台入口访问。根 `check` 和 `check:ci` 均调用 `check:platform-isolation`。

该检查通过 TypeScript AST 与 Vue SFC script 解析静态/动态/类型导入、重导出和测试 mock，并保留模板示例与依赖清单字符串。平台兼容测试保护 IPC 的二进制/选项/错误、事件包络和解绑、浏览器权限与弹窗句柄；媒体租约和草稿存储沿用相关行为测试。

## Electron 运行链路

- `electron/shared.ts` 定义固定请求/事件协议和结果包络。主进程校验窗口、主 frame 和来源后按显式操作分派；preload 过滤原始 Electron 事件对象，向渲染器返回可序列化结果。
- `src/platform/electron/client.ts` 将 Vue 响应式对象转换为普通数据，保留字节数组，拒绝循环引用；在渲染器重建错误并保留 `code` 与能力标识，避免 contextBridge 丢失 Error 附加字段。
- `events.ts` 维护每个订阅的 ID，保留事件包络、定向目标与幂等解绑；窗口刷新和关闭时主进程清理该页面的订阅。窗口销毁通知全局发布，既有分离窗口管理器继续恢复主窗口状态。
- `window.ts` 提供当前窗口、基础控制、创建与查找、事件和关闭请求；Chromium 的原生拖动区域复用现有标题栏声明。自定义缩放由 `platform/electron/window-resize.ts` 捕获指针、合并并串行提交移动；`electron/window-resize.ts` 按窗口归属维护八方向会话、约束与对边锚点，并在结束或宿主生命周期清理时恢复原始 resizable。共享 `modules/window.ts` 为 Tauri 提供 finally 恢复。
- 本地生产资源使用 `aiohub://app/`，支持绝对资源路径与深层路由；HTML 内联脚本按归一化换行后的内容生成 CSP 哈希。本地文件使用带窗口令牌与精确授权的 `asset://local/`，真实路径变化会拒绝读取。
- 语义化门面统一使用 `isNativeRuntime()`；配置、LLM 混淆文件和请求记录使用 `hasNativeRuntimeMarker()`，Electron 数据默认与 Tauri 分开。

### 桌面工作区与项目预览（2026-11-04）

- `electron/desktop-controls.ts` 管理托盘实例、主窗口隐藏/关闭策略和待发送的设置导航；设置持久化继续由应用配置管理器完成。主进程退出等待技能任务与窗口配置队列收尾。
- `electron/workspace-windows.ts` 管理归属到创建窗口的分离会话；预览与固化状态分开，页面离开和超时清理临时窗口。Canvas 窗口使用独立注册表和事件，保留领域标识。
- `electron/window-monitor.ts` 将 Electron 的 DIP 显示器矩形转换为共享物理像素契约，工作区返回 position/size。窗口同步总线在广播时由操作所有者回复，避免第三个窗口的无处理器响应覆盖成功结果；定向请求保留错误响应。
- `modules/html-preview.ts` 选择 Electron 独立预览来源或 Tauri srcdoc。`electron/canvas-preview.ts` 将随机句柄绑定到所属窗口及单个 Canvas 项目，资源访问同时校验逻辑路径和真实路径。导航、渲染进程退出与销毁撤销授权。
- Canvas iframe 保留 allow-scripts 沙箱。主应用 CSP 允许预览 frame，独立来源的 CSP 承接项目脚本；预览 frame 无宿主 preload，保持与主页面的来源和宿主权限隔离。

### 原生网络（2026-11-04）

`native/http.ts` 在 Electron 下调用 `platform/electron/http.ts`；请求头和已编码请求体经固定 `http.start` 操作发送。`electron/http.ts` 按 `webContents.id` 管理请求，`http.read` 按需返回至多 64 KiB，`http.cancel` 幂等释放。窗口刷新、渲染进程退出和销毁统一清理所属请求，同文档路由保持连接。

底层 `electron/chromium-fetch.ts` 使用 `net.request` 和 Node/Web 流适配，复用系统代理并从重定向事件取得 3xx 响应；通用传输层逐跳验证 HTTP/HTTPS 地址、限制次数、处理方法转换并移除跨源认证头。响应保留 HTTP 状态、头部、最终 URL 和跳转标记；前端暴露 `Response` 与取消信号。默认网络凭证与浏览器会话隔离。

兼容选项 `connectTimeout` 覆盖直到最终响应头的阶段；正文超时由消费者管理。上传先编码为字节数组，逐请求代理、危险 TLS 和完整性校验按显式能力边界报错。LLM 专用代理与 Channel 的契约继续独立迁移。

通用 Channel、完整文件监听、Shell/Sidecar、更新器与 Rust 专项命令继续按[迁移总纲](../Plan/electron-migration-master-plan.md)实施。Electron 开发指南维护当前能力范围与验证方式。
