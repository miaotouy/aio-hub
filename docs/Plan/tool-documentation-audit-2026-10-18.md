# tools 模块文档同步核查（2026-10-18）

## 结论与范围

核查基于 `c1fb114ec`，范围为桌面端 `src/tools/` 的 **48 个顶层目录**，以及候选模块直接依赖的共享代码与 Rust 实现。

- **43 个目录有 `ARCHITECTURE.md`，5 个目录缺少该入口。** `retrieval` 是服务注册模块，也纳入目录统计。
- **9 个模块确认需要同步正文**：`asset-manager`、`color-picker`、`data-filter`、`media-info-reader`、`regex-applier`、`service-monitor`、`smart-ocr`、`sub-agent`、`web-canvas`。
- **3 个模块有轻微名称漂移**：`component-tester`、`directory-janitor`、`json-formatter`；`text-diff` 建议补充公共行为与分层说明。
- **9 个模块已抽查到关键变更同步记录**；其余 **21 个模块初筛低风险**。
- 跨模块架构总集篇存在数量与日期表述冲突；3 份计划文档发现失效的本地路径引用。

本轮交付核查清单，业务代码与既有模块文档保持原状。移动端模块可另行核查。

## 核查方法与判定口径

1. 枚举当前目录与 Markdown 文档，读取 `git log --name-only -- src/tools` 的完整本地历史，分别定位源码/测试、模块文档与架构入口的最近提交。
2. 对架构入口之后的改动做初筛；纯格式、许可证、图标替换和一般注册元数据变化优先降权。Git 最近修改日期只用于定位候选。
3. 对候选读取提交差异、现行文档、注册入口与直接实现，区分契约冲突、能力遗漏、名称漂移与常规内部重构。
4. 单独查看活跃模块的专题文档，避免将“架构首页未改、专题已同步”误报为滞后。
5. 检查本地文件引用，兼容仓库根路径、相对路径及 `:行号` 形式；示例协议 URL、代码片段与历史设计中的占位内容另行判断。

“已抽查同步”指已核对表中列出的关键变更；“初筛低风险”指所查提交没有暴露明显的架构主线矛盾。共享依赖和后端的全部历史变化仍可能影响这些模块，逐模块全量语义复核可在后续修文时继续。

## 一、优先同步的正文

### 1. color-picker：代表色契约仍停留在平均色

- **文档**：[ARCHITECTURE.md](../../src/tools/color-picker/ARCHITECTURE.md:86) 第 86–87 行仍描述分析结果返回平均色，并按平均色缓存坐标、分类。
- **实现**：[batchColorOrganizer.ts](../../src/tools/color-picker/batchColorOrganizer.ts:38) 定义 `average | dominant | vibrant`；[BatchResultToolbar.vue](../../src/tools/color-picker/components/BatchResultToolbar.vue:97) 提供色彩依据切换。
- **提交证据**：`e537e384a`（2026-09-08）增加批量代表色筛选，仅更新了 [batch-color-filter-sources.md](../../src/tools/color-picker/docs/Plan/batch-color-filter-sources.md)，架构正文仍沿用旧说法。
- **建议**：把三种代表色、切换后的分类/分组/导出投影与采样结果字段写回架构，并链接专题。目录扫描按钮属于次要交互补充。

### 2. sub-agent：后续落地的释出与审批链缺少架构入口

- **文档**：[ARCHITECTURE.md](../../src/tools/sub-agent/ARCHITECTURE.md) 覆盖任务状态、伴生视图和后台运行时，但缺少内置子智能体释出、模型解析、控制面板与后台审批链。
- **实现**：[BackgroundTaskCenter.vue](../../src/tools/sub-agent/components/BackgroundTaskCenter.vue:253) 挂载 `SubagentControlPanel`；`services/subAgentBaselineService.ts`、`services/subAgentModelResolver.ts` 实现释出与模型解析；[BackgroundTaskDetail.vue](../../src/tools/sub-agent/components/BackgroundTaskDetail.vue:172) 展示审批历史并承接人工操作和仲裁状态。
- **提交证据**：`38cf98d1a`（2026-10-04）实现内置子智能体；`9830fbdcd`（2026-10-06）接入后台审批与 JEV；`34db62f56`（2026-10-11）增加普通 LLM 审批引擎。
- **建议**：将 [已实施的释出方案](../../src/tools/sub-agent/docs/Plan/builtin-baseline-subagent.md) 的稳定契约提炼到架构；审批部分链接 [工具审批仲裁架构](../architecture/tool-approval-arbitration.md)，交代后台任务与前台审批的接续边界。

### 3. web-canvas：持久化根路径契约已变更

- **文档**：[ARCHITECTURE.md](../../src/tools/web-canvas/ARCHITECTURE.md:14) 第 14、39、162 行仍使用 `appDataDir` 表示项目和模板的根目录。
- **实现**：[useCanvasStorage.ts](../../src/tools/web-canvas/composables/useCanvasStorage.ts:79) 通过 `getAppConfigDir()` 定位项目目录；模板与索引管理也已迁移。
- **提交证据**：`19580d6db`（2026-09-26）支持 Windows 安装器自定义数据位置，替换了这些持久化调用。
- **建议**：统一为 `getAppConfigDir()` 返回的应用数据根目录，并保留相对目录结构；这是数据定位契约，排在纯命名修订之前。

### 4. service-monitor：注册中心与类型名称过时

- **文档**：[ARCHITECTURE.md](../../src/tools/service-monitor/ARCHITECTURE.md:10) 第 10、18–20 行仍以 `serviceRegistry` 和 `ToolService` 作为数据源与接口。
- **实现**：[ServiceMonitor.vue](../../src/tools/service-monitor/ServiceMonitor.vue:71) 引入 `toolRegistryManager` 和 `ToolRegistry`，第 88 行通过 `getAllTools()` 取数。
- **提交证据**：架构最后更新于 2025-11-21，后续经历工具注册体系重构与自动注册迁移，如 `3b12eff5f`、`ab5888622`。
- **建议**：更新数据源、接口名称与数据流图，链接现行工具注册指南。

### 5. regex-applier：状态与执行职责描述失配

- **文档**：[ARCHITECTURE.md](../../src/tools/regex-applier/ARCHITECTURE.md:36) 把输入/输出、执行日志与执行动作归入 `useRegexApplierStore`，时序图使用 `applyRulesForPreview()`、`applyRulesToFiles()`。
- **实现**：[stores/store.ts](../../src/tools/regex-applier/stores/store.ts:37) 暴露预设专用 `usePresetStore`；[RegexApplier.vue](../../src/tools/regex-applier/RegexApplier.vue:703) 直接编排输入执行，调用 [core/engine.ts](../../src/tools/regex-applier/core/engine.ts:209) 的 `processText()` / `processFiles()`。
- **提交证据**：`f5bfd07a7`（2026-01-13）抽取核心引擎，`14fdb6fbf`（2026-01-22）继续重构处理逻辑；架构最后更新于 2025-11-21。
- **建议**：保留 JS/Rust 双引擎主线，重写分层职责与两条执行时序。

### 6. media-info-reader：入口名称与能力清单均滞后

- **文档**：[ARCHITECTURE.md](../../src/tools/media-info-reader/ARCHITECTURE.md:29) 仍写 `MediaInfoReaderService`，主要能力只覆盖 WebUI、ComfyUI、ST 角色卡和 EXIF。
- **实现**：[media-info-reader.registry.ts](../../src/tools/media-info-reader/media-info-reader.registry.ts:40) 为 `MediaInfoReaderRegistry`，调用 `formatMetadataResult()`；[useMediaInfoParser.ts](../../src/tools/media-info-reader/composables/useMediaInfoParser.ts:86) 支持 AIO Bundle，页面还有发送到聊天能力。
- **提交证据**：2026-01-16 的 AIO Bundle、组件拆分与发送到聊天相关提交，以及 `42e52dabc`（2026-03-01）的 AI 图片元数据格式化；架构最后更新于 2025-11-21。
- **建议**：更新注册门面、解析支持矩阵、组件边界和面向 Agent 的格式化返回值。

### 7. smart-ocr：平台就绪契约遗漏

- **文档**：[ARCHITECTURE.md](../../src/tools/smart-ocr/ARCHITECTURE.md:118) 平台层与生命周期只描述识别分发，缺少 `ensureReady()`；切图算法仍仅概述行方差。
- **实现**：[platform/runner.ts](../../src/tools/smart-ocr/platform/runner.ts:42) 为 Native、Tesseract、Cloud、Plugin 分别执行就绪检查，`runOcr()` 首先等待该步骤；[useImageSlicer.ts](../../src/tools/smart-ocr/composables/useImageSlicer.ts:68) 使用 Otsu 阈值。
- **提交证据**：`47cca1bcc`（2026-09-07）增加预热/就绪，`e3ce9662b`（2026-09-14）调整阈值；自身架构最后更新于 2026-08-12。
- **交叉核对**：[realtime-subtitle-ocr 架构](../../src/tools/realtime-subtitle-ocr/ARCHITECTURE.md:96) 已记载这套就绪契约。
- **建议**：在能力所有者的架构中定义统一的初始化与失败行为，再由调用方链接；补充 Otsu 与灵敏度参数的关系。

### 8. data-filter：关键字保护行未进入筛选契约

- **文档**：[ARCHITECTURE.md](../../src/tools/data-filter/ARCHITECTURE.md:41) 的纯文本筛选只写随机删除、随机种子和忽略空行。
- **实现**：[dataFilter.logic.ts](../../src/tools/data-filter/logic/dataFilter.logic.ts:64) 定义 `keepKeywords` / `keepKeywordsEnabled`，命中关键字的行始终保留。
- **提交证据**：`609c8f07b`（2026-10-07）新增关键字保留，处于同日架构更新之后。
- **建议**：补充关键字匹配、受保护行与删除候选集的关系，并说明实际保留数量的边界。

### 9. asset-manager：存储配置与文档处理能力缺项

- **文档**：[ARCHITECTURE.md](../../src/tools/asset-manager/ARCHITECTURE.md:13) 将所有资产目录固定描述为 `$APPDATA/assets/`，架构未覆盖当前的文档预览与转换设置。
- **实现**：[asset_manager.rs](../../src-tauri/src/commands/asset_manager.rs:571) 优先采用 `customAssetPath`，否则使用应用数据根下的 `assets`；[AssetManager.vue](../../src/tools/asset-manager/AssetManager.vue:135) 接入 `DocumentViewer`，并承接文档转换设置。
- **提交证据**：`f687411e9`（2026-10-17）加入 WPS/OpenDocument 支持；模块架构最后更新于 2026-06-30。可配置资产路径的代码也已存在。
- **建议**：说明默认与自定义资产根的解析、索引相对位置，并加入文档预览/转换与共享组件的边界。

## 二、文档入口与轻量修订

### 缺少 ARCHITECTURE.md 的 5 个目录

| 模块 | 已有材料 | 建议覆盖的稳定内容 |
| --- | --- | --- |
| `agent-manager` | 组件 README、模型参数规则草案 | 模型/上下文配置、导入导出、持久化、资产与跨域迁移；优先补齐 |
| `user-profile-manager` | 模块内无 Markdown | 档案类型、索引/详情存储、头像资产、迁移与 Chat 消费边界 |
| `retrieval` | 其他领域文档有背景，模块内无 Markdown | Recall/Knowledge/mixed 模式、参数与返回值、Agent 授权边界；可采用简短架构加领域文档链接 |
| `window-automator` | 中心坐标系实施计划 | 流程状态、步骤执行、前后台输入、坐标变换、子流程与持久化 |
| `wallpaper-detector` | 已记录实施状态的施工计划 | 平台探测、预览/定位与错误降级；现有计划可继续保留验收历史 |

`agent-manager` 的 [组件 README](../../src/tools/agent-manager/components/README.md:7) 仍保留旧树形目录；[agentEditConfig.ts](../../src/tools/agent-manager/components/agent-editor/agentEditConfig.ts:106) 已提供模型参数与上下文页签（`36cd567e2`，2026-10-11），README 中缺少这两个入口。

### 轻微漂移与建议补充

- `directory-janitor`：[架构第 41、88 行](../../src/tools/directory-janitor/ARCHITECTURE.md:41) 的 `DirectoryJanitorService` 应对应当前 [DirectoryJanitorRegistry](../../src/tools/directory-janitor/directory-janitor.registry.ts:74)。Runner 主线仍适用。
- `json-formatter`：[架构第 30 行](../../src/tools/json-formatter/ARCHITECTURE.md:30) 的 `jsonFormatter.registry.ts` 应为 `json-formatter.registry.ts`。逻辑文件仍保留 camelCase 命名，修改时按实际路径区分。
- `component-tester`：[架构第 23 行](../../src/tools/component-tester/ARCHITECTURE.md:23) 的 `ThemePalette.vue` 应为 `ThemeColorPalette.vue`；最近 GPU 探针能力已有文档同步。
- `text-diff`：[架构分层](../../src/tools/text-diff/ARCHITECTURE.md:38) 可补入共享 `engine.ts` 与 Registry 调用，以及 [generatePatch()](../../src/tools/text-diff/engine.ts:130) 对空内容、相同内容、忽略空白后无差异的返回约定。`d23f6ede4`、`3c8f369e7`（2026-06-28）涉及相关行为与参数解析。

## 三、总集篇与本地引用问题

### 架构总集篇

[tools-architecture-overview.md](../architecture/tools-architecture-overview.md:3) 第 3 行仍写 `HEAD（2026-07-31）` 和 **41** 个模块，第 6 行同时写 **47** 个目录、**42** 个文档条目；当前实际为 **48** 个目录、**43** 个架构入口。5 个缺少入口的目录名单仍符合现状。

建议完成模块修订后同步总集篇的统计、摘要与复核日期，避免保留多个互相冲突的统计口径。

### 已确认的失效路径

| 文档位置 | 问题 | 当前目标/修复方向 |
| --- | --- | --- |
| [MiniMax Music 计划:238](../../src/tools/media-generator/docs/Plan/minimax-music-adapter-plan.md:238) | 引用已拆分的 `src/config/llm-presets.ts` | 改指 `src/config/llm-presets/index.ts` 或 `presets/minimax-music.ts` |
| [Recall 管线计划:14](../../src/tools/recall/docs/Plan/recall-retrieval-pipeline-modularization-plan.md:14) | `../__fixtures__/...` 少回退一级 | 应为 `../../__fixtures__/recall-migration-baseline-v1.json` |
| [内置子智能体计划:25](../../src/tools/sub-agent/docs/Plan/builtin-baseline-subagent.md:25) 等 8 处 | 从 `docs/Plan/` 引用相邻 `agent-manager` 时使用 `../../agent-manager/` | 应为 `../../../agent-manager/`；涉及行 25（两处）、80、82、135、137、293、475 |

这里记录路径导航问题；历史计划中的当时状态与验收记录仍应保留其时间语境。

## 四、逐模块初筛表

日期为 Git 中最近一次修改的提交日期，含格式化、图标及测试变更。“架构更新”专指入口文件；表中判定同时参考专题文档。

| 模块 | 架构更新 | 源码/测试更新 | 判定 | 核查备注 |
| --- | --- | --- | --- | --- |
| `agent-manager` | — | 2026-10-17 | 入口缺失 | 缺少架构入口；组件 README 仍保留旧目录树，缺少模型参数/上下文配置页。 |
| [aio-file-operator](../../src/tools/aio-file-operator/ARCHITECTURE.md) | 2026-10-04 | 2026-10-04 | 初筛低风险 | 架构更新后仅格式化变更。 |
| [api-tester](../../src/tools/api-tester/ARCHITECTURE.md) | 2026-08-01 | 2026-10-12 | 初筛低风险 | 后续业务变更集中于供应商预设内容，已抽查差异。 |
| [asset-manager](../../src/tools/asset-manager/ARCHITECTURE.md) | 2026-06-30 | 2026-10-17 | 需同步 | 存储根路径描述过于固定；缺少文档预览与转换边界。 |
| [code-formatter](../../src/tools/code-formatter/ARCHITECTURE.md) | 2026-09-20 | 2026-10-12 | 初筛低风险 | 后续为共享图标替换。 |
| [color-picker](../../src/tools/color-picker/ARCHITECTURE.md) | 2026-09-08 | 2026-10-17 | 需同步 | 架构仍按平均色分类，新实现支持 average/dominant/vibrant 三种依据。 |
| [component-tester](../../src/tools/component-tester/ARCHITECTURE.md) | 2026-09-19 | 2026-09-19 | 轻微漂移 | 架构举例 ThemePalette.vue，实际为 ThemeColorPalette.vue。 |
| [config-converter](../../src/tools/config-converter/ARCHITECTURE.md) | 2026-05-24 | 2026-10-12 | 初筛低风险 | 核心转换与双模式架构延续；单文件拖入可作为交互补充。 |
| [content-deduplicator](../../src/tools/content-deduplicator/ARCHITECTURE.md) | 2026-04-30 | 2026-10-12 | 初筛低风险 | 后续以注册适配、测试、格式及图标变更为主。 |
| [danmaku-player](../../src/tools/danmaku-player/ARCHITECTURE.md) | 2026-06-15 | 2026-10-12 | 初筛低风险 | 后续为全局样式/弹窗/图标调整；DanmakuEngine 链接实际指向现存文件。 |
| [data-filter](../../src/tools/data-filter/ARCHITECTURE.md) | 2026-10-07 | 2026-10-12 | 需同步 | 纯文本筛选漏记保留关键字及其与随机删除数量的关系。 |
| [dir-search](../../src/tools/dir-search/ARCHITECTURE.md) | 2026-08-01 | 2026-09-30 | 初筛低风险 | 主要架构仍匹配；后续补了带引号路径与 UNC 识别修复。 |
| [directory-janitor](../../src/tools/directory-janitor/ARCHITECTURE.md) | 2025-11-21 | 2026-10-12 | 轻微漂移 | 架构仍写 DirectoryJanitorService，当前门面为 DirectoryJanitorRegistry。 |
| [directory-tree](../../src/tools/directory-tree/ARCHITECTURE.md) | 2026-09-09 | 2026-10-12 | 初筛低风险 | 后续为共享图标替换。 |
| [embedding-playground](../../src/tools/embedding-playground/ARCHITECTURE.md) | 2026-07-18 | 2026-10-12 | 初筛低风险 | 后续为格式及图标变更。 |
| [ffmpeg-tools](../../src/tools/ffmpeg-tools/ARCHITECTURE.md) | 2026-10-11 | 2026-10-12 | 初筛低风险 | 最新架构后为进度显示精度与图标调整。 |
| [git-analyzer](../../src/tools/git-analyzer/ARCHITECTURE.md) | 2026-10-04 | 2026-10-12 | 初筛低风险 | 最新架构后为格式及图标变更。 |
| [git-committer](../../src/tools/git-committer/ARCHITECTURE.md) | 2026-10-13 | 2026-10-13 | 已抽查同步 | 预览标签页与 Alt 临时预览提交同步修改架构。 |
| [json-formatter](../../src/tools/json-formatter/ARCHITECTURE.md) | 2026-08-01 | 2026-10-08 | 轻微漂移 | 架构仍引用 jsonFormatter.registry.ts，实际为 json-formatter.registry.ts。 |
| [knowledge-base](../../src/tools/knowledge-base/ARCHITECTURE.md) | 2026-08-09 | 2026-10-12 | 初筛低风险 | 后续以迁移提示、测试、样式与图标变更为主。 |
| [llm-chat](../../src/tools/llm-chat/ARCHITECTURE.md) | 2026-10-17 | 2026-10-18 | 已抽查同步 | 10-18 媒体附件占位、VCP 分段排队修复均更新对应专题文档。 |
| [llm-inspector](../../src/tools/llm-inspector/ARCHITECTURE.md) | 2026-08-09 | 2026-10-12 | 初筛低风险 | 后续为色值及图标变更。 |
| [media-generator](../../src/tools/media-generator/ARCHITECTURE.md) | 2026-10-17 | 2026-10-17 | 已抽查同步 | 输入框展开及面板交互已入架构；后续列表变更仅固定行高。 |
| [media-info-reader](../../src/tools/media-info-reader/ARCHITECTURE.md) | 2025-11-21 | 2026-10-12 | 需同步 | 旧门面名称与能力清单滞后，漏记 AIO Bundle 和格式化输出。 |
| [realtime-subtitle-ocr](../../src/tools/realtime-subtitle-ocr/ARCHITECTURE.md) | 2026-09-14 | 2026-09-26 | 已抽查同步 | 引擎就绪/预热与后续能力已有文档；路径迁移未发现直接矛盾。 |
| [recall](../../src/tools/recall/ARCHITECTURE.md) | 2026-09-20 | 2026-10-17 | 初筛低风险 | 架构后主要为 invoke 参数修正及共享列表迁移；计划中有失效 fixture 链接。 |
| [regex-applier](../../src/tools/regex-applier/ARCHITECTURE.md) | 2025-11-21 | 2026-10-12 | 需同步 | 架构把执行状态和执行动作归入旧 Store，当前由视图调用 core/engine。 |
| `retrieval` | — | 2026-07-19 | 入口缺失 | 纯服务注册模块，缺少本地文档入口；Recall/Knowledge 文档仅提供分散背景。 |
| [rich-text-renderer](../../src/tools/rich-text-renderer/ARCHITECTURE.md) | 2026-10-17 | 2026-10-17 | 已抽查同步 | 缺图占位与近期渲染改动有架构同步。 |
| [service-monitor](../../src/tools/service-monitor/ARCHITECTURE.md) | 2025-11-21 | 2026-10-12 | 需同步 | 架构使用旧 serviceRegistry/ToolService，当前读取 toolRegistryManager/ToolRegistry。 |
| [sketch-pad](../../src/tools/sketch-pad/ARCHITECTURE.md) | 2026-10-14 | 2026-10-14 | 已抽查同步 | 导出 PNG 到剪贴板提交同步修改架构。 |
| [skill-manager](../../src/tools/skill-manager/ARCHITECTURE.md) | 2026-10-04 | 2026-10-12 | 初筛低风险 | 后续为共享图标替换。 |
| [smart-ocr](../../src/tools/smart-ocr/ARCHITECTURE.md) | 2026-08-12 | 2026-10-12 | 需同步 | 平台就绪/预热契约未补入自身架构；切图算法未说明 Otsu 阈值。 |
| [st-worldbook-manager](../../src/tools/st-worldbook-manager/ARCHITECTURE.md) | 2026-07-08 | 2026-10-12 | 初筛低风险 | 后续为共享图标替换。 |
| [sub-agent](../../src/tools/sub-agent/ARCHITECTURE.md) | 2026-10-04 | 2026-10-11 | 需同步 | 架构缺少内置子智能体释出、控制面板、后台审批与双引擎仲裁。 |
| [symlink-mover](../../src/tools/symlink-mover/ARCHITECTURE.md) | 2026-10-04 | 2026-10-12 | 初筛低风险 | 后续为共享图标替换。 |
| [system-pulse](../../src/tools/system-pulse/ARCHITECTURE.md) | 2026-04-25 | 2026-07-04 | 初筛低风险 | 架构后主要为注册文件命名、图标 markRaw、版本和格式调整。 |
| [text-diff](../../src/tools/text-diff/ARCHITECTURE.md) | 2025-11-21 | 2026-10-12 | 建议补充 | 建议补充 engine.ts 与 Registry 复用，以及补丁无差异结果契约。 |
| [token-calculator](../../src/tools/token-calculator/ARCHITECTURE.md) | 2026-10-04 | 2026-10-17 | 初筛低风险 | 后续为共享列表实现迁移，未见架构主线冲突。 |
| [tool-calling](../../src/tools/tool-calling/ARCHITECTURE.md) | 2026-10-11 | 2026-10-11 | 已抽查同步 | 已有双引擎自动审批说明及专题链接；后续审批配置 UI 迁移无需重写执行架构。 |
| [transcription](../../src/tools/transcription/ARCHITECTURE.md) | 2026-10-11 | 2026-10-12 | 初筛低风险 | 最新输出清理变更已同步架构，后续为图标替换。 |
| [translator](../../src/tools/translator/ARCHITECTURE.md) | 2026-09-14 | 2026-09-26 | 初筛低风险 | 架构更新后仅格式化变更。 |
| `user-profile-manager` | — | 2026-07-28 | 入口缺失 | 模块内无 Markdown；存储/索引迁移/头像资产规则缺少架构入口。 |
| [vcp-connector](../../src/tools/vcp-connector/ARCHITECTURE.md) | 2026-10-15 | 2026-10-17 | 已抽查同步 | 全局启动项接管自动连接已入架构，后续为共享列表迁移。 |
| `wallpaper-detector` | — | 2026-10-12 | 入口缺失 | 现有施工计划记录了实现与验收边界，缺少稳定架构入口。 |
| [web-canvas](../../src/tools/web-canvas/ARCHITECTURE.md) | 2026-08-11 | 2026-10-12 | 需同步 | 文档仍写 appDataDir，代码已切换 getAppConfigDir 以支持自定义数据位置。 |
| [web-distillery](../../src/tools/web-distillery/ARCHITECTURE.md) | 2026-10-17 | 2026-10-17 | 已抽查同步 | DeepSeek 搜索/抓取与执行/配置生命周期重构同步修改架构。 |
| `window-automator` | — | 2026-10-04 | 入口缺失 | 仅中心坐标系计划，缺少流程执行、前后台输入和持久化总体说明。 |

## 五、建议处理顺序

1. 先同步 `color-picker`、`sub-agent`、`web-canvas`、`smart-ocr` 的运行时与数据契约，修正旧注册中心/执行分层描述。
2. 补齐 `agent-manager`、`user-profile-manager`、`retrieval` 的架构入口，并同步 `media-info-reader`、`data-filter`、`asset-manager` 的公共能力说明。
3. 补充另外两个模块的架构入口，集中修正轻微名称漂移、本地路径引用和总集篇。

本轮仅新增此核查报告，采用目录计数、Git 差异与源码对照验证；构建和业务测试留给涉及实现变更的任务。
