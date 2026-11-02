# 动态导入与启动加载边界调查

> 状态：编辑器、聊天工厂、薄宿主/面板按需加载与 Monaco 0.57.0 已实施，后续窗口/领域拆分按需推进
> 最近更新：2026-10-31
> 影响范围：`llm-chat` 会话生成装配、公共标题栏、窗口根组件、编辑器加载边界

## 结论

实施前构建中的 `INEFFECTIVE_DYNAMIC_IMPORT` 来自 `sessionGenerationManager.ts` 对 `useChatHandler` 的动态导入。该模块同时被聊天 Store、上下文统计和上下文分析器静态引用，已经进入主入口的静态依赖集合。

已通过必需工厂注入收敛会话生成依赖并清理该警告，保留请求时才创建处理器的时序。进一步调查已确认，公共编辑器内 Monaco 按需加载与撤掉编辑器粗分组的构建收益最大，详见[跨模块 Chunk 治理计划](../../../../../docs/Plan/frontend-chunk-size-investigation.md#3-2026-10-31-加载边界深入调查)。

代码格式化工具的 Prettier 核心及解析器均维持按需加载，本次警告与此前 PHP 原生化改动无关。

首批之后的最终输出复算与下一批构建对照见跨模块计划第 4 节；下文早期构建表保留为依赖定位记录。

## 调查方式与口径

- 使用当前安装的 Vite 8.1.4 和仓库 `vite.config.ts` 进行生产构建。
- 临时分析插件在 `generateBundle` 采集模块导入关系、产物模块归属、chunk 的静态与动态引用以及压缩后 JS 字节数。
- 构建配置覆盖 `write: false`，保留正式源码与 `dist`；分析脚本、日志和 JSON 均在已忽略的 `.tmp/dynamic-import-investigation/`。
- 以 `index.html` 对应入口递归遍历 chunk 的 `imports`，计算入口静态依赖集合；按文件去重。
- 以下体积为本次构建的 JS 数据，不含 CSS、独立 Worker、WASM 等其他资源。它描述打包依赖关系；实际启动耗时、WebView 缓存与运行时额外请求仍需单独测量。

## 1. 警告的具体来源

实施前的动态入口位于 `stores/session/sessionGenerationManager.ts` 的 `getChatHandler()`。三个静态使用方为：

- `stores/llmChatStore.ts`：工具事件重新解析等操作直接使用 `useChatHandler()`。
- `composables/features/useChatContextStats.ts`：构建上下文预览，用于统计。
- `components/context-analyzer/ContextAnalyzerDialog.vue`：获取上下文预览。

其中 Store 还会创建 `sessionGenerationManager`，而 `useChatHandler` 反向引用 Store。当前动态导入的注释强调延后加载以避开初始化循环。调整时需要保留工厂的延后调用时机，避免在 Store 构造期间直接调用处理器。

生产产物中，`useChatHandler` 与 `sessionGenerationManager` 同处聊天 Store chunk，`useChatHandler` 没有独立异步 chunk。

此外，管理器动态引用的 `useSessionManager` 和 `useChatInputManager` 也存在多处静态使用，并已在入口静态依赖集合中。警告数量无法完整表达按需加载的覆盖程度。

## 2. 启动阶段的真实加载边界

### 聊天逻辑

已核对一条从入口开始的静态依赖路径：

```text
main.ts
  → DetachedWindowContainer.vue
  → TitleBar.vue
  → llmChatStore.ts
  → useChatHandler.ts
```

`llm-chat.registry.ts` 中工具页使用 `() => import("./LlmChat.vue")`。公共标题栏的任务跳转与伴随会话等功能仍依赖聊天 Store，因此仅调整工具页路由或单个管理器导入，收益有限。聊天 Store 还有来自 Agent 编辑器和 sub-agent 模块的外部引用，后续需要逐条划定职责边界。

### 编辑器

入口静态依赖集合也包含 Monaco 核心。一条已核对的产物依赖路径为：

```text
main
  → DetachedComponentContainer
  → CompanionSessionSheet
  → MessageList
  → RichCodeEditor
  → monaco
  → editor.api2
```

`main.ts` 静态导入全部窗口根组件，再通过路径分支选择一个。窗口使用条件不会撤销模块的静态依赖关系。

本次构建主入口静态可达 **293 个 JS chunk，合计约 11.80 MB**。其中较大的产物如下，单位为十进制 MB：

| 产物                 | 压缩后 JS |     gzip | 主入口静态可达 |
| -------------------- | --------: | -------: | -------------- |
| Monaco `editor.api2` |  3.627 MB | 0.927 MB | 是             |
| `vendor-editor`      |  1.380 MB | 0.490 MB | 是             |
| `vendor-element`     |  1.085 MB | 0.338 MB | 是             |
| `PdfViewer`          |  2.479 MB | 0.811 MB | 否             |

较大产物需要按是否提前加载分别处理。当前 `manualChunks` 的编辑器分组也需要一并检查，避免调整组件边界后仍由共享依赖提前带入重型模块。

## 3. 消除警告的最小方案与构建试验

`GenerationManagers` 已提供 `createChatHandler` 工厂注入接口，现有管理器单测也已使用该接口。实施前正式 Store 装配尚未传入该接口，运行时使用动态导入回退；本轮已显式注入并移除回退。

已实施改法：

1. 将 `createChatHandler` 调整为必需依赖。
2. 在 Store 装配管理器时传入 `createChatHandler: () => useChatHandler()`。
3. 管理器使用传入工厂，移除动态导入回退；保留请求发生时才调用工厂的时序。

实施前通过临时构建插件对以上两处源码施加内存转换，进行了对照构建；以下为工厂注入单项试验结果，正式组合实现见第 4 节。

| 指标                           |   当前实现 | 工厂注入试验 |
| ------------------------------ | ---------: | -----------: |
| 本条无效动态导入警告           |         有 |         消失 |
| 主入口静态可达 JS chunk        |        293 |          293 |
| 主入口静态 JS 总字节           | 11,801,799 |   11,801,619 |
| 聊天处理器位于入口静态依赖集合 |         是 |           是 |

两次构建均成功，差异仅 180 字节。该方案能收敛管理器依赖、清理警告，加载体积收益很小。Store 与处理器的既有相互引用仍需在后续职责拆分中处理。

## 4. 深入调查与实施顺序

跨模块构建对照与生命周期分析已合并至[前端 Chunk 治理计划](../../../../../docs/Plan/frontend-chunk-size-investigation.md)，避免将窗口启动、公共编辑器和聊天领域改造拆成重复计划。

1. **加载量优化**：公共 `RichCodeEditor` 内按引擎加载 Monaco，并撤掉编辑器粗分组。构建试验中入口静态 JS 从约 11.80 MB 降至 7.37 MB；补入注册与主布局依赖后仍减少约 4.43 MB。本轮已正式实施，最终生产构建入口静态 JS 为 7.47 MB；原型与正式结果分别记录。
2. **警告清理**：本文件第 3 节的工厂注入方案已实施，保持发送、继续生成、重新生成与排队调度行为。
3. **窗口职责**：窗口根组件异步化会明显降低入口数字，但大部分主布局依赖随后加载；单独实施时整体构建集合仅减少约 26 KB，排在编辑器优化之后。
4. **公共壳层**：伴随面板延后前，先迁出其持久化恢复与跨窗口任务同步职责；标题栏状态与异步动作逐步解耦。
5. **聊天领域**：上下文预览/统计与发送执行能力分层，保留标准管道和历史参数口径。

工厂注入复用 `bun run test:run src/tools/llm-chat/stores/session/__tests__/sessionManagers.test.ts`；正式前端实现执行 `bun run build:tsc`、`bun run build:vite` 与相关行为测试。涉及窗口、编辑器和同步生命周期的修改，再在真实 Tauri 中走查对应场景。

正式实现已通过 4 个相关测试文件的 14 项用例、`bun run build:tsc` 和 `bun run build:vite`。真实 Tauri 已走查普通编辑、引擎切换、Diff、主题和 Worker。按所有 Vite 输出钩子完成后统一复算，入口静态 JS 从 11,900,181 字节降到 7,473,488 字节，减少约 37.2%；真实启动耗时和窗口收益仍待测量。走查发现的 Monaco 内部快速销毁取消异常已在跨模块计划第 2.3 节单独记录，直接引擎调用也可复现。

## 5. 下一批调查结果

2026-10-31 已完成保留持续同步服务的薄宿主构建原型：标题栏两个面板首次打开加载，伴随会话视图由常驻宿主按需渲染。入口静态 JS 从 7.473 MB 降至 6.343 MB，补入注册与主布局后的集合减少约 1.122 MB。正式组合实现入口为 6,348,409 字节，补齐注册与主布局为 7,514,562 字节；已完成 11 项相关用例、类型检查、生产构建和真实 Tauri 单/双窗口验证，详细生命周期与构建口径见[跨模块计划第 4 节](../../../../../docs/Plan/frontend-chunk-size-investigation.md#4-下一批调查与实施建议)。

Monaco 同批升至 0.57.0，迁移 Worker 公开子路径并通过官方生成脚本同步 2,153 条简中消息；快速销毁取消异常已复验修复。

仍需保留 `GlobalProviders → SyncServiceProvider → useLlmChatSync → llmChatStore` 的现有同步职责。预览拆分还须覆盖分支导出的底层预览入口；统计、分析器与导出共同迁移，保留标准管道和历史参数语义。第三批已完成窗口根按路径加载和静态组件路由修复；选择根之前入口静态 JS 为 3,900,841 字节，主窗口补齐集合为 7,499,387 字节，较第二批减少约 15 KB。四类真实窗口、原始含冒号路径刷新及文件拖放走查通过，真实启动耗时仍待测量。
