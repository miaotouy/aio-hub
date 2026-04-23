# 网页蒸馏室 (Web Distillery) — 架构文档

## 1. 概述

网页蒸馏室是一个多模式网页内容提取工具，设计目标是**高纯度地从任意网页中提炼出有价值的内容**。它同时服务于两个场景：

- **Agent 自动化调用**：通过 `ToolRegistry` 暴露 `quickFetch` / `smartExtract` 两个可被 LLM Agent 直接调用的能力。
- **人工交互操作**：提供可视化的交互式配方编辑器，让用户通过点选元素来定制提取规则，并保存为站点配方复用。

工具采用**三层蒸馏模式**，按能耗和精度递增：

| 模式          | 触发方式         | 特点                            |
| ------------- | ---------------- | ------------------------------- |
| `fast`        | `quickFetch()`   | 纯 HTTP 请求，无浏览器，毫秒级  |
| `smart`       | `smartExtract()` | 隐藏 Iframe + JS 渲染，支持 SPA |
| `interactive` | 交互配方 Tab     | 可视化浏览器视口，人工拾取规则  |

---

## 2. 目录结构

```
src/tools/web-distillery/
├── WebDistillery.vue           # 根组件，5 Tab 容器
├── webDistillery.registry.ts   # 工具注册 + Agent Facade
├── actions.ts                  # 顶层操作 Facade（quickFetch / smartExtract）
├── formatters.ts               # FetchResult → 字符串格式化
├── types.ts                    # 全局类型定义
│
├── core/                       # 核心引擎层
│   ├── iframe-bridge.ts        # Iframe 生命周期 + 双向通信
│   ├── transformer.ts          # 蒸馏管道编排器
│   ├── recipe-store.ts         # 配方持久化 + 匹配
│   ├── action-runner.ts        # 动作序列执行器
│   ├── readability.ts          # Readability 主内容提取
│   ├── builtin-recipes.ts      # 内置配方库
│   └── stages/                 # 蒸馏管道各阶段
│       ├── preprocessor.ts     # 阶段1: HTML 解析
│       ├── metadata-scraper.ts # 阶段2: 元数据提取
│       ├── denoiser.ts         # 阶段3: 噪音过滤
│       ├── extractor.ts        # 阶段4: 主内容提取
│       ├── converter.ts        # 阶段5: 格式转换
│       └── postprocessor.ts    # 阶段6: 后处理组装
│
├── components/                 # UI 组件层
│   ├── DistilleryWorkbench.vue # Tab: 蒸馏工作台
│   ├── RecipeManager.vue       # Tab: 站点配方管理
│   ├── CookieLab.vue           # Tab: 身份卡片
│   ├── ApiSniffer.vue          # Tab: API 嗅探
│   ├── PreviewPanel.vue        # 结果预览面板
│   ├── RecipeEditor.vue        # 配方编辑器
│   ├── BrowserToolbar.vue      # 工作台工具栏
│   └── interactive/            # 交互模式专属组件
│       ├── InteractiveWorkbench.vue # 交互模式主布局
│       ├── InteractiveToolbar.vue   # 浏览器地址栏 + 工具按钮
│       ├── BrowserViewport.vue      # Iframe 挂载容器
│       ├── ToolPanel.vue            # 右侧工具面板（三 Tab）
│       ├── RulesTab.vue             # 提取规则 Tab
│       ├── ActionsTab.vue           # 动作序列 Tab
│       ├── LivePreviewTab.vue       # 实时预览 Tab
│       ├── PickerStatusBar.vue      # 拾取器状态栏
│       └── RecipeMetaDrawer.vue     # 配方保存抽屉
│
├── composables/
│   └── useLivePreview.ts       # 实时预览防抖逻辑
│
├── stores/
│   └── store.ts                # Pinia 全局状态
│
└── inject/
    └── selector-picker.js      # 可视化元素拾取器（按需注入）

src-tauri/src/web_distillery/
├── proxy.rs                    # Axum 本地代理服务器
└── inject/
    ├── bridge.js               # 双向通信桥（注入到被代理页）
    ├── api-sniffer.js          # API 嗅探器（拦截 XHR/fetch）
    └── anti-detection.js       # 反检测层（WebView 指纹伪装）
```

---

## 3. 架构分层图

```
┌─────────────────────────────────────────────────────────────┐
│                    Agent / UI 调用层                         │
│  WebDistilleryRegistry (quickFetch / smartExtract)          │
│  WebDistillery.vue (5 Tab UI)                               │
└──────────────────┬──────────────────────────────────────────┘
                   │ 调用
┌──────────────────▼──────────────────────────────────────────┐
│                    Actions Facade 层                         │
│  actions.ts  →  quickFetch() / smartExtract()               │
│               ↘ processLocalContent() / openDistillery()    │
└────────┬─────────────────────┬───────────────────────────────┘
         │                     │
┌────────▼─────────┐  ┌────────▼────────────────────────────┐
│  Rust 后端层     │  │      前端核心引擎层                  │
│  proxy.rs        │  │  iframe-bridge.ts (Iframe 通信)      │
│  Axum HTTP 代理  │  │  transformer.ts  (蒸馏管道)          │
│  distillery_*    │  │  recipe-store.ts (配方匹配/持久化)   │
│  Tauri commands  │  │  action-runner.ts (动作序列执行)     │
└────────┬─────────┘  └──────────────────────────────────────┘
         │ 注入
┌────────▼─────────────────────────────────────────────────┐
│              被代理网页注入脚本层                         │
│  anti-detection.js → bridge.js → api-sniffer.js          │
│              (在目标页 window 上下文执行)                 │
└──────────────────────────────────────────────────────────┘
```

---

## 4. 后端代理服务器

### 4.1 设计动机

浏览器的同源策略禁止在 Tauri WebView 中直接将第三方网页加载为 `<iframe>`（因为 `X-Frame-Options` / CSP 等安全头会拦截）。蒸馏室通过在 **Rust 侧启动一个本地 Axum HTTP 代理**来绕过这个限制。

代理服务器绑定到 `127.0.0.1:0`（随机端口），端口号通过 Tauri command 返回给前端。

### 4.2 路由

| 路由                                  | 处理函数                   | 职责                                |
| ------------------------------------- | -------------------------- | ----------------------------------- |
| `GET /proxy?url=...`                  | `handle_proxy_html`        | 获取目标 HTML，剥离安全头，注入脚本 |
| `GET /proxy-resource?url=...`         | `handle_proxy_resource`    | 透传 CSS/JS/图片等子资源            |
| `GET /__distillery/bridge.js`         | `handle_bridge_js`         | 返回 bridge.js（含 nonce）          |
| `GET /__distillery/sniffer.js`        | `handle_sniffer_js`        | 返回 api-sniffer.js                 |
| `GET /__distillery/anti-detection.js` | `handle_anti_detection_js` | 返回反检测脚本                      |

### 4.3 HTML 注入策略

代理获取到 HTML 后，执行以下注入：

```
<head> 打开后立即注入（同步执行，必须最先）：
  <base href="计算出的 base URL">
  <script src="/__distillery/anti-detection.js"></script>

</body> 之前注入（defer，避免干扰 React Hydration）：
  <script src="/__distillery/bridge.js" defer></script>
  <script src="/__distillery/sniffer.js" defer></script>
```

同时**剥除**以下响应头，防止 iframe 被拦截：

- `X-Frame-Options`
- `Content-Security-Policy`
- `Content-Encoding` / `Transfer-Encoding`（避免 body 大小不匹配）

### 4.4 Tauri Commands

```rust
distillery_start_proxy()  → u16  // 启动代理，返回端口号
distillery_stop_proxy()          // 优雅关闭
distillery_get_proxy_port() → u16 // 查询当前端口（0 = 未运行）
distillery_quick_fetch(url, options) → RawFetchPayload // 纯 HTTP 抓取
```

---

## 5. 注入脚本层

### 5.1 `anti-detection.js`

**必须最先执行**（同步注入在 `<head>` 打开后）。职责：

1. 隐藏 `window.chrome.webview`（WebView2 特征）和 `window.webkit.messageHandlers`（WKWebView 特征）
2. 将 `navigator.webdriver` 覆盖为 `false`（防 headless 检测）
3. 伪装 `window.chrome` 插件环境（部分反爬会检测 `chrome.runtime`）
4. 延迟隐藏 `__DISTILLERY_BRIDGE__` 等全局变量的可枚举性（`requestIdleCallback` + 500ms 延迟，避开 React Hydration 关键期）

### 5.2 `bridge.js`

在被代理页注入，建立 `window.__DISTILLERY_BRIDGE__` 对象。职责：

- 提供 `window.__DISTILLERY_BRIDGE__.send(payload)` 方法，通过 `window.parent.postMessage` 向父窗口（Tauri WebView）发送消息
- 接收来自父窗口的 `__distillery_eval` 消息，执行注入的 JS 脚本
- 每个 bridge.js 在服务器返回时注入随机 `nonce`，防止脚本重放

### 5.3 `api-sniffer.js`

拦截页面的 `XMLHttpRequest` 和 `fetch`，当检测到 JSON API 响应时，向父窗口发送 `api-discovered` 消息。

### 5.4 `selector-picker.js`

**按需加载**（非预注入）。在用户点击"🎯 拾取"按钮时，通过 [`iframeBridge.enablePicker()`](src/tools/web-distillery/core/iframe-bridge.ts:260) 动态注入。

职责：

- 给鼠标悬停的元素添加高亮边框
- 用户点击时生成 CSS 选择器并通过 bridge 发送 [`element-selected`](src/tools/web-distillery/core/iframe-bridge.ts:140) 消息
- 支持 `include` / `exclude` 两种模式，支持持久高亮同步

---

## 6. Iframe 通信桥 (`IframeBridge`)

[`IframeBridge`](src/tools/web-distillery/core/iframe-bridge.ts:15) 是前端核心单例，管理 Iframe 的完整生命周期。

### 6.1 消息类型

| 消息类型            | 方向        | 含义               |
| ------------------- | ----------- | ------------------ |
| `dom-extracted`     | Iframe → 父 | DOM 快照提取完成   |
| `dom-extract-error` | Iframe → 父 | DOM 提取失败       |
| `api-discovered`    | Iframe → 父 | 发现新 API 请求    |
| `cookies-extracted` | Iframe → 父 | Cookie 提取完成    |
| `element-selected`  | Iframe → 父 | 用户拾取了一个元素 |
| `element-hovered`   | Iframe → 父 | 鼠标悬停元素变化   |
| `picker-cancelled`  | Iframe → 父 | 用户取消拾取       |
| `__distillery_eval` | 父 → Iframe | 执行任意 JS 脚本   |

### 6.2 核心 API

```typescript
iframeBridge.init()                        // 启动代理服务器
iframeBridge.create({ url, container, hidden }) // 创建并加载 Iframe
iframeBridge.evalScript(script)            // 在 Iframe 中执行 JS
iframeBridge.extractDom(waitFor?, timeout?) // 触发 DOM 提取
iframeBridge.extractCurrentDom()           // 提取当前 DOM（不等待）
iframeBridge.waitForDomExtracted(ms)       // 等待 DOM 提取结果（Promise）
iframeBridge.enablePicker(options, cb)     // 启用可视化拾取器
iframeBridge.disablePicker()               // 关闭拾取器
iframeBridge.addHighlight(selector, mode)  // 添加持久高亮
iframeBridge.getCookies()                  // 触发 Cookie 提取
iframeBridge.setCookie(cookieStr)          // 注入 Cookie
iframeBridge.destroy()                     // 销毁 Iframe
iframeBridge.forceCleanup()               // 强制清理（含回调队列）
```

### 6.3 Iframe 沙箱策略

Iframe 设置了 `sandbox="allow-scripts allow-same-origin allow-forms allow-popups"`。

> **安全注意**：同时开启 `allow-scripts` 和 `allow-same-origin` 理论上存在沙箱逃逸风险，但对于蒸馏室的使用场景（需要代理注入脚本 + postMessage 通信）这是必要的。应用层通过 CSP 约束 Tauri WebView 整体行为来作为补偿控制。

---

## 7. 蒸馏管道 (Transformer Pipeline)

[`Transformer.transform()`](src/tools/web-distillery/core/transformer.ts:29) 编排 6 个阶段的清洗流程。每个阶段之间插入 `setTimeout(0)` 让出主线程，避免长时间阻塞 UI。

```
HTML 输入
   │
   ▼ 格式探测（RSS / 文件类型 → 走独立快速通道）
   │
   ▼ 阶段1: Preprocessor
   │   DOMParser 解析 HTML，提取 <script> 内容
   │
   ▼ 阶段2: MetadataScraper
   │   从 JSON-LD、OpenGraph、脚本变量中提取元数据
   │   支持 SiteRecipe.metadataScrapers 自定义规则
   │
   ▼ 阶段3: Denoiser
   │   移除广告、导航栏、侧边栏等噪音 DOM 节点
   │   遵守 recipe.protectedSelectors 白名单
   │
   ▼ 阶段4: Extractor
   │   优先使用 recipe.extractSelectors CSS 选择器
   │   回退：Mozilla Readability 算法自动识别主内容
   │
   ▼ 阶段5: Converter
   │   将 DOM 转换为目标格式：markdown / text / html / json
   │   cleanMode=true 时过滤所有超链接
   │
   ▼ 阶段6: Postprocessor
   │   空白清理、质量评分、组装 FetchResult
   │
   ▼ FetchResult 输出
```

### 特殊快速通道

- **RSS/Atom**：检测到 `<?xml` / `<rss` / `<feed` 开头时直接使用原生 `DOMParser` 解析，质量分强制为 `1.0`
- **文件类型 URL**（`.md`, `.json`, `.js` 等）：跳过 HTML 管道，直接按 MIME 类型包装输出

---

## 8. 配方系统 (Recipe System)

### 8.1 数据结构

```typescript
interface SiteRecipe {
  id: string;
  name: string;
  domain: string; // 精确域名匹配
  pathPattern?: string; // glob 通配符路径匹配
  contentPatterns?: string[]; // 正则，用于本地文件嗅探
  extractSelectors?: string[]; // 包含选择器
  excludeSelectors?: string[]; // 排除选择器
  actions?: ActionStep[]; // 自动化动作序列
  waitFor?: string; // 等待该 CSS 选择器出现后提取
  waitTimeout?: number; // 等待超时（ms）
  cookieProfile?: string; // 绑定的 Cookie 配置
  metadataScrapers?: MetadataScraperRule[]; // 自定义元数据提取规则
  protectedSelectors?: string[]; // 去噪阶段保护名单
  useCount: number; // 使用次数
  disabled?: boolean; // 软删除
}
```

### 8.2 动作步骤类型

```typescript
type ActionStep =
  | { type: "click"; selector: string }
  | { type: "scroll"; selector?: string; distance?: number; toBottom?: boolean }
  | { type: "wait"; value?: number; selector?: string; timeout?: number }
  | { type: "wait-idle"; timeout?: number }
  | { type: "remove"; selector: string }
  | { type: "input"; selector: string; value: string }
  | { type: "hover"; selector: string };
```

### 8.3 匹配优先级

`recipeStore.findBestMatch(url)` 按以下优先级匹配：

1. `domain` + `pathPattern` 精确匹配
2. `domain` 域名匹配（忽略 path）
3. `contentPatterns` 正则内容嗅探（仅用于本地文件）
4. 无匹配 → 返回 `null`，使用纯 Readability 通用提取

---

## 9. 状态管理

[`useWebDistilleryStore`](src/tools/web-distillery/stores/store.ts:60) 是工具的全局 Pinia Store。

### 关键状态分组

| 分组     | 字段                                                            | 说明              |
| -------- | --------------------------------------------------------------- | ----------------- |
| 基础     | `url`, `result`, `isLoading`, `activeTab`                       | 通用状态          |
| 交互模式 | `pickerMode`, `pickerActionIndex`                               | 拾取器当前模式    |
| 交互模式 | `hoveredElement`                                                | 当前悬停元素信息  |
| 配方草稿 | `recipeDraft`, `isDraftDirty`                                   | 正在编辑的配方    |
| 实时预览 | `livePreviewContent`, `livePreviewQuality`, `cachedDomSnapshot` | 预览状态          |
| 发现数据 | `discoveredApis`                                                | API 嗅探结果      |
| WebView  | `isWebviewCreated`                                              | Iframe 是否已就绪 |

### 持久化

通过 [`configManager`](src/tools/web-distillery/stores/store.ts:47) 将 `lastUrl`、`extractionRules`、`defaultFormat` 写入 `AppData/web-distillery/settings.json`。

---

## 10. 数据流图

### 10.1 快速模式 (quickFetch)

```
用户输入 URL
     │
     ▼
actions.quickFetch()
     │
     ▼
invoke("distillery_quick_fetch")  ─── Rust ──→  HTTP GET 目标 URL
     │                                           ↓ 返回 RawFetchPayload
     ▼
recipeStore.findBestMatch(url)    → 查找匹配配方
     │
     ▼
transformer.transform(html, options, recipe, "fast")
     │                                    ↓
     │                            6 阶段蒸馏管道
     ▼
FetchResult → store.setResult() → UI 渲染
```

### 10.2 智能模式 (smartExtract)

```
actions.smartExtract()
     │
     ▼
iframeBridge.init()               → distillery_start_proxy (Rust)
     │                              返回随机端口号
     ▼
创建隐藏 div 容器（position: fixed, left: -9999px）
     │
     ▼
iframeBridge.create({ url, hidden: true, container })
     │         → iframe.src = "http://127.0.0.1:{port}/proxy?url=..."
     │         → 代理拉取 HTML，注入 3 个脚本，返回给 iframe
     │
     ▼
actionRunner.runSequence(recipe.actions)  [如有配方]
     │
     ▼
iframeBridge.extractDom(waitFor?, timeout)
     │         → evalScript → bridge.js → tryExtract()
     │         → 等待 DOM ready + selector 出现
     │         → postMessage({ type: "dom-extracted", html, url, title })
     │
     ▼
iframeBridge.waitForDomExtracted() → 返回 { html, url, title }
     │
     ▼
transformer.transform(html, finalOptions, recipe)
     │
     ▼
ExtractResult → 清理 iframe 和临时容器
```

### 10.3 交互模式通信流

```
InteractiveWorkbench
     │ handleLoadUrl()
     ▼
iframeBridge.create({ url, hidden: false, container: viewportRef })
     │         → iframe 可见，渲染在 BrowserViewport 内
     │
     ▼
[用户点击"🎯 拾取"]
RulesTab → iframeBridge.enablePicker()
     │    → 动态加载 selector-picker.js
     │    → evalScript("window.__distillerySelectorPicker.enable(...)")
     │
     ▼  [用户在 iframe 内点击元素]
selector-picker.js → window.__DISTILLERY_BRIDGE__.send({
                        type: "element-selected",
                        data: { selector, mode }
                     })
     │
     ▼
IframeBridge.handleMessage() → store.recipeDraft 更新
     │
     ▼
BrowserViewport watch(recipeDraft) → iframeBridge.addHighlight(selector, mode)
     │
     ▼
LivePreviewTab → useLivePreview → iframeBridge.extractCurrentDom()
             → transformer.transform() → 实时预览更新
```

---

## 11. UI 组件层

### 根组件 Tab 结构

[`WebDistillery.vue`](src/tools/web-distillery/WebDistillery.vue:49) 通过 Element Plus `el-tabs` 组织 5 个功能区：

| Tab name      | 组件                   | 功能                                  |
| ------------- | ---------------------- | ------------------------------------- |
| `workbench`   | `DistilleryWorkbench`  | 快速/智能模式输入、结果预览、源码查看 |
| `interactive` | `InteractiveWorkbench` | 可视化配方编辑器                      |
| `recipes`     | `RecipeManager`        | 配方 CRUD、导入导出                   |
| `cookies`     | `CookieLab`            | Cookie 配置管理                       |
| `sniffer`     | `ApiSniffer`           | 已嗅探 API 列表                       |

### 交互工作台布局

```
InteractiveWorkbench
├── InteractiveToolbar          (地址栏、刷新、保存、Cookie、API 按钮)
├── .workbench-body
│   ├── .main-viewport-container
│   │   ├── BrowserViewport    (iframe 挂载点)
│   │   └── PickerStatusBar    (悬停元素实时信息)
│   └── ToolPanel              (右侧可调宽面板)
│       ├── RulesTab           (include/exclude 选择器管理)
│       ├── ActionsTab         (动作序列编排)
│       └── LivePreviewTab     (提取结果实时预览)
├── RecipeMetaDrawer            (保存配方元信息)
├── BaseDialog: CookieLab       (弹窗形式)
└── BaseDialog: ApiSniffer      (弹窗形式)
```

---

## 12. Agent 集成

[`WebDistilleryRegistry`](src/tools/web-distillery/webDistillery.registry.ts:7) 实现 `ToolRegistry` 接口，暴露两个 `agentCallable: true` 的方法：

| 方法           | 适用场景                  | 关键参数                      |
| -------------- | ------------------------- | ----------------------------- |
| `quickFetch`   | 静态页、博客、API 文档    | `url`, `format`, `cleanMode`  |
| `smartExtract` | SPA、动态内容、登录后页面 | `url`, `waitFor`, `cleanMode` |

两个方法都将结果通过 [`formatFetchResult()`](src/tools/web-distillery/formatters.ts) 格式化为 Markdown 字符串返回给 Agent。

---
