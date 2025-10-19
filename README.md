# All-in-One Tools 工具集

一个基于 Tauri + Vue 3 + TypeScript 开发的桌面端工具集应用，提供多种实用的开发和日常工具。

## ✨ 功能特性

### 🎨 系统核心功能

#### 窗口管理

- 🪟 **多窗口支持** - 工具可拖拽分离为独立浮动窗口，支持多任务布局
- 📌 **窗口状态记忆** - 自动记忆并恢复所有窗口的位置与大小
- 🧲 **边缘吸附** - 防止窗口拖出屏幕，可选禁用
- ✨ **拖拽视觉反馈** - 拖拽时显示动画指示器窗口

#### 设置中心

- ⚙️ **配置管理** - 支持导入/导出所有配置，可直接打开配置目录
- 🎨 **主题定制** - 亮色/暗色/跟随系统，自定义主题色和强调色
- 🔧 **工具模块管理** - 选择性显示或隐藏工具
- 📋 **系统托盘** - 最小化到托盘而非直接退出

#### UI 与交互

- 🎯 **自定义标题栏** - 统一的视觉风格和窗口控制
- 📂 **可收缩侧边栏** - 灵活的工具导航
- 🏠 **仪表盘主页** - 卡片网格展示所有工具
- 🎪 **文件拖放** - 多数工具支持拖放文件处理
- ⌨️ **全局快捷键** - 快速显示/隐藏主窗口
- 📝 **统一日志系统** - 清晰的错误提示和日志记录

### 🛠️ 内置工具

#### Git 仓库分析器

- 📊 **可视化分析** - 提交频率图、贡献者分布、提交热力图
- 🔍 **智能筛选** - 按信息/作者/日期搜索，滑块选择提交范围
- 📄 **多格式导出** - 支持 Markdown、JSON、CSV、HTML、纯文本

#### 正则表达式应用器

- 🔄 **批量处理** - 对文本或多文件进行链式正则替换
- 📦 **预设管理系统** - 创建、保存、切换规则集，支持拖拽排序
- ⚡ **语法糖** - 支持 `/模式/标志` 语法，快速定义正则标志
- 📊 **处理日志** - 显示匹配次数、耗时统计

#### 智能 OCR 文字识别

- 🤖 **多引擎支持** - Tesseract.js 本地离线、Windows 原生、VLM 模型、云端服务
- ✂️ **智能切图** - 自动检测空白区域，切割长图提高识别率
- 🎯 **交互式处理** - 可视化展示切割过程，支持单块重试

#### LLM / AI 模型工具集

- 🔌 **服务配置中心** - 集中管理 API 配置，支持主流服务商预设模板
- 🎨 **模型图标管理** - 内置数百个模型图标，支持自定义匹配规则和分组
- 🔍 **代理监听器** - 拦截查看 AI 客户端与 API 之间的通信，支持流式响应

#### API 测试器

- 🌐 **全功能 HTTP 客户端** - 支持各类请求方法、Header、Body
- 🔑 **变量系统** - 管理动态参数
- 📱 **AI API 预设** - 内置 OpenAI、Gemini、Claude 等模板
- 📡 **流式响应** - 实时处理 SSE 响应

#### LLM 对话

- 🤖 **智能体系统** - 预设角色、模型和系统提示词，实现快速切换
- 💬 **多会话管理** - 支持创建、切换、删除和持久化多个对话
- 🚀 **窗口分离** - 可将对话区域拖拽为独立的浮动窗口，支持跨窗口状态同步

#### 其他实用工具

- 🧹 **目录清理器** - 按名称、大小、时间、深度等条件筛选并清理文件
- 🔗 **符号链接移动** - 批量移动文件并创建链接，支持"仅创建链接"模式
- 🌲 **目录树生成** - 支持 `.gitignore` 规则和 glob 过滤
- 📝 **文本/JSON 对比** - Monaco Editor 驱动，支持语法高亮和 patch 导出
- ✨ **代码格式化** - 基于 Prettier，支持多语言
- 🖼️ **AI 图片元信息** - 读取 SD WebUI、ComfyUI 等生成的图片元数据

## 🚀 快速开始

### 环境要求

- Node.js >= 20
- Rust >= 1.70
- Bun 或 npm/yarn/pnpm

### 安装依赖

```bash
# 使用 Bun (推荐)
bun install

# 或使用 npm
npm install
```

### 开发模式

```bash
# 启动开发服务器
bun run tauri dev

# 或
npm run tauri dev
```

### 构建应用

```bash
# 构建生产版本
bun run tauri build

# 或
npm run tauri build
```

## 📁 项目结构

```
all-in-one-tools/
├── docs/                    # 项目文档
├── public/                  # 静态资源
│   ├── model-icons/        # AI 模型图标库（130+ 图标）
│   ├── ocr-icons/          # OCR 服务商图标
│   └── tesseract-lang/     # Tesseract.js 语言包
├── src/                     # 前端源代码
│   ├── components/         # 公共组件（标题栏、图标等）
│   ├── composables/        # 组合式函数（主题、配置、窗口管理等）
│   ├── config/             # 配置定义（LLM/OCR 服务商、模型元数据等）
│   ├── llm-apis/           # LLM API 适配器
│   ├── router/             # 路由配置
│   ├── styles/             # 样式文件
│   ├── tools/              # 工具模块
│   │   ├── api-tester/    # API 测试器
│   │   ├── directory-janitor/ # 目录清理器
│   │   ├── directory-tree/ # 目录树生成器
│   │   ├── git-analyzer/   # Git 仓库分析器
│   │   ├── llm-chat/       # LLM 对话工具
│   │   ├── llm-proxy/      # LLM 代理监听器
│   │   ├── regex-applier/  # 正则表达式应用器
│   │   ├── smart-ocr/      # 智能 OCR 识别
│   │   └── ...             # 其他工具（代码格式化、文本对比等）
│   ├── types/              # TypeScript 类型定义
│   ├── utils/              # 工具函数（日志、错误处理、配置管理等）
│   └── views/              # 视图页面
├── src-tauri/              # Tauri 后端
│   ├── src/
│   │   ├── commands/      # Tauri 命令模块
│   │   └── ...            # 其他后端模块
│   └── tauri.conf.json   # Tauri 配置
└── 配置文件                # package.json, tsconfig.json, vite.config.ts 等
```

## 🔧 技术栈

- **前端框架**: Vue 3 + TypeScript
- **桌面框架**: Tauri
- **构建工具**: Vite
- **样式**: CSS + CSS Variables
- **状态管理**: Composition API + LocalStorage
- **代码编辑器**: Monaco Editor / CodeMirror

## 🎯 开发指南

### 添加新工具

1. 在 `src/tools/` 目录下创建新的工具文件夹
2. 实现工具组件（参考现有工具的结构）
3. 在 `src/config/tools.ts` 中注册新工具
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

### 主题定制

主题变量定义在 `src/styles/dark/css-vars.css` 中，可以通过修改 CSS 变量来自定义主题。

## 📝 开发规范

- 使用 TypeScript 进行类型约束
- 组件使用 `<script setup>` 语法
- 遵循 Vue 3 Composition API 最佳实践
- 工具配置使用统一的配置管理器
- 注释使用中文

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

还没想好
