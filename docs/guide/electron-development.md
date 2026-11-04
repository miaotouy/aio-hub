# Electron 桌面开发

> 当前阶段：基础宿主、本地分发、单实例与基础原生网络已接入，2026-11-04。Tauri 开发与发布入口继续保留。

## 启动与构建

使用根目录依赖与 Bun：

```powershell
bun install
bun run electron:dev
```

首次启动会按锁定版本下载 Electron。网络环境要求代理时，可为本次终端设置 `HTTP_PROXY`、`HTTPS_PROXY` 和 `ELECTRON_GET_USE_PROXY=1`，然后重试；代理地址按本机环境配置。

开发前端绑定 `127.0.0.1:1430`，HMR 使用相邻端口，Vue 源码支持热更新。修改主进程或 preload 后重新启动该命令。端口被占用时通过 `bun run electron:dev -- --port 1450` 指定其他端口，或设置 `AIO_ELECTRON_PORT`。关闭 Electron 进程或按 Ctrl+C 后，启动器释放自己启动的前端服务。开发态窗口与托盘复用项目开发版图标，托盘提示为“AIO Hub（开发）”；生产构建和预览沿用正式图标。

```powershell
bun run check:electron
bun run test:electron
bun run electron:build
bun run electron:preview
```

构建先执行主进程和前端类型检查、准备前端库，再在 `dist-electron/` 生成主进程、沙箱 preload、现有 Vue 前端产物、图标与运行清单；版本读取根 `package.json`。预览直接加载该目录，使用 `aiohub://app/` 协议，覆盖深层路由刷新与绝对资源路径。

### 双击脚本

根目录的脚本会先切换到项目目录，支持从资源管理器或其他工作目录启动。Windows 构建脚本执行完会保留终端，方便查看产物位置和错误；命令行参数会继续传给 Bun 入口。

| 操作             | Windows                       | macOS / Linux                                             |
| ---------------- | ----------------------------- | --------------------------------------------------------- |
| 开发与前端热更新 | `dev-electron.bat`            | `bash dev-electron.sh`                                    |
| 生成本地安装包   | `build-electron.bat`          | `bash build-electron.sh`                                  |
| 预览已有前端产物 | `preview-electron.bat`        | `bash preview-electron.sh`                                |
| 生成单文件便携版 | `build-electron-portable.bat` | Windows Git Bash 可运行 `bash build-electron-portable.sh` |

首次使用先安装 Bun，并在项目目录执行 `bun install`。

### 分发构建

```powershell
bun run electron:package:local          # 当前系统的本地安装包
bun run electron:package:dir            # 带 Electron 运行时的解压即运行目录
bun run electron:package:portable:local # Windows 单文件便携版
bun run electron:package                # 使用正式版本号与可用的签名配置
```

配置位于 `electron/builder.config.cjs`，锁定 electron-builder 并复用当前系统已安装的 Electron。每次打包都会重新构建应用；输出到 `release-electron/`。当前入口以本机系统和 CPU 架构为目标，Windows 默认生成 NSIS 安装器与单文件便携版，macOS 配置 DMG，Linux 配置 AppImage 与 deb；macOS/Linux 的产物需在对应系统构建与验证。

Windows 目录版入口为 `release-electron/win-unpacked/AIO Hub Electron.exe`，可直接双击。NSIS 安装器提供中英文、安装目录选择和独立快捷方式；便携版文件名带 `Portable`。应用标识、名称和产物目录与 Tauri 分开。

本地构建使用 `<根版本>.build.<Git短提交号>`（正式版本追加 `-build.<Git短提交号>`），在生成的应用清单中写入版本，源版本文件保持原样。本地入口关闭自动证书发现和 Windows 可执行文件签名，保留图标与版本资源；正式入口可使用 electron-builder 的 `CSC_LINK` / `WIN_CSC_LINK` 等标准环境变量配置签名。首次构建可能下载 NSIS 等平台工具，按本机网络配置代理。

构建日志复用 `.tmp/build-logs/`。构建子进程默认使用 8 GiB 的 Node 堆上限；已在 `NODE_OPTIONS` 指定堆上限时沿用该设置。打包范围限定为已构建的主进程、preload、前端和图标，启用 ASAR；canvases 与 skills 也按现有桌面约定放入 resources。应用内更新与自动发布仍按迁移计划接续。

## 数据目录

开发和本地预览默认使用 `.dev-data/electron/user-data/`，与 Tauri 开发数据分开。设置 `AIO_DATA_DIR` 可使用指定的绝对目录，多实例同时指定独立目录和端口。安装版和解压目录版在没有该变量时使用 Electron 的平台用户数据目录；Windows 单文件便携版默认在原始 EXE 旁创建 `data/`，避免写入临时解压目录。显式 `AIO_DATA_DIR` 优先。

桌面业务继续通过 `getAppConfigDir()` 取根目录。现有 `createConfigManager`、LLM 混淆存储和请求记录存储在 Electron 下使用文件持久化。窗口位置保存在根目录的 `electron-windows.json`，应用日志位于 `logs/`。迁移期间使用独立数据副本验证，待完整后端契约就绪后再安排正式数据迁移。

## 实例与协议唤醒

同一 `userData` 目录只运行一个 Electron 实例；再次启动会把有效的 `aiohub://` 请求转给首个实例，并恢复/聚焦主窗口。使用不同 `AIO_DATA_DIR` 的开发和测试实例可并行运行。内部 `aiohub://app/` 页面地址与外部业务协议分开校验。

分发配置声明 `aiohub` 协议，安装器/系统集成负责关联。开发和本地预览启动保持当前系统协议关联，便携版也沿用现有系统设置；与 Tauri 并存时，由系统当前关联决定外部链接打开的版本。Windows 安装后的实际关联与 macOS/Linux 的协议唤醒仍需在对应环境验证。

## 已接入能力

- 完整现有工作台、工具注册与路由，Chromium 原生标题栏拖动区域。
- 无边框主窗口、工具窗口创建/聚焦/关闭、窗口事件、尺寸与位置保存恢复；托盘支持显示/隐藏主窗口、重启前端、清除窗口配置和退出。显示操作同时恢复最小化状态。
- 命令分发、定向事件与解绑、Vue 响应式参数序列化、二进制 IPC、结构化错误。
- UTF-8/二进制文件读写、目录项、基础文件操作、应用路径、文本剪贴板、打开/保存对话框与外部链接。
- 本地 `asset://local/` 资源协议：按窗口授权精确文件路径，验证随机令牌和真实路径，窗口关闭时释放授权。
- 应用名称/版本、操作系统信息、同数据目录单实例、二次启动恢复主窗口、启动参数 Deep Link 与 macOS `open-url` 事件。协议请求仅由主窗口消费，订阅前到达的请求会排队，消费后释放。

## 原生 HTTP 与响应流

`src/platform/native/http.ts` 的 `fetch` 已接入 Electron 主进程网络，支持标准请求头、文本/二进制/FormData 上传、HTTP 状态与响应头、重定向、二进制下载和 SSE 等响应流。主进程使用 Chromium 网络栈和系统代理；默认隔离浏览器会话 Cookie，显式 `credentials: "include"` 时才共享会话凭证。跨源重定向移除显式认证与 Cookie 请求头，所有跳转目标继续限制为 HTTP/HTTPS。

响应由前端按需读取，每次 IPC 返回至多 64 KiB；`AbortSignal`、响应体取消、页面刷新、渲染进程退出和窗口销毁会释放所属请求。普通站内路由切换保留当前请求。每个窗口可同时持有 64 个请求；长流和暂时保留的响应使用完后需读取完成或调用 `response.body?.cancel()`。

`maxRedirections` 支持 0–100，0 表示返回重定向响应。`connectTimeout` 当前覆盖发起请求至收到最终响应头的整个阶段（含重定向），响应体读取沿用调用方的取消或 watchdog。上传内容在发送前编码并缓存在内存中；超大文件的流式上传需后续专项实现。逐请求代理、跳过证书验证和 `integrity` 校验返回显式能力错误。

这条链路覆盖已使用平台 HTTP 的下载与数据源调用；LLM 专用 Rust 代理命令和 Channel 仍需迁移，现有 Chat、媒体生成等工作流按各自后端能力判定可用性。

## 后续能力

Channel、文件监听、Shell/Sidecar、更新器，以及知识库、技能扫描、搜索、FFmpeg、系统监控等 Rust 命令仍按迁移总纲分阶段接入。此类调用返回 `CAPABILITY_UNAVAILABLE`；已有工具的启动钩子可能在首页初始化时提示暂未支持。普通前端工具可直接使用，依赖这些后端能力的工作流继续从 Tauri 入口执行。

外部文件拖放的精确落点与目标工具导入、拖拽预览固化、窗口吸附、嵌入式 WebView、跨平台窗口材质、原生文件选择对话框的完整交互与自动更新仍需专项接续。

## 宿主边界

主进程位于 `electron/`，渲染适配器位于 `src/platform/electron/`。业务仍访问 `src/platform/native/` 或语义门面；兼容入口按 preload 标记选择实现，Tauri 运行时沿用原 SDK。

preload 使用 `contextIsolation: true`、`sandbox: true`、`nodeIntegration: false`。仅公开固定 IPC 协议，事件回调接收业务包络；主进程验证所属窗口、顶层 frame 和来源，按显式操作分派。子 frame 沿用沙箱，页面导航留在应用来源，外部链接只允许 HTTP、HTTPS 和邮件协议。生产 HTML 的内联导入映射与兼容性引导通过内容哈希授权。

这仍是拥有桌面文件能力的可信应用渲染器。新引入的远程内容和不可信插件需要单独的权限模型，不能获得该 preload。

日常界面验证使用 Dev Control：`bun run electron:dev -- --agent --agent-instance electron-demo`，再通过 `bun scripts/dev-control/cli.ts` 操作窗口、读取结构和截图。生产资源可用 `electron:preview -- --agent` 运行。启动器负责隔离数据、分配 loopback CDP 端口、发布实例与退出清理；窗口身份通过受控 IPC 获取。具体命令见[开发界面控制指南](./dev-control.md#electron-开发控制)。需要主进程专项验证时，可继续使用 Playwright Electron。

详见[平台架构](../architecture/platform-bridge-architecture.md)和[迁移总纲](../Plan/electron-migration-master-plan.md)。

## 本轮验证记录

2026-11-03 在 Windows 的真实 Electron 45.2.1 中检查了开发态与生产协议：工作台初始化、文本差异对比的 Monaco 编辑器、深层路由刷新、窗口最大化/恢复、工具窗口创建/销毁、事件包络、二进制文件往返、本地资源读取与无效令牌拒绝、子框架的 preload 隔离，以及配置重载与进程重启后读取。

相关检查包括前端/主进程类型检查、平台隔离检查、Vite 生产构建和 71 项相关测试。原生文件对话框的完整人工交互、物理文件拖放和 macOS/Linux 运行态验收随对应能力接续。

同日补齐本地分发构建：Windows x64 已生成 NSIS 安装器、单文件便携版和解压运行目录。真实目录版从 ASAR 加载工作台，验证了深层路由刷新与 IPC；真实单文件便携版验证了 EXE 旁 `data/` 的文件读写。打包归档检查确认仅收录应用产物，未收录工作区依赖。双击脚本验证覆盖工作目录定位、参数透传和退出码，便携目录契约纳入相关单测。macOS/Linux 的打包配置待对应系统验证。

2026-11-04 补齐开发图标与托盘操作。在真实 Electron 中验证了开发图标文件、托盘开发提示、菜单操作以及最小化/隐藏后恢复；主进程类型检查通过。托盘菜单通过原生 Menu 回调执行验证，系统托盘的物理点击留待交互走查。

同日补齐单实例与协议交付。相关单测保护启动参数校验、队列消费一次、订阅空档补发和有界保留；真实 Electron 验证同数据目录的二次进程正常退出、最小化恢复、协议转交、订阅前请求补发及独立数据目录并行运行。

2026-11-04 原生网络验证覆盖真实 Electron IPC：二进制与 FormData 上传、200 KiB 下载、SSE 首块读取、204/503 响应、重定向方法转换、响应前后取消、等待响应头超时、协议跳转拒绝、站内路由保留与刷新释放。会话 Cookie 默认隔离、显式 Authorization 发送与跨源认证头移除也已验证。网络实现使用原生请求重定向事件，规避 `net.fetch` 的手动重定向取消行为。真实远程模型与完整 LLM 代理流程继续按迁移计划验证。

本轮相关单测合计 40 项通过，前端/主进程类型检查、平台隔离检查与完整 `electron:build` 通过。生产 `aiohub://app/` 工作台、原生 HTTP IPC、页面刷新与正式图标已在真实 Electron 复验。构建仍报告依赖中的直接 eval、较大分块与插件耗时提示。

生产首页走查确认仍有启动能力缺口：`background_runtime_get_status`、`get_all_skill_manifests`、`recall_preview_legacy_migration`。技能加载和工具注册会提示错误；这些后端契约及启动初始化的能力分层已补入总纲 P1 待办。

2026-11-04 接通 Electron Dev Control。在真实开发态与生产资源预览中验证了实例发现、身份握手、路由跳转、CDP 点击与按键、窗口尺寸确认、截图和诊断摘要。开发态另验证了多窗口、前端控制桥暂不可用时的原生身份、刷新重连；并行实例的数据目录分别隔离，退出后所属 Vite/CDP 端口与实例描述均已释放。诊断摘要验证包含常见凭证字段裁剪。

本轮 35 项相关测试、前端/主进程/Dev Control 类型检查、平台隔离检查与完整 `electron:build` 通过。macOS/Linux 的 Electron 运行态验收继续在对应系统接续。

## 模型请求传输

默认模型请求由平台门面送入 Electron 主进程，通过 Node HTTP/1.1 发出。tagged LocalFileRef、兼容 data URL、原始文件上传及 multipart manifest 在宿主解析；文件上传保留流式读取。普通平台 HTTP 继续使用 Chromium 网络栈。

模型请求支持系统代理解析、直连、自定义 HTTP(S)/SOCKS 代理和 loopback 绕过；证书校验设置只作用于当前请求。SSE 与普通响应共用按窗口归属的拉取式 IPC，支持响应头后的外部取消和窗口销毁清理。详细进度见[功能缺口补齐待办](../Plan/electron-feature-gap-execution.md)。

## 共享文件命令

Electron 业务分派支持文件元数据、目录判断/列举、日志与 JSONL 追加、上传文件保存、复制到应用目录、应用资源目录复制及系统回收站删除。元数据时间采用秒级 Unix 时间，字段沿用现有 camelCase 契约。

应用目录命令检查规范化路径及真实祖先路径，保护根目录并识别 junction 越界；文件和目录删除通过操作系统回收站完成。携带 Agent 文件安全快照的文本/二进制读取、文本写入、追加与删除执行白名单、死区、审批和大小规则，目录删除同时检查嵌套内容。

## 资产存储

资产业务由主进程统一管理，使用现有 JSONL 目录索引与月度哈希索引。共享命令支持路径和字节导入、当前月去重、来源合并、筛选/排序/分页、资产读取、缩略图、音频波形、派生数据和索引重建。

默认根目录为应用数据目录下的 assets；应用设置的 customAssetPath 使用绝对路径。每次操作按当前设置选择资产根，切换时加载对应索引。列举可补录标准类型/月度目录中尚未登记的文件，重建保留既有来源与派生元数据。

图片尺寸及缩略图通过 Electron 原生图像接口生成，音频时长/封面复用项目音频元数据解析库。索引写入完成后再返回成功，多窗口共享同一操作队列。原始文件与缩略图通过操作系统回收站删除，派生文件清理单独核对路径和引用关系。旧版 Office 文档的自动转换见功能缺口待办。

## 配置备份与智能体资源

配置管理由主进程承接列举、ZIP 导出和合并/覆盖导入。备份保留现有 `manifest.json` 的 `timestamp`、`app_version`、`file_count` 字段以及应用相对目录结构，包含私有资源等二进制文件；导出过滤日志和 Chromium 的已知缓存、会话、性能数据库与锁文件。时间戳优先使用应用时区。

导入先校验路径、清单与文件数量，将所有文件限量解压到系统临时目录并核对 CRC，再写入应用目录。路径穿越、Windows 设备名/ADS、大小写重名、文件与目录冲突、符号链接和 junction 重定向会中止导入。单文件采用原子替换；实际写入阶段的权限或磁盘错误会返回已导入数量与失败文件，方便重试。合并模式递归合并对象、对数组追加去重；JSON 解析失败时沿用原契约，使用导入的原始内容。配置归档使用普通单卷 ZIP；分卷、ZIP64 需先重新打包。ZIP 上限 256 MiB，单文件解压上限 256 MiB，总解压上限 1 GiB，最多 20,000 个业务文件；大型资产可分批备份。

智能体资源位于 `agent-manager/agents/{agentId}/assets/`，支持字节保存、列举、路径/二进制读取、单个/批量/整目录回收站删除。路径读取兼容智能体根目录头像。大图和音频封面复用统一媒体解析器生成 400×400 缩略图，小图直接使用原文件；同一资源名换扩展名上传时也分配新后缀，保持前端资源 ID 与缩略图独立。资源写入按主进程队列串行，保存使用排他创建，访问同时检查应用相对路径与真实路径。
