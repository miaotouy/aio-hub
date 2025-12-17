<div align="center">

<img src="src/assets/aio-icon-color.png" alt="AIO Hub Logo" width="120" height="120">

# AIO Hub

**一站式桌面AI工具枢纽 | 开发者的效率利器**

一个基于 Tauri + Vue 3 + TypeScript 开发的桌面端枢纽应用，提供多种实用的开发和日常工具。

[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Tauri](https://img.shields.io/badge/Tauri-2.0-blue.svg)](https://tauri.app/)
[![Vue](https://img.shields.io/badge/Vue-3.5-green.svg)](https://vuejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue.svg)](https://www.typescriptlang.org/)

[![Stars](https://img.shields.io/github/stars/miaotouy/aio-hub?style=social)](https://github.com/miaotouy/aio-hub/stargazers)
[![Forks](https://img.shields.io/github/forks/miaotouy/aio-hub?style=social)](https://github.com/miaotouy/aio-hub/network/members)
[![Issues](https://img.shields.io/github/issues/miaotouy/aio-hub)](https://github.com/miaotouy/aio-hub/issues)

[![爱发电赞助](https://img.shields.io/badge/爱发电-赞助作者-ff69b4.svg)](https://afdian.com/a/miaotouy)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/miaotouy/aio-hub)

[核心亮点](#-核心亮点) •
[旗舰功能](#-旗舰功能-llm-智能对话) •
[功能特性](#-功能特性) •
[下载安装](#-下载安装) •
[开发指南](#-开发指南)

</div>

## 🌟 旗舰功能: LLM 智能对话

AIO Hub 的聊天功能是一个专为复杂任务和深度探索而设计的、高度可定制的**对话式 AI 工作空间**。

### 🌐 开放的模型生态 (Open Model Ecosystem)

无缝集成，灵活扩展。

- **多服务商支持**: 原生支持 OpenAI, Anthropic (Claude), Google (Gemini), Cohere, DeepSeek 等多家主流 LLM 供应商。并且通过兼容 OpenAI API 的接口（如 Ollama, LM Studio, Llama.cpp），轻松接入和管理本地运行的语言模型。
- **自定义端点**: 支持为所有已集成的服务类型（如 OpenAI, Claude, Gemini 等）添加自定义 API 端点，具备极高的可扩展性。
- **可视化模型管理**: 在设置中可以集中管理所有模型的元数据，定义其能力（如视觉、工具使用），并在工具中根据任务需求（如“需要视觉能力”）进行智能筛选。

### 🌳 双视图对话管理 (Dual-View Conversation Management)

在传统的**线性列表**与创新的**非线性图谱**之间自由切换，满足不同场景的需求。

- **传统线性视图 (Linear List View)**
  - **极致性能**: 基于 `@tanstack/vue-virtual` 实现虚拟滚动，轻松处理包含数千条消息的超长会话，始终保持流畅。
  - **熟悉的体验**: 经典的自上而下消息流，符合直觉，上手零成本。
  - **消息导航器**: 配备了快速跳转（到顶部/底部）和新消息提示功能。
  - **精细化控制**: 消息的悬浮工具栏支持复制、编辑、重新生成、创建分支、上下文分析、禁用消息、数据可视化编辑（高级）、指定模型重新生成 等多种功能，实现对会话的深度控制。

- **非线性对话图谱 (Non-linear Conversation Graph)**
  - **无限画布**: 由 `Vue Flow` + `D3.js` 驱动，将对话历史呈现为可交互的树状网络。
  - **双布局引擎**: 提供清晰层级的**树状布局**和动态物理模拟的**力导向布局**，并支持一键切换。
  - **高级节点操作**: 启用/禁用分支、查看详情、复制内容、删除子树、指定模型重新生成。
  - **自由的结构重组**: 通过拖拽连接线"嫁接"分支，自由重组对话流，所有结构操作均支持撤销/重做。
  - **可视化辅助**: 内置**小地图**、**缩放/平移控件**和**活动分支高亮**，在复杂的对话网络中也能轻松导航。

### 🛠️ 专业级上下文工程 (Prompt Engineering)

完全掌控发送给模型的每一个 Token。

- **统一上下文管道**: 基于可配置处理器的流水线架构，将会话树转换为 LLM 请求。内置 8+ 处理器（会话加载、正则替换、宏解析、Token限制、注入组装、转写处理、资产解析、消息格式化），支持**可视化排序**、**启用/禁用**和**插件注册**自定义处理器。
- **上下文分析器**: 开发者级调试工具。清晰地查看最终发送给 LLM 的 Prompt 列表、Token 消耗统计、原始请求体、占比分析和宏解析。
- **高级上下文注入**: 声明式的消息注入策略，支持**按模型激活**（预设消息仅对特定模型生效，支持正则匹配）和**高级深度语法**（混合深度 `D3,D5`、循环注入 `D2-10/2`、锚点注入 `@CHAT_HISTORY:before`），并兼容 **SillyTavern** 角色卡和预设。
- **上下文自动压缩**: 丰富的可配置性，当对话长度超过设定阈值时，自动触发 LLM 生成摘要，以非破坏性方式压缩历史消息，有效管理超长会话和 Token 成本。
- **预设消息模型匹配**: 智能体预设消息可通过正则表达式匹配生效模型，实现"模型专属提示词"。
- **宏系统 (Macro System)**: 在 Prompt 中使用 `{{user}}`, `{{char}}`, `{{time}}` 等 **60+** 动态宏构建高级上下文。支持**角色与消息**（用户/角色名称、档案描述、历史消息）、**LLM 元数据**（`{{modelId}}`, `{{modelName}}`, `{{profileId}}`, `{{profileName}}`, `{{providerType}}`）、**丰富的日期时间**（ISO/Unix/自定义格式、多语言本地化支持15种语言、古风中文干支纪年/农历/时辰、维多利亚风格英文、大写汉字）、**功能宏**（随机选择、掷骰子 `{{roll::2d6}}`、随机整数）、**系统环境**（`{{os}}`, `{{osVersion}}`, `{{arch}}`, `{{platform}}`, `{{hostname}}`, `{{locale}}`）以及**变量系统**（局部/全局变量的读写与自增自减）。特色功能包括**虚拟时间配置**（为角色扮演设置独立时间线和流速）和编辑器内置宏自动补全。
- **正则处理管道 (Regex Pipeline)**: 高级文本处理系统，支持对消息内容进行精细化的动态清洗和转换。
  - **双向管道架构**: **请求管道**在发送给模型前处理消息（隐藏思维链、转换格式），**渲染管道**在界面显示前处理消息（自定义标签渲染、敏感词过滤）。
  - **可视化编辑器**: 提供规则配置、拖拽排序、分组管理以及**实时测试（支持高亮预览）**功能。
  - **生态兼容**: 支持直接导入 **SillyTavern** 格式的正则脚本，系统会自动转换并合并为 AIO Hub 预设。
  - **精细控制**: 规则支持按 **角色** （User/AI/System）和 **消息深度** （Depth）进行过滤，并引入 **优先级（Priority）** 机制控制预设执行顺序。
- **智能体 (Agents)**: 高度可定制的 AI 角色配置系统，远不止于 Prompt 模板。
  - **预设消息序列**: 将 `System`, `User`, `Assistant` 消息（含"用户档案"和"聊天历史"占位符）组合为可复用的对话模板，支持拖拽排序、启用/禁用和多种导入/导出格式（SillyTavern 角色卡兼容）。
  - **模型绑定**: 每个智能体可指定默认的 LLM Profile 和模型，切换智能体时自动切换模型。
  - **档案覆盖**: 可绑定特定用户档案，覆盖全局设置，实现"角色-用户"的完整人设配对。
  - **高级定制**: 包括**思考块规则**（自定义 Chain of Thought 识别与折叠显示）、**回复样式**（Markdown 渲染样式如粗体颜色、发光效果）、**虚拟时间线**（为角色扮演设置独立时间流速，`{{time}}` 等宏将基于此计算）、**正则管道**（智能体专属的文本替换规则）、**上下文压缩配置**（自动/手动摘要压缩历史）。
  - **组织管理**: 分类与标签系统，便于在侧边栏分组和快速筛选。
  - **多格式导出**: 支持导出为 JSON、ZIP（含资产）或 **PNG 角色卡**（配置嵌入图片元数据）。
- **动态智能体切换**: 与传统聊天应用中“一次会话绑定一个助手”的模式不同，AIO Hub 将会话与智能体解耦。你可以在同一段对话中随时切换智能体，让“代码专家”帮你写代码，再无缝切换到“文档专家”帮你写注释，使对话能够围绕“任务”本身而非某个固定的“助手”展开。
- **用户档案 (Personas)**: 向 AI 介绍"你是谁"。预设多份自我描述（如"我是一名熟悉 Vue/React 的前端开发者"、"我是产品经理，关注用户体验"），在对话中随时切换，让 AI 了解你的背景和偏好，给出更贴合你身份的回复。

### 🌐 全局翻译系统 (Translation System)

- **双向翻译**: 支持翻译输入内容和接收到的消息，一键切换原文/译文。
- **双语并排显示**: 宽屏模式下可并排显示原文和译文，对比阅读。
- **智能XML保护**: 翻译时自动保护XML标签和代码块，确保格式完整。

### 🖼️ 多模态交互 (Multi-modal Interaction)

- **文件上传与引用**: 拖拽或粘贴图片、音频、视频、PDF、TXT 等文件到聊天窗口。文件将被资产管理器统一处理，方便在聊天中引用。
- **智能附件转写**: 全新的多模态转写系统，支持图片 OCR、音频语音转文字、视频内容描述和 **PDF 分批视觉转写**。采用**智能策略**：模型原生支持时直传，否则自动转写为文本。支持后台并发处理、大视频 FFmpeg 压缩（须配置路径）和超长 PDF 分批处理。
- **视觉模型支持**: 完美配合 Gemini, Claude, GPT-4o, Qwen-VL 等多模态模型的视觉识别能力。
- **PDF 原生预览**: 内置 PDF 预览器，支持缩放、旋转、翻页、目录导航、单页/滚动视图切换。

---

## ✨ 核心亮点

### 🖼️ 自由窗口管理

打破传统布局限制。

- **组件级分离**: 不仅是工具，连聊天输入框、对话区域都可以被**拖拽**成为独立的浮动窗口。
- **状态同步**: 所有分离窗口共享同一个状态源，在一个窗口操作，所有窗口实时更新。
- **记忆功能**: 自动记住所有窗口的位置和大小。

### 🎨 极致视觉体验

- **原生特效**: 支持 Windows Mica / Acrylic 和 macOS Vibrancy 毛玻璃特效。
- **动态壁纸**: 支持视频/图片轮播壁纸，配合 CSS 混合模式 (Blend Modes)，打造沉浸式工作台。内置精选壁纸库，支持自定义壁纸轮播。
- **深度定制**: 内置 CSS 编辑器，支持实时修改应用样式的每一个细节。
- **灵活布局**: 侧边栏支持三种模式（固定侧边栏/抽屉/下拉菜单），适配不同屏幕尺寸。

### 🧩 强大的插件系统

- **JavaScript 插件**: 轻量级 UI 扩展，即写即用。支持 `activate`/`deactivate` 生命周期钩子，可动态注册 LLM 聊天管道处理器。
- **Native 插件 (Rust)**: 高性能后端扩展，通过 DLL 动态加载。
- **Sidecar 插件**: 支持任意语言编写的独立进程插件。

---

## 🚀 效率工具集

### 📊 Git 仓库分析器 (Git Analyzer)

_基于 Rust `git2-rs` 的高性能分析工具_

- **无依赖**: 不依赖系统 Git 命令，直接读取 `.git` 数据库，速度极快。
- **流式分析**: 采用流式传输技术，秒开大型仓库，实时渲染提交图表。
- **多维可视化**: 贡献者热力图、提交频率图、代码行数统计。

### 👁️ 智能 OCR (Smart OCR)

_多引擎融合的文字识别方案_

- **多引擎切换**: 支持 **VLM (GPT-4o)**、**Windows Native** (离线快)、**Tesseract.js** (纯前端)。
- **智能切图**: 独创的长图切片算法，自动识别空白区域切割长截图，大幅提升识别率。
- **批量处理**: 支持多图并发识别和结果导出。

### 📦 资产管理器 (Asset Manager)

_应用级的资源中心_

- **统一索引**: 集中管理所有工具产生的图片、文档和媒体文件。
- **自动去重**: 基于内容哈希 (SHA-256) 的自动去重机制，节省存储空间。
- **高性能**: Rust 后端驱动的快速索引和筛选，支持无限滚动。
- **转写内容管理**: 支持查看和编辑资产的转写内容，自动关联到聊天上下文。

### 🎨 正则表达式应用器 (Regex Applier)

_双引擎正则处理工具_

- **实时预览**: 前端 JS 引擎提供毫秒级的输入反馈。
- **批量处理**: 后端 Rust 引擎处理大规模文件修改，性能强劲。
- **规则链**: 将多个正则替换组合成一条处理流水线 (Pipeline)。

### 📝 富文本渲染引擎 (Rich Text Renderer)

_专为 LLM 流式输出打造的高性能渲染方案_

- **零闪烁流式渲染**: 采用增量 Diff 算法和 Patch 系统，完美解决流式输出时的抖动问题，带来打字机般的丝滑体验。
- **深度混合排版**: 自研解析器，完美支持 Markdown 与任意深度 HTML 标签的混合嵌套。
- **丰富的交互组件**:
  - **代码块**: 集成 Monaco Editor，提供专业级的高亮、折叠和字体控制。支持 HTML 无边框预览模式。
  - **思维链**: 原生支持 `<think>` 标签，以可折叠的动态组件展示 LLM 的思考过程。
  - **可交互按钮**: 支持 LLM 输出 `<button type="send|input|copy" value="内容">标签</button>` 创建交互按钮，可执行发送消息、填充输入框、复制内容等预定义安全操作，支持自定义样式和主题自适应。
  - **图表与公式**: 内置 Mermaid 图表（支持缩放/独立窗口）和 KaTeX 数学公式渲染。
  - **PDF 预览**: 内置 PDF 查看器，支持缩放、旋转、翻页、目录导航。
- **MD 样式编辑器 (Style Editor)**:
  - **所见即所得**: 针对标题、段落、引用、代码等每一种 Markdown 元素提供独立的实时预览面板。
  - **全掌控**: 可精细调整字体、颜色、边距等 CSS 属性，打造独一无二的阅读体验。
  - **灵活性**: 支持一键启用/禁用自定义样式，或重置为系统默认，随心切换。

### 🛠️ 更多实用工具

- **JSON 格式化**: 智能格式化和美化 JSON 数据，支持语法高亮和错误提示，可一键发送至聊天窗口进行分析。
- **Token 计算器**: 估算文本 Token 数，支持多种分词模型。
- **颜色提取器**: 屏幕取色、图片色板分析。
- **文本差异对比**: 基于 Monaco Editor 的专业级 Diff 工具。
- **目录树生成**: 生成项目结构树，支持 `.gitignore` 过滤。
- **以及更多工具……**

---

## 💻 下载安装

### 推荐：下载发行版

无需配置环境，开箱即用。

[![下载正式版本](https://img.shields.io/github/v/release/miaotouy/aio-hub?style=for-the-badge&logo=github&label=下载正式版本)](https://github.com/miaotouy/aio-hub/releases/latest)
[![下载预览版](https://img.shields.io/github/v/release/miaotouy/aio-hub?include_prereleases&style=for-the-badge&logo=github&label=下载预览版&color=yellow)](https://github.com/miaotouy/aio-hub/releases)

> 🚀 **提示**：正式版更新较慢，推荐下载 **预览版** (Pre-release) 以体验最新的功能特性与 Bug 修复！

| 平台        | 格式        | 说明                                |
| :---------- | :---------- | :---------------------------------- |
| **Windows** | `.exe`      | NSIS 安装包                         |
| **macOS**   | `.dmg`      | 支持 Apple Silicon (M系列) 和 Intel |
| **Linux**   | `.AppImage` | 通用格式，需赋予执行权限            |

### 开发者：源码构建

**环境要求**: Node.js 20+, Rust 1.70+, Bun (推荐)

```bash
# 安装依赖
bun install

# 启动开发环境
bun run tauri dev

# 构建生产版本
bun run tauri build
```

## 📚 文档与支持

- **插件开发**: [插件开发指南](docs/guide/plugin-development-guide.md)
- **常见问题**: [DeepWiki (AI 自动维护)](https://deepwiki.com/miaotouy/aio-hub)

### 📘 架构文档

- [**项目架构总览**](ARCHITECTURE.md)
- [**服务与插件系统**](docs/architecture/services-architecture.md)
- [**LLM API 适配层**](docs/architecture/llm-apis-architecture.md)
- [**窗口同步架构**](docs/architecture/window-sync-architecture.md)
- [**主题系统**](docs/architecture/theme-system-architecture.md)
- [**Composables 概览**](docs/architecture/composables-overview.md)

### 📖 开发指南

- [**添加新工具**](docs/guide/adding-new-tool.md)
- [**状态管理指南**](docs/guide/state-management-guide.md)
- [**图标系统**](src/components/icons/README.md)
- [**通用组件**](src/components/common/README.md)
- [**贡献指南**](docs/guide/contribution-guide.md)

如果你喜欢这个项目，欢迎：

- 在 GitHub 上点个 Star
- 提交 Issue 反馈 Bug
- 提交 Pull Request 贡献代码
- 在爱发电赞助我

## 许可证

<div align="center">

**本项目采用 [MIT License](LICENSE) 开源协议**

这意味着你可以自由地：

✅ 商业使用 | ✅ 修改源代码 | ✅ 分发副本 | ✅ 私人使用

**唯一要求**：在分发时保留原始的版权和许可声明

<sub>Copyright © 2025 miaotouy. All rights reserved.</sub>

</div>
