# Electron PoC 续测记录（2026-10-14）

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

复现本轮编译：

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
3. 同一生成会话、同一加载流程的 Electron/WebView2 内存对照。
4. Windows 11 22H2+ 的 Mica/Acrylic 实际效果与冷启动；本机 Windows 10 只能确认平台边界。
5. 系统信息连续采样与完整字段映射、更多媒体资源和网络 provider 契约。
6. 本轮 shell 改动后的打包验证。已将 preload 和协议模块补进 electron-builder files；原包体实测继续作为历史数据。
7. Forge/electron-builder 选型、独立 Node sidecar 对照，以及 CEF/移动端运行态专项验证。
