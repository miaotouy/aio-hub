# Electron 桌面开发

> 当前阶段：基础宿主、本地分发、模型传输、共享资产、技能与工作区适配已接入，领域后端持续迁移，2026-11-04。Tauri 开发与发布入口继续保留。

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

共享前端通过 `src/platform/core/capabilities.ts` 区分宿主集成和系统支持范围。后台 JavaScript 运行时按能力启动；Electron 版暂未接通的系统代码格式化、窗口自动化、屏幕监控和外部播放器覆盖层展示对应提示，并保留前端格式化、方案编辑导出、本地视频或内置播放器入口。

## 后续能力

模型请求、命令 Channel、流式会话搜索、会话持久化、共享文件与资产、配置归档、智能体私有资源、技能管理/脚本执行、文件监听、图片剪贴板、系统字体及当前窗口文件拖放已接入。具体范围与实机验证见[缺口补齐待办](../Plan/electron-feature-gap-execution.md)。

插件包安装/卸载与 Native/Sidecar 执行、知识资料库/Recall、Git、FFmpeg、目录工具和系统监控等领域后端继续迁移；旧业务的“打开所在目录”等命令入口也待接通。通用 Shell/Sidecar、独立子 WebView 和更新器适配仍返回能力错误。依赖这些能力的工作流可从 Tauri 入口执行。

后台 Agent 的独立运行、关窗后的任务延续、系统退出保存、正式更新/数据迁移，以及 macOS/Linux 构建与运行验证仍需接续。Windows 当前窗口文件拖放与落点定向已通过真实 Electron 验证；原生文件选择对话框完整交互和跨平台窗口材质另行走查。最新调查见[功能缺口调查](../design/electron-feature-gap-audit-2026-11-04.md)。

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

早期生产首页走查发现 `background_runtime_get_status`、`get_all_skill_manifests`、`recall_preview_legacy_migration` 三处启动能力缺口。后续批次已接通技能清单，并引入后台运行时的能力分层；知识资料库初始化与旧数据迁移仍待接续，最新状态以缺口补齐待办为准。

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
