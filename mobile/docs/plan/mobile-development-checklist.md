# 移动端当前待办总表

> 状态：实现主线已基本收敛，当前以 Android 真机 / iOS 平台门禁和性能证据为主
> 最近核对：2026-07-31
> 文档定位：移动端跨模块待办、优先级、依赖和验收入口；实现细节仍以各模块 `ARCHITECTURE.md` 和专项计划为准

## 1. 当前结论

移动端角色聊天主线已经具备可用的产品闭环：会话树、恢复/重试/停止、Agent 与预设、宏与变量、传统关键词世界书、注入编排、Token 文本预算、附件原生发送、文档提取回退、统一媒体预览、富文本安全基础渲染和 Android AVD 日常回归均已落地。

**当前没有需要继续拆分的 P0 功能开发项。** 剩余工作主要分为：

1. Android 真机的资产、聊天附件、媒体预览和富文本体验验收；
2. Token 计数与富文本在真实设备上的性能/内存证据；
3. iOS 编译、设备和平台差异验收；
4. 明确列出但暂不进入当前主线的产品扩展。

Android AVD 只作为日常回归和故障诊断环境，不能替代 Android 真机、iOS 或真实低存储设备门禁。

## 2. 近期待办（按执行顺序）

### P0 — Android 真机资产与聊天附件主流程

- [ ] 在 Android 真机完成资产 MVP 主流程：导入、列表/详情预览、导出、删除影响、应用重启恢复。
- [ ] 在同一真机报告中覆盖正式聊天附件链路：资产选择、原生发送、流式回复、消息恢复，以及 `reclaimed` / `missing` 等降级状态。
- [ ] 记录设备型号、Android 版本、ABI、应用版本、场景结果和失败证据；不得用普通浏览器或 AVD 结果替代。

**完成标准**：资产管理器和聊天附件主流程在至少一个明确的 Android 真机环境形成可复查报告；失败、取消、重启和临时文件清理均有结论。

入口：[`mobile-asset-manager-design.md`](./mobile-asset-manager-design.md)、[`mobile-sqlite-migration-plan.md`](./mobile-sqlite-migration-plan.md)、[`asset-manager/ARCHITECTURE.md`](../../src/tools/asset-manager/ARCHITECTURE.md)。

### P1 — Android 真机媒体与富文本可用性

- [ ] 在 Android 真机验证图片/视频/音频预览的真实手势：下拉关闭、双指缩放、快速切换、长视频拖动、系统 Back、全屏回退和内联续播。
- [ ] 验证设备音频输出、方向变化、安全区、后台/路由切换、预览 URL 回收，以及大媒体/长消息下的内存表现。
- [ ] 在正式聊天中验证 RichTextRenderer 的窄屏长消息、流式输出、滚动稳定性、代码块/Mermaid/KaTeX/提示块和受管 `asset://` 媒体。
- [ ] 根据真机数据决定是否需要方向锁定、后台播放或其他原生能力；没有性能/可用性证据时不扩展公共 API。

**已有证据**：2026-07-26 至 2026-07-27 的 Android AVD APK 回归已覆盖资产图片、聊天附件、WAV 音频受控预览、H.264 MP4 导入/解码/暂停、应用内沉浸层、原生 Back 后内联续播、RichTextRenderer 测试页和正式聊天首包 Markdown 渲染。上述结果不替代真机手势、设备音频、方向、安全区和内存验收。

入口：[`mobile-media-components-plan.md`](./mobile-media-components-plan.md)、[`rich-text-renderer-migration-plan.md`](../../src/tools/rich-text-renderer/docs/Plan/rich-text-renderer-migration-plan.md)、[`rich-text-renderer/ARCHITECTURE.md`](../../src/tools/rich-text-renderer/ARCHITECTURE.md)。

### P1 — 真实设备性能基线

- [ ] 在 Android 真机测量 Token tokenizer 的首次初始化耗时、批量计数性能、峰值内存和交互流畅度。
- [ ] 在长消息/流式富文本/媒体预览链路稳定后，补充内存释放和长时间运行观察；记录基线而不是凭感觉引入 Worker、Rust 或原生下沉。
- [ ] 若性能数据不足以支持架构变更，保持当前实现，不提前抽取共享包或复制 PC 的完整 AST/Patch 管线。

**已完成范围**：Rust `o200k_base` 计数服务、前端 IPC、Agent Manager 与 Chat 上下文预算接入、文本历史裁剪、发送后估算和缺失 usage 时的展示均已完成；附件/多模态成本仍按实际模型和渠道协议独立处理。

入口：[`mobile-token-counting-plan.md`](./mobile-token-counting-plan.md)、[`rich-text-renderer-migration-plan.md`](../../src/tools/rich-text-renderer/docs/Plan/rich-text-renderer-migration-plan.md)。

### P1 — iOS 平台报告

- [ ] 具备 iOS 编译环境和设备条件后，执行 SQLite、资产、预览协议、聊天附件和 Token 固定场景。
- [ ] 单独记录 iOS 的 security-scoped URL、文件选择/导出、预览、方向、后台行为和内存结果；不能用 Android 结论代替。
- [ ] 根据 iOS 实测再决定方向锁定、后台播放和其他平台特化能力，不提前冻结协议。

入口：[`mobile-sqlite-migration-plan.md`](./mobile-sqlite-migration-plan.md)、[`mobile-asset-manager-design.md`](./mobile-asset-manager-design.md)、[`mobile-media-components-plan.md`](./mobile-media-components-plan.md)、[`mobile-token-counting-plan.md`](./mobile-token-counting-plan.md)。

## 3. 已完成或不再作为待办的内容

- [x] Chat P0 主线：会话 CRUD/恢复/分支/引用/停止/重试、Agent/预设/开局消息、宏变量、传统关键词世界书、注入编排、文本 Token 预算和上下文裁剪。
- [x] 附件闭环：`ManagedAssetRef +` 轻量快照、SQLite 会话/消息与附件引用、原生 Provider wire、文档提取文本回退、usage outbox 和降级状态。
- [x] Android AVD E2E：设备所有权、单 ABI APK、系统文件选择器、资产/附件/音频/视频/富文本固定场景、失败证据聚合和 Ollama opt-in lane。
- [x] Android 真机 SQLite 与基础文件链路已有验证台报告；当前仍缺的是资产管理器 UI 主流程、正式聊天附件主流程以及媒体/富文本可用性报告。
- [x] RichTextRenderer 初版模块化、代码块、KaTeX、GitHub 风格提示块、思考块、只读 VCP 展示、Mermaid 安全基础渲染、受管媒体节点和 raw `v-html` 关闭。
- [x] Agent Manager 基础能力已进入维护，不再把桌面 Agent 完全对齐作为移动端当前主线。

## 4. 延后队列（不是当前发布阻塞项）

以下项目必须保留边界，但当前不应与平台门禁混在同一批次推进：

- [ ] RichTextRenderer 的 PC 完整 AST/Patch、稳定区/待定区、完整资源解析、Worker tokenizer 和桌面交互逐项对齐；只有移动端需求或真机性能证据明确时再立项。
- [ ] HTML 输出白名单或沙箱；当前继续保持 HTML 按字面显示，不能恢复直接 `v-html`。
- [ ] Agent 私有头像、背景、预设附件、随包二进制资源等私有资产能力；私有资产不得改存为全局 `assetId`。
- [ ] 工具调用、向量 RAG、Knowledge/Recall、自主工作流和桌面 Agent 高级参数；如有移动端需求，应独立设计，不默认复制桌面协议。
- [ ] 相机、分享进入 AIO、移动端文件关联、批量转写、音视频模型转写、PDF/Office 深度提取，以及 `llm-chat` 之外的资产消费者。

## 5. 执行顺序与文档维护

1. 先完成 Android 真机资产 + 正式聊天附件主流程，并形成报告。
2. 在同一设备条件下补媒体、富文本和 Token 性能/内存证据。
3. 具备条件后单独执行 iOS 固定场景并记录平台差异。
4. 只有真实设备数据暴露热点时，才决定 Worker、Rust、原生下沉或共享包抽取。
5. 稳定边界、数据流和已验证行为回写对应 `ARCHITECTURE.md`；本表只维护优先级、待办状态、入口和平台门禁，不复制实现细节。

专项计划：

- [`mobile-agent-manager-plan.md`](./mobile-agent-manager-plan.md)
- [`mobile-asset-manager-design.md`](./mobile-asset-manager-design.md)
- [`mobile-media-components-plan.md`](./mobile-media-components-plan.md)
- [`mobile-sqlite-migration-plan.md`](./mobile-sqlite-migration-plan.md)
- [`mobile-token-counting-plan.md`](./mobile-token-counting-plan.md)
- [`mobile-pc-parity-construction-review.md`](./mobile-pc-parity-construction-review.md)
- [`rich-text-renderer-migration-plan.md`](../../src/tools/rich-text-renderer/docs/Plan/rich-text-renderer-migration-plan.md)
