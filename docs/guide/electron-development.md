# Electron 桌面开发

> 当前阶段：基础宿主、本地分发、模型传输、共享资产、技能与工作区适配已接入，领域后端持续迁移，后台 Node 运行时基础已接入，2026-11-05。Tauri 开发与发布入口继续保留。

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

## 窗口恢复与退出

窗口关闭、显式销毁及应用退出由 Main 捕获普通窗口位置、尺寸和最大化状态，原子保存到 `electron-windows.json`。隐藏窗口沿用普通窗口几何；最小化窗口保留此前的最大化状态。Windows 恢复时校正 DIP 取整误差，避免反复打开后尺寸累积变化。配置条目须通过尺寸与坐标校验，且标题栏在当前显示器工作区内可操作；损坏的配置文件保留并记录错误。

托盘退出、系统应用退出、正常 `process.exit(0)` 和重启共用一次收尾：先保存全部窗口，再关闭后台入口并等待已接收事务及所属原生进程，随后进入 Electron 正常退出，使页面 `beforeunload` 和 Chromium 存储有机会完成。退出期间拒绝新页面请求；某项收尾失败记录错误，其他所有者继续排空。

Windows `query-session-end` 同步保存窗口，系统取消退出后应用继续使用；`session-end` 再次快照并触发宿主收尾。真实注销、关机时可用时间由系统决定，后台事务完成仍受系统终止时机约束。Windows 已完成真实窗口与独立进程恢复验证，系统会话事件使用合成触发；真实注销/关机及 macOS/Linux 生命周期验收继续接续。

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

## 托盘与分离工作区

显示托盘和关闭到托盘沿用应用设置，开关即时更新，重启恢复保存值。托盘可用且开启关闭到托盘时，关闭主窗口会隐藏到托盘；存在子窗口时保持主窗口可见。主动隐藏主窗口时，若托盘图标已关闭，则最小化到任务栏。其他关闭场景使用现有业务退出确认，启动期间回退原生确认。子窗口可恢复主窗口并导航到指定设置页。

组件与工具分离支持预览、固化、取消及超时回收，主进程按所属窗口管理临时会话。固化前忽略鼠标并跳过任务栏，固化后恢复交互；原生关闭触发回附通知。Canvas 窗口采用独立注册表，支持重复创建合并、最小化恢复、关闭单个或全部。

跨窗口广播只由已注册对应操作的窗口响应；定向请求找不到处理器时返回明确错误。显示器工作区沿用共享的物理像素 position/size 结构，输入框据此限制分离窗口高度。

### Canvas 项目预览

生产应用通过独立来源 `aiohub://canvas-preview/<句柄>/document` 承接 HTML，并以同一授权下的项目资源目录作为基址。HTML 预览门面位于 `src/platform/modules/html-preview.ts`；Electron 使用独立来源，Tauri 沿用原有 srcdoc 与本地资源入口。

预览保留 `sandbox="allow-scripts"`。主进程将预览授权绑定到创建窗口，限制项目 ID、预览数量和 HTML 大小，对项目资源检查词法路径和真实路径；窗口导航、退出或渲染进程结束时撤销授权。主应用 CSP 仅增加预览 frame 来源，项目脚本由预览自己的 CSP 控制。Windows 生产资源实例已验证内联交互、本地 JS/CSS 和 iframe 宿主隔离。

对话区与输入框已通过有会话数据的草稿保存、重附着、刷新及整进程重启验证，进度见[缺口补齐待办](../Plan/electron-feature-gap-execution.md)。

## 自定义窗口缩放

共享入口 `startWindowResize()` 对接平台窗口适配器。Electron 渲染器捕获启动指针，合并移动事件并按序提交；主进程按窗口归属管理八方向缩放会话，以 DIP 屏幕坐标计算新尺寸、限制最小/最大尺寸并固定对边锚点。固定窗口临时启用缩放后读取真实约束，结束时恢复原始 `resizable`。

鼠标释放和失焦保留最终尺寸；Escape 或 pointercancel 回滚起始尺寸。导航、隐藏、最小化、最大化、进入全屏、渲染进程退出、窗口关闭和心跳超时都会清理宿主会话。Tauri 共用入口在 finally 中恢复临时缩放设置；监控框和分离组件复用同一调用链。

2026-11-04 在真实 Windows Electron 的生产资源预览中验证左右手柄拖动、八方向尺寸和锚点、最小/最大限制、Escape 回滚、失焦与刷新恢复，以及跨窗口调用拒绝。150% 显示缩放下有约 1–2 DIP 的系统取整偏差；macOS/Linux 及 Tauri 真实窗口交互待对应环境验收。

## 原生 HTTP 与响应流

`src/platform/native/http.ts` 的 `fetch` 已接入 Electron 主进程网络，支持标准请求头、文本/二进制/FormData 上传、HTTP 状态与响应头、重定向、二进制下载和 SSE 等响应流。主进程使用 Chromium 网络栈和系统代理；默认隔离浏览器会话 Cookie，显式 `credentials: "include"` 时才共享会话凭证。跨源重定向移除显式认证与 Cookie 请求头，所有跳转目标继续限制为 HTTP/HTTPS。

响应由前端按需读取，每次 IPC 返回至多 64 KiB；`AbortSignal`、响应体取消、页面刷新、渲染进程退出和窗口销毁会释放所属请求。普通站内路由切换保留当前请求。每个窗口可同时持有 64 个请求；长流和暂时保留的响应使用完后需读取完成或调用 `response.body?.cancel()`。

`maxRedirections` 支持 0–100，0 表示返回重定向响应。`connectTimeout` 当前覆盖发起请求至收到最终响应头的整个阶段（含重定向），响应体读取沿用调用方的取消或 watchdog。上传内容在发送前编码并缓存在内存中；超大文件的流式上传需后续专项实现。逐请求代理、跳过证书验证和 `integrity` 校验返回显式能力错误。

这条链路覆盖已使用平台 HTTP 的下载与数据源调用。默认模型请求使用下文的专用主进程传输；通用 Channel 等后端能力继续按迁移计划接入。

## 宿主能力提示

共享前端通过 `src/platform/core/capabilities.ts` 区分宿主集成和系统支持范围。后台 JavaScript 运行时按能力启动；Electron 已接通 PHP、Rust、C/C++ 系统代码格式化；浏览器及其他未支持的宿主能力展示可行动提示。外部播放器覆盖层继续保留方案编辑导出、本地视频或内置播放器入口。

## 后续能力

模型请求、命令 Channel、流式会话搜索、会话持久化、共享文件与资产、配置归档、智能体私有资源、技能管理/脚本执行、文件监听、图片剪贴板、系统字体、当前窗口文件拖放、旧业务打开入口、目录树生成、插件包管理、已安装 JS/Web 模块与 UI 加载、单次/常驻插件 Sidecar 与 Native 动态库执行已接入。具体范围与实机验证见[缺口补齐待办](../Plan/electron-feature-gap-execution.md)。

Recall 已接通 SQLite 存储、向量/标签池、检索 pipeline、监控、旧目录迁移，以及单个/批量备份导出、取消、旧版转换和含资产恢复。主库 schema v3 将条目按集合隔离，复制恢复保留原集合；退出等待已接收的备份操作完成。

Knowledge 的 28 个现行命令已在 Electron 分派，Windows 已验证 Markdown/HTML 摄取、标签与文档版本、关键词检索和目录同步；首库创建后可直接使用默认范围检索。PDF/DOCX、本机模型语义/混合检索、智能体授权和 Chat 显式查询/研究引用也已通过生产资源验证，向量与结构化会话可在退出后恢复。智能体大厅开聊交接、Qwen 主动 Knowledge 工具调用、研究取消保留证据和已删除引用的发送前提示已通过 Windows 验证；研究失败/超时状态映射已修复，最终产物超时后的来源保留也已验证。Windows 原生文件多选、目录选择与取消已通过知识资料库和 Recall 备份实机验证；Recall 冲突副本/跳过、逐项失败报告、单包/批量导出及运行中停止后续项目也已验证。替换二次确认和跨平台交互继续接续，详见[缺口补齐待办](../Plan/electron-feature-gap-execution.md)。

媒体历史搜索已接通会话名称、内容、提示词和模型，并保留任务资产关联；Windows 画廊搜索与图片加载已验证。JSON 剪贴板监控按窗口持有订阅，空输入自动格式化、已有输入通过通知确认替换；停止单窗口保留其他窗口监听，刷新和关窗释放所属订阅。系统剪贴板监控仅在用户开启后运行。

FFmpeg 已接通检测/版本、元数据/完整流信息、整文件关键帧、执行/取消与 ROI 区间抽帧。执行沿用前端 argv，日志和进度按窗口隔离；刷新、关窗和应用退出回收所属进程树。转录取消联动音视频预处理；结果自动展示、派生文件读取和编辑保存已修复。Windows 生产资源已验证工作台转换、MP3→PCM WAV→本地受控 STT 上传→派生结果落盘，以及本地视频拖入→ROI 预览/试识别→FFmpeg 抽帧→原生 OCR→字幕合并和取消清理；真实 ASR、视频 VLM 和跨平台实机验证继续接续。

Git 已接通仓库扫描/状态、文本与媒体差异、暂存/取消暂存/放弃、历史分页/详情和概览；分析器支持流式全量/增量读取、按需补齐文件与统计及窗口级取消。运行环境需要系统 Git。远端同步、soft undo/amend、分支/标签/stash 写操作及终端入口也已接通；分析器的 pick/revert、HEAD 消息修改、四格式导出及自定义日志格式化也已接通，当前 44 个公开后端命令均有 Electron 入口。目录搜索、内容去重、符号链接移动和系统监控继续迁移。通用 Shell API、独立子 WebView 和更新器适配仍返回能力错误。依赖这些能力的工作流可从 Tauri 入口执行。

目录清理已接通名称/年龄/大小/深度组合分析、回收站清理和两类停止操作。扫描与进度按窗口隔离，清理取消等待当前回收站调用并保留未处理项目及勾选；退出等待在途操作。真实路径、根目录与链接边界在宿主检查，父子选择归并，单项失败可继续处理其余选择。Windows 生产资源已验证完整界面流程、取消保留、junction 目标完整及双窗口隔离；macOS/Linux 回收站交互待对应环境验收。

后台 Agent 的独立运行、关窗后的任务延续、系统退出保存、正式更新/数据迁移，以及 macOS/Linux 构建与运行验证仍需接续。Windows 当前窗口文件拖放与落点定向已通过真实 Electron 验证；知识资料库与 Recall 的原生选择器已完成上述 Windows 批次，其他领域的系统交互和跨平台窗口材质继续走查。最新调查见[功能缺口调查](../design/electron-feature-gap-audit-2026-11-04.md)。

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

早期生产首页走查发现 `background_runtime_get_status`、`get_all_skill_manifests`、`recall_preview_legacy_migration` 三处启动能力缺口。后续批次已接通技能清单、后台运行时能力分层和独立 Node utility process；Recall 旧目录迁移的检测、预览、执行与显式清理也已接通，知识资料库的文档、语义索引、智能体检索与原生选择器已完成各自 Windows 批次，最新状态以缺口补齐待办为准。

2026-11-04 接通 Electron Dev Control。在真实开发态与生产资源预览中验证了实例发现、身份握手、路由跳转、CDP 点击与按键、窗口尺寸确认、截图和诊断摘要。开发态另验证了多窗口、前端控制桥暂不可用时的原生身份、刷新重连；并行实例的数据目录分别隔离，退出后所属 Vite/CDP 端口与实例描述均已释放。诊断摘要验证包含常见凭证字段裁剪。

本轮 35 项相关测试、前端/主进程/Dev Control 类型检查、平台隔离检查与完整 `electron:build` 通过。macOS/Linux 的 Electron 运行态验收继续在对应系统接续。

## 后台 JavaScript 运行时

`electron/background-runtime.ts` 由应用主进程持有，通过 `background-runtime-worker.cjs` 启动独立 Node utility process。前端桥经平台门面的 `background.start` / `background.call` 接入；Tauri 继续沿用现有事件桥与隐藏 WebView。

- Worker 启动后报告版本和就绪状态，每 5 秒发送心跳。启动等待上限 15 秒，心跳失联阈值 20 秒；watchdog 回收失联进程，下次连接启动新代次。连接时也检查心跳，避免在两个检查 tick 之间复用失联进程。
- `background_runtime_get_status` 提供可用、就绪、代次、版本与最近心跳。就绪和心跳由主进程接收 Worker 消息更新，Renderer 无对应写入口。
- 同时在途 RPC 上限 64，默认 30 秒，调用方可设置至 120 秒。错误保留结构化 code。请求归属页面，刷新、渲染进程退出及窗口销毁释放其等待；Worker 生命周期持续到应用退出。
- 应用退出先回收 Worker，超时升级到进程树清理；清理结束前阻止创建替代进程。关闭到托盘沿用桌面工作区策略。

当前公开方法为 `runtime.ping` 与 `runtime.getInfo`，用于宿主诊断。现有 Agent 多轮循环已提取为 [`runChatOrchestration`](../../src/tools/llm-chat/core/execution/chatOrchestrator.ts)，真实聊天入口通过 Renderer 适配器调用它；Node 可复用同一循环并注入自己的生命周期控制、模型、工具、审批和保存端口。单节点路径同样已提取为 [`executeSingleNode`](../../src/tools/llm-chat/core/execution/singleNodeExecutor.ts)，负责上下文组装、续写/快照归因、VCP 分段、可取消重试与回复收尾；原入口注入现有管道、渠道发送、流式缓冲、节点和快照服务。模型中间件与虚拟渠道调度已共用，Node OpenAI 兼容传输见下节；全部 11 个上下文处理器与三阶段宏内核已共享，`createContextProcessors` 按同一注册清单装配；Renderer 保留原日志、响应式宏注册表和宿主服务。Node 已用显式夹具服务验证完整管道到真实 HTTP 请求，Electron 渠道结构与凭据事务已由主进程 `LlmConfiguration` 接管，沿用原文件格式、revision 快照链及共享规范化；密钥轮询/熔断内核由 Renderer 与 Node 共用，Electron 的 Key 状态、轮询位置和持久化也已由主进程统一持有，窗口通过增量操作和单向状态投影同步。Node 文本分词及图片/音视频计费服务已复用生产引擎，按上下文固定注册表与模型快照；图片解码/缩放/编码及长图原生像素分析已接入任务级服务，切片计划与预算共用，真实 gzip/图片资产和完整管道到 HTTP 已验证。Worker 到 Main 的内部服务通道已接通，渠道加载与执行期 Key 操作复用窗口侧同一所有者，生产 Worker 就绪前完成轻量初始化；已接收事务跨进程退出排空。配置/Key 往返由独立真实 utility process 验证。正式 Worker 现已持有附件/图片/Token 上下文资源池，通过 Main 获取当前持久文件策略和现有资产根，正常退出先释放 scope 与原生队列；资源实例保持按需加载。真实 utility fixture 已验证跨进程策略变更、缓存读取撤销、资产根切换及精确图片预算到 HTTP。生产 Worker 继续仅公开诊断方法。PDF/Office、转写、检索与任务生产服务继续接线。Worker 接管仍需实现其他协议、审批授权、其余上下文/响应/存储适配，以及真实会话/工具所有权，随后接入会话状态机、持久 `SessionEvent` 和订阅游标。任务完成通知和窗口全部销毁后的任务存续随该阶段实施。实现与验收记录见[功能缺口补齐待办](../Plan/electron-feature-gap-execution.md#6-后台与正式分发)。

## Worker 与 Main 内部服务

`electron/background-host-protocol.ts` 定义独立于页面 RPC 的内部消息。`BackgroundHostClient` 经 utility process 的父通道调用 `host.initialize`、`llm.configuration.load`、`llm.keys.execute`、`context.files.policy`、`context.assets.root` 和 `llm.proxy.resolve`。Main 的 `createBackgroundHostServices` 复用现有 `LlmConfiguration` 与 `LlmKeyState` 实例；执行端 Key 端口可直接交给共享模型中间件。渠道快照按调用加载，初始化只返回应用数据根与运行目录。

运行时版本为 `0.5.0-node`。启用内部服务时，Worker 完成初始化后才允许报告 ready；生产启动沿用这一握手。内部 Key 操作限于选择、同步、成功和失败，回复只包含选择结果或不可用原因。完整状态投影继续由窗口现有订阅处理。页面 `background.call` 在 Main 层限定为两个公开诊断方法。

两端各限制 32 个在途服务请求；Main 限额包括旧代次仍在收尾的操作。请求编号单调递增，Worker 代次和物理通道共同隔离回复。调用取消、超时和进程退出释放等待者，已接收的持久化事务继续完成。应用退出先关闭 Worker 请求入口，对已就绪实例发送 `shutdown`，等待 scope 与原生队列释放；默认 2 秒后仍未退出则终止进程，后续可升级到进程树清理。初始化中或失联的实例直接进入进程回收。内部已接收事务全部收尾后，再关闭渠道与 Key 所有者。宿主异常通过固定错误包络回复，避免异常正文携带凭据。

独立真实 utility process 已覆盖配置读取、共享 Key 轮询/熔断、进程退出后的事务完成与重新加载。正式生产资源已覆盖初始化、多窗口、刷新、心跳和崩溃重连。生产聊天的执行入口继续由 Renderer 持有；后续将真实任务、工具/审批所有权及其余上下文服务装入 Worker。

## 模型请求传输

默认模型请求由平台门面送入 Electron 主进程，通过 Node HTTP/1.1 发出。tagged LocalFileRef、兼容 data URL、原始文件上传及 multipart manifest 在宿主解析；文件上传保留流式读取。普通平台 HTTP 继续使用 Chromium 网络栈。

模型请求支持系统代理解析、直连、自定义 HTTP(S)/SOCKS 代理和 loopback 绕过；证书校验设置只作用于当前请求。SSE 与普通响应共用按窗口归属的拉取式 IPC，支持响应头后的外部取消和窗口销毁清理。详细进度见[功能缺口补齐待办](../Plan/electron-feature-gap-execution.md)。

`src/llm-apis/execution/modelRequestExecutor.ts` 与 `channelRequestExecutor.ts` 承接原模型中间件和虚拟渠道调度，Renderer 入口注入现有配置、Key 管理、适配器与 Inspector 服务。`adapters/openai/chat-executor.ts` 复用原 DTO 映射和共享 Provider Core，通过端口选择 Transport 和请求头模板解析。

`electron/llm-transport.ts` 可由 Node 执行所有者独立持有，复用现有 HTTP 重定向、代理与文件展开服务，整条响应流保持取消和期限控制；`dispose()` 释放所属在途请求。共享响应 reader 在提前结束解码时关闭连接。Node 行为测试使用真实本地 HTTP/SSE 和附件字节；生产 Worker 的 Agent 服务接线仍在实施。

## Worker 多协议模型服务

`BackgroundModelServices` 在正式 Worker 初始化后创建；构造阶段保持轻量，`createScope` 才通过 Main 读取渠道快照。每个 scope 固定渠道 revision、请求头模板上下文、代理配置及 VCP 连接地址；模型与虚拟渠道调度复用 `modelRequestExecutor` / `channelRequestExecutor`，选钥和健康写入继续交给 Main 所有者。调用方可取得渠道快照副本，任务执行中的快照保持稳定，新 scope 观察更新后的渠道。

`src/llm-apis/execution/chatAdapters.ts` 装配 OpenAI 兼容、Responses、Gemini、Claude、Cohere、Azure、DeepSeek 与 Vertex Google/Anthropic 聊天协议。Renderer 注册入口使用同一装配清单，原适配器的媒体、Embedding 和转写方法保留。协议 DTO 映射、工具/思考内容、端点、鉴权与高级参数继续使用原实现；传输和模板请求头通过端口注入。`llm-apis/types.ts` 与 `adapters/types.ts` 提供独立契约，原 `common.ts` / `adapters/index.ts` 保留兼容导出。

每个模型 scope 持有自己的 Node HTTP/SSE 传输。系统代理解析通过内部 `llm.proxy.resolve` 调用 Main 的 Chromium 服务；该能力校验 HTTP(S) 地址及凭据字段，页面 RPC 继续使用诊断方法白名单。释放 scope 或关闭 Worker 会取消准备和在途请求，等待对应操作退出。共享中间件发出的上游中断请求由 scope 记录并收尾。

Windows 独立 utility process 已完成 9 条本地 HTTP 协议路径，另覆盖 Main 配置/共享密钥轮询、模板请求头、代理服务、按需读取与在途 SSE 的正常退出。正式生产 Worker 已验证启动、跨窗口共享、刷新、心跳及崩溃重连。真实聊天任务、工具/审批、持久事件及媒体/Embedding/ASR 的 Worker 执行装配继续实施。

## Worker 上下文资源与当前文件策略

`electron/background-context-services.ts` 的 `BackgroundContextServices` 在正式 Worker 初始化后创建，统一持有 Node 图片原生队列及 Token 引擎。构造阶段保持轻量；`createScope` 固定已解析模型、长图配置及 Token 注册表，返回附件读取、图片变换/切片和统一计费端口。每个 scope 拥有取消与字节快照，`dispose()` 释放自身资源；服务 `shutdown()` 取消准备中的 scope、关闭全部 scope 并等待原生队列。

本地附件每次访问通过内部服务读取 `ContextFilePolicyReader` 的当前持久策略。读取沿用 `aio-file-operator/config.json`，只投影沙箱、目录、规则与大小；默认目录由 Electron 系统路径提供，应用 `workspace` 沿用文件工具约定。配置上限 1 MiB，检查应用路径重定向、JSON/UTF-8 与字段格式；损坏配置保留原文件并拒绝读取。默认大小限制与 Renderer 从同一个纯模块导入。命中字节缓存后仍复检路径、审批及当前大小限制。

资产根经 Main 的既有 `AssetManager` 队列解析，继续应用用户配置及当前索引校验。旧 scope 保留已读取字节，新 scope 观察资产根变更。Main 仅提供策略与路径，二进制留在 Worker 内读取和处理。

本地媒体的审批标记沿用工具执行结果契约。正式任务接入时，授权仍需由 Worker 的工具/审批所有者生成并与实际调用关联。当前生产聊天入口继续由 Renderer 持有；正式 Worker 已装配资源对象，scope 与模型发送的跨进程验证使用独立 utility fixture。该 fixture 使用最终 gzip 分词资产与原生模块，通过共享限流/资产处理器和 OpenAI 映射向真实本地 HTTP 发送 4 张 PNG，计费为精确文本 2 + 图片 1020 Token，并覆盖缓存撤权与正常退出释放。

## Node 上下文 Token 服务

`electron/token-calculator.ts` 提供执行所有者可直接持有的 `NodeTokenCalculator`。`createScope(models, signal)` 接受上层已解析的模型快照，加载应用目录中原有 `tokenizer-registry/profiles.json`、`rules.json` 与内置覆盖，返回共享管道所需的文本/消息计算端口。创建 scope 时固定模型和注册表，后续上下文读取新的持久配置；引擎按注册表内容保留有界缓存，并发冷加载共用原引擎的实例化任务。

内置资产从调用方明确指定的 `bundledAssetsDir` 读取 `<id>/tokenizer.json.gz` 与 `tokenizer_config.json.gz`，直接消费 Vite 原有构建产物。本地导入和远端安装读取应用 `tokenizer-assets` 中的已安装数据，沿用应用路径重定向保护；远端按缓存读取。损坏注册表保留原文件并返回错误，资产不可用沿用现有引擎带估算标记的回退。

`core/messageTokenCalculator.ts` 与 Renderer 服务共享媒体计费、发送前尺寸缩放、默认视觉规则和估算标记；`core/registrySnapshot.ts` 共用内置覆盖语义。取消及时释放调用等待，已启动的共享资产加载可继续服务其他上下文。CPU 编码执行期间的中断仍受 Node 事件循环调度约束。

该服务已在 Node 集成中用于全部 11 个处理器到真实 HTTP 的链路，图片部分使用下述原生服务；生产聊天入口继续由 Renderer 调度，Worker 公共方法保持诊断契约。

## Node 上下文附件与图片服务

`electron/context-attachments.ts` 的 `NodeContextAttachments` 接受应用根、当前资产根和本地文件安全策略端口，支持正文、inline、资产库、本地文件与智能体私有附件。任务第一次读取时固定字节快照；预算和发送复用同一份内容。本地路径每次访问都重新检查当前沙箱、死区与审批，外部策略更新可撤销后续读取。应用与资产路径继续使用现有真实祖先路径校验，单文件和任务字节快照总量上限为 64 MiB。生命周期结束后调用 `dispose()`。

`electron/context-images.ts` 的 `NodeContextImages` 由执行所有者持有，加载 `native-runtime/knowledge-addon.node` 的 `RasterImageRuntime`。解码、EXIF 方向归一化、像素方差分析、裁剪、缩放与编码在原生后台线程执行；同时只保留一个活动解码组，队列上限 32。输入和输出单张上限 64 MiB，解码像素上限 32 Mi；支持 PNG/JPEG/WebP/GIF/BMP/TIFF/ICO/PNM 解码，动图按静态首帧处理。输出支持 PNG、白底 JPEG 与按质量编码 WebP。SVG、AVIF 与 PDF/Office 转图继续在专门服务中适配。

长图切点与有效参数复用 `smart-ocr/utils/imageSlicePlan.ts`；Renderer 原 Canvas 入口继续导出同一契约。`createScope()` 持有任务切片计划，`wrapTokenCalculator()` 根据各切片尺寸计算预算，`processImageSlices()` 再消费相同字节及计划。整组编码成功后才向后续处理公开切片；失败沿用原图回退，取消直接结束当前调用。统计预览保持惰性读取并标记估算。透明图缩放使用关联 alpha，JPEG 先铺白底，以保留透明边缘的视觉语义。

`shutdown()` 关闭活动原生实例并等待队列释放；scope 的 `dispose()` 取消所属等待并释放字节/计划。上述服务已在 Node 中完成真实图片到原 OpenAI 映射及 HTTP 请求的验证，Main 渠道/Key、当前文件策略和资产根通道已接通，正式 Worker 已持有这些上下文资源；真实任务与工具/审批所有权继续实施。

## 共享文件命令

Electron 业务分派支持文件元数据、目录判断/列举、日志与 JSONL 追加、上传文件保存、复制到应用目录、应用资源目录复制及系统回收站删除。元数据时间采用秒级 Unix 时间，字段沿用现有 camelCase 契约。

应用目录命令检查规范化路径及真实祖先路径，保护根目录并识别 junction 越界；文件和目录删除通过操作系统回收站完成。携带 Agent 文件安全快照的文本/二进制读取、文本写入、追加与删除执行白名单、死区、审批和大小规则，目录删除同时检查嵌套内容。

## 资产存储

资产业务由主进程统一管理，使用现有 JSONL 目录索引与月度哈希索引。共享命令支持路径和字节导入、当前月去重、来源合并、筛选/排序/分页、资产读取、缩略图、音频波形、派生数据和索引重建。

默认根目录为应用数据目录下的 assets；应用设置的 customAssetPath 使用绝对路径。每次操作按当前设置选择资产根，切换时加载对应索引。列举可补录标准类型/月度目录中尚未登记的文件，重建保留既有来源与派生元数据。

图片尺寸及缩略图通过 Electron 原生图像接口生成，音频时长/封面复用项目音频元数据解析库。索引写入完成后再返回成功，多窗口共享同一操作队列。原始文件与缩略图通过操作系统回收站删除，派生文件清理单独核对路径和引用关系。旧版 Office 文档的自动转换见下文。

## 配置备份与智能体资源

配置管理由主进程承接列举、ZIP 导出和合并/覆盖导入。备份保留现有 `manifest.json` 的 `timestamp`、`app_version`、`file_count` 字段以及应用相对目录结构，包含私有资源等二进制文件；导出过滤日志和 Chromium 的已知缓存、会话、性能数据库与锁文件。时间戳优先使用应用时区。

导入先校验路径、清单与文件数量，将所有文件限量解压到系统临时目录并核对 CRC，再写入应用目录。路径穿越、Windows 设备名/ADS、大小写重名、文件与目录冲突、符号链接和 junction 重定向会中止导入。单文件采用原子替换；实际写入阶段的权限或磁盘错误会返回已导入数量与失败文件，方便重试。合并模式递归合并对象、对数组追加去重；JSON 解析失败时沿用原契约，使用导入的原始内容。配置归档使用普通单卷 ZIP；分卷、ZIP64 需先重新打包。ZIP 上限 256 MiB，单文件解压上限 256 MiB，总解压上限 1 GiB，最多 20,000 个业务文件；大型资产可分批备份。

智能体资源位于 `agent-manager/agents/{agentId}/assets/`，支持字节保存、列举、路径/二进制读取、单个/批量/整目录回收站删除。路径读取兼容智能体根目录头像。大图和音频封面复用统一媒体解析器生成 400×400 缩略图，小图直接使用原文件；同一资源名换扩展名上传时也分配新后缀，保持前端资源 ID 与缩略图独立。资源写入按主进程队列串行，保存使用排他创建，访问同时检查应用相对路径与真实路径。

## 旧版文档转换

资产管理器「文件操作 → 文档转换设置」支持自动检测、验证程序、选择转换器，以及 LibreOffice/AbiWord 路径、超时和隔离配置。配置仍保存在 `asset-manager/config.json`，每次转换读取当前设置。

- LibreOffice 和 Windows Microsoft Office COM 支持 DOC → DOCX、PPT → PPTX、XLS → XLSX。AbiWord 与 macOS textutil 处理 Word 文档。
- WPS 按实际内容选择 Word CFB 或 RTF 转换；现代 OOXML WPS 可直接用于 DOCX 预览。其他或加密结构保留原文件，并提示在 WPS 中另存为 DOCX。
- 文件导入先按原始哈希去重，转换后记录原始与现代文件的哈希。启用转换器后可重新导入先前按原格式保存的文件，后续导入复用转换结果。字节导入沿用原格式契约。
- 缺少转换器时保留原格式并显示设置入口；执行过程出错时返回具体错误。源文件保持原样，临时转换目录在成功或失败后清理。预览副本位于应用工作目录，保留供文档查看器读取。
- 外部程序通过独立参数启动并隐藏辅助窗口；超时回收本次进程树。Office COM 禁用宏并校验实例所有权；已打开的 PowerPoint 窗口需要先关闭，以保留其现有文件。LibreOffice 默认使用独立配置目录和最高宏安全级别，用户可在设置中调整隔离选项。

Windows 的真实转换已使用本机 LibreOffice 验证；Microsoft Office、AbiWord 与 macOS textutil 分支具备契约测试，对应程序与系统的实际运行验证继续接续。

## 技能管理

Electron 已承接技能发现、资源读写、脚本执行、内置模板安装/重置、单技能安装/重命名/卸载及集合包管理，沿用现有技能管理界面和 Agent 桥接接口。用户安装位于应用数据目录的 `skills/`，内置模板随开发运行目录和安装包分发。

安装支持本地目录、ZIP 文件、HTTP(S) ZIP 链接和 Git 仓库。安装前完成解析与暂存，自定义名称保持源目录原样；集合包覆盖会更新技能归属，卸载旧集合保留后来转入其他集合的技能。失败时恢复原技能和集合记录。外部扫描总开关和各路径开关共同决定默认可用范围。

脚本运行时可配置可执行文件路径；空配置按当前系统探测 Bun/Node、Python、Shell 或 PowerShell。启动使用独立参数，工作目录为技能根目录；脚本使用当前用户权限，运行前请确认来源可信。默认超时 60 秒，总输出上限 4 MiB，退出应用时等待所属进程树回收。详细路径边界、归档限制与实现入口见[技能管理架构](../../src/tools/skill-manager/ARCHITECTURE.md#electron-宿主实现)。

## LLM 会话与草稿

Electron 已接通 `llm_chat_atomic_write` 与 `llm_chat_delete_session`，沿用 `llm-chat/sessions-index.json`、`sessions/`、`sessions-corrupt/` 和 `request-snapshots/` 布局。写入按 revision 排序，旧 revision 返回冲突结果；索引轮换最后可解析的主文件备份，同目录临时文件同步写盘后替换目标。

删除先保存持久化删除标记，再清理请求快照并将会话移入 `sessions-trash/`；迟到写入在重启后仍被拒绝。文件和目录访问通过统一应用路径检查，窗口退出时等待已接收的持久化任务完成。

主进程为同路径操作排队，并以目录租约协调其他 Electron 进程。租约每 5 秒更新、30 秒判定过期，获取等待约 5 秒；发生锁失效或超时会返回保存错误。Electron 与 Tauri 沿用独立数据目录，正式迁移按执行待办推进。

输入草稿通过现有配置管理器保存到 `llm-chat/input-drafts.json`。分离窗口将保存操作交给主窗口；真实 Windows 生产资源实例已验证会话切换、刷新、分离/回附和整进程重启恢复。请求快照文件的 revision、格式与大小限制由同一持久化后端承接。

## LLM 流式搜索

Electron 已接通 `search_llm_data_stream`、`cancel_llm_chat_search` 和平台 `Channel`，侧栏与批量管理沿用现有搜索入口。支持智能体/会话范围、精确短语、全部词和任一词匹配；消息正文、推理内容与智能体预设均参与检索。

每个渲染窗口拥有自己的搜索任务，取消命令等待所属任务停止；新搜索接替旧任务，窗口刷新、销毁和渲染进程退出释放任务。Channel 回调保留在前端，通过独立 IPC 接收定向数据；监听先注册，再发送业务命令，按请求识别流结束标记，处理完尾部事件后才完成调用并释放监听。通用事件广播与 Channel 使用独立传输。

高亮偏移采用 JS UTF-16 索引，支持中文、emoji、组合字符和 JSON 转义内容。搜索按文件扫描，最多每 10 条或约 100 ms 推送一次结果与进度，默认上限 500 条。损坏文件和并发恢复时已消失的文件可跳过；存储目录重定向仍触发路径检查错误。搜索实现与两端差异见[搜索系统架构](../../src/tools/llm-chat/docs/architecture/search-system.md)。

2026-11-04 Windows 生产资源验证覆盖真实侧栏搜索与刷新、600 文件扫描、结果上限、多窗口隔离、取消和导航清理。macOS/Linux 的实际文件系统与 IPC 运行验证待对应环境接续。

## 文件监听、图片剪贴板与系统字体

文件监听使用独立的持久 IPC 订阅。渲染器先注册回调再发起监听，返回的停止函数立即移除本地回调，再通知主进程释放原生句柄。监听支持目录递归、多个路径、file URL 与基础目录；单文件通过监听父目录过滤目标路径，以承接原子替换。批量事件最多暂存 1000 个路径，繁忙目录折叠为根目录重扫提示。窗口导航、销毁、渲染进程退出和应用退出清理全部所属监听；OS 错误以带原因的 other 事件通知调用方并关闭监听。

图片剪贴板沿用共享平台入口，使用 PNG 跨 IPC 传输，避免平台位图通道与预乘格式差异。writeImage 支持编码字节、绝对路径/file URL、已读取的快照及提供 size()/rgba() 的图像对象；readImage 返回内存快照，提供 size()、rgba() 与 close()，释放后需重新读取。局部 rid 仅用于兼容对象形状。ICO 通过 icojs 解析 PNG/DIB 帧，再交原生图像解码；输入上限为 256 MiB、64 百万像素。Electron 45 使用异步 clipboard.read()/write() 与 ClipboardItem，写入完成后才向前端返回成功。

get_system_fonts 在所属受信任顶层窗口调用 queryLocalFonts()，返回去重排序的可见字体家族。权限处理器仅授予此来源的 local-fonts，预览来源、子 frame 和外部页面继续隔离。Windows 已验证本地字体枚举与图片/文件监听原生链路；其他系统仍需对应环境验证。

Web Canvas 的磁盘内容同步保持静默，Monaco 仅将实际编辑通知父组件，避免加载文件时触发防抖回写。目录树与独立 WebView 的后续迁移进度见[功能补齐待办](../Plan/electron-feature-gap-execution.md)。

## 文件拖放

当前 WebView 与窗口的 onDragDropEvent 已接通 Electron。preload 在捕获阶段提取真实 File 的原生路径，将 client 坐标乘以 devicePixelRatio，向本窗口的独立订阅同步发送 enter/over/leave/drop。拖入阶段受 Chromium 数据保护限制，路径可能为空；最终 drop 携带可取得的绝对路径。文档内部跨节点移动合并为同次拖入，失焦与隐藏时清理悬停。脚本创建的 DragEvent 不进入原生流。

主进程验证来源并向所属窗口转发标准 tauri://drag-* 和现有 custom-drag-*/custom-file-drop 事件；当前窗口订阅直接使用 preload 流。通用事件仍可用于业务消息，本地原生拖放订阅独立隔离。全局 tauri-file-drop 仅在区域和 H5 处理器均未消费时发送，避免全局文件打开跳转抢走工具内的图片导入。

useFileDrop 在 Electron 按物理落点处理，并合并 native 捕获与 H5 冒泡产生的同次输入。提供 onFiles 时优先使用真实 File；preferFileObjects 为 false 或目录输入时优先交给 onDrop。useFileInteraction 默认优先显式 onPaths；仅配置 onFiles 时使用文件对象。DropZone 复用自身 preferFileObjects 配置。取消订阅和组件卸载移除本地监听，窗口刷新与销毁释放整个 preload 上下文。

Windows 生产资源已用 Chromium CDP 的本地文件拖放验证原生路径、File 字节、150% 缩放、多区域、跨窗口、全局兜底和刷新。独立子 WebView 的创建与其他系统实际拖放继续按[补齐待办](../Plan/electron-feature-gap-execution.md)推进。

## 插件包与 JS/Web 加载

现有插件管理页已接通 ZIP 预检、安装进度与回收站卸载。发布包可将 manifest.json 放在根目录或一个包装目录内；包装目录在安装时移除，插件最终保存到应用数据目录的 `plugins/<id>/`。主进程校验插件 ID、清单、当前平台入口和包内路径，安装完整解压后再发布目录，失败或退出取消时清理暂存数据。Native/Sidecar 包会检查 manifest 当前平台键声明的文件，执行与跨平台验证范围见[补齐待办](../Plan/electron-feature-gap-execution.md)。

插件 ZIP 最大 512 MiB、展开总量最大 2 GiB、单文件最大 1 GiB、最多 20,000 个条目；manifest.json 最大 1 MiB。预检与安装均按流核对实际大小和 CRC32，并校验大小写重名、文件/目录冲突、链接及路径重定向。当前平台 Sidecar 入口安装时保留执行权限，其余权限按安全默认值写入。

业务通过 `src/platform/modules/plugin-resources.ts` 获取已安装插件的资源 URL。Electron 将窗口授权和安装代次放在 `aiohub://app/__plugins/` 的路径中，使 JS 相对导入、UI 分块、CSS 及配套资源保留同一目录范围；插件代码在可信应用来源执行，普通本地文件继续沿用 asset 授权。卸载、更新及窗口销毁会撤销旧地址；开发前端的跨来源读取仅授权当前 loopback 来源。Tauri 沿用既有本地资源转换。

实现入口：`electron/plugin-packages.ts`、`electron/plugin-resources.ts` 与现有插件加载器。2026-11-04 Windows 生产资源已验证真实 ZIP 拖放/确认、JS 激活与相对模块、插件 UI/CSS、重复安装保护、刷新恢复及停用/回收站卸载。

## 插件 Sidecar 执行

插件专用的单次/常驻 Sidecar 命令已接通，使用 manifest 当前平台入口与声明参数，并校验插件类型、常驻模式和真实路径。安装目录为应用数据目录下的 `plugins/<id>/`；开发前端可显式使用工作区 `plugins/<repository-folder>/`，插件 ID 仍须匹配清单。`AIOHUB_PLUGIN_DATA_DIR` 指向应用拥有的 `plugins-data/<id>/`。

单次调用从独立命令回复取结果，进程退出成功后完成；常驻调用按 ID 匹配响应，业务事件、进度和日志定向投递给持有租约的窗口。监听先于启动注册，早到事件在 generation 确认后回放。崩溃/超时恢复会重新执行 startup，调用方自行决定业务操作的重试。

同插件常驻进程由多个窗口共享。页面导航、刷新、渲染进程退出和关窗释放所属租约，最后一个租约释放时停止进程；插件卸载等待运行态停止后再移入回收站。应用退出等待进程及排队操作收尾。Broker 转发要求调用方与目标进程有共同窗口归属。

每条输入/输出 JSON 行上限 16 MiB，每个常驻进程上限 256 个待处理请求；调用默认 300 秒超时，Broker 默认 120 秒超时，优雅停止等待 5 秒。Windows 强制停止使用进程树回收；优雅退出后自行脱离的后代进程需按插件行为另外评估。通用平台 Shell API 的 Sidecar 路径继续见补齐待办。

2026-11-04 Windows 生产资源已验证 AHK v2 脚本、Paddle ONNX CPU 识别与任务取消、重启恢复、多窗口共享/刷新/关闭和应用退出清理；运行证据见缺口补齐待办。

## Native 插件执行

Native 插件从 manifest 当前平台键声明的库文件加载，宿主核对 ID、类型、路径与 reloadable。调用沿用 `call(const char*, const char*) -> char*`，返回数据按 UTF-8 解析；插件提供 `free_string` 时，无论解析成功或失败均执行释放。旧 ABI 缺少释放函数时记录运行日志，剩余内存随该宿主进程退出回收。

每个插件拥有独立 utility process，并按窗口持有租约。同步 C 调用在该进程执行；进程崩溃或请求超时会拒绝关联调用，重新启用创建新宿主。页面刷新、导航或窗口关闭取消所属回复，其他持有租约的窗口继续使用。reloadable 插件的最后租约释放时结束宿主；显式卸载默认等待现有调用 5 秒，仍忙则提示稍后重试。reloadable=false 的库驻留到应用退出，运行时卸载需重启。

输入/返回值上限各 16 MiB，最多 256 个待处理请求，默认调用超时 300 秒；回收站卸载先停止宿主，应用退出清理全部 Native 宿主。Native 插件拥有当前用户进程权限，独立进程用于隔离崩溃与执行生命周期，安装前应确认插件来源。

构建入口将锁定版本的 Koffi JavaScript 与当前平台 N-API 产物放入 `native-runtime/`，builder 显式收录并解包 .node 文件，预览与分发共用相同路径。2026-11-04 Windows 已验证 Native 示例界面、并发、多窗口、刷新/重启、回收站卸载，以及 ASAR 程序的主动崩溃隔离和退出清理。macOS/Linux 动态库与签名权限随跨平台任务验证。相关 ABI 子进程测试使用本机 Rust 编译器构建轻量 fixture：`bun run test:electron electron/native-plugins.test.ts`。

## Git 工作区与分析器

Electron 通过系统 Git 读取本地仓库，入口为 `electron/git.ts`，工作区文件与快照位于 `git-files.ts`，历史/概览位于 `git-history.ts`，分析流位于 `git-streams.ts`。现有提交助手与分析器共用这组后端。

仓库选择使用真实 worktree 根；路径检查覆盖 Git 元数据、越界与目录链接。已跟踪文件的放弃操作恢复 index 内容，未跟踪文件进入回收站。历史文本读取上限 1 MiB，历史媒体快照上限 64 MiB。

读任务跟随所属窗口页面释放；历史和补全各有独立取消入口。已接受的写操作按仓库排队，关窗后继续收尾，应用退出等待队列完成。历史读取固定提交起点并按页投递；分析选项控制文件路径、行级统计及分支推断的成本。

Windows 生产资源已验证提交助手工作区/媒体差异、刷新恢复与写操作退出等待。分析器验收及剩余操作以[补齐待办](../Plan/electron-feature-gap-execution.md)为准；创建真实提交需获得主人的明确许可。

Git 远端 push/pull 与标签推送读取应用代理配置，system 沿用 Git 配置/环境，none/custom 按本次命令设置，网络操作超时为 30 秒。标签推送限定选中 ref，保留 Git 的普通分支同步策略。分支和标签引用在写入前校验，合并冲突从实际 index 判断。终端由用户操作打开并由用户持有，应用退出保留该交互终端。普通退出与应用内显式退出均等待 Git 写队列完成；显式退出同时等待 FFmpeg 取消清理。真实创建/改写提交、有效 stash 往返、外部远端认证与跨平台终端运行的验收状态见执行待办。

## 内容查重

`electron/content-deduplicator.ts` 分派 `scan_content_duplicates`、`stop_dedup_scan`、`read_file_content_for_diff` 和 `delete_duplicate_files`。扫描使用现有 `native-runtime/knowledge-addon.node` 中的 `DedupRuntime`，复用 `src-tauri/src/content_deduplicator.rs`；构建沿用统一 Electron 入口。

每个扫描创建一次性 runtime，进度在原生有界队列中保存，由主进程按窗口归属投递。相同窗口同一时间接受一个扫描，其他窗口独立执行。停止等待 worker 结束；导航、刷新、关窗及退出会取消所属扫描并完成收尾。

Diff 默认读取上限 512 KiB，Electron 显式上限最多 64 MiB，拒绝链接路径、目录、非法 UTF-8 和读取期间变化的文件。回收站处理复用目录清理服务，查重入口限定普通文件，并返回明确成功路径。前端以成功路径更新分组与勾选。

Windows 生产资源已验证扫描/预览/回收站、双窗口隔离、停止、刷新、关窗和扫描中退出。验收证据与目录工具剩余任务见[执行待办](../Plan/electron-feature-gap-execution.md)。

## 目录搜索

`electron/directory-search.ts` 分派 `dir_search`、`dir_search_cancel`、`dir_replace`、`dir_replace_single`、`dir_replace_preview`、`dir_search_copy_files` 和 `dir_search_move_files`。现有 `native-runtime/knowledge-addon.node` 的 `DirSearchRuntime` 与操作入口复用 `src-tauri/src/dir_search.rs`，构建沿用统一 Electron 入口。

全应用一次接受一个搜索，保持四个 walker 线程及原有预算。原生结果通道容量 500、N-API 事件队列容量 8，主进程每 25 ms 排空；满队列背压可随取消释放。进度与结果按窗口归属投递，取消需匹配窗口和 searchId。平台 invoke 对 `dir_search` 附加已有 Channel 完成标记，等待末批事件投递后再解析回复，业务调用方保持原接口。

导航、刷新、关窗、工具卸载和应用退出取消并等待扫描完成。预览随窗口释放失效；已接收替换/复制/移动在应用内串行执行，窗口释放后继续完成，应用退出等待队列排空。路径校验覆盖链接和 Windows reparse point，写入前核对原内容；单项替换保留字节级换行状态，同路径整理跳过，跨卷移动报告源删除失败。

搜索匹配偏移按 Unicode scalar 计数。前端展示使用字符切片，Monaco 入口转换为 UTF-16 列；替换参数仍保持原生偏移契约。成功替换通知预览重新读取；未保存草稿保留并提示核对。

Windows 验证覆盖 10,000 文件完整流式结果、双窗口隔离、预算/取消、文件写入与退出排空；补充界面验证覆盖 Unicode 高亮、预览刷新与最后匹配替换后的草稿保留。证据和后续平台验收见[执行待办](../Plan/electron-feature-gap-execution.md)。

## 符号链接移动

`electron/symlink-mover.ts` 分派单个/批量属性验证、完整预检、搬移并链接、仅创建链接、取消、最新日志和历史日志八个命令。N-API 的 `SymlinkMoverRuntime` 与查询入口复用 `src-tauri/src/symlink_mover.rs`；`src-tauri/src/file_operation_types.rs` 提供两侧统一的进度、日志和文件验证结构。

写操作在全应用中单任务运行，请求参数接收时快照。进度携带任务身份并仅发往所属窗口，取消同时校验窗口与可选 `operationId`。原生复制的进度队列最多保留 128 条较新更新；最终结果与操作日志随调用回复返回。只读查询在窗口释放后失效。

同盘改名后创建链接，失败恢复原路径；跨盘使用暂存复制、类型/大小校验、源备份改名、目标提交和原路径链接。源备份回收失败时保留备份，并在日志中提供路径。取消在当前复制返回后清理暂存，导航、工具卸载、刷新、关窗及应用退出等待这一收尾过程。

预检和执行检查路径祖先中的符号链接与 Windows reparse point，批量源完整检查父子重叠；硬链接限制同设备普通文件。工作台从预检起锁定参数，成功项按原生明确路径更新，未完成项可在取消后继续处理。操作历史共享保留最近 100 条，窗口优先获取自己的最新完成记录。

Windows 生产资源已验证硬链接、文件/目录符号链接、镜像结构、真实跨盘复制和备份回收、512 MiB 任务取消隔离以及导航/刷新/关窗/退出；工具页面停用会取消并解绑，重新激活恢复监听。证据和跨平台后续项见[执行待办](../Plan/electron-feature-gap-execution.md)。

## 系统脉搏

`electron/system-pulse.ts` 承接启动/停止命令，`native/knowledge-addon/src/system_pulse.rs` 复用 `src-tauri/src/system_pulse.rs` 的完整硬件采集器。CPU、内存、网络、GPU 约每秒采样，磁盘容量和进程数每五次采样刷新；Windows PDH 继续提供实时频率与全盘汇总 I/O，NVML 提供 NVIDIA 指标。温度、GPU 和编解码等可选数据沿用已有字段约定。

多个窗口共享一个 collector，每窗口保留一份当前订阅。事件只投递给订阅窗口，附带订阅身份；停止校验窗口与可选身份，旧请求保持当前订阅。原生侧只保留最新快照，主进程每 100 ms 读取；最后订阅释放后取消并等待 worker，之后的新启动按顺序恢复。文档刷新、导航、渲染进程退出、关窗和应用退出均释放所属订阅。

前端通过 `usePageActivity()` 管理缓存页面的启停，手动暂停保留用户选择和最后快照。监听先于启动注册，迟到监听与旧身份事件按当前会话状态处理；错误写入模块日志并在页面提供重新开启入口。Windows 最终生产资源已验证完整仪表盘、共享/隔离、缓存页面、复制、刷新、关窗和退出。证据及跨平台后续项见[执行待办](../Plan/electron-feature-gap-execution.md)。

## 网页蒸馏室

`electron/web-distillery.ts` 分派快速抓取、代理、Cookie/LocalStorage 与加密共 11 个命令。`WebDistilleryRuntime` 复用 `src-tauri/src/web_distillery/core.rs`；Chrome133 TLS/H2 指纹、字符集检测与挑战页标记保持共享实现，系统/直连/自定义代理沿用应用网络设置。HTTP(S) 重定向显式限制为 10 次，跨来源跳转由网络库移除 Cookie 和认证头。

每窗口/文档持有独立的原生 runtime、代理来源和身份。监听绑定随机 loopback 端口，前端以随机子域 `.localhost` 访问，并使用精确 Host 校验；响应带 no-store/no-referrer，远端 Set-Cookie 留在私有 Jar。跨来源资源按目标来源发送身份，转发 Referer/Origin 使用目标站来源。主进程只读取网络设置投影，错误日志保留操作上下文。

代理控制在同窗口串行执行，其他窗口独立运行。刷新、渲染进程退出、关窗和应用退出取消并等待所属原生资源。前端停用缓存页面时销毁 iframe 和代理，DOM 快照以 requestId 关联；提取和预览按当前请求代次接收结果。配方绑定身份在创建 iframe 时传入，Cookie/LocalStorage 在目标请求与页面脚本之前还原。

身份加密沿用原格式与系统后端：Windows DPAPI，macOS/Linux 的系统凭证服务与 AES-GCM。Windows 生产资源已验证快速/智能/交互工作台、双窗口与生命周期，以及实际身份保存、Cookie 加密落盘和刷新恢复。实机验收使用本地合成页面和独立开发数据；具体证据与跨平台后续项见[执行待办](../Plan/electron-feature-gap-execution.md)。

## 屏幕采集与原生 OCR

Windows Electron 接通 `capture_screen_rect`、`check_native_ocr_availability`、`native_ocr`。`electron/image-capture.ts` 通过 `ImageCaptureRuntime` 复用共享 Rust GDI/WinRT 核心。`screenCapture` 能力在 Windows 开放；窗口自动化也已接通，播放器覆盖层按后续进度接续。

采集使用物理像素和每显示器 DPI 环境，保留原 aHash 与变化帧 PNG 契约。监控框上报物理边界及自身缩放，内容区按逻辑边框/标题栏内收；Electron 坐标转换考虑显示器原点。首次打开位于主窗口内，既有位置通过保存配置恢复。

每文档串行处理图像操作，全应用至多 2 个在执行；窗口/全应用分别最多接受 2/8 个未结束请求。刷新、主文档导航、渲染进程退出、关窗和应用退出取消所属原生 token，迟到结果失效，退出等待已接受任务收尾。OCR 的 WinRT 操作具有 30 秒总期限，解码前限制数据，位图分配前检查系统最大边长。

透明组件窗口应用主题时保留透明底色，跳过 DWM 背景材质；包括 `none` 在内的材质调用也会使其内容区变为不透明。此规则同时用于初次加载、刷新和主题重应用。

Windows 生产资源已验证合成中英文图片识别、Smart OCR 导入/结果/历史、物理截图像素与去重、监控框预览/字幕以及缓存导航、停止、刷新和关窗。证据与后续验收见[执行待办](../Plan/electron-feature-gap-execution.md)。

## Windows 窗口自动化

八个 `wa_*` 命令通过 `electron/window-automation.ts` 和独立原生辅助进程复用共享 Rust Windows 核心。支持真实窗口选择、客户区截图/取色、后台子窗口消息，以及临时切换焦点的 SendInput 前台输入。截图返回 ArrayBuffer，工作台的取点、颜色判断与 OCR 沿用既有前端流程。

动作全局串行，窗口/文档拥有各自队列。刷新与关窗取消排队动作，已开始的输入完成按键释放与焦点/光标恢复；目标调用超过 5 秒则回收辅助进程。退出等待清理完成，进程清理失败时停止接受新动作。Windows 已验证实际动作流、截图取点、后台/前台输入、真实辅助进程超时和双窗口生命周期，具体证据见执行待办。

## 系统代码格式化与环境检测

`format_code` 与 `code_formatter_status` 经独立辅助进程接入共享 Rust 格式化库。PHP 使用内置 Mago；Rust/C/C++ 使用系统 rustfmt、clang-format，留空时通过 PATH 查找，也可在工作台保存绝对路径与 Rust edition。参数校验与引擎 argv 由同一 Rust 库提供，源码经内存或 stdin 传入。

任务全局串行，单文档/全应用最多接受 2/8 个任务；输入限制 4 MiB、输出合计限制 16 MiB。引擎检测/外部格式化分别限时 5/10 秒，宿主请求期限为 15 秒。刷新、关窗和退出终止所属进程树，并等待退出后清理独立工作目录；下一窗口任务在清理后继续执行。清理无法确认时提示重启应用。细节见 [Code Formatter 架构](../../src/tools/code-formatter/ARCHITECTURE.md)。

运行环境页沿用 `check_command_version` 检测 FFmpeg、FFprobe 和 Git。2026-11-05 Windows 生产资源已验证三张卡片的真实版本、失效路径提示与恢复；代码格式化已验证四种语言、自动格式化、路径持久化、错误后保留源码，以及真实挂起程序的超时和父子进程回收。macOS/Linux 系统引擎运行继续按执行待办验收。

### 应用级渠道与凭据事务

Electron 的 `useLlmProfiles` 通过受信任宿主操作 `llm.config.load` / `llm.config.save` 调用 `electron/llm-configuration.ts`。主进程使用本次应用数据根目录，统一维护 `llm-service/profiles.json` 与 `secrets.dat`；保存携带加载时的 revision，过期写入返回可行动的冲突错误。Renderer 的连续保存按顺序提交各自捕获的快照，跨窗口实时配置投影仍待补齐。

原有凭据快照匹配、历史回退及 v1 兼容逻辑位于 `src/utils/llm-secret/vault.ts`，Renderer 存储适配和 Node 原子文件存储复用同一内核。Node 事务具备目录锁、部分提交恢复、可解码备份回退和退出排空；结构文件损坏、凭据与备份缺失或均不可解码时保留文件并返回错误。旧 localStorage 由界面在宿主事务提交成功后清理。

原密钥选择、用户禁用、渠道级熔断、自动恢复及哈希索引逻辑位于 `src/llm-apis/configuration/keyManager.ts`，`useLlmKeyManager` 注入现有响应式状态和存储服务。密钥日志使用哈希标识。Electron 的密钥状态持久化由主进程持有；真实模型请求继续由 Renderer 调度，后续执行所有者通过应用级服务端口接管请求生命周期。

### 应用级 Key 状态与窗口投影

主进程 `electron/llm-key-state.ts` 接收受信任操作 `llm.keys.call`，按增量命令维护用户禁用、失败计数、轮询位置和渠道级熔断设置。每笔操作在目录锁内读取既有 `key-states.json`、应用共享密钥策略并原子提交，格式版本保持 `1.1.0`。旧明文索引在加载时迁为哈希，损坏文件保留并返回错误。退出等待已接收事务完成。

`keyClient.ts` 为窗口持有响应式投影。设置开关和手动恢复保持同步交互，异步回执和 `llm://key-state` 广播更新权威快照；等待中的本地编辑会在新快照上重放，写入失败时撤回。广播只含哈希状态与进程内递增版本；选中的凭据仅返回申请方。窗口发送同名状态事件会被宿主拒绝。

选 Key 使用模型中间件已选定的有效渠道快照，同样支持未保存密钥列表的显式检查与上层允许的停用渠道检查。异步选 Key 等待可取消；取消后宿主继续收尾已接收事务，模型链路拦住迟到结果与网络派发。Key 成功/失败回报通过主进程提交；模型和旁路渠道入口均等待新的选 Key 边界。真实 Agent 请求及工具循环所有权继续按后台执行阶段迁移。
