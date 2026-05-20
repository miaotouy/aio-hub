# CEF 集成实操指南

**状态**: Implementing (feat/cef-integration 分支)  
**创建日期**: 2026-05-20  
**作者**: 咕咕  
**前置文档**: [WebView2 瓶颈与引擎迁移调查报告](./webview2-migration-investigation.md)

---

## 1. 调查结论

Tauri 官方的 `feat/cef` 分支已经提供了完整的 CEF 集成方案，且非常活跃（最近一次提交 4 天前）。核心维护者 lucasfernog 在积极推进。

**关键发现**：

| 项目          | 详情                                                             |
| ------------- | ---------------------------------------------------------------- |
| 分支          | `tauri-apps/tauri` 的 `feat/cef` 分支 (commit `d9bc695c`)        |
| 领先 dev      | 286 commits ahead, 9 commits behind                              |
| CEF 版本      | 148.0.0+147.0.10 (Chromium 147)                                  |
| Tauri 版本    | 2.11.1 (分支上)                                                  |
| Rust 版本要求 | **1.88+** (edition 2024)                                         |
| 类型别名      | `tauri::Cef` = `tauri_runtime_cef::CefRuntime<EventLoopMessage>` |
| 入口点宏      | `#[tauri_macros::cef_entry_point]`                               |
| 插件兼容      | `tauri-plugin-log` 需要从 plugins-workspace 的 feat/cef 分支引用 |

---

## 2. 架构概览

### 2.1. CEF 多进程模型

```
┌─────────────────────────────────────────────────────┐
│  主进程 (Browser Process)                            │
│  ├── Tauri App (我们的 Rust 后端)                    │
│  ├── tauri-runtime-cef (替代 tauri-runtime-wry)      │
│  └── CEF Browser Host                               │
├─────────────────────────────────────────────────────┤
│  渲染进程 (Render Process) ← tauri-cef-helper        │
│  ├── V8 JavaScript 引擎                             │
│  ├── window.ipc.postMessage (注入的 IPC 桥)          │
│  └── 前端 Vue 代码运行在这里                         │
├─────────────────────────────────────────────────────┤
│  GPU 进程 (自动管理)                                 │
│  Utility 进程 (自动管理)                             │
└─────────────────────────────────────────────────────┘
```

### 2.2. IPC 通信链路

```
前端 invoke()
  → window.__TAURI_INTERNALS__.invoke()
    → window.ipc.postMessage(JSON)     ← CEF Helper 注入
      → CEF IPC (ProcessMessage)       ← 跨进程
        → Browser Process
          → Tauri Command Handler      ← 我们的 Rust 命令
```

---

## 3. 集成步骤（独立目录 Clone 方案）

### 3.1. 环境准备

```powershell
# 确认 Rust 版本 >= 1.88（当前 stable 1.95.0 已满足）
rustup update
rustc --version
```

> ✅ 当前 Rust stable 1.95.0 已远超 1.88 要求，无需 nightly。

### 3.2. Clone Tauri feat/cef 分支

```powershell
# 在项目外的目录操作
cd E:\rc20\allinweb

# 浅克隆 feat/cef 分支（只取最近历史，节省空间）
git clone --depth 50 --branch feat/cef https://github.com/tauri-apps/tauri.git tauri-cef

# 同时克隆 plugins-workspace 的 feat/cef 分支
git clone --depth 50 --branch feat/cef https://github.com/tauri-apps/plugins-workspace.git tauri-plugins-cef
```

### 3.3. 修改项目 Cargo.toml

在 `src-tauri/Cargo.toml` 中进行以下修改：

#### 3.3.1. 修改 tauri 依赖的 features

```toml
[dependencies]
# 原来:
# tauri = { version = "2", features = ["protocol-asset", "wry", "tray-icon", "image-png", "devtools"] }
# 改为:
tauri = { version = "2", default-features = false, features = [
  "protocol-asset",
  "cef",           # ← 替换 wry
  "tray-icon",
  "image-png",
  "devtools",
  "compression",
  "common-controls-v6",
  "dynamic-acl",
] }
```

#### 3.3.2. 添加 patch section

```toml
[patch.crates-io]
# 指向本地克隆的 feat/cef 分支
tauri = { path = "../../tauri-cef/crates/tauri" }
tauri-build = { path = "../../tauri-cef/crates/tauri-build" }
tauri-runtime = { path = "../../tauri-cef/crates/tauri-runtime" }
tauri-runtime-wry = { path = "../../tauri-cef/crates/tauri-runtime-wry" }
tauri-utils = { path = "../../tauri-cef/crates/tauri-utils" }
tauri-macros = { path = "../../tauri-cef/crates/tauri-macros" }
tauri-codegen = { path = "../../tauri-cef/crates/tauri-codegen" }
tauri-plugin = { path = "../../tauri-cef/crates/tauri-plugin" }

# 插件也需要 patch
tauri-plugin-log = { path = "../../tauri-plugins-cef/plugins/log" }
```

> **注意**: 路径是相对于 `src-tauri/Cargo.toml` 的位置。根据实际 clone 位置调整。

#### 3.3.3. 或者使用 Git 引用（无需本地 clone）

```toml
[patch.crates-io]
tauri = { git = "https://github.com/tauri-apps/tauri.git", branch = "feat/cef" }
tauri-build = { git = "https://github.com/tauri-apps/tauri.git", branch = "feat/cef" }
tauri-runtime = { git = "https://github.com/tauri-apps/tauri.git", branch = "feat/cef" }
tauri-runtime-wry = { git = "https://github.com/tauri-apps/tauri.git", branch = "feat/cef" }
tauri-utils = { git = "https://github.com/tauri-apps/tauri.git", branch = "feat/cef" }
tauri-macros = { git = "https://github.com/tauri-apps/tauri.git", branch = "feat/cef" }
tauri-codegen = { git = "https://github.com/tauri-apps/tauri.git", branch = "feat/cef" }
tauri-plugin = { git = "https://github.com/tauri-apps/tauri.git", branch = "feat/cef" }
tauri-plugin-log = { git = "https://github.com/tauri-apps/plugins-workspace.git", branch = "feat/cef" }
```

### 3.4. 修改 Rust 代码

#### 3.4.1. `src-tauri/src/lib.rs` - Runtime 类型切换

```rust
// 第 414 行附近，将:
let mut builder = tauri::Builder::<tauri::Wry>::default();

// 改为条件编译:
#[cfg(feature = "cef")]
let mut builder = tauri::Builder::<tauri::Cef>::default();
#[cfg(not(feature = "cef"))]
let mut builder = tauri::Builder::<tauri::Wry>::default();
```

> **注意**: 由于我们在 Cargo.toml 中直接启用了 `cef` feature 而非 `wry`，实际上只需要改为 `tauri::Cef` 即可。条件编译是为了将来双轨发布准备的。

#### 3.4.2. `src-tauri/src/main.rs` - CEF 入口点

CEF 需要特殊的入口点处理（多进程架构）。查看是否需要添加 `#[tauri::cef_entry_point]` 宏：

```rust
// 如果 main.rs 当前是:
fn main() {
    aio_hub_lib::run();
}

// CEF 模式下可能需要改为:
#[cfg(feature = "cef")]
#[tauri::cef_entry_point]
fn main() {
    aio_hub_lib::run();
}

#[cfg(not(feature = "cef"))]
fn main() {
    aio_hub_lib::run();
}
```

### 3.5. CEF Helper 二进制

CEF 的多进程架构需要一个辅助二进制。有两种方式：

#### 方式 A: 使用 Tauri 提供的 cef-helper（推荐）

从 `tauri-cef/cef-helper/` 目录构建 helper 二进制，并将其放到应用的资源目录中。

```powershell
cd E:\rc20\allinweb\tauri-cef\cef-helper
cargo build --release
```

#### 方式 B: 在项目中添加 helper binary

在 `src-tauri/Cargo.toml` 中添加：

```toml
[[bin]]
name = "aiohub-helper"
path = "src/cef_helper.rs"
```

创建 `src-tauri/src/cef_helper.rs`：

```rust
fn main() {
    tauri::run_cef_helper_process();
}
```

### 3.6. CEF 二进制分发

CEF 需要 Chromium 的预编译二进制文件。`cef-dll-sys` crate 的 build script 会自动下载。

**预期下载内容**（首次编译时）：

- CEF 预编译框架 (~200-300MB)
- 包含 `libcef.dll` (Windows) / `Chromium Embedded Framework.framework` (macOS)

---

## 4. 已知的兼容性问题

### 4.1. 需要确认的插件兼容性

| 插件                             | 状态          | 说明                              |
| -------------------------------- | ------------- | --------------------------------- |
| `tauri-plugin-log`               | ⚠️ 需要 patch | 官方已有 feat/cef 分支            |
| `tauri-plugin-opener`            | ❓ 待验证     | 可能不需要 patch                  |
| `tauri-plugin-deep-link`         | ❓ 待验证     | CEF runtime 已实现 deep link 支持 |
| `tauri-plugin-dialog`            | ❓ 待验证     |                                   |
| `tauri-plugin-clipboard-manager` | ❓ 待验证     |                                   |
| `tauri-plugin-fs`                | ❓ 待验证     |                                   |
| `tauri-plugin-http`              | ❓ 待验证     |                                   |
| `tauri-plugin-global-shortcut`   | ❓ 待验证     |                                   |
| `tauri-plugin-os`                | ❓ 待验证     |                                   |
| `tauri-plugin-single-instance`   | ❓ 待验证     |                                   |

### 4.2. 我们代码中的潜在问题

| 位置                          | 问题                    | 解决方案                             |
| ----------------------------- | ----------------------- | ------------------------------------ |
| `lib.rs:414`                  | `tauri::Wry` 硬编码     | 改为 `tauri::Cef`                    |
| `lib.rs:256`                  | `app.webview_windows()` | CEF 应该兼容，待验证                 |
| `window-vibrancy`             | 窗口特效                | CEF 窗口是否支持 vibrancy 待验证     |
| `commands/window_effects.rs`  | `apply_window_effect`   | 依赖 raw window handle，CEF 应该提供 |
| `commands/external_player.rs` | Win32 窗口操作          | 与 WebView 无关，应该不受影响        |

### 4.3. Rust Edition 2024 兼容性

feat/cef 分支使用 `edition = "2024"`，我们当前使用 `edition = "2021"`。这不应该造成冲突（edition 是 per-crate 的），但需要确认 Rust 1.88+ 的可用性。

---

## 5. 验证清单

构建成功后，按以下顺序验证：

- [ ] **基本渲染**: 前端 Vue 页面能否正常显示
- [ ] **IPC 通信**: `invoke()` 调用是否正常工作
- [ ] **窗口管理**: 多窗口创建、分离窗口是否正常
- [ ] **窗口特效**: vibrancy/acrylic/mica 是否可用
- [ ] **DevTools**: 开发者工具是否可打开
- [ ] **内存表现**: 对比 WebView2 同等场景的内存占用
- [ ] **CORS/证书**: fetch 请求是否仍有限制
- [ ] **文件协议**: `asset://` 协议是否正常工作
- [ ] **Deep Link**: `aiohub://` 协议是否正常
- [ ] **系统托盘**: 托盘图标和菜单是否正常
- [ ] **冷启动时间**: 对比 WebView2 版本
- [ ] **包体大小**: 最终产物的体积

---

## 6. 风险评估

| 风险                      | 严重程度  | 缓解措施                                    |
| ------------------------- | --------- | ------------------------------------------- |
| ~~Rust 1.88 尚未 stable~~ | ✅ 已解决 | 当前 stable 1.95.0 已满足                   |
| 插件不兼容                | 🟡 中     | 逐个验证，必要时 patch                      |
| CEF 下载慢/失败           | 🟡 中     | 配置代理（本地 7897），或手动放置预编译文件 |
| 内存问题未解决            | 🔴 高     | Chromium 本身也是内存大户，需实测           |
| 窗口特效不可用            | 🟡 中     | CEF 使用原生窗口，理论上应该支持            |
| feat/cef 分支不稳定       | 🟡 中     | 锁定特定 commit (d9bc695c)，不跟踪 HEAD     |

---

## 7. 目录结构建议

```
E:\rc20\allinweb\
├── all-in-one-tools/          ← 我们的项目 (feat/cef-integration 分支)
│   └── src-tauri/
│       └── Cargo.toml         ← 添加 [patch.crates-io]
├── tauri-cef/                 ← Tauri feat/cef 分支 clone
│   ├── crates/
│   │   ├── tauri/
│   │   ├── tauri-runtime/
│   │   ├── tauri-runtime-cef/
│   │   └── ...
│   └── cef-helper/
└── tauri-plugins-cef/         ← Plugins feat/cef 分支 clone
    └── plugins/
        └── log/
```

---

## 8. 快速开始脚本

```powershell
# === 一键准备 CEF 集成环境 ===

$baseDir = "E:\rc20\allinweb"

# 1. 确认 Rust 版本
Write-Host "当前 Rust: $(rustc --version)"

# 2. Clone Tauri feat/cef（锁定 commit d9bc695c）
if (-not (Test-Path "$baseDir\tauri-cef")) {
    Write-Host "正在克隆 Tauri feat/cef 分支..."
    git clone --depth 50 --branch feat/cef https://github.com/tauri-apps/tauri.git "$baseDir\tauri-cef"
}

# 3. Clone Plugins feat/cef
if (-not (Test-Path "$baseDir\tauri-plugins-cef")) {
    Write-Host "正在克隆 Plugins feat/cef 分支..."
    git clone --depth 50 --branch feat/cef https://github.com/tauri-apps/plugins-workspace.git "$baseDir\tauri-plugins-cef"
}

Write-Host "✅ 环境准备完成"
Write-Host "下一步: 修改 src-tauri/Cargo.toml 后执行 cargo build"
```

---

## 9. 变更日志

| 日期       | 变更内容                                   |
| ---------- | ------------------------------------------ |
| 2026-05-20 | 初始版本：完整调查结果、集成步骤、验证清单 |
