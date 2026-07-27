# 移动端持续施工清单

> 状态：施工中
> 最近核对：2026-07-27
> 文档定位：跨模块施工索引，不替代各工具的唯一计划或 `ARCHITECTURE.md`

## 1. 使用规则

本文只维护以下内容：当前优先级、模块依赖、并行工作边界和下一步入口。实现细节、验收数据和历史记录必须回写对应模块文档，不在本文复制一份。

RichTextRenderer 可以在独立工作树中并行开发。建议工作树只修改 `mobile/src/tools/rich-text-renderer/`，最后再由主线协调 `llm-chat/components/MessageContent.vue` 的入口接线、资产解析和消息类型变更。建议分支名：`codex/mobile-rich-text-parity`。

## 2. 当前优先级

当前移动端产品基线是先完成一个独立、完整的角色聊天产品：能力参照桌面端引入工具调用、向量 RAG 和后续 Knowledge/Recall 模块之前的聊天形态，并吸收类似酒馆类产品的角色、预设、上下文、分支和富文本体验。工具调用、向量检索、知识库和桌面 Agent 高级能力不是 Chat 完整性的前置依赖，也不要求移动端未来与桌面实现完全一致。

### P0：Chat 功能完整性（不依赖工具调用或向量 RAG）

- [x] 已以角色聊天实际需要为边界完成移动端宏/变量、传统关键词世界书、确定性注入、资源解析和消息编排：可用附件保留匿名托管引用并由 Rust 原生传输在发网前读取；历史文档在“提取文本并清理原件”后会将持久化 `extractedText` 于 Token 裁剪前回退进请求上下文。媒体压缩、PDF/Office 深度解析、转写、工具调用、向量 RAG、Knowledge/Recall 不以复制桌面全部处理器为目标，按后续产品需求独立设计。
- [x] 在移动端接入 `injection-assembler`，支持预设消息的 `injectionStrategy`、深度、锚点和模型/渠道匹配语义。
- [x] 建立移动端 Chat 自己的宏注册范围：`primary:macros-renderer` 在预设装配后、Token 裁剪前顺序展开角色、用户、会话、模型和当前附件轻量摘要，并支持导入角色的局部变量定义、`<svar>`、`getvar` / `setvar` / `incvar` / `decvar`。未知与转义宏保持字面文本；工具、Recall、Knowledge、CSS 与全局变量宏不进入本阶段。
- [x] 接入移动端传统关键词世界书：全局 `worldbooks.json` 仅保存文本条目与匹配设置，Agent 通过既有 `worldbookIds` 选择世界书；`primary:worldbook-injector` 以选中顺序、条目 order 和 ID 做稳定排序，在历史尾部有限扫描并按 `before_history` / `after_character` / `depth` 注入。首阶段不迁移桌面的递归、概率、分组竞争、向量、Outlet、自动化或 Knowledge/Recall；世界书创建、条目编辑与 Agent 关联均已有移动端入口。
- [x] 已逐项核对并接线新建会话、历史恢复、编辑、删除、继续、重新生成、分支切换、引用、停止、失败恢复、长上下文和设置：Assistant 续写在同父节点创建带原回复前缀的生成中分支；进程中断恢复会将持久化的 `generating` 节点标为可见错误，Assistant 菜单可重新生成；`showMessageNavigator` 已提供可选的首条/上下条/末条浮层导航。相应的执行器、codec、消息视图和导航器测试均已覆盖。
- [x] 已接入主动停止生成：ChatInput 通过共享 `AbortController` 将停止操作传到 LLM 请求 `signal`；停止后的助手节点保留已流式输出内容，并持久化为 `complete + metadata.interrupted`，不误标为发送失败。
- [x] 将现有 Rust `o200k_base` / `countTokensBatch()` 接入上下文预算编排。Token 限制器在最终格式化前以预设优先、最新历史优先的策略裁剪文本消息；发送后的最终计数仍用于 usage 缺失时展示与快照。
- [x] 迁移文本预算和历史消息截断逻辑；处理器位于注入之后、最终消息格式化之前，预算和截断参数已有移动端编辑入口。
- [x] 附件和非文本多模态成本继续按实际模型与渠道协议独立估算。工具 schema 只在未来确实设计移动端工具调用时处理，不属于当前 Chat 完整性门禁。

入口：[`mobile/src/tools/llm-chat/ARCHITECTURE.md`](../../src/tools/llm-chat/ARCHITECTURE.md)、[`mobile-token-counting-plan.md`](./mobile-token-counting-plan.md)。

### 非当前主线：Agent 已有能力维护

- [x] 当前已经具备角色/Agent CRUD、导入、预设编辑、模型与生成参数绑定、开局消息、聊天内切换和历史快照，可继续为角色聊天提供配置来源。
- [x] 基础用户档案、`injectionStrategy`、`modelMatch` 和导入 Agent `regexConfig` 的 request 文本正则已经接入聊天请求链路。
- [ ] 当前阶段不继续追求桌面 Agent 功能对齐；私有头像/二进制资产、工具/Recall/Knowledge 参数、媒体压缩和其他高级能力统一留在 MVP 之后，只有移动端产品需求明确时再单独设计。

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
- [ ] 迁移非媒体节点和 LLM 专用节点：代码与 VCP；媒体节点等待移动端媒体契约稳定后接入。
- [x] 已接入 KaTeX 数学公式节点：支持行内 `$...$` 和块级 `$$...$$`，思考块内同样可用；KaTeX 关闭 trust，渲染失败回退为文本。
- [x] 已先迁移桌面默认的 `<think>` / `<guguthink>` 思考块：完整块默认折叠，流式未闭合块保持可见的“思考中”状态；自定义规则 UI、完整 AST/Patch 语义仍待后续阶段。
- [ ] 已接入 Mermaid fenced code 的安全基础渲染：组件按需加载 Mermaid、使用 `securityLevel: "strict"`，以清洗后的 SVG DOM 挂载并仅保留片段引用；流式未闭合 fenced code 保持等待状态，渲染失败回退原始代码。缩放、导出、HTML 交互预览、样式隔离与 CDN 本地化仍待后续评估，且不把 PC 全量交互能力作为初始合并条件。
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

### P3：MVP 之后的可选扩展

- [ ] Agent 私有头像、背景、预设附件、随包二进制资产和其他高级管理能力；不作为当前 Chat 主线。
- [ ] 工具调用、向量 RAG、Knowledge/Recall 和自主工作流如在移动端确有需求，作为独立产品能力重新设计，不默认复制桌面模块或协议。
- [ ] 相机、分享进入 AIO、移动端文件关联、批量转写、PDF/Office 提取、音视频转写和其他资产消费者。

## 3. 执行顺序

1. 主线先按角色聊天产品清单补齐 Chat 交互、上下文、分支、恢复和设置，不等待工具调用、向量 RAG、Knowledge/Recall 或 Agent 高级能力。
2. 在 Chat 范围内完成移动端宏/变量和确定性上下文注入；世界书采用非向量方案即可满足首阶段需求。
3. RichTextRenderer、附件与媒体预览作为 Chat 完整体验并行推进，媒体契约稳定后接入富文本媒体节点。
4. 功能批次稳定后运行 Android 真机性能和平台门禁，再补 iOS 验收。
5. Agent 仅维护当前已经可服务角色聊天的能力；高级 Agent、工具和向量检索留到 MVP 后按移动端需求独立立项。
6. 只根据实测热点决定 Worker、Rust、原生下沉，最后再判断是否抽取共享代码。

## 4. 文档同步要求

- RichTextRenderer 的初版迁移清单完成，不代表 PC 能力迁移完成。
- Token 计数服务和文本上下文预算编排已完成；文档只继续跟踪非文本成本、真实设备性能和平台验证。
- 各模块完成阶段后，把稳定边界和验证记录同步到对应 `ARCHITECTURE.md`；本文只更新勾选状态、优先级和入口。

