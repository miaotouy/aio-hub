# AIO Hub

**一站式桌面AI工具枢纽 | 开发者的效率利器**

# 项目规范与特性指南

本文档提供项目的核心概览和最常用的开发规范。详细的专题文档请参考：

- [核心开发规范](./development-standards.md) - 错误处理、日志系统、UI 组件使用规范
- [自定义组件与封装指南](./components-guide.md) - 通用组件和 Composables 使用说明
- [主题外观系统](./theme-appearance.md) - 主题适配和样式规范
- [移动端规范](./mobile-protocols.md) - 移动端开发的完整规范

## 1. 技术栈概览

本项目是一个基于 Tauri v2 构建的跨平台桌面应用，前端采用 Vue 3.5+，后端核心逻辑由 Rust 编写。

### 1.1. 前端技术栈

- **核心框架**: Vue 3.5+ + Vite 8.0+
- **UI 框架**: Element Plus 2.10+ + lucide-vue-next
- **状态管理**: Pinia 3.0+
- **核心工具**:
  - `@vueuse/core`: 响应式工具集 (v13+)
  - `lodash-es`: 实用工具函数库
  - `echarts`: 数据可视化 (v6+)
  - `date-fns`: 日期时间处理 (v4+)
  - `markdown-it`: Markdown 解析
  - `dompurify`: HTML 安全净化
  - `viewerjs`: 图片查看器核心
  - `@vue-flow/core`: 节点编辑器与图谱引擎 (v1.47+)
- **代码编辑**: CodeMirror 6, Monaco Editor 0.55+
- **桌面框架**: Tauri 2.10+
- **包管理器**: Bun 1.3+
- **CSP配置**: 在根目录的 `index.html` 中

### 1.2. 后端 (Rust) 技术栈

- **核心语言**: Rust
- **本地 Web 服务**: Axum, Tokio, Hyper (用于 LLM 代理等)
- **原生能力**:
  - Windows OCR API
  - 全局鼠标监听 (`rdev`)
  - 文件安全删除至回收站 (`trash`)
  - 文件系统操作 (`fs_extra`)

### 1.3. 项目脚本与开发命令

项目使用 Bun 作为包管理器。由于本项目包含桌面端和移动端，不同的端有各自的开发和检查命令。

#### 1.3.1. 桌面端 (Desktop)
在根目录下执行：
- **`dev`** – 启动 Vite 开发服务器，用于前端开发。
- **`build`** – 执行类型检查（`vue-tsc`）并构建前端生产包。
- **`preview`** – 预览生产构建结果。
- **`tauri:dev`** (或 **`t:d`**) – 启动 Tauri 开发模式（同时运行前端开发服务器与本地应用）。
- **`tauri:build`** (或 **`t:b`**) – 构建 Tauri 桌面应用（生成安装包）。
- **`check`** – 同时运行前端类型检查与后端代码检查（`cargo clippy`）。
- **`check:frontend`** – 仅运行前端 TypeScript 类型检查。
- **`check:backend`** – 仅运行 Rust 代码的 Clippy 检查。

#### 1.3.2. 移动端 (Mobile)
移动端位于 `mobile/` 目录，有独立的 `package.json` 和命令。

**在根目录下执行（推荐，使用快捷命令）：**
- **`mtad`** – `cd mobile ; bun run tauri android dev` (Android 开发模式)。
- **`mtab`** – `cd mobile ; bun run tauri android build` (Android 构建)。
- **`mtid`** – `cd mobile ; bun run tauri ios dev` (iOS 开发模式)。
- **`mtib`** – `cd mobile ; bun run tauri ios build` (iOS 构建)。
- **`check:mobile`** – 移动端全量检查（前端 `vue-tsc` + 后端 `clippy`）。
- **`check:mobile:frontend`** – 仅运行移动端前端类型检查。
- **`check:mobile:backend`** – 仅运行移动端 Rust 代码检查。

**或在 `mobile/` 目录下直接执行：**
- **`mtad`** / **`mtab`** / **`mtid`** / **`mtib`** – Tauri 移动端开发/构建命令。
- **`check`** – 移动端全量检查。
- **`check:frontend`** – 仅前端类型检查。
- **`check:backend`** – 仅 Rust 代码检查。

> **重要**: 在进行移动端开发或代码检查时，请务必确认当前操作的是 `mobile/` 目录下的代码，并使用对应的 `check:mobile*` 系列命令，严禁混用桌面端的 `check` 命令。

## 2. 版本号管理与发布规范 (Versioning & Release Protocols)

项目采用语义化版本 (SemVer)，并根据端侧独立管理版本号。GitHub Actions 会根据特定的 Git Tag 触发自动构建与发布。

### 2.1. 桌面端 (Desktop)

- **核心文件**:
  - `package.json`
  - `src-tauri/tauri.conf.json`
- **同步要求**: 两个文件中的 `version` 字段必须严格一致。
- **发布触发 (GitHub Actions)**:
  - **Tag 格式**: `v*.*.*` (例如 `v0.4.6`)。
  - **逻辑**: 推送此格式的 Tag 将触发桌面端多平台构建并创建 Release。

### 2.2. 移动端 (Mobile)

- **核心文件**:
  - `mobile/package.json`
  - `mobile/src-tauri/tauri.conf.json`
- **同步要求**: 两个文件中的 `version` 字段必须严格一致。
- **发布触发 (GitHub Actions)**:
  - **Tag 格式**: `v*.*.*-m` 或 `v*.*.*-m-*` (例如 `v0.1.0-m`)。
  - **逻辑**: 推送带 `-m` 后缀的 Tag 将触发移动端 (Android) 构建。Action 会自动剥离 `-m` 后缀以获取实际版本号用于应用包命名。

### 2.3. Git 提交规范

- **版本更新提交**: 建议使用 `chore(release): vX.Y.Z` 或 `fix(version): sync version to X.Y.Z`。
- **双端推送**: 若单次提交涉及双端版本更新，应在提交信息中明确标注，并分别推送对应的 Tag 以触发各自的构建流程。

## 3. 文档管理规范 (Documentation Protocols)

为了保持项目文档的条理清晰，所有技术方案、重构计划和设计文档必须遵循以下存放路径规范：

### 3.1. 存放路径

- **具体模块修改计划**: 针对特定工具（Tool）的修改或重构计划，应存放在该工具目录下的文档目录中。
  - **路径**: `src/tools/{toolId}/design/Plan/` (桌面端) 或 `mobile/src/tools/{toolId}/design/Plan/` (移动端)。
- **全局/跨模块计划**: 涉及应用整体架构、多个工具协同或全局基础设施的修改计划。
  - **路径**: `docs/Plan/`。
- **架构文档**: 描述已实现的系统架构、核心原理和技术选型。
  - **路径**: `docs/architecture/`。
- **设计草案**: 处于早期构思阶段、尚未确定实施的方案。
  - **路径**: `docs/design/`。

### 3.2. 基本原则

- **禁止乱放**: 严禁将重构计划或临时文档直接丢在 `docs/architecture/` 或根目录下。
- **区分状态**: 在文件名或文档开头明确标注文档状态（如：`RFC`, `Draft`, `Implementing`, `Archived`）。
- **同步更新**: 当计划实施完毕且架构发生变更时，应及时更新 `docs/architecture/` 下的相关文档，并将原计划文档移至 `Archived` 或进行标注。

## 4. 工具注册规范 (Tool Registration)

项目采用模块化插件式架构，新工具必须遵循特定的注册流程以接入系统。

### 4.1. 桌面端 (Desktop)

桌面端工具位于 `src/tools/`，采用**自动发现机制**。

- **核心文件**: `src/tools/{toolId}/{toolId}.registry.ts` (必须以 `.registry.ts` 结尾)。
- **注册逻辑**:
  - **UI 注册**: 导出 `toolConfig: ToolConfig` 对象，包含名称、路径、图标及动态导入的组件。
  - **服务注册 (可选)**: 默认导出实现 `ToolRegistry` 接口的类，用于暴露能力给 LLM 或其他模块。
- **排序控制**: 在 `src/config/tools.ts` 的 `DEFAULT_TOOLS_ORDER` 中添加路径以控制侧边栏顺序。

### 4.2. 移动端 (Mobile)

移动端工具位于 `mobile/src/tools/`，遵循**显式注册机制**。

- **核心文件**: `mobile/src/tools/{toolId}/*.registry.ts` (必须以 `.registry.ts` 结尾，与桌面端对齐)。
- **注册逻辑**:
  - **语言包注册**: 必须在导出前调用 `registerToolLocales`。
  - **配置导出**: 默认导出包含 `id`、`name` (使用 getter)、`icon` 及 `route` 配置的对象。
- **自动路由**: 系统会自动扫描所有工具目录下的 `*.registry.ts` 文件并注册到路由系统。
