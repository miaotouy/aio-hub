# AIO Hub 全面迁移 Electron 工程总纲与施工方案

> 状态：实施中；平台隔离与 Electron 基础宿主已接入\
> 提出日期：2026-10-02  
> 更新日期：2026-11-04
> 编制人：咕咕（架构师）  
> 关联调查文档：[`docs/design/地基迁移调查/webview2-migration-investigation.md`](../design/地基迁移调查/webview2-migration-investigation.md)  
> 关联复盘文档：[`docs/Plan/cordis-runtime-postmortem-and-lessons.md`](./cordis-runtime-postmortem-and-lessons.md)

---

## 1. 战略决策与设计宗旨

### 1.1 核心决断：摆脱双层困局，重塑统一基座

AIO Hub 经过长期发展，已成长为包含 40+ 垂类效率工具、复杂长程 Agent、富文本高密度渲染（Markdown/KaTeX/Mermaid/CodeMirror）、多模态媒体处理的桌面级复合工作台。

当前迁移主要处理以下运行时、网络与跨平台问题；渲染性能和内存收益以同产物实测为依据：

1. **缺失独立的后台 JS 运行时**：Agent 编排和长任务不得不绑定在渲染窗口的 Vue 上下文中，窗口关闭或刷新即中断；用隐藏无头 WebView 只是徒增套娃。
2. **复杂富文本内存与回收**：早期长会话曾出现超过 2GB 的进程组占用；后续 WebView2 堆快照定位并修复了前端代理缓存保留。运行时升级、渲染器实现与整会话负载需分别测量，最新范围见下方实测更新。
3. **沉重的 Rust 代理 Workaround**：为了绕过 WebView2 的 CORS、证书、大 Payload IPC 传输等限制，被迫在 Rust 侧手写了几千行的 Axum 代理（`llm_proxy.rs` 等）。
4. **跨平台渲染地狱**：Windows (WebView2) / Linux (WebKitGTK) / macOS (WebKit) 行为分裂，渲染和 IME 偶发崩溃难以排查。

**迁移到 Electron** 的目标能力：

- 获得**统一、可预测、自带 Chromium 内核**的绝对控制权；
- 获得**原生常驻的 Node.js 主进程/工具进程**，为 Cordis 插件体系、长程 Agent、任务队列提供天然生存土壤；
- **前端 Vue 业务层 95% 资产无损平移**，GUI 工具箱与【发送到 Chat】的直觉交互体验 100% 保持；
- 核心高性能 Rust 算法（ripgrep、HNSW、BLAKE3、WinRT OCR）通过 `napi-rs` 原生桥接，性能不降反升。

### 1.2 当前 PoC 与实测更新（2026-10-27）

- 本地 PoC 已固定 **Electron 45.0.0 / Chromium 156.0.8078.48**。正式工程脚手架仍按阶段计划实施；本地 PoC 升级与富文本采样分别记录。
- 同一生产前端产物的四类约 100 KiB 语料、各三周期测量中，静态首屏较 Electron 39 缩短 **18.5%–26.4%**，较本日早先 Tauri 155 读数缩短 **3.8%–12.3%**；顺序采样与内核差异继续保留为解释边界。
- 新版共 35 个富文本时序 / 重型内容 / 回收样本，AST 校验全部通过。主线程堆与旧版接近；整进程与真实长会话内存收益待同样本对照。多个代码围栏首屏仍约 1.03 秒，Mermaid 与列表尾部等待继续优化。
- 旧版单长代码静态引用保留在新版两次独立进程采样中均已释放。Electron 39 的后台、网络、Native Addon、真实会话与包体数据保留原版本，新版专项与 ABI 重建继续推进。

调查摘要见[迁移调查第 5.3 节](../design/地基迁移调查/webview2-migration-investigation.md#53-electron-45-同产物富文本复测2026-10-27)，证据与范围见[PoC 附录第 11 节](../design/地基迁移调查/appendix-electron-poc-followup.md#11-electron-45-升级与富文本对照2026-10-27)，完整表格见[富文本性能计划](../../src/tools/rich-text-renderer/docs/Plan/markdown-conformance-and-performance.md#electron-45-升级复测2026-10-27)。

---

## 2. 目标拓扑架构

```mermaid
graph TB
    subgraph Frontend [前端渲染进程 - 固定版本 Chromium]
        UI[Vue 3.5+ / Element Plus]
        ToolsUI[40+ 效率工具箱 (正则/OCR/蒸馏/Git等)]
        AgentUI[Agent 对话工作台 / 轨迹视图]
        QuickHandOff[一键发送到 Chat / 事实投递槽]
        BridgeAdapter[统一平台适配器 @/platform/bridge]
    end

    subgraph NodeMain [Node.js 主进程 / 后台守护中枢]
        WindowManager[BrowserWindow 窗口与多标签管理器]
        CordisRuntime[Cordis 微内核 / 插件生命周期 Scope]
        AgentEngine[长程 Agent 调度器 / 仅追加事件日志]
        NodeFS[原生 fs / path / child_process]
        NodeNet[原生 HTTP / HTTPS / SSE (免代理)]
    end

    subgraph NativeCore [Rust 高性能王牌资产 (napi-rs)]
        KnowledgeAddon[knowledge.node (HNSW 向量 + SVD 检索)]
        DirSearchAddon[dir_search.node (ripgrep 并行多线程搜索)]
        DeduplicatorAddon[deduplicator.node (BLAKE3 快速去重)]
        WinNativeAddon[windows_native.node (WinRT OCR / PDH 硬件监控)]
    end

    BridgeAdapter <-->|Electron IPC (Typed invoke / on)| NodeMain
    NodeMain <-->|直接内存调用 (Zero-Copy)| NativeCore
    ToolsUI -.->|前端内存事件 (0 延迟)| QuickHandOff
    QuickHandOff -.->|注入上下文| AgentUI
```

---

## 3. 施工原则与关键军规

1. **业务平移优先，不借迁移之名重构业务**：
   - 现存 40+ 工具的 UI、Composable、Store 绝大部分是纯 Vue 3 代码，原则上只做 API 寻址替换，绝不在第一阶段改写工具业务逻辑。
2. **垫片隔离（Facade / Adapter 模式）**：
   - 严禁直接全局正则替换 `import { invoke } from '@tauri-apps/api/core'` 为 Electron 专有代码。
   - 建立 `src/platform/` 统一隔离层，业务通过能力入口访问宿主。当前兼容实现转发到 Tauri，Electron 实现按能力接续。
3. **Rust 核心资产按模块渐进 Napi 化**：
   - 不搞推倒重来，利用 `napi-rs` 将经受住考验的高性能 Rust 算法按顺序编译为 `.node` 模块，直接在 Node.js 中调用。
4. **彻底清理垃圾 Workaround**：
   - 迁移至 Electron 后，坚决拔除 `llm_proxy.rs`、`llm_inspector.rs`、`background-js.html` 等历史补丁。

---

## 4. 详细实施路线图（五阶段方案）

### 阶段零：平台适配垫片层建设（当前仓库内先行）

> 状态：Tauri SDK 导入隔离与静态防回退检查已落地（2026-11-03）；运行时能力适配仍按后续阶段推进。

**目标**：在不改变当前 Tauri 运行的前提下，把前端代码对 `@tauri-apps/api` 的直接依赖收敛到统一接口。

1. **集中宿主能力入口（已完成）**：
   - `src/platform/native/` 提供 IPC、事件、窗口、文件、路径、对话框、剪贴板、HTTP、系统、Shell、进程、更新与协议唤醒入口，保留现有 SDK 契约。
   - `src/platform/browser/` 集中浏览器剪贴板与弹窗；`core/env.ts`、`modules/assets.ts`、`modules/media.ts` 集中宿主检测、资源协议和媒体授权。
   - 已有 `core/bridge.ts` 与 `modules/` 语义门面保持原有契约；Electron 适配仍需实现窗口对象、事件目标、二进制通道与资源释放。
2. **调用点收拢与维护约束（已完成）**：
   - 桌面 `src/` 的直接 SDK 导入及测试 mock 已改用平台入口。
   - `check:platform-isolation` 纳入仓库检查，约束新增 SDK 导入与业务代码的剪贴板、弹窗、宿主标记访问。
3. **验证与接续**：
   - 具体行为、验证结果和待办见[平台隔离层计划](./frontend-platform-bridge-isolation-plan.md)与[架构说明](../architecture/platform-bridge-architecture.md)。

---

### 阶段一：新工程脚手架与 Electron 骨架搭建

> 状态：基础链路已落地（2026-11-03），完整跨平台窗口交互继续收口。

1. **工程与启动**：根目录 `electron/` 使用 TypeScript；Bun 构建主进程与 CommonJS 沙箱 preload，复用现有 Vite/Vue 前端。已锁定 Electron 45.2.1，提供 `electron:dev`、`electron:build` 和 `electron:preview`。
2. **宿主实现**：无边框主窗口、工具窗口、托盘、基础窗口事件与配置；显式 IPC 分派、定向事件、响应式参数序列化与错误包络；生产应用协议与本地文件授权协议。
3. **首帧必要能力**：应用与系统信息、配置和日志持久化、基础文件与路径、文本剪贴板、文件对话框、外部打开。业务继续通过阶段零的隔离入口调用。
4. **数据与回退**：Electron 开发/预览使用独立数据目录；Tauri 的开发、构建和发布链路保留。迁移未覆盖的能力返回可行动错误，Rust 专项命令按阶段二/三接续。
5. **验证与接续**：现有工作台已在真实 Electron 中加载；进一步验证范围和启动说明统一写入[Electron 桌面开发](../guide/electron-development.md)。拖拽预览固化、窗口吸附、跨平台材质、原生对话框完整交互、单实例唤醒已接入，安装包已声明系统协议，实际安装后的协议关联和跨平台运行验证继续接续。

---

### 2026-11-04 代码盘点与本轮接续

当前基础宿主使用 `electron/main.ts`、沙箱 preload 与 `src/platform/electron/`；启动、构建、预览和本地分发均已有入口。阶段一的早期目录设计仅作为设计记录，当前落点与进度以阶段一文档的实施快照为准。

本轮按以下顺序施工，各项完成后回填验证结果：

- [x] 开发态图标：复用 `src-tauri/icons/icon-dev.png`，窗口与托盘同步区分开发/分发；补齐托盘恢复最小化窗口的行为。
- [x] 单实例与协议唤醒：同一数据目录共享实例，独立数据目录继续支持并行开发；二次启动恢复主窗口，校验并转发 Deep Link；分发包声明 `aiohub` 协议。
- [x] 原生 HTTP 基础链路：接入平台 `fetch` 的请求/响应、二进制、按需读取流与取消；窗口刷新/销毁释放请求。先覆盖标准 HTTP/SSE，插件高级客户端选项保持显式能力边界。

本次发现并补记的缺口：

| 优先级 | 能力缺口                                                                                                                                                | 后续落点                                                     |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| P1     | 平台 HTTP 已接通；`core.ts` 的 Channel 与 LLM Rust 代理命令仍待迁移                                                                                     | 阶段二：业务代理与 Channel 接续                              |
| P1     | 首页初始化仍触发 `background_runtime_get_status`、`get_all_skill_manifests`、`recall_preview_legacy_migration` 能力缺失；技能加载与工具注册出现错误提示 | 后台状态、技能扫描与知识库迁移契约；按宿主能力梳理启动初始化 |
| P1     | 开发探针命令当前为空操作                                                                                                                                | 前端就绪、心跳与异常探针的持久化和消费契约                   |
| 已完成 | Dev Control 接入 Electron 开发态与生产资源预览，支持窗口身份、CDP 操作和隔离生命周期                                                                    | 2026-11-04：见开发界面控制指南                               |
| P1     | Shell/Sidecar、文件监听、图片剪贴板仍返回能力缺失                                                                                                       | 阶段二：逐项对齐现有调用契约                                 |
| 已完成 | 托盘补齐隐藏、重启前端和清除窗口配置操作，恢复最小化主窗口                                                                                              | 阶段一：2026-11-04 真实 Electron 验证                        |
| P2     | 外部文件拖放缺精确落点；独立 WebView、拖拽预览和吸附未迁移                                                                                              | 窗口/工具专项                                                |
| P2     | 窗口状态依赖业务显式保存，系统退出时的状态写入仍需梳理                                                                                                  | 生命周期持久化专项                                           |
| P2     | 更新器、自动发布、正式数据迁移和 macOS/Linux 运行验证未完成                                                                                             | 发布与跨平台专项                                             |

基础 HTTP 接通后，LLM Chat、媒体生成、插件与知识库的完整可用性仍需各自后端契约落地验证。

---

### 阶段二：后端通用能力与网络代理清理

> 状态：2026-11-04 已接入平台 HTTP 的二进制请求、按需响应流、取消、重定向与等待响应头超时。传输使用 Chromium 原生网络栈复用系统代理，上传内容先在渲染端编码。LLM 专用代理命令、Channel 与业务网络调用迁移继续实施，现有 Rust 代理仍服务 Tauri。

**目标**：将 56% 的低风险/通用文件与系统能力替换为 Node.js 原生实现，直接消灭 Rust 代理层。

1. **消灭代理层**：
   - 平台通用 HTTP 已由主进程 Chromium `net.request` 承接；LLM 专用请求契约继续迁移至主进程，按业务需要选择 Chromium 网络栈或 Node HTTP 客户端。
   - 平台响应流通过拉取式 IPC 返回前端，单块上限 64 KiB；完成 LLM 代理契约及两端调用迁移后再退役对应 Rust 代理。
2. **文件系统与配置管理**：
   - 将 `file_operations.rs`、`config_manager.rs`、`asset_manager.rs` 全面替换为 Node 原生 `fs/promises` + `trash`。
3. **多媒体与命令行调用**：
   - `ffmpeg_processor.rs` 替换为 Node.js `child_process.spawn`，stderr 进度正则解析逻辑直接复用。
4. **交付物验收**：
   - LLM Chat、媒体生成、资产管理器、配置读取等纯数据/文件类工具在 Electron 下完整跑通。

---

### 阶段三：Rust 高性能王牌资产 Napi 化

**目标**：保持关键算法极速体验，用 `napi-rs` 封装 4 个核心 Rust 算法模块。

1. **新建 crates/native-addons**：
   - 配置 `napi-rs` 构建流水线。
2. **移植四重核心算法**：
   - **`dir_search`**：移植 `ignore` 并行遍历与正则检索，通过 Napi 线程安全回调向 Node 发送流式结果。
   - **`knowledge`**：移植 HNSW 向量索引与 SVD 检索引擎（附录 B 算法资产）。
   - **`content_deduplicator`**：移植 BLAKE3 多级指纹比对算法。
   - **`windows_native`**：封装 WinRT OCR 与系统性能监控。
3. **交付物验收**：
   - 运行目录搜索与知识库检索，实测性能与原 Tauri 版本持平，无明显 IPC 阻塞。

---

### 阶段四：后台常驻 Agent 引擎与 Cordis 插件底座落地

**目标**：在真正的主进程环境中释放 Agent 与 Cordis 的全部威力。

1. **常驻 Agent 会话运行时**：
   - 会话状态机由 Node.js 主进程/独立 Worker 持有，采用仅追加事件日志（`SessionEvent`）。
   - 窗口关闭、刷新、切换路由，长程 Agent 任务在后台照常执行。
   - 窗口重连后，一键重放最近事件增量，实现无缝断线重连。
2. **Cordis 插件底座回归**：
   - 引入标准 Cordis 上游包，通过 Node.js 原生生命周期安全管理 Scope、卸载 Listener 和销毁 Timer。
3. **一键联动优化**：
   - 强化所有小工具的【发送到 Agent】按钮：支持跨窗口、跨 Tab 的上下文 Capsule 投递。
4. **交付物验收**：
   - 关闭主窗口后，后台执行的 Agent 自动完成写入并发出系统通知；重新打开窗口，完整历史与结果即时呈现。

---

### 阶段五：打包、优化与正式收敛

**目标**：产品化、CI/CD 自动化与体积控制。

1. **打包器配置**：
   - 已接入 `electron-builder`、根目录双击脚本和独立分发目录。Windows 提供 NSIS、Portable 与带运行时目录；macOS (DMG)、Linux (AppImage/deb) 配置已加入，待对应系统验证。签名、自动更新与 CI 发布继续接续。
2. **体积与性能调优**：
   - 移除原 Tauri 中臃肿的 `git2-rs vendored`（节省 ~30MB）。
   - 启用 V8 内存限制与 Chromium 启动优化参数（锁定老生代堆内存，定期 GC 整理）。
3. **最终切换**：
   - 正式切换默认发布工件为 Electron 版本。

---

## 5. 风险应对预案

| 潜在风险                   | 影响程度 | 应对策略                                                                                                                               |
| :------------------------- | :------- | :------------------------------------------------------------------------------------------------------------------------------------- |
| **安装包体积上升**         | 中       | 预计体积从 70MB 增加到 140MB 左右；通过剔除重型 Rust 依赖、精简 node_modules、启用 asar 压缩抵消增幅。在现代桌面环境下此增幅完全可控。 |
| **Windows 窗口毛玻璃特效** | 低       | Electron 28+ 原生支持 `vibrancy: 'under-window'`，Windows 11 支持 Mica/Acrylic 背景材质，视觉质感与现有 `window-vibrancy` 对齐。       |
| **移动端分化**             | 极低     | 移动端（`mobile/` 目录）本来就拥有独立的工程、UI 和 Tauri 移动打包链，桌面端的基座变更完全不波及移动端。                               |

---

## 6. 下一步执行动作建议

1. **第一步（已完成）**：桌面宿主调用集中到 `src/platform/`，保留现有 Tauri 契约，为能力适配提供统一替换入口；
2. **第二步（基础链路已落地）**：`electron/` 宿主加载现有工作台，开发与生产预览使用同一隔离入口；
3. **第三步**：优先迁移原生 HTTP/SSE、文件监听与通用 Rust 命令，再按工具逐项推进完整工作流。
