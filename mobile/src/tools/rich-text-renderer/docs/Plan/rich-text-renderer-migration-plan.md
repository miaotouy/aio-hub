# 移动端 RichTextRenderer 模块化初版与 PC 能力迁移计划

> 状态：初版模块化迁移完成；PC 能力迁移施工中
> 创建时间: 2026-06-26
> 最近核对：2026-07-27
> 负责人: 咕咕-kilo
> 跨模块施工索引：[`mobile-development-checklist.md`](../../../../../docs/plan/mobile-development-checklist.md)

## 1. 背景与目标

原有的 `RichTextRenderer.vue` 被不规范地放置在全局组件目录 `mobile/src/components/common/` 下，破坏了移动端“工具自治、模块化”的架构设计。
本计划旨在将富文本渲染器重构为独立的工具模块 `mobile/src/tools/rich-text-renderer`，并为其建设一个专为移动端窄屏适配的“富文本渲染测试”工具页面，方便在移动端（Android/iOS）开发调试排版、流式输出和性能。

---

## 2. 进度追踪清单

- [x] **1. 创建工具目录与计划文档**
  - [x] 创建 `mobile/src/tools/rich-text-renderer/` 目录结构
  - [x] 编写本计划文档 `rich-text-renderer-migration-plan.md`
- [x] **2. 迁移核心组件 `RichTextRenderer.vue`**
  - [x] 将 `mobile/src/components/common/RichTextRenderer.vue` 移动到 `mobile/src/tools/rich-text-renderer/RichTextRenderer.vue`
  - [x] 完成首版组件的样式和依赖适配；这不代表已经具备 PC 富文本引擎的完整能力
- [x] **3. 编写预设测试用例 `presets/test-cases.ts`**
  - [x] 建立移动端预设样例和测试入口
  - [ ] 与 PC 端完整测试用例和节点能力逐项对齐
- [x] **4. 编写移动端专属测试页面 `views/TesterView.vue`**
  - [x] **布局适配**：放弃 PC 端的 Split 双栏，采用移动端单栏 Tab 切换（编辑 / 预览 / 帘幕 / 调试）。
  - [x] **帘幕模式 (Curtain)**：完美移植卡拉OK式原文消费扫过效果，针对窄屏优化滚动，让当前消费行始终居中。
  - [x] **流式模拟系统**：由于移动端未引入 `token-calculator` 工具及 WASM 分词依赖，**采用自研的轻量级字符/单词切分算法**（中文字符按字切分，英文按单词/空格切分）来模拟 Token 流，并完整移植 PC 端的 TPS 速度控制、首包延迟以及**累计时间债务补偿波动算法**，实现零外部依赖。
  - [x] **调试抽屉 (Debug Drawer)**：
    - 替代 PC 端的悬浮窗，用轻量级底部抽屉承载 **AST 树状查看器**。
    - 承载 **稳定区/待定区染色开关**、**流式平滑化开关**、**节流开关**等元数据控制。
  - [x] **状态监控**：在底部固底展示轻量级指标（已渲染 Token、实时 TPS、字符数、渲染耗时）。
- [x] **5. 编写工具注册文件 `rich-text-renderer.registry.ts`**
  - [x] 注册工具元数据，接入移动端首页，不再隐藏
- [x] **6. 更新 `llm-chat` 引用路径**
  - [x] 修改 `mobile/src/tools/llm-chat/components/MessageContent.vue` 中的引用路径
- [x] **7. 清理旧 of 全局组件**
  - [x] 安全删除 `mobile/src/components/common/RichTextRenderer.vue`
- [x] **8. 运行类型检查与编译验证**
  - [x] 运行 `bun run check:mobile:frontend` 确保类型检查完全通过

---

## 3. PC 能力迁移清单（新增）

本节是初版模块化迁移之后的实际施工范围。开始阶段允许直接复制 PC 文件和目录，先完成移动端可运行的行为对齐；共享包抽取、Rust/原生下沉和性能重构都必须等真实设备数据出现后再决定。

### 3.1 独立工作树边界

RichTextRenderer 可以独立工作树并行开发。建议工作树只修改：

- `mobile/src/tools/rich-text-renderer/**`
- 为测试或构建所必需的移动端依赖配置

聊天入口、资产服务和消息类型的跨模块修改集中到主线或单独的小合并提交，避免与上下文管线工作树互相覆盖。建议分支名：`codex/mobile-rich-text-parity`。

### 3.2 迁移阶段

- [ ] 复制 PC AST、节点类型、解析器、流式处理和 Patch 更新模块，先完成移动端路径、主题和 Tauri API 适配。
- [ ] 迁移稳定区/待定区、节点复用和完整资源解析；不在缺乏实测热点时机械复制 PC AST/Patch 管线。
- [x] 已完成可单测的流式渲染快照节流：中间 chunk 最多每 80ms 触发一次完整 Markdown 重算，首内容、清空内容和结束响应立即刷新；卸载时清理待执行的流式与代码复制反馈 timer。
- [ ] 在真实 Android/iOS 设备完成长消息、窄屏布局、滚动稳定性和内存释放验收；Vitest 只覆盖 Web 层节流与卸载清理，不能替代 WebView/原生运行态证据。
- [x] 已完成移动端基础 Markdown 代码块交互：独立节点提供可访问的复制与自动换行切换，保留横向滚动、最大高度和原始代码文本；复制反馈 timer 在节点卸载时清理。不在无移动端需求时照搬桌面高亮、导出、CodeMirror 或 HTML 预览交互。
- [x] 已接入只读 VCP 输出块：角色分隔、工具请求（含 `TOOL_REQUEST_ESCAPE`）、调用结果、日记和本轮摘要会去除协议围栏后以可折叠卡片显示；流式未闭合请求保持可见。该能力只负责安全展示，既不连接也不执行桌面 `vcp-connector` / `tool-calling` 协议。
- [x] 已接入 KaTeX 行内/块级公式，并在思考块内复用；`trust: false`，失败时不执行 HTML 或脚本。
- [x] 已实现桌面默认 `<think>` / `<guguthink>` 的移动端折叠块和未闭合流式状态；不提前伪造自定义规则 UI 或完整 AST/Patch 管线。
- [x] 已接入受管资产媒体节点：当前消息内的 Markdown `![说明](asset://<assetId>)` 仅在 `<assetId>` 匹配该消息 `attachments` 时解析为稳定 `MediaItem`，并复用 `MediaPreviewHost` 处理 descriptor、打开和卸载；外部图片继续走普通安全 `<img>` 回退。解析器不会根据模型文本探测任意资产，也不复制 PC 的 `BaseDialog`、`ImageViewer`、`AudioPlayer`、`VideoPlayer` 或桌面 composable。Android/iOS 手势与真实播放仍待设备门禁。
- [x] 已实现 Mermaid fenced code 的安全基础渲染：运行时按需加载 Mermaid，固定 `securityLevel: "strict"`，解析 SVG 后以 DOM 挂载并清除事件属性及非片段链接；流式未闭合 fenced code 仅显示等待状态，渲染失败保留原始代码。尚未迁移缩放、导出、自动修复、HTML 交互预览、样式隔离和 CDN 本地化，高级交互仍须按移动端能力分批启用。
- [x] 当前移动端已禁用 raw `v-html`，并拒绝锚点、HTTP(S) 与 `mailto:` 之外的 Markdown 链接协议：未受信任 HTML token 仅以字面文本显示，不产生 DOM 节点或脚本执行面。
- [ ] 后续如需启用 HTML 输出，必须先实现可审计的白名单或沙箱；不得恢复直接 `v-html`。
- [ ] 完成长消息、流式输出、窄屏布局、滚动稳定性和内存释放验证；其中 Web 层流式节流和 timer 释放已有单测覆盖，Android/iOS 设备门禁仍待执行。
- [ ] 依据真实 Android/iOS 设备数据评估 Web Worker、Rust 或原生下沉；没有性能证据时不提前抽取共享实现。

移动端测试页中的字符/单词切分只用于流式演示和速度模拟，不等同于聊天上下文使用的 Rust `o200k_base` Token 计数。

### 3.3 当前可复用的移动端基础

- `mobile/src/tools/asset-manager/services/assetService.ts` 已提供短期预览来源和主动撤销命令。
- `mobile/src/tools/asset-manager/components/AssetDetailSheet.vue` 已以内联 `<img>`、`<video>`、`<audio>` 展示资产详情预览。
- `mobile/src/tools/llm-chat/components/MessageContent.vue` 已实现图片预览 overlay 和预览 token 关闭/撤销。

这些实现尚未形成跨工具的媒体组件契约。媒体设计已经在 [`mobile-media-components-plan.md`](../../../../../docs/plan/mobile-media-components-plan.md) 收敛；富文本的图片、音频和视频节点要等资产管理器中的组件实现、交互验证和聊天消费者接入完成后再复用稳定契约，在此之前只迁移非媒体渲染能力。

## 4. 关键设计细节

### 4.1 目录结构

```
mobile/src/tools/rich-text-renderer/
├── docs/
│   └── Plan/
│       └── rich-text-renderer-migration-plan.md  # 本文档
├── rich-text-renderer.registry.ts                # 工具注册
├── RichTextRenderer.vue                          # 核心渲染组件
├── views/
│   └── TesterView.vue                            # 移动端专属测试页面
└── presets/
    └── test-cases.ts                             # 预设测试用例
```

### 4.2 移动端测试页交互与 UI 架构规范

为了严格遵循项目移动端规范（`AGENTS.md`），测试页将采用**“原生 Vue 骨架 + 自研 CSS 变量 + Varlet 原子件”**的架构设计，拒绝将 Varlet 作为页面骨架或设计语言来源：

- **页面骨架与布局**：
  - 采用原生 Flex 布局（`display: flex; flex-direction: column; height: 100%;`），背景色使用项目主题变量 `--color-surface`。
  - 顶部导航栏：使用 `var-app-bar` 作为叶子控件，但其内部按钮和标题样式需与项目整体气质对齐。
- **控制区（自研卡片结构）**：
  - 放弃使用 `var-collapse` 等重度骨架组件。
  - **手动编辑折叠区**：采用原生 Vue `div` 配合 `v-show` 和 `ChevronDown` / `ChevronRight` 图标自研实现 light-weight 折叠面板。
  - **输入框**：使用原生 `textarea` 或轻量级输入框，发送/预览交互默认使用 `Ctrl+Enter`。
  - **原子控制件**：仅在需要下拉选择、开关、滑块时，使用 `var-select`、`var-switch`、`var-slider` 作为原子叶子节点，且其颜色、圆角等必须通过 CSS 变量适配项目主题，严禁绑定 Varlet 默认的 Material Design 3 语义。
- **渲染区**：
  - 挂载 `RichTextRenderer` 组件，使用项目自研的毛玻璃效果（`backdrop-filter: blur(var(--ui-blur))`）和卡片背景（`var(--card-bg)`），确保通透感。
- **底部状态栏**：
  - 采用原生 `div` 固底，展示 light-weight 指标（字符数、流式速度、渲染耗时），背景使用半透明的 `var(--card-bg)`。
