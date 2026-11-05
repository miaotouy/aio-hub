# Electron 版功能缺口调查（2026-11-04）

> 范围：当前工作区的 Windows Electron 宿主、共享前端与工具后端调用。  
> 方法：源码调用盘点 + 真实 Electron Dev Control 抽查。  
> 运行环境：AIO Hub 0.7.1-alpha.2 / Electron 45.2.1 / Chromium 156.0.8078.75。  
> 关联：[迁移总纲](../Plan/electron-migration-master-plan.md)、[Electron 开发指南](../guide/electron-development.md)。

> 实施更新（2026-11-05）：默认模型请求已切换为 Electron 主进程传输，本地文件载荷、流式取消和逐请求网络配置已接通；共享文件兼容命令、回收站及资产索引/导入/派生数据工作流已接通，配置 ZIP 备份恢复和智能体私有资源接口也已接通；旧版 Office 文档转换器检测、配置与自动转换也已接通，本机 LibreOffice 实测通过，其他后端实机验证待续；技能扫描、安装/集合包管理及脚本执行已接通并通过 Windows 实机验证；启动与原生工具已引入宿主业务能力分层及原因提示；八方向自定义窗口缩放与 resizable 恢复已接通，并通过 Windows 生产资源预览验证。托盘设置、业务退出/设置导航、分离窗口会话与 Canvas 窗口已接通，生产 Canvas 使用受限独立预览来源；实机发现并修复三窗口操作广播和显示器工作区结构问题。LLM 会话原子写入/删除、请求快照文件和附件引用已接通，有会话数据的分离草稿、刷新与整进程重启恢复已通过 Windows 实机验证；流式搜索、命令 Channel 与窗口级取消已接通，尾部事件投递和并发恢复竞态通过 Windows 生产资源实例验证。文件监听、图片剪贴板和系统字体已接通，Canvas 磁盘内容加载引发的重复回写已修复。当前 WebView 文件拖放已接通物理坐标、窗口隔离与区域消费，图片导入可保留当前工具。插件 ZIP 与 JS/Web 加载、Sidecar 生命周期和 Native 独立宿主已接通，AHK、Paddle OCR 与 Native 示例已通过 Windows 实机验证；Native 另验证了 ASAR 分发与崩溃隔离。Recall SQLite runtime 已接通集合/条目、向量、tag-pool、HNSW、embedding cache，以及预设/自定义检索 pipeline、结果缓存和监控，累计分派 59 个命令。复用原有倒排索引、生产检索模块与 compiler/runner；最终产物通过真实 Windows Electron 的 10 组协议验证及实验室/Monitor 页面走查，另验证 N-API 跨进程恢复向量召回。旧目录迁移另已接通检测、预览、显式确认执行及清理；Windows 现有迁移界面、真实阶段进度、导入向量检索和清理后跨进程恢复已验证，共享导入器拒绝链接/重解析点并保留知识资料库文件。库统计、标签池落盘与文件批量导入另已接通，共享文本扫描、提取和索引监控规则，模型统计及 token 按所选模型隔离；Windows 工作区文件 URI 导入、统计页切换与 Monitor 已验证。Recall 单包/多库备份检查与旧格式转 Knowledge 已接通，两宿主共用归档和转换核心；Windows 系统文件选择、二次确认、转换报告与 Knowledge 文档/关键词检索已验证。Recall 单个/批量备份导出、取消与含资产恢复已接通；复制恢复改用 schema v3 的集合/条目联合主键，保留原集合条目并隔离向量状态。Windows 宿主往返、刷新展示及导出中退出已验证，Knowledge 的 28 个现行命令已在 Electron 分派；Windows 另验证首库创建、Markdown/HTML 拖放、逐文件失败报告、标签/版本保留、关键词检索和目录重扫新增/修改/删除，修复首库创建后默认检索范围为空。独立进程可恢复文档与索引。PDF/DOCX、本机 Ollama 768 维语义/混合检索、智能体授权和 Chat 显式查询/研究引用已通过 Windows 生产资源与退出后恢复验证。智能体大厅开聊交接已修复并通过冷启动、旧草稿恢复和已加载工作区验证；Qwen 主动 Knowledge 工具调用、研究取消后的证据保留及迟到回复隔离已通过 Windows 实机验证。研究失败/超时误报成功已修复并由行为回归覆盖，最终产物实测超时保留来源与迟到状态隔离；已删除引用在输入预检显示错误并保留草稿。媒体历史搜索与 JSON 剪贴板监控已接通，通过 Windows 画廊、自动格式化/替换确认、多窗口事件隔离和刷新释放验证。FFmpeg 的 8 个媒体命令已接通，Windows 生产资源已验证转换、元信息/关键帧、ROI 抽帧、跨窗口取消隔离及进程回收；音频转录经真实 WAV 预处理、本地受控 STT 上传与派生结果编辑保存验证，真实 ASR 识别和视频 OCR/VLM 流程继续接续。原生文件选择/确认/取消及跨平台验收继续接续。下文保留调查时的证据；执行进度见[缺口补齐待办](../Plan/electron-feature-gap-execution.md)。

> 网页蒸馏实施更新（2026-11-05）：共享 Rust 抓取、渲染代理与身份加密已进入 Electron 的 11 命令分派。最终 Windows 生产资源完成 11 组检查，覆盖快速/智能工作台、交互拾取与预览、DPAPI、独立代理来源、双窗口身份隔离、iframe 权限边界及导航/刷新/关窗/退出清理。实际身份保存与刷新恢复另通过 2 组检查，验证 Cookie 加密落盘和 LocalStorage 恢复。系统脉搏 Windows 批次也已完成；两工具的跨平台验收和其余领域工具继续接续，详见执行待办。

> 屏幕/OCR 实施更新（2026-11-05）：Windows 的区域采集与 WinRT OCR 已通过共享 Rust 核心接入 Electron，监控框辅助窗口命令和物理坐标同步已补齐。最终生产资源验证 Smart OCR 图片导入、识别结果与历史、透明监控框预览/字幕、缓存导航持续监控和刷新/关窗；DWM 材质覆盖透明底色已修复。窗口自动化已在后续 Windows 批次接通，混合 DPI 多显示器及其他平台验收继续按执行待办接续。

> 窗口自动化实施更新（2026-11-05）：八个 `wa_*` 命令通过共享 Windows 核心和隔离原生辅助进程接入 Electron；后台子窗口点击/按键、前台 SendInput、物理尺寸/取色/截图、实际工作台动作流与截图取点已验证。真实辅助进程超时替换、刷新丢弃排队输入与双窗口隔离也已通过。

> 本地视频实施更新（2026-11-05）：copy-only 文件拖放协商已修复；Windows Electron 最终生产资源已验证视频解码、ROI 试识别、FFmpeg 抽帧后原生 OCR、中英文场景字幕合并及取消清理。截图预览与字幕抽屉的占位、裁切也已修正。真实 ASR、视频 VLM 和跨平台验收继续接续，证据见执行待办。

> 系统代码格式化实施更新（2026-11-05）：PHP 共享 Mago 与 Rust/C/C++ 系统引擎已通过隔离辅助进程接入 Electron，工作台自动格式化、路径持久化、错误保留输入，以及真实超时/刷新/关窗/退出时的父子进程回收已在 Windows 生产资源验证。运行环境页的 FFmpeg、FFprobe、Git 版本检测也已完成实机验收；其他平台继续接续。

> 原生选择器实施更新（2026-11-05）：Windows Electron 通过项目 UIA 辅助程序验证知识资料库文件多选、中文目录选择、取消、重扫检索及持久化；Recall 备份原生多选、冲突副本/跳过、逐项失败报告、单包/批量导出与实际点击停止后续项目均已通过。保存框选择/取消也已验证；替换现有集合的二次确认 UI 和跨平台交互继续接续。

## 当前补充盘点（2026-11-04）

插件包与执行批次接入后，沿用下文的字面量命令扫描方法重新统计：前端引用 324 个唯一业务命令，其中 107 个已进入 Electron 分派，217 个待迁移；主进程当前分派 124 个业务命令。该数字只衡量命令覆盖，动态调用、平台对象和实际工作流需独立验证。结果保存在已忽略的 `.tmp/electron-native/command-inventory-current.json`。

当前优先缺口：

1. **知识资料库/Recall**：Recall 存储、检索 pipeline、结果缓存、监控、旧目录迁移、库统计与文件批量导入已接通；备份检查和旧版转 Knowledge 也已接通；备份导出、取消与含资产恢复已实现；Knowledge 文档/索引/Chat 工具链和 Windows 原生选择器已通过各批次验证。Recall 的系统选择器、冲突副本/跳过、失败报告及导出停止也已通过实机验证；替换二次确认与 macOS/Linux 完整运行继续接续。
2. **领域后端**：Git 的真实写入/外部认证、转录真实模型/视频 VLM 工作流、其余原生工具和跨平台运行，详见执行待办。目录操作、系统脉搏、网页蒸馏、窗口自动化及系统代码格式化已完成各自 Windows 批次。
3. **系统适配与发布**：独立子 WebView、后台任务所有权、更新和正式数据迁移。当前窗口拖放与落点定向已通过 Windows Electron 验证，通用子 WebView 创建及其余领域浏览器命令继续迁移；网页蒸馏已通过独立来源 iframe 完成对应工作流。

本批已接通托盘/退出/设置导航、窗口分离会话和 Canvas 独立预览；三窗口广播回复竞争、工作区结构和置顶查询在实机调查中定位并修复。空会话和有会话数据的分离/回附均已验证，会话持久化、重启恢复与流式搜索验证记录见执行待办。文件监听、图片剪贴板和系统字体已完成 Windows 原生协议验证；旧业务打开入口、Canvas 文件树及目录树工具已接通；插件 ZIP 预检、安装、回收站卸载及已安装 JS/Web 的模块、UI 和 CSS 加载已完成 Windows 生产资源验证；Sidecar 单次/常驻、AHK/Paddle 工作流与 Native 动态库执行已完成 Windows 生产资源验证，Native 另通过 ASAR 分发运行；跨系统运行验证继续接续。实测记录见执行待办。

### 本次复核：仍影响日常使用的路径

共享打开与目录树实施前，在已有生产构建上启动独立数据目录的 Windows Electron，重新执行源码盘点与 23 项只读/拒绝路径协议抽查。20 个未接入命令均返回 `CAPABILITY_UNAVAILABLE`；资产统计、系统字体、技能清单 3 个已接入命令正常返回。其中打开入口和目录树的 4 个命令已在后续批次接通；下表对应项已同步更新。知识资料库另进行了真实页面走查。本次未重新执行已完成批次的全套工作流，相关完成依据沿用执行待办中的实机记录。

| 优先级         | 用户路径                                           | 当前缺口与直接影响                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1             | 资产、智能体资源、用户档案和设置中的“打开所在目录” | 已接通 `open_file_directory`、`open_path_force`、`open_url`，与 SDK opener 共用校验和宿主实现；Windows 原生目录打开与文件定位已验证。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| P1             | 插件 ZIP 安装、卸载与执行                          | 插件包、JS/Web 加载、单次/常驻 Sidecar 及 Native 加载/调用/卸载已接通；AHK、Paddle 与 Native 示例通过 Windows 工作流验证，Native 通过 ASAR 分发验证。跨系统动态库、进程与签名权限验证继续接续。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| P1             | 知识资料库和 Recall                                | 调查快照中知识资料库目录 33 个命令未覆盖、Recall 为 50/51；之后已接通 Recall 集合/条目、向量/tag-pool、HNSW、embedding cache、检索 pipeline、结果缓存、监控、旧目录迁移、库统计及文件导入，以及备份检查/旧版转换，累计 59 个命令。备份导出、取消和含资产恢复已实现，Windows 系统选择器、冲突副本/跳过、逐项报告和导出停止已验证，替换二次确认及跨平台交互继续接续；知识资料库已有初始化/集合/文档/索引与检索的基础命令分派，Windows 文件摄取、标签、版本、关键词检索与目录同步已验证；PDF/DOCX、本机模型语义/混合索引检索及智能体授权、Chat 显式查询/研究引用已通过 Windows 生产资源与退出后恢复验证；开聊交接已修复；Qwen 主动工具调用、研究取消与删除引用预检已通过 Windows 实机验证，研究失败/超时状态已由行为回归覆盖，最终产物另实测超时后保留来源与迟到状态隔离。                                                                                        |
| P1             | Canvas 项目文件树                                  | 已接通 `generate_directory_tree`；Canvas 编辑器已实际显示嵌套资源并加载正文，目录树页面也已实际生成结果。配置转换复用相同节点契约，完整批量转换随对应工具继续验证。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| P2             | 媒体生成、聊天媒体与转录                           | 媒体历史搜索已接通，提示词/模型检索及关联资产在 Windows 画廊展示已验证；FFmpeg 检测、元信息/关键帧、执行/取消与 ROI 抽帧已接通。Windows 工作台、窗口隔离和音频转录预处理/受控 STT 上传/结果编辑保存已验证；本地视频原生 OCR 的导入、ROI 预览、抽帧识别、字幕合并及取消清理也已完成 Windows 生产资源验收；真实 ASR、视频 VLM 及跨平台验收继续接续。                                                                                                                                                                                                                                                                                                                                                                                                                              |
| P2             | Git、目录处理、网页蒸馏、系统能力                  | 调查时 Git 提交工具 29/31、分析工具 9/9、网页蒸馏 9/9 未覆盖；当前 Git 的 44 个公开后端命令已接通，覆盖工作区、历史/分析流、远端同步、分支/标签/stash、pick/revert、消息修改、导出/格式化和终端；真实提交/stash、外部认证与跨平台验收继续接续；目录清理与内容查重各四命令及 Windows 扫描/预览/回收站/取消流程已接通；目录搜索的七命令、全局资源预算和 Windows 搜索/替换/整理流程已接通；符号链接移动八命令及 Windows 同盘/跨盘、链接和生命周期已验证；网页蒸馏的 11 个现行命令、快速/智能/交互工作台、身份隔离及 Windows 生命周期已验证；系统脉搏的 Windows 完整指标与生命周期也已验证；屏幕监控与原生 OCR 的共享后端及 Windows 工作台已验证；本地视频原生 OCR 的完整导入和识别也已验证；窗口自动化八命令与 Windows 真实工作台/输入/截图/生命周期也已验证，跨平台实机继续接续。 |
| P2             | JSON 剪贴板监控与环境检测                          | 文本剪贴板读写和监控的 3 个命令已接通；Windows 验证自动格式化、替换确认、多窗口隔离和刷新释放。环境页的 `check_command_version` 已随 FFmpeg 批次接通。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| P1（迁移目标） | 关窗、刷新后继续运行 Agent                         | 后台 JS 能力仍被显式标记为未接入；Electron 主进程尚无对应的独立 Agent 执行服务。已具备的模型传输、搜索及会话持久化覆盖各自流程，任务延续与事件重连仍待实施。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| P2（分发）     | 安装、更新与跨系统使用                             | 本地安装/便携构建已有验证；更新器适配仍拒绝调用，builder 的 `publish` 为 `null`，现有桌面发布工作流使用 Tauri。正式更新、数据迁移、签名交付和 macOS/Linux 实机验证继续接续。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

Git 的上述进展为调查后的实施更新，表内初始计数保留调查口径；验收证据见[补齐待办](../Plan/electron-feature-gap-execution.md)。

#### 统计口径补充

最新重扫为 324 个唯一字面量业务命令、107 个已进入分派、217 个未覆盖；扫描到 2,003 个源文件、541 处字面量调用。**217 包含宿主专用兼容接口，应按实际调用路径筛选。** 例如 `start_llm_proxy_server` 属于已有 Electron 专用传输所绕过的旧路径；`acquire_media_stream/release_media_stream` 面向 Linux 的本地 `file:` / `asset://localhost` 媒体地址，当前 Electron 资源使用另一套来源。枚举这些命令不能证明默认模型请求或 Windows 媒体预览失效。

动态调用列表也需要人工判别：`decision-arbiter` 中的 `invoke(controller.signal, remaining)` 是局部回调，并非宿主 IPC。通用 Shell、更新器和独立 WebView 的拒绝分支则位于平台适配器，需与业务命令分开记录。

独立 WebView 构造/枚举仍未实现；本次源码检索未发现业务直接调用 `new Webview` 或 `getAllWebviews`。当前拖放通过 `getCurrentWebview().onDragDropEvent` 接通，Canvas 使用独立预览来源。目录树本批已接通，后续优先补插件与领域浏览器的实际调用路径，再按业务需要扩展通用子 WebView。

证据：已忽略的 `.tmp/electron-gap-refresh/command-inventory.json`、`runtime-probes.json`、`knowledge-inspect.json` 和 `knowledge-page.json`。源码入口包括 `electron/main.ts` 的业务分派、`src/platform/native/{shell,webview,updater}.ts`、`src/services/sidecar-plugin-adapter.ts`、`src/tools/knowledge-base/services/service.ts` 与 `src/tools/web-canvas/composables/useCanvasStorage.ts`。

## 1. 调查时结论（实施前）

Electron 已具备基础桌面工作区：窗口、多窗口、托盘操作、深链、配置文件读写、本地资源、原生 HTTP/SSE、开发控制和本地分发均有实现。当前最大的交付缺口集中在**业务后端契约**，多个工具可以打开页面，却在实际操作时仍调用尚未迁移的 Rust 命令。

最先影响日常使用的链路：

1. **默认 LLM 请求被代理启动命令阻断**，平台 HTTP 接通尚未覆盖业务默认传输。
2. **资产和遗留文件命令未齐**，影响对话附件、媒体生成、智能体资源、文件操作等共享流程。
3. **Native / Sidecar 插件执行缺失**，AHK、Paddle OCR 和 Native 示例已出现真实启动失败。
4. **技能、知识资料库、思绪及 Git 等领域后端未迁移**，可见页面与功能完成度存在明显差距。
5. **宿主与业务能力判断仍有错位**：Windows Electron 被提示“需要 Windows”，代码格式化被提示“需要桌面应用”；自定义窗口缩放也有实际失败。

## 2. 盘点口径

扫描 `src/` 中的 TS 和 Vue script，排除 docs、vendor、`__tests__`、测试文件和类型声明，提取 `invoke` 等调用的字符串字面量命令名，对照 `electron/main.ts` 的业务 `command()` 分派。

| 指标                         | 本次结果 |
| ---------------------------- | -------: |
| 扫描源码文件                 |    1,993 |
| 字面量命令调用点             |      544 |
| 唯一业务命令名               |      327 |
| Electron 业务分派中的命令名  |       23 |
| 前端引用且已进入分派的命令名 |       20 |
| 前端引用且未进入分派的命令名 |      307 |
| 本身存在缺失命令的工具目录   |       35 |
| 工具注册文件                 |       48 |

这些数字描述命令覆盖范围，**不能换算成工具可用率**。一个共享命令可能影响多个工具，一个工具也可能同时具备可用的纯前端路径和缺失的原生路径。共享依赖、动态命令、插件内调用和适配器自身的空缺需另外分析；工具表内的数量也不能相加去重。

进入分派仍需区分实现质量：`frontend_probe_ready`、`frontend_probe_heartbeat` 当前直接返回，`frontend_probe_error` 仅写 console。它们属于已识别但契约尚待补齐的命令。

## 3. 关键缺口与证据

### P1-A：默认模型请求链未接入 Electron 网络层

**实现证据**：[统一请求入口](../../src/llm-apis/common.ts) 中，`fetchWithTimeout()` 在约 1161–1182 行计算 `useProxy = !isNative || requiresNativeFileAccess`，默认启动 `start_llm_proxy_server`。该命令未出现在 Electron 分派中。

**真实运行结果**：同一个临时 loopback HTTP 服务返回 `local-audit-ok`：

| 调用路径                               | 结果                                       |
| -------------------------------------- | ------------------------------------------ |
| `src/platform/native/http.ts` 的 fetch | HTTP 200，正文正确                         |
| 默认 `fetchWithTimeout()`              | `CAPABILITY_UNAVAILABLE`，在代理启动处失败 |
| 显式 `networkStrategy: "native"`       | HTTP 200，正文正确                         |

显式 native 路径仍调用 `window.fetch`；本次本地端点开放了 CORS，只能证明分流差异。含本地文件引用或 multipart manifest 的请求仍强制代理，直接更改默认策略会触及附件展开、认证、代理配置和证书处理契约。

**影响**：使用默认公共请求入口的对话、媒体生成和模型调用；完整远程 Provider 请求尚未在本次调查中执行。

**建议落点**：在统一请求入口接入 Electron 传输，明确本地文件展开、multipart、取消/超时、流式响应及模型网络配置的承接位置。避免只补一个“代理已启动”的返回值。

### P1-B：基础文件 API 可用，业务文件与资产 API 大量缺失

[Electron 文件适配](../../electron/filesystem.ts) 已提供 `readDir`、`stat`、`copyFile`、`rename`、读写与删除；业务仍大量使用另一组命令：

- `get_file_metadata`、`list_directory`、`is_directory`、`append_file_force`。
- `copy_file_to_app_data`、`delete_directory_in_app_data`、`delete_file_to_trash`。
- `get_asset_base_path`、`list_all_assets`、`import_asset_from_path`、`import_asset_from_bytes`、`get_asset_binary` 和资产派生数据接口。
- 配置 ZIP 导入/导出、智能体头像等资源保存接口。

上述缺口分别影响文件操作、资产管理、对话附件、媒体生成、用户档案和智能体管理。真实 IPC 抽查确认资产根目录、资产列举、文件元数据、目录列举、追加、复制入应用目录、移入回收站等命令返回能力缺失。

**建议落点**：先补共享文件/资产服务，再接续单工具。回收站语义、应用目录约束、资产索引与引用关系应保持原有行为；直接映射成永久删除会改变公开契约。

### P1-C：Native / Sidecar 与技能执行生态受阻

[Shell 适配器](../../src/platform/native/shell.ts) 的 `Command.execute()/spawn()` 显式抛出能力缺失。插件层的 `load_native_plugin`、`call_native_plugin_method`、`sidecar_spawn_resident`、`sidecar_send_command` 等也未进入宿主分派。

真实 `/extensions` 页面中：

- AHK Automator、Paddle OCR：Sidecar 启动失败。
- Native 示例插件：启动失败。
- 页面可以发现并列出 JS 插件；这只能证明发现/展示路径，尚未验证所有 JS 插件的完整执行。
- 部分按需执行的 Sidecar 卡片未显示启动失败，仍受底层执行能力限制，不能按卡片外观判断可用性。

[技能服务](../../src/tools/skill-manager/services/SkillService.ts) 直接调用的 22 个命令均未接入，包括技能扫描、安装、卸载、兼容路径等。`get_all_skill_manifests` 的真实 IPC 调用确认失败。

**建议落点**：拆开“发现/管理”“单次进程”“常驻进程”“Native 调用”四种能力，分别对齐生命周期、取消与退出清理。宿主能力缺失应给出准确操作建议，当前通用插件失败提示仍引导用户排查 manifest/产物。

### P1-D：知识、思绪及原生工具后端尚未迁移

- 知识资料库：资料库、文档、索引、检索和旧数据迁移契约缺失。
- 思绪：条目/集合、标签、向量、备份等契约缺失。
- Git 提交助手/分析：调查时仓库状态、差异、暂存、提交与流式历史缺失。2026-11-05 已接通基础工作区、历史/概览及流式加载、补全与窗口级取消，目前累计 44 个命令，覆盖远端同步、分支/标签/stash、pick/revert、提交消息修改、导出/格式化与终端入口。应用内退出已补齐 Git/FFmpeg 收尾；真实提交/stash、外部认证和跨平台验收继续接续。
- FFmpeg/转写/实时字幕：执行、媒体探测、抽帧和取消缺失。
- 目录搜索、内容去重、目录清理、符号链接搬运、系统脉搏：各自任务执行后端缺失。
- 网页蒸馏室：抓取代理、Cookie/LocalStorage 与加解密后端缺失。

工具级范围见第 5 节。此类能力需要领域迁移或复用现有 Rust 算法；补通用文件 API 无法替代整条业务链。

### P1-E：后台 Agent 任务接管与事件恢复待实施

2026-11-05 已将 [BackgroundJsRuntimeBridge](../../src/services/background-js-runtime-bridge.ts) 接入应用级 [Node utility process](../../electron/background-runtime.ts)，提供版本校验、启动等待、心跳失联回收、代次和结构化 RPC 错误。页面离开只释放归属请求；应用退出统一回收后台进程。启动入口按宿主能力连接，Tauri 保留现有路径。当前方法覆盖运行时诊断。

现有多轮编排与单节点请求已提取为 Node 可运行的共享核心，生产聊天通过 Renderer 适配器复用它们；上下文组装、续写/快照、VCP 分段与可取消重试保持同一路径。模型请求/渠道中间件已共享，OpenAI 兼容协议已验证 Node HTTP/SSE、主备和本地文件展开。全部 11 个上下文处理器与三阶段宏内核已共享，`createContextProcessors` 按同一注册清单装配；Renderer 保留原日志、响应式宏注册表和宿主服务。Node 已用显式夹具服务验证完整管道到真实 HTTP 请求，Electron 渠道结构与凭据事务已由主进程 `LlmConfiguration` 接管，沿用原文件格式、revision 快照链及共享规范化；密钥轮询/熔断内核由 Renderer 与 Node 共用，Electron 的 Key 状态、轮询位置和持久化也已由主进程统一持有，窗口通过增量操作和单向状态投影同步。Node 文本分词及图片/音视频计费服务已复用生产引擎，按上下文固定注册表与模型快照；图片解码/缩放/编码及长图原生像素分析已接入任务级服务，切片计划与预算共用，真实 gzip/图片资产和完整管道到 HTTP 已验证。Worker 到 Main 的内部服务通道已接通，渠道加载与执行期 Key 操作复用窗口侧同一所有者，生产 Worker 就绪前完成轻量初始化；已接收事务跨进程退出排空。配置/Key 往返由独立真实 utility process 验证。正式 Worker 现已持有附件/图片/Token 上下文资源池，通过 Main 获取当前持久文件策略和现有资产根，正常退出先释放 scope 与原生队列；资源实例保持按需加载。真实 utility fixture 已验证跨进程策略变更、缓存读取撤销、资产根切换及精确图片预算到 HTTP。生产 Worker 继续仅公开诊断方法。PDF/Office、转写、检索与任务生产服务继续接线。其他协议、审批授权、其余上下文/响应/存储，以及会话状态和工具调用的宿主所有权仍需接入 Worker。持久 `SessionEvent`、订阅游标补发、窗口全部销毁后的真实 Agent 任务延续、审批重连和任务完成通知继续按迁移总纲阶段四推进。Windows 生产资源的运行时生命周期证据见[执行记录](../Plan/electron-feature-gap-execution.md#6-后台与正式分发)。

### P2-A：窗口与托盘有局部接口缺口

| 场景                  | 当前边界                                                                                                                                     |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 自定义窗口缩放手柄    | `ElectronWindow.startResizeDragging()` 向主进程发出调用，`windowCall()` 缺少对应 case；真实调用失败                                          |
| 缩放失败后的状态      | [useWindowResize](../../src/composables/useWindowResize.ts) 先设 `resizable=true`，成功后才设回 false；失败路径会跳过恢复                    |
| 托盘设置              | 宿主托盘菜单已实现；[Settings](../../src/views/Settings.vue) 的 `set_show_tray_icon` 和 `update_tray_setting` 未接入，设置与原生状态可能分离 |
| 退出确认命令          | `exit_app` 未接入；需先确认当前触发链，再对齐确认退出语义。托盘退出和平台 `process.exit` 是独立可用入口                                      |
| 分离窗口导航设置      | `navigate_main_window_to_settings` 未接入                                                                                                    |
| 对话/组件分离         | `begin_detach_session/finalize_detach_session` 缺失；基础 `create_tool_window` 可用                                                          |
| 画布专用窗口          | `create_canvas_window/get_canvas_windows/close_canvas_window` 等缺失；通用多窗口接通尚未覆盖此业务入口                                       |
| 窗口状态保存          | 有显式 `save_window_config`；系统退出持久化仍需接续                                                                                          |
| 独立 WebView/原生拖放 | WebView 适配器显式拒绝；已有 HTML 文件拖放降级，精确落点与专项交互待对齐                                                                     |

缩放问题可以独立修复：补缩放接口，并通过 `finally` 恢复临时修改的 resizable 状态。

### P2-B：宿主能力和提示归因错位

[桌面能力门面](../../src/platform/modules/system.ts) 通过 `!isElectronRuntime() && platform() === "windows"` 计算三项能力。因此真实 Windows Electron 中：

- `windowAutomation`、`screenCapture`、`externalPlayerOverlay` 全为 false。
- 窗口自动化页面仍提示“窗口绑定和方案执行需要 Windows”，容易让用户误判操作系统兼容性。

[代码格式化](../../src/tools/code-formatter/logic/formatter.ts) 以 `isTauri()` 判断 Rust/PHP/C/C++ 后端能力。真实 Electron 调用 Rust 格式化得到“该语言的格式化需要桌面应用，请在 AIO Hub 中打开此工具”。JavaScript 格式化正常。

**建议落点**：区分 OS、宿主和实际能力；界面呈现可操作功能、明确原因和替代入口。页面加载成功、空列表和通用诊断零异常均不足以作为业务可用性依据。

### P2-C：编辑联动、图片剪贴板和发布闭环

- [文件监听适配](../../src/platform/native/fs.ts) 的 `watch/watchImmediate` 显式拒绝；Web Canvas 的外部文件变更监听依赖此接口。
- Web Canvas 的“外部编辑器打开”依赖 `Command.create().execute()`，同样受 Shell 缺口影响。
- [图片剪贴板](../../src/platform/native/clipboard.ts) 的读写显式拒绝，影响画板等复制图片流程；文本剪贴板已实现。
- `get_system_fonts` 缺失，影响画板系统字体枚举。
- [HTTP 适配](../../src/platform/electron/http.ts) 显式拒绝逐请求代理、跳过 TLS 证书校验及 integrity；系统代理网络基础链路已有实现。
- [更新适配](../../src/platform/native/updater.ts) 的 `check()` 显式拒绝；[打包配置](../../electron/builder.config.cjs) 的 `publish` 为 null，当前 GitHub workflow 未接入 Electron 发布。
- Windows 本地分发已有产物；签名、更新、正式数据迁移、安装后的协议关联和 macOS/Linux 实机行为仍需接续验证。

## 4. 真实运行抽查

本轮通过项目 Dev Control 启动独立 `electron-gap-audit` 实例，使用全新的隔离数据目录。未使用真实模型账号或调用外部 Provider。

### 4.1 调用级证据

- 24 个选定的缺失业务命令均返回 `CAPABILITY_UNAVAILABLE`，覆盖后台状态、技能、迁移、资产、文件、LLM 代理、Git、媒体、托盘、画布与性能采集。
- 自定义缩放调用失败；三项 Windows 原生能力标志均为 false。
- 原生平台 HTTP 和显式 native LLM 路径成功；默认 LLM 路径失败。
- JavaScript 格式化输出 `const x = { a: 1, b: 2 };`；Rust 格式化失败。
- 正则文本规则将 `hello audit` 正确替换成 `hello Electron`。
- `sdk.path.join` 和 `native/path.join` 均成功；本次未把 SDK 路径门面误归为缺口。

缺失命令探查用于核验宿主分派状态，调用均在分派入口失败；它们并非完整业务操作验收。

### 4.2 页面级证据

走查了 13 个路由：`/text-diff`、`/skill-manager`、`/knowledge-base`、`/asset-manager`、`/git-committer`、`/system-pulse`、`/window-automator`、`/smart-ocr`、`/web-canvas`、`/llm-chat`、`/extensions`、`/code-formatter`、`/regex-applier`。

- 均可完成路由进入；首次文本差异页面采样时编辑器仍在加载，未将其记为编辑器验收。
- 技能、知识、资产、对话和画布显示新数据目录的空状态；同时存在缺失的后端调用，空列表不能证明加载链成功。
- 窗口自动化展示 Windows 限制提示。
- 智能 OCR 保留 Tesseract.js 操作界面；本次未执行图像识别，Windows OCR 与 Sidecar OCR 的缺口分别记录。
- 扩展页明确显示 AHK、Paddle OCR 和 Native 示例启动失败，已采集截图。
- Dev Control 启动期诊断缓冲为零条。该缓冲覆盖未捕获异常/拒绝/CSP；已有业务 catch 处理的错误仍可出现在界面。

## 5. 调查时的工具级缺口矩阵（实施前）

“缺失 / 直接命令”仅统计该工具目录内的字面量调用，公共资产、LLM 传输、Shell、文件监听等依赖另外叠加。下表描述待迁移的功能范围，不将整工具统一标成不可用。

| 工具                                    | 缺失 / 直接命令 | 受影响功能                                                   |
| --------------------------------------- | --------------: | ------------------------------------------------------------ |
| 思绪（`recall`）                        |         50 / 51 | 集合、条目、标签、向量和备份后端                             |
| 知识资料库（`knowledge-base`）          |         33 / 33 | 资料库 CRUD、文档导入、分块、索引与检索                      |
| Git 提交助手（`git-committer`）         |         31 / 31 | 仓库概览、差异、暂存、提交等 Git 操作                        |
| 技能管理（`skill-manager`）             |         22 / 22 | 扫描、安装、卸载、重命名与兼容路径管理                       |
| 文件操作（`aio-file-operator`）         |         12 / 17 | 元数据、追加、目录列举、复制/移动、回收站与搜索              |
| LLM 对话（`llm-chat`）                  |         11 / 13 | 会话分离、搜索、附件关联；共享 LLM/资产依赖另计              |
| 智能体管理（`agent-manager`）           |         10 / 13 | 头像等资源保存、导入及清理                                   |
| Git 分析（`git-analyzer`）              |           9 / 9 | 仓库流式加载、提交补全、详情和修改提交消息                   |
| 网页蒸馏室（`web-distillery`）          |           9 / 9 | 页面抓取代理、Cookie/LocalStorage 与加解密                   |
| 弹幕播放器（`danmaku-player`）          |           8 / 8 | 外部播放器检测、窗口矩形和原生叠层                           |
| FFmpeg 工具箱（`ffmpeg-tools`）         |          8 / 10 | 执行、进度/取消、元信息及关键帧                              |
| 符号链接搬运（`symlink-mover`）         |           8 / 8 | 预检查、搬运/链接、取消与操作记录                            |
| 目录搜索（`dir-search`）                |           7 / 9 | 搜索、批量替换、预览与取消                                   |
| 窗口自动化助手（`window-automator`）    |           7 / 7 | 枚举/绑定窗口、截图、读像素及键鼠执行                        |
| 资产管理器（`asset-manager`）           |           6 / 6 | 资产索引、删除、重复查找与文档转换器检测                     |
| 色彩提取器（`color-picker`）            |           6 / 7 | 目录图片扫描、分析、整理及权限检查                           |
| 实时字幕 OCR（`realtime-subtitle-ocr`） |           6 / 7 | 屏幕捕获、监控框、视频抽帧及媒体元信息                       |
| Web Canvas（`web-canvas`）              |           6 / 6 | 独立画布窗口、目录树；外部编辑同步与启动编辑器另受适配器限制 |
| 媒体生成（`media-generator`）           |           5 / 5 | 历史检索、资产读取与派生数据；共享 LLM 传输另计              |
| 转写（`transcription`）                 |           5 / 5 | FFmpeg 预处理、媒体元信息及派生结果保存                      |
| 内容去重（`content-deduplicator`）      |           4 / 4 | 扫描、取消、重复文件删除与差异读取                           |
| 目录清理（`directory-janitor`）         |           4 / 4 | 目录分析、清理和任务取消                                     |
| LLM Inspector（`llm-inspector`）        |           4 / 4 | 外部监听代理启动/停止/状态/目标配置；前端内部 hook 分开看待  |
| 智能 OCR（`smart-ocr`）                 |           4 / 5 | Windows 原生 OCR、临时文件接口；Tesseract.js 路径另行保留    |
| 用户档案管理（`user-profile-manager`）  |           4 / 4 | 上传资源复制、清理及目录定位                                 |
| 配置转换器（`config-converter`）        |           3 / 5 | 目录/文件元数据与目录树；纯文本转换独立评估                  |
| JSON 格式化（`json-formatter`）         |           3 / 3 | 后台剪贴板监控；手动 JSON 编辑/格式化独立评估                |
| VCP 连接器（`vcp-connector`）           |           3 / 4 | 本机 IP、目录和图片列举；WebSocket 协议本身未据此判定失效    |
| 代码格式化（`code-formatter`）          |           2 / 2 | Rust/PHP/C/C++ 后端格式化和后端状态；JS 等前端格式化可用     |
| 正则批量替换（`regex-applier`）         |           2 / 2 | Rust 规则兼容性校验和文件批处理；文本规则应用可用            |
| 画板（`sketch-pad`）                    |           2 / 2 | 系统字体与目录清理；复制图片另受剪贴板适配器限制             |
| 系统脉搏（`system-pulse`）              |           2 / 2 | 性能采集启动与停止                                           |
| Token 计算器（`token-calculator`）      |           2 / 3 | 图片尺寸和媒体元信息；纯文本计数独立评估                     |
| 壁纸检测（`wallpaper-detector`）        |           2 / 2 | 系统壁纸读取与目录定位                                       |
| 目录树（`directory-tree`）              |           1 / 1 | 原生目录树生成                                               |

其余工具仍需按业务路径验证；未出现在此表仅表示本次扫描未在该目录检出缺失字面量命令。

## 6. 建议补齐顺序

| 顺序 | 工作范围                                                              | 用户收益                             |
| ---- | --------------------------------------------------------------------- | ------------------------------------ |
| 1    | Electron 的默认 LLM 传输和本地文件载荷承接                            | 恢复对话与模型调用的主链             |
| 2    | 共享文件兼容命令、资产服务与导入导出                                  | 恢复附件、智能体资源和媒体资产流转   |
| 3    | 技能发现/管理、启动期能力分层、准确的能力提示；顺手修复缩放和托盘设置 | 启动状态清晰，基础桌面交互一致       |
| 4    | 单次/常驻 Sidecar 与 Native 插件执行                                  | 恢复 Paddle OCR、AHK 等插件生态      |
| 5    | 知识/思绪、Git、FFmpeg、目录类工具的领域迁移                          | 逐批恢复原生工具功能                 |
| 6    | 后台 Agent 所有权、窗口重连恢复、更新/迁移与跨平台发布                | 达成迁移的后台常驻目标与正式分发闭环 |

后台常驻的业务所有权改造量较大，可与领域后端迁移分开推进。现阶段应逐条打通可交付工作流，再扩展整机或跨平台验收。

## 7. 一次性调查产物

排查脚本与结构化结果保存在已忽略的 `.tmp/electron-gap-audit/`：

- `inventory.ts`、`command-inventory.json`：命令静态盘点与逐调用源位置。
- `runtime-probes.ts/json`：24 个命令、缩放、能力标志、网络分流与路径门面结果。
- `pages.ts`、`pages.json`：13 个路由的界面摘要。
- `business-probes.ts/json`：JS/Rust 格式化、正则文本替换。
- `screenshot-result.json`：真实扩展页截图位置；截图由 Dev Control 保存在本次启动身份的 artifacts 目录。

初始调查修改了调查文档与总纲索引；后续实现与验证记录见本页实施更新和缺口补齐待办。

### 内容查重实施更新（2026-11-05）

现有 Rust 扫描核心已由 Tauri 与 Electron N-API 复用。四个命令、窗口私有进度、原生任务取消/退出等待、512 KiB 默认预览及普通文件回收站处理已接通。Windows 生产资源完成 10 组真实验证，包含双窗口各 2400 个文件的并发/取消隔离，以及刷新、关窗和扫描中显式退出。前端同步修复停止返回值和 Windows 部分删除路径识别；详细证据与后续项见[执行待办](../Plan/electron-feature-gap-execution.md)。

### 目录搜索实施更新（2026-11-05）

Tauri 与 Electron 已共用 Rust 搜索、替换和整理核心，七个命令接通。搜索遵守全应用单任务、四线程及文件/字节/deadline 预算；结果通道采用有界背压，窗口私有事件通过 Channel 结束标记完成末批投递。取消校验窗口与 searchId，生命周期释放等待 worker，退出排空已接收的文件写入。

Windows 生产资源通过搜索、Unicode/context、预览、单项/批量替换、复制/移动、junction 防护及导航/刷新/退出验证；10,000 文件的 50 批结果完整到达。截图走查同步修复 emoji 周围高亮与 Monaco 列偏移，以及替换后预览刷新和未保存草稿保护。详细状态、证据与跨平台后续项见[执行待办](../Plan/electron-feature-gap-execution.md)。

### 符号链接移动实施更新（2026-11-05）

已接通文件属性单个/批量验证、完整预检、搬移并链接、仅创建链接、取消和最新/全部日志八个命令。Tauri 与 Electron 共用 Rust 两阶段搬移核心；补齐完整源路径重叠检查、祖先链接/reparse point 防护、窗口和任务身份取消隔离、原生任务退出等待，以及 KeepAlive 页面停用/恢复处理。

Windows 生产资源完成 11 组验证，覆盖硬链接数据身份、文件/目录符号链接、镜像目录、整批冲突阻断、junction 防护、真实 E 到 C 搬移及备份回收、工作台操作、512 MiB 复制的全局并发/私有进度/取消隔离和导航/刷新/关窗/退出。共享 Rust 9 项、宿主 7 项、前端 7 项行为测试及生产构建通过。跨平台验收与其余领域工具仍见[执行待办](../Plan/electron-feature-gap-execution.md)。

### 系统脉搏实施更新（2026-11-05）

`start_pulse` 与 `stop_pulse` 已接通。Electron 与 Tauri 共用完整 Rust 硬件采集器，保留 Windows PDH CPU 频率/汇总磁盘 I/O、sysinfo CPU/内存/网络/磁盘和 NVML GPU 指标。Electron 多窗口共享单一采集器，按窗口和订阅身份控制开始/停止与私有快照；最后订阅释放和退出均等待原生任务结束。

Windows 最终生产资源通过 9 组真实场景，覆盖仪表盘、双窗口共享与隔离、手动暂停、缓存页面停用/恢复、复制状态、刷新、关窗和退出。最终 addon 另验证完整字段、最新值缓冲和取消边界；Rust 2 项、宿主 6 项、前端 5 项行为测试及生产构建通过。本机已采到动态 CPU 频率、磁盘 I/O、网络和 RTX 4070 Ti SUPER 的实时指标。跨平台与其余工具继续见[执行待办](../Plan/electron-feature-gap-execution.md)。
