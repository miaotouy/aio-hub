# 附录 A：web_distillery 模块迁移影响分析

**状态**: 调查完成  
**创建日期**: 2025-05-20  
**关联主文档**: [WebView2 瓶颈与引擎迁移调查报告](./webview2-migration-investigation.md)

---

## 1. 模块全景

`src-tauri/src/web_distillery/` 是一个**完整的网页内容提取引擎**，由 3 个 Rust 文件 + 4 个注入脚本组成，暴露 10 个 Tauri Command。

| 文件         | 代码量 | 核心职责                                                           |
| ------------ | ------ | ------------------------------------------------------------------ |
| `proxy.rs`   | 743 行 | Axum 本地代理服务器（绕过 X-Frame-Options/CSP/CORS）               |
| `fetcher.rs` | 251 行 | `wreq` TLS 指纹模拟 HTTP 请求 + 编码检测 + Challenge 检测          |
| `crypto.rs`  | 965 行 | Cookie 加密（DPAPI / Keychain / libsecret + AES-256-GCM）          |
| `inject/`    | 4 文件 | bridge.js / anti-detection.js / api-sniffer.js / resource-proxy.js |

**Rust 依赖**：

- `wreq` 6.0.0-rc.28 + `wreq-util` 3.0.0-rc.11（TLS/H2 指纹模拟，仅此模块使用）
- `axum`（代理服务器，与 llm_proxy 共用）
- `encoding_rs`（多编码支持）
- `aes-gcm`（非 Windows 平台加密）
- `windows` crate（Windows DPAPI）

---

## 2. 子模块详细分析

### 2.1. fetcher.rs — TLS 指纹模拟 HTTP 请求

**功能**：使用 `wreq` 的 `Emulation::Chrome133` 模拟 Chrome 浏览器的完整网络指纹（TLS ClientHello + H2 帧顺序 + Header 顺序），用于绕过 Cloudflare 等 CDN 的 TLS 指纹检测。

**核心能力**：

- Chrome 133 TLS/H2 指纹模拟
- 前端传入的真实浏览器指纹覆盖（UA、Accept-Language、Sec-Ch-Ua 等）
- 智能编码检测（GBK/Big5/EUC-JP/Shift_JIS/EUC-KR）
- Challenge 页面检测（Cloudflare/Turnstile/通用验证码）

**Electron 替代方案**：`net.fetch()` 或 `session.fetch()` 直接使用 Chromium 网络栈，天然就是真实 Chrome 的 TLS 指纹——比模拟更真实。编码检测逻辑用 `iconv-lite` 平移。

### 2.2. proxy.rs — 本地代理服务器

**功能**：在 `127.0.0.1:0`（随机端口）启动 Axum HTTP 代理，用于在 iframe 中加载被安全头保护的第三方网页。

**路由表**：

| 路由                          | 职责                                                         |
| ----------------------------- | ------------------------------------------------------------ |
| `GET /proxy?url=...`          | 获取目标 HTML，剥除安全头，注入脚本                          |
| `ANY /proxy-resource?url=...` | 透传子资源（CSS/JS/图片），绕过 CDN 防盗链                   |
| `GET /__distillery/*.js`      | 返回注入脚本（bridge/sniffer/anti-detection/resource-proxy） |
| `fallback`                    | 反向代理所有未匹配请求到目标 origin（解决 CORS）             |

**核心机制**：

- Cookie Jar：自动累积响应中的 Set-Cookie，后续请求自动携带
- localStorage 注入：在 HTML 中内联 `<script>` 恢复 SPA token
- HTML 注入：`<base href="/">` + 4 个脚本 + 剥除安全头
- 全量反向代理：fallback 路由将页面内的 XHR/fetch 请求透传到目标服务器

**Electron 替代方案**：

- **方案 A（推荐）**：用 `<webview>` 标签或 `BrowserView` 加载目标页面。`session.webRequest.onHeadersReceived()` 剥除安全头，`webContents.executeJavaScript()` 注入脚本，`session.cookies` API 管理 Cookie。
- **方案 B（保守）**：Node.js 版代理服务器（`http-proxy-middleware` 或手写），逻辑平移。

### 2.3. crypto.rs — Cookie 值加密

**功能**：跨平台 Cookie 加密存储，防止敏感身份信息明文落盘。

**平台实现**：

| 平台    | 后端                    | 机制                                                      |
| ------- | ----------------------- | --------------------------------------------------------- |
| Windows | DPAPI                   | `CryptProtectData` / `CryptUnprotectData`（当前用户级别） |
| macOS   | Keychain + AES-256-GCM  | `security` CLI 存取 master key，AES-GCM 加解密            |
| Linux   | libsecret + AES-256-GCM | `secret-tool` CLI 存取 master key，AES-GCM 加解密         |
| 其他    | 无                      | fallback 明文，返回 `available=false`                     |

**数据格式**：

- 加密值：`enc:<base64(ciphertext)>`
- 明文回退：`plain:<原值>`
- 旧格式兼容：无前缀 = 原样返回

**Electron 替代方案**：`electron.safeStorage.encryptString()` / `decryptString()` 跨平台统一 API，底层就是 DPAPI/Keychain/libsecret。代码量从 965 行 → ~30 行。

> **注意**：数据格式需要兼容迁移。现有 `enc:` 前缀的数据需要先用旧方式解密，再用 `safeStorage` 重新加密。

### 2.4. inject/ — 注入脚本层

| 脚本                | 注入时机           | 职责                                                    |
| ------------------- | ------------------ | ------------------------------------------------------- |
| `anti-detection.js` | `<head>` 后同步    | 隐藏 WebView 特征、伪装 Chrome 环境、Hook Tauri IPC     |
| `resource-proxy.js` | `<head>` 后同步    | 重写跨域资源 URL 为代理路径、修复懒加载、Hook fetch/XHR |
| `bridge.js`         | `</body>` 前 defer | 建立 `postMessage` 双向通信桥、Hook SPA 导航            |
| `api-sniffer.js`    | `</body>` 前 defer | Hook XHR/fetch 发现 API 端点                            |

**迁移影响**：这些脚本是纯 JS，运行在目标页面的 window 上下文中。无论用代理方案还是 webContents 方案，都可以原样复用。注入方式从"代理服务器插入 `<script>` 标签"变为 `webContents.executeJavaScript()` 或 preload 脚本。

---

## 3. 前端调用面

前端调用 `distillery_*` 命令共 **18 处**（7 处 .ts + 11 处 .vue）：

| 命令                                 | 调用次数            | 涉及文件                                                                                      |
| ------------------------------------ | ------------------- | --------------------------------------------------------------------------------------------- |
| `distillery_set_proxy_cookies`       | 10                  | actions.ts, iframe-bridge.ts, BrowserToolbar.vue, IdentityPanel.vue, InteractiveWorkbench.vue |
| `distillery_set_proxy_local_storage` | 5                   | iframe-bridge.ts, IdentityPanel.vue, InteractiveWorkbench.vue                                 |
| `distillery_quick_fetch`             | 1                   | actions.ts                                                                                    |
| `distillery_start_proxy`             | 1                   | iframe-bridge.ts                                                                              |
| `distillery_get_proxy_port`          | 1                   | iframe-bridge.ts                                                                              |
| `distillery_check_crypto`            | 1                   | cookie-profile-store.ts                                                                       |
| `distillery_encrypt_cookie_values`   | 1                   | cookie-profile-store.ts                                                                       |
| `distillery_decrypt_cookie_values`   | 1                   | cookie-profile-store.ts                                                                       |
| `distillery_stop_proxy`              | 0（仅 Rust 侧暴露） | —                                                                                             |
| `distillery_get_proxy_cookies`       | 0（仅 Rust 侧暴露） | —                                                                                             |

按 Phase 0 策略收敛到 service 层后，迁移改动点可控。

---

## 4. 迁移后架构对比

```
当前 (Tauri + WebView2):
┌─────────────────────────────────────────────┐
│ WebView2 (前端 Vue)                          │
│   └── <iframe src="http://127.0.0.1:{port}/proxy?url=...">
│         ↕ postMessage                        │
└──────────────┬──────────────────────────────┘
               │ invoke()
┌──────────────▼──────────────────────────────┐
│ Rust 后端                                    │
│  ├── Axum 代理服务器 (proxy.rs)              │
│  │   ├── 剥除安全头                          │
│  │   ├── 注入 4 个 JS 脚本                   │
│  │   ├── Cookie Jar 管理                     │
│  │   └── Fallback 反向代理                   │
│  ├── wreq TLS 指纹模拟 (fetcher.rs)          │
│  └── DPAPI/Keychain/libsecret (crypto.rs)    │
└──────────────────────────────────────────────┘

迁移后 (Electron, 方案 A — webContents):
┌─────────────────────────────────────────────┐
│ Chromium (前端 Vue 代码不变)                  │
│   └── <webview> 或 BrowserView               │
│         ↕ IPC (contextBridge)                │
└──────────────┬──────────────────────────────┘
               │ ipcRenderer.invoke()
┌──────────────▼──────────────────────────────┐
│ Node.js 主进程                               │
│  ├── session.webRequest (剥除安全头)          │  ← 替代 proxy.rs 头处理
│  ├── webContents.executeJavaScript()         │  ← 替代脚本注入
│  ├── net.fetch() (天然 Chrome TLS 指纹)      │  ← 替代 wreq
│  ├── safeStorage (跨平台加密)                │  ← 替代 crypto.rs
│  └── session.cookies API                     │  ← 替代手动 Cookie Jar
└──────────────────────────────────────────────┘
```

---

## 5. 迁移难度评估

| 子模块                        | 难度    | 工作量 | 说明                                                       |
| ----------------------------- | ------- | ------ | ---------------------------------------------------------- |
| `crypto.rs` → `safeStorage`   | 🟢 极低 | 0.5 天 | API 一对一替换，需处理旧数据格式兼容                       |
| `fetcher.rs` → `net.fetch()`  | 🟢 低   | 1 天   | 删除 wreq，编码检测用 `iconv-lite`，Challenge 检测逻辑平移 |
| `proxy.rs` → webContents 方案 | 🟡 中   | 3-5 天 | 架构变化最大，需重新设计 iframe 通信为 webContents IPC     |
| `proxy.rs` → Node.js 代理     | 🟢 低   | 2 天   | 逻辑平移，用 `http-proxy-middleware` 或手写                |
| `inject/` 脚本                | 🟢 极低 | 0.5 天 | 纯 JS 原样复用，仅改注入方式                               |

**总计**：5-8 天（取决于代理方案选择）

---

## 6. 迁移收益量化

| 指标            | 当前                                                    | 迁移后                             |
| --------------- | ------------------------------------------------------- | ---------------------------------- |
| Rust 代码量     | ~2000 行                                                | 0 行（全部删除）                   |
| 重型依赖        | wreq + wreq-util + axum(部分) + aes-gcm + windows crate | 0（Electron 内置能力替代）         |
| TLS 指纹真实度  | 模拟 Chrome 133（可能被识别为模拟）                     | 真实 Chromium（无法区分）          |
| Cookie 加密代码 | 965 行（3 平台分支 + 单元测试）                         | ~30 行（safeStorage 统一 API）     |
| 代理服务器      | 需手动管理生命周期 + 端口分配                           | 可能完全不需要（webContents 方案） |
| 编译时间        | wreq 是编译大户（TLS 库链接耗时）                       | 删除后 Rust 编译显著加速           |
| 包体影响        | wreq + wreq-util 贡献约 5-8MB                           | 删除                               |

---

## 7. 风险与注意事项

### 7.1. webContents 方案的限制

- Electron 的 `<webview>` 标签在某些场景下有已知 bug（内存泄漏、事件丢失）
- `BrowserView` 已在 Electron 30+ 中被标记为 deprecated，推荐使用 `WebContentsView`
- 需要验证 `session.webRequest` 能否完美剥除所有安全头（包括 CSP 的 frame-ancestors）

### 7.2. 数据迁移

- 现有 `enc:` 前缀的加密 Cookie 数据需要迁移脚本：先用旧方式（DPAPI/AES-GCM）解密，再用 `safeStorage` 重新加密
- 如果用户从 Tauri 版升级到 Electron 版，需要一次性迁移流程

### 7.3. net.fetch() 的能力边界

- `net.fetch()` 是否支持自定义 Header 顺序？（当前 wreq 严格控制 Header 顺序以匹配 Chrome 指纹）
- `net.fetch()` 是否支持自定义 Cookie 注入？（当前通过 `request.header("Cookie", ...)` 实现）
- 需要实际测试 `net.fetch()` 对 Cloudflare 的通过率

### 7.4. 代理方案选择的权衡

| 维度       | webContents 方案         | Node.js 代理方案       |
| ---------- | ------------------------ | ---------------------- |
| 架构简洁度 | ⭐⭐⭐ 最简              | ⭐⭐ 中等              |
| 实现难度   | 🟡 中（新 API 学习曲线） | 🟢 低（逻辑平移）      |
| 资源代理   | 需要额外处理跨域资源     | 天然支持（与当前一致） |
| SPA 兼容性 | 需要验证                 | 已验证（当前方案）     |
| 迁移风险   | 🟡 中（架构变化大）      | 🟢 低（行为一致）      |

**建议**：Phase 1 PoC 阶段先用 Node.js 代理方案（风险低、验证快），确认 Electron 整体可行后，Phase 2 再评估是否切换到 webContents 方案。

---

## 8. 结论

**`web_distillery` 是最适合作为迁移 PoC 切入点的模块**，理由：

1. **收益最大**：删除 ~2000 行 Rust + 多个重型 crate，Electron 内置能力完美覆盖
2. **风险最低**：功能边界清晰，不与其他模块共享状态
3. **验证价值最高**：同时验证 Electron 的网络能力（net.fetch）、安全存储（safeStorage）、页面加载（webContents）三大核心能力
4. **前端改动可控**：18 处 invoke 调用，收敛到 service 层后迁移成本很低
5. **独立可测**：可以单独验证蒸馏功能是否正常，不影响其他工具

建议在 Phase 1 Electron PoC 中，以此模块为第一个完整迁移的功能模块。
