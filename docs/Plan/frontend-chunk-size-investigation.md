# 前端 Chunk 体积与装载边界收口计划

> 状态：2026-10-31 已实施公共编辑器 Monaco 按需加载、撤除编辑器粗分组与聊天处理器工厂注入；薄宿主/面板按需加载、Monaco 0.57.0 与窗口根按路径加载已实施；相关测试、生产构建与四类真实 Tauri 窗口走查完成
>
> 最后更新：2026-10-31
>
> 关联配置：[`vite.config.ts`](../../vite.config.ts)

## 1. 当前结论

构建警告不能通过继续提高 `chunkSizeWarningLimit` 解决，但大 chunk 也不等于首屏瓶颈。当前应分别看安装体积、首页静态闭包、按需工具成本和真实 Tauri 的读取/解析/执行时间。

已完成的治理：

1. 移除 AMD Monaco，只保留统一 ESM 入口和 Worker 工厂。
2. 将七个内置 Tokenizer 从 JavaScript 模块拆为构建期 gzip 资产，首次使用时按需解压。
3. 公共编辑器默认 CodeMirror 路径保留同步可用，Monaco 普通与 Diff 分支按需加载；撤掉编辑器粗分组。
4. 聊天生成管理器通过工厂获取处理器，清理无效动态导入警告并保持延后实例化。
5. 标题栏两个隐藏面板及伴随会话视图首次打开时加载；后台任务恢复与跨窗口同步由常驻薄宿主承接。
6. Monaco 升至 0.57.0，迁移五类 Worker 入口并同步官方简中消息表，快速销毁取消异常已复验修复。
7. 四类窗口按路径等待对应根组件后挂载；静态开发服务支持含冒号的组件路由，原始地址首开与刷新已验证。

2026-07 的 registry 与插件初始化实测中位数约 294 ms；这是历史样本，当前版本尚待重新观测。2026-10-31 已按构建对照实施公共编辑器和编辑器分组优化；大规模异步 catalog 继续作为观测触发的候选。

## 2. 已完成结果

### 2.1 Monaco ESM-only

- `src/utils/monaco.ts` 统一注册 Editor、JSON、CSS、HTML 和 TypeScript Worker。
- `@guolao/vue-monaco-editor` 显式使用本地 ESM Monaco，阻断 CDN fallback。
- 移除 `@tomjs/vite-plugin-monaco-editor`、AMD HTML 注入和完整 `min/vs` 复制目录。
- Text Diff、Web Canvas、Agent Manager、Quick Action 等运行时入口统一使用同一模块。
- 真实 Tauri 窄 E2E 覆盖 Diff Editor、Worker factory 和 AMD/CDN 请求边界。

2026-07-26 构建记录：

| 指标                   |     实施前 |     实施后 |
| ---------------------- | ---------: | ---------: |
| `dist` 原始体积        | 约 134 MiB | 119.35 MiB |
| JavaScript 原始体积    |  91.68 MiB |  77.32 MiB |
| JavaScript gzip        |  30.42 MiB |  26.86 MiB |
| AMD Monaco 复制目录    |  14.97 MiB |   不再生成 |
| 首页额外 AMD Monaco JS |   3.64 MiB |          0 |

以上为 2026-07 的阶段结果。2026-10-31 复查发现，公共 `RichCodeEditor` 的静态引入将 Monaco ESM 核心带入主入口静态依赖集合；本轮已恢复按实际编辑器引擎加载的边界。统一 ESM 入口、Worker 工厂与本地 loader 配置继续保留。

### 2.2 Tokenizer 资产化

- `builtin-tokenizer-assets-manifest.ts` 维护七个内置包与 profile 的资产来源。
- Vite 插件在构建期输出 `dist/tokenizers/<profile>/*.json.gz`，开发模式使用同一路径中间件。
- `tokenizerAssetService` 通过 `fflate` 解压，并复用现有 Worker 的 `needProfileData` / `profileData` 协议。
- Worker 与主线程不再动态导入七个 `@lenml/tokenizer-*` 大型 JavaScript 入口。
- 用户导入和远端缓存 profile 的注册表协议保持不变。

2026-07-26 构建记录：七个 gzip 资产约 15.54 MiB；JavaScript 降至约 40.87 MiB（gzip 12.05 MiB），相对 Monaco 阶段后的基线减少约 36.45 MiB 原始 JS。14 个资产解压后均与来源字节一致。

### 2.3 公共编辑器加载边界与聊天工厂注入

2026-10-31 正式实施：

- 新增共享 `loadMonacoEditor()`，并行加载统一 ESM 引擎与 Vue 绑定，先配置本地 loader 再渲染组件；成功请求复用，失败允许重试。
- `RichCodeEditor` 使用 `shallowRef` 保存绑定，通过动态组件渲染普通与 Diff 编辑器。默认 CodeMirror 路径保持即时可用，加载阶段显示状态，失败提供重试操作；卸载后忽略加载结果。
- 普通与 Diff 编辑器均先释放 widget、再释放 model；VNode 卸载钩子覆盖父包装组件继续存活的引擎切换。内容事件与公开 ref API 保持原有接口，Monaco 实例仍以 `mount` 事件为就绪时机。
- 删除 `vendor-editor` 手动分组，保留 Vue 与 Element Plus 分组。
- `sessionGenerationManager` 的 `createChatHandler` 为必需依赖，由 Store 注入延后调用的工厂；生产构建中的对应无效动态导入警告已消失。

按 Vite 所有后处理完成后的最终 output 复算如下，实施前源码从首批之前的提交在内存中重建；方法与口径校正见第 4.1 节：

| 指标                        | 实施前基线 |  正式实现 |
| --------------------------- | ---------: | --------: |
| 入口静态 JS chunk           |        293 |       297 |
| 入口静态 JS 字节            | 11,900,181 | 7,473,488 |
| 入口静态 JS gzip            |  3,526,904 | 2,327,017 |
| Monaco ESM 核心入口静态可达 |         是 |        否 |

入口静态 JS 减少 4,426,693 字节，约 37.2%。该口径排除 CSS、Worker 和其他资产；chunk 数量增加来自分包边界恢复，启动毫秒数尚未测量。

验证结果：

- 相关 4 个测试文件、14 项用例通过，覆盖默认 CodeMirror、加载重试与最新父值、共享本地配置、引擎切换资源释放、Diff 双侧绑定和会话管理器。
- `bun run build:tsc`、`bun run build:vite` 通过。既有第三方 `file-type` eval 与大 chunk 提示继续保留。
- 隔离的真实 Tauri 静态生产前端中，首页未初始化 Monaco Worker 工厂，进入文本对比后 Diff 与 TypeScript Worker 可用；普通编辑、父值同步、只读更新、切回 CodeMirror 保留内容，以及浅/深主题切换通过。
- 加载失败恢复由组件单测模拟验证；运行态资源 timing 记录未形成完整网络请求清单，沿用本地 ESM 配置与实际 Worker 结果确认路径。

走查另发现 Monaco 0.55.1 的快速销毁异常：聚焦并移动光标后立即释放编辑器，`wordHighlighter` 的 `runDelayer.trigger()` 返回 Promise 缺少拒绝处理，`Delayer.dispose()` 取消时产生未处理的 `Canceled`。绕过本项目组件及 Vue 绑定，直接调用 `monaco.editor.create()` 并按 editor/model 顺序释放也可复现，确认来源为引擎内部。销毁顺序修正与该上游问题分别记录；第二批已升级至 0.57.0，并在相同真实 WebView 路径连续复验 6 次，未再产生未处理的取消异常，见第 4.3 节。

构建日志、产物指标和真实 Tauri 诊断保存在已忽略的 `.tmp/dynamic-import-implementation/`。

## 3. 2026-10-31 加载边界深入调查

### 3.1 方法与数据口径

以下为实施前调查记录，采用早期 generateBundle 快照；最终输出口径见第 4.1 节。基线使用 Vite 8.1.4、当时仓库配置和正式源码。新增 10 组隔离构建试验，由临时插件在内存中修改导入边界或配置，`write: false` 保持正式源码与 `dist` 原样。模块关系、chunk 归属、minify 后字节数、gzip 和修改文件清单保存在已忽略的 `.tmp/dynamic-import-investigation/`。

本次区分两个口径，均按文件去重：

- **入口静态依赖量**：从 `index.html` 对应 chunk 递归遍历静态 `imports`。
- **补入注册与主布局后的依赖量**：入口集合加上主窗口根组件、48 个工具 registry 与 `MainLayout` 的静态依赖。主窗口在 `isReady` 前等待 registry 和插件加载，随后挂载主布局，所以入口数字需要结合这个集合解读。

第二个口径是已知源码路径对应的构建集合，尚未包含插件实际加载、组件渲染后触发的所有动态请求。两项都无法直接换算为启动毫秒数。以下使用十进制 MB；不含 CSS、独立 Worker 和 Tokenizer 资产。

### 3.2 构建对照

| 试验                                            | 源码试验范围   |  入口静态 JS | 补入注册与主布局后 | 入口中的 CodeMirror 语言模块 |
| ----------------------------------------------- | -------------- | -----------: | -----------------: | ---------------------------: |
| 实施前实现                                      | 基线           |    11.802 MB |          12.765 MB |                           28 |
| 仅撤掉 `vendor-editor` 手动组                   | 配置           |    11.119 MB |          12.081 MB |                            4 |
| 全自动分包                                      | 配置           |    11.122 MB |          12.085 MB |                            4 |
| 仅将全部窗口根组件改成异步包装                  | 1 个文件       |     5.143 MB |          12.739 MB |                           28 |
| 51 处编辑器调用改成异步包装                     | 51 个文件      |     8.063 MB |           9.026 MB |                           28 |
| 仅在公共编辑器内按需加载 Monaco                 | 1 个文件       |     8.073 MB |           9.036 MB |                           28 |
| 公共编辑器内按需加载 Monaco + 撤掉编辑器组      | 1 个文件与配置 | **7.374 MB** |       **8.337 MB** |                            4 |
| 公共编辑器内按需加载 Monaco + 全自动分包        | 1 个文件与配置 |     7.380 MB |           8.344 MB |                            4 |
| 窗口根组件异步包装 + Monaco 按需 + 撤掉编辑器组 | 2 个文件与配置 |     3.845 MB |           8.311 MB |                            0 |

另做两组交叉验证：只延后入口静态可达的四处编辑器调用并撤掉编辑器组，结果为 7.364 / 8.327 MB；窗口异步包装、51 处编辑器调用延后和撤组组合，结果为 3.845 / 8.301 MB。它们与公共组件内优化的差距约 10 KB，优先选择集中维护的改法。

推荐组合将入口静态 JS 减少 **4,427,592 字节，约 37.52%**；补入注册与主布局后的集合减少约 **34.69%**。主构建 JS 总量仍约 28.22 MB，变化主要来自加载时机，安装体积需要另外统计。

所有试验构建成功；聊天处理器的无效动态导入警告在这些试验中仍保留，清理由 Chat 管理器工厂注入单独处理，见 [Chat 动态导入调查](../../src/tools/llm-chat/docs/Plan/dynamic-import-investigation.md)。

### 3.3 第一优先：公共编辑器按引擎加载

调查时 `RichCodeEditor.vue` 默认使用 CodeMirror，却静态引入 `@/utils/monaco` 与 `@guolao/vue-monaco-editor`。该公共组件有 51 个静态调用方；主入口静态可达的直接调用方为：

- `DocumentViewer.vue`；
- `VirtualTextAttachments.vue`；
- `ExportPreviewSection.vue`；
- `MessageDataEditor.vue`。

本轮已保留公共组件的现有外壳、CodeMirror 实现和公开 API，仅在两个 Monaco 分支按需加载绑定并渲染动态组件。Monaco 目前在该文件中的其余引用均可保留为类型引用。

构建候选采用以下顺序：分支实际渲染时，并行导入统一 Monaco ESM 模块与 Vue 绑定；先执行 `bindings.loader.config({ monaco })`，再返回普通或 Diff 组件。这样 CodeMirror 路径继续即时可用，Monaco 使用路径才承担其加载成本。

正式实现保留：

- 统一模块里的 Worker 工厂，以及先于 Monaco 使用的中文 NLS 初始化；
- 本地 ESM loader 配置发生在绑定组件挂载之前，保持现有 WebView CSP 和本地资源加载路径；
- `mount` 事件、文本更新事件和 `defineExpose` 的内容、聚焦与实例访问接口；
- Diff 两侧事件监听器释放、编辑器先于 model 的销毁顺序；
- 加载期间可操作的编辑器框架、可读错误与重试入口。

已对内存候选做独立 Vue 类型检查，通过。另在临时副本中复用现有 `RichCodeEditor.diff.test.ts` 的两个公开行为用例，等待异步组件加载后，双侧文本编辑/父值替换和旧实例监听释放均通过。上述为原型阶段结果；正式组件测试与真实 Monaco/Worker 走查结果见第 2.3 节。

异步化所有调用方会引入额外的组件 ref 就绪时序。现有 `MessageDataEditor` 在 `nextTick` 后聚焦，`PresetMessageEditor` 会读取暴露的 Monaco 实例；只调整公共组件内部的 Monaco 分支更容易控制影响范围。

另外四个直接使用 Monaco 的模块是 Preset 工具栏、Quick Action 与 Web Canvas 的编辑器/模型管理器。这些路径在当前入口基线中均为按需依赖，保留各自领域职责即可；后续工具入口变化时再核对。

### 3.4 第一批可同时做：收窄编辑器分组

实施前的 `manualChunks` 将所有路径包含 `codemirror` 或 `@guolao/vue-monaco-editor` 的依赖归为 `vendor-editor`。其内容包括 28 个语言模块，以及 Vue runtime-core、reactivity、shared 等公共依赖。

`codeLanguages.ts` 已按语言动态导入解析器，粗分组却将它们聚合到入口静态可达包中。仅撤掉编辑器分组就减少约 0.683 MB，28 个语言模块降到 4 个；剩余 HTML、CSS、JavaScript 和 Markdown 模块仍由当前使用路径带入。

全自动分包与只撤编辑器组在本次数据上相近。本轮已采用较窄的配置改动，保留 Vue 与 Element Plus 的分组，避免为几 KB 的差异扩大变更面。若后续改用 Rolldown `codeSplitting.groups`，需显式考虑组优先级和依赖递归捕获，不能只按包名恢复同样的粗分组。

### 3.5 窗口根组件：适合隔离职责，收益需分阶段解释

将四种根组件全部包装为异步组件后，入口数字从 11.802 MB 降到 5.143 MB。但主窗口选中 App、完成工具注册并加载主布局时，多数依赖又被加载，集合仍为 12.739 MB，较基线仅少约 26 KB。

因此，该试验验证了可切分边界，主窗口整体收益仍取决于公共布局和服务依赖。它更适合用于减少各类 WebView 相互带入无关窗口代码。

正式改造优先在启动函数中按窗口路径 `await import(...)` 选定实际根组件后再 `createApp`，维持当前真实挂载与 ready 语义。直接使用异步根包装会使 `app.mount()` 返回早于根组件完成加载，而当前代码随后上报 `vue-mounted`、显示窗口并发送就绪事件，需要一起调整才能保证记录准确。

根组件导入前后的顺序应保持明确：透明背景标记、插件全局 shim、Pinia、动态路由、错误处理、挂载与窗口就绪通知。新的异步启动也要核对现有 `DOMContentLoaded` 文件拖拽监听器注册时机。

### 3.6 公共壳层：先拆持续服务，再延后面板

- `useBackgroundTaskCenter` 是轻量的界面状态单例，可以保持常驻。
- 标题栏的任务摘要可继续读取任务快照。会话跳转只在操作时需要聊天 Store，可以逐步改为异步动作接口。
- `UserProfileManagerDialog`、`BackgroundTaskCenter` 当前在标题栏模板中无条件挂载。仅替换为异步组件仍会在渲染时触发导入，需要结合首次打开状态安排挂载。是否保留首次打开后的实例由面板状态恢复需求决定。
- `CompanionSessionSheet` 是 `useBackgroundTaskSync()` 的唯一调用方。该 composable 负责持久化恢复、主窗口快照推送、分离组件首次握手/接收和叫停动作转发。面板关闭时仍需保留这些职责。

伴随面板延后前，先将同步职责迁入每个需要同步的 WebView 中唯一、持续挂载的数据 provider，保持宿主与观察窗口角色。再将 `useCompanionSession` 的轻量可见性状态、异步动作和聊天数据读取拆清；当前 composable 自身也静态引用聊天 Store。

这样任务面板与消息列表可以按需加载，同步服务的生命周期保持稳定。已有 `GlobalProviders` 的图片、音视频和模型弹窗采用异步组件配合可见性条件，可复用这一项目内写法。

### 3.7 聊天执行与上下文预览：后续领域拆分

`useChatContextStats` 通过完整 `useChatHandler` 请求上下文预览，后者构造完整执行器和工具编排；分析器也使用相同入口。下一阶段可将预览/统计能力抽出，复用标准上下文管道，减少预览对发送执行能力的耦合。

拆分时保留历史 Agent/模型选择、会话参数覆盖、待发送输入宏、User Profile 与 `purpose: "statistics"` 的处理口径。统计在会话恢复后可能立即刷新，单纯改成动态导入仍可能很快加载完整处理器；实际收益依赖职责拆分。这项属于中等范围重构，本次未给出体积收益承诺。

### 3.8 Registry：先观测实际阶段，再决定懒加载范围

`initMainApp` 在 ready 前等待 `autoRegisterServices()`，后者并行加载全部 registry、初始化并加载插件，最后 `toolsStore.setReady()`。所以动态导入 registry 表达的是分包方式，主窗口启动过程仍会等待它们。

`ToolRegistryManager.registerSingle` 会等待工具的 `initialize()`，工厂还会执行 `createRegistries()`；例如 Knowledge 初始化包含迁移流程。分离窗口 `runMode` 判断发生在模块导入和导出标准化之后，其分支仍调用 register。后续生命周期调查应以实际调用为准。

本次并未重测 registry 的耗时，继续沿用“有运行态数据后再局部清理”的决策。保留同步 metadata、工具列表完整性、首次工具路由恢复、启动恢复和 factory/dispose 契约；若未来拆成 catalog，要同时设计这些契约的承接方式。

## 4. 下一批调查与实施建议

### 4.1 最终输出口径与构建对照

2026-10-31 在首批三个提交之后，对标题栏面板、伴随会话宿主和实际窗口根导入做隔离构建。所有源码转换仅作用于 Vite 内存；`write: false` 保留正式源码和 `dist`。依赖图、日志、转换脚本与发布包比对保存在已忽略的 `.tmp/dynamic-import-next-batch/`。

本轮在 `await build()` 返回后采集最终 output，覆盖 Vite 的 preload/import 后处理，再递归静态 imports。早期第 3 节的 `generateBundle` 快照早于这些后处理，入口基线少计约 98 KB，补入注册与布局后的集合少计约 294 KB。因此本节统一用最终 output 口径；第 3 节保留为边界定位记录。

同时在内存中恢复 `5ebede8aa` 的三个业务文件与编辑器粗分组，重建首批实施前基线。最终入口静态 JS 为 **11,900,181 → 7,473,488 字节，减少 37.2%**。当前基线与此前落盘产物 7,473,486 字节相差 2 字节，结论一致。

| 隔离构建方案                     |  入口静态 JS | 补入主根、48 个 registry 与主布局后 | 相对当前基线的意义                             |
| -------------------------------- | -----------: | ----------------------------------: | ---------------------------------------------- |
| 首批正式实现                     |     7.473 MB |                            8.632 MB | 首批已完成                                     |
| 标题栏两个面板首次打开时加载     |     7.413 MB |                            8.578 MB | 入口减少约 60 KB                               |
| 上项 + 伴随会话轻量宿主/异步视图 | **6.343 MB** |                        **7.509 MB** | 入口减少 1.130 MB / 15.1%，补齐后减少 1.122 MB |
| 上项 + 按窗口 await 根组件       |     3.897 MB |                            7.494 MB | 主窗口补齐后仅再减少约 15 KB                   |

以上为压缩后 JS 的十进制 MB，排除 CSS、Worker 和其他资产；注册集合延续第 3 节口径。聊天路由、伴随消息视图和其他工具打开时会回补各自动态依赖。构建集合用于判定加载边界，冷暖启动耗时尚未采样。

### 4.2 已实施：常驻宿主与首次打开的面板

2026-10-31 已正式实施两部分，沿用原有后台同步职责：

1. **标题栏面板**：`UserProfileManagerDialog` 和 `BackgroundTaskCenter` 使用共享 `LazyPanelHost` 延迟导入。首次打开后保留外层组件，以延续任务选中项、外部定位与当前页签。加载阶段由轻量弹窗显示状态，失败可关闭、重新打开或点击重试。
2. **伴随会话宿主**：新增轻量 `CompanionSessionHost.vue`，同步调用 `useBackgroundTaskSync()`，读取已有 `isOpen` 状态；首次打开后渲染异步 `CompanionSessionSheet`。视图移除同步服务调用，保留消息展示、停靠、MutationObserver 与刷新调度。首次激活后保留视图实例，关闭仍由现有状态控制。

宿主沿用当前两个挂载位置：`MainLayout` 内常驻，以及 `DetachedComponentContainer` 的 `llm-chat:chat-area` 分支。这样保持主窗口宿主与分离组件观察者的现有角色、初始握手和销毁边界。直接搬入所有窗口共用的 `GlobalProviders` 会让工具窗口、Canvas 等新增任务同步参与者，需要另行设计角色；本批采用原挂载位置的薄宿主。

必须延续的行为：

- 面板首次打开之前，恢复、快照推送/接收和叫停转发已工作；`sub-agent:background-tasks` 每个既有宿主只注册一次。
- 标题栏和聊天入口仍共享同一任务中心状态；首次打开即消费 `focusedTaskId` 与指定页签。
- 伴随会话的 `openCompanion()` 继续负责数据加载。异步视图就绪时读取最新状态，快速打开后关闭或切换目标时遵循现有版本失效逻辑。
- 关闭伴随 UI 后同步服务持续存在；宿主卸载时同步监听释放。视图卸载继续释放停靠、Observer 和合并刷新计时器。

正式实现新增共享 `LazyPanelHost` 和伴随薄宿主，并修改标题栏、两个原宿主调用处及伴随视图。最终 `dist` 落盘后递归扫描静态 imports，按第 4.1 节相同口径统计：

| 指标                                          |  首批实现 | 第二批正式实现 |
| --------------------------------------------- | --------: | -------------: |
| 入口静态 JS chunk                             |       297 |            245 |
| 入口静态 JS 字节                              | 7,473,488 |      6,348,409 |
| 入口静态 JS gzip                              | 2,327,017 |      2,000,531 |
| 补入主根、48 个 registry 与主布局后的 JS 字节 | 8,631,637 |      7,514,562 |

入口减少 1,125,079 字节（15.1%），补齐主布局后的集合减少 1,117,075 字节。两个 registry 与插件管理共用输出文件，统计时一并补入，避免按独立 chunk 文件数漏计。面板和 Monaco core 均处于这两个集合之外；本次同时升级 Monaco，数值反映组合实现。实际启动耗时继续保留为待测项。

验证：

- 6 个相关测试文件、11 项用例通过，覆盖首开加载、最新目标透传、关闭重开保留实例、失败重试，以及主窗口/分离观察者的同步配置与卸载清理；复用伴随状态、普通编辑器、Diff 和共享 loader 用例。
- `bun run build:tsc` 与 `bun run build:vite` 通过。
- 隔离真实 Tauri 生产前端首页仅挂载三个轻量加载宿主；任务中心、档案管理和伴随消息视图均未挂载。首次加载前后台任务同步已存在。
- 档案管理首次打开及关闭重开可用；任务中心首开消费指定任务定位，子智能体页签关闭重开保留。
- 主窗口伴随画中画读取本地子会话，关闭重开后同步监听继续存在。分离聊天组件在首次打开伴随视图前收到两个任务快照，以观察者角色转发取消并接收取消状态；首次打开停靠栏后消息可见，关闭后任务数据仍保留。
- 两窗口走查结束时诊断游标均为 0。本次静态开发服务拒绝带冒号的 pathname，分离窗口首次请求返回 403；走查采用 `/detached-component/llm-chat` 别名路径，保留原 `config.id=llm-chat:chat-area` 与窗口身份。该开发服务路径问题已在第三批修复，原始地址走查见第 4.4 节。

日志、指标和运行态批处理保存在已忽略的 `.tmp/dynamic-import-panels/`。

### 4.3 已实施：Monaco 0.57.0 升级

2026-10-31 查询 npm 的 `latest` 为 **0.57.0**，下载对应正式发布包核对。发布包的 `wordHighlighter.js` 已在三个 `runDelayer.trigger()` 调用后接入 `.catch(onUnexpectedError)`；其错误处理器过滤预期取消，保留其他异常。它覆盖第 2.3 节定位的取消 Promise 来源；升级后已在真实 WebView 复验。

正式升级已完成：

- **包导出与 Worker 路径**：0.56 起支持新的 ESM 公开入口；0.57 的 exports 将子路径映射至 `esm/vs/`。现有五个 `monaco-editor/esm/vs/...?...` Worker 导入已迁移到公开子路径，避免双重 `esm/vs` 路径。
- **中文消息表**：升级前仓库 `src/utils/monaco-i18n/nls.js` 对应 0.55.1，含 2,051 条；0.57 官方简中表含 2,153 条，旧表已有 2,024 个索引内容变化。仅改依赖版本会导致大面积错译。现已通过 `bun run monaco:nls` 从已安装版本的官方简中消息脚本生成；在统一 Monaco 入口中先初始化消息表，删除旧 NLS aliases 与中间件。
- **公开 API 与功能注册**：新入口支持 `monaco-editor/editor`、`features/register.all` 与语言定义/服务的独立注册。本轮保持根入口完整导出与当前语言/编辑功能，更窄注册仍留作编辑器首开成本的独立候选。

真实 Tauri 验证了普通编辑、父值与只读同步、CodeMirror/Monaco 往返、Diff 实际行/字符差异，以及中文右键菜单。Editor Worker 完成差异计算，JSON Worker 可解析文档，TypeScript Worker 返回语法诊断；JSON/CSS/HTML/TypeScript 格式化均正常，浅色与深色主题切换生效。五类 Worker 均使用本地构建资产。聚焦、移动光标后立即 dispose 的原复现路径连续执行 6 次，未观察到未处理拒绝；诊断游标保持为 0。

依赖迁移涉及 package/lock、统一 Monaco 模块、官方 NLS 生成脚本和 Vite 配置，可与面板重构分别提交。后续语言/功能注册收窄单独按编辑器首开成本评估。

### 4.4 已实施：窗口入口拆分与静态组件路由

在面板/伴随宿主原型上，四种根组件按窗口路径 `await import` 后才 `createApp`，构建成功。选中主 App 根后集合已为约 5.965 MB；补齐注册与主布局后为 7.494 MB。因此 3.897 MB 只描述选择根组件之前的入口，主窗口相对上一方案的完整构建集合仅少约 15 KB。窗口拆分优先服务于窗口职责隔离，性能收益需按各类窗口实际测量。

2026-10-31 已正式实施：全局 shim、错误监听和透明背景设置先于异步根加载，在现有启动函数的 try/catch 中等待实际根组件，再创建 App、注册插件/Pinia/Router、挂载并上报 `vue-mounted`。主窗口显示与 `frontend-ready` 仍在挂载后执行。文件拖放监听在文档已就绪时立即注册，尚在加载时仅等待一次 `DOMContentLoaded`。

最终 `dist` 落盘后按第 4.1 节口径递归扫描静态 imports，单位为 minify 后的 JS 字节，排除 CSS、Worker 等资产：

| 指标                                          |    第二批 |    第三批 |
| --------------------------------------------- | --------: | --------: |
| 选择根组件前的入口静态 JS chunks              |       245 |       112 |
| 选择根组件前的入口静态 JS 字节                | 6,348,409 | 3,900,841 |
| 选择根组件前的入口静态 JS gzip                | 2,000,531 | 1,191,606 |
| 主 App 根组件加载后的静态 JS 字节             | 6,348,409 | 5,968,261 |
| 补入主根、48 个 registry 与主布局后的 JS 字节 | 7,514,562 | 7,499,387 |

入口数字减少 2,447,568 字节（38.6%）；主窗口补齐集合减少 **15,175 字节（0.20%）**。选中分离工具根、分离组件根、画布根后的静态集合分别为 6,038,851、5,957,927、6,213,307 字节，后续工具内容与初始化资源需另外计入。这里反映窗口依赖边界，真实冷暖启动耗时仍待测量。

静态开发服务曾统一拒绝冒号，导致真实组件地址 `/detached-component/llm-chat:chat-area` 返回 403。本轮只对 HTML 导航的单段分离组件路径开放 SPA 回退，并在进入文件查找前映射到当前 `index.html`。资源路径中的冒号、反斜杠、空字符和越界段继续拒绝，保留 Windows ADS 与目录边界。扩充现有路由和非法路径用例，覆盖原始/编码组件 ID 及资源 ADS 请求，沿用原 6 项测试。

验证结果：

- `bun run test:run scripts/dev-static.test.ts` 的 6 项用例、`bun run build:tsc`、`bun run build:vite` 均通过。
- 隔离静态生产前端的真实 Tauri 中，主窗口、JSON 格式化分离工具、聊天分离组件及画布预览均 ready，Vue 根组件与各自路径匹配；资源记录仅出现对应窗口根的产物。
- 分离聊天通过含冒号的原始地址首开和刷新恢复；组件与画布窗口的透明背景类保留。使用隔离本地空白 HTML 画布验证了预览 iframe。
- 主窗口在文档已为 complete 的状态下仍收到文件拖放事件并显示 JSON 格式化通知，单次事件产生一条通知。
- 四类窗口及分离聊天刷新后的诊断游标均为 0；后端记录各窗口挂载后的 `vue-mounted`。

日志、构建指标和批处理保存在已忽略的 `.tmp/dynamic-import-windows/`。本轮隔离实例 `next-windows` 走查后关闭，保留其他开发实例。

#### 剩余聊天依赖

聊天代码仍有独立静态路径：

`GlobalProviders → SyncServiceProvider → useLlmChatSync → llmChatStore`

标题栏还通过 Store 与 `useCompanionSession` 引用聊天。仅把标题栏跳转改成动态 import，无法消除前述同步路径。后续可按窗口角色渲染独立聊天同步子 Provider，让其在自己的 setup 中创建/清理 scope；直接在现有 onMounted 中 await 导入再调用 composable，会丢失当前 Vue 生命周期上下文，应先设计显式 scope 与销毁机制。

### 4.5 预览领域拆分：维护收益优先

目前至少有三类调用，后续迁移需共同覆盖：

- 自动统计：`useChatContextStats → useChatHandler.getLlmContextForPreview`，带 `purpose: "statistics"` 和临时模型。
- 上下文分析器：同一高层方法，带历史 Agent 与 pending input；高层还负责宏、参数覆盖与用户档案上下文。
- 分支导出：`ExportBranchDialog → useChatExecutor.getContextForPreview`，直接使用底层预览入口。

建议抽出专用预览 composable，承接宏处理和标准管道预览，处理器/执行器短期转发以保持接口稳定；统计、分析器和导出依次迁移。继续复用 `contextPipelineStore.executePipeline` 与 `buildPreviewDataFromContext`，保留历史模型、会话参数覆盖、媒体估算和读取已有转写的语义。

`useChatHandler()` 当前还会创建执行器、工具编排和压缩器；拆分可减少统计路径的对象装配，但 Store 仍静态引用发送处理器。现有代码未证明显著启动收益，这项排在面板与宿主、Monaco 升级之后。已有 `useChatExecutor.preview.test.ts` 保护预览观察性，`useChatContextStats.test.ts` 保护去抖/并发失效和卸载；迁移先复用这些用例，仅补历史参数、pending input 和导出这类公开行为缺口。

### 后续性能观测

2026-10-31 已完成全自动分包、窄分组与公共编辑器按需加载的构建对照。首批公共编辑器内 Monaco 按需加载和撤掉编辑器粗分组已实施，功能走查结果见第 2.3 节；面板/宿主与窗口构建对照见第 4.1 节，正式窗口拆分与四类窗口走查见第 4.4 节。chunk 数用于解释依赖，执行目标以实际加载成本和公开行为为准。

运行态性能结论应结合以下数据：

- `index.html` 静态 preload 数量和原始/gzip 体积；
- Home、普通工具、编辑器、PDF Viewer 和插件路由的按需请求；
- `dist` 总体积与重复依赖；
- 真实 Tauri 冷/暖启动的分阶段耗时；先做少量对照，出现稳定收益后再扩充采样以报告中位数和 P95；
- `bun run build:tsc` 与 `bun run build:vite`。

首批实现已完成相关类型检查、构建、编辑器行为测试与真实 Tauri 功能走查。更广的分包配置调整由实际观测决定。

### P3：观测与低风险入口清理

2026-07-27 的三次启动中，44 个 registry、38 个工具和 2 个插件的 `registry + plugins` 为 200–343 ms，中位数 294 ms；`WebView Started -> MainLayout ready` 中位数 789 ms。现有证据不支持大规模 `ToolDescriptor`、异步 discovery 或首次调用实例化。

先增加统一 performance marks：

- `bootstrap-start`、`vue-mounted`、`window-shown`；
- `app-init-start`、`registry-imports-done`、`plugins-loaded`；
- `main-layout-ready`、`first-route-rendered`。

低风险候选仅限公开方法本来就是异步、且没有启动恢复职责的 registry 壳层，例如 `git-committer`、`window-automator`、`recall`、`ffmpeg-tools`、`git-analyzer`、`aio-file-operator` 和 `dir-search`。每项必须单独核对直接调用、factory、dispose、插件和类型契约。

重新评估全局 registry 拆分的触发条件：

- `registry + plugins` 中位数稳定超过 500 ms 或 P95 超过 1 s；
- `window-shown -> first-route-rendered` P95 超过 1 s，且主要成本确认在 registry；
- 插件数量增长导致启动耗时近似线性恶化；
- 未使用工具产生可观常驻内存、监听器或后台任务；
- Detached / Canvas 因无关主应用依赖出现明确卡顿。

### P4：剩余构建边界

按影响处理，不将所有 warning 都升级为阻塞项：

- 其他 ineffective dynamic import（聊天处理器一项已清理）；
- Monaco 快速销毁的上游取消 Promise 异常已随 0.57.0 升级修复，复现与复验见第 2.3、4.3 节；
- 插件 Node 脚本 glob；
- PDF Viewer 独立预算；
- `file-type` 等第三方警告；
- 首屏 gzip、单 chunk 和总 JavaScript 体积预算检查。

## 5. 停止条件

- 若首批编辑器与分组调整的运行态收益有限，保持当前 registry 模型，按需处理后续边界。
- 任一入口改造若改变同步公开契约、启动恢复或插件 discovery，应回退并另立架构计划。
- 完成 P1 和必要的 P4 预算后，将长期构建规则写入构建指南，删除本文。

## 6. 参考

- [Vue 异步组件](https://vuejs.org/guide/components/async.html)
- [Monaco 正式发布包元数据](https://registry.npmjs.org/monaco-editor/latest)（2026-10-31 查询）
- [Monaco Changelog](https://github.com/microsoft/monaco-editor/blob/main/CHANGELOG.md)
- [VS Code Word Highlighter](https://github.com/microsoft/vscode/blob/main/src/vs/editor/contrib/wordHighlighter/browser/wordHighlighter.ts)（修复另已核对 0.57.0 发布包）
- [Vite Build Options](https://vite.dev/config/build-options.html)
- [Vite 8 发布说明](https://vite.dev/blog/announcing-vite8)
- [Rolldown Code Splitting](https://rolldown.rs/in-depth/code-splitting)
