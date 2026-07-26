# 移动端持续施工清单

> 状态：施工中
> 最近核对：2026-07-26
> 文档定位：跨模块施工索引，不替代各工具的唯一计划或 `ARCHITECTURE.md`

## 1. 使用规则

本文只维护以下内容：当前优先级、模块依赖、并行工作边界和下一步入口。实现细节、验收数据和历史记录必须回写对应模块文档，不在本文复制一份。

RichTextRenderer 可以在独立工作树中并行开发。建议工作树只修改 `mobile/src/tools/rich-text-renderer/`，最后再由主线协调 `llm-chat/components/MessageContent.vue` 的入口接线、资产解析和消息类型变更。建议分支名：`codex/mobile-rich-text-parity`。

## 2. 当前优先级

### P0：聊天上下文管线与 Token 编排

- [ ] 逐个复制 PC 上已存在的上下文处理器到移动端，先保持 TS 实现和处理语义，不提前抽取共享包或下沉 Rust。
- [x] 在移动端接入 `injection-assembler`，支持预设消息的 `injectionStrategy`、深度、锚点和模型/渠道匹配语义；宏和 Agent 私有附件仍由后续处理器补齐。
- [ ] 迁移宏、变量、世界书、召回、转写和资源解析等处理器；`message-formatter` 已迁移并覆盖模型默认规则与 Agent 覆盖，每迁移一个处理器补对应测试和移动端依赖适配。
  - 当前宏引擎迁移存在前置门禁：桌面端注册表必须同时注册工具、Recall、Knowledge、资产与 CSS 等宏；移动端尚无 `tool-calling`、Recall、Knowledge 基础模块，也没有与桌面端兼容的用户档案/变量定义模型。不得以少量常用宏或空实现替代完整注册，待这些领域契约落地后再恢复施工。
- [x] 将现有 Rust `o200k_base` / `countTokensBatch()` 接入上下文预算编排。Token 限制器在最终格式化前以预设优先、最新历史优先的策略裁剪文本消息；发送后的最终计数仍用于 usage 缺失时展示与快照。
- [x] 迁移 PC `token-limiter` 的文本预算和历史消息截断逻辑；处理器位于注入之后、最终消息格式化之前。当前配置随 Agent 参数持久化，移动端尚未提供完整编辑 UI。
- [x] 明确附件、工具 schema 和多模态额外 Token 仍属于独立估算范围，不在首批通用文本 tokenizer 中隐式处理：通用文本计数仅服务于风险预警、文本 limiter 与 usage 缺失 fallback；当前聊天执行器不传递 `tools`，未来接入后必须单独估算 schema，媒体成本待实际模型/协议结构稳定后单独处理。

入口：[`mobile/src/tools/llm-chat/ARCHITECTURE.md`](../../src/tools/llm-chat/ARCHITECTURE.md)、[`mobile-token-counting-plan.md`](./mobile-token-counting-plan.md)。

### P1：Agent 阶段 3 及其依赖功能

- [x] 完成 `injectionStrategy` 和 `modelMatch` 的运行时执行；默认、深度/高级深度、锚点和模型/渠道匹配已接入，宏与 Agent 私有附件仍待后续处理器补齐。
- [x] 将 Agent 开局消息实例化到新会话：有效开局消息成为根节点下的兄弟分支，优先选中 `defaultGreetingId`；兼容旧字符串数组。当前按原文本固化，宏展开与 Agent 私有附件待各自依赖完成后接入。
- [x] 增加聊天内切换 Agent，并保持历史消息的 Agent 快照语义：会话仅更新 `displayAgentId`；既有节点不改写，新生成的助手消息固化 Agent 身份和模型/渠道快照。
- [x] 同步移动端与 PC 的显式 Agent 类型、分类枚举和 `defaultGreetingId`；加载旧持久化 `custom` 分类时归一化到 `other`，写入与筛选统一使用桌面端枚举。
- [x] 在上下文管线稳定后完成基础用户档案注入，以及移动端当前请求链路支持的 Agent 参数编辑（生成参数、停止序列、Token 预算和截断保留字符）；完整桌面宏/用户档案契约、工具/Recall/Knowledge 参数和 Agent 私有资产仍依赖各自领域能力，不能以空 UI 替代。
- [x] 已迁移导入 Agent `regexConfig` 的 request 阶段文本正则：按预设优先级、角色和消息深度执行，支持多模态 text part；脚本规则保持禁用，全局/用户档案正则编辑和宏替换仍待完整桌面契约。

入口：[`mobile-agent-manager-plan.md`](./mobile-agent-manager-plan.md)、[`agent-manager/ARCHITECTURE.md`](../../src/tools/agent-manager/ARCHITECTURE.md)。

### P1：移动端媒体组件实现与交互验证

- [x] 完成外部参考、资产管理器能力、PC 媒体组件和移动端消费者的联合调查，收敛组件边界与交互方案。
- [x] 按方案先在资产管理器完成 `MediaPreviewHost`、图片/视频/音频组件和 descriptor 生命周期 composable。
- [ ] Android AVD 的资产图片预览、聊天附件和音频受控预览/沉浸层控制工作流已于 2026-07-26 通过 APK 端到端回归；仍需在 AVD 与 Android 真机验证手势冲突、返回、方向、安全区、全屏 fallback、快速切换、真实播放和资源回收，并按可用性结果迭代。
- [x] 聊天附件已接入统一 `MediaPreviewHost`：图片、视频和音频均只传 `assetId +` 轻量快照，保留 reclaimed/missing 降级；RichTextRenderer 仍待接入。
- [ ] 具备 iOS 编译和设备条件后补验平台差异，不提前冻结方向锁定、后台播放或预览协议行为。

入口：[`mobile-media-components-plan.md`](./mobile-media-components-plan.md)。

### P1（可并行工作树）：RichTextRenderer 非媒体能力迁移

- [ ] 将 PC 富文本模块按现有目录和依赖直接复制到移动端工具目录，先做必要的路径、主题、Tauri 和移动端 API 适配。
- [ ] 迁移 PC 的 AST、流式处理、稳定区/待定区、Patch 更新和 Worker tokenizer 能力。
- [ ] 迁移非媒体节点和 LLM 专用节点：代码、数学公式、思考块、VCP；媒体节点等待移动端媒体契约稳定后接入。
- [ ] 评估并接入 Mermaid、HTML 交互预览、样式隔离和 CDN 本地化；不把 PC 全量交互能力作为初始合并条件。
- [x] 已关闭移动端现存的 raw `v-html` 渲染，并将 Markdown 链接限制为锚点、HTTP(S) 与 `mailto:`：HTML token 仅按字面文本显示，避免未受信任内容在聊天内执行。
- [ ] 后续如需重新启用 HTML 能力，必须先实现可审计的白名单或沙箱，不能恢复直接 `v-html`。
- [ ] 完成窄屏、长消息、流式输出、滚动和内存释放验证。
- [ ] 功能迁移稳定后再依据真实设备数据决定 Web Worker、Rust 或原生下沉；没有性能证据时不重构为共享包。

入口：[`rich-text-renderer-migration-plan.md`](../../src/tools/rich-text-renderer/docs/Plan/rich-text-renderer-migration-plan.md)。

当前可复用基础：资产服务已提供短期预览来源和主动撤销命令；`mobile/src/components/media/` 已落地统一 host、三类媒体主体和 descriptor 生命周期，`AssetDetailSheet` 与聊天 `MessageContent` 已接入该入口。资产详情通过可选 `imageTestId` 将稳定的图片元素标识限定在资产调用方；2026-07-26 的 Android AVD 已通过资产图片预览、聊天附件及 WAV 音频受控预览/沉浸层控制 APK 回归。RichTextRenderer 媒体节点接线以及其余设备交互验收继续以 [`mobile-media-components-plan.md`](./mobile-media-components-plan.md) 为准。

### P2：平台门禁与已落地能力的最终验收

- [ ] Android 真机完成资产 MVP 主流程：导入、预览、导出、删除影响和重启恢复，并覆盖正式聊天附件链路。
- [ ] Android 真机补测 Token 初始化耗时、批量性能、峰值内存和交互流畅度。
- [ ] iOS 具备编译和设备条件后，运行 SQLite、资产、预览协议和 Token 固定场景，单独形成 iOS 报告。
- [ ] Android AVD 结果继续作为日常回归，不替代 Android 真机或 iOS 发布门禁。

入口：[`mobile-asset-manager-design.md`](./mobile-asset-manager-design.md)、[`mobile-sqlite-migration-plan.md`](./mobile-sqlite-migration-plan.md)、[`mobile-token-counting-plan.md`](./mobile-token-counting-plan.md)、[`platform-validation-workbench-plan.md`](../../src/tools/ui-tester/docs/Plan/platform-validation-workbench-plan.md)。

### P3：MVP 之后的扩展

- [ ] Agent 私有头像、背景、预设附件和随包二进制资产。
- [ ] 相机、分享进入 AIO、移动端文件关联、批量转写、PDF/Office 提取、音视频转写和其他资产消费者。
- [ ] 继续核对 `llm-chat/ARCHITECTURE.md` 中仍有过期条目，并将尚未具备依赖的完整宏引擎、世界书、Recall 与工具调用拆成独立任务；聊天引用、会话排序、基础用户档案和当前支持的 Agent 参数编辑已完成。

## 3. 执行顺序

1. 主线先迁移上下文处理器和 Token 预算编排。
2. 媒体组件按已收敛方案在资产管理器实现并完成交互验证；RichTextRenderer 工作树并行迁移非媒体能力。
3. Agent 阶段 3 功能在上下文处理器具备真实语义后接入。
4. 媒体契约稳定后，RichTextRenderer 再接入媒体节点。
5. 功能批次稳定后运行真实设备性能和平台门禁。
6. 只根据实测热点决定 Worker、Rust、原生下沉，最后再抽取共享代码。

## 4. 文档同步要求

- RichTextRenderer 的初版迁移清单完成，不代表 PC 能力迁移完成。
- Token 计数计划必须区分“计数服务已完成”和“Token 驱动的上下文编排未完成”。
- 各模块完成阶段后，把稳定边界和验证记录同步到对应 `ARCHITECTURE.md`；本文只更新勾选状态、优先级和入口。
