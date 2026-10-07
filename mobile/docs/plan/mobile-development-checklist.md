# 移动端当前施工总表

> 状态：狂奔施工模式；优先连续补齐可见功能链，平台验证与性能收口后置
> 最近核对：2026-10-03
> 文档定位：移动端跨模块施工顺序、功能队列和后置验证入口；实现细节仍以各模块 `ARCHITECTURE.md` 和专项计划为准

## 1. 当前施工口径

移动端从“先完成全部平台验收再继续开发”切换为**功能优先、验证后置**。当前工作先把用户能连续使用的链路做出来，在现有 Android/开发环境中快速串通；真机、iOS、性能和跨端收口单独记录，等功能积累到足够完整后集中处理。

- 计划是功能清单和施工顺序，平台报告是后置验证记录。未验证项保持如实标记，不阻拦其他功能施工。
- 一个功能链从入口到结果可用后即可进入下一条链，允许保留临时实现、局部重复和待整理代码。
- 测试以功能片段完成后的最小冒烟为主；真实回归出现后再补针对性测试。性能数据不足时保持当前实现，不提前启动架构重构。
- Android 真机和 iOS 结果用于发布收口与平台差异处理，不把它们提前变成每个功能的完成条件。
- 凭据、用户数据、文件删除和原生执行面仍按现有安全边界处理；其余工程整理、跨端对齐和性能优化进入后置队列。

**版本与兼容性现状**：移动端目前尚未发布任何公开版本，没有现存用户群、历史数据格式或公开客户端需要优先兼容，当前施工可以优先追求完整可用的功能链。SQLite schema、资产引用和数据边界仍保持清晰，首次公开发布前再根据实际发布形态建立正式的迁移与版本兼容策略。

## 2. 当前结论

角色聊天的基础闭环已经具备：会话树、恢复/重试/停止、Agent 与预设、宏与变量、传统关键词世界书、注入编排、Token 文本预算、附件原生发送、文档提取回退、统一媒体预览、富文本基础渲染和 Android AVD 日常回归均已落地。

接下来继续围绕用户可见成果推进，不把“基础链路已落地”误读为“产品功能停止施工”：

1. 资产管理器和聊天附件的完整可玩链路；
2. 正式聊天中的图片、视频、音频预览；
3. 真实消息中的 Markdown、代码、公式、提示块、媒体组合和流式体验；
4. Agent、预设、开局消息和聊天切换等可见功能；
5. 功能链稳定后，再集中补 Android 真机、iOS 和真实性能证据。

## 3. 当前功能施工队列

### A — 资产管理器与聊天附件

- [x] 串通资产导入、列表、详情预览、导出、删除影响分析和应用重启恢复。
- [x] 串通聊天内资产选择、正式附件发送、流式回复和消息恢复。
- [x] 在真实聊天中保留并呈现 `reclaimed` / `missing` 等异常状态，失败和取消路径先以现有领域命令跑通。
- [x] 正式 Rust command 直读系统 URI 并流式导入；需要细化的 Android/iOS 差异记入后置验证队列。

实现入口：[`mobile-asset-manager-design.md`](./mobile-asset-manager-design.md)、[`mobile-sqlite-migration-plan.md`](./mobile-sqlite-migration-plan.md)、[`asset-manager/ARCHITECTURE.md`](../../src/tools/asset-manager/ARCHITECTURE.md)。

### B — 正式聊天媒体

- [x] 把图片、视频、音频预览接到正式消息和附件，不只停留在资产页或测试页。
- [x] 优先完成打开、播放、返回、切换和错误状态等连续操作；手势、方向、后台播放和设备音频随后根据真实设备反馈收口。
- [x] 复用受管 preview descriptor 和 URL 回收机制，先保证媒体能用，再集中处理长视频和大媒体表现。

实现入口：[`mobile-media-components-plan.md`](./mobile-media-components-plan.md)、[`rich-text-renderer-migration-plan.md`](../../src/tools/rich-text-renderer/docs/Plan/rich-text-renderer-migration-plan.md)。

### C — 富文本渲染引擎与 AST 管线

- [x] **复用 PC 核心 AST 解析与流式管线（多功能渲染前置基础，杜绝二次重写）**：
  - 直接复制/移植 PC 现成纯 TS 解析层（`parser/Tokenizer.ts`、`parser/block/`、`parser/inline/`、`core/CustomParser.ts`、`core/StreamProcessorV2.ts`），天然支持完整 Markdown、KaTeX、思考块、VCP 协议及复杂嵌套。
  - 用轻量化 `AstNodeRenderer` 统一派发机制替代现存脆弱的手写正则分段（`renderSegments`），收敛并挂载移动端现有轻量节点组件（`CodeBlock`、`KatexRenderer`、`ThinkBlock`、`MermaidDiagram`、`RichTextMediaNode`）。
  - 直接启用 PC 已成熟的流式稳定区/待定区（Frozen/Pending AST）机制，彻底解决打字流式过程中 DOM 重建导致的公式抖动、代码高亮重刷、折叠与媒体播放状态重置。
- [x] 在正式聊天与独立测试页中完成 Markdown、代码块、KaTeX、提示块、思考块、Mermaid 与受管媒体的组合验证。
- [x] 优化窄屏排版、自动断行、横向滚动与长消息滚动体验。渲染器根容器统一 `overflow-wrap: anywhere`，行内代码与 HTML 字面块不再一刀切 `break-all`；表格 `min-width: max-content` 保证列不被压碎并继续走 `.md-table-wrapper` 横向滚动；VCP 结果 `pre` 对齐代码块 50vh 内部滚动；消息气泡补齐 `min-width: 0` 收缩链路，长消息仍由消息列表统一纵向滚动，不产生渲染器内部滚动或水平溢出。

实现入口：[`rich-text-renderer/ARCHITECTURE.md`](../../src/tools/rich-text-renderer/ARCHITECTURE.md)、[`rich-text-renderer-migration-plan.md`](../../src/tools/rich-text-renderer/docs/Plan/rich-text-renderer-migration-plan.md)。

### D — Agent 与聊天可见功能

- [x] 继续补齐 Agent 详情、预设、开局消息、宏变量和聊天切换中的用户可见行为。详情编辑、预设消息体系、开局消息固化、宏展开与聊天内 Agent 选择器均已落地（2026-09-26 前后，见角色卡对齐计划与 agent-manager 计划）。
- [x] PC PNG 角色卡的小型头像预览随 Agent 配置保存并在角色大厅、聊天选择器复用。
- [x] 私有音频/视频按模型能力内联进请求（capabilities 未配置或 true 时尝试内联，显式 false 才降级为文本描述；2026-10-03）；Agent 资产管理 UI 已接入 Agent 详情页（分组过滤、添加落盘、编辑、删除与引用级联清理，2026-10-03）。
- [x] 角色卡导入与详情编辑补齐（2026-10-07）：AIO 导出包 `bundledWorldbooks` 内嵌世界书落库并回写 `worldbookIds`（VCP Chat config 跳过 + script 正则告警）；Agent 详情页新增开局消息编辑、正则脚本查看/启用、分类与标签编辑，保存失败反馈；世界书条目编辑器暴露 selective/probability/role 高级字段与 6 值位置，会话支持重命名，上下文预警阈值可调。
- [ ] 工具调用、RAG、Knowledge/Recall 和自主工作流保持独立设计，需求出现时再连续施工。

实现入口：[`mobile-agent-manager-plan.md`](./mobile-agent-manager-plan.md)、[`agent-manager/ARCHITECTURE.md`](../../src/tools/agent-manager/ARCHITECTURE.md)。

## 4. 新增功能模拟器 E2E 测试需求清单

> 引用：[`mobile-android-avd-e2e.md`](../architecture/mobile-android-avd-e2e.md) 已定义 runner、selector、设备所有权、产物脱敏和确定性 mock 服务的长期契约；以下只列 2026-09-25 之后新落地功能在 Android AVD 回归中的缺口，不重复既有 smoke/asset/media/rich-text/attachment/recovery 覆盖。
> 现状：Agent 角色卡导入、预设消息、开局消息、私有资产与运行时消费已有 Vitest/Rust 覆盖，但缺 Android 运行态的「正式 UI + Tauri IPC + 原生文件选择器」闭环。
> 最近核对：2026-10-03

### 4.1 施工口径与边界

- runner 入口、单 ABI APK 校验、失败取证与脱敏规则沿用 `tests/mobile-android-e2e/`，不新建第二套 driver。
- 断言走稳定 `data-testid`、可访问名称和可观察状态；禁止坐标、截图识别和固定 `sleep`。
- 涉及聊天/私有附件时复用确定性 OpenAI-compatible mock 服务，证明服务端确实收到 Agent system prompt 与私有附件字节，并记录脱敏请求摘要。
- 结果只解除 AVD 自动化回归，不替代 Android 真机、iOS、真实模型理解或性能报告。

**实现状态（2026-10-03）**：`agent` preset、三个 spec、角色卡 fixture、mock 人设检测、app 侧 `data-testid` 已落地；`bun run test:mobile:e2e -- --unit`（42 用例）与 `--typecheck` 均通过，移动端 `bun run build` 通过。**Android Studio AVD 单次运行已通过**（run `2026-10-02T19-31-36-347Z`，`agent-import` / `chat-agent` / `agent-assets` 全部 passed，约 4 分 13 秒）。**10 次稳定性连跑与并入 `core` 仍待执行**：该主机连续运行无论逐轮冷启动、复用常驻 AVD 还是每轮重启 adb/emulator，都会在**第 2 轮**出现 `adb shell` 无响应（`cat /proc/net/unix` / `pgrep` 超时，而 `adb devices` 正常），属宿主 adb/模拟器稳定性问题，需环境修复后再执行连跑。下列断言项即为连跑验证清单。

### 4.2 A — Agent 角色卡导入与详情闭环（`agent-import`）

- [ ] 从角色大厅正式导入入口选择 PNG V2 角色卡 fixture，等待导入反馈完成（不通过测试 IPC 直接写 Agent）。
- [ ] 断言解析后的角色名、系统提示、描述、性格、场景与开场白正确落入 Agent 详情。
- [ ] 断言小于 3 MiB 的头像在角色大厅与详情页可见，编辑保存后不丢失。
- [ ] 断言导入错误文件时反馈包含文件名与首个可行动原因，不产生半成品 Agent。
- [ ] 冷启动重启后断言 Agent 配置与头像持久化。
- [ ] （可选，视 fixture 能力）AIO 包导入时断言头像文件、`assets/` 与 `worldbooks/` 落盘回写。

### 4.3 B — 聊天内 Agent 绑定与开局消息（`chat-agent`）

- [ ] 从角色大厅发起对话，断言新会话 `displayAgentId` 绑定该 Agent。
- [ ] 断言有效开局消息按 `defaultGreetingId` 固化为根节点下的兄弟分支，分支切换保留。
- [ ] 断言开局消息在 UI 显示原文，`{{char}}` / `{{user}}` / `{{persona}}` 等宏由请求管线展开，请求侧不再残留未展开宏标记。
- [ ] 在聊天内 Agent 选择器切换角色，断言只更新会话 `displayAgentId`，既有消息不被改写，后续助手消息固化新 Agent 与模型/渠道快照。
- [ ] 通过确定性 mock 服务断言请求携带 Agent system prompt、预设注入顺序与 Agent 模型参数；返回分段 SSE 并断言 UI 流式完成。
- [ ] 冷启动重启后断言会话、Agent 绑定、开局分支与消息从 SQLite 恢复。

### 4.4 C — Agent 私有资产与运行时消费（`agent-assets`）

- [ ] 在 Agent 详情页内嵌资产区多选添加图片与音频，断言即选即落盘、分组过滤、描述与分组编辑。
- [ ] 断言全局资产管理器不暴露 Agent 私有资产，私有资产不登记全局 usage。
- [ ] 私有图片被预设消息 / 开局附件引用时，经确定性 mock 断言以 base64 内联进 vision，字节与 fixture 一致。
- [ ] 私有音频/视频按模型 capability 内联或降级为文本描述，断言降级路径 warning 与请求形态。
- [ ] 删除私有资产时断言预设 `presetAttachments` 与 `greetings[].attachments` 引用被级联清理。
- [ ] 删除 Agent 断言 `agents/{id}/` 私有目录（头像与 `assets/`）被递归清理，重启后不再出现。

### 4.5 D — 已覆盖与暂缓

- 富文本 AST 管线、受管媒体、确定性聊天附件与失败恢复已分别由 `rich-text`、`rich-text-media`、`media`、`attachment`、`recovery` preset 覆盖，不重复施工。
- 工具调用、Knowledge/Recall、RAG 与自主工作流尚未实现，其 E2E 需求随功能设计一并补充。

### 4.6 交付物

- [x] `presets.ts` 新增 `agent` preset（确定性 mock、80 MiB 基线）；并入 `core` 待 AVD 运行稳定后执行。
- [x] `runner-options.ts` 增加 `agent` preset id 与单元测试。
- [x] `agent-import` / `chat-agent` / `agent-assets` 三个 spec 走正式 UI 与领域链路。
- [x] fixture：PNG V2 角色卡（内置固定人设标记），私有图片复用现有 image fixture；导入错误样本、私有音频 fixture 暂缺，按需补。
- [x] AVD 单次运行通过（2026-10-03，三场景 passed），结果已回写 [`mobile-android-avd-e2e.md`](../architecture/mobile-android-avd-e2e.md)。
- [ ] 10 次稳定性连跑与并入 `core`，并回写 `agent-manager/ARCHITECTURE.md`。

## 5. 后置验证队列

以下事项继续记录真实状态，但只在对应功能链完成后集中处理：

- Android 真机：资产主流程、正式聊天附件、媒体手势、方向、安全区、设备音频、长消息和内存表现。
- iOS：编译、设备运行、SQLite/FTS5、security-scoped URL、文件选择器、预览、分享、后台行为和重启恢复。
- Token：首次初始化、批量计数、长消息/流式场景的交互流畅度和峰值内存。
- 发布报告：设备型号、系统版本、ABI、应用版本、场景结果和失败证据。

AVD、普通浏览器和单元测试的结果仍需按实际环境标记；它们可以支持日常施工和回归定位，不能替代目标平台的发布报告。这个边界用于描述证据范围，不用于暂停功能开发。

入口：[`mobile-android-avd-e2e.md`](../architecture/mobile-android-avd-e2e.md)、[`platform-validation-workbench-plan.md`](../../src/tools/ui-tester/docs/Plan/platform-validation-workbench-plan.md)、[`mobile-token-counting-plan.md`](./mobile-token-counting-plan.md)。

## 6. 已落地基础

- [x] Chat 会话 CRUD/恢复/分支/引用/停止/重试、Agent/预设/开局消息、宏变量、传统关键词世界书、注入编排、文本 Token 预算和上下文裁剪。
- [x] `ManagedAssetRef` 轻量快照、SQLite 会话/消息与附件引用、原生 Provider wire、文档提取文本回退、usage outbox 和降级状态。
- [x] Android AVD 资产、附件、音频、视频和富文本固定场景，以及确定性附件发送与恢复回归。
- [x] RichTextRenderer 的代码块、KaTeX、GitHub 风格提示块、思考块、只读 VCP 展示、Mermaid 安全基础渲染和受管媒体节点。
- [x] Agent Manager 基础 CRUD、角色大厅、预设消息编辑和导入导出能力。

## 7. 暂缓队列

- Worker 离线线程分词器（优先保证主线程轻量 AST 稳定与性能，待有实测卡顿数据后再评估下沉）。
- HTML 输出白名单或沙箱；当前保持现有安全字面量渲染边界。
- 相机、分享进入 AIO、移动端文件关联、批量转写、音视频模型转写、PDF/Office 深度提取和跨设备同步。
- 跨端完全对齐、统一抽象、性能基线和共享包抽取；先等功能链和真实数据说明收益。

## 8. 执行节奏

1. 连续施工 A/B/C/D 功能队列，优先让链路在当前环境可操作、可观察、可恢复。
2. 每条链完成后做一次最小冒烟，出现真实回归再补测试和修复。
3. 功能链稳定后，用同一批功能集中补 Android 真机、iOS 和性能报告。
4. 只有真实设备数据暴露明确热点时，才决定 Worker、Rust、原生下沉或共享包抽取。
5. 稳定边界、数据流和已验证行为回写对应 `ARCHITECTURE.md`；本表维护施工队列与后置验证状态。

专项计划：

- [`mobile-agent-manager-plan.md`](./mobile-agent-manager-plan.md)
- [`mobile-asset-manager-design.md`](./mobile-asset-manager-design.md)
- [`mobile-media-components-plan.md`](./mobile-media-components-plan.md)
- [`mobile-sqlite-migration-plan.md`](./mobile-sqlite-migration-plan.md)
- [`mobile-token-counting-plan.md`](./mobile-token-counting-plan.md)
- [`mobile-pc-parity-construction-review.md`](./mobile-pc-parity-construction-review.md)
- [`rich-text-renderer-migration-plan.md`](../../src/tools/rich-text-renderer/docs/Plan/rich-text-renderer-migration-plan.md)
