# All-in-One Tools 工具集

一个基于 Tauri + Vue 3 + TypeScript 开发的桌面端工具集应用，提供多种实用的开发和日常工具。

## ✨ 功能特性

### 🛠️ 已实现的工具

- **正则批量替换** - 使用正则表达式批量处理文本或文件，支持预设管理
- **媒体信息读取器** - 读取图片、视频等媒体文件的详细信息
- **文本/JSON对比** - 对比文本和 JSON 文件的差异
- **JSON 格式化** - 格式化和美化 JSON 数据
- **代码格式化** - 格式化各种编程语言代码
- **符号链接搬家工具** - 支持拖拽的文件批量移动和符号链接创建工具
- **目录结构浏览器** - 生成目录树结构，支持过滤规则和深度限制
- **API 测试工具** - 测试各类 API 接口，支持 OpenAI、Gemini、Claude 等预设
- **LLM 代理监听器** - 监听和分析 LLM API 请求，捕获客户端与服务器之间的通信
- **Git 分析器** - Git 提交记录分析和可视化处理工具

### 🎨 界面特性

- 🌓 深色/浅色主题切换
- 📱 响应式布局设计
- 🎯 统一的工具卡片布局
- 💾 工具配置本地持久化
- 🔧 每个工具独立的配置管理

## 🚀 快速开始

### 环境要求

- Node.js >= 18
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
├── src/                        # 前端源代码
│   ├── components/             # 公共组件
│   │   ├── common/            # 通用组件
│   │   └── icons/             # 图标组件
│   ├── tools/                 # 工具页面
│   │   ├── api-tester/        # API 测试工具
│   │   ├── directory-tree/    # 目录结构浏览器
│   │   ├── git-analyzer/      # Git 分析器
│   │   ├── llm-proxy/         # LLM 代理监听器
│   │   ├── regex-applier/     # 正则批量替换工具
│   │   ├── CodeFormatter.vue  # 代码格式化
│   │   ├── JsonFormatter.vue  # JSON 格式化
│   │   ├── MediaInfoReader.vue # 媒体信息读取器
│   │   ├── SymlinkMover.vue   # 符号链接搬家工具
│   │   └── TextDiff.vue       # 文本/JSON对比
│   ├── config/                # 配置文件
│   ├── router/                # 路由配置
│   ├── styles/                # 样式文件
│   └── utils/                 # 工具函数
├── src-tauri/                 # Tauri 后端
│   ├── src/
│   │   ├── commands/          # Tauri 命令
│   │   └── main.rs           # 主入口
│   └── tauri.conf.json       # Tauri 配置
└── package.json

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
import { useToolConfig } from '@/utils/configManager'

const { config, saveConfig, resetConfig } = useToolConfig('tool-name', {
  // 默认配置
})
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
