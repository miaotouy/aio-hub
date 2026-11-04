# Electron 版功能缺口调查（2026-11-04）

> 范围：当前工作区的 Windows Electron 宿主、共享前端与工具后端调用。  
> 方法：源码调用盘点 + 真实 Electron Dev Control 抽查。  
> 运行环境：AIO Hub 0.7.1-alpha.2 / Electron 45.2.1 / Chromium 156.0.8078.75。  
> 关联：[迁移总纲](../Plan/electron-migration-master-plan.md)、[Electron 开发指南](../guide/electron-development.md)。

> 实施更新（2026-11-04）：默认模型请求已切换为 Electron 主进程传输，本地文件载荷、流式取消和逐请求网络配置已接通；共享文件兼容命令、回收站及资产索引/导入/派生数据工作流已接通，配置 ZIP 备份恢复和智能体私有资源接口也已接通；旧版 Office 文档转换器检测、配置与自动转换也已接通，本机 LibreOffice 实测通过，其他后端实机验证待续；技能扫描、安装/集合包管理及脚本执行已接通并通过 Windows 实机验证；启动与原生工具已引入宿主业务能力分层及原因提示；八方向自定义窗口缩放与 resizable 恢复已接通，并通过 Windows 生产资源预览验证。托盘设置、业务退出/设置导航、分离窗口会话与 Canvas 窗口已接通，生产 Canvas 使用受限独立预览来源；实机发现并修复三窗口操作广播和显示器工作区结构问题。LLM 会话原子写入/删除、请求快照文件和附件引用已接通，有会话数据的分离草稿、刷新与整进程重启恢复已通过 Windows 实机验证；流式搜索、命令 Channel 与窗口级取消已接通，尾部事件投递和并发恢复竞态通过 Windows 生产资源实例验证。文件监听、图片剪贴板和系统字体已接通，Canvas 磁盘内容加载引发的重复回写已修复。下文保留调查时的证据；执行进度见[缺口补齐待办](../Plan/electron-feature-gap-execution.md)。

## 当前补充盘点（2026-11-04）

文件监听、剪贴板与字体批次接入后，沿用下文的字面量命令扫描方法重新统计：前端引用 324 个唯一业务命令，其中 93 个已进入 Electron 分派，231 个待迁移；主进程当前分派 110 个业务命令。该数字只衡量命令覆盖，动态调用、平台对象和实际工作流需独立验证。结果保存在已忽略的 `.tmp/electron-host-adapters/command-inventory-current.json`。

当前优先缺口：

1. **插件执行**：Native/Sidecar 的单次与常驻执行、取消、事件和退出回收。
2. **知识资料库/Recall**：初始化、历史迁移、导入、任务队列、向量索引和检索。最新隔离启动仍出现知识库初始化能力错误，启动提示应随迁移或能力分层处理。
3. **领域后端**：Git、FFmpeg/转录、目录操作、系统监控及网页蒸馏等，详见执行待办。
4. **系统适配与发布**：独立 WebView、文件拖放、后台任务所有权、更新和正式数据迁移。真实分离窗口仍出现 WebView 拖放监听降级提示，文件导入的落点语义需继续验证。

本批已接通托盘/退出/设置导航、窗口分离会话和 Canvas 独立预览；三窗口广播回复竞争、工作区结构和置顶查询在实机调查中定位并修复。空会话和有会话数据的分离/回附均已验证，会话持久化、重启恢复与流式搜索验证记录见执行待办。文件监听、图片剪贴板和系统字体已完成 Windows 原生协议验证；Canvas 文件树仍受目录命令缺口影响。

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
- Git 提交助手/分析：仓库状态、差异、暂存、提交以及流式历史加载缺失。
- FFmpeg/转写/实时字幕：执行、媒体探测、抽帧和取消缺失。
- 目录搜索、内容去重、目录清理、符号链接搬运、系统脉搏：各自任务执行后端缺失。
- 网页蒸馏室：抓取代理、Cookie/LocalStorage 与加解密后端缺失。

工具级范围见第 5 节。此类能力需要领域迁移或复用现有 Rust 算法；补通用文件 API 无法替代整条业务链。

### P1-E：后台运行时目标仍未落地

[启动入口](../../src/main.ts) 无条件启动 [BackgroundJsRuntimeBridge](../../src/services/background-js-runtime-bridge.ts)，其首次调用 `background_runtime_get_status` 在真实 Electron 中失败。`background_runtime_ready/heartbeat` 同样缺少分派。

当前 `electron/` 未接入该后台运行时的 `utilityProcess`/Worker 服务。主进程可运行和托盘可用，尚不足以证明 Agent 已脱离窗口生命周期。关闭、刷新后继续执行及重连事件恢复仍属于后续迁移目标。

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

## 5. 工具级缺口矩阵

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
