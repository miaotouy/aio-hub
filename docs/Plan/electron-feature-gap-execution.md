# Electron 功能缺口补齐待办

依据：[2026-11-04 功能缺口调查](../design/electron-feature-gap-audit-2026-11-04.md)、[迁移总纲](electron-migration-master-plan.md)。

按共享主链、工具后端、后台与发布推进；每批完成后记录验证与提交。调查的命令数量保留为当时快照，完成状态以本页和当前源码为准。

## 1. 默认模型传输

- [x] 默认模型请求进入 Electron 主进程网络层。
- [x] 展开嵌套 tagged LocalFileRef 与兼容 data URL，普通用户文本保持原样。
- [x] 原始文件和 multipart manifest 使用宿主文件流上传；普通 FormData 保持 Fetch 编码行为。
- [x] 承接认证头、重定向、流式拉取、响应取消、响应头超时和窗口请求所有权。
- [x] 承接系统/直连/自定义 HTTP(S)/SOCKS 代理、loopback 绕过和逐请求证书校验策略。

实现：`electron/llm-http.ts`、`electron/llm-body.ts`、`src/platform/modules/llm-http.ts`、`src/llm-apis/common.ts`。模型传输使用 Node HTTP/1.1；普通平台 HTTP 保持 Chromium 网络栈。允许 HTTP/2 的配置仍可通过 HTTP/1.1 完成请求，后续可单独扩展连接优化。

验证（2026-11-04）：

- Electron/共享 HTTP 相关测试 12 项通过；前端适配与模型分流相关测试 8 项通过。
- Electron 和前端类型检查、平台隔离检查、Vite 生产构建通过。
- 真实 Windows Electron 隔离实例完成 13 项本地协议抽查：无 CORS 端点、默认/native 路径、JSON/原始文件/multipart/FormData、流式首段与响应头后取消、超时、自签名证书严格/放宽/再严格、自定义 HTTP 代理。
- 证书放宽只作用于当前请求；使用临时本地端点验证，远程 Provider 账号请求由后续业务验收补充。

## 2. 共享文件与资产

- [x] 遗留文件元数据、列举、追加与应用目录复制/清理命令。
- [x] 回收站删除语义及应用目录安全边界。
- [x] 资产根目录、列举、导入、读取及派生数据。
- [x] 旧版 Office 自动转换与转换器检测/配置接口。
- [x] 通用上传文件保存、头像文件复制与智能体资源目录复制。
- [x] 配置 ZIP 导入/导出、领域专用智能体资源保存接口。

文件批次验证（2026-11-04）：

- 补齐 9 个业务命令：元数据、目录判断/列举、追加、应用目录复制、上传文件保存、回收站文件/目录删除和应用目录整树复制。
- 复用命令入口同步承接 scoped 文本/二进制读取、写入大小限制、白名单/死区/审批规则、嵌套删除检查与排他创建；旧配置中的相对授权项保持忽略。
- 应用目录操作同时检查词法路径和真实路径，阻止穿越、根目录删除与 junction 越界；目录复制在写入前检查链接。
- 文件命令与通用文件适配相关测试 9 项通过，Electron 类型检查通过。
- 真实 Windows Electron 隔离实例完成 13 项协议抽查，含资源目录复制、scoped 读写和真实 Windows 回收站文件/目录删除。

资产批次验证（2026-11-04）：

- 接通 23 个资产命令，覆盖根目录、路径/字节导入、读写查询、来源管理、缩略图、波形/派生数据、去重与索引重建。
- 沿用 `.catalog/assets.jsonl` 和月度 `.index.json` 格式，识别旧来源字段；操作串行、索引原子保存，切换自定义根目录时重新加载对应资产。
- 原文件复制与哈希读取使用文件流；图片支持尺寸提取及 400×400 缩略图，音频支持时长和内嵌封面。文本/代码扩展名沿用现有 MIME 约定。
- 列举现有标准存储目录时补录缺失条目；重建保留来源、波形、派生数据与已登记的自定义子目录。损坏索引明确提示恢复操作，避免直接覆写。
- 移除最后来源或完全删除时使用系统回收站；失败条目保留以便重试。派生文件清理检查原始资产与索引边界。
- 资产相关测试 9 项通过，与共享文件测试合计 18 项通过；Electron/前端类型检查与 Vite 生产构建通过。
- 真实 Windows Electron 完成 15 项端到端协议抽查，另验证 MP3 内嵌封面；资产管理器实际显示图片/音频、来源统计和缩略图。生产资源预览再通过 8 项抽查，覆盖原生图像/音频解析、去重、元数据重建、补录与二进制文本拒绝。
- 本资产批次先按原格式保存旧版文档；后续自动转换实现与验证见下方文档转换批次。

配置与智能体资源批次验证（2026-11-04）：

- 接通 3 个配置归档命令与 7 个智能体资源命令，保留 ZIP 清单、相对目录和资源信息契约。支持合并/覆盖恢复及私有资源的保存、读取、列举和回收站删除。
- 配置导出过滤日志及 Chromium 的已知缓存、会话、性能数据库与锁文件；真实运行态发现的占用数据库已纳入过滤。时间戳遵循应用时区。
- 导入先校验路径、重名/目录冲突、清单和数量，再限量解压到临时目录并核对 CRC。应用路径同时校验真实祖先目录，拒绝符号链接和 junction 重定向；实际写入逐文件原子替换，失败返回可重试的文件列表。
- 智能体资源复用原生图片和音频封面解析，大图/封面缩略图为 400×400，小图沿用原文件。上传按主进程队列串行并排他创建，不同扩展名的同名资源也保持 ID 与缩略图独立。路径/二进制读取兼容根目录头像。
- 新增 10 项公开行为测试；与共享文件、资产服务相关测试合计 26 项通过。Electron/前端类型检查和 Vite 生产构建通过。
- 真实 Windows Electron 生产资源预览完成 16 项协议验证，覆盖二进制 IPC、资源同名并发保存、音频封面解码、配置备份恢复/合并、恶意归档拒绝，以及单个/批量/整目录的系统回收站删除。
- 归档限制：ZIP 256 MiB、单文件 256 MiB、总解压 1 GiB、20,000 个业务文件。旧版 Office 转换见下方独立批次。

文档转换批次验证（2026-11-04）：

- 接通转换器发现/检查与旧文档预览接口，支持 LibreOffice、Microsoft Office COM、AbiWord 和 macOS textutil。沿用资产管理器转换设置，按支持范围将 DOC/PPT/XLS 与旧版 WPS 转为 DOCX/PPTX/XLSX。
- 路径导入保存原始及转换后双哈希，先去重再启动转换器；启用转换后重新导入原格式资产可补做转换，后续导入复用转换结果。字节导入保持原契约。
- WPS 按 OOXML、Word CFB、RTF 识别；加密/未知容器提示另存 DOCX。转换输出校验真实 OOXML 格式；失败保留原文件与目录索引，清理转换临时目录。
- 外部进程使用无 shell 参数、输出上限、超时和进程树回收；LibreOffice 隔离配置并禁用宏，Office 仅清理确认属于本次操作的实例，已有 PowerPoint 窗口保持原样。
- 新增 10 项转换/进程公开行为测试，与资产、文件、配置和智能体资源相关测试合计 36 项通过；Electron 类型检查与生产构建通过。
- 真实 Windows Electron 使用本机 LibreOffice 完成 21 项协议抽查及 5 项内容检查，覆盖 DOC/PPT/XLS、Word CFB/RTF WPS、现代 WPS、双哈希、去重、重导入恢复、越界拒绝与临时目录清理；源文件内容保持原样。
- 真实设置界面完成检测走查；LibreOffice 状态展示版本，Office COM 不可用时显示检查安装或切换转换器的操作建议。
- 本机 Microsoft Office COM 实例不可用、AbiWord 未安装，textutil 依赖 macOS；这三类后端已做契约测试，真实程序和对应系统验证仍待接续。

## 3. 基础工作区与技能

- [x] 技能发现、管理和相关命令。
- [x] 启动期能力分层与准确的宿主能力提示。
- [x] 自定义缩放与失败后的 resizable 状态恢复。
- [x] 托盘设置、业务退出/设置导航、拆分窗口会话与 Canvas 窗口。
- [x] 有会话数据的对话区/输入框草稿同步、保存与重附着联动验收（导入会话、刷新与整进程重启）。
- [x] 文件监听、图片剪贴板与系统字体。
- [x] 当前 WebView / 窗口的文件拖放适配、坐标定向与重复导入保护。
- [x] 承接旧业务的打开所在目录、打开路径和打开 URL 命令，复用现有 opener 适配；恢复资产、智能体、用户档案和设置页入口。
- [x] 环境设置页的命令版本检测；Windows 生产资源已验证 FFmpeg、FFprobe、Git 三卡片的真实版本、失效路径与恢复。
- [ ] 独立子 WebView 的创建、管理与领域浏览器命令。当前无业务直接调用通用构造/枚举，优先按领域浏览器的真实路径推进。

共享打开与目录树批次验证（2026-11-04）：

- 接通 `open_file_directory`、`open_path_force`、`open_url` 与 `generate_directory_tree` 四个业务命令。旧业务和 SDK 的打开入口共用宿主边界：目录直接打开、文件在管理器中定位，保留原成功结果；错误向调用方传递。外链沿用 HTTP/HTTPS/mailto 协议和凭证限制，SDK 定位允许失效的目录链接作为待选中项。
- Electron 目录树采用异步 Node 文件遍历，元数据读取每批 32 项，并在批次和目录汇总间让出事件循环；沿用现有 snake_case 节点、大小与统计包络。支持文件/隐藏项开关、0 表示无限深度、目录优先及大小写无关名称排序、目录显示大小汇总；隐藏文件节点时仍计入文件数量。
- 忽略规则只从选中根与子目录加载，保留嵌套覆盖、否定规则、自定义白名单优先级、根锚定、目录规则、转义和 glob 备选。明确选中的目录链接可作为根，后代链接作为叶节点；忽略文件链接跳过。扫描按窗口归属，刷新、关闭、渲染进程结束和应用退出取消对应任务；子目录读取失败可返回带错误的部分树。
- 新增 11 项行为测试，覆盖原生打开选择/错误/外链边界、目录结构/统计、过滤、链接、窗口取消与重新扫描。相关文件与安全测试合计 23 项通过；Electron 类型检查、平台隔离、相关 lint 与完整生产构建通过。
- 真实 Windows Electron 生产资源完成 8 组协议/业务服务抽查，以及独立窗口扫描和刷新后重新扫描。Windows Shell 实际打开目录、定位文件及旧打开路径入口已验证；目录树页面实际生成与应用 .gitignore，Canvas 编辑器实际展示 src/中文.js、index.html 并加载正文。外部链接的允许路径由行为测试验证，实机覆盖拒绝协议与携带凭证的 URL；macOS/Linux 的原生打开与文件系统行为继续接续。
- 本批后重新盘点：前端引用唯一命令 324 个，其中 97 个进入 Electron 分派、227 个未覆盖；主进程分派 114 个业务命令。证据位于已忽略的 `.tmp/electron-workspace-files/`：`runtime-result.json`、`runtime-lifecycle.json`、`tree-filtered.json`、`canvas-editor.json`、`command-inventory-current.json` 和 `build.log`。

技能批次验证（2026-11-04）：

- 接通 23 个技能命令，覆盖用户/外部扫描、预览、资源读写、脚本运行、内置模板安装/重置、目录/ZIP/下载/Git 安装，以及重命名、卸载和集合包管理。开发与生产运行目录携带内置模板，安装包沿用独立 resources 资源目录。
- 安装先校验和暂存，自定义名称保持源目录原样；切换失败回滚已有技能与集合记录。集合覆盖转移归属，旧包卸载保留已转入其他集合的技能。
- 资源与脚本入口同时校验相对路径和真实路径。外部目录链接可作为显式扫描的技能根；默认资源访问随扫描总开关即时生效。ZIP 校验原始条目名、链接、大小、路径冲突和 CRC，临时清理仅作用于本次创建的工作区。
- 脚本使用显式或可用运行时，参数独立传递，保留标准输出/错误和退出码。默认超时 60 秒，输出上限 4 MiB；超时、输出溢出和应用退出回收所属进程树；退出同时等待进行中的安装与资源写入完成。脚本以当前用户权限运行，工作目录设置用于相对路径解析。
- 新增 13 项工作流测试，与文档转换、进程与配置归档相关测试合计 28 项通过；既有技能 Agent/宿主环境测试 8 项通过。Electron/前端类型检查、平台隔离检查与生产构建通过。
- 真实 Windows Electron 完成 25 项协议检查，覆盖内置模板、本地/ZIP/重定向下载/真实 Git 克隆、脚本参数及失败结果、集合归属、重命名、重置与清理；源技能保持原样。另验证应用退出后脚本子树停止写入且控制实例清理。
- 真实技能页面完成列表、概览、脚本索引、集合分组和用户安装筛选走查；集合来源使用可读标签，分组标题、版本和操作保持同行布局。安装界面复用已识别的技能包；实机确认 URL 单技能安装仅下载一次，集合预览返回及取消后清空准备目录，来源切换或关闭后丢弃过期识别结果。集合选择使用分层名称与说明布局。
- 本批实机脚本验证使用 Windows Bun；Python、Shell、PowerShell 及 macOS/Linux 对应解释器和安装包验收继续随待办推进。

能力分层批次（2026-11-04）：

- 在平台层区分桌面宿主、操作系统与已接通的业务能力，提供可用状态、原因分类与界面提示；原有 Windows 能力布尔入口复用同一状态。
- 后台 JavaScript 运行时仅在支持的宿主启动，显式调用保留能力错误；启动失败释放事件订阅，可重试连接。
- 该批次为系统代码格式化、窗口自动化、屏幕监控和外部播放器覆盖层补充对应宿主提示；保留输入、方案编辑导出及前端工作区。
- 能力、后台桥生命周期、格式化、窗口绑定与屏幕工作区相关测试 19 项通过；平台隔离检查通过。Electron/前端类型检查与生产构建通过。真实 Windows Electron 完成启动、方案创建编辑、JSON 格式化、系统格式化输入保留及四个相关页面的能力提示走查，屏幕/本地视频与内置/外部播放器工作区可切换。视频处理与原生后端的实际工作流随领域工具待办验收。

窗口缩放批次（2026-11-04）：

- 接通八方向自定义缩放，以屏幕 DIP 坐标计算尺寸并保持对边锚点，遵守窗口最小/最大尺寸。固定窗口先临时启用缩放，再读取 Electron 恢复后的配置约束，修正原尺寸锁定问题。
- 渲染器捕获启动指针，合并移动更新并串行发送；释放、取消、Escape、失焦和页面离开完成收尾。主进程按窗口归属持有会话，导航、隐藏、最小化、最大化、全屏、渲染进程退出、关闭及心跳超时释放会话并恢复原始 resizable。
- Tauri 共用入口在 finally 中恢复临时设置；原本可缩放的窗口保持原状态。监控框八方向缩写映射到平台完整方向，复用同一错误处理。
- 相关 5 个测试文件共 18 项通过，覆盖八方向与约束、窗口归属、失败恢复、异步开始前释放、页面离开及 Tauri 设置恢复契约；Electron/前端类型检查、平台隔离检查和 Vite 生产构建通过。
- 真实 Windows Electron 生产资源预览验证左右手柄拖动、八方向协议、约束与对边锚点、Escape 回滚、失焦和刷新恢复，以及原始 resizable 为 true/false 和跨窗口拒绝。150% 显示缩放下观测到约 1–2 DIP 的系统取整偏差；macOS/Linux 与 Tauri 真实窗口交互继续在对应环境验收。
- 实机证据位于忽略目录 `.tmp/electron-resize/`：`drag-result.json`、`lifecycle-result.json`、`drag-final-ui.png`；主进程和前端适配均已由本次生产构建生成。

桌面工作区批次（2026-11-04）：

- 托盘显示与关闭策略读取现有应用设置，界面开关即时更新宿主；隐藏前保留任务栏或托盘找回入口。存在子窗口时恢复主窗口，退出复用业务确认，监听尚未就绪时使用原生确认。子窗口设置导航可恢复主窗口并在订阅就绪后补发。
- 分离会话按创建窗口归属管理，支持预览、固化、位置/状态更新、取消及超时回收；导航、渲染进程退出和窗口销毁清理临时会话。重复请求合并，空显示标题沿用应用名称。Canvas 使用独立注册表，支持创建、列举、恢复聚焦和关闭全部。
- 实机发现生产 CSP 会拦截 Canvas 的 srcdoc 脚本。现通过独立来源 `aiohub://canvas-preview` 提供受限项目预览，保留 iframe 的 `allow-scripts` 沙箱；预览与项目资源按所属窗口授权，校验真实路径，页面离开时撤销。HTML、内联按钮、本地 JS/CSS 与宿主隔离已实机验证。
- 实机发现三窗口广播的非处理窗口会抢先返回“未找到匹配的操作处理器”，造成草稿保存误报；广播现在仅由拥有处理器的窗口响应，定向请求继续返回明确错误。显示器工作区按共享物理像素契约返回嵌套 position/size，供分离输入框计算可用高度；补齐窗口置顶状态查询，供悬浮组件读取与切换。
- Windows 生产资源实例已完成托盘切换、标题栏取消/确认退出、子窗口设置导航、组件回附、Canvas 交互与关闭等验证；复用隔离数据的无 Dev Control 重启验证已保存的托盘策略和任务栏找回。
- 对话区与输入框真实菜单可创建分离窗口。空会话时输入禁用符合当前契约；完整会话/草稿工作流须先补齐第 5 节持久化命令再验收。macOS/Linux 与 Tauri 真实窗口验证继续在对应环境开展。
- 相关 9 个测试文件共 31 项通过，覆盖托盘策略、分离会话生命周期、Canvas 项目授权/释放、显示器工作区契约及三窗口广播成功/失败响应；Electron/前端类型检查、平台隔离检查和 Vite 生产构建通过。
- 证据位于忽略目录 `.tmp/electron-workspace/`：`result.json`、`exit-result.json`、`startup-result.json`、`chat-structure-result.json` 及界面截图。

文件监听、剪贴板与字体批次（2026-11-04）：

- 接通文件和目录监听，支持递归、多路径、file URL、基础目录与延迟批处理；独立 IPC 长期订阅按窗口归属管理。单文件监听父目录以承接编辑器的原子替换，停止、导航、渲染进程退出、窗口销毁与应用退出回收监听；注册途中失效也会撤销已创建的句柄。
- 图片剪贴板通过 PNG 传输，支持编码字节、绝对路径、可复用图像快照和 RGBA 图像对象；快照提供尺寸、规范 RGBA 与显式释放。ICO 同时支持 PNG 与传统 DIB 帧，选取最大尺寸帧。编码数据限制 256 MiB、解码图像限制 64 百万像素；无效输入在写入前返回错误。
- Electron 45 的剪贴板读写使用异步接口，文字与图片写入均等待操作完成。字体通过受信任顶层窗口读取本地字体家族，去重排序；权限限定为所属应用窗口的 local-fonts。
- 真实 Canvas 验证发现磁盘内容加载会被 Monaco 再次作为编辑事件发送，形成防抖回写并覆盖外部修改。已修正为仅发送与当前受控值不同的编辑内容，保护外部编辑同步。
- 新增 18 项行为测试，保护递归/原子替换、窗口隔离与注册失败清理、图片尺寸/格式/释放、权限来源以及 Canvas 外部内容与用户编辑的事件区分；与现有画板导出测试合计 22 项通过。Electron/前端类型检查、平台隔离检查和 Vite 生产构建通过。
- Windows 原生协议已验证 PNG/路径/快照/RGBA 往返、透明度与通道顺序、无效输入保留剪贴板、ICO 路径、411 个字体家族及其他权限仍拒绝。真实监听验证递归、原子替换、跨窗口停止、注册失败和导航回收，原生监听句柄从 0 恢复到 0。验证使用隔离数据，原剪贴板在主进程内存保存并恢复。
- Windows 生产资源通过实际 Canvas store 创建项目、外部修改入口文件，监听触发通知并刷新 Git 修改状态，等待防抖周期后磁盘仍保留外部内容。画板实际菜单导出 3840×2160 PNG，系统字体可在现有下拉列表选择；导出前替换为文本剪贴板，避免误读上一次测试图片。
- 证据位于忽略目录 `.tmp/electron-host-adapters/`：`runtime-result.json`、`runtime-lifecycle.json`、`canvas-external-change.png`、`sketch-system-fonts.png`、`sketch-clipboard-export.png` 和 `build.log`。
- 独立子 WebView 仍在后续范围；Canvas 文件树当前还依赖待迁移的目录命令。macOS/Linux 的文件系统、剪贴板和字体枚举继续在对应环境验证。

文件拖放批次（2026-11-04）：

- preload 捕获真实 Chromium 文件拖放，路径从 File 对象经 webUtils 提取，坐标按 devicePixelRatio 转为物理坐标。接通 enter/over/leave/drop、嵌套进入离开、失焦与文档隐藏后的悬停清理；脚本构造的拖放事件保持在 DOM 层。
- 当前 WebView 和窗口的 onDragDropEvent 通过独立 preload 订阅同步接收，通用事件广播无法注入该本地原生流；主进程向所属窗口转发标准事件与既有 custom 事件，供旧调用方继续使用。取消订阅、组件卸载及刷新释放监听，跨窗口注册失败回收已建立的订阅。
- useFileDrop 在 Electron 使用一个原生流，按落点选区并合并捕获/冒泡阶段的同次拖放。File 消费方优先保留原始字节；显式路径优先和目录输入继续交给路径回调。useFileInteraction 根据实际 onPaths/onFiles 选择，DropZone 沿用 preferFileObjects 配置；相同文件后续再次拖入可正常处理。
- 全局文件打开收敛为未被区域消费时的兜底；区域内图片导入保留当前工具，禁用区域继续拒绝导入。H5 File 读取与原有内部拖动保持可用。
- 新增 11 项行为测试，与既有监听生命周期和平台窗口测试合计 19 项通过。Electron/前端类型检查、平台隔离检查和 Vite 生产构建通过。
- Windows Electron 生产资源通过 Chromium CDP 注入本地文件，验证现有组件测试器的 H5/绝对路径区域、150% 缩放下的多区域落点、重复拖入、File 字节、显式路径回调、禁用态、图片导入与全局兜底、跨窗口隔离、伪造事件拒绝和刷新重建。浏览器整数坐标存在约 1 CSS 像素以内取整；macOS/Linux 的实际拖放继续在对应环境验收。
- 证据位于忽略目录 `.tmp/electron-drag-drop/`：`runtime-result.json`、`runtime-lifecycle.json`、`business-drag-drop.png`、`multi-zone-drag-drop.png` 与 `build.log`。测试使用独立应用数据，运行实例已退出。

## 4. 插件执行

- [x] 插件 ZIP 预检、安装和卸载，覆盖 JS/Web、Native、Sidecar 共用的插件包入口。
- [x] 已安装 JS/Web 插件的模块、UI、CSS 与相对依赖加载。
- [x] 单次 Sidecar 调用，核对 manifest 当前平台产物。
- [x] Native 动态库加载、调用与卸载。
- [x] 常驻 Sidecar 生命周期、取消、事件和重启恢复。
- [x] AHK、Paddle OCR 真实插件工作流。
- [x] Native 示例真实插件工作流。

插件包与 JS/Web 加载批次（2026-11-04）：

- 接通 `preflight_plugin_zip`、`install_plugin_from_zip`、`uninstall_plugin`，复用现有确认、安装进度与回收站卸载交互。识别根目录清单和单层包装目录，安装时将清单及相对资源放到插件根目录。
- 校验清单、插件 ID、当前平台 Native/Sidecar 产物与 JS 入口；保留 JS 的同名 .ts → .js 兼容。ZIP 上限 512 MiB、展开总量 2 GiB、单文件 1 GiB、20,000 个条目，清单上限 1 MiB；按流校验实际字节数与 CRC32。路径穿越、大小写重名、文件/目录冲突、链接及特殊文件在发布安装目录前拒绝。
- 全窗口共用串行队列，安装先写应用目录下的独立暂存目录，再完整发布；失败和应用退出取消时清理暂存，已安装插件保留原文件。卸载使用系统回收站；安装、卸载和资源读取复用词法路径/真实路径校验，防止 junction 重定向。
- 实机发现生产 CSP 会阻止原有 asset 模块入口，且相对导入丢失查询参数中的资源授权。新增宿主插件资源门面和 `aiohub://app/__plugins/` 路径，授权范围落到当前窗口和已安装插件目录；主模块、UI、配套 CSS 与相对依赖共用此入口，普通文件继续使用现有 asset 授权。安装版本变化、卸载及窗口销毁使旧资源地址失效。Tauri 沿用原资源转换方式。
- 新增 14 项行为测试，覆盖包安装/预检/卸载、并发重装保护、损坏包清理、退出取消和资源边界；连同技能/配置归档与前端插件兼容性测试合计 42 项通过。Electron/前端类型检查、平台隔离检查、相关 lint 和完整 `electron:build` 通过。
- 真实 Windows Electron 生产资源完成 7 项工作流验证：IPC 预检、真实 ZIP 拖放及确认、JS 激活与相对模块、注册 UI 与 CSS、重复安装拒绝、刷新恢复、停用与回收站卸载及资源撤销。Native/Sidecar 的平台包契约由本批单测覆盖，实际执行与常驻进程继续按上方待办推进。
- 证据保存在已忽略的 `.tmp/electron-plugin-packages/`：`runtime-result.json`、`installed.png`、`final-diagnostics.json`、`command-inventory-current.json` 与 `build.log`。测试使用隔离应用数据，运行实例已退出；macOS/Linux 运行验证继续在对应系统接续。

Sidecar 执行批次（2026-11-04）：

- 接通单次执行及常驻启动、调用、停止四个命令，沿用 API v3、JSON 行协议、进度/日志/业务事件和 Broker 转发。按清单校验 ID、类型、当前平台入口、参数与常驻声明；已安装插件从应用数据目录加载，显式开发宿主可使用工作区插件。插件数据写入独立的 `plugins-data/<id>`。
- 单次执行以命令回复为结果，并等待进程退出；非零退出返回失败，防止并发调用共享事件串线和结果事件抢先完成。常驻监听先于启动，缓存早到事件并按 generation 筛选；崩溃恢复重跑 startup，失败的业务操作由调用方决定是否重试。
- 常驻进程按插件共享、按窗口持有租约，导航/刷新/崩溃/关窗释放所属调用与租约；最后租约释放、卸载和应用退出回收进程。启动与回收站卸载串行，应用退出排空已接受操作。Broker 只在存在共同窗口归属的进程间转发，响应匹配请求与进程代次。
- 默认调用超时 300 秒、Broker 超时 120 秒、优雅停止等待 5 秒；每条 JSON 行上限 16 MiB，每个常驻进程最多 256 个待处理调用。超时和强制停止使用进程树回收；Windows 优雅退出后的任意孙进程归属仍需更强的系统隔离机制单独评估。
- 10 项宿主真实子进程测试、8 项前端适配器测试通过；连同插件包、资源、技能、配置归档与 API 兼容性相关测试共 60 项通过。Electron/前端类型检查、平台隔离和完整生产构建通过。
- 真实 Windows Electron 使用 manifest 声明的 AHK/Paddle 可执行文件，完成 API v3 启动、窗口枚举、AutoHotkey v2 文件标记脚本、ONNX CPU 图片识别（1,430 字符）、64 图任务取消与并发健康检查、代次重启；Paddle 页面加载实际图片选择、复制与对照控件。
- 两个真实窗口共享同一代次，刷新主窗口及关闭副窗口后剩余租约继续可用；退出后跟踪的 AHK/Paddle 进程均结束。测试使用隔离应用数据，插件独立仓库保持原样。证据位于已忽略的 `.tmp/electron-sidecars/`：`runtime-result.json`、`actual-ocr-result.json`、`runtime-lifecycle.json`、`paddle-ui-observe.json` 和 `build.log`。macOS/Linux 的进程与插件运行验证继续接续。

Native 执行批次（2026-11-04）：

- 接通加载、调用、卸载三个命令，按 manifest 校验插件 ID、类型、当前平台库文件、真实路径和 reloadable。沿用 `call(const char*, const char*) -> char*` ABI，返回数据复制到 JavaScript 内存后验证 UTF-8；成功与解码失败均调用插件提供的 `free_string`。旧插件缺少释放函数时记录运行日志，由进程退出回收剩余内存。
- 每个 Native 插件使用独立 Electron utility process，通过锁定的 Koffi N-API runtime 调用动态库。同步 C 调用在该进程执行，崩溃只结束对应宿主；重新启用会创建新进程，业务调用由调用方决定重试。原生插件仍拥有当前用户的系统权限，安装前需确认来源。
- 多窗口按租约共享宿主，调用按窗口与导航代次授权；刷新/关闭取消所属回复，剩余窗口继续调用。reloadable 插件的最后一个租约释放时结束进程；显式卸载先等待已接受调用，默认 5 秒后仍忙则提示重试。reloadable=false 保留到应用退出，运行时卸载和回收站删除提示重启。
- 输入和返回值各上限 16 MiB，每宿主最多 256 个待处理请求，默认调用超时 300 秒；超时结束宿主并拒绝关联请求。回收站卸载与加载串行，结束宿主后再处理文件；应用退出清理所有 Native 宿主，包括正在执行调用的进程。
- 实机发现 Electron 拒绝外部 ArrayBuffer，已改为受界限约束的 C 字符串扫描与内存复制；发现 builder 会跳过手动暂存的 node_modules，已改为显式 `native-runtime/` 资源，.node 文件从 ASAR 解包。开发、生产预览和目录分发共用该构建入口。
- 11 项真实 ABI 子进程测试通过，覆盖 Unicode/并发与释放、无效返回、清单/路径边界、多窗口归属、忙时卸载、驻留策略、崩溃重载、超时/退出及回收站竞态；连同 Sidecar、插件包/资源、技能、配置归档和前端兼容测试共 71 项通过。Electron/前端类型检查、平台隔离、相关 lint、完整生产构建与 Windows 目录分发打包通过。
- Windows Electron 生产预览完成 8 项工作流：实际示例 UI 计算与系统信息、任意系统库拒绝、20 路并发、第二窗口调用、刷新/关窗租约、停用重启及加载中 DLL 的回收站卸载。示例插件 UI 已在独立仓库修正 SDK 返回包络读取，Vue 构建通过；C ABI 与 Rust 产物保持原样。
- Windows ASAR 分发程序在关闭 Dev Control 的独立数据中完成 6 项检查：原生依赖与 DLL 加载、UTF-8 与释放、主动 abort 后应用存活及显式重载、实际 UI 计算、退出后两个宿主 PID 均消失。测试预览与分发实例均已退出；macOS/Linux 的动态库、签名权限与运行验证继续接续。
- 证据位于已忽略的 `.tmp/electron-native/`：`runtime-result.json`、`ui-result.json`、`packaged-result.json`、`packaged-native.png`、`command-inventory-current.json`、`build-final.log` 和 `packaging-final.log`。

## 5. 领域工具后端

- [x] LLM 会话原子写入/删除（`llm_chat_atomic_write`、`llm_chat_delete_session`）、请求快照文件、附件引用与分离草稿工作流。
- [x] LLM 流式搜索、结果 Channel 与取消。
- [x] Knowledge 的 Windows 文档摄取、版本/标签、目录同步、语义/混合检索、智能体授权及 Chat 查询/研究；真实系统文件多选、中文目录选择、取消与退出后持久化也已验证。
- [x] Recall 的存储、检索 pipeline、旧目录迁移、库统计、文件导入、备份检查/旧版转换，以及 Windows 备份原生多选、冲突副本/跳过、逐项失败报告、单包/批量导出与运行中停止后续项目。
- [ ] Recall 替换现有集合的二次确认 UI，以及 Knowledge/Recall 的 macOS/Linux 完整运行验收。
- [x] Canvas、目录树和配置转换共用的目录树生成，优先恢复已有工作区的项目资源浏览。
- [x] 媒体生成历史搜索、JSON 后台剪贴板监控；Windows 生产资源已验证资产关联展示、自动格式化、替换确认、多窗口隔离与刷新释放。
- [ ] Git 提交/分析工具；现有 44 个公开后端命令均已接通，覆盖工作区、分析流、远端同步、分支/标签/stash、提交消息修改、pick/revert、导出/格式化与终端入口；真实创建/改写提交、有效 stash 往返、外部认证和跨平台验收继续接续。
- [x] FFmpeg 执行/取消、媒体元数据/关键帧、视频区间抽帧；Windows 工作台和音频转录预处理、上传、派生结果读写已验证。
- [x] Windows 本地视频导入、ROI 试识别、FFmpeg 抽帧后的原生 OCR、字幕合并和取消清理。
- [ ] 转录真实 ASR/多模态模型、视频 VLM 完整流程及 macOS/Linux 对应验收。
- [ ] 目录搜索/清理/去重、符号链接移动；目录搜索的搜索/替换/整理七命令、目录清理与内容查重的扫描/回收站，以及取消和 Windows 界面已接通并验证；符号链接移动的八命令及 Windows 同盘/跨盘、链接、取消与生命周期也已验证；跨平台验收继续接续。
- [x] 系统脉搏启动/停止命令、完整硬件快照与窗口订阅；Windows 生产资源的暂停、缓存页面、刷新、关窗和退出已验证。
- [ ] 系统脉搏 macOS/Linux 指标、可选 GPU 降级和对应生命周期实机验收。
- [x] Web Distillery 的抓取、渲染代理、Cookie/LocalStorage 与加密后端，以及 Windows 工作台、身份隔离和生命周期验收。
- [ ] Web Distillery macOS/Linux 的系统代理、凭证服务与浏览器运行态验收。
- [x] Windows 屏幕区域采集、原生 OCR，以及 Smart OCR 与监控框的生产资源工作流。
- [ ] 混合 DPI 多显示器和系统缺少 OCR 语言组件的实机验收；其他平台沿用能力提示。
- [x] Windows 窗口自动化八命令、工作台动作流与截图取点；后台/前台输入及双窗口生命周期已验收。
- [x] PHP/Rust/C/C++ 系统代码格式化两命令、共享引擎参数和隔离辅助进程；Windows 生产资源已验证格式化工作台、真实引擎与进程树生命周期。
- [ ] 系统代码格式化的 macOS/Linux 引擎、路径和生命周期实机验收。
- [ ] 其余调查表内原生工具命令。

Recall 基础存储批次（2026-11-04）：

- 新增 N-API runtime，复用 Tauri Recall core、SQLite repository、migrations 和 vector blob 存储；Electron 主进程分派 16 个初始化、集合元信息与条目 CRUD/批量命令，并在退出时排空已接收操作。
- 基础命令包括 `recall_initialize`、`recall_warmup`、集合列举/加载/保存/删除/克隆/导出、条目加载/查询/ID 列举/新增更新/删除及批量新增更新、补丁和删除。批量导入保留标题/标签提取、摘要/hash、内容去重计数契约。
- 新增桥接与 Rust dispatch 行为测试。Recall/Knowledge 定向测试 5 项通过，addon Rust 测试 34 项通过；Electron 类型检查、平台隔离和 Rust 格式检查通过。
- 接通向量写入、覆盖率、模型清理、模型向量加载及 tag-pool 同步/查询/统计/重建/清理命令。向量写入沿用 repository 的模型维度校验、token 统计和内容 hash 关联；修改/删除条目后清除对应内存向量缓存，避免读取陈旧索引。
- 该存储批次累计接通 32 个初始化、集合/条目、向量/tag-pool 与 embedding cache 命令。
- addon 直接复用 Tauri 的 `ModelTagPool` 与 HNSW 实现；SQLite 保存标签向量，runtime 缓存热池，warmup 恢复集合向量和标签池并重建 HNSW。补齐 embedding cache 读写/清理，缓存键按模型与文本隔离。
- Recall/Knowledge 定向测试 5 项通过，addon Rust 测试 38 项通过；Electron TypeScript 检查、平台隔离检查、Rust 格式检查和生产构建通过。
- 直接加载最终 `dist-electron/native-runtime/knowledge-addon.node`，在临时数据目录验证初始化、建库、条目读写、内容 hash、向量覆盖率与清理、标签向量更新合并、统计、缺失标签、HNSW 重建、warmup 恢复、embedding cache 隔离和清理。
- Windows Electron 生产预览此前已验证页面创建集合/条目、编辑标题与刷新保留；该次实机验证早于最终构建，本轮通过最终 addon 直接复验底层读写。
- 向量生成由前端模型调用执行，addon 承接生成向量的持久化和加载；检索接入与后续剩余项见下一批次。

Recall 检索管线批次（2026-11-04）：

- addon 复用原有中文倒排索引、生产检索模块、pipeline compiler/runner 和评分/过滤逻辑，接通预设列表、模块列表、模板、预设/自定义编译及执行 7 个命令。沿用结构化失败、配置指纹校验和显式降级契约。
- 启动和 warmup 从 SQLite 重建条目、文本索引、向量矩阵及全局标签池。N-API 工作线程串行处理领域操作；集合/条目、向量及标签数据写入前失效内存读模型和结果缓存，下一次检索从持久化真源恢复。
- 持久化向量使用模型 ID；本次检索读视图按 bundle 的 embedding space 与 Profile 签名绑定矩阵和标签池。切换模型时重新加载对应视图，缺失模型返回其自身的空结果。
- 将原有检索结果缓存的类型、键规则与读写逻辑提取为跨宿主共享实现，接通读取、写入、清理和统计 4 个命令。接通监控心跳，每次后端 pipeline 执行发布兼容的 `recall-monitor` 事件，携带结果评分语义、完整 trace 和结构化错误。Recall 主进程当前累计分派 44 个命令。
- addon Rust 测试 70 项、Recall/Knowledge Electron 测试 6 项及前端 Recall API 测试 4 项通过；Tauri 编译、Electron/前端类型检查、平台隔离、Rust 格式检查及 Electron 生产构建通过。
- 最终生产资源在真实 Windows Electron 隔离实例完成 10 组协议验证，覆盖中文/关键词检索、过滤、内容修改失效、结果缓存与配置隔离、模型切换、持久化向量及标签召回、缺失 embedding、过期编译、显式降级、自定义管线和监控事件。真实实验室页面显示算法召回结果及未配置模型时的可行动错误，Monitor 收到本次执行记录。
- 直接加载最终 N-API 产物验证持久化、关键词召回和结果缓存，再由另一个 Node 进程从同一目录恢复向量并完成综合召回。证据位于已忽略的 `.tmp/electron-recall-pipeline/`：`runtime-result.json`、`ui-result.json`、`addon-restart-result.json`、`playground.png` 和 `monitor.png`。
- Recall 备份、旧目录迁移、库统计、文件批量导入等剩余命令，以及知识资料库的完整工作流与页面能力提示继续保持未完成。隔离实例启动时仍有其他工具注册能力提示，按对应领域批次处理。

Recall 旧目录迁移批次（2026-11-05）：

- 新增检测、预览、执行、确认清理和开发调试重置 5 个命令，Recall 主进程累计分派 49 个命令。复用现有文件目录导入器与 SQLite 迁移记录，沿用集合/条目、模型映射、contentHash 校验及 tag-pool 迁移规则；确认来源指纹后执行，完成后刷新检索读模型、向量与标签池，重复请求按既有记录幂等返回。
- 确认参数、进度结构与事件名提取为两宿主共享协议。原生任务通过有界队列传递 main/vector/tag-pool/verify/completed 阶段，Electron 仅在迁移运行期间读取并转发，成功和异常均排空队列、释放轮询；退出等待已接收任务收尾。并发迁移/清理/重置提前争用迁移锁，生产插件拒绝开发调试重置。
- 共享导入器在检测、导入及清理前检查受管路径，拒绝符号链接与 Windows 重解析点，目录扫描错误明确返回。旧目录默认保留，清理继续要求显式确认、当前指纹以及完全通过的迁移报告；清理只处理 bases/vectors/tag_pool，保留知识资料库文件。新增回归覆盖知识目录、受管子目录与嵌套 Windows junction。
- addon Rust 测试 73 项通过，另有 1 项需要外部旧数据样本的测试保持忽略；Recall/Knowledge Electron 测试 7 项、前端迁移流程测试 6 项通过。Electron/前端类型检查、Tauri 编译、平台隔离、Rust 格式和生产构建通过。
- Windows Electron 最终生产资源通过现有迁移界面完成确认、执行、校验报告及 DELETE 清理；收到真实阶段进度，导入向量可用于综合检索，重复执行保持幂等，知识资料库文件保留。最终 .node 在独立进程验证过期指纹、过期向量阻止清理、修复后重试与生产调试限制，第二进程在旧目录清理后恢复条目和向量。
- 实机与插件证据位于已忽略的 `.tmp/electron-recall-pipeline/`：`migration-runtime.ts`、`migration-runtime-result.json`、`migration-plan.png`、`migration-complete.png`、`migration-addon.cjs`、`migration-addon-result.json` 和 `migration-addon-restart-result.json`。
- Recall 备份、库统计、文件批量导入及知识资料库完整工作流继续保持未完成。macOS/Linux 的迁移与清理运行验证在对应系统接续。

Recall 库统计与文件导入批次（2026-11-05）：

- 新增库统计、标签池落盘和文件批量导入 3 个命令，Recall 主进程累计分派 52 个命令。库统计从 SQLite 读取集合、条目和所选模型的向量，返回集合明细、已向量化数量、标签使用量与排序后的标签列表。统计与 token 合计按所选模型隔离，修复原 Tauri 内存统计在模型未切换时混入其他模型 token 的问题；两宿主使用同一实现。
- 将文本文件识别、并行扫描、导入配置和结果类型提取为共享实现，沿用标题/标签提取、摘要、内容哈希与 UTF-8 文本读取规则；非文本、不可读路径和目录计入跳过，重复内容分别按现有集合与批内候选去重。导入写入后使检索缓存和读模型失效，导入内容可立即参与检索。
- 索引监控结构提取为共享 wire schema。导入发布开始、每处理 5 个文件的进度、完成或错误事件；完成计数包含全部已处理路径，并区分导入条目、跳过与重复。Electron 复用有界原生事件队列，迁移与文件导入的成功/异常均排空事件并释放轮询。标签池落盘保留已加载池的索引重建、成功计数与持久化行为。
- 页面走查发现 Rust 秒时间戳与前端毫秒时间戳混用，导入条目日期显示到 1970 年；新增 Recall 时间解析工具，在日期展示与集合/条目更新时间排序时统一解析，原始存储值保持原样。
- addon Rust 测试 76 项通过，另有 1 项需要外部旧数据样本的测试保持忽略；Recall/Knowledge Electron 测试 8 项、前端 Recall store/API 测试 7 项通过。Electron/前端类型检查、Tauri 编译、平台隔离、Rust 格式及最终生产构建通过。
- 最终插件产物在独立 Node 进程验证导入提取、跳过/去重、索引监控、即时检索、模型隔离统计与标签池落盘；第二进程恢复导入条目、两个模型的向量统计和标签池。
- Windows Electron 生产资源验证真实 IPC 导入与重复导入、两个模型的统计，以及工作区通过 DOM 文件 URI drop 触发的现有路径导入流程。导入条目可立即检索，统计页显示所选模型的集合进度、token 和标签，Monitor 收到 Index 事件；刷新后条目恢复，导入日期按当前日历日期展示。该流程覆盖文件 URI 解析至宿主写入，系统文件管理器的物理拖放沿既有宿主验证记录接续。
- 证据位于已忽略的 `.tmp/electron-recall-import/`：`runtime.ts`、`runtime-result.json`、`workspace-import.png`、`statistics-model-a.png`、`statistics-model-b.png`、`import-monitor.png`、`addon.cjs`、`addon-result.json` 和 `addon-restart-result.json`。
- Recall 备份与知识资料库完整工作流继续保持未完成；macOS/Linux 的运行验证在对应系统接续。

Recall 备份检查与旧版转换批次（2026-11-05）：

- 新增单包检查、多库检查和旧版转 Knowledge 共 3 个命令，Recall 主进程累计分派 55 个命令：`recall_inspect_backup`、`recall_inspect_backups`、`recall_import_legacy_backup_to_knowledge`。
- 将原 Tauri 备份格式、ZIP 读写、清单和资产摘要校验、冲突检查提取到共享 `backup_archive.rs`，旧版文档转换提取到 `backup_conversion.rs`；Tauri 保留原命令和资产导入导出适配。Electron 通过同一 SQLite repository 检查冲突，沿用当前 `.aio-recall`、旧 `.aio-kb`、JSON/YAML 与多库容器格式。路径、重复项、链接、文件数、解压大小、压缩比和摘要校验继续使用原规则；多库检查逐项报告损坏包，保留有效项结果。
- 旧版转换完整校验源包及所选容器项后新建 Knowledge 资料库，正文优先、摘要兜底，空条目跳过，来源保留 `legacy-recall://` 路径。沿用字段与附件转换告警及任一摄取失败时删除本次新库的处理；原文件和既有 Recall 集合保持原样。当前 Recall 格式继续要求走完整恢复入口，转换命令只接受旧格式。
- 迁移原格式测试至共享核心，并补充资产 SHA-256 与持久化冲突、多库内损坏与索引摘要隔离、正文/摘要转换及无效输入写入边界 3 项行为测试。addon Rust 测试 93 项通过，2 项外部样本测试保持忽略；其中备份共享核心 17 项通过、1 项外部样本测试忽略。Recall/Knowledge Electron 测试 8 项通过，Electron/前端类型检查、Tauri 编译、平台隔离和生产构建通过。
- 最终 `.node` 在独立进程验证含资产归档检查、多库逐项错误、未声明容器项和非法来源拒绝，以及旧单包、多库项和 JSON 的文档转换；第二进程恢复三份资料库、文档和关键词索引，既有 Recall 冲突信息保持可读。
- 真实 Windows Electron 从原有备份入口打开系统文件对话框，选择生成的旧包并完成去向选择与二次确认；报告显示 2 篇文档、跳过 1 个空条目及转换告警。知识资料库页面展示原始分块，关键词检索命中正文与摘要文档，刷新后仍可恢复。
- 证据位于已忽略的 `.tmp/electron-recall-backup/`：`addon-result.json`、`addon-restart-result.json`、`runtime-inspect-result.json`、`runtime-conversion-result.json`、`runtime-ui-search-result.json`、`conversion-confirm.png`、`conversion-report.png`、`knowledge-original-chunk.png`、`knowledge-search.png` 和 `knowledge-after-reload.png`。
- 完整备份由下方 2026-11-05 批次接续，复用 Electron AssetManager 的目录归属、去重与失败回滚。知识资料库完整工作流和 macOS/Linux 运行验证继续推进。

Recall 完整备份批次（2026-11-05）：

- 已实现单集合/批量导出、所属窗口取消与含资产恢复，补齐 4 个主进程命令。归档格式复用共享核心，Electron AssetManager 持有资产事务，恢复原始字节并跨月按真实 SHA-256 去重；失败时保留既有资产并撤销本次新增资产。
- 最终产物往返测试发现旧主库使用全局条目主键，复制恢复会转移原集合条目。修正为 schema v3 的集合/条目联合主键，向量状态查询同步按集合限定；补充旧 v2 数据迁移、同 ID 条目改删及向量隔离测试，并加强备份副本测试对原集合内容的断言。发现范围为隔离验证数据，主人的应用数据保持原样。
- 主进程累计分派 59 个 Recall 命令。导出使用 native 快照与受管资产文件，批量保留逐项失败、进度和当前集合完成后停止的语义；恢复提交前检查集合是否被并发编辑，数据库写入与旧向量清理共用恢复事务。应用常规退出与显式退出均等待已接收的备份操作收尾。
- 98 项 addon Rust 测试通过、2 项外部样本测试忽略；22 项 Electron 相关测试通过。Electron 类型检查、Tauri 编译和完整生产构建通过，主库迁移与恢复代码由两个宿主共用。
- 最终 `.node` 与真实 AssetManager 在独立进程完成单包/批量往返、copy/replace/cancel、原字节资产去重、旧向量清理、单集合失败后继续、早到/当前集合后取消、并发编辑拒绝与新增资产回滚；第二进程恢复 3 份各含 3 个条目的集合、共享资产和检索索引。
- Windows Electron 生产资源实例通过宿主协议验证含资产恢复、copy/replace/cancel、单包/批量导出与容器检查；现有工作区在刷新后显示两份各含 3 个条目的集合，编辑器保留中文、emoji 和 Markdown，两集合均可独立检索。
- Windows 实机另验证批量导出被接受后立即显式退出：两个各含 8 MiB 资产的集合完整写入最终 ZIP，暂存目录清理后进程退出；独立进程复读归档并校验资产摘要与持久化集合。
- 原有导入按钮可打开系统文件对话框；本批 Windows 自动化工具连续返回 `FrameArrived timed out`、`coordinate input geometry is unavailable` 及控件缓存错误，原生文件选择、冲突确认/报告与批量取消的完整交互保留待验收。宿主协议和刷新展示的结果单独记录，macOS/Linux 与 Knowledge 完整工作流继续接续。
- 证据位于已忽略的 `.tmp/electron-recall-backup-restore/`：`host-result.json`、`host-restart-result.json`、`runtime-result.json`、`runtime-collection-list.png`、`runtime-restored-collections.png`、`exit-runtime-result.json`、`exit-restart-result.json` 与构建/测试日志。隔离实例已退出。

Knowledge 文件工作流批次（2026-11-05）：

- Windows Electron 使用现有界面创建首个资料库，通过真实 Chromium 文件拖放导入 Markdown、HTML 与一个二进制失败样例；2 篇文档及分块落盘，失败项独立显示，成功项继续可读。
- 现有文档界面保存标签，重复导入跳过未变更文件；改写源 Markdown 后重新拖放，文档 ID 和标签保留，版本递增，关键词检索可定位到新版正文及源文件。
- 目录来源通过宿主协议注册递归和 ignore 规则；真实设置页的重新扫描动作执行前端解析与持久任务队列，覆盖新增、修改和外部删除，排除文件保持忽略。队列与文档结果单独记录。
- 实机发现从空库创建首个资料库后检索范围仍为空。工作区现在在首次获得活动资料库时补上默认范围，已有选择和主动清空保持原样。2 项界面行为测试分别保护首库默认范围和主动清空的选择；首库测试修复前失败、修复后通过，连同摄取、服务与 store 相关测试共 17 项通过。Electron/前端类型检查和生产构建通过；最终 Windows 生产资源从全新空库完成创建、文件拖放及直接关键词检索，全程沿用自动选择的首库范围。
- 当前 28 个 Knowledge Tauri 命令均已在 Electron 分派。原进程退出后，独立进程用最终 native 模块恢复 4 篇文档、分块、标签、目录变更和任务结果，关键词索引仍可命中新版正文。测试实例均已退出。
- 证据位于已忽略的 `.tmp/electron-knowledge/`：`import-result.json`、`document-lifecycle-result.json`、`directory-sync-result.json`、`restart-result.json`、`scope-runtime-result.json`、`imported-documents.png`、`updated-keyword-result.png`、`directory-sync-diagnostics.png` 与 `first-library-search.png`。原生文件/目录选择受本批 Windows 自动化工具故障影响；PDF/DOCX、真实模型语义索引及 Agent/Chat 跨模块工作流继续接续。

Knowledge PDF、语义索引与 Chat 引用批次（2026-11-05）：

- 冷启动真实导入发现 PDF 解析器缺少 worker 配置，DOCX 的中文与正文提取正常。PDF 解析现按项目已有方式加载打包后的 worker，并复制输入字节，保留源文件校验值；成功、加载失败、页面读取失败和空文本均释放解析资源。
- 初次构建语义索引发现后端将未指定维度序列化为 `null`，前端校验提前拒绝请求。配置归一化现将该值恢复为默认维度语义，显式维度仍保留，0 等非法值继续报错。
- 新增 6 项行为回归，覆盖冷启动多页提取、worker 转移输入后的源文件校验、失败阶段与资源回收，以及后端默认/显式维度配置。解析、配置、检索服务、引用与研究相关 41 项测试通过；Electron/前端类型检查与生产构建通过。
- 最终 Windows Electron 生产资源通过真实文件拖放导入 PDF/DOCX，校验源文件摘要、正文、中文与来源路径。通过设置界面的粘贴导入创建隔离本地渠道，调用本机 Ollama Nomic 模型为 2 个分块建立 768 维索引；语义与混合检索均命中 PDF 中的维护时间和参考码，混合结果保留关键词及向量信号。
- 智能体编辑器保存并重新读取资料库授权、全库范围、继续读取和研究权限。Chat 中显式选择该智能体及资料库后，快速查询显示成功的 `knowledge.search` 事件，实际使用 hybrid；研究任务显示成功的 `knowledge.research` 事件，保存两份来源的文档/分块定位、证据和终止信息。本机 MiniCPM 生成了包含维护时间、导出保留期限与两份参考码的回答。此处验证的是用户显式引用触发链，模型自主工具调用继续接续。
- 页面刷新恢复两类工具事件与回答。应用退出后，独立进程用最终 native 模块恢复同一活动向量空间，并通过新 Ollama 查询向量分别命中 PDF 和 DOCX；智能体权限、版本化 Chat 引用、工具来源与两条完整回答均已落盘。
- 本批发现全新 Chat 首次从智能体大厅点击“开聊”时，目标智能体选择会被 Chat 初始化加载的 UI 状态覆盖；当时通过侧栏显式选择完成检索链路。该问题和后续工具调用、研究取消验证已在下方接续批次处理；原生文件选择与跨平台验收继续接续。
- 证据位于已忽略的 `.tmp/electron-knowledge-semantic/`：`import-result.json`、`vector-status.json`、`semantic-runtime-result.json`、`chat-search-evidence.json`、`chat-research-evidence.json`、`restart-result.json`、`semantic-search.png`、`hybrid-search.png`、`agent-permissions.png`、`chat-knowledge-answer.png`、`chat-knowledge-research.png` 与 `chat-restored-after-refresh.png`。测试实例已退出。

Knowledge 开聊交接与工具执行批次（2026-11-05）：

- 智能体大厅“开聊”记录明确的目标，Chat 完成 UI、智能体与会话恢复后串行消费，并复用既有智能体选择流程重新绑定旧草稿。已初始化的工作区通过同一入口处理后续选择；切换期间的新请求按序执行，最后选择生效。
- Windows 生产资源验证了全新 Chat 开聊、恢复旧草稿后的开聊与已加载工作区切换三条路径。目标智能体及资料库授权正确，同一草稿身份和输入内容保留，后续显式 hybrid 查询正常。
- 本机 Qwen 3.5 9B 在普通用户消息下主动发出合法的 `knowledge_search` 请求，执行真实混合检索并回答维护时间 `02:40` 和参考码 `CEDAR-731`；该会话没有显式 Knowledge 引用。工具事件保留自动批准来源、实际策略、Agent、文档和分块定位。MiniCPM 在相同专项中生成无效工具协议，按原协议拒绝，模型遵循能力单独记录。
- 研究任务取得首轮来源后，第二次真实 Ollama embedding 请求经本地代理延迟；通过“停止生成”取消。已收集来源和取消原因保留，移除未执行的回答占位；底层请求随后完成，节点集合保持稳定。
- 修复研究 `failed` / `timeout` 被显示为成功的问题：完成和预算终止显示成功，失败和超时显示错误，主动取消保留取消状态。结果继续保存已收集来源、终止原因和失败阶段，供后续回答说明证据限制。相关失败/超时用例在修复前确实失败，修复后通过。
- 删除输入区已引用的资料库后，发送前校验显示“资料库已删除”，保留输入及引用，未创建新会话。该路径在输入预检结束；执行阶段的结构化工具错误由对应契约单测覆盖。
- UI 状态、开聊准备、显式引用事件和研究服务共 30 项相关测试通过；Electron/前端类型检查及完整生产构建通过。最终产物复用本批隔离业务数据，恢复主动工具会话、取消事件、智能体权限与未发送草稿；真实研究第二次 embedding 延迟 125 秒，在 120 秒预算到期后显示错误且保留首轮来源，迟到结果未覆盖超时状态。
- 证据位于已忽略的 `.tmp/electron-chat-knowledge/`：`handoff-result.json`、`active-tool-result.json`、`research-cancel-result.json`、`reference-failure-result.json`、`final-restart-result.json`、`research-timeout-result.json`、`research-timeout.png`、`cold-entry.png`、`restored-draft-entry.png`、`active-knowledge-answer.png`、`research-cancelled.png`、`deleted-library-failure.png`、`final-tests.log` 和 `final-build.log`。Ollama 延迟仅用于确定复现中的请求时序，内容由本机模型实际生成。验证后恢复直连地址并退出预览与延迟代理。

媒体历史搜索与 JSON 剪贴板监控批次（2026-11-05）：

- 接通 `search_media_generator_data`，搜索持久化媒体会话的名称、节点内容、任务提示词和模型 ID，保留既有任务/会话结果与资产关联。搜索按字面量忽略大小写，提取 Unicode 安全上下文；先按命中字段数和更新时间排序，再应用结果上限。
- 搜索使用应用路径校验，拒绝历史目录重定向；跳过损坏 JSON 和并发替换时消失的文件。现有画廊直接消费命中的资产 ID，无需改变生成任务或资产存储契约。
- 接通剪贴板监控的启动、停止与内容类型三个命令。宿主每 500 ms 共用一次系统读取，各窗口持有独立订阅和最后内容；重复启动幂等，停止一个窗口保留其他订阅。刷新、渲染进程退出、关窗和应用退出释放租约，旧读取结果按订阅身份过滤。
- 剪贴板事件只向持有租约的窗口投递，其他窗口即使注册指向该窗口的事件订阅也收不到内容。JSON 页面先订阅事件再启动监控，启动失败和组件卸载清理监听，空编辑器自动格式化，已有内容沿用替换通知。
- 新增 9 项行为回归，保护字段与资产关联、排序/上限、字面量与 Unicode、损坏记录隔离、目录边界，以及去重、多窗口停止、异步读取/刷新和系统读取失败恢复。相关测试、Electron/前端类型检查及完整生产构建通过。
- Windows 最终生产资源在隔离数据内导入测试图片并准备媒体历史记录，通过画廊实际搜索提示词/模型、解析资产和加载图片。JSON 页面实际验证系统剪贴板写入后的自动格式化与点击通知替换；两个真实窗口验证未授权事件隔离、单窗口停止后另一窗口继续监听、刷新释放与缓存清除。完成后恢复测试前的剪贴板内容并关闭预览。
- 证据位于已忽略的 `.tmp/electron-media-clipboard/`：`runtime-result.json`、`media-history-search.png`、`json-clipboard-import.png`、`json-monitor-stopped.png`、`tests.log` 和 `build.log`。本批覆盖历史搜索和文本剪贴板监控；媒体生成模型调用、FFmpeg 与转录保留各自验收范围。

FFmpeg 与转录预处理批次（2026-11-05）：

- 接通 8 个命令：可执行程序检测/版本、基础媒体元数据、完整 ffprobe 信息、整文件关键帧、执行计划、取消与区间抽帧。复用前端 `buildExecutionPlan` 产出的 argv，仅在末输出路径前插入进度管道参数；标准错误保留可定位的失败尾部。真实新版 ffprobe 带逗号的关键帧输出已纳入解析，首个 0 秒关键帧可正常返回。
- 转换、探测与抽帧按窗口/文档代次归属；支持启动前和探测期间取消，同窗口重复 ID 拒绝，跨窗口同 ID 独立运行。刷新、渲染进程退出、关窗和应用退出回收所属进程树，私有进度/日志仅投递给任务窗口。转录取消同时中断模型请求和对应音视频预处理。
- 区间抽帧支持毫秒间隔与归一化 ROI，JPEG 写入稳定后发送帧路径/时间戳；保留无关文件，已有抽帧产物要求另选目录。结束事件切换至 OCR 阶段，后续 OCR/VLM 由现有前端流程处理。
- 修复自动转录结束后结果区仍显示占位的问题；任务缓存缺少正文时通过资产 API 读取派生文件，工作台编辑保存以资产根目录解析完整路径。
- Electron 进程行为测试 8 项、前端取消/自动结果展示与保存/既有 FFmpeg actions 测试 11 项通过；Electron/前端类型检查、平台隔离与完整生产构建通过。
- 真实 Windows Electron 生产资源验证元信息/关键帧、160×120/12fps 视频、PCM WAV、ROI 区间抽帧、工作台拖放并执行转换、跨窗口同 ID 与取消隔离，以及刷新/关窗/应用退出时 FFmpeg 进程回收。
- 转录工作台导入真实 MP3，经实际 FFmpeg 转 PCM WAV 后提交本地受控 STT HTTP 端点；端点校验 multipart 音频的 RIFF/WAVE 内容和模型，返回正文后写入 `transcription.md` 并关联资产。工作台自动展示、编辑保存与临时 WAV 清理均已验证。该端点用于验证传输/存储链路，真实 ASR 识别质量与视频 VLM 继续接续；Windows 本地视频原生 OCR 已在后续批次完成全链路验收。
- 证据位于已忽略的 `.tmp/electron-ffmpeg/`：`runtime-result.json`、`transcription-result.json`、`lifecycle-result.json`、`workbench-complete.png`、`transcription-complete.png`、`tests.log`、`frontend-tests.log` 和 `build.log`。

LLM 数据持久化批次（2026-11-04）：

- 接通会话、索引、损坏清单与请求快照四类逻辑写入；校验 ID、JSON、revision 与快照 4 MiB 上限。沿用原文件布局和结果包络，旧文件以 revision 0 读取，过期写入和版本回退返回 staleRejected。
- 每路径队列与跨进程目录租约串行化提交；临时文件排他创建、同步写盘后原子替换，原文件保持到替换成功。可解析的旧索引才轮换备份，损坏主文件保留上次备份；目录重定向、设备名和路径穿越在应用路径入口拒绝。
- 删除先落盘最高安全 revision 的删除标记，再等待并清理请求快照，最后将会话移入 sessions-trash。迟到写入在当前进程和重启后均被拒绝；删除标记损坏时要求先恢复该标记。共享文件资产保留现有领域归属。应用退出等待已接收的持久化任务收尾。
- Electron 使用带心跳的目录租约（默认 30 秒判定过期、5 秒更新，获取锁等待约 5 秒），配合进程内队列。Electron 与 Tauri 继续使用各自数据目录；跨宿主数据迁移随第 6 节推进。
- 新增 9 项行为测试，覆盖四类存储、并发 revision、备份保留、输入与链接边界、替换失败、删除/快照竞态、跨进程锁及退出排空。与共享文件/工作区及前端持久化、请求快照、输入草稿相关测试合计 70 项通过；Electron/前端类型检查、平台隔离检查和生产构建通过。
- 真实 Windows Electron 使用应用现有 store 的导入、选择、重命名和删除动作，验证两份会话及真实文件/虚拟附件的保存，刷新恢复，按会话切换草稿，真实菜单分离对话区/输入框、输入后由主窗口保存及两次回附。整进程退出后复用隔离数据，在关闭 Dev Control 的生产资源实例恢复选择、正文、草稿和共享附件；原删除标记继续拒绝旧会话写入。
- 请求快照文件写入/旧 revision 拒绝与删除清理通过宿主协议验证；本批业务验收以导入的本地会话为样例。macOS/Linux 对应文件系统与窗口运行验证继续接续。实机脚本和证据位于已忽略的 `.tmp/electron-llm-storage/`：`runtime-result.json`、`restart-result.json`、`session-restored.png`、`restarted-session.png`。

LLM 流式搜索批次（2026-11-04）：

- 接通智能体/会话/全部范围及 exact/and/or 匹配，覆盖名称、描述、预设名称/正文、消息正文和推理内容。结果保留相对路径、角色和更新时间，按 10 条或约 100 ms 逐批发送，达到上限时完整发出已接受结果。
- Electron Channel 通过独立 IPC 定向投递，回调保留在渲染器，监听先于命令注册；按请求区分的流结束标记保证尾部事件处理后再释放监听，兼容同 Channel 的并发调用。实机发现命令回复可能先于尾部事件抵达，已修复提前释放导致 done 丢失的问题。
- 搜索按窗口归属，取消等待当前任务结束，同窗口新搜索接替旧任务。导航、渲染进程退出、窗口销毁和应用退出撤销任务；旧文档的结束标记也受导航代次约束。通用事件广播无法注入独立 Channel。
- 高亮使用 UTF-16 偏移，中文、emoji、组合字符及 JSON 转义正文均可定位。跳过损坏 JSON 和并发恢复时已消失的文件，现存重定向目录仍拒绝访问。搜索仍按文件扫描，海量数据索引化与单文件解析性能继续独立评估。
- 新增 13 项相关回归测试，保护字段/匹配模式、上限与尾批、Unicode、高亮、窗口隔离、取消/导航、并发恢复、监听清理及前端旧结果隔离；与现有会话持久化/工作区测试合计 35 项通过。Electron/前端类型检查、平台隔离检查和生产构建通过。
- 真实 Windows Electron 生产资源验证了侧栏连续输入/清空、中文和 emoji 高亮、全部匹配模式、智能体字段、600 文件扫描的 23 条上限、同 token 多窗口隔离、取消、通用事件隔离、搜索中窗口刷新及主窗口刷新后检索。测试使用隔离目录和现有会话导入动作；知识库初始化能力错误继续留在后续批次处理。
- 证据位于已忽略的 `.tmp/electron-llm-search/`：`runtime-result.json`、`search-unicode.png`、`command-inventory-current.json` 和 `build.log`。macOS/Linux 真实运行验证继续在对应系统接续。

## 6. 后台与正式分发

- [x] 后台 JS 运行时的应用级 Node utility process、启动/心跳、失联恢复、页面请求隔离与应用退出清理；Windows 生产资源已验证。
- [x] 复用现有 Agent 多轮编排逻辑，提取 Node 可运行核心与宿主端口，并接回真实聊天入口。
- [x] 复用现有单节点请求逻辑，提取 Node 可运行核心、上下文/模型/响应/快照端口，并接回真实聊天入口。
- [x] 模型请求/虚拟渠道中间件提取与 Renderer 复用，OpenAI 兼容映射注入传输，Node 原生 HTTP/SSE/文件展开链验证。
- [x] 管道执行及六个上下文处理器共享，Renderer 适配器复用，执行取消与 Node 行为验证；其余处理器和 Node Token/媒体服务继续适配。
- [x] 全部 11 个上下文处理器与宏内核共享，统一装配清单，完整 Node 管道到真实 HTTP 请求验证；正式 Node 宿主服务继续接线。
- [x] Electron 渠道配置/凭据事务由主进程接管，复用原 revision 仓库和规范化。
- [x] 密钥轮询、熔断与状态持久化由主进程统一持有，窗口使用异步选钥和可回滚的状态投影；双窗口与刷新恢复已验证。
- [x] Node 生产文本分词与图片/音视频 Token 计费端口，共享原引擎及媒体预算算法，真实 gzip 资产和完整上下文到 HTTP 链验证；Worker 装配与长图像素服务继续接线。
- [x] Node 任务级附件字节、图片原生解码/缩放/编码及长图切片服务，共享切点和预算；应用级 Worker 正式装配继续接线。
- [x] Worker 到 Main 的内部配置/执行期 Key 通道、生产初始化握手及跨代次事务排空；配置和密钥操作复用窗口侧应用所有者，真实任务装配继续接线。
- [x] 正式 Worker 持有附件/图片/Token 上下文资源池，接通 Main 当前文件策略及既有资产根服务，scope 与原生队列支持正常退出释放；真实工具/审批与任务入口继续接线。
- [x] Worker 任务级多协议聊天模型服务、独立类型契约与 Main 系统代理能力；沿用原渠道/Key/协议映射，真实任务入口继续接线。
- [ ] 真实 Agent 生成链接管、持久 `SessionEvent`、订阅游标与增量重放、审批重连、全部窗口销毁后的任务延续及完成通知。
- [ ] 后台运行时 macOS/Linux 真实生命周期验证。
- [x] Windows 窗口关闭/销毁和应用退出快照、最小化状态及新进程恢复。
- [ ] 真实系统注销/关机和 macOS/Linux 窗口退出恢复验收；Windows 系统会话事件已接线并通过合成事件检查。
- [ ] 应用内更新、发布 workflow、签名与生产数据迁移。
- [ ] 安装后的协议关联、macOS/Linux 对应系统构建与运行验证。

后台 Node 运行时基础批次（2026-11-05）：

- 新增应用主进程持有的 `BackgroundRuntime` 和独立 Node utility process，沿用 `runtime.ping/getInfo` 诊断契约。接通 `background.start/call`、只读状态、版本校验、15 秒启动等待、5 秒心跳、20 秒失联阈值与新代次恢复；在途 RPC 上限 64，默认 30 秒，可设置至 120 秒。
- 页面刷新、渲染进程退出和窗口销毁仅释放该页面的请求；后台进程由应用退出统一回收，清理超时升级到进程树。Renderer 无 ready/heartbeat 写入口。前端通过平台模块接入 Electron 直连 RPC，Tauri 继续沿用既有事件桥。
- 修正桥接层停止时就绪等待未释放、超时等待残留、旧启动覆盖新连接及同步派发异常未清理的问题。宿主 8 项、前端桥与能力 10 项行为测试通过；Electron/前端类型检查、平台隔离检查和完整 Electron/Vite 生产构建通过。
- 最终生产构建于北京时间 12:54:06 完成；12:54–12:55 的 Windows 真实 Electron 完成 6 组检查：Node 子进程身份与启动；未知方法、非法超时和伪造心跳拒绝；双窗口共用、主窗口刷新/切路由及独立心跳；关闭子窗口和主窗口托盘恢复；仅挂起测试所属 Worker 后失联回收并启动新代次；显式退出清理主进程及 Worker。初跑脚本补上刷新后的前端桥等待，最终产物完整复验通过，隔离实例已退出。
- 当前 Worker 只承接运行时诊断。真实接管入口仍在 `sessionGenerationManager` → `useChatHandler` → `useChatExecutor/useToolCallOrchestrator`；现有 `executeOrProxy` 将分离组件的生成动作代理给主窗口 Data Owner。下一步需抽取这些链路的宿主依赖与事件写入边界，复用原生成和工具编排逻辑，再落地持久 `SessionEvent`、窗口投影与审批重连。
- 证据位于忽略目录 `.tmp/electron-background-runtime/`：`host-tests.log`、`frontend-tests.log`、`platform-check.log`、`build-final.log`、`runtime-result.json`、`runtime-final.log` 与 `preview-final.log`。后台 Agent 任务接管、全部窗口销毁后的任务存续、任务完成通知和跨平台验证继续保留待办。

Agent 编排宿主边界批次（2026-11-05）：

- 将现有 `useToolCallOrchestrator` 的多轮循环提取到 `src/tools/llm-chat/core/execution/chatOrchestrator.ts`，前端入口改为注入现有服务的适配器。核心可由 Node 直接调用，模型执行、协议/工具、审批、压缩等待、会话树、保存、错误处理及投影调度通过明确端口提供。单节点与编排参数移至共享类型文件，原 composable 保留类型导出。
- 沿用原 Agent 权限、强制审批安全上下文、派发深度、模型绑定、VCP 响应分段回调、工具本地媒体及重解析路径。运行所有者可提供 AbortController；异步保存前后的取消检查阻止迟到的模型/工具派发，限速计时器随取消释放，状态保存按顺序收尾。
- 修正轮次耗尽后多建空助手并残留生成状态、工具节点未进入统一控制与清理集合的问题。审批取消以拒绝结果结算时，保留工具审计并将运行结果归类为取消；保存失败停止后续派发。
- Node 环境共享核心 14 项与后台宿主 8 项测试通过，前端单节点/VCP/流式生命周期与审批相关 57 项测试通过。Electron/前端类型检查、平台隔离检查和完整 Electron/Vite 生产构建通过。构建诊断发现前端目标库未启用 Array.at，已改用兼容索引访问；最终构建于北京时间 13:28:03 完成。
- 最终 Windows Electron 于 13:29:00–13:29:14 使用受控本地 SSE 模型端点完成 5 组检查：模型请求触发真实只读 `getTaskStatus`，第二轮消费实际“任务不存在”结果；最大迭代 1 停在工具结果并释放停止状态；30 秒限速等待点击停止后约 92 ms 收尾且无下一轮请求；真实人工审批等待点击停止后清空审批条并保留拒绝审计；页面刷新恢复终态。该端点用于确定性协议验证，真实推理模型验收保持独立范围。
- 证据位于忽略目录 `.tmp/electron-agent-core/`：`host-tests.log`、`frontend-tests-final.log`、`platform-check.log`、`build-final.log`、`runtime-result.json`、`runtime-final.log`、`normal-tool-loop.png`、`iteration-limit.png`、`approval-wait.png` 与 `cancelled-restored.png`。隔离应用及本地端点均已退出。
- 该批完成时，生产生成仍由 Renderer 适配器持有；单节点执行提取的后续进展见下方记录。Worker 任务所有权、持久 `SessionEvent`、订阅重放和审批重连继续推进。

Agent 单节点共享执行核心批次（2026-11-05）：

- 将现有单节点请求路径提取为 `src/tools/llm-chat/core/execution/singleNodeExecutor.ts`，前端 `useSingleNodeExecutor` 改为宿主适配器。上下文组装、附件强制深度/转写回退、续写定位、请求快照归因、VCP 分段与排队分支、重试及回复收尾继续共用原逻辑。设置、渠道查询/参数过滤、世界书、转写、管道、模型发送、节点树、流式缓冲、快照仓库与压缩通过端口提供；前端模型发送保留现有渠道路由和回退。
- 共享 VCP 展示解析器迁至 `src/utils/vcpToolBatchDisplay.ts`，渲染器原路径保持重导出。节点创建契约移至共享执行类型，原入口保留类型导出。两个执行核心均可在 Node 环境直接运行。
- 重试等待复用可取消计时器；流式文字、推理、图片与 VCP 回调按请求尝试隔离。取消后的准备结果和提供方最终结果在继续派发/收尾前检查信号；token 校验期间取消时排空本次缓冲。普通与分段回复统一按本次执行 Agent 终结，避免展示选择影响运行归属。
- 新增 13 项 Node 行为测试，保护宿主上下文与模型绑定、续写/快照归因、转写回退、各准备阶段取消、重试取消、迟到回调隔离、流中断和异步收尾取消。与编排/后台宿主共 35 项通过；现有单节点/VCP/解析器/流式生命周期及审批相关 114 项通过。Electron/前端类型检查、平台隔离和完整 Electron/Vite 生产构建通过，构建完成于北京时间 13:50:20。
- 最终 Windows Electron 隔离实例于北京时间 13:52:09–13:55:16 使用受控本地 SSE 端点完成 8 组检查：受控模型请求→真实只读工具→模型、迭代上限、限速取消、审批取消、实际 HTTP 429 后停止约 171 ms 收尾、在途流停止保留已接收正文并丢弃迟到内容、两轮 completed 请求快照与节点归因、刷新恢复部分正文终态。429 取消后等待超过原 8 秒重试间隔，提供方请求数保持 1。实机端点用于确定性协议验证，真实推理模型另行验收。
- 验收脚本修正了快照 `completed` 终态、`route` 内归因字段及刷新后投影等待；补验沿用同一隔离实例和生产产物。证据位于忽略目录 `.tmp/electron-single-node/`：`node-tests.log`、`frontend-tests-accepted.log`、`platform-check.log`、`build.log`、`runtime-result.json`、`runtime-final.log`、`normal-tool-loop.png`、`retry-wait.png`、`stream-stopped.png`、`cancelled-restored.png`。应用与受控端点已退出。
- 当前实际执行仍由 Renderer 注入服务。Worker 接管需继续实现 Node 侧上下文/渠道/响应/存储适配、运行会话状态和真实工具/审批所有权，再接持久事件与重放。共享核心提取已完成，应用级真实 Agent 运行仍在实施。

Agent 模型中间件与 Node 传输批次（2026-11-05）：

- 将现有 `useLlmRequest` 的物理模型请求路径迁入 `src/llm-apis/execution/modelRequestExecutor.ts`；渠道组合迁入 `channelRequestExecutor.ts`。Renderer 原入口注入现有渠道配置、密钥轮询/状态、完整适配器表、Inspector、日志和停止请求服务。模型路由、能力过滤、续写、特种请求分发、诊断与错误策略共用生产逻辑，虚拟渠道保留主备选择、输出后停止回退、推理重放目标绑定及成员各自认证/网络设置。
- OpenAI 兼容聊天的应用 DTO 映射与共享 Provider Core 调用迁至 `adapters/openai/chat-executor.ts`，Transport 与请求头解析通过依赖注入提供；原聊天与请求头入口保持兼容。共享 `transports/transport.ts` 保留 JSON、文件引用、multipart 和响应观察器契约；`errors.ts` 提供同一组错误构造器，`common.ts` 继续重导出。
- 新增 `electron/llm-transport.ts`，以执行所有者生命周期调用现有 Node HTTP、重定向、代理及本地文件展开服务，支持整条响应流期限、取消与显式销毁。上游解码提前结束时关闭响应 reader，释放在途 socket；已取消请求在密钥选取和适配器派发前短路，取消后的响应事件和最终结果保持丢弃。
- 新增 9 项 Node 真 HTTP/SSE 行为测试：主备真实请求与认证/模型/诊断归因、流中断后的输出边界、取消与密钥策略、响应头后的流超时、本地图片实际字节展开、诊断故障隔离/401 策略、预取消、提前结束读取及执行所有者销毁。与 Node 编排/单节点/后台和 HTTP 相关测试合计 56 项通过；前端渠道、协议、续写、传输和聊天相关 101 项通过。Electron/前端类型检查、平台隔离和完整 Electron/Vite 生产构建通过，最终构建完成于北京时间 14:16:52。
- 最终 Windows Electron 于北京时间 14:17:55–14:18:19，使用同一生产聊天入口和受控本地 SSE 端点完成 8 组检查：真实只读工具循环与第二轮实际工具结果、迭代上限、限速与审批取消、实际 HTTP 429 后停止约 113 ms 收尾、在途流停止与迟到内容、两轮 completed 请求快照及刷新恢复。429 取消后超过原重试间隔，提供方请求保持 1 次；Node 端额外验证的主备、文件和 socket 行为保持独立证据范围。
- 证据位于忽略目录 `.tmp/electron-model-runtime/`：`node-tests.log`、`frontend-tests.log`、`typecheck-final.log`、`platform-check.log`、`build.log`、`runtime-result.json`、`runtime.log`、`normal-tool-loop.png`、`retry-wait.png`、`stream-stopped.png` 与 `cancelled-restored.png`。隔离应用及受控端点均已退出。
- 当前生产生成继续由 Renderer 持有。Node 传输与 OpenAI 兼容映射已打通；其他协议的 Node 适配、渠道配置/密钥状态的执行所有者服务、上下文/响应/存储、真实工具和审批仍需接入 Worker，随后实现持久事件与重放。Worker 公开方法仍为诊断方法。

Agent 上下文共享处理器批次（2026-11-05）：

- 将现有会话历史、请求正则、世界书、会话变量、Token 限制和消息格式化实现迁入 `src/tools/llm-chat/core/pipeline/processors/`，以工厂接收执行所有者日志及作用域 Token 服务。Renderer 原入口作为适配器，保留原处理器、世界书类与格式化函数导出；现有长图分片、附件计费和预览统计继续使用原 Token 服务。HTML 转换缓存按工厂实例复用。
- 管道循环迁入 `executeContextPipeline.ts`，原 `PipelineEngine` 注入现有日志与错误呈现。`PipelineContext.signal` 绑定单节点执行的同一取消信号，在处理器启动前、异步完成与异常路径检查；普通处理错误继续记录后执行，预设配置错误及取消退出后续阶段，诊断跟踪独立隔离。
- 请求正则读取本次上下文的 `settings.regexConfig`，解除对界面配置 Store 的直接依赖；正则解析和有效图片尺寸计算移入纯模块，旧工具函数入口保留导入和重导出。其余规则顺序、角色/深度过滤、世界书扫描、变量快照、截断及推理回放行为保持原实现。
- 新增 8 项 Node 行为测试，直接执行原历史/HTML/附件/待发消息、请求规则隔离、世界书与变量快照、预算/图片尺寸/推理回放，以及错误继续、配置错误和异步完成/拒绝两类取消路径。预算测试注入确定性 Token 服务。与编排、单节点、模型、后台和 HTTP 相关测试合计 64 项通过；前端上下文/预设/单节点 61 项与窗口/拖放/缩放 15 项通过。
- 首次生产资源实机启动暴露原窗口适配器的初始化循环：`electron/window` → `electron/drag-drop` → `native/window`，导致宿主函数在赋值前被捕获。通过纯坐标适配入口 `native/dpi.ts` 切断反向引用；新增两种导入顺序的公开窗口工厂行为测试，其中 Electron 入口优先用例可复现修复前的 `getCurrentWindow is not a function`。原拖放坐标及释放行为继续通过。
- 最终 Electron/前端类型检查、平台隔离和完整 Electron/Vite 生产构建通过，构建完成于北京时间 14:48:34。最终 Windows 隔离实例于 14:49:04–14:49:27 使用受控本地 SSE 端点完成 8 组检查：真实只读工具循环与第二轮工具结果、迭代上限、限速/审批取消、实际 HTTP 429 后停止约 197 ms 收尾、流停止保留已接收正文并丢弃迟到内容、两轮 completed 快照和刷新恢复正文投影。429 请求在原重试等待期后保持单次；端点用于确定性协议验证。
- 证据位于忽略目录 `.tmp/electron-context-runtime/`：`node-tests.log`、`frontend-tests.log`、`frontend-single-node.log`、`window-before.log`、`window-tests.log`、`platform-check.log`、`build-final.log`、`runtime-result.json`、`runtime-final.log` 与聊天/重试/流取消/刷新截图。早期 `runtime.log` 保留初始化循环的诊断，最终验收使用修复后构建；隔离应用和受控端点已退出。
- 当前真实聊天继续由 Renderer 持有。预设与宏、Recall、异步任务、转写和资产物化，以及 Node Token/长图/媒体服务继续适配；其他模型协议、配置/密钥状态、响应/存储和真实工具/审批所有权仍需接入 Worker，再实现持久 `SessionEvent` 和窗口重连。Worker 公开方法保持运行时诊断范围。

Agent 完整上下文装配与宏内核批次（2026-11-05）：

- 将原预设注入、Recall、异步任务、转写和资产解析迁入共享工厂，至此全部 11 个上下文处理器均可由执行所有者装配。`createContextProcessors.ts` 要求注入明确的宏/检索/任务/转写/媒体/Token 服务；`processor-list.ts` 与 Renderer 默认注册共用清单，原启用与排序逻辑保留。Renderer 原入口继续调用现有服务，原类、处理器、占位符函数和格式化函数导出保持兼容。
- 原宏注册、三阶段处理、静态校验和上下文构建迁入 `macro-engine/runtime/`。每个执行所有者有独立注册表；Renderer 注入 Vue 响应式 Map 与原诊断服务，原初始化函数继续注册完整内置宏。核心/时间/变量/函数宏改为依赖纯元数据定义。模型匹配和预设私有附件映射也抽出日志端口，避免共享注入组装器拉入界面模块。
- 宏上下文透传执行信号；宏阶段和每次异步宏返回后检查取消。`runContextOperation` 保护检索、转写、文档拆分、媒体读取/转换的派发与返回，普通失败回退保留；取消直接退出处理器，拦住迟到结果、后续宏和后续管道阶段。底层 Node 服务的实际进程/网络回收仍需在服务适配时接入生命周期。
- 新增 8 项 Node 行为测试：原三阶段内置宏与注册表隔离/静态校验；全部处理器装配后将预设宏、世界书、授权 Recall、变量、任务结果、文本/虚拟附件及实际音频文件字节送入原 OpenAI 映射和真实 Node HTTP；任务结果资产与实时进度；Office 占位符/文本/图片拆分；检索、转写、资产及异步宏取消。预算、Recall、转写与 Office 服务使用明确的夹具实现，实际生产 Node 服务保持独立待办。
- 与已有上下文、编排、单节点、模型、后台和 HTTP 测试合计 72 项 Node 测试通过；前端处理器/预设/宏/转写/附件及聊天相关 109 项通过。Electron/前端类型检查、平台隔离及完整 Electron/Vite 生产构建通过，构建完成于北京时间 15:12:48。
- 最终 Windows 隔离实例于 15:13:48–15:14:13 使用受控本地 SSE 端点完成 8 组生产聊天检查：原工具宏保底注入与实际只读工具循环、第二轮实际工具结果、迭代上限、限速与人工审批取消、实际 HTTP 429 后停止约 210 ms 收尾、在途 SSE 取消与迟到内容隔离、两轮 completed 快照与刷新恢复正文投影。429 请求在原重试等待期后保持单次。受控端点用于确定性协议验证；真实推理模型验收继续单列。
- 证据位于忽略目录 `.tmp/electron-context-services/`：`node-tests.log`、`frontend-tests.log`、`platform-check.log`、`build.log`、`runtime-result.json`、`runtime.log` 及聊天/重试/流取消/刷新截图。Node 初跑修正了共享路径中模型匹配的宿主导入，并按现有变量定义与 Office 拆分 DTO 修正了夹具；最终证据对应修正后代码与构建。隔离应用及端点已退出。
- 当前真实聊天仍由 Renderer 持有。Node 生产配置/密钥状态、Token/长图/文档/转写、Recall/任务读取和完整宿主宏服务，以及响应/存储、真实工具/审批所有权继续接入 Worker；随后实现持久 `SessionEvent`、重放与窗口重连。Worker 公开方法仍处于运行时诊断范围。

应用级渠道配置与共享密钥策略批次（2026-11-05）：

- 新增主进程持有的 `LlmConfiguration`，`useLlmProfiles` 在 Electron 中通过受信任的 `llm.config.load/save` 加载与提交渠道。目录沿用应用数据根下的 `llm-service`，`profiles.json` 版本和凭据仓库格式保持兼容；旧 localStorage 在宿主提交成功后清理。Tauri/浏览器继续沿用既有存储适配。
- 原规范化与凭据 revision/历史链迁入 `configuration/profiles.ts` 和 `llm-secret/vault.ts`；主进程使用同一算法装配 Node 文件服务。事务按应用根串行并持有目录锁，原子替换两份文件；保存携带预期 revision，过期写入返回冲突。Renderer 顺序提交捕获的快照，退出时等待已接收事务排空。跨窗口实时配置投影继续待办。
- Node 服务按既有快照链恢复部分提交，主凭据无法读取或解码时使用可解码备份。配置损坏、配对凭据与备份均缺失/不可解码，以及结构缺失而凭据仍有内容时保留文件并返回可行动错误，避免覆盖可恢复数据。
- 原 `useLlmKeyManager` 完整轮询、用户禁用、按渠道熔断/恢复、哈希索引及脱敏逻辑迁入共享 `configuration/keyManager.ts`，Renderer 注入原响应式状态与存储。密钥日志改用哈希标识，对应原行为测试同步调整。生产 Key 状态持久化仍归 Renderer；后续 Node 请求所有者需装配正式状态服务。
- 新增 6 项 Node 行为测试，覆盖旧单 Key/DeepSeek/v1 仓库迁移、原仓库格式互通与所有者重建、双所有者并发/旧版本冲突/捕获快照、连续三次结构写入失败后的凭据恢复、备份/损坏/缺失保护、退出排空及共享轮询/熔断/恢复。与模型、完整上下文和后台运行时相关测试合计 39 项通过；既有前端配置/密钥/仓库/健康策略 42 项通过。Electron/前端类型检查、平台隔离和完整 Electron/Vite 生产构建通过，构建完成于北京时间 15:37:59。
- 最终 Windows 隔离实例于北京时间 15:40:38–15:41:04 完成 11 组检查：真实 UI 导入经 Node 事务分离保存两把夹具密钥及请求头；刷新恢复后实际请求使用恢复的认证与请求头；实际工具循环、迭代上限、限速/人工审批取消、HTTP 429 后停止约 169 ms、SSE 部分输出与迟到内容隔离、完成快照和刷新投影；受信任 IPC 拒绝旧 revision 保存并保留获胜配置。端点与凭据均为本地确定性夹具，真实推理验收继续单列。
- 证据位于忽略目录 `.tmp/electron-llm-configuration/`：`node-tests.log`、`frontend-tests.log`、`platform-check.log`、`build.log`、`runtime-result.json`、`runtime.log` 及聊天/取消/刷新截图。隔离应用与端点已退出，实例清单为空。
- 当前真实聊天继续由 Renderer 调度。Token/长图/文档/转写、Recall/任务和完整宿主宏服务、密钥状态持久化、响应/存储及真实工具/审批所有权继续接入 Worker；持久 `SessionEvent`、重放、审批重连和全部窗口销毁后的真实任务延续保持待办。Worker 公开方法仍为诊断方法。

应用级密钥状态与多窗口投影批次（2026-11-05）：

- 新增 Main 持有的 `LlmKeyState`，复用共享密钥策略内核，按根目录串行及跨进程文件锁处理增量命令；每次操作重新读取原 `key-states.json`，原子写回 1.1.0 格式。旧明文索引与错误消息经原规则迁移；损坏或不可读文件保留并返回错误。已接受事务在窗口销毁后继续完成，退出时统一排空。
- Renderer 通过受信任 `llm.keys.call` 异步选钥，订阅带进程内 revision 的哈希状态快照。同步界面编辑使用乐观投影，新快照上重放待确认编辑，失败后回滚；原始密钥只定向回复请求方。Renderer 伪造 owner 状态事件被拒绝，错误消息清理当前有效渠道的全部已知密钥。草稿密钥与显式测试禁用渠道沿用原调用契约。
- 模型/渠道请求、DeepSeek 工具和连接测试接入异步选钥及健康状态回写。选钥等待响应执行取消，迟到选钥结果无法触发网络；已接受状态事务继续收尾。请求派发前停止也避免向上游发送多余中断。
- 实机双窗口发现渠道表单选中/回填会触发多余自动保存，放大 revision 冲突；已改为仅真实编辑防抖保存、导航时刷写待保存编辑、删除前清理定时器，并处理定时保存的拒绝。Main 对规范化后完全相同的保存保持幂等，旧 revision 的实际内容修改继续拒绝。
- 相关 Node 测试 39 项、前端测试 58 项通过。完整 Electron 生产构建完成于北京时间 16:12:22；最后的删除定时器修复后，前端类型检查与 Vite 生产构建再次通过，最终 Renderer 资源生成于 16:15:55。平台隔离和相关源码差异格式检查通过。
- 最终 Windows 隔离实例于北京时间 16:20:37–16:21:07 完成 14 组检查：真实 UI 导入、双窗口共享轮询与禁用即时同步、刷新恢复、熔断/重置及错误脱敏、事件防伪、实际只读工具循环与第二轮结果、迭代上限、限速/审批取消、实际 HTTP 429 后停止约 206 ms、SSE 部分输出与迟到内容隔离、completed 快照与重试抑制、刷新恢复及旧 revision 冲突保护。端点与凭据均为本地确定性夹具。
- 证据位于忽略目录 `.tmp/electron-key-state/`：`node-tests.log`、`frontend-tests.log`、`build-final.log`、`frontend-typecheck-final.log`、`vite-final.log`、`runtime-result.json`、`runtime-final.log` 及状态/聊天/取消/刷新截图。初跑记录保留窗口激活时序与表单多余保存的诊断；最终截图等待标签过渡结束。隔离应用和端点已退出，本批补录时再次确认实例清单为空。
- 当前生产聊天仍由 Renderer 调度，Worker 继续仅公开诊断方法。Node Token/长图/文档/转写、Recall/任务和宿主宏服务、响应/存储、真实工具/审批所有权继续接入 Worker；持久 `SessionEvent`、重放、审批重连和全部窗口销毁后的真实任务延续保持待办。

Node 生产 Token 与媒体预算服务批次（2026-11-05）：

- 新增 `electron/token-calculator.ts`，直接复用原 `TokenCalculatorEngine` 和有界文本 scope；按上下文固定已解析模型、用户规则、内置覆盖和已安装 Profile，保持规则优先于模型 tokenizer、再按模式匹配的原解析顺序。后续 scope 读取新的持久配置，原 scope 保留已有快照；引擎按注册表内容有界复用，并发冷加载共享原实例化任务。
- 直接读取 Vite 构建的 `tokenizers/<id>/*.json.gz`，本地及远端来源读取应用 `tokenizer-assets` 中的已安装文件。注册表与资产路径沿用应用真实祖先路径保护，并限制文件和解压大小；损坏注册表保留文件并返回错误，资产不可用沿用原引擎的显式估算结果。服务接收模型快照，避免再次读取渠道凭据或运行时匹配元数据规则。
- 抽出共享 `messageTokenCalculator.ts`、`registrySnapshot.ts` 与纯图片尺寸算法，Renderer 原入口继续复用同一计费和覆盖逻辑，媒体成本保持发送前等比缩放、默认视觉计费、音视频时长和元数据缺失估算标记。上下文 Token 端口改为纯类型契约，Node 装配可直接注入生产服务。长图像素分析、切片及实际媒体转换继续独立适配。
- 将已验证的可取消 owner 等待抽为 `waitForOwnerOperation`，原异步选钥导出保持兼容；Token 取消及时释放当前等待，已开始的共享资产加载继续服务其他上下文。同步 CPU 编码的中断仍受 Node 事件循环调度约束。
- 新增 8 项 Node 集成用例，保护真实 gzip 分词、本地与缓存远端资产、规则/模型优先级、注册表与模型快照、缩放和时长计费、原历史预算截断、损坏配置恢复、路径重定向及并发加载期间的取消隔离。完整 11 处理器到真实 HTTP 的已有链路替换为实际 Node Token 服务，其余 Recall/任务/转写等仍明确使用夹具。
- 相关 Node 测试共 41 项、前端测试 34 项通过；Electron/前端类型检查、平台隔离及完整 Electron/Vite 构建通过，最终构建完成于北京时间 16:42:15。初次构建发现共享模块使用了前端目标库未声明的 `Object.hasOwn`，已改为兼容写法后完整重建。另以实际生产目录的 gzip 产物完成服务读取，`hello world` 为 2 个精确 Token。
- 最终 Windows 隔离实例于北京时间 16:45:26–16:45:59 完成 15 组检查：双窗口共享 Key 状态、真实只读工具循环、迭代上限、限速/审批取消、HTTP 429 后停止约 196 ms、SSE 部分保留与迟到内容隔离、快照/刷新恢复、revision 冲突保护，以及 Token 计算页按模型/按分词器均将 `hello world` 计为 2 个精确 Token。使用本地受控端点与夹具凭据；实际推理模型保持独立验收范围。隔离应用和端点均已退出，实例清单为空。
- 真实 Windows 生产资源与最终截图验收见本批证据：`.tmp/electron-token-service/` 中的 `node-tests.log`、`frontend-tests.log`、`build.log`、`platform-check.log`、`production-assets-result.json`、`runtime-result.json`、`runtime-final.log` 与 `token-calculator.png`。首轮界面检查已通过，最终脚本另等待模式选中与样式过渡，确保截图对应稳定状态。
- 当前生产聊天继续由 Renderer 调度，Worker 公共方法保持诊断范围；Node Token 服务已可由执行所有者注入共享管道。Worker 到 Main 配置/Key 服务、长图与媒体物化、检索/任务/转写、完整宿主宏、响应/存储、真实工具与审批所有权，以及持久 `SessionEvent` 和窗口重连继续实施。

Node 上下文图片与长图物化服务批次（2026-11-05）：

- 新增 `NodeContextAttachments`，接收应用路径、当前资产根与本地安全策略端口，覆盖正文、inline、资产库、本地文件和智能体私有附件。任务首次读取固定字节，预算与发送共用快照；每次本地访问继续检查当前白名单、死区和审批。应用/资产路径继续沿用真实祖先路径校验，单文件及任务字节快照总量上限为 64 MiB，任务销毁释放引用。
- 新增 `NodeContextImages` 与现有 addon 内的 `RasterImageRuntime`。解码、EXIF 归一化、行像素方差、裁剪、等比缩放和 PNG/JPEG/WebP 编码在原生后台线程执行；JPEG 采用白底，WebP 应用质量参数。输入及单张输出上限 64 MiB，解码上限 32 Mi 像素；跨任务原生图片组串行并限制队列，取消只关闭所属实例，退出排空已接受组。
- 原长图行方差、Otsu、连续区域和有效配置算法抽到纯 `imageSlicePlan.ts`，Renderer Canvas 入口继续重导出原契约。Node 从原生像素获取方差后复用同一切点算法；任务 scope 包装真实 Token 服务，按各片尺寸计费，再用同一字节/计划发送。整组编码成功后才公开片段，失败回退到原图；统计预览保持惰性读取并标记估算。
- 完整 11 处理器到真实 HTTP 的已有链路进一步替换为实际 Node 图片、附件和长图服务，音频与图片均读取真实夹具字节；Recall、任务和转写等仍保留明确的夹具端口。测试覆盖真实像素规划、PNG/JPEG/WebP、质量、EXIF、透明边缘、预算与发送一致性、冻结文件内容、当前安全策略复检、损坏图片/尺寸上限、取消队列和整组回退。
- 原生图片初次验证发现透明图转 JPEG 时，先按直通 RGBA 缩放会产生暗边；已改为 JPEG 先铺白底，并为保留透明通道的缩放应用关联 alpha。单独的夹具导入遗漏与 Promise 取消返回形式也已修正，初跑证据保留在本批临时目录。
- 最终相关 Node 测试共 55 项通过，其中新图片/附件服务 9 项；前端切片/Token 等相关测试 31 项通过。最后的 scope 取消收尾修正后，图片服务与完整上下文 17 项再次通过，Electron 类型检查再次通过。完整 Electron/Vite 构建完成于北京时间 17:16:01，平台隔离通过；该轮原生构建包含最终透明通道修复。
- 另在真实 Electron utility process 中加载最终 `dist-electron/native-runtime` addon 和生产 gzip 分词资产，完成任务级图片到 HTTP 链：80×800 长图按共享切点划为 4 片，各片最大边缩至 70，图片预算 1020、文本预算 2；端点收到实际 4 张 PNG，切片尺寸逐张解码核对。该夹具验证真实 Electron Node/N-API 与服务链，生产 Agent Worker 的正式任务装配仍保持后续范围。
- 最终 Windows 生产窗口隔离实例于北京时间 17:17:56–17:18:30 完成 15 组复验：双窗口 Key 同步、真实只读工具循环、迭代/限速/审批取消、实际 HTTP 429 后停止约 181 ms、SSE 部分保留与迟到隔离、快照及刷新恢复、revision 冲突保护，以及 Token 页两种模式下的精确计数。端点与凭据均为本地确定性夹具。隔离应用、utility process 和端点已退出，实例清单为空。
- 证据位于忽略目录 `.tmp/electron-image-service/`：`node-tests-final.log`、`image-services-final.log`、`frontend-tests.log`、`native-check.log`、`build-final.log`、`electron-check-final.log`、`platform-check.log`、`utility-result.json`、`utility-final.log`、`runtime-result.json`、`runtime.log`、`native-slice-*.png` 与窗口截图。测试早期证据保留；首轮构建后的透明缩放完善经过最终原生和生产资源构建。
- 当前生产聊天继续由 Renderer 持有，Worker 公共方法仍为诊断契约；上述服务已具备 Node 执行端口，Worker 与 Main 配置/Key/文件策略、PDF/Office/转写、检索/任务、真实工具与审批、响应/存储和持久事件的正式接线继续实施。SVG/AVIF 与跨平台实机也保持后续范围。

Git 工作区与历史基础批次（2026-11-05）：

- 接通仓库扫描、状态、工作区/提交差异、二进制预览、暂存/取消暂存/放弃、提交、分支/标签/stash 列表、历史分页、详情、远端 URL 与仓库概览等 18 个命令。Electron 调用系统 Git，沿用现有提交助手界面；提交命令通过拦截运行器验证参数与失败结果，真实创建提交留待主人明确许可。
- 按真实仓库根串行执行已接受的写操作，关窗后继续收尾；读操作随所属页面导航、刷新和关窗取消。放弃已跟踪文件从 index 恢复，保留已暂存内容；未跟踪文件使用系统回收站。路径逐段校验，目录链接需选择真实路径；历史文本上限 1 MiB，历史媒体快照上限 64 MiB。
- Windows 生产资源已验证目录拖放注册、暂存/取消暂存、独立 index/worktree 文本差异、历史展开、概览和 Blob 图片差异；刷新后恢复仓库、暂存状态和图片预览。历史夹具复制现有提交对象。
- 慢 clean filter 实机验证：关闭子窗口后，已接受的暂存操作及子进程完成；显式退出应用等待另一笔实际 index 写入约 6 秒，确认文件进入 index、filter 子进程结束后退出。验证脚本已隔离每个文件的标记并修正 Git `%f` 引号，早期脚本失败未归为应用缺陷。
- 相关工作区/进程/FFmpeg 测试原批次 20 项通过，提交助手已有界面测试 10 项通过；完整 Electron 生产构建通过。证据位于已忽略的 `.tmp/electron-git/`：`runtime-result.json`、`workspace-diff.png`、`history-overview.png`、`image-snapshot.png`、`lifecycle-result.json` 与构建/测试日志。

Git 分析器流式读取批次（2026-11-05）：

- 新增全量/增量历史流、提交统计补全及两类取消命令，Git 主进程累计分派 23 个命令。沿用 `git-progress` / `git-enrich-progress` 事件结构；每个窗口分别持有历史加载和补全任务，取消只作用于所属任务。
- 历史起点固定为首次解析的提交，按每页 200 条调用 Git，逐批投递；`limit: 0` 加载全部、`batchSize: 0` 汇总为一个数据批次。文件路径、行级统计、分支推断按选项读取，默认保持轻量；保存的分支已失效时回退到当前分支。
- 导航、刷新和关窗取消所属 Git 子进程并抑制旧任务事件；新页面可立即创建自己的加载任务。显式取消投递单个终止事件，后续请求可继续使用。不同窗口和历史/补全任务相互隔离。
- 新增 7 项公开行为测试，覆盖增量/批次契约、跨页完整性、按需补全、对象失败、窗口隔离、刷新替换、首批后取消与空仓库。连同工作区、二进制进程和 FFmpeg 相关测试共 27 项通过；Electron/前端类型检查、Vite 生产构建、平台隔离检查通过。
- Windows 生产资源通过现有分析器界面完成 1→2 条增量加载及工程指标补全，覆盖率显示 2/2；真实多窗口并发验证历史事件私有、首批后取消与补全独立取消，刷新重连后重新加载完整历史。实机共 6 组检查通过，验证实例均已退出。证据位于 `.tmp/electron-git/stream-runtime-result.json`、`analyzer-history.png`、`analyzer-metrics.png` 和 `visual-qa-result.json`。
- push/pull、amend/undo、分支/merge、标签写入与推送、stash 写入、cherry-pick/revert、导出/格式化、修改提交消息、终端和 macOS/Linux 验收继续接续。

Git 分支与远端操作批次（2026-11-05）：

- 新增 push/pull、soft undo、amend、分支创建/切换/删除/合并、标签创建/定向推送/删除、stash 保存/应用/弹出/删除和系统终端入口，共 16 个命令；Git 主进程累计分派 39 个命令。该批接通 git_committer.rs 中全部 27 个公开命令；后续 5 个分析器命令见下一批记录。
- 写操作进入现有仓库队列，关窗后继续收尾，应用退出等待完成。引用名称通过 Git 校验，起始点解析为提交 OID，参数以独立 argv 传递；merge 返回成功、冲突和原因，冲突状态读取实际 index。标签推送使用完整 refspec 与 --no-follow-tags，只推送选中的本地标签。
- 远端命令按应用代理设置生成本次调用的环境和 Git 配置；system 保留 Git 自身配置/环境，none 清空代理，custom 注入指定地址。关闭终端认证提示，网络命令使用 30 秒超时与进程树回收；读取和本地操作沿用原有上限。终端入口按用户动作启动独立交互终端，Windows 优先 Windows Terminal、缺失时回退 PowerShell，路径通过 argv/cwd 传递。
- 实机发现概览操作把成功的 void/null IPC 返回值当作失败，导致分支已经创建但弹窗保留、状态未刷新。共享 composable 现在用显式成功值区分异常；4 项行为测试覆盖 null/undefined 成功、工作区同步刷新及标签推送失败/重试，空返回值相关回归修复前失败、修复后通过。含现有标签弹窗和侧栏测试共 21 项通过。
- 新增 10 项宿主行为测试，覆盖分支/快进合并/soft undo、本地 bare 远端 push/pull、附注/轻量标签与定向推送、非法 stash 对象保留、amend/stash argv 与错误、关窗排队、代理投影和终端启动边界；与已有 Git、二进制进程和 FFmpeg 测试共 37 项通过。历史夹具复制既有提交，stash 保存与 amend 使用拦截运行器。
- Windows 真实界面验证目录拖放、工具栏 pull/push、分支创建/切换/快进合并/删除、附注标签创建并定向推送、本地标签删除；启用 push.followTags 后仍只推送选中标签，并保留远端分支与其他本地标签。慢 pre-receive hook 验证关窗后的推送完成。界面/生命周期共 7 组检查，退出路径修复见下方记录。
- 真实创建/改写提交、有效 stash 的保存/恢复、外部托管远端认证、系统终端窗口和 macOS/Linux 运行保留待验收。实机证据与最终构建记录位于已忽略的 `.tmp/electron-git-mutations/`。

Git 分析器补齐与退出收尾批次（2026-11-05）：

- 接通 `git_cherry_pick`、`git_revert`、`git_update_commit_message`、`git_export_commits` 和 `git_format_log`，Git 主进程累计 44 个命令，与两份 Rust 后端当前公开命令集合一致。pick/revert 和消息修改进入仓库写队列；版本先解析为单个提交 OID，消息修改在队列执行时核对 HEAD，历史提交选择过期时返回可行动错误。
- 格式化模板通过独立 argv 交给 Git，显式计数支持 0 条；导出沿用 JSON、CSV、Markdown 和 HTML 契约，无需仓库路径。JSON 保留补全元数据，CSV 正确引用所有文本列，HTML 将提交内容转义为文字，Markdown 保留完整消息。
- 慢推送实机发现应用内 `exit_app` 使用 `app.exit()`，绕过普通退出事件，漏掉 Git 与 FFmpeg 收尾。显式退出现在同样等待 Git 队列和 FFmpeg 取消清理。修复后 8 秒 hook 期间应用保持存活，约 8.3 秒后确认 hook 进程结束、远端 ref 更新并退出；真实子窗口关闭后的推送再次通过。
- 新增 6 项行为测试，保护 pick/revert 的单提交参数与错误传播、HEAD 消息修改边界、格式化的模板/计数以及四种导出格式的数据保留与编码。与原 Git/网络/终端/进程/FFmpeg 测试共 43 项通过；Electron 类型检查、oxlint 与完整 Electron/Vite 生产构建通过。前端沿用上一批已通过的 21 项相关测试，本批未再改动前端实现。
- Windows 生产资源通过真实 IPC 完成 3 组分析器抽查：自定义格式化与零条计数、四格式导出与特殊字符编码、历史消息选择和非法 pick/revert 版本拒绝；既有提交保持原样。实机证据为 `.tmp/electron-git-mutations/runtime-result.json`、`analyzer-runtime-result.json`、`branches-tags-remote.png` 与 `runtime-final.log`；最终构建为 `build-final.log`。验证实例已退出。
- 创建/改写提交的成功路径使用拦截运行器验证，完整工作流仍需明确许可后实测；有效 stash、外部认证、真实终端窗口和跨平台运行验收继续接续。

目录清理批次（2026-11-05）：

- 新增 `electron/directory-janitor.ts`，接通 `analyze_directory_for_cleanup`、`cleanup_items`、`stop_directory_scan` 和 `stop_directory_cleanup`。沿用现有字段、两类窗口进度事件和筛选组合；名称匹配支持 `*` / `?` 与 Unicode，年龄、大小和深度共同筛选，目录大小以一次异步后序遍历统计完整实际子树。
- 扫描跳过隐藏根条目及后代链接，目录大小包含自身隐藏内容；显示深度限制候选层级，目录大小仍计入更深层文件。扫描可明确选择链接目录，解析真实根路径后遍历；清理操作校验真实路径、目标类型及文件身份，磁盘/共享根目录和链接路径返回可行动错误，含链接的目录保留供单独处理。
- 文件与目录通过系统回收站处理。重复路径归一，父目录优先，已成功清理的父目录覆盖所选后代，空间只累计一次；每项失败独立记录，其他选中项可继续。清理在应用内串行，扫描按窗口独立，取消命令仅作用于所属窗口。
- 显式停止、文档导航、刷新、渲染进程退出和窗口销毁停止后续条目；已经进入系统回收站的条目等待完成，应用普通/显式退出均纳入收尾。旧页面进度随窗口生命周期抑制。
- Electron 清理结果新增可选 `cleanedPaths` / `cancelled`，共享前端按明确成功路径更新列表与选择，移除成功目录的显示后代，保留取消后尚未处理的文件。扫描主动取消保留上次结果；清理期间禁用重复入口，业务层重入保护保持当前任务状态。原 Tauri 结果继续通过兼容分支消费。
- 新增 8 项宿主与 5 项前端行为测试，覆盖组合筛选/目录大小/深度、特殊名称、根与 junction 边界、父子重叠和个别失败、窗口级取消/进度、在途回收等待/退出排空，以及取消列表保留和清理重入。相关宿主测试 22 项、前端测试 14 项通过；Electron/前端类型检查及完整生产构建通过。
- Windows 生产资源完成 9 组验证：真实界面分析及取消确认、目录子项显示同步、文件/目录回收、清理中途停止并保留未处理勾选、junction 目标保留、父子重叠计量、双窗口私有进度/独立取消、取消后重扫和刷新/退出。实机证据位于 `.tmp/electron-directory-janitor/`：`runtime-result.json`、`scan-results.png`、`cancel-preserves-selection.png`、测试与最终构建日志。
- 最终生产构建的 200 文件中途停止验证：7 个文件已完成回收，193 个文件保留在磁盘、结果列表与勾选状态中；目录成功清理后的未选后代同步移除，同名前缀的其他路径保留。验证实例与启动器均已退出。
- 目录搜索/替换/整理、内容去重、符号链接移动仍未接通；本批保留该领域总项为未完成，macOS/Linux 回收站和对应文件系统运行验收继续接续。

内容查重批次（2026-11-05）：

- 将现有 Rust 查重算法提取到 `src-tauri/src/content_deduplicator.rs`，Tauri 命令和 Electron N-API 共用遍历、过滤、尺寸分桶、指纹、BLAKE3 全文哈希与代表文件选择。自定义 ignore 规则沿用现有有效实现；精确/规范化匹配保持当前语义。
- 新增 `DedupRuntime` 与 `electron/content-deduplicator.ts`，分派扫描、停止、Diff 读取及重复文件回收四个命令。每次扫描拥有独立 token，启动前取消有效；进度队列上限 128 条，宿主按所属窗口投递，刷新、导航、窗口销毁和应用退出取消并等待原生任务收尾。
- 回收站复用目录清理服务，查重入口增加普通文件限制；目录、根目录、链接和含链接祖先的路径返回逐项错误。返回明确成功路径与中止状态，窗口释放后保留未处理文件，等待当前回收站操作完成。
- Diff 默认 512 KiB，Electron 校验文件身份并有界读取 UTF-8，显式最大值 64 MiB；前端可见地提示超限或读取失败。修复停止成功返回 void 被误判，以及旧宿主删除错误中的 Windows 盘符被截断；取消保留上次结果，部分删除仅移除确认成功项。
- 共享 Rust 核心 5 项、宿主 15 项（含共享清理服务的 8 项）及前端 5 项行为测试通过；两侧 Rust 编译、Electron/前端类型检查及完整 Electron/Vite 生产构建通过。
- Windows 最终生产资源完成 10 组验证：精确/规范化与忽略过滤、真实界面及双栏预览、超限错误、回收站和代表文件保留、混合路径部分失败、junction 保护、双窗口私有进度与取消隔离、停止按钮、取消后重扫、扫描中刷新/关窗/显式退出。双窗口各使用 2400 个文件；专用预览进程已退出。
- 证据位于忽略目录 `.tmp/electron-content-dedup/`：`runtime-result.json`、`scan-results.png`、`diff-preview.png`、`cancelled-scan.png`，以及测试、编译与生产构建日志。目录搜索、符号链接移动和跨平台验收仍保留待办。

目录搜索批次（2026-11-05）：

- 将现有搜索、替换、预览和文件整理算法提取到 `src-tauri/src/dir_search.rs`，Tauri 包装与 Electron N-API 共用。新增 `DirSearchRuntime` 和 `electron/directory-search.ts`，接通七个公开后端命令。
- 全应用同一时间运行一个搜索，walker 保持四线程；默认预算为 50,000 个文件、2 GiB 读取量和 30 秒。搜索结果通道保留 500 条上限，原生事件队列上限 8 条，主进程每 25 ms 排空，队列满时背压等待；取消可释放等待。进度和结果仅发给归属窗口，取消同时校验窗口与 searchId。
- 实机发现 invoke 回复早于末批事件的投递竞态。目录搜索复用现有 Channel 完成标记，等待此前事件投递后返回，避免前端和 Agent 在解除监听时丢失末批结果。
- 搜索取消、工具卸载、导航、刷新、关窗与应用退出均等待原生 worker 收尾。文件写入应用内串行，接收时快照参数，窗口销毁后保留已接收写入；应用退出排空这些操作。预览随窗口释放失效。
- 替换和整理拒绝链接/reparse point 及其祖先路径；单项替换校验范围、保持原始混合换行和末尾换行，写入前核对原内容。同路径覆盖返回跳过；跨卷移动若源删除失败，明确报告源保留。包含 glob 对隐藏条目的优先级沿用现有 ignore 引擎语义。
- 补齐 busy、deadline、文件/字节预算与匹配上限提示。截图走查发现并修复 Unicode scalar 索引与前端 UTF-16 索引混用：结果行、上下文、Agent 长行摘要与 Monaco 选区均按原字符契约处理。替换成功通知预览刷新，保留未保存草稿并提示核对；旧文件读取迟到时保持当前选择内容。
- 共享 Rust 核心 10 项、宿主 8 项、前端与传输相关 32 项测试通过；Tauri 编译、Electron/前端类型检查、平台隔离及完整 Electron/Vite 生产构建通过。
- Windows 生产资源完成 10 组验证：原生 Unicode/context/隐藏过滤、真实搜索和 Monaco 预览、单项与确认批量替换、复制/移动策略及部分失败、junction 防护、双窗口私有事件及取消隔离、预算/停止、导航/刷新/关窗与显式退出。10,000 文件返回 50 批、10,000 条唯一完整结果，扫描耗时约 485 ms；退出等待已接收的 100,000 处替换并保留 CRLF。
- 补充生产界面验证通过 3 组：完整 emoji 与精确高亮、原路径选中时的预览刷新、最后一条匹配替换后的未保存草稿保留及磁盘边界。专用预览应用与启动器已退出。
- 证据位于忽略目录 `.tmp/electron-dir-search/`：`runtime-result.json`、`runtime-resume.log`、`runtime-ui-final.json`、`search-preview-final.png`、`single-replace-final.png`、`draft-preserved-final.png`、`tests-ui-final.log` 与 `build-ui-final.log`。
- 顶部汇总跟随当前结果列表，替换后释放旧匹配焦点；最后一条匹配替换后继续保留打开的文档。目录类总项保持进行中，下一批接续符号链接移动器。

符号链接移动批次（2026-11-05）：

- 提取 `src-tauri/src/symlink_mover.rs` 与 `file_operation_types.rs`，Tauri 和 Electron N-API 共用预检、同盘改名、跨盘暂存复制、备份切换、创建链接及失败回滚。现有文件属性验证也改为共享入口，原有命令字段与字符串结果保持兼容。
- 新增 `SymlinkMoverRuntime` 和 `electron/symlink-mover.ts`，接通单个/批量验证、预检、搬移并链接、仅创建链接、取消及最新/全部日志共八个命令。原生任务在 blocking worker 执行，沿用统一 addon 构建和分发路径。
- 全应用同时接受一个写操作；取消校验窗口和任务身份，进度仅投递给所属窗口，128 条有界进度队列保留较新状态。任务在接收时快照，工具卸载、导航、刷新、关窗和退出均取消并等待收尾，退出覆盖当前复制完成后的暂存清理和回滚。
- 补齐源、目标和基准路径全部祖先中的链接/reparse point 校验；批量源重叠从相邻项比较改为完整父子组合检查，防止夹有其他目录时漏判。目标磁盘空间按实际需要复制的条目累计；执行前完整预检阻止整个冲突批次进入写入。
- 保留同盘链接创建失败后的改名回滚、跨盘目标/链接失败后的源恢复，以及回收站失败时保留源备份并给出路径提醒。取消沿用复制返回后清理的边界，已提交的其他条目保持完成。
- 前端从预检起阻止重入并锁定参数，使用启动时快照执行；按确认成功路径更新逐项状态，取消后保留尚未完成项。监听注册与工具释放相互校验，迟到验证结果无法恢复已移除文件。Electron 每窗口优先读取自己的最新结果，共享历史保留最近 100 条。
- 共享 Rust 核心 9 项、宿主 7 项、前端 7 项定向行为测试通过；Tauri 编译、平台隔离、Electron/前端类型检查及完整 Electron/Vite 生产构建通过。
- Windows 生产资源完成 11 组验证：硬链接文件身份、文件/目录符号链接、镜像路径、整批冲突阻断、junction 祖先/目标防护、真实 E 到 C 搬移与备份回收、工作台操作、512 MiB 跨盘任务的全局并发限制和私有进度、错误归属/旧任务身份取消隔离、正确取消清理，以及导航/刷新/关窗/显式退出。取消后源文件保持普通文件，暂存与未提交目标清空。
- 实机走查确认工具由 KeepAlive 缓存，补齐停用时取消/解绑、激活时恢复监听；缓存页面生命周期已由组件测试和真实导航验证。最终生产构建完成于 2026-11-05 07:31（北京时间），专用预览应用与启动器已退出。
- 验证证据位于忽略目录 `.tmp/electron-symlink-mover/`：`runtime-result.json`、`runtime-resume.log`、`move-and-link.png`、Rust/宿主/前端测试日志、Tauri 编译与平台隔离日志、`build-final.log`。前八组和生命周期收尾分别保留启动身份，前端补丁前后共用同一原生核心。目录类总项继续保留跨平台验收，整体迁移目标仍包含其他领域工具、后台运行时与正式分发。

系统脉搏批次（2026-11-05）：

- 将完整 Rust 硬件采集器提取到 `src-tauri/src/system_pulse.rs`，Tauri 与 Electron N-API 共用 CPU、内存、磁盘、网络和 NVIDIA NVML 指标。保留约一秒的高频采样及每五次采样的磁盘容量刷新；进程数同步低频刷新，网络速率按实际采样间隔换算。Windows PDH 使用英文计数器入口并保留超过 100% 的频率性能值，注册表/WMI 子进程隐藏控制台窗口。
- 新增 `SystemPulseRuntime` 和 `electron/system-pulse.ts`，接通 `start_pulse`、`stop_pulse`。应用内共享一个原生 collector，每窗口独立订阅；重复启动更新当前订阅，停止校验窗口与可选订阅身份，最后订阅释放后取消并等待原生资源回收。收尾中的新启动按顺序等待，已销毁窗口的排队订阅随生命周期失效。
- 原生缓冲仅保存最新一份快照，宿主每 100 ms 读取并定向投递；采集或传输异常发送窗口私有错误并清理订阅与定时器。刷新、主文档导航、渲染进程退出、关窗和普通/显式退出均纳入收尾。
- 前端复用 `usePageActivity()`，以串行协调队列管理监听与启动/停止；晚到注册、启动中暂停、旧订阅快照与原生错误有明确处理。手动暂停保留快照和历史，页面往返保持用户选择；活动页面返回后恢复订阅。初次采样保留指标区域，错误提供重新开启入口，工具栏补齐可访问名称。
- 共享 Rust 2 项、Electron 宿主 6 项、前端 5 项定向行为测试通过；Tauri 编译、平台隔离、Electron/前端类型检查及完整 Electron/Vite 生产构建通过。最终生产构建完成于 2026-11-05 07:50（北京时间）。
- 最终 N-API 产物完成 3 组检查：完整硬件字段、慢消费时只交付最新快照、取消与单次运行边界。本机实际采到 24 个逻辑核、约 4.16 GHz 动态 CPU 频率、Windows 汇总磁盘 I/O、网络速率及 RTX 4070 Ti SUPER 的利用率、温度、显存和编解码指标。
- Windows 生产资源完成 9 组验证：实际仪表盘、重复启动/双窗口共享/过期与错误归属停止隔离、暂停及缓存页面选择保留、活动页面离开/返回、原生剪贴板复制、刷新释放、关窗隔离、最后订阅停止后重启，以及活动采集中的显式退出。原生采集与窗口均在同一最终产物验证，专用预览应用和启动器已退出。
- 证据位于忽略目录 `.tmp/electron-system-pulse/`：`runtime-result.json`、`runtime.log`、`runtime-resume.log`、`runtime-refresh.log`、`native-result.json`、`dashboard.png`、`dashboard-gpu.png` 和测试/编译/构建日志。首次脚本分别调整了 Element Plus 隐藏 input 的点击定位及后台窗口 rAF 等待方式；已完成组按阶段保留，未修改最终业务产物。
- macOS/Linux 及可选硬件不可用场景的真实验收继续接续；Web Distillery、其余原生领域工具、后台运行时和正式分发仍在整体目标范围。

Web Distillery 批次（2026-11-05）：

- 接通 11 个命令，覆盖快速抓取、代理启停与端口/私有来源查询、Cookie/LocalStorage 及加密检测/批量加解密。复用共享 Rust 核心的 wreq Chrome133 TLS/H2 指纹、字符集解码和挑战页识别；显式限制最多 10 次重定向，跨来源跳转移除 Cookie/认证头。历史调查的 9/9 保留为当时快照。
- 每窗口/文档持有独立原生 runtime 和随机 `.localhost` 代理来源；精确 Host 校验、no-store/no-referrer、私有 Cookie Jar 与来源绑定保护身份。Cookie/LocalStorage 在页面脚本前还原，配方绑定身份随创建请求传递。响应读取限制为 32 MiB，转发 Referer/Origin 映射至目标站。
- 停止取消在途代理请求并等待端口释放；刷新、渲染进程退出、关窗及应用退出释放所属 runtime。缓存工具页面停用销毁 iframe/代理；DOM 快照按 requestId 对应，迟到提取/预览结果按代次处理，新会话清理旧拾取状态。初始交互视口始终保留挂载容器。
- 宿主行为测试 6 项、Web Distillery 前端测试 44 项、共享 Rust/加密测试 19 项通过；Electron/前端类型检查、平台隔离、Tauri 编译和完整 Electron/Vite 生产构建通过。最终验收构建于 2026-11-05 08:50（北京时间）完成。
- 最终 Windows Electron 生产资源实例完整通过 11 组检查：指纹/编码/挑战/跨站重定向、DPAPI 合成身份往返、双窗口私有来源与身份隔离、错误 Host/跨站资源 Cookie 保护、真实 iframe 的动态 API/相对 CSS/存储还原，以及 IPC/Node/父页面隔离。实际快速/智能工作台、拾取器与实时预览均已验证；缓存页面离开、刷新、关窗与应用退出后的监听释放也已通过。
- 另以独立身份实例通过 2 组保存/恢复检查：实际“保存 Cookie”按钮采集私有 HttpOnly Cookie Jar 与 iframe LocalStorage，创建并激活身份，Cookie 值使用 DPAPI 加密落盘；刷新后解密身份并在首个请求/页面脚本前还原 Cookie 与 LocalStorage。结果见 `identity-result.json`、`identity.log` 和 `identity-restored.png`。
- 实机样本为本地合成页面和独立开发身份；远端站点的反爬/SSO 差异及 macOS/Linux 实机验收继续接续。证据在已忽略的 `.tmp/electron-web-distillery/`：`runtime-result.json`、`runtime-verified.log`、`fast-result.png`、`smart-result.png`、`interactive-preview.png`、`native-tests-final.log`、`frontend-tests-verified.log`、`host-tests-final.log` 和 `build-accepted.log`。最终实例和测试服务器均已退出。

屏幕采集与原生 OCR 批次（2026-11-05）：

- 接通 `capture_screen_rect`、`check_native_ocr_availability`、`native_ocr`，并补齐监控框使用的 `get_saved_window_labels` 和 `set_window_position`。Tauri 薄 command 与 Electron N-API 共用 GDI/aHash/PNG 及 WinRT OCR，原 `wa_*` 窗口自动化命令在后续窗口自动化批次完成。
- 截图校验尺寸、面积、坐标溢出、阈值和虚拟桌面边界，按作用域回收 DC/位图与 DPI 上下文。OCR 初始化工作线程 WinRT apartment，支持原始 base64/图片 data URL，在分配位图前检查系统最大边长；异步操作可取消并受 30 秒总期限约束。`confidence: 0.95` 保留为固定兼容值。
- Electron 图像服务按文档串行处理，全局 2 个原生并发，单窗口/全应用至多接受 2/8 个未结束请求。刷新、导航、渲染进程退出、关窗和退出取消所属 token，迟到结果失效，退出等待收尾。
- 监控框携带自身物理边界和缩放，修复主窗口与监控框位于不同缩放显示器时的采集坐标；Electron 使用显示器原点感知的坐标转换。首次放在主窗口内，保留保存配置恢复与显式中心点定位语义。
- 实机发现全局主题调用 DWM `none` 后，透明监控框的 CSS 虽透明，原生表面仍不透明。已在宿主材质适配中保留透明组件底色，避免材质覆盖 alpha；新增行为测试保护主题重应用时的透明度。
- 共享 Rust 5 项、宿主 7 项、前端定向测试 6 项通过；Electron/前端类型检查、平台隔离、Tauri 编译与完整 Electron/Vite 生产构建通过。最终构建完成于 2026-11-05 09:43（北京时间）。
- 最终 Windows 生产资源在独立数据实例完成 7 组检查：合成中英文 OCR 和异常输入、Smart OCR 导入/结果/历史落盘、真实 GDI 图像尺寸/色值与去重、双窗口及保存配置、透明监控框预览和字幕、缓存页面隐藏期间持续 OCR/画面变化/停止，以及监控框关闭和文档刷新后重新创建原生 runtime。实机为 150% 缩放；混合 DPI/负坐标通过几何行为测试，仍保留多显示器实机待办。
- 证据位于忽略目录 `.tmp/electron-screen-ocr/`：`runtime-result.json`、`runtime-accepted.log`、`runtime-accepted-resume.log`、`smart-ocr-result.png`、`screen-ocr-timeline.png`、`screen-ocr-updated.png`、测试与编译日志及 `build-accepted.log`。前期脚本调整了系统 OCR 中文字间空格、Element Plus 可见选择框及 aHash 测试画面的明显变化；最终 runtime 报告与最终构建对应。
- 本批视频 OCR 追加走查当时停在合成样本导入，诊断记录为 `video-error.json` 与 `video-runtime.log`；后续本地视频批次已定位 copy-only 拖放协商问题并完成修复与全链路验收。最终屏幕 OCR 验收报告为 `runtime-result.json`，各专用预览实例及启动器均已退出。

本地视频原生 OCR 批次（2026-11-05）：

- 定位并修复 copy-only 外部拖放被 Chromium 取消的问题：导入区优先使用 copy，保留 move-only 来源兼容。新增的 4 项拖放协商用例保护外部文件导入行为，相关 useFileDrop、DropZone 与屏幕预览生命周期测试共 18 项通过。
- 视频截图预览限制占用高度并独立滚动，保留源视频和播放控件；字幕列表抽屉挂载到 body，使用响应式宽度，标题与操作可换行，修复工作区裁切和窄栏挤压。
- Electron/前端类型检查及完整 Electron/Vite 生产构建通过，最终构建于 2026-11-05 10:13:56（北京时间）完成。Windows 最终产物在 10:15:16–10:15:23 通过 4 组真实工作流：可信 copy-only 文件拖入与实际解码、ROI 截图/原生试识别、FFmpeg 六帧抽样→原生 OCR→两条场景字幕合并、关闭视频复位与长任务取消清理。
- 合成视频为 960×540、6.2 秒，识别得到两组英文编号与完整中文句子；原生 OCR 返回的中文字间空格按既有输出保留。正常完成与取消后的任务帧目录均已移除。截图与几何记录确认预览展开后源视频仍可见，字幕抽屉完整位于窗口内。
- 证据位于忽略目录 `.tmp/electron-video-ocr/`：`runtime-result.json`、`runtime-final.log`、`roi-preview.png`、`video-subtitles.png`、`video-cancelled.png` 与 `build-final.log`；相关测试日志为 `.tmp/electron-screen-ocr/video-frontend-tests.log`。最终脚本将抽屉定位收紧到“字幕列表”对话框后完成复验，验收实例与启动器已退出。
- 真实 ASR、视频 VLM、macOS/Linux、混合 DPI 和其余原生工具继续按整体待办接续；本批完成 Windows 本地视频原生 OCR 范围。

窗口自动化批次（2026-11-05）：

- 接通全部 8 个 `wa_*` 命令：窗口枚举、自身 PID、有效性、客户区、点击、按键、取色和窗口截图。共享 Windows 核心位于 `src-tauri/src/window_automation.rs`，Tauri 保留薄适配器；Electron 通过 N-API 与独立 utility process 执行，沿用后台子窗口命中、前台 SendInput 和 PNG ArrayBuffer 契约。
- 单辅助进程全局串行动作，单文档/全应用最多接受 8/32 个请求；5 秒期限、超时回收与重建、文档代次取消及退出收尾已接入。输入动作完成 key-up 与焦点/光标恢复后释放，排队的旧文档动作直接失效。枚举的自身排除和自身 PID 均以应用主进程为准。
- 共享核心补齐物理 DPI 作用域、截图分配前尺寸限制、GDI 位图读取前取消选入和 client-only 截图；修复前台输入入队后过早恢复焦点造成键盘事件丢失的问题。部分输入失败时反序释放已按下按键，焦点恢复走作用域清理。
- 宿主行为测试 6 项、前端能力/绑定测试 6 项、共享 Rust 行为测试 2 项通过；进程退出无法确认时，服务停止新请求与已接受排队动作，避免输入进程重叠。Electron/前端类型、平台隔离、Tauri 编译和完整 Electron/Vite 生产构建通过。最终构建于 2026-11-05 11:13:57（北京时间）完成。
- Windows 最终产物于 11:33:20–11:33:24 使用独立 Win32 三层合成窗口完成 6 组验收：实际枚举与客户区物理尺寸、取色和 client-only PNG；后台双击投递到孙窗口且坐标正确、修饰键按下/抬起、无效参数拒绝；前台真实点击/F8 送达并恢复焦点/光标；工作台实际执行点击/F9/颜色判断三步方案、截图取点器加载与点击选点后的坐标写回。
- 另一个最终产物实例于 11:26:08–11:26:18 完成 4 组生命周期检查：只暂停该隔离实例拥有的原生辅助进程，确认真实 5 秒期限、进程终止与替换；刷新时丢弃 6 个排队 F6 输入，已开始 F7 完成释放，另一窗口继续查询/输入/截图；关窗后保留其他 owner 可用，应用退出停止辅助进程。
- 系统会为阻塞 UI 的测试窗口直接返回缓存截图，因此该场景仅证明有界返回与应用可用；超时回收的实机证据使用上述暂停辅助进程方式。此前诊断中修正了步骤标签定位、浏览器执行上下文参数和夹具状态，验收使用最终产物。
- 证据位于忽略目录 `.tmp/electron-window-automation/`：`runtime-result.json`、`runtime-accepted.log`、`lifecycle-result.json`、`lifecycle.log`、`workbench.png`、`screenshot-picker.png`、`window.png` 与测试/编译/构建日志。各验收实例与专用合成窗口在完成后关闭。真实混合 DPI 多屏、特权目标/游戏兼容性和其余宿主能力按专项进度继续验收。


系统代码格式化与环境检测批次（2026-11-05）：

- 接通 `format_code` 和 `code_formatter_status`，启用 Electron 的 `systemCodeFormatting`。PHP 通过 N-API 调用共用 Mago；Rust/C/C++ 由共用 Rust 库生成 argv，再从隔离辅助进程执行 rustfmt/clang-format。Tauri 沿用相同选项与参数计划。
- 并发处理 stdin 和两路输出，保留外部程序提前退出时的诊断；Windows 的 EOF/EPIPE/连接重置交由退出状态和 stderr 判定。限制源码 4 MiB、输出合计 16 MiB，逐任务工作目录使用空 Rust 配置，执行具备 5/10 秒检测/格式化期限及 15 秒宿主期限。
- 窗口/全应用最多接受 2/8 个任务，全局串行。刷新、导航、渲染进程退出和关窗丢弃所属排队任务，终止活动辅助进程树；退出等待收尾和目录清理。无法确认辅助进程退出时关闭服务并保留目录。
- 宿主、进程与 FFmpeg 相关测试 13 项、前端能力/格式化测试 12 项通过；Rust 格式化库 7 项通过（另 1 项为忽略的子进程夹具入口）。Electron/前端类型检查、原生桥接检查、Tauri 编译检查、平台隔离和生产构建通过；最终构建完成于北京时间 11:58:31。
- 最终产物于北京时间 12:00:13–12:00:24 完成 4 组协议与界面检查：真实 Mago、rustfmt、C/C++ clang-format 的 Unicode 注释/幂等性与选项；缺失/错误程序、非法参数、源码边界、提前退出及输出溢出；工作台自动格式化、路径刷新持久化、错误后保留原文与恢复；运行环境页 FFmpeg/FFprobe/Git 的真实版本、失效路径及恢复。
- 同一隔离实例于 12:01:22–12:01:49 完成 4 组真实进程生命周期检查：受控格式化器派生子进程后挂起，刷新时回收父子进程、丢弃旧队列并让另一窗口完成；关窗回收且主窗口继续；真实 10 秒超时后父子进程退出、目录清理、下一次 rustfmt 成功；应用退出等待父子进程和目录清理。验收实例已退出。
- 证据位于忽略目录 `.tmp/electron-code-formatter/`：`runtime-result.json`、`lifecycle-result.json`、`formatter-rust.png`、`environment-ready.png`、`host-process-accepted.log`、`related-accepted.log`、`frontend-process-tests.log`、`rust-tests.log` 和 `build-accepted.log`。诊断初跑修正了验证脚本的 IPC 包络读取，最终记录对应构建后产物；其他平台继续按专项待办验收。


Knowledge / Recall 原生选择器与备份交互批次（2026-11-05）：

- 扩展现有 Windows UIA 辅助程序的 `save-file` 和 `cancel-dialog`；文件多选使用绝对路径与引号，保存框兼容标准 `1148` 及 `FileNameControlHost` 内的 `1001` 编辑器。保存夹具要求父目录存在、目标尚未创建；所有操作按该隔离实例的 PID 定位并等待对话框关闭。辅助程序 Release 构建通过，0 警告、0 错误。
- 本批使用 11:58:31 完成的 Electron 生产资源。Knowledge 先通过真实系统文件多选导入 Markdown/HTML，通过目录选择导入中文目录下的递归文件；随后于北京时间 12:21:28–12:21:55 完成 4 组检查：3 篇文档及来源/分块/持久任务；名称保存、源文件重扫保留文档身份；取消文件/目录选择保持数据、实际关键词检索和页面刷新恢复；原生保存路径返回及保存取消返回 null。
- Recall 于 12:28:23–12:29:15 完成 5 组实机交互：系统多选导入与原资产字节核对；损坏/正常包混合导入逐项失败隔离，真实冲突框选择副本保留两个集合；Escape 跳过冲突和原生文件取消保持原数据；单包原生目录选择、导出报告和包检查；批量原生目录选择后点击“停止后续项目”，当前集合完成、后续集合显示跳过、暂存目录清理，再次导出原选择得到完整双集合 ZIP。
- 批量停止使用受控的 24 MiB 随机资产延长在途导出，操作通过实际按钮执行。最终两个集合各有 4 个条目，完整 ZIP 的两项检查均通过；原有小资产恢复后字节保持一致。替换现有集合的二次确认 UI 保留待验收，已有宿主 replace/copy/cancel 证据保持独立范围。
- 验收实例于 12:30 退出；12:30:38 的独立进程使用最终 native 模块恢复 Knowledge 的 3 篇文档、3 个来源、完成任务与更新后关键词结果，以及 Recall 的两个四条目集合。主人运行中的应用与数据保持原样。
- 通用 Computer Use 在本轮仍出现 `element ... is not available in cached app state`；改用项目已维护的 UIA 辅助程序完成原生操作。诊断初跑修正了输入定位、刷新后的视图准备和保存框编辑器差异，最终验收使用修正后的辅助程序。证据位于忽略目录 `.tmp/electron-knowledge-native/` 与 `.tmp/electron-recall-native/`：两份 `runtime-result.json`、`restart-result.json`、原生选择器树、`.NET` 构建日志、文档检索截图和导入/导出/取消报告截图；各测试进程已退出。


Worker 与 Main 配置/Key 内部服务批次（2026-11-05）：

- 新增独立的 `host-request/host-response` 协议与 `BackgroundHostClient`。Main 注册初始化、渠道快照加载和执行期 Key 操作，直接复用现有 `LlmConfiguration` / `LlmKeyState`，Key 回复仅返回选中值或不可用信息。Worker Key 端口保留共享模型中间件的不可用原因与重试时间。
- 正式 Worker 在 ready 前经 Main 取得非凭据环境信息，运行时版本更新为 `0.3.0-node`；渠道与凭据按执行调用加载。页面 RPC 在 Main 层限定 `runtime.ping/getInfo`，内部通道拥有独立消息与物理进程身份。
- 两端在途服务上限均为 32，Main 统计包含旧进程代次的已接收操作。单调请求编号抑制重放，迟到回复按原代次丢弃；取消、超时与进程退出释放等待者，持久事务继续收尾。显式退出和 before-quit 均先关闭后台入口、停止 Worker 并排空内部操作，再关闭配置/Key 所有者。
- 新增 8 项行为回归，保护共享配置/轮换/熔断、页面与内部服务隔离、初始化、代次与退出收尾、容量和重放、异常脱敏、调用取消与错误元数据；进程终止报错也先排空已接收事务。相关 Node 测试共 54 项、前端相关测试 14 项通过。Electron/前端类型检查及完整 Electron/Vite 构建通过，最终构建完成于北京时间 17:45:19。
- 独立真实 Electron utility process 于北京时间 17:44:48 在合成数据中完成 5 组检查：初始化期间零渠道读取；与窗口入口共用配置、Key 轮询/熔断及脱敏；页面无法转发内部操作；崩溃后新代次握手；旧进程已发出的成功写入继续完成、退出等待后由新所有者恢复状态。
- 最终正式生产资源于北京时间 17:46:11–17:46:20 另完成 5 组检查：初始化与诊断；两窗口共享和页面调用边界；刷新/关闭附属窗口保留 Worker；持续心跳；强制结束正式 Worker 后以新 PID/代次重新初始化。验收使用项目 Dev Control 和独立应用数据；应用及记录的 utility PID 均已退出，实例列表为空。
- 证据位于忽略目录 `.tmp/electron-worker-host/`：`node-tests.log`、`build-final.log`、`utility-result.json`、`utility-final.log`、`runtime-result.json` 和 `runtime.log`。首轮夹具修正了 Key 存储字段及状态命令名，最终记录使用修正后的夹具。
- 生产聊天仍由 Renderer 执行，正式 Worker 公开方法保持诊断范围；配置/Key 业务往返的独立 utility fixture 验证与正式 Worker 生命周期验证分别记录。当前文件策略与审批授权、Token/媒体和其余上下文服务装配、响应/存储及持久事件继续实施。


Worker 上下文资源、当前文件策略与资产根服务批次（2026-11-05）：

- 正式 Worker 初始化后持有 `BackgroundContextServices`，统一拥有 Node 图片队列及 Token 引擎；scope 固定模型与长图配置，按上下文读取 Token 注册表，隔离字节快照、取消和释放。构造阶段沿用按需读取，服务提供 scope 准备取消与应用退出排空。
- Main 新增只读 `ContextFilePolicyReader`，读取现有 `aio-file-operator/config.json`。默认目录来自当前 Electron 系统路径，工作目录沿用文件工具语义；与 Renderer 共用默认文件大小。限制配置 1 MiB，校验路径重定向、普通文件、UTF-8/JSON、目录/规则/模式与大小，损坏配置保留并拒绝读取，持久配置中的审批标记参与投影前被剔除。
- 内部 `context.files.policy` 返回当前持久策略，`context.assets.root` 经现有 AssetManager 队列返回当前根；Worker 读取和处理实际二进制。缓存附件每次复检路径与审批，并修复了命中缓存后绕过新大小限制的问题。资产根变更由新 scope 观察，已读取字节保持任务快照。
- 运行时更新为 `0.4.0-node`。正常退出先向已就绪 Worker 发送 `shutdown`，关闭等待者与 scope、排空原生队列后退出；默认 2 秒后继续进程/进程树回收。初始化或失联实例直接回收，Main 继续等待已接收事务再关闭配置/Key 所有者。
- 新增 6 项策略/上下文行为回归与 1 项正常退出回归，相关 Node 测试 61 项、文件工具/工作目录/后台桥前端测试 107 项通过。Electron/前端类型检查与完整 Electron/Vite/native release 构建通过，最终构建完成于北京时间 18:01:21。
- 独立真实 Electron utility process 于北京时间 18:03:25 完成 7 组验证：真实 Main 策略/资产队列；最终 gzip 与原生模块的精确文本 2 + 图片 1020 Token；共享预算/资产处理器经原 OpenAI 映射向真实 HTTP 发送 4 张 PNG；缩小大小和死区撤销缓存读取；源文件重写后原快照保持；新 scope 读取新资产根且旧 scope 保留字节；正常退出取消存活 scope、进程以 0 退出、强制 kill 次数与渠道读取次数均为 0。
- 最终正式生产资源于北京时间 18:05:03–18:05:13 通过 5 组 Dev Control 检查：内部初始化与诊断、多窗口共享及 5 个内部方法拒绝页面转发、刷新和关附属窗口、持续心跳、强制结束正式 Worker 后新 PID/代次恢复。应用及记录的 utility PID 均已退出，实例列表为空。
- 证据位于忽略目录 `.tmp/electron-worker-context/`：`node-tests.log`、`frontend-tests.log`、`build.log`、`utility-result.json`、`utility.log`、`runtime-result.json`、`runtime.log` 和 `slice-*.png`。初跑修正了夹具的返回字段与尺寸附加元数据断言，最终验证使用修正后的夹具。
- 生产聊天继续由 Renderer 执行，正式 Worker 保持公开诊断契约。独立 fixture 的 scope/HTTP 证明与正式 Worker 生命周期证明分别记录。实际工具/审批授权、PDF/Office/转写、Recall/任务与宿主宏、其余协议和上下文/响应/会话持久事件继续实施；开发态 Token 资产路径随实际后台任务接线继续核验。


窗口快照与统一退出批次（2026-11-05）：

- 新增同步、原子替换的 `WindowStateStore`，复用 `electron-windows.json` 格式。原生 close、显式 destroy 和全应用退出均捕获普通窗口几何，避免前端 500 ms 防抖遗漏快速关窗；隐藏窗口仍可快照。恢复校验坐标、尺寸及标题栏可达性，损坏文件保留并记录错误。
- 真实 Windows 150% 缩放发现并修复恢复时 1 DIP 累积误差；主进程记忆最大化事件，最小化期间保留先前最大化状态。退出后的原生 close 沿用退出快照，避免关闭过程中的暂态覆盖。
- 新增 `HostShutdown`，托盘、原生 app.quit、显式退出和重启共用一次排空，拒绝新页面请求。各领域收尾独立等待，后台 Worker 先退出再关闭配置/Key 所有者；单项失败记录后继续等待其他项。正常退出最后调用 app.quit，保留 Renderer beforeunload 和 Chromium 存储生命周期；非零 process.exit 保留显式退出码。
- Windows query-session-end 同步快照且保持应用运行，session-end 快照后进入统一收尾。真实注销/关机的系统时间预算及 macOS/Linux 生命周期继续实机验收。
- 新增 9 项行为回归，保护快照、重复/重入退出、异常排空、配置保留、最小化最大化及 DIP 恢复；相关宿主测试共 30 项通过。Electron/前端类型检查、native release 与 Electron/Vite 生产构建通过。
- 最终 Windows 生产资源在项目 Dev Control 隔离实例完成 5 组检查：快速关闭落盘、同标签窗口重建、显式销毁、最大化恢复，以及隐藏主窗口退出和真实 Worker 结束。独立 Playwright Electron fixture 另完成 6 组：query-session-end 合成事件与继续请求、重复原生 app.quit、beforeunload 存储、同目录新进程精确恢复、session-end 合成事件与最小化快照、再次启动恢复最大化。系统会话事件采用合成触发，未执行系统注销或关机。
- Dev Control 验收于北京时间 19:04:09–19:04:13 完成；最终宿主重打包后，独立进程验证于 19:05:55–19:06:06 完成。验收实例与记录的 Worker 均已退出，开发实例列表为空。
- 证据位于忽略目录 `.tmp/electron-window-lifecycle/`：`related-tests.log`、`check-final.log`、`build-accepted.log`、`host-final.log`、`runtime-result.json`、`runtime-final.log`、`native-result.json`、`native-runtime-final.log` 和 `production-window.png`。初跑修正了验证脚本的窗口关闭等待、原生启动完成等待和缩放像素断言；最终行为检查使用修正后的夹具。


Worker 多协议模型服务与共享契约批次（2026-11-05）：

- 为 Responses、Gemini、Claude、Cohere 和 Vertex Google/Anthropic 抽取可注入传输/请求头的原聊天执行器；DeepSeek 参数归一化保持共享。`createChatAdapters` 统一装配这些协议及 OpenAI 兼容、Azure、DeepSeek，Renderer 注册入口同步复用，并保留原媒体、Embedding 和 ASR 方法。
- 将原 `common.ts` 的请求/响应契约与通用常量迁到 `llm-apis/types.ts`，适配器接口迁到 `adapters/types.ts`；原出口保留兼容转发。共享模型中间件和协议映射通过独立契约进入 Node 类型检查，执行路径沿用原实现。
- 新增 `BackgroundModelServices`。scope 按需读取 Main 渠道并固定 revision，固定调用方提供的模板上下文、代理和 VCP 地址，复用原模型/虚拟渠道中间件与 Main Key 端口。返回渠道副本，后续 scope 获取新配置；每个 scope 独立持有传输、请求和取消，释放/退出排空准备及在途操作。正式 Worker 在初始化后持有服务，版本为 `0.5.0-node`，初始化期间仍保持零渠道读取。
- 新增内部 `llm.proxy.resolve`，由 Main 校验 HTTP(S) 地址后调用实际 Chromium 代理解析；沿用内部通道身份、容量和代次约束，页面 RPC 保持诊断白名单。上游主动停止请求继续由共享模型中间件发起，并纳入所属 scope 的网络资源收尾。
- 新增 14 项行为回归：9 个协议映射/真实 Node HTTP、配置和请求头快照、流式取消与释放、准备期退出、Responses 主备回退、Main 代理能力和 URL 校验；相关宿主测试 47 项、前端协议/渠道/续写测试 72 项通过。Electron/前端类型检查、平台隔离及完整 Electron/Vite/native release 构建通过；构建于北京时间 19:28:51 完成。
- 独立真实 utility process 于北京时间 19:33:16 完成 9 条协议请求及 6 组检查：真实 Main 配置、与窗口入口共用的 Key 轮询、请求头模板、Main Chromium 代理解析、初始化期间零渠道读取、取消在途 SSE 后以 0 正常退出且强制 kill 次数为 0。
- 最终正式生产资源于北京时间 19:35:14–19:35:21 通过 5 组 Dev Control 检查：初始化与诊断、多窗口共享及 6 个内部方法拒绝页面转发、刷新和关闭附属窗口、持续心跳、结束正式 Worker 后新 PID/代次恢复。启动诊断为空；应用及记录的 utility 进程均已退出，开发实例列表为空。
- 证据位于忽略目录 `.tmp/electron-worker-models/`：`node-tests.log`、`frontend-tests.log`、`frontend-check.log`、`build.log`、`utility-result.json`、`runtime-result.json`、`runtime.log` 和 `diagnostics.json`。早期主备夹具按当前同协议约束修正；utility 构建夹具调整为 CommonJS 异步入口后完成验证。
- 生产聊天入口继续由 Renderer 持有；独立 fixture 的模型执行证明与正式 Worker 生命周期证明分别记录。真实工具/审批、PDF/Office/转写与 Recall/宿主宏、媒体/Embedding/ASR、响应/会话持久事件和全部窗口销毁后的任务存续继续接续。
