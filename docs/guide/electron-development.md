# Electron 桌面开发

> 当前阶段：基础宿主接入，2026-11-03。Tauri 开发与发布入口继续保留。

## 启动与构建

使用根目录依赖与 Bun：

```powershell
bun install
bun run electron:dev
```

首次启动会按锁定版本下载 Electron。网络环境要求代理时，可为本次终端设置 `HTTP_PROXY`、`HTTPS_PROXY` 和 `ELECTRON_GET_USE_PROXY=1`，然后重试；代理地址按本机环境配置。

开发前端绑定 `127.0.0.1:1430`，HMR 使用相邻端口，Vue 源码支持热更新。修改主进程或 preload 后重新启动该命令。端口被占用时通过 `bun run electron:dev -- --port 1450` 指定其他端口，或设置 `AIO_ELECTRON_PORT`。关闭 Electron 进程或按 Ctrl+C 后，启动器释放自己启动的前端服务。

```powershell
bun run check:electron
bun run test:electron
bun run electron:build
bun run electron:preview
```

构建在 `dist-electron/` 生成主进程、沙箱 preload、现有 Vue 前端产物、图标与运行清单；版本读取根 `package.json`。预览直接加载该目录，使用 `aiohub://app/` 协议，覆盖深层路由刷新与绝对资源路径。此阶段交付可运行目录，安装器和应用内更新随发布阶段接续。

## 数据目录

开发和本地预览默认使用 `.dev-data/electron/user-data/`，与 Tauri 开发数据分开。设置 `AIO_DATA_DIR` 可使用指定的绝对目录，多实例同时指定独立目录和端口。后续安装版在没有该变量时使用 Electron 的平台用户数据目录。

桌面业务继续通过 `getAppConfigDir()` 取根目录。现有 `createConfigManager`、LLM 混淆存储和请求记录存储在 Electron 下使用文件持久化。窗口位置保存在根目录的 `electron-windows.json`，应用日志位于 `logs/`。迁移期间使用独立数据副本验证，待完整后端契约就绪后再安排正式数据迁移。

## 已接入能力

- 完整现有工作台、工具注册与路由，Chromium 原生标题栏拖动区域。
- 无边框主窗口、工具窗口创建/聚焦/关闭、窗口事件、尺寸与位置保存恢复；主窗口隐藏后可从托盘恢复。
- 命令分发、定向事件与解绑、Vue 响应式参数序列化、二进制 IPC、结构化错误。
- UTF-8/二进制文件读写、目录项、基础文件操作、应用路径、文本剪贴板、打开/保存对话框与外部链接。
- 本地 `asset://local/` 资源协议：按窗口授权精确文件路径，验证随机令牌和真实路径，窗口关闭时释放授权。
- 应用名称/版本、操作系统信息、启动参数中的 Deep Link 和 macOS `open-url` 事件。系统协议注册与单实例唤醒随安装阶段接续。

## 后续能力

原生 HTTP/SSE、Channel、文件监听、Shell/Sidecar、更新器，以及知识库、技能扫描、搜索、FFmpeg、系统监控等 Rust 命令仍按迁移总纲分阶段接入。此类调用返回 `CAPABILITY_UNAVAILABLE`；已有工具的启动钩子可能在首页初始化时提示暂未支持。普通前端工具可直接使用，依赖这些后端能力的工作流继续从 Tauri 入口执行。

外部文件拖放的精确落点与目标工具导入、拖拽预览固化、窗口吸附、嵌入式 WebView、跨平台窗口材质、原生文件选择对话框的完整交互、安装器与自动更新仍需专项接续。

## 宿主边界

主进程位于 `electron/`，渲染适配器位于 `src/platform/electron/`。业务仍访问 `src/platform/native/` 或语义门面；兼容入口按 preload 标记选择实现，Tauri 运行时沿用原 SDK。

preload 使用 `contextIsolation: true`、`sandbox: true`、`nodeIntegration: false`。仅公开固定 IPC 协议，事件回调接收业务包络；主进程验证所属窗口、顶层 frame 和来源，按显式操作分派。子 frame 沿用沙箱，页面导航留在应用来源，外部链接只允许 HTTP、HTTPS 和邮件协议。生产 HTML 的内联导入映射与兼容性引导通过内容哈希授权。

这仍是拥有桌面文件能力的可信应用渲染器。新引入的远程内容和不可信插件需要单独的权限模型，不能获得该 preload。

真实运行验证可使用 Playwright 的 Electron 启动能力配合独立 `AIO_DATA_DIR`，观察主进程与渲染窗口；项目现有 Dev Control 发现/握手目前依赖 Tauri，Electron 发现适配列入后续工作。

详见[平台架构](../architecture/platform-bridge-architecture.md)和[迁移总纲](../Plan/electron-migration-master-plan.md)。

## 本轮验证记录

2026-11-03 在 Windows 的真实 Electron 45.2.1 中检查了开发态与生产协议：工作台初始化、文本差异对比的 Monaco 编辑器、深层路由刷新、窗口最大化/恢复、工具窗口创建/销毁、事件包络、二进制文件往返、本地资源读取与无效令牌拒绝、子框架的 preload 隔离，以及配置重载与进程重启后读取。

相关检查包括前端/主进程类型检查、平台隔离检查、Vite 生产构建和 71 项相关测试。原生文件对话框的完整人工交互、物理文件拖放和 macOS/Linux 运行态验收随对应能力接续。
