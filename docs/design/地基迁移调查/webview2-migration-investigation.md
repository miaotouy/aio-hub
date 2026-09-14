# WebView2 瓶颈与引擎迁移调查报告

**状态**: RFC (Request for Comments)  
**创建日期**: 2025-05-20  
**作者**: 咕咕

---

## 1. 问题陈述

WebView2 的不可控性已成为功能设计和开发的主要瓶颈之一。除此之外，当前架构还存在一个更基础的运行时边界问题：Agent 逻辑实际运行在前端渲染进程中，生命周期与渲染窗口绑定，无法作为独立、长期运行的服务存在。本文档记录当前已知的痛点、可选方案的技术评估，以及后续调查方向；后续方案不仅要解决渲染引擎问题，还必须提供一个后端 JavaScript 运行时，将 Agent 运行时与 UI 渲染运行时解耦。

---

## 2. 已确认的痛点

### 2.1. 内存管理不可控

- 复杂富文本场景（消息列表 + 流式渲染 + 代码块 + Mermaid）下内存占用轻松突破 2GB
- WebView2 的 GC 策略完全黑盒，无法干预或调优
- 即使已实现 `content-visibility: auto`、Patch 系统、组件卸载清理等优化，内存仍不可控

### 2.2. Rust 代理是 WebView2 限制的 workaround

从 `src/llm-apis/common.ts` 的 `fetchWithTimeout()` 可以看到，整个 Axum 代理服务存在的原因是 WebView2 的限制：

- `relaxIdCerts`（放宽证书校验）→ WebView2 fetch 不支持
- `http1Only`（强制 HTTP/1.1）→ WebView2 fetch 不支持
- CORS 限制 → 跨域 API 请求被拦截
- 大 Body IPC 阻塞 → base64 图片通过 invoke 传输卡死主线程
- `local-file://` 协议 → 浏览器安全沙箱拒绝

如果换成 Electron，Node.js 主进程的 HTTP 模块没有这些限制，代理层可以直接删除。

### 2.3. 跨平台兼容性

- **Linux**: 有用户报告在某些发行版上 WebKitGTK 版本不兼容，导致闪退或白屏
- **macOS**: 少量兼容性报告（WebKit 行为差异）
- **Windows**: 依赖系统安装的 WebView2 Runtime，版本不一致

### 2.4. 难以复现的 Bug

- 用户端 WebView2 Runtime 版本参差不齐
- 同一代码在不同版本上行为不同
- 无法在开发环境复现用户的渲染问题

### 2.5. 新 CSS 特性依赖风险

- `content-visibility: auto` 在旧系统上可能不工作，性能优化策略失效
- 其他现代 CSS/Web API 特性无法放心使用
- 需要为不支持的环境编写 fallback，增加维护负担

### 2.6. Agent 运行时与渲染窗口生命周期耦合

当前 Agent 编排、会话推进、工具调用、流式响应处理、定时任务和取消控制等逻辑，实际上运行在前端渲染进程的 JavaScript 运行时中，而不是独立的后端运行时。这带来一组与 WebView2 渲染能力无关、但更影响架构演进的约束：

- **窗口关闭即任务中断**：渲染窗口销毁会直接终止 Agent 任务，无法支持窗口关闭后继续运行、后台执行或稍后恢复。
- **窗口刷新会丢失运行态**：前端热更新、崩溃、刷新或导航都可能重置 Agent 的内存状态和流式处理链路。
- **UI 与 Agent 争用同一运行时**：消息渲染、响应式更新和大文本处理的负载会影响 Agent 的调度、定时器和工具调用，Agent 的稳定性受 UI 性能牵连。
- **多窗口难以共享所有权**：当主窗口、分离窗口或设置窗口都需要观察同一个 Agent 会话时，任务所有权、重复启动和状态同步容易变得复杂。
- **无法独立测试与演进**：Agent 的生命周期、重试、崩溃恢复和并发策略被 Vue 组件树包裹，难以脱离渲染窗口进行集成测试和版本演进。

因此，迁移目标不能只定义为“换一个更可控的 WebView”。还需要建立 **Renderer（UI）—Backend JS Runtime（Agent）** 的明确边界：Agent 任务、会话状态和后台能力由独立的 Node.js/JavaScript 后端运行时持有，渲染窗口只负责展示、发起命令和订阅状态。

---

## 3. 当前架构的 Tauri 耦合度分析

### 3.1. 前端与 Tauri 的耦合点

前端核心逻辑（树状对话、上下文管道、宏引擎、正则管道、撤销系统、富文本渲染器等）大多是纯 Vue/TS 代码，与 Tauri 无关。但 Agent 编排和会话运行目前也放在这个前端运行时中，这部分并不应继续依赖 Vue 组件树或渲染窗口。

**实际耦合点**（迁移时需要改的地方）：

| 耦合类型                 | 示例                  | 替代方案                                  |
| ------------------------ | --------------------- | ----------------------------------------- |
| `invoke()` 调用          | 所有 Tauri Command    | Electron IPC / HTTP                       |
| `@tauri-apps/api/*` 导入 | fs, window, dialog 等 | Electron API / Node.js                    |
| `convertFileSrc()`       | 本地文件 URL 转换     | Electron `file://` 直接可用               |
| `appDataDir` 等路径      | 数据存储路径          | `app.getPath()`                           |
| 窗口管理 API             | 多窗口、分离窗口      | `BrowserWindow`                           |
| 资产协议                 | `asset://`            | Electron `protocol.registerFileProtocol`  |
| 深度链接                 | `aiohub://`           | Electron `app.setAsDefaultProtocolClient` |
| Agent 运行时所有权       | Agent 逻辑位于渲染进程，随窗口销毁 | Node.js 后端运行时 + 类型化 IPC           |
| Agent 状态订阅           | 组件/Store 直接持有任务状态       | 后端会话状态 + Renderer 订阅               |

### 3.2. Rust 后端功能清单（逐模块深度评估）

以下基于对 `src-tauri/src/commands/` 下全部 26 个模块的逐一审查：

#### 🔴 强烈建议保留 Rust（性能远超 JS 或深度依赖原生 API）

| 模块                        | 实现方式                                                         | 为什么保留                                                                                                                                               | Node.js 替代难度 |
| --------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| **knowledge/**              | HNSW + rayon 并行向量计算 + nalgebra SVD + jieba 分词            | 4 个检索引擎（Keyword/Vector/Lens/Blender）包含复杂数学算法（SVD 伪逆、残差挖掘、Tag Anchoring），163KB 精心调优的算法代码。并行计算是实时检索的性能保障 | 🔴 极高          |
| **dir_search.rs**           | `ignore` crate 并行遍历 + `regex` + GBK 编码 + 有界 channel 背压 | 多线程并行文件搜索，ripgrep 级性能。Node.js 单线程 + worker_threads 难以匹敌。背压机制防止 IPC 积压也设计精巧                                            | 🔴 高            |
| **content_deduplicator.rs** | `blake3` 哈希 + `ignore` 遍历 + 规范化流式哈希                   | 漏斗式多层过滤（尺寸→指纹→全文哈希），blake3 的 Rust 实现比 JS 快 5-10x。大目录扫描时差距明显                                                            | 🔴 高            |
| **system_pulse.rs**         | `sysinfo` + `nvml-wrapper` + PDH (Windows 实时 CPU 频率)         | PDH 动态加载 pdh.dll 获取真实睿频频率、NVML 获取 GPU 编解码器利用率。`systeminformation` npm 包无法提供同等精度                                          | 🟡 中高          |
| **ocr.rs**                  | `windows` crate 直接调用 WinRT OCR API                           | 零依赖调用系统 OCR 引擎，无需安装额外软件。Node.js 需要 edge-js 或 PowerShell 子进程，延迟高且不稳定                                                     | 🔴 高            |
| **external_player.rs**      | Win32 API (EnumWindows, SetWindowPos, Z-Order 管理)              | 深度操作窗口句柄、DPI 感知、全屏检测、弹幕覆盖层 Z-Order 吸附。纯 Windows 原生能力，Node.js 无法直接实现                                                 | 🔴 极高          |
| **native_plugin.rs**        | `libloading` 动态库加载 + C ABI 调用                             | 运行时加载 .dll/.so/.dylib 并通过 C ABI 调用函数。Node.js 的 ffi-napi 可替代但稳定性和性能不如                                                           | 🟡 中            |

#### 🟡 可替代但 Rust 有明显优势（建议评估后决定）

| 模块                  | 实现方式                                                   | Rust 优势                                                                                      | Node.js 替代方案                                                                    |
| --------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| **git_analyzer.rs**   | `git2-rs` (vendored libgit2)                               | 无需系统安装 git，流式加载 + 预计算 tag/branch map 性能好。但 vendored libgit2 贡献 ~30MB 包体 | `isomorphic-git` 或 `simple-git`（调用 git CLI）。CLI 方案依赖系统 git 但包体小很多 |
| **directory_tree.rs** | `ignore` crate 并行遍历 + 树构建                           | 并行遍历 + .gitignore 支持 + macOS Spotlight 集成                                              | `fast-glob` + 手动构建树。性能差距在大目录（>10万文件）时明显                       |
| **skill_manager.rs**  | `rayon` 并行扫描 + `serde_yaml` + `ignore` 遍历            | 并行 YAML 解析 + 智能过滤（跳过 node_modules 等）                                              | Node.js `glob` + `js-yaml`，性能差距不大因为 Skill 数量通常有限                     |
| **llmchat_search.rs** | `tokio` 异步并发 + `regex` + 零拷贝 JSON 解析 (`Cow<str>`) | 50 并发度异步 IO + 预过滤跳过 JSON 解析。对大量会话文件有优势                                  | Node.js `Promise.all` + `JSON.parse`，差距取决于会话文件数量                        |
| **window_effects.rs** | `window-vibrancy` crate                                    | 跨平台窗口特效（blur/acrylic/mica/vibrancy）                                                   | Electron 有 `electron-acrylic-window` 或内置 vibrancy 支持                          |

#### 🟢 可安全用 Node.js 重写（无性能顾虑或本身就是 workaround）

| 模块                          | 实现方式                               | 迁移说明                                                                                                                            |
| ----------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **llm_proxy.rs**              | Axum + reqwest 代理服务                | ❌ **迁移后直接删除**。这是 WebView2 限制的 workaround，Electron 的 Node.js 主进程原生支持 HTTP/HTTPS 请求，无 CORS/证书/HTTP1 限制 |
| **llm_inspector.rs**          | Axum 代理 + 请求/响应记录 + SSE 流转发 | ❌ **迁移后直接删除**。同上，Electron 中可用 Node.js http-proxy 实现，或直接在主进程拦截                                            |
| **file_operations.rs**        | `fs_extra` + `trash` + `walkdir`       | Node.js `fs/promises` + `trash` npm + `glob`。功能完全对等                                                                          |
| **asset_manager.rs**          | 文件读写 + 路径管理                    | Node.js `fs` + `path`。纯 IO 操作                                                                                                   |
| **directory_janitor.rs**      | 递归遍历 + 过滤 + trash 删除           | Node.js `fs` + `trash` npm。逻辑简单                                                                                                |
| **ffmpeg_processor.rs**       | 子进程调用 FFmpeg + stderr 进度解析    | Node.js `child_process.spawn` + readline。本质就是进程管理                                                                          |
| **config_manager.rs**         | JSON 配置读写                          | Node.js `fs` + `JSON.parse/stringify`                                                                                               |
| **window_manager.rs**         | Tauri 窗口 API 封装                    | Electron `BrowserWindow` API 直接替代                                                                                               |
| **window_config.rs**          | 窗口配置持久化                         | Electron `electron-store` 或 JSON 文件                                                                                              |
| **clipboard.rs**              | 轮询式剪贴板监听                       | Electron `clipboard` API + 定时器，或 `clipboard-event` npm                                                                         |
| **system.rs**                 | 打开 URL + 获取本地 IP                 | Electron `shell.openExternal` + Node.js `os.networkInterfaces()`                                                                    |
| **canvas_window.rs**          | 画布窗口管理                           | Electron `BrowserWindow`                                                                                                            |
| **sidecar_plugin.rs**         | 子进程管理                             | Node.js `child_process`                                                                                                             |
| **agent_asset_manager.rs**    | Agent 资产文件管理                     | Node.js `fs`                                                                                                                        |
| **media_generator_search.rs** | 文件搜索                               | Node.js `glob` + `fs`                                                                                                               |

#### 📊 总结

| 分类               | 模块数 | 占比 |
| ------------------ | ------ | ---- |
| 🔴 强烈建议保留    | 7      | 26%  |
| 🟡 有优势，可评估  | 5      | 18%  |
| 🟢 可安全重写/删除 | 15     | 56%  |

**关键发现**：

1. **knowledge 是最复杂的模块**：4 个检索引擎（163KB 代码）包含 HNSW 索引、SVD 分解、残差挖掘等高级算法，且依赖 rayon 并行计算保障实时性能。强烈建议保留为 native addon（napi-rs）。详见 [附录 B](./appendix-knowledge-base-analysis.md)。

2. **dir_search 是性能王牌**：多线程并行遍历 + 正则匹配 + 有界 channel 背压机制，这套架构在 Node.js 中很难复刻到同等性能。建议保留为 native addon 或 sidecar。

3. **LLM 代理层确认可删除**：`llm_proxy.rs` 和 `llm_inspector.rs` 合计 ~45KB 代码，全部是 WebView2 限制的 workaround。迁移到 Electron 后这两个模块直接消失。

4. **system_pulse 的 PDH 封装很精巧**：动态加载 pdh.dll 获取实时 CPU 频率和磁盘 IO 速率，这是任务管理器级别的精度。`systeminformation` npm 包做不到这个精度。

5. **external_player 是纯 Windows 原生**：EnumWindows、Z-Order 管理、DPI 感知、全屏检测——这些必须保留为 native addon。

6. **git2 vendored 是包体大户**：~30MB 的 vendored libgit2。如果改用 git CLI 调用，可以显著减小包体，但需要用户系统安装 git。

---

## 4. 可选方案

### 4.1. 方案 A：纯 Electron（长期推荐方向）

```
┌──────────────────────────────────────────────┐
│  Electron                                    │
│  ├── Chromium (前端 Vue 代码不变)            │
│  ├── Node.js 后端运行时                      │
│  │   ├── Agent 编排与会话生命周期            │
│  │   ├── HTTP 请求 (替代 Rust 代理)          │
│  │   ├── 文件系统操作                        │
│  │   ├── 系统信息采集                        │
│  │   └── 窗口管理 / 类型化 IPC               │
│  └── 可选: Native Addon (.node)              │
│      ├── Windows OCR (C++ addon)             │
│      └── 向量搜索 (WASM/native)              │
└──────────────────────────────────────────────┘
```

**优势**：

- 彻底解决所有 WebView2 问题
- 提供独立的 Node.js 后端运行时，Agent 生命周期不再依赖渲染窗口
- 删除 Rust 代理层 → 架构简化
- Node.js 生态覆盖 90%+ 后端需求
- 包体可能反而更小（删掉 git2 vendored 等重型 Rust 依赖）
- 单一技术栈（TS/Node.js），长期维护成本低

**劣势**：

- 迁移工作量中等（后端命令重写）
- Electron 基线内存略高（但 GC 行为可预测）
- 移动端仍需 Tauri（但前端代码共享）

### 4.2. 方案 B：Electron + Rust Sidecar

Electron 主进程/Node.js 后端运行时负责 Agent 编排和通用后端能力，同时保留 Rust 二进制作为子进程承载 knowledge、系统原生能力等模块；Electron 不再只是窗口壳。

**优势**：可以先建立独立的 Agent JS 运行时，且 Rust 后端改动最小

**劣势**：仍维护两套技术栈，Node↔Rust 和 Renderer↔Node 两层进程间通信增加复杂度

### 4.3. 方案 C：Tauri 内缓解（保守方案）

不换引擎，针对性优化：

- 消息列表真虚拟化（替代 content-visibility）
- WebView2 版本锁定（Evergreen Standalone）
- Linux 打包改进（Flatpak 锁定 WebKitGTK）
- 运行时特性检测 + fallback

**优势**：成本最低  
**劣势**：治标不治本，60-70% 解决程度

### 4.4. 方案 D：等待 Tauri + Servo

Tauri 官方有计划支持 Servo 作为替代渲染引擎，但时间线不明确。

**优势**：保持 Tauri 生态
**劣势**：时间不可控，可能遥遥无期

### 4.5. 方案 E：Tauri + CEF（双轨发布，渲染引擎专项方案）

#### 背景发现

> **边界说明**：CEF 只能替换渲染引擎，不能自动提供后端 JavaScript 运行时，也不能解决 Agent 逻辑与渲染窗口生命周期耦合的问题。若选择该方案，仍需额外引入 Node.js sidecar 或其他独立 Agent 进程，并设计新的 IPC 边界；因此“前端、后端、IPC 全部保留，只切换渲染引擎”的零改动假设不再成立。

cef-rs 现在是 **Tauri 官方维护的项目**（[tauri-apps/cef-rs](https://github.com/tauri-apps/cef-rs)），已发布到 crates.io（v141.6.0+141.0.11，累计 35.6 万次下载），且 Tauri 主仓库已有 `feat/cef` 分支可用。

这不再是"第三方实验性绑定"，而是 Tauri 团队正在推进的**官方替代 WebView 方案**。

#### 架构

```
┌──────────────────────────────────────────────────┐
│  Tauri + CEF                                      │
│  ├── Chromium (CEF 141+) ← 替代 WebView2/WebKit  │
│  │   └── 前端 Vue 代码完全不变                    │
│  ├── Rust 后端 ← 完全保留，零改动                 │
│  │   ├── knowledge/ (HNSW/SVD/jieba)             │
│  │   ├── dir_search (并行搜索)                   │
│  │   ├── system_pulse (PDH/NVML)                 │
│  │   └── 所有其他模块                             │
│  ├── Tauri IPC ← invoke() 完全不变               │
│  └── （额外需要）Node.js Agent Runtime sidecar    │
│      └── 与 Renderer 建立独立的会话/任务 IPC       │
└──────────────────────────────────────────────────┘
```

#### 核心策略：双轨发布

由于 CEF 是通过 Cargo feature flag 启用的，同一份代码可以编译出两个版本：

```toml
# tauri.conf.json 或 Cargo.toml 中通过 feature 切换
[dependencies.tauri]
features = ["cef"]  # 启用 CEF 后端
# 不加此 feature → 使用系统 WebView2/WebKitGTK
```

**发布策略**：

| 版本                | 包体预估    | 适用场景                 | 说明                        |
| ------------------- | ----------- | ------------------------ | --------------------------- |
| Standard (WebView2) | ~103 MB     | 追求小体积、系统资源有限 | 现有行为，依赖系统 WebView  |
| CEF Edition         | ~250-300 MB | 追求稳定性、跨平台一致性 | 自带 Chromium，行为完全可控 |

**过渡路线**：

```
Phase 1: CEF 版本作为"实验性"选项提供
         ↓ 收集用户反馈 + 内存/性能对比数据
Phase 2: CEF 版本标记为"推荐"，WebView2 版本降级为"轻量版"
         ↓ 确认 CEF 全面优于 WebView2
Phase 3: 评估是否只发布 CEF 版本（可选，非必须）
```

#### CI/CD 实现

GitHub Actions 并行构建两个版本：

```yaml
strategy:
  matrix:
    webview: [system, cef]
# 产物命名：
# AIOHub-v0.7.0-win-x64.exe          (Standard)
# AIOHub-v0.7.0-win-x64-cef.exe      (CEF Edition)
```

#### 优势

- **渲染层改动较小**：前端、Rust 后端可继续复用，主要切换渲染引擎
- **零风险过渡**：不需要一刀切，用户自行选择版本
- **真实数据驱动**：通过双轨发布收集内存/稳定性对比数据
- **保留全部 Rust 后端**：knowledge、dir_search、system_pulse 等核心模块原封不动
- **统一 Chromium**：CEF 版本彻底解决跨平台渲染不一致
- **版本可控**：不再依赖用户系统的 WebView2 Runtime 版本

#### 劣势与风险

| 风险                | 严重程度 | 说明                                                   |
| ------------------- | -------- | ------------------------------------------------------ |
| 未合入 Tauri 主线   | 🟡 中    | 仍在 `feat/cef` 分支，无明确发布时间线                 |
| CEF 包体大          | 🟡 中    | ~180-220MB Chromium 二进制，但用户可选择 Standard 版本 |
| 内存问题未必解决    | 🔴 高    | Chromium 本身也是内存大户，需实测验证                  |
| CORS/证书限制待验证 | 🟡 中    | CEF 理论上可配置，但需确认 Tauri 层是否暴露了这些选项  |
| LLM 代理层能否删除  | 🟡 中    | 取决于 CEF 模式下 fetch 的限制情况                     |
| Agent 后端运行时      | 🔴 高    | CEF 不提供 Node.js；需额外引入 sidecar 和 IPC         |
| 上游稳定性          | 🟡 中    | 作为新方案，可能有未知 bug                             |

#### 待验证清单

- [ ] 用 `feat/cef` 分支构建当前项目，验证前端能否正常渲染
- [ ] 验证 invoke() 在 CEF 模式下是否正常工作
- [ ] 实测 CEF 模式下的内存表现（对比 WebView2 同等场景）
- [ ] 验证 CEF 模式下 fetch 是否仍有 CORS/证书/HTTP1 限制
- [ ] 测量 CEF 版本的实际包体大小
- [ ] 确认 CEF 模式下窗口特效（vibrancy/acrylic/mica）是否可用
- [ ] 评估 CEF 版本的冷启动时间

---

### 4.6. 方案优先级排序

综合评估后的推荐优先级：

| 优先级 | 方案                  | 改动量 | 风险         | 理由                                   |
| ------ | --------------------- | ------ | ------------ | -------------------------------------- |
| 1️⃣     | **B: Electron + Rust Sidecar** | 中     | 中           | 先建立独立 Node.js Agent 运行时，同时最大限度复用 Rust 后端 |
| 2️⃣     | **A: 纯 Electron**             | 中高   | 中           | 长期统一到 Node.js 后端，彻底解决渲染与 Agent 生命周期耦合 |
| 3️⃣     | E: Tauri + CEF                | 中     | 中高         | 可解决渲染一致性，但不能单独提供 Agent 后端运行时         |
| 4️⃣     | C: Tauri 内缓解               | 低     | 低           | 短期止血，但无法解决 Agent 与窗口生命周期绑定             |
| 5️⃣     | D: Servo                      | 零     | 高           | 遥遥无期，且不直接解决后端运行时边界                       |

**建议执行路径**：先做 Electron + Node.js Agent Runtime 的最小 PoC（可采用方案 B 的 Rust Sidecar 形态，1-2 天工作量），验证渲染窗口关闭/刷新后 Agent 是否仍能运行、重连和恢复状态；随后再决定是走 B 的渐进迁移还是 A 的纯 Electron 收敛。CEF PoC 仍可作为渲染一致性专项验证，但不应替代 Agent 运行时解耦任务。方案 C 的虚拟化等优化可以并行推进，无论最终选哪条路都有价值。

---

## 5. 包体影响评估

当前发布包体（v0.6.1-alpha.2）：

| 平台                | 包体   |
| ------------------- | ------ |
| Windows Portable    | 103 MB |
| Windows Setup       | 71 MB  |
| macOS (x64/aarch64) | ~78 MB |
| Linux AppImage      | 162 MB |
| Linux deb           | 80 MB  |
| Linux Flatpak       | 72 MB  |

Electron 的 Chromium 增量约 80-100MB，但如果删除大量 Rust 依赖（git2 vendored ~30MB、sysinfo、nvml 等），最终包体增幅可能只有 30-50%，完全可接受。

---

## 6. 建议的执行策略

### Phase 0：解耦准备（现在就能做，零风险）

先定义 Renderer 与后端运行时之间的边界，优先把 Agent 从渲染窗口生命周期中抽离：

- 梳理 Agent 的启动、运行、暂停、取消、重试、恢复和销毁状态机
- 定义 `AgentRuntimeBridge` / `AgentSession` 等类型化接口，Renderer 只发送命令并订阅事件
- 明确会话状态的持有者、事件顺序、流式数据背压和断线重连语义
- 将不依赖 DOM 的 Agent 编排代码迁移到可在 Node.js 中运行的模块，暂时保留 Tauri 适配层

同时把所有 `invoke()` 调用抽象到统一的 service 层：

```typescript
// src/services/backend-bridge.ts
export async function callBackend(cmd: string, args: any) {
  // 当前: Tauri invoke
  return await invoke(cmd, args);
  // 将来: Electron IPC 或 HTTP
}
```

这一步在 Tauri 内就能做，不影响任何现有功能，但为将来迁移铺路。

### Phase 1：Electron + Agent Runtime PoC（验证可行性）

搭建最小 Electron 壳和独立 Node.js Agent Runtime，加载 `dist/index.html`，验证：

- 前端 Vue 代码能否直接跑起来
- 窗口管理（多窗口、分离窗口）的迁移难度
- 窗口特效（vibrancy/acrylic）的效果
- 内存表现对比
- 验证关闭/刷新渲染窗口后 Agent 任务继续运行，重新打开窗口后可订阅已有会话
- 验证多窗口同时观察同一 Agent 会话时不会重复启动或丢失状态

### Phase 2：后端命令迁移

按优先级把后端能力迁移到 Node.js：

1. Agent 编排、会话生命周期和工具调用协调（首先建立独立后端运行时）
2. 文件系统操作（最常用）
3. HTTP 请求（删除 Rust 代理）
4. 系统信息采集
5. 其他工具命令

### Phase 3：原生能力处理

- Windows OCR → C++ Native Addon 或保留小型 Rust sidecar
- 向量搜索 → WASM 或 hnswlib-node
- TLS 指纹模拟 → 评估是否仍需要

### Phase 4：清理与发布

- 移除 Tauri 依赖
- 配置 electron-builder
- CI/CD 适配
- 性能基准测试

---

## 7. 待进一步调查的问题

### 7.1. 方案 E (Tauri + CEF) 验证任务

- [ ] 用 `feat/cef` 分支构建当前项目，验证基本可用性
- [ ] 实测 CEF 模式下的内存表现（LLM Chat 长对话场景）
- [ ] 验证 CEF 模式下 fetch 的 CORS/证书/HTTP1 限制情况
- [ ] 测量 CEF 版本的实际包体大小和冷启动时间
- [ ] 确认窗口特效（vibrancy/acrylic/mica）在 CEF 模式下的可用性
- [ ] 跟踪 `feat/cef` 分支合入主线的进度和时间线

### 7.2. 方案 A (Electron) 调查任务

- [ ] 统计项目中所有 `invoke()` 调用点的数量和分布
- [ ] 统计所有 `@tauri-apps/api/*` 的使用情况
- [ ] 评估 Electron 的窗口特效方案（vibrancy/mica）在 Windows 11 上的效果
- [ ] 调研 `systeminformation` npm 包是否能完全替代 `sysinfo` + `nvml`
- [ ] 评估 `nodejieba` 的性能是否满足实时分词需求
- [ ] 调研 Electron 的 `protocol.registerFileProtocol` 能否完美替代 Tauri 的 asset 协议
- [ ] 评估移动端代码共享策略（前端代码如何同时服务 Electron 桌面端和 Tauri 移动端）
- [ ] 调研 Electron Forge vs electron-builder 的选型
- [ ] 内存基准测试：同等场景下 Electron vs WebView2 的内存占用对比
- [ ] 盘点当前 Agent 入口、会话状态、工具调用和定时器，标注所有与 Vue/渲染窗口绑定的代码
- [ ] 设计 Renderer ↔ Node.js Agent Runtime 的类型化 IPC 协议（命令、事件、流式数据、错误和取消）
- [ ] 验证渲染窗口关闭、刷新、崩溃和重连时 Agent 会话的存活与恢复
- [ ] 比较 Electron main process、utility process 和独立 Node.js sidecar 的运行时拓扑与安全边界

### 7.3. 已完成

- [x] ~~调查 `web_distillery` 模块的迁移影响~~ → 见 [附录 A](./appendix-web-distillery-analysis.md)
- [x] ~~调查 CEF-RS 生态现状~~ → 见 [方案 E](#45-方案-etauri--cef双轨发布渲染引擎专项方案)

---

## 8. 风险与注意事项

1. **移动端不受影响**：移动端继续使用 Tauri，只是适配层共享部分类型定义和配置文件，大体上还是独立构建
2. **渐进式迁移**：Phase 0 的解耦工作可以立即开始，不影响当前开发节奏
3. **回退方案**：如果 Electron PoC 效果不理想，Phase 0 的抽象层对 Tauri 架构本身也有益（更好的解耦）
4. **社区因素**：Tauri 社区对 Servo 集成的进展值得持续关注，如果官方方案成熟可能改变决策
5. **CEF 双轨策略的额外收益**：即使 CEF 版本最终不成为默认，双轨发布本身也能帮助定位"某个 bug 是 WebView2 特有还是前端代码问题"，对调试有价值
6. **新增 IPC 复杂度**：Agent 移到后端后，需要处理事件顺序、流式数据背压、断线重连、权限控制和进程崩溃恢复；这些应在 PoC 阶段固化为协议，而不是继续依赖组件生命周期
7. **CEF 不能替代后端 JS 运行时**：选择 Tauri + CEF 时，Node.js sidecar 的包体、启动、升级和通信成本必须单独评估

---

## 9. 附录索引

| 编号                                            | 标题                            | 状态    | 说明                                                           |
| ----------------------------------------------- | ------------------------------- | ------- | -------------------------------------------------------------- |
| [附录 A](./appendix-web-distillery-analysis.md) | web_distillery 模块迁移影响分析 | ✅ 完成 | 确认为最适合作为迁移 PoC 切入点的模块                          |
| [附录 B](./appendix-knowledge-base-analysis.md) | knowledge 模块迁移影响分析      | ✅ 完成 | 确认为必须保留 Rust 的核心模块，推荐 napi-rs Native Addon 方案 |

---

## 10. 变更日志

| 日期       | 变更内容                                                                  |
| ---------- | ------------------------------------------------------------------------- |
| 2025-05-20 | 初始版本：问题陈述、耦合度分析、方案 A-D、执行策略                        |
| 2025-05-20 | 新增附录 A (web_distillery) 和附录 B (knowledge)                          |
| 2026-05-20 | 新增方案 E (Tauri + CEF 双轨发布)，更新方案优先级排序，重组待调查任务列表 |
| 2026-09-14 | 新增 Agent 后端 JavaScript 运行时需求：补充渲染窗口生命周期耦合问题，调整方案评估、优先级和执行策略 |
