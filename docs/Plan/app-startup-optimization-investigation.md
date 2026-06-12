# 应用启动性能优化调查报告

> 日期:2026-06-12
> 范围:桌面端主窗口启动全链路(Rust setup → WebView → JS 解析 → Vue mount → `initMainApp` → MainLayout 首帧)
> 依据:源码走查 + `dist/`(2026-06-11 构建,v0.6.3-alpha.6)产物量化 + AppData 日志中 4 次真实启动的分步耗时
> 性质:调查报告,不含代码改动

## 实施记录

### 2026-06-12 第一轮实施

已开始落地阶段一的低风险启动优化,当前实际改动如下:

- `monacoShikiSetup.ts` 去除顶层 `stream-monaco` 静态导入,改为 `initMonacoShikiThemes()` 内动态导入;`initMainApp`/`initDetachedApp` 不再在首帧前等待 Monaco/Shiki 主题预热,改为 ready 后后台任务。
- `preset-icons.ts` 中 Lobe 图标从 `?raw` 改为 `?url`,避免 834 个 SVG raw 字符串内联进启动 chunk;同步调整 `useThemeAwareIcon` 按 URL 拉取并处理 SVG。
- `vite.config.ts` 的 `vendor-vue` 分包规则从 `id.includes("vue")` 改为精确匹配 Vue/Pinia 包名,避免 Shiki 语法、`@vue-flow`、`vuedraggable` 等懒资源被误并入启动必载 vendor。
- `appInitStore.ts` 主窗口首帧前只等待设置、日志配置、主题和工具/插件注册;模型元数据、用户档案、启动项、分离窗口管理、同步总线和编辑器主题初始化均改为 ready 后后台任务。
- `auto-register.ts` 的剩余工具注册从串行 `for-await` 改为 `Promise.allSettled` 并发加载,保留失败模块收集和插件加载/排序/ready 的收尾流程。

与原计划/后续计划的差异:

- P0-2 在本文后续已标注升级为 `stream-monaco-removal-plan.md` 的整体移除方案。本轮没有执行完整移除,只先实施阶段一的"动态 import + 不阻塞首帧"方案;完整删除 `stream-monaco`、`shiki`、MonacoSourceViewer 和设置项仍以单独计划为准。
- P2-8 的 AMD Monaco `editor.main.nls.js` 404 / defer 处理尚未落地,需继续确认 `@tomjs/vite-plugin-monaco-editor` 可用配置或改为后续统一 ESM Monaco 时一并处理。

验证结果:

- `bun run build:tsc` 通过。
- `bun run build:vite` 通过。构建后 `dist/index.html` 直连资源约 **10.97 MiB / 190 个文件**,较调查基线 **17.5 MiB / 145 个文件** 下降约 **6.5 MiB**。
- 直连资源 Top 中已不再出现 `editor.api2-*.js`;旧 `vendor-vue` 的 3.95 MiB 误并问题回落到约 **112 KiB**。
- 当前最大残留为 `main` 约 **4.0 MiB**、`vendor-editor` 约 **1.38 MiB**、`docxParser` 约 **802 KiB**、`AudioPlayer` 约 **302 KiB**。构建日志继续报告 `src/services/plugin-ui.ts` 对工具 registry 的静态导入导致 `auto-register.ts` 动态导入无效,说明阶段二 P0-1 仍是下一步最大收益点。

### 2026-06-12 第二轮实施

继续落地阶段二 P0-1 和阶段一 P2-8 的低风险部分,当前实际改动如下:

- `plugin-ui.ts` 去除通用组件和工具 registry 的 `{ eager: true }`;`components` map 仍同步导出,但值改为 `defineAsyncComponent` 包装的异步组件。
- 通用组件名继续从 `src/components/common/*.vue` 文件名推导;工具组件名继续从 `src/tools/{toolId}/{toolId}.registry.ts` 的目录名推导,首次渲染对应插件组件时再动态导入 registry 并读取 `toolConfig.component`。
- `vite.config.ts` 新增 `monaco-remove-missing-nls-script` post HTML transform,移除 `@tomjs/vite-plugin-monaco-editor` 注入的 `editor.main.nls.js` 脚本行,消除产物中的固定 404。

与原计划/后续计划的差异:

- P0-1 原设想是"异步读取 registry 后按 `toolConfig.component` 包装";实际实现为了保持 `window.AiohubUI.components` 的同步可枚举契约,组件名仍必须从路径推导,只把 registry 模块内容延迟到组件首次渲染时读取。
- P2-8 本轮只移除了缺失的 nls 脚本。`@tomjs/vite-plugin-monaco-editor` 本地文档未提供 `defer`/脚本属性配置项;直接改 defer 会改变 AMD Monaco 与入口 module 的执行时序,暂不纳入本轮。
- 构建产物仍会将大量动态 import 写入 `index.html` 的 `modulepreload`;因此 P0-1 的首轮收益主要体现为入口 chunk 执行体积下降和 registry 不再由 `plugin-ui` 同步求值,并未把 HTML 直连资源总量继续压到阶段二目标。后续若要继续压直连请求,需要单独评估 Vite/Rolldown 的 modulepreload 策略或拆出更晚才可达的插件 UI 目录入口。

验证结果:

- `bun run build:tsc` 通过。
- `bun run build:vite` 通过。
- 构建后 `dist/index.html` 不再包含 `editor.main.nls.js`;仍保留 `loader.js` 与 `editor.main.js`。
- 构建后 `main` chunk 约 **606 KiB**,较第一轮记录的约 **4.0 MiB** 明显下降;`dist/index.html` 直连资源约 **10.5 MiB / 215 个文件**。
- 构建日志中已不再出现 `src/services/plugin-ui.ts` 对工具 registry 的静态导入导致 `auto-register.ts` 动态导入无效的提示;仍有若干 `INEFFECTIVE_DYNAMIC_IMPORT` 提示来自其他组件/工具的真实静态引用,属于后续拆分范围。

## 结论先行

当前启动耗时由两段构成,**两段的主导因素都已定位**:

1. **空窗期(进程启动 → 窗口可见)**:主窗口以 `visible(false)` 创建,直到 Vue `app.mount()` 完成才 `show()`(`src/main.ts:180-191`)。而 mount 之前必须下载并解析 **17.5 MiB / 145 个文件** 的 JS+CSS(`dist/index.html` 实测,入口 + 128 个 modulepreload + 15 个 CSS)。这段时间用户看不到任何窗口,`index.html` 里精心做的内联 loading 动画在主窗口流程中**永远不可见**。
2. **加载期(窗口可见 → MainLayout 首帧)**:`appInitStore.initMainApp()` 是 10 步纯串行瀑布,实测 **1.22–1.48s**(4 次启动),其中约 0.9–1.1s 来自三类本不必阻塞首帧的工作:全量工具注册(414–527ms)、用户启动项任务(377–481ms)、Monaco/Shiki 语法预热(135–190ms)。

   17.5 MiB 静态载荷的归因(按大小排序),**前四项合计约 12 MB,全部是"本应懒加载却被静态链入入口"的资源**:

| 占比 | chunk                                                                                                                    | 大小             | 根因                                                                                                                                                                                               |
| ---- | ------------------------------------------------------------------------------------------------------------------------ | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 22%  | `vendor-vue`                                                                                                             | 3.95 MB          | `manualChunks` 用 `id.includes("vue")` 匹配(`vite.config.ts:196`),把 **Shiki 的 vue/vue-html/vue-vine 语法文件、@vue-flow、sortablejs** 等仅被懒加载代码使用的包,强行并入入口必载的 vendor chunk   |
| 20%  | `editor.api2`                                                                                                            | 3.63 MB          | ESM 版完整 Monaco。`appInitStore.ts:13` → `monacoShikiSetup.ts:14` 顶层静态 `import { registerMonacoThemes } from "stream-monaco"`,而 stream-monaco 顶层 `import * as monaco from "monaco-editor"` |
| 13%  | `model-metadata`                                                                                                         | 2.34 MB          | `preset-icons.ts:13` 用 `{ eager: true, query: "?raw" }` 内联 **834 个 lobehub SVG 全集**                                                                                                          |
| 10%  | `main`(入口)                                                                                                             | 1.89 MB          | `main.ts` 全量导入 Element Plus、全部 EP 图标、plugin-sdk/plugin-ui 并挂到 `window`;`MainLayout` 被 `App.vue:9` 静态导入                                                                           |
| 7%   | `vendor-editor`                                                                                                          | 1.23 MB          | codemirror + @guolao/vue-monaco-editor,经 common 组件(RichCodeEditor/DocumentViewer)被 **plugin-ui 的 eager glob** 拖入                                                                            |
| 8%   | `vendor-element`+CSS                                                                                                     | 1.16 MB + 355 KB | `main.ts:7,94` 全量 `app.use(ElementPlus)`(为插件 shim 契约服务)                                                                                                                                   |
| ~12% | docxParser 802KB、macro-engine 329KB、AudioPlayer 301KB、katex 257KB、markdown-it、jszip、llmChatStore、各工具 registry… | ~2.2 MB          | **`plugin-ui.ts:24` 对全部 38 个工具 registry 做 `import.meta.glob(..., { eager: true })`**,连同 `plugin-ui.ts:10` 对 25 个 common 组件的 eager glob,把大半个工具集的逻辑代码静态编入入口          |

此外存在一个**双份 Monaco**问题:除上述 ESM Monaco 外,`@tomjs/vite-plugin-monaco-editor`(`vite.config.ts:116`)还在 `<head>` 注入 3 个同步 AMD `<script>`(loader.js + editor.main.nls.js + editor.main.js)和 309 KB 渲染阻塞 CSS,供 @guolao 包装器使用;其中 **`editor.main.nls.js` 在产物中不存在,每次启动都是一次 404**。

预期收益(详见分阶段建议):

- 阶段一(低风险)后:启动载荷 17.5 MiB → 约 11–12 MB,`initMainApp` 1.2–1.5s → **0.4–0.6s**;
- 阶段二(结构治理)后:启动载荷 → **约 3.5–4.5 MB(-75%)**,空窗期随解析量等比缩短(WebView2 冷启收益最大);
- dev 模式同样受益:eager glob 在 Vite dev 下意味着首屏数千个模块请求,去 eager 后 `tauri dev` 首屏将明显加快。

---

## 一、启动链路全景

```
[Rust] main.rs → lib.rs run()
  ├─ 同步读 settings.json / window-configs.json        (轻量,~ms)
  ├─ setup():
  │   ├─ AssetCatalog::initialize() 同步逐行读 JSONL    (lib.rs:821, 量随资产数增长)
  │   ├─ 创建主窗口 visible(false)                      (lib.rs:844)
  │   └─ 托盘 / 全局鼠标钩子
  ▼
[WebView2] 加载 index.html
  ├─ <head> 同步 AMD Monaco: loader.js + nls(404!) + editor.main.js + 309KB CSS
  ├─ 内联 splash(主窗口不可见 → 用户看不到)
  └─ <script type="module" main.ts> → 下载+解析 17.5MiB 静态图(145 文件)
  ▼
[main.ts] 模块求值: 全量 EP/图标/SDK 挂 window → createApp → mount
  └─ mount 完成后 getCurrentWindow().show()             ← 窗口首次可见
  ▼
[App.vue] LoadingScreen 显示, onMounted → initMainApp() ← 实测 1.22–1.48s, 纯串行:
  10% 设置加载 → 15% 日志 → 20% 模型元数据(~146ms) → 25% 主题(~1ms)
  → 30% Monaco/Shiki 23 种语言预热(135–190ms, await!)
  → 40% autoRegisterServices: 38 个 registry 串行 for-await(414–527ms)
  → 70% 用户档案(~55ms) → 80% 启动项任务(377–481ms, await!)
  → 90% 分离窗口管理(91–114ms) → 95% 同步总线(~1ms)
  ▼
isReady = true → MainLayout 渲染(路由视图懒加载)
```

两个关键的"设计初衷 vs 实际效果"错位:

- **防白屏策略**(`0b5c9110`)让窗口等 mount 后再显示,初衷是消除位置/白屏闪烁;但入口膨胀后,它把全部解析成本转化成了"无窗口期"。
- **`autoRegisterServices` 的 `import.meta.glob`(非 eager,`auto-register.ts:47`)本是懒加载设计**;但 `plugin-ui.ts:24` 对同一批文件做了 eager glob,使懒加载在产物层面完全失效——38 个 registry 及其静态依赖树照样进入口。

## 二、实测数据

### 2.1 启动载荷(dist 实测,2026-06-11 构建)

`dist/index.html` 直接引用的资源合计 **18,363,590 B(17.5 MiB)/ 145 个文件**:1 个入口 script、128 个 `modulepreload`(即入口静态图的全部 chunk,启动时必然下载并执行)、15 个 CSS、外加 head 里的 AMD Monaco(loader.js 40KB + editor.main.js 79KB 存根 + editor.main.css 309KB;`npm/monaco-editor@0.55.1/` 目录另有 15 MB 按需 AMD 模块)。

Top 体积已在"结论先行"表格中列出。补充两个溯源细节:

- `vendor-vue` 内含大量 TextMate scope 字符串(`punctuation.definition.tag.end.html`、`storage.modifier.vue-vine` 等)和 `vue-flow`、`sortable` 标记——证实 Shiki vue 系语法与 @vue-flow(llm-chat 树图专用)、vuedraggable 被 `includes("vue")` 规则误并;这些包本来只被**懒加载**代码引用,却因进入 vendor-vue 而变成启动必载。
- `model-metadata` chunk 内含 834 处 `<svg`、1440 处 `lobe` 标记——即 `@lobehub/icons-static-svg` 全集以 raw 字符串形式内联(源头 `src/config/preset-icons.ts:13-16`),经 `modelMetadataStore`(启动链)与 `Avatar.vue`(common 组件,被 plugin-ui eager glob)两条路径进入入口。

### 2.2 `initMainApp` 分步耗时(AppData 日志,2026-06-12 四次启动)

| 步骤(进度点)              | run1 09:10 | run2 10:31 | run3 10:32 | run4 10:39 |
| ------------------------- | ---------- | ---------- | ---------- | ---------- |
| 20%→25% 模型元数据规则    | 146ms      | 168ms      | 132ms      | 142ms      |
| 30%→40% Monaco/Shiki 预热 | 190ms      | 165ms      | 157ms      | 135ms      |
| 40%→60% 全量工具+插件注册 | 527ms      | 504ms      | 414ms      | 421ms      |
| 70%→80% 用户档案          | 55ms       | 58ms       | 44ms       | ~50ms      |
| 80%→90% 启动项任务        | 380ms      | 481ms      | 377ms      | —          |
| 90%→95% 分离窗口管理      | 114ms      | 98ms       | 91ms       | —          |
| **全程(10%→100%)**        | **1418ms** | **1479ms** | **1221ms** | ~1.3s      |

注:文件日志从 `applyLogConfig` 之后才开始写,mount 之前的解析耗时无法从日志取得,只能由载荷量推断(WebView2 有字节码缓存,冷启/热启差异大)。后续若需精确量化,建议在 `index.html` 内联脚本与 `main.ts` 头部打 `performance.mark`,并经 Tauri log 上报(见附录)。

## 三、问题清单(按影响排序)

### P0-1 `plugin-ui.ts` 双 eager glob:整个工具集的逻辑代码静态进入口

`src/services/plugin-ui.ts:10-13`(25 个 common 组件)与 `:24-27`(38 个 `*.registry.ts`)都用 `{ eager: true }`。plugin-ui 被 `main.ts:10` 静态导入并挂到 `window.AiohubUI`(插件 ESM shim 契约)。

后果链:registry 文件普遍静态导入所在工具的 stores/composables/engine(如 `llm-chat.registry.ts` 拖入 services 与多个 composables;`token-calculator.registry.ts` 拖入 worker proxy 与 `@/config/model-metadata`;`smart-ocr.registry.ts` 经 `useImageSlicer` 链到 docxParser/jszip);common 组件里 `RichCodeEditor/DocumentViewer/TranscriptionDialog` 拖入 codemirror(vendor-editor 1.23MB)、docxParser(802KB)、转写引擎,`AudioPlayer`(301KB)、`PdfViewer` 等同理。**保守估计该项贡献 5–7 MB 启动载荷**,且使 `auto-register.ts` 的懒加载设计失效。

修复方向:两个 glob 去掉 `eager`,组件侧用 `defineAsyncComponent(async () => (await loader()).default / toolConfig.component())` 包装(组件名已从路径推导,`plugin-ui.ts:36-40`,不依赖模块内容);`window.AiohubUI` 契约不变——map 仍同步存在,值变为异步组件。插件首次渲染某组件时才加载对应 chunk。

### P0-2 stream-monaco 把 ESM Monaco + Shiki 静态链入启动,且预热被 await

- 链路:`App.vue` → `appInitStore.ts:13` → `monacoShikiSetup.ts:14` 顶层 `import { registerMonacoThemes } from "stream-monaco"` → stream-monaco 顶层 `import * as monaco from "monaco-editor"` + `import { createHighlighter } from "shiki"` → **editor.api2 3.63MB 进入口**。
- 运行时:`appInitStore.ts:70` `await initMonacoShikiThemes()`,内部注册 **23 种语言**(`monacoShikiSetup.ts:28-52`)——加载 TM 语法 + oniguruma wasm,实测 135–190ms 全部计入首帧前。注释声称"不阻塞应用启动"(`monacoShikiSetup.ts:61`),实际语义只是"失败不阻塞",成功路径是阻塞的。
- 叠加 @tomjs 插件的 AMD 注入,**启动时存在两份 Monaco**(head AMD 给 @guolao 用,ESM 给 stream-monaco 用)。

修复方向:`monacoShikiSetup.ts` 改为函数体内 `await import("stream-monaco")`;`initMainApp` 不再 await 它(首帧后空闲触发,或由首个代码块渲染方 ensure——已有 `initPromise` 幂等保护,`isMonacoShikiReady()` 可作兜底)。中期统一到单份 ESM Monaco(见阶段二)。

> **2026-06-12 更新**:本项已升级为整体移除方案——消息代码块默认引擎已是 CodeMirror 且实测性能更优,stream-monaco/shiki 将连同 `monacoShikiSetup.ts` 一并移除,详见 [stream-monaco-removal-plan.md](./stream-monaco-removal-plan.md)。

### P0-3 `preset-icons.ts` 内联 834 个 SVG(2.34MB)

`src/config/preset-icons.ts:13-16`:`import.meta.glob("@lobe-icons/*.svg", { eager: true, query: "?raw" })`。两条入口路径:`modelMetadataStore`(`appInitStore.ts:14`,启动链)与 `Avatar.vue`(common 组件,经 P0-1)。

修复方向(任选其一):

- 改 `query: "?url"`(同文件 `localIcons` 已是此写法,`:20-26`):图标变成按需 fetch 的独立资源,map 仍同步可用(值为 URL),`LOBE_ICONS_MAP` 的消费方需从"拿 raw 内容"改为"拿 URL"(`Avatar`/`DynamicIcon` 渲染 `<img>` 或运行时 fetch);
- 或去 eager + 异步 getter,首次打开图标选择器/渲染头像时再加载。
- 注意 unplugin-icons 已配置 lobe 自定义集合(`vite.config.ts:130-139`),模板内 `i-lobe-*` 用法是按需编译的,与本问题无关,不要误伤。

### P1-4 `manualChunks` 的 `includes("vue")` 把懒资源变成启动必载

`vite.config.ts:194-213`:`if (id.includes("vue") || id.includes("vue-router") || id.includes("pinia")) return "vendor-vue"`。任何路径含 "vue" 的 node_modules 模块都被并入 vendor-vue——包括 Shiki 的 `vue/vue-html/vue-vine` 语法(本是 shiki 动态 import 的懒 chunk)、`@vue-flow/*`(仅树图视图用)、`@guolao/vue-monaco-editor`(本应进 vendor-editor)、sortablejs(vuedraggable 内联)。**vendor-vue 因此膨胀到 3.95MB,且全部随入口加载**。

修复方向:精确匹配,如 `/node_modules\/(?:@vue|vue|vue-router|pinia|vue-demi)\//`;或 Vite 8 下直接删掉手工 vue 分组,交给默认算法。修复后这些包回到各自的懒 chunk,首发收益即 2–3MB。

### P1-5 `initMainApp` 串行瀑布,且一半步骤与首帧无关

`src/stores/appInitStore.ts:41-110` 共 10 个串行 await。依赖分析:

- 真正的首帧前置:`appSettingsStore.load()`(后续都读它)→ `initTheme()`、`autoRegisterServices()`(侧栏/路由需要 toolConfig)。
- 可并行:`modelMetadataStore.loadRules()`、`userProfileStore.loadProfiles()`(llm-chat 领域数据,首帧仅 HomePage/侧栏,完全可后置)、`initMonacoShikiThemes()`。
- 应后置到 `isReady` 之后:`startupManager.run()`(`appInitStore.ts:89`——用户自定义启动项,内部已有 10s 超时与熔断,`startup-manager.ts:113-121`,却阻塞首帧 377–481ms)、`detachedManager.initialize()`、`initializeSyncBus()`。

修复方向:settings 先行,随后 `Promise.all([theme, autoRegister])` 达成即 `isReady = true`;其余在 `requestIdleCallback`/`setTimeout(0)` 中补齐。需验证两点:MainLayout 对 `useDetachedManager` 未初始化状态的容错(`MainLayout.vue:19`),以及分离窗口恢复流程对 syncBus 延迟初始化的容忍度(分离窗口路径本就有独立的 `initDetachedApp` 时序,`appInitStore.ts:115-178`)。

### P1-6 `autoRegisterServices` 串行 for-await 38 个模块

`src/services/auto-register.ts:165-172`:`for (const path of remainingPaths) { await loadAndRegisterModule(path, true) }`。每个模块一次动态 import(产物下对应 chunk 链)+ `register()`(内部 `initialize()` 多为空实现,个别如 tool-calling 等待 taskManager)。实测整段 414–527ms。

修复方向:`Promise.allSettled(remainingPaths.map(loadAndRegisterModule))`;`toolsStore.addTool` 的最终顺序由 `initializeOrder()` 统一决定(`auto-register.ts:185`),与注册先后无关,并行安全性较高;保留 failedModules 收集。P0-1 完成后,此项的网络/解析部分已大幅缩水,剩余为执行成本。

### P1-7 `main.ts` 全量 Element Plus + 全部 EP 图标挂 window

`src/main.ts:7-12,40-44,94`:`import * as ElementPlus` + `import * as ElementPlusIconsVue`(全部图标)+ 全量 CSS(355KB)+ dark CSS,并挂到 `window` 供插件 ESM shim(`index.html` importmap → `public/plugins/shims/*`)。

修复方向(阶段二):这是插件契约,不能简单砍掉,但可以**延后**——插件系统本就在 `autoRegisterServices` 的 `loadRemaining` 尾部才初始化(`auto-register.ts:174-182`),`window.ElementPlus` 等全局只需在首个插件加载前就位。可改为:入口仅按需注册(unplugin resolvers 基建已在,`vite.config.ts:120-129`),`window.*` 全局改为在插件管理器初始化前 `await import("element-plus")` 赋值;或用 getter 惰性化。涉及插件兼容性,需配合 `docs/Plan/main-refactor-plugin-impact.md` 的契约清单评估。

### P2-8 @tomjs AMD Monaco:同步 head 脚本、309KB 阻塞 CSS、nls 404、双份 Monaco

产物 `dist/index.html:12-16`。`editor.main.nls.js` 不存在于 `dist/npm/`(monaco 0.55 已并入主文件),**每次启动一次 404**;loader/editor.main 为同步经典脚本,连内联 splash 的首绘都被其阻塞。该插件存在的唯一理由是给 `@guolao/vue-monaco-editor`(`RichCodeEditor.vue:51`)提供 `window.require` AMD 环境。

修复方向:短期把注入脚本改 `defer`/移除 nls 行(查 `@tomjs/vite-plugin-monaco-editor` 配置项);中期 `loader.config({ monaco })` 注入 ESM 实例(@guolao 官方支持),删除该插件,全 app 单份懒加载 ESM Monaco——同时让 `monaco-i18n` 的 ESM alias 劫持(`vite.config.ts:46-57`)成为唯一汉化路径。

### P2-9 窗口显示时机:mount 后才 show,内联 splash 形同虚设

`src/main.ts:183-191`。载荷缩减后此问题自动缓解;若想进一步消除空窗,可在 `DOMContentLoaded` 后即 `show()`(内联 splash 可见,且其样式已适配暗色),mount 后无缝切换 LoadingScreen——与防闪烁初衷不冲突,因为窗口尺寸/位置在 Rust 侧创建时已应用(`lib.rs:846-854,881-884`)。Linux 白屏 watchdog 依赖的 `frontend-ready` 事件不受影响(`main.ts:194-195`)。

### P2-10 Rust:`AssetCatalog::initialize` 同步阻塞在窗口创建前

`src-tauri/src/lib.rs:821-825` → `asset_manager.rs:41-83`,逐行 JSON 解析资产索引,资产多时(数千条)会推迟窗口创建。修复方向:`tauri::async_runtime::spawn` 后台初始化 + 首个资产命令处 ensure(已有 `RwLock` 结构,改动小)。同文件 `init_global_mouse_listener()`(`lib.rs:964`)为常驻钩子线程,开销一次性,暂不动。

### P2-11 杂项

- `main.ts:16-17` 全局导入 KaTeX CSS(含字体引用)与 viewerjs CSS:应随 rich-text-renderer / 图片查看器的 chunk 走。
- `App.vue:9` 静态导入 `MainLayout`:改 `defineAsyncComponent` 可让入口只含 LoadingScreen,进一步压薄 main chunk(收益中等,放阶段二顺手做)。
- `App.vue:49` 每 500ms 的 `setInterval` 滚动复位巡检:与启动无关但属常驻成本,可改为仅 scroll 事件驱动(已有 capture 监听)。
- `userProfileStore.loadProfiles` 全量加载(`cbed6864` 刚从按需改为全量):单次 ~55ms 不大,但它是 llm-chat 领域数据,不应在全局 `initMainApp` 里阻塞(归入 P1-5 的重排)。

## 四、分阶段建议

### 阶段一:低风险,单点改动,预计 1–2 天

| #   | 改动                                                                     | 预期收益                       |
| --- | ------------------------------------------------------------------------ | ------------------------------ |
| 1   | `monacoShikiSetup` 动态 import + `initMainApp` 不 await(P0-2)            | 入口 -3.7MB;首帧 -150ms        |
| 2   | `preset-icons.ts` 改 `?url` / 去 eager(P0-3)                             | 入口 -2.3MB                    |
| 3   | `manualChunks` 精确匹配 vue 系(P1-4)                                     | 入口 -2~3MB(懒资源归位)        |
| 4   | `initMainApp` 重排:startup/detached/syncBus/profiles 后置,其余并行(P1-5) | 首帧 -600~900ms                |
| 5   | `auto-register` 并行化(P1-6)                                             | 首帧 -200~350ms(与 4 部分重叠) |
| 6   | 删 nls 404 行 / AMD 脚本 defer(P2-8 短期)                                | 消除 404,splash 首绘提前       |

阶段一完成后预估:载荷 ~11–12MB,`initMainApp` 0.4–0.6s。

### 阶段二:结构治理,需要回归测试,预计 3–5 天

| #   | 改动                                                                              | 预期收益                         |
| --- | --------------------------------------------------------------------------------- | -------------------------------- |
| 7   | `plugin-ui` 去 eager,异步组件包装(P0-1);同时收紧 `plugin-sdk.ts` 的 `export *` 面 | 入口再 -5~7MB,dev 首屏请求数大降 |
| 8   | Element Plus 按需 + window 全局延后到插件系统初始化前(P1-7)                       | 入口 -1~1.5MB                    |
| 9   | Monaco 统一 ESM,删 @tomjs AMD(P2-8 长期)                                          | 消除双份 Monaco;编辑器路径单一化 |
| 10  | `MainLayout` 异步化、KaTeX/viewer CSS 下沉(P2-11)                                 | main chunk 进一步压薄            |
| 11  | Rust `AssetCatalog` 后台化(P2-10)                                                 | 窗口创建提前(资产多的用户)       |

阶段二完成后预估:载荷 ~3.5–4.5MB(vue 生态 + EP 核心 + 入口逻辑)。

### 阶段三:设计变更,按需立项

- **registry 协议拆分**:每个工具拆出轻量 manifest(id/名称/图标/path/runMode/detachableComponents 声明)与重实现;侧栏、路由、插件组件目录全部只依赖 manifest,实现首帧"只读元数据、零工具逻辑",工具在首次进入/被调用时激活。这是 P0-1/P1-6 的根治形态,也与现有 `main-refactor-spec-v2.md` 的方向衔接。
- **窗口提前显示**(P2-9):载荷缩小后评估 `DOMContentLoaded` 即 show 的体验。
- **启动 trace 常态化**:`performance.mark` 打点 + 启动报告面板(现有 startupManager 已记录任务耗时,扩展到全链路),防止回归。

## 五、风险与兼容性注意

1. **插件 ESM shim 契约**:`window.Vue/ElementPlus/AiohubSDK/AiohubUI` 是插件运行时依赖(`index.html` importmap → `public/plugins/shims/`)。阶段二所有"延后/按需"改动必须保证:任何插件代码执行前这些全局已就位(插件加载本就在 `loadRemaining` 末尾,时序上可行,但要防插件管理器被第三方提前触发)。
2. **分离窗口路径共享同一入口**:`main.ts` 根据 pathname 选根组件,P0-1/P0-2 的瘦身对分离窗口同样生效(它们目前也要解析同一份 17.5MB);`initDetachedApp` 的 priorityTool 机制不受影响。
3. **`refreshCurrentRoute` 时序**(`appInitStore.ts:78`):autoRegister 并行化后,确保路由刷新仍在全部 `addTool` 之后执行一次即可(现逻辑已满足——`loadRemaining` 内聚)。
4. **Shiki 主题欺骗机制**(`monacoShikiSetup.ts:74-78`):延后初始化时,需保证任何 Monaco 实例 `setTheme("vs-dark")` 前主题已注册,或接受 stream-monaco 的增量注册兜底;`RichCodeEditor` 走 AMD 实例(阶段二统一前)不受影响。
5. **测量基线**:本报告的 1.2–1.5s 为当前机器(开发者工作站、热缓存)数据;低端机/冷启的绝对值会更大,但瓶颈结构相同。

## 附录:复测方法

```bash
# 1. 量化启动载荷(构建后)
bun run build
node -e "…统计 dist/index.html 引用的 assets 总字节…"   # 本次脚本:提取 href/src 求和,结果 18,363,590B/145 文件

# 2. 真实启动分步耗时:启动应用后查看
#    %APPDATA%/com.mty.aiohub/logs/app-YYYY-MM-DD*.log 中 [stores/appInitStore] 初始化进度 各行时间差

# 3. mount 前空窗期(待实施):index.html 内联 performance.mark('html-start'),
#    main.ts 头部 mark('module-eval'),mountApp 内 mark('mounted'),show() 后上报 measure
```

主要证据文件:`src/main.ts`、`src/App.vue`、`src/stores/appInitStore.ts`、`src/services/plugin-ui.ts`、`src/services/auto-register.ts`、`src/utils/monacoShikiSetup.ts`、`src/config/preset-icons.ts`、`vite.config.ts`、`src-tauri/src/lib.rs`、`dist/index.html`(2026-06-11 构建)。
