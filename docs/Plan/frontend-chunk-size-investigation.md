# 前端 Chunk 体积与 Monaco 装载治理计划

> 状态：P0（Monaco ESM-only）与 P2（Tokenizer 资产化）已完成并通过构建；P1 待实施
>
> 最后更新：2026-07-26
>
> 关联配置：[`vite.config.ts`](../../vite.config.ts)

## 1. 背景

桌面端 `bun run build:vite` 已把 Vite 的 chunk 警告阈值从默认值提高到 1000 kB，但生产构建仍持续报告多个 1–11 MiB 的压缩后 JavaScript chunk。该警告不能通过继续提高阈值解决，需要区分安装产物体积、首页加载成本、按需工具加载成本和构建边界污染。

本计划记录 2026-07-26 的模块级 bundle 分析、生产预览运行态核对和临时分包对照实验，并按优先级推进治理。

## 2. P0 实施前基线

### 2.1 构建与首屏

- 生产构建约转换 13,253 个模块。
- `dist` 总体积约 134 MiB，其中 JavaScript 约 91.68 MiB（gzip 约 30.42 MiB）。
- `index.html` 当前包含主入口和 229 个静态 `modulepreload`，合计 230 个首屏 JavaScript 引用：
  - 原始体积约 6.53 MiB；
  - gzip 约 2.15 MiB。
- 生产预览首页另会主动加载 AMD Monaco：
  - JavaScript 约 3.64 MiB（gzip 约 0.99 MiB）；
  - CSS 约 0.29 MiB（gzip 约 0.10 MiB）。

因此首页在未打开编辑器时已涉及约 10.17 MiB 原始 JavaScript；Tauri 本地资源不承担公网 RTT，但 WebView 仍需读取、解析和编译这些脚本。

### 2.2 超大 chunk 归因

| 类别                  | 主要产物                            |  原始大小 |       gzip | 首页加载 |
| --------------------- | ----------------------------------- | --------: | ---------: | -------- |
| Tokenizer             | 7 个 `@lenml/tokenizer-*` 动态入口  | 36.45 MiB |  14.82 MiB | 否       |
| Monaco ESM 核心       | `editor.api2-*`                     |  3.46 MiB |   0.92 MiB | 否       |
| Monaco ESM Worker     | TS/CSS/HTML/JSON Worker             |  8.66 MiB |   2.03 MiB | 否       |
| Monaco AMD 复制目录   | `dist/npm/monaco-editor@0.55.1/min` | 14.97 MiB | 安装包压缩 | 部分是   |
| PDF Viewer            | `PdfViewer-*`                       |  2.36 MiB |   0.79 MiB | 否       |
| 编辑器手工分包        | `vendor-editor-*`                   |  1.31 MiB |   0.48 MiB | 是       |
| Element Plus 手工分包 | `vendor-element-*`                  |  1.03 MiB |   0.33 MiB | 是       |

### 2.3 Tokenizer 根因

[`src/tools/token-calculator/data/builtin-tokenizer-index.ts`](../../src/tools/token-calculator/data/builtin-tokenizer-index.ts) 通过动态 import 延迟加载七个 `@lenml/tokenizer-*` 包，因此它们不会进入首页 preload；但每个包的 `dist/main.mjs` 都把完整 tokenizer 数据内嵌为单个 JavaScript 模块。

单个模块无法靠 chunk 分组继续拆分。后续应复用现有 [`tokenizerAssetService`](../../src/tools/token-calculator/services/tokenizerAssetService.ts)，把执行引擎和压缩模型资产分离，并评估 AppData、Tauri Resource 或按需下载部署。

七个原始 `tokenizer.json` 合计约 66.51 MiB（gzip 16.37 MiB），不能简单从 JS 改成未压缩 JSON；实施时需要压缩资产、二进制格式或可选下载策略。

### 2.4 Monaco 根因

当前存在两套并行装载路径：

1. 业务源码直接 import `monaco-editor`，由 Vite 生成 ESM 核心和 Worker；
2. `@tomjs/vite-plugin-monaco-editor` 在 HTML 注入 AMD loader/editor 脚本，并复制完整 `min/vs` 目录。

生产预览确认，即使首页未打开编辑器，AMD `loader.js`、`editor.main.js`、`editor.api-*` 和 contribution 脚本已经加载。与此同时，`@guolao/vue-monaco-editor` 的 loader 默认配置并未在仓库中显式指向本地 `vs` 路径，装载边界不一致。

P0 已统一为 ESM-only：

- 移除 `@tomjs/vite-plugin-monaco-editor` 与 AMD HTML 注入/资源复制；
- 建立统一 `MonacoEnvironment.getWorker`；
- 让所有运行时 Monaco import 经过统一模块；
- 给 `@guolao/vue-monaco-editor` 显式注入 ESM Monaco 实例，禁止 CDN fallback；
- 保留现有 NLS alias，并重新验证中文与 source map 警告。

### 2.5 手工分包根因

[`vite.config.ts`](../../vite.config.ts) 当前使用函数式 `manualChunks` 聚合 Vue、Element Plus 和编辑器依赖。模块报告显示：

- `vendor-editor` 除 CodeMirror 外还吸收了 Vue runtime/reactivity 和大量语言包；
- `vendor-element` 包含完整 Element Plus、完整图标入口及其依赖；
- 两者均进入首页 preload。

临时对照实验：

| 配置                        | 首屏 JS 数量 | 原始大小 |     gzip | 最大首屏 chunk |
| --------------------------- | -----------: | -------: | -------: | -------------: |
| 当前 `manualChunks`         |          230 | 6.53 MiB | 2.15 MiB |       1.31 MiB |
| 移除 `manualChunks`         |          240 | 5.61 MiB | 1.82 MiB |       0.81 MiB |
| 临时 `codeSplitting.groups` |          235 | 6.34 MiB | 2.08 MiB |       1.00 MiB |

P1 应先移除现有粗粒度 `manualChunks`，以真实 Tauri 冷启动和主要工具路由为基线，再决定是否引入少量 Rolldown `codeSplitting.groups`。

### 2.6 次要问题

- `PdfViewer` 已正确按需加载，暂不作为首要治理目标。
- 三条 `INEFFECTIVE_DYNAMIC_IMPORT` 涉及的模块自身只有约 4–24 KiB，应清理但不是大 chunk 主因。
- [`src/services/plugin-loader.ts`](../../src/services/plugin-loader.ts) 的 `/plugins/*/*.{vue,js,mjs}` glob 会把 Paddle OCR 的 `download-*.js` Node 脚本纳入浏览器构建，产生 Node builtin externalize 警告；应在 P4 缩窄扫描边界。
- 主窗口 ready 前会通过 [`auto-register.ts`](../../src/services/auto-register.ts) 加载全部 registry；这是启动依赖面问题，计划在 P3 拆分轻量元数据与业务实现。

## 3. 实施优先级

### P0：Monaco ESM-only

验收：

- `dist/npm/monaco-editor@*/min` 不再生成；
- `index.html` 不再注入 `/npm/monaco-editor@*/min/vs`；
- Text Diff 的 Monaco Diff Editor 可见并可编辑；
- Web Canvas、Agent Manager、Quick Action 的直接 Monaco API 编译通过；
- 运行资源中没有 jsDelivr/其他 Monaco CDN 请求；
- `bun run build:tsc`、`bun run build:vite` 通过；
- 真实 Tauri 窄 E2E 通过；
- 记录改造后的 `dist`、首屏和 Monaco 产物体积。

#### P0 实施结果（2026-07-26）

实施内容：

- 新增 [`src/utils/monaco.ts`](../../src/utils/monaco.ts)，集中注册 Editor、JSON、CSS、HTML 和 TypeScript Worker，并统一导出 Monaco ESM API；
- `RichCodeEditor` 将 ESM Monaco 实例注入 `@guolao/vue-monaco-editor` loader，阻断其默认 CDN loader 路径；
- Preset Message Editor、Quick Action、Web Canvas 的运行时 Monaco import 统一改走该模块；其余直接 import 均为 `import type`，不产生运行时代码；
- 移除 `@tomjs/vite-plugin-monaco-editor`、AMD HTML 修补逻辑及依赖；
- 新增 [`tests/tauri-e2e/specs/monaco-smoke.spec.ts`](../../tests/tauri-e2e/specs/monaco-smoke.spec.ts)，验证真实 WebView 中 Monaco Diff Editor、Worker factory 和请求边界。

生产构建结果：

| 指标                   |           P0 前 |           P0 后 |          变化 |
| ---------------------- | --------------: | --------------: | ------------: |
| `dist` 原始体积        |      约 134 MiB |      119.35 MiB | 约 -14.65 MiB |
| JavaScript 原始体积    |       91.68 MiB |       77.32 MiB |    -14.36 MiB |
| JavaScript gzip 合计   |       30.42 MiB |       26.86 MiB |     -3.56 MiB |
| 首屏 JS 引用           |             230 |             230 |          不变 |
| 首屏 JS 原始 / gzip    | 6.53 / 2.15 MiB | 6.53 / 2.15 MiB |          不变 |
| AMD Monaco 复制目录    |       14.97 MiB |        不再生成 |        已移除 |
| 首页额外 AMD Monaco JS |        3.64 MiB |               0 |        已移除 |

P0 不会拆小 Monaco ESM 自身：当前仍生成约 3.46 MiB（gzip 0.92 MiB）的 `editor.api2-*`，以及五个合计约 8.94 MiB（gzip 2.11 MiB）的 Worker。它们属于编辑器路由按需成本，不进入首页 preload。首屏静态引用没有变化，但首页不再额外执行 AMD loader/editor，因此未打开编辑器时的实际 Monaco 装载成本已归零。

验证结果：

- `bun run build:tsc`：通过；
- `bun run build:vite`：通过，13,259 个模块完成转换；
- `dist/npm/monaco-editor@*/min`：不存在；
- `dist/index.html`：无 `/npm/monaco-editor`、jsDelivr 或 `editor.main.nls` 引用；
- 构建日志：未出现 Monaco NLS、缺失 source map、`ENOENT` 或 `Could not load` 警告；
- Tauri 窄 E2E：1 条通过，确认 Text Diff 双编辑区挂载、ESM Worker 可创建，且运行资源中没有 AMD/CDN Monaco 请求。当前本地调试二进制内嵌 dev URL 为 `http://localhost:1520/`，因此本次按 README 使用 `AIO_E2E_FRONTEND_URL` 与其对齐；首次使用默认 1420 的失败发生在 WebView 连接前端阶段，与 Monaco 无关。

仍存在但不属于已完成治理范围的构建警告：Monaco ESM 大 chunk、Paddle OCR 插件 glob 纳入 Node 下载脚本、3 条 ineffective dynamic import、`file-type` 直接 `eval`，以及 public 资源路径提示。Tokenizer 大 chunk 已由 P2 移除。E2E 隔离数据目录没有 `plugins/` 时会记录“插件目录不存在，跳过加载”，属于预期跳过，不是 Native 插件产物加载失败。

### P1：移除粗粒度 `manualChunks`

先以自动分包作为基线，再以实际首屏、路由加载和安装体积决定精细分组。禁止仅为消警告提高 `chunkSizeWarningLimit`。

### ✅ P2：Tokenizer 资产化 — 已完成

将 tokenizer 执行引擎与模型资产分离，复用现有注册表、Worker 和资产服务；内置模型在构建期压缩为独立 gzip 资源，运行时首次使用时按需读取、解压并推送给 Worker。

实施内容：

- 新增 [`builtin-tokenizer-assets-manifest.ts`](../../src/tools/token-calculator/data/builtin-tokenizer-assets-manifest.ts)，统一维护七个内置包到 profile 的资产来源；
- 新增 Vite `aiohub-tokenizer-assets` 插件，从 `@lenml/tokenizer-*` 的 `models/` 目录读取 JSON，在构建期输出 `dist/tokenizers/<profile>/*.json.gz`；开发模式由同一路径中间件提供；
- `tokenizerAssetService` 使用 `fflate` 解压内置 gzip 资源，并复用已有 `needProfileData` / `profileData` 通道；
- 移除 Worker 与主线程对七个 `@lenml/tokenizer-*` 动态 JS 入口的依赖，执行引擎统一通过 `@lenml/tokenizers` 解析 JSON 资产；
- 保留用户导入 / 远端缓存 profile 的读取路径与注册表协议不变。

本次构建实测（2026-07-26）：

- 七个内置 tokenizer 资产：约 15.54 MiB gzip 后静态资源；
- JavaScript：约 40.87 MiB，gzip 合计约 12.05 MiB；相较 P0 后基线约减少 36.45 MiB 原始 JS；
- `dist/assets/` 中不再生成七个 tokenizer 专属大 JS chunk；
- 14 个 gzip 资产逐一解压后与 npm 包源文件字节一致；
- `bun run build:tsc`、Tokenizer engine / gzip 资产读取单测和 `bun run build:vite` 均通过。

### P3：缩小入口和 registry 初始化面

- 根窗口容器按 pathname 异步导入；
- 插件 SDK/UI 暴露与主应用首屏解耦；
- registry 元数据与业务实现分层；
- 非启动必要工具不在 ready 前实例化。

### P4：清理剩余构建边界

- ineffective dynamic import；
- 插件 Node 脚本 glob；
- PDF Viewer 是否需要独立预算；
- 建立首屏 gzip、单 chunk 和总 JS 体积预算检查。

## 4. 参考

- Vite Build Options：<https://vite.dev/config/build-options.html>
- Vite 8 发布说明：<https://vite.dev/blog/announcing-vite8>
- Rolldown Code Splitting：<https://rolldown.rs/in-depth/code-splitting>
