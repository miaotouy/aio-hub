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

[✨ 功能特性](#-功能特性) •
[📥 下载安装](#-下载安装) •
[🚀 快速开始](#-快速开始) •
[📖 文档](#-开发指南) •
[💖 支持项目](#-支持项目) •
[📄 许可证](#-许可证)

</div>

## ✨ 功能特性

### 🎨 系统核心功能

#### 窗口管理

- 🖥️ **多窗口支持** - 工具可拖拽分离为独立浮动窗口，支持多任务布局。
- ✨ **组件级分离** - 核心组件（如对话区域）可被**拖拽出**主窗口，成为独立的、可自由操作的浮动窗口，实现极致的布局自由。
- 🔗 **跨窗口状态同步** - 先进的多窗口同步架构，确保主窗口与所有分离窗口之间的状态实时同步，操作无缝衔接。
- 📌 **窗口状态记忆** - 自动记忆并恢复所有窗口的位置与大小。
- 🧲 **边缘吸附** - 防止窗口拖出屏幕，可选禁用。

#### 设置中心

- ⚙️ **配置管理** - 支持导入/导出所有配置，可直接打开配置目录。
- 💅 **全局样式覆盖** - 内置强大的 CSS 编辑器，允许用户编写自定义 CSS 来深度定制应用外观。支持多种预设主题和个人预设保存，并可在 Monaco / CodeMirror 编辑器间切换。
- 🔀 **工具导航排序** - 在设置中自由拖拽排序，定制侧边栏工具的显示顺序。
- 🔧 **工具模块管理** - 选择性显示或隐藏工具。
- 📋 **系统托盘** - 最小化到托盘而非直接退出。

### 🎨 高级主题外观系统 (new!!)

- 🖼️ **动态壁纸** - 支持静态图片和文件夹幻灯片轮播，提供完整的播放控制台，可调节填充模式、缩放、旋转等。
- ✨ **原生窗口特效** - 在支持的系统上（Windows 10/11 的 Mica/Acrylic，macOS 的 Vibrancy）开启毛玻璃特效，让应用与桌面环境无缝融合。
- 🎨 **高级颜色混合** - 支持为 UI 元素背景叠加自定义颜色，并提供 Screen、Overlay、Multiply 等多种 CSS 混合模式。
- 💧 **精细化透明度控制** - 提供调整窗口背景和代码块的不透明度滑块，并支持css独立调整 UI 各个层级（窗口背景、卡片、侧边栏、代码块、滚动条等）的不透明度。
- 🚀 **性能与美观兼顾** - 所有视觉特效均可一键全局禁用/启用，方便在不同设备上取得最佳平衡。

### 🔌 插件系统

- 📦 **JavaScript 插件支持** - 轻量级的前端插件，实现自定义功能扩展
- 🔥 **开发模式热重载** - 开发插件时支持 TypeScript 和Vue HMR，即改即用
- 🎯 **统一服务接口** - 插件与内置服务使用相同的调用方式，无缝集成
- 🛡️ **类型安全** - 完整的 TypeScript 支持，确保插件开发的类型安全
- 🔧 **灵活部署** - 开发模式从源码加载，生产模式从安装目录加载
- 📚 **完整文档** - 提供详细的[插件开发指南](docs/plugin-development-guide.md)

### UI 与交互

- 🎯 **自定义标题栏** - 统一的视觉风格和窗口控制。
- 🖼️ **全局图片查看器** - 内置基于 Viewer.js 的高性能图片查看器，支持所有工具内图片预览。
- 📂 **可收缩侧边栏** - 灵活的工具导航。
- 🏠 **仪表盘主页** - 卡片网格展示所有工具。
- 🎪 **文件拖放** - 多数工具支持拖放文件处理。
- ⌨️ **全局快捷键** - 快速显示/隐藏主窗口。
- 📝 **统一日志系统** - 清晰的错误提示和日志记录。
- 🔗 **工具互联** - 多数工具支持"发送到聊天"功能，实现无缝的工具链协作。

### 🛠️ 内置工具

#### Git 仓库分析器

- 📊 **可视化分析** - 提交频率图、贡献者分布、提交热力图
- 🔍 **智能筛选** - 按信息/作者/日期搜索，滑块选择提交范围，并**可视化当前筛选条件**。
- 📄 **多格式导出** - 支持 Markdown、JSON、CSV、HTML、纯文本，可选择**包含筛选条件摘要**。
- 💬 **发送到聊天** - 分析结果可直接发送给 AI 进行深度总结

#### LLM 对话

- 🌳 **树形对话历史** - 革命性的非线性对话管理。每次重新生成都会创建新的**分支**，而不是覆盖，所有历史记录构成一棵可追溯的对话树。
- 🧭 **分支导航** - 可在同一提示产生的多个不同回答之间自由切换和比较，探索对话的无限可能性。
- ✍️ **消息编辑与控制** - 支持随时编辑已发送的用户或助手消息，或暂时禁用对话树中的任一节点，灵活构建和调整上下文。
- 🤖 **高级智能体管理** - 智能体配置采用"预设消息序列"，可创建复杂的角色扮演和对话开场。支持自定义图标、从预设创建，并支持**导入/导出**，方便备份和分享。
- 👤 **用户档案系统** - 创建并管理多个用户身份（如“高级程序员”、“产品经理”、“魔法少年”、“鸭嘴兽”），每个档案包含独立的指令和背景信息。可在对话中**随时切换**，或设置**全局默认**档案，让 AI 更好地理解你的角色和需求。
- 🚀 **组件窗口分离** - 可将对话区域或输入框拖拽为独立的浮动窗口，实现边聊边工作的多任务场景。
- ⚙️ **渲染器深度优化** - 持续完善 V2 渲染引擎，支持 Markdown 图片、高级代码块（换行切换、平滑动画），并允许用户在设置中选择渲染器版本。
- 🪄 **动态宏引擎** - 在智能体和用户档案中使用 `{{占位符}}` 语法动态注入上下文，如 `{{user}}`（用户名）、`{{persona}}`（用户档案）、`{{lastMessage}}`（最后一条消息）等，实现高度灵活和智能的提示词工程。

#### 资产管理器

- 📁 **可视化管理** - 统一管理应用内导入的所有资产（图片、视频、音频、文档）
- ⚡ **高性能懒加载** - 采用**服务端分页查询**和无限滚动，即使资产数量庞大也能流畅浏览。
- 📄 **文档预览** - 支持在应用内直接**预览** markdown、代码文件 等文档类型资产。
- 🔍 **智能搜索与筛选** - 按类型、来源、时间范围快速筛选资产
- 📊 **多视图模式** - 支持网格视图和列表视图，**工具栏支持响应式布局**。
- 🔄 **重复文件检测** - 自动识别和清理重复文件，节省存储空间

#### 正则表达式应用器

- 🔄 **批量处理** - 对文本或多文件进行链式正则替换
- 📦 **预设管理系统** - 创建、保存、切换规则集，支持拖拽排序
- ⚡ **语法糖** - 支持 `/模式/标志` 语法,快速定义正则标志
- 📊 **处理日志** - 显示匹配次数、耗时统计
- 💬 **发送到聊天** - 处理结果可发送给 AI 继续加工

#### 智能 OCR 文字识别

- 🤖 **多引擎支持** - Tesseract.js 本地离线、Windows 原生、VLM 模型、云端服务
- ✂️ **智能切图** - 自动检测空白区域，切割长图提高识别率
- 🎯 **交互式处理** - 可视化展示切割过程，支持单块重试
- 💬 **发送到聊天** - 识别文字可直接导入对话，让 AI 理解图片内容

#### 其他实用工具

- 📝 **JSON 格式化** - 智能格式化和美化 JSON 数据，支持语法高亮和错误提示，可发送到聊天
- 🧹 **目录清理器** - 按名称、大小、时间、深度等条件筛选并清理文件
- 🔗 **符号链接移动** - 批量移动文件并创建链接，支持"仅创建链接"模式
- 🌲 **目录树生成** - 支持 `.gitignore` 规则和 glob 过滤，可发送项目结构给 AI 分析
- 📊 **文本差异对比** - Monaco Editor 驱动，支持语法高亮和 patch 导出
- ✨ **代码格式化** - 基于 Prettier，支持多语言，格式化结果可发送到聊天
- 🖼️ **AI 图片元信息** - 读取 SD WebUI、ComfyUI 等生成的图片元数据
- 🔌 **服务配置中心**、 **API 测试器**、**Token 计算器** 等

## 📥 下载安装

### 🎯 推荐方式：下载发行版

<div align="center">

**无需配置开发环境，开箱即用！**

[![下载最新版本](https://img.shields.io/github/v/release/miaotouy/aio-hub?style=for-the-badge&logo=github&label=下载最新版本)](https://github.com/miaotouy/aio-hub/releases/latest)

</div>

前往 [Releases 页面](https://github.com/miaotouy/aio-hub/releases) 下载适合你操作系统的安装包：

| 平台           | 文件格式             | 说明                                                    |
| -------------- | -------------------- | ------------------------------------------------------- |
| 🪟 **Windows** | `.exe` 安装程序      | NSIS 安装程序，支持自动安装                             |
| 🍎 **macOS**   | `.dmg` 镜像文件      | 提供 ARM64 (Apple Silicon) 和 x64 (Intel) 两个版本      |
| 🐧 **Linux**   | `.deb` / `.AppImage` | deb 适用于 Debian/Ubuntu；AppImage 为通用格式，无需安装 |

> **💡 安装提示**:
>
> - **Windows**: 首次运行可能会提示 SmartScreen 警告，点击"更多信息"→"仍要运行"即可
> - **macOS**: 首次打开可能需要在"系统偏好设置"→"安全性与隐私"中允许运行
> - **Linux**: 使用 AppImage 前需先添加执行权限：`chmod +x *.AppImage`

### 🔧 从源码构建

如果你想参与开发或需要最新功能，可以从源码构建：

## 🚀 快速开始

### 📋 环境要求

| 工具     | 最低版本 | 推荐版本   |
| -------- | -------- | ---------- |
| Node.js  | 20.x     | 最新 LTS   |
| Rust     | 1.70+    | 最新稳定版 |
| 包管理器 | -        | Bun (推荐) |

### 📦 安装依赖

```bash
# 使用 Bun (推荐)
bun install

# 或使用 npm
npm install
```

### 🔨 开发模式

```bash
# 启动开发服务器
bun run tauri dev

# 或
npm run tauri dev
```

### 📦 构建应用

```bash
# 构建生产版本
bun run tauri build

# 或
npm run tauri build
```

> **💡 提示**：首次构建可能需要较长时间来下载 Rust 依赖，请耐心等待。

## 📁 项目结构

```
aio-hub/
├── docs/                   # 项目文档
├── plugins/                # 插件开发目录
├── public/                 # 静态资源
│   ├── model-icons/        # AI 模型图标库（130+ 图标）
│   ├── ocr-icons/          # OCR 服务商图标
│   └── tesseract-lang/     # Tesseract.js 语言包
├── src/                    # 前端源代码
│   ├── components/         # 公共组件（标题栏、图标等）
│   ├── composables/        # 组合式函数（主题、配置、窗口管理等）
│   ├── config/             # 配置定义（LLM/OCR 服务商、模型元数据等）
│   ├── llm-apis/           # LLM API 适配器
│   ├── router/             # 路由配置
│   ├── styles/             # 样式文件
│   ├── tools/              # 工具模块
│   │   ├── api-tester/     # API 测试器
│   │   ├── directory-tree/ # 目录树生成器
│   │   ├── git-analyzer/   # Git 仓库分析器
│   │   ├── llm-chat/       # LLM 对话工具
│   │   ├── regex-applier/  # 正则表达式应用器
│   │   ├── smart-ocr/      # 智能 OCR 识别
│   │   └── ...             # 其他工具（代码格式化、文本对比等）
│   ├── types/              # TypeScript 类型定义
│   ├── utils/              # 工具函数（日志、错误处理、配置管理等）
│   └── views/              # 视图页面
├── src-tauri/              # Tauri 后端
│   ├── src/
│   │   ├── commands/       # Tauri 命令模块
│   │   └── ...             # 其他后端模块
│   └── tauri.conf.json     # Tauri 配置
└── 配置文件                 # package.json, tsconfig.json, vite.config.ts 等
```

## 🔧 技术栈

<table>
<tr>
<td align="center" width="50%">

### 前端技术

- 🎨 **框架**: Vue 3 + TypeScript
- ⚡ **构建**: Vite
- 🎨 **样式**: CSS Variables (支持高级主题系统)
- 💾 **状态**: Composition API + Pinia
- 🖼️ **UI**: Element Plus + 原生样式组合

</td>
<td align="center" width="50%">

### 后端 & 工具

- 🦀 **桌面**: Tauri 2.0
- 📝 **编辑器**: Monaco / CodeMirror
- 📊 **图表**: ECharts
- 🎯 **工具**: Prettier, Tesseract.js
- 🔧 **包管理**: Bun (推荐)

</td>
</tr>
</table>

## 🎯 开发指南

### 添加新工具

1. 在 `src/tools/` 目录下创建新的工具文件夹
2. 实现工具组件（参考现有工具的结构）
3. 在 `src/stores/tools.ts` 中注册新工具
4. 在 `src/router/index.ts` 中添加路由
5. （可选）在 `src-tauri/src/commands/` 中添加后端命令

### 工具配置管理

每个工具都可以使用 `configManager` 来管理配置：

```typescript
import { useToolConfig } from "@/utils/configManager";

const { config, saveConfig, resetConfig } = useToolConfig("tool-name", {
  // 默认配置
});
```

## 📝 开发规范

- 使用 TypeScript 进行类型约束
- 组件使用 `<script setup>` 语法
- 遵循 Vue 3 Composition API 最佳实践
- 工具配置使用统一的配置管理器
- 注释使用中文

## 💖 支持项目

<div align="center">

如果这个项目对你有帮助，欢迎通过以下方式支持：

[![Star](https://img.shields.io/badge/⭐-给项目点个_Star-yellow?style=for-the-badge)](https://github.com/miaotouy/aio-hub)
[![Sponsor](https://img.shields.io/badge/☕-爱发电赞助-ff69b4?style=for-the-badge)](https://afdian.com/a/miaotouy)
[![Issues](https://img.shields.io/badge/🐛-提交_Issue-blue?style=for-the-badge)](https://github.com/miaotouy/aio-hub/issues)
[![PR](https://img.shields.io/badge/🔧-贡献代码-green?style=for-the-badge)](https://github.com/miaotouy/aio-hub/pulls)

</div>

### 🌟 为什么需要你的支持？

<table>
<tr>
<td width="25%" align="center">
<b>完全免费</b><br>
无任何隐藏费用
</td>
<td width="25%" align="center">
<b>全职投入</b><br>
作者全力开发
</td>
<td width="25%" align="center">
<b>持续更新</b><br>
不断添加新功能
</td>
<td width="25%" align="center">
<b>社区驱动</b><br>
听取用户反馈
</td>
</tr>
</table>

你的赞助将帮助：

- 🚀 持续添加新功能和工具
- 🐛 及时修复问题和优化性能
- 📚 完善文档和使用教程
- 💡 探索更多创新想法

## 🤝 贡献指南

<div align="center">

**欢迎任何形式的贡献！**

</div>

### 📝 贡献流程

```bash
# 1. Fork 本仓库并克隆到本地
git clone https://github.com/YOUR_USERNAME/aio-hub.git

# 2. 创建特性分支
git checkout -b feature/AmazingFeature

# 3. 提交更改
git commit -m '✨ Add some AmazingFeature'

# 4. 推送到分支
git push origin feature/AmazingFeature

# 5. 开启 Pull Request
```

### 💡 贡献建议

- 🐛 **Bug 修复**: 详细描述问题和复现步骤
- ✨ **新功能**: 先开 Issue 讨论可行性
- 📝 **文档**: 帮助完善使用文档和注释
- 🌍 **国际化**: 支持更多语言

## Star History

<a href="https://www.star-history.com/#miaotouy/aio-hub&type=date&legend=bottom-right">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=miaotouy/aio-hub&type=date&theme=dark&legend=bottom-right" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=miaotouy/aio-hub&type=date&legend=bottom-right" />
   <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=miaotouy/aio-hub&type=date&legend=bottom-right" />
 </picture>
</a>

## 📄 许可证

<div align="center">

**本项目采用 [MIT License](LICENSE) 开源协议**

这意味着你可以自由地：

✅ 商业使用 | ✅ 修改源代码 | ✅ 分发副本 | ✅ 私人使用

**唯一要求**：在分发时保留原始的版权和许可声明

<sub>Copyright © 2025 miaotouy. All rights reserved.</sub>

</div>
