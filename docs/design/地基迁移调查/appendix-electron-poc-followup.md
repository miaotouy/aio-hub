# Electron PoC 续测记录（2026-10-14 / 2026-10-27）

> 当前本地 PoC：Electron **45.0.0**。第 1–10 节记录 Electron 39.8.10 的历史验证；第 11 节记录新版富文本复测与剩余验证范围。

## 1. 环境与执行范围

- 运行系统：Windows 10 19045，Ryzen 9 5900X、64GB 内存、RTX 4070 Ti SUPER。
- 实际安装版本：Electron **39.8.10**、Chromium **142.0.7444.265**、Node **22.22.1**、Native Module ABI **140**。版本来自测试进程的 `process.versions`。
- 复用 `.tmp/electron-poc` 和现有 `dist`，使用真实 Electron BrowserWindow、preload、IPC 与 `utilityProcess`；前端与 Rust 业务源码保持原样。
- 业务数据独立写入 `.tmp/electron-poc/artifacts/2026-10-14/data`。测试只请求本机临时 HTTP/TLS 服务。
- 后台任务是每 20ms 推进一次的可控探针，专门验证进程所有权、订阅与取消。真实 Agent 编排的迁移另行验证。

最终常规运行：**15 项通过，1 项主动崩溃测试按默认配置跳过**。日志和机器可读结果保存在：

- `.tmp/electron-poc/verify-2026-10-14.log`
- `.tmp/electron-poc/artifacts/2026-10-14/results.json`
- `.tmp/electron-poc/artifacts/2026-10-14/coupling-inventory.json`
- `.tmp/electron-poc/artifacts/2026-10-14/shell-after-tests.png`

## 2. 后台运行时与多窗口

| 场景                         | 结果                       | 证据与边界                                                                                                       |
| ---------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 两个窗口同时启动同一任务     | 通过                       | 相同任务 ID 只创建一次，两个窗口获得同一 utility PID                                                             |
| 多窗口订阅事件               | 通过                       | 两边收到一致且连续递增的任务序号                                                                                 |
| Tauri 事件 shim 跨窗口通信   | 通过                       | 验证广播、定向 `emit_to` 与 `unlisten`；窗口标签来自各自 preload 参数                                            |
| Renderer 刷新与重连          | 通过                       | 任务 PID 保持一致，序号由 33 推进至 45，按游标补发事件                                                           |
| 所有窗口隐藏                 | 通过                       | 后台任务继续推进；实际托盘图标与菜单尚需接入                                                                     |
| 所有 Renderer 窗口关闭后重开 | 通过                       | 窗口数确实降为 0；任务序号由 61 推进至 104，重新打开后可查询同一任务                                             |
| Renderer 真实崩溃后重连      | 早期运行通过，常规运行跳过 | `forcefullyCrashRenderer()` 后同一 utility 任务仍推进；证据在 `results-with-native-crash.json`，主动崩溃独立启用 |
| 订阅游标超出缓存             | 通过                       | 缓存限制为 64 条，返回 `resetRequired` 与当前快照，避免把缺失事件当作完整重放                                    |
| 任务取消                     | 通过                       | 返回 cancelled，等待后序号保持不变                                                                               |
| utility 退出与新代次启动     | 通过                       | 未完成 RPC 收到 `RUNTIME_EXITED`；新进程 PID 改变、generation 增至 2；旧任务查询明确失败                         |

### 运行时结论

Electron 主进程可以持有后台 runtime 与任务所有权，窗口承担命令入口和状态投影。窗口全部关闭时，需根据后台任务/托盘策略决定是否退出应用，PoC 测试模式保留主进程。

当前探针通过 main 中转 IPC，使用请求 ID 配对响应、结构化错误、任务序号和有界事件历史。`.tmp/electron-poc/runtime-protocol.d.ts` 是协议草案，尚需与真实业务的审批、工具执行、背压和持久化规则合并。

utility 内存状态在进程重启后清空。本轮验证了明确的失败和新代次语义，持久化会话恢复需要接入现有存储协调器。

## 3. 本地文件协议

原 PoC 的协议注册位于 `createWindow()` 内，多窗口会重复注册；Windows 路径直接拼接 URL 还容易损坏空格、`#` 和 `%`。续测将协议注册移动到 app ready，使用固定 host 与编码路径，并对本地读取范围做校验。

| 验证项                            | 结果                                           |
| --------------------------------- | ---------------------------------------------- |
| `convertFileSrc` → Renderer fetch | 中文、空格、`#`、`%` 路径读取通过              |
| 图片实际解码                      | PNG 得到 1×1 自然尺寸                          |
| 音频实际解析                      | WAV 读取到 1 秒 duration                       |
| 固定区间 Range                    | `bytes=2-5` 返回 206、`2345` 和 `bytes 2-5/22` |
| 尾部 Range                        | 返回正确长度与 206                             |
| 越界 Range                        | 返回 416                                       |
| 缺失文件                          | 返回 404                                       |
| scope 外文件与编码路径穿越        | 返回 403                                       |

实测还发现两处必要适配：

1. 现有 dist CSP 的 `connect-src`、`img-src`、`media-src` 需要允许新协议。本轮仅在 PoC 返回入口 HTML 时补充 `app:` 与 `poc-file:`，保留其他策略。
2. Renderer 从 `app://bundle` 请求 `poc-file://local` 是跨源读取，需要相应的 CORS 与响应头暴露规则。

**结论**：`protocol.handle` 足以覆盖已测的本地文本、图片、音频与分段读取。完整替代 asset 协议还要验证大视频 seek、UNC、用户授权的外部目录、嵌入页面和资源生命周期。当前 allowlist 只开放 PoC 数据根目录；外部文件需设计显式授权入口。

## 4. Node 网络能力

使用无 CORS 响应头的临时 HTTP 服务和自签名 TLS 服务验证：

- 同一跨源 URL 在 Renderer fetch 中被 CORS 拦截，Node HTTP 请求获得响应。
- TLS 默认请求拒绝自签名证书，错误为 `DEPTH_ZERO_SELF_SIGNED_CERT`；单次请求设置 `rejectUnauthorized: false` 后成功。
- Node HTTPS 请求指定 HTTP/1.1 策略后，HTTP/2 + HTTP/1.1 服务返回 `httpVersion: 1.1`。
- SSE 分三次增量接收 `data: 1`、`data: 2`、`data: 3`；取消后服务端确认连接关闭。

由此可以将请求策略放入 Node 后台运行时。现有 Rust 代理的删除仍取决于 LLM provider、超时、代理、流式背压、大 body 和错误兼容验证。

TLS 证书仅在测试内存中生成。`selfsigned` 5.5.0 在本次 Electron 进程中出现 `AlgorithmIdentifier` schema 错误，测试夹具改用 2.4.1 后通过；该依赖仅服务本地测试。

## 5. 系统信息替代能力

`systeminformation` **5.33.15** 在 utility process 中实测：

- CPU 型号、24 个逻辑核心、12 个物理核心、逐核负载、内存与五个磁盘的容量信息均可取得。
- RTX 4070 Ti SUPER 可取得 GPU 利用率、温度、显存总量与用量；同时枚举到本机虚拟显示适配器。
- 最终一轮整组采样约 **2.82 秒**，包含初次硬件探测；该数值不能直接当作后续轮询成本。
- CPU 温度为 null；默认网络统计的上下行每秒速率为 null，需继续验证接口选择和连续采样。
- 当前测试未覆盖 Rust `GpuSnapshot` 的 encoder、decoder、compute 三项专用利用率，以及磁盘逐盘 I/O、CPU 动态频率、进程/线程数等完整字段。

**结论**：常规信息和 NVIDIA 部分指标迁移可行；`systeminformation` 对现有 `system_pulse.rs` 的完整契约仍有待补齐，暂保留 Rust/NVML 作为专项能力选项。

## 6. 中文分词 Native Addon

`nodejieba` **3.5.8** 的 Electron 39.8 Windows x64 预编译文件下载返回 404。使用本机 C++ 工具链和 Electron 39.8.10 headers 编译后，`nodejieba.node` 在 utility process 中成功加载。

实际基准使用 9,728 个字符、`cut(text, false)`，与当前 Rust recall 模块关闭 HMM 的调用方式对齐：

| 项目                       | 本机实测  |
| -------------------------- | --------- |
| require 时间               | 约 1ms    |
| 首次 cut（含词典冷初始化） | 约 858ms  |
| 热态 20 次 cut 中位数      | 约 1.47ms |
| 热态 P95                   | 约 1.97ms |
| 返回 token 数量            | 3,584     |

**结论**：该输入规模下，热态性能满足实时分词的初步预期。词典冷初始化适合后台预热；发布需要明确 Electron ABI 重建、Native Addon 和词典的打包方式。分词质量与现有 jieba-rs 的索引兼容性，需用真实语料对照。

以下命令复现 Electron 39.8.10 的历史编译；当前 PoC 已升至 45.0.0，Native Addon 的新版 ABI 重建与加载待验证（见第 11 节）：

```powershell
Set-Location .tmp/electron-poc/node_modules/nodejieba
bun ../node-gyp/bin/node-gyp.js rebuild --target=39.8.10 --dist-url=https://electronjs.org/headers --arch=x64
```

## 7. Tauri 调用与共享边界盘点

统计方法：用 TypeScript AST 读取 TS/TSX 和 Vue script 块，识别来自 `@tauri-apps/api/core` 的直接导入、别名和 namespace invoke；包含对应目录下测试文件。动态 import、二次封装和字符串构造的命令需要单独审查。

| 范围              | 使用 Tauri 的文件数 | 直接 invoke 调用点 | 静态命令种类 | 动态调用点 |
| ----------------- | ------------------- | ------------------ | ------------ | ---------- |
| 桌面 `src`        | 300                 | 513                | 315          | 3          |
| 移动 `mobile/src` | 19                  | 36                 | 35           | 1          |
| 共享 `packages`   | 0                   | 0                  | 0            | 0          |

桌面导入较多的入口：core 175、fs 84、dialog 69、event 53、path 43、clipboard 24。这里统计导入声明数；同一文件可以使用多个入口。

invoke 分布最多的工具为 recall 67、knowledge-base 35、git-committer 33、web-distillery 32、aio-file-operator 27、agent-manager 24、skill-manager 23；完整按文件清单见 JSON。

现有 `packages` 已具备跨端复用的基础，例如 `@aiohub/llm-core`；本轮静态扫描未发现其直接导入 Tauri。后续可让桌面 Electron 和移动 Tauri 分别实现平台适配，共享协议、模型和纯业务逻辑。打包与真实移动运行态仍需独立验证。

实际 Agent 执行的当前边界也很明确：

- `src/tools/sub-agent/sub-agent.registry.ts` 仍调用 Renderer 的 `llmChatService.sendMessage`，随后读取 store 中的会话与消息。
- `src/services/background-tasks/registry.ts` 已存在任务快照、订阅和持久化恢复，但 registry 本身负责记录，实际执行另由调用链持有。
- `src/background-runtime/main.ts` 当前只实现 ping/getInfo 与心跳。
- `src/tools/llm-chat/services/sessionPersistenceCoordinator.ts` 持有持久化重试定时器。

因此，后续真实迁移的重点是把发送消息、会话数据所有权、工具/审批协调和定时器依赖拆入 backend service，并保持 Renderer 投影同步。

## 8. 自动测试弹窗修复

用户在测试过程中报告重复报错弹窗。确定的原因是窗口销毁回调读取已销毁对象的 `webContents.id`，触发 `Object has been destroyed`；Electron 主进程未捕获异常会进入默认报错 UI。

PoC 已调整：

- 在窗口存活时保存 `webContentsId`，销毁回调只使用缓存 ID。
- 自动测试模式将 `uncaughtException` 与 `unhandledRejection` 写入日志并以失败状态退出，保留失败信号。
- 主动 Renderer 崩溃默认跳过，单独设置 `AIO_POC_NATIVE_CRASH=1` 才执行。
- 常规运行隐藏测试窗口；最终重复关窗/重开验证通过，进程正常退出，日志没有再出现上述未捕获异常。

当前 PoC 仍保留启动探测用的未知命令 null fallback；真实能力迁移应逐步替换为可区分的成功、未实现与失败结果。

## 9. 复现与剩余项

在仓库根目录执行：

```powershell
bun run --cwd .tmp/electron-poc verify
bun .tmp/electron-poc/inventory.ts
```

主要剩余验证：

1. 接入一个真实 Agent/子智能体任务，验证 LLM 流式、工具、审批、用户干预、会话持久化与恢复。
2. 真实工具分离窗口：路由/初始参数、尺寸、置顶、关闭协议和共享状态；当前只覆盖普通 BrowserWindow 及事件。
3. 用第 10 节的真实会话样本补测 WebView2，完成同数据、同加载流程的内存对照。
4. Windows 11 22H2+ 的 Mica/Acrylic 实际效果与冷启动；本机 Windows 10 只能确认平台边界。
5. 系统信息连续采样与完整字段映射、更多媒体资源和网络 provider 契约。
6. 本轮 shell 改动后的打包验证。已将 preload 和协议模块补进 electron-builder files；原包体实测继续作为历史数据。
7. Forge/electron-builder 选型、独立 Node sidecar 对照，以及 CEF/移动端运行态专项验证。
8. 2026-10-27 升级 Electron 45 后，按目标 ABI 重建并加载 Native Addon，补跑后台 / 协议 / 网络、真实会话和打包专项；本次富文本复测范围见第 11 节。

## 10. 真实长会话与附件回放（2026-10-14）

### 数据与隔离方式

使用用户授权的会话：

```text
C:\Users\mzk\AppData\Roaming\com.mty.aiohub\llm-chat\sessions\session-1791671941881-wpd5y5xs9.json
```

- JSON 352,744 bytes；64 个消息节点，正文 144,464 字符，思考字段 15,959 字符。
- 原有消息树包含 7 个分叉节点、3 个压缩节点。当前分支渲染 48 条消息。
- 17 处附件引用涉及 16 张独立图片，复制 16 个原件及 16 个缩略图，共 12,163,352 bytes。
- 另复制 1 个会话头像、19 个正文 `agent-asset://` 图片；正文图片共 1,267,639 bytes。
- 正文引用 `agent-asset://biaoqingbao1/震惊.png` 按同名文件定位时未找到，需继续核对原 Agent 资产映射。测试样本保留该引用。

原始会话按字节复制，源目录只执行读取。测试数据放在 `.tmp/electron-poc/artifacts/2026-10-14/long-session/data/`。Agent 配置使用离线占位模型，正文图片映射按会话引用重建；原连接配置保持原位。自动转写关闭，测试进程拦截 HTTP/HTTPS 请求，本轮尝试外部请求数为 0。

使用现有 `dist`，沿用本附录的 Windows 10 / Electron 39.8.10 环境。为覆盖实际绘制与 `content-visibility`，测试窗口通过 `showInactive()` 显示，保持用户焦点，结束后自动关闭。普通协议/后台探针继续使用隐藏窗口。

### 行为验证

新增检查保护的契约是：真实会话跨壳回放时保留消息树与内容，历史浏览可以加载本地附件，刷新能够恢复已持久化会话。断言针对完整正文、思考字段、节点关系、活动叶子和图片解码结果。原有协议探针继续承担 Range、scope 和路径越界验证。

最终长会话运行 **6 项通过**，Renderer error 记录为 0，用时约 41 秒：

| 检查 | 实测结果 |
| --- | --- |
| 独立目录与主页采样 | 数据路径指向隔离目录；采集主页加载后 5 秒的内存 |
| 会话回放 | 64 个节点的全文、思考字段、父子关系、压缩标记和附件引用与源样本一致；活动叶子出现在当前投影 |
| 本地图片协议 | 51 个复制图片文件全部解码成功：16 个原件、16 个缩略图、19 个正文图片 |
| 历史浏览 | 顶部、四分之一、中部、四分之三和底部可达；当前投影的 15 个附件卡片缩略图加载；37 处正文 Agent 图片显示 |
| 原图预览 | 点击附件卡片打开实际原图，测得 1928 × 1623 像素，来源为隔离目录 |
| 反复浏览与刷新 | 刷新前浏览 4 轮；路由刷新后再次校验 64 个节点全文与树状态，活动叶子恢复，再完成一轮浏览 |

首页、会话顶部/底部和原图预览中的 UI 均保留实际工作区。已走查会话顶部、底部和图片预览截图。

### 内存采样

通过 Electron `app.getAppMetrics()` 汇总 Browser、GPU、Utility、Tab 四个进程的 `workingSetSize` 和 `privateBytes`。API 返回 KiB，表中换算为 MiB；下表为离散采样点。

| 采样阶段 | 工作集 MiB | 私有内存 MiB |
| --- | ---: | ---: |
| 主页加载后等待 5 秒 | 538.4 | 503.9 |
| 长会话加载后等待 5 秒 | 1250.9 | 1234.5 |
| 第一轮完整浏览后 | 1374.0 | 1400.4 |
| 再浏览三轮并等待 5 秒 | 1462.6 | 1469.3 |
| 刷新、重新浏览并等待 5 秒 | 1519.1 | 1519.9 |

这份真实数据已经完成 Electron 加载、媒体访问和刷新恢复验证。短时采样显示浏览与刷新后占用继续增加；长期运行、GC 回落和更多会话切换需要独立测量。WebView2 尚未按本次数据与流程采样，因此本表暂作为 Electron 单侧记录，后续对照继续使用同一隔离样本。

### 本轮补齐的 PoC 能力

1. `get_asset_base_path` 返回隔离目录的 `assets` 根路径，附件卡片沿用现有前端服务生成本地 URL。
2. `app://bundle/llm-chat` 等扩展名为空且落在 bundle scope 内的历史路由，回退至入口 HTML；现有文件读取与 scope 检查保留。此前刷新直接按文件读取路由，导致 Vue 未挂载，真实回放检查捕获了该问题。
3. 回放工具补齐离线 Agent/模型选择和正文图片映射，关闭自动转写。Vue 状态在跨进程返回前转为可序列化数据，避免测试脚本返回响应式 Proxy 时触发 clone 错误。

会话运行检查覆盖持久化数据回放。LLM 发起、工具执行、审批与后台 Agent 所有权迁移继续按第 9 节推进；PoC 的资产目录查询等 command 仍需完整适配。

### 复现和证据

```powershell
bun .tmp/electron-poc/prepare-long-session.ts
bun run --cwd .tmp/electron-poc verify:long-session
```

准备脚本支持显式指定源会话与输出目录；输出限定在 PoC artifacts 下。运行器目前使用上述固定测试目录。重复制会重置这份隔离样本。

- 脚本：`prepare-long-session.ts`、`verify-long-session.js`、`verify-long-session-launch.ts`。
- 最终报告：`.tmp/electron-poc/artifacts/2026-10-14/long-session/results.json`。
- 日志：同目录 `run.log`；早期配置/脚本失败和隐藏窗口试跑保留为独立 results 文件。
- 截图：`conversation-top.png`、`conversation-bottom.png`、`attachment-preview.png`。
- 常规 PoC 回归复跑：15 项通过，1 项主动崩溃默认跳过，覆盖此前的范围校验、媒体协议、后台生命周期和多窗口事件。
- 本轮改动只涉及本地 PoC 与调查文档，前端业务源码保持原样；现有 `dist` 用于真实 Electron 运行，PoC 入口通过 Bun 构建语法验证。

## 11. Electron 45 升级与富文本对照（2026-10-27）

### 当前版本与证据范围

`.tmp/electron-poc/package.json` 与 `bun.lock` 已固定 **Electron 45.0.0**，实际安装运行时同为 45.0.0。真实窗口报告为 **Chromium 156.0.8078.48 / V8 15.6.75.19**。本轮复用 2026-10-27 早先 Tauri / Electron 39 的同一生产前端产物，使用独立数据目录，业务源码保持原样。

测量配置为 1440 × 900 CSS 视口、关闭平滑 / 入场动画、代码块展开、256 单元分块、每 20 ms 发送一块、开启组件生命周期探针。四类约 100 KiB 语料各三周期静态 / 流式，另补长代码、Mermaid、KaTeX 与回收诊断，共 **35 个新版样本**。所有最终 AST 均匹配完整解析，挂载 / 卸载计数平衡，采样期间页面异常和 console error 为 0。

### 对迁移判断的补充

- 四类静态首屏相对 Electron 39 缩短 **18.5%–26.4%**；相对早先 Tauri 155 的同产物读数缩短 **3.8%–12.3%**。三组按顺序采样、每组三周期，保留运行波动与内核版本差异的解释边界。
- 十二个正式流式样本均无长任务；多代码围栏帧间隔 P95 从 **25.2 降至 18.9 ms**，静态首屏仍约 **1.03 秒**。
- Mermaid 静态 / 流式均生成 **14/14 个 SVG**，KaTeX 均有 **149 个公式节点**；真实截图已走查。Mermaid 流式单周期长任务累计 **203 → 226 ms**，跨空行列表完成上界 **134.4 → 175.9 ms**，后续继续优化。
- 普通混排与多代码围栏各两周期完整流式，卸载后组件 / 根 DOM 弱引用均释放、流订阅归零。主线程堆与旧版接近，多代码围栏略高，整进程内存收益待同样本专项确认。
- 旧版单长代码静态引用保留在新版两次独立进程采样中均已释放，卸载并 GC 后主线程堆为 **45.60 / 45.61 MiB**；该结果记录为跨版本回收差异，长期累计增长继续观察。

完整静态首屏、流式、重型节点和堆内存表统一维护在[富文本性能计划](../../../src/tools/rich-text-renderer/docs/Plan/markdown-conformance-and-performance.md#electron-45-升级复测2026-10-27)，调查报告摘要见[第 5.3 节](./webview2-migration-investigation.md#53-electron-45-同产物富文本复测2026-10-27)。

第 1–10 节的协议、网络、`utilityProcess` 生命周期、系统信息、`nodejieba` 与真实长会话数据保留为 Electron 39.8.10 记录。当前升级后的验证范围为富文本组件，下一轮继续补目标 ABI 的原生模块加载、后台 / 协议 / 网络、真实会话与发布打包。

### 复现与产物

- 正式时序：`.tmp/rich-text-electron-20261027/electron45/timing/`。
- 重型内容与回收：同目录 `heavy/`、`memory/`、`release-followup/`。
- 三方聚合：`.tmp/rich-text-electron-20261027/electron45/comparison.json`，包含同快照、组件、语料、视口与采样配置核对结果。
- 升级和测量命令见[富文本性能计划的产物与复现](../../../src/tools/rich-text-renderer/docs/Plan/markdown-conformance-and-performance.md#产物与复现)。旧版结果与截图继续存放在原目录。
