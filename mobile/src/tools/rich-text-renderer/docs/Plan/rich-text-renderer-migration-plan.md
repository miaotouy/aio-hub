# 移动端 RichTextRenderer 模块化重构与测试页建设计划

> 状态: **Completed**
> 创建时间: 2026-06-26
> 负责人: 咕咕-kilo

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
  - [x] 检查并微调组件内部的样式和依赖，确保其完全适配移动端主题变量
- [x] **3. 编写预设测试用例 `presets/test-cases.ts`**
  - [x] 通过 `@shared` 别名和 `tsconfig.json` 的 paths 回退机制，完美链接并复用 PC 端的 26 个硬核测试用例，实现双端同步
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

## 3. 关键设计细节

### 3.1 目录结构

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

### 3.2 移动端测试页交互与 UI 架构规范

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
