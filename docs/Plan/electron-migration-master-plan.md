# AIO Hub 全面迁移 Electron 工程总纲与施工方案

> 状态：规划评审中 (RFC)  
> 提出日期：2026-10-02  
> 编制人：咕咕（架构师）  
> 关联调查文档：[`docs/design/地基迁移调查/webview2-migration-investigation.md`](../design/地基迁移调查/webview2-migration-investigation.md)  
> 关联复盘文档：[`docs/Plan/cordis-runtime-postmortem-and-lessons.md`](./cordis-runtime-postmortem-and-lessons.md)

---

## 1. 战略决策与设计宗旨

### 1.1 核心决断：摆脱双层困局，重塑统一基座

AIO Hub 经过长期发展，已成长为包含 40+ 垂类效率工具、复杂长程 Agent、富文本高密度渲染（Markdown/KaTeX/Mermaid/CodeMirror）、多模态媒体处理的桌面级复合工作台。

在当前应用尺度下，原有的 **Tauri + WebView2** 架构暴露了不可调和的结构性物理缺陷：

1. **缺失独立的后台 JS 运行时**：Agent 编排和长任务不得不绑定在渲染窗口的 Vue 上下文中，窗口关闭或刷新即中断；用隐藏无头 WebView 只是徒增套娃。
2. **WebView2 的 GC 与内存失控**：长会话和复杂富文本场景内存动辄飙升突破 2GB，且 GC 策略为系统黑盒，开发者无法干预。
3. **沉重的 Rust 代理 Workaround**：为了绕过 WebView2 的 CORS、证书、大 Payload IPC 传输等限制，被迫在 Rust 侧手写了几千行的 Axum 代理（`llm_proxy.rs` 等）。
4. **跨平台渲染地狱**：Windows (WebView2) / Linux (WebKitGTK) / macOS (WebKit) 行为分裂，渲染和 IME 偶发崩溃难以排查。

**迁移到 Electron** 将彻底解开上述枷锁：

- 获得**统一、可预测、自带 Chromium 内核**的绝对控制权；
- 获得**原生常驻的 Node.js 主进程/工具进程**，为 Cordis 插件体系、长程 Agent、任务队列提供天然生存土壤；
- **前端 Vue 业务层 95% 资产无损平移**，GUI 工具箱与【发送到 Chat】的直觉交互体验 100% 保持；
- 核心高性能 Rust 算法（ripgrep、HNSW、BLAKE3、WinRT OCR）通过 `napi-rs` 原生桥接，性能不降反升。

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
   - 建立 `@/platform/bridge` 统一门面。在迁移过渡期，该门面下层可同时对接 Tauri（保留回退能力）或 Electron。
3. **Rust 核心资产按模块渐进 Napi 化**：
   - 不搞推倒重来，利用 `napi-rs` 将经受住考验的高性能 Rust 算法按顺序编译为 `.node` 模块，直接在 Node.js 中调用。
4. **彻底清理垃圾 Workaround**：
   - 迁移至 Electron 后，坚决拔除 `llm_proxy.rs`、`llm_inspector.rs`、`background-js.html` 等历史补丁。

---

## 4. 详细实施路线图（五阶段方案）

### 阶段零：平台适配垫片层建设（当前仓库内先行）

**目标**：在不改变当前 Tauri 运行的前提下，把前端代码对 `@tauri-apps/api` 的直接依赖收敛到统一接口。

1. **新建抽象网关**：
   - `src/platform/bridge.ts`：抽象 `invoke(cmd, args)`、`listen(event, cb)`、`emit(event, data)`。
   - `src/platform/fs.ts`：抽象 `readFile`、`writeFile`、`appDataDir` 等通用路径与文件调用。
   - `src/platform/window.ts`：抽象窗口最小化、最大化、置顶、关闭与多窗口通信。
2. **批量收拢前端调用点**：
   - 逐步替换当前分散在各个工具中的 295 处 `@tauri-apps/api` 显式导入，改走统一 bridge。
   - 此时 bridge 内部依然简单转发给 Tauri。
3. **交付物验收**：
   - 全局 `bun run check:frontend` 通过，现有 Tauri 版本打包与运行 100% 正常。

---

### 阶段一：新工程脚手架与 Electron 骨架搭建

**目标**：搭建 Electron + Vite + Vue 3 的并存架构，点亮首个 Electron 窗口。

1. **选型与工程组织**：
   - 采用 `electron-vite` 或主仓库并列的 `electron/` 目录组织。
   - 主进程语言统一使用 TypeScript，包管理统一使用 `Bun`。
2. **主进程基础基础设施**：
   - 窗口管理（无边框窗口、自定义 TitleBar、多窗口/分离窗口 `BrowserWindow` 管理）。
   - 本地协议注册（将 Tauri 的 `asset://` 平替为 Electron 的 `protocol.handle('asset', ...)`）。
   - 统一类型化 IPC 通道搭建：实现对应 bridge 的 `electron-bridge.ts`。
3. **交付物验收**：
   - 执行 `bun run electron:dev`，能够正常拉起主窗口，成功加载现有主界面，标题栏拖拽、窗口控制正常。

---

### 阶段二：后端通用能力与网络代理清理

**目标**：将 56% 的低风险/通用文件与系统能力替换为 Node.js 原生实现，直接消灭 Rust 代理层。

1. **消灭代理层**：
   - 渲染进程/前端发起 LLM 请求时，改由主进程 Node.js 原生 `fetch` 或 `undici` 发起。
   - 绕过所有 CORS 拦截，支持大体积流式数据直推前端，彻底删掉 `llm_proxy.rs`。
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
   - 配置 `electron-builder`，支持 Windows (NSIS/Portable)、macOS (DMG)、Linux (AppImage/deb)。
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

1. **第一步（立即开展）**：在现有工程中建立 `src/platform/` 抽象层，将 `@/platform/bridge` 先作为当前 Tauri 调用的垫片，完成前端代码的解耦治理；
2. **第二步**：创建迁移分支 `feature/electron-migration`，搭建最小 Electron 容器原型，加载 `dist/` 验证前端渲染与首个窗口控制。
