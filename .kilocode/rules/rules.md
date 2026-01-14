# AIO Hub

**一站式桌面AI工具枢纽 | 开发者的效率利器**

# 项目规范与特性指南

本文档旨在阐述项目的主要技术栈、开发规范、核心特性及自定义组件，帮助开发者快速了解项目并遵循统一标准。

## 1. 技术栈概览

本项目是一个基于 Tauri v2 构建的跨平台桌面应用，前端采用 Vue 3，后端核心逻辑由 Rust 编写。

### 1.1. 前端技术栈

- **核心框架**: Vue 3 + Vite
- **UI 框架**: Element Plus + lucide-vue-next
- **状态管理**: Pinia
- **核心工具**:
  - `@vueuse/core`: 响应式工具集
  - `lodash-es`: 实用工具函数库
  - `echarts`: 数据可视化
  - `date-fns`: 日期时间处理
  - `markdown-it`: Markdown 解析
  - `dompurify`: HTML 安全净化
  - `viewerjs`: 图片查看器核心
  - `mermaid`: 流程图与图表渲染
  - `katex`: 数学公式渲染
  - `@vue-flow/core`: 节点编辑器与图谱引擎
- **代码编辑**: CodeMirror, Monaco Editor
- **桌面框架**: Tauri 2.0
- **包管理器**: Bun

### 1.2. 后端 (Rust) 技术栈

- **核心语言**: Rust
- **本地 Web 服务**: Axum, Tokio, Hyper (用于 LLM 代理等)
- **原生能力**:
  - Windows OCR API
  - 全局鼠标监听 (`rdev`)
  - 文件安全删除至回收站 (`trash`)
  - 文件系统操作 (`fs_extra`)

### 1.3. 项目脚本与开发命令

项目使用 Bun 作为包管理器，在 `package.json` 的 `scripts` 字段中定义了一系列开发、构建、检查与格式化的命令。以下为常用脚本的说明：

- **`dev`** – 启动 Vite 开发服务器，用于前端开发。
- **`build`** – 执行类型检查（`vue-tsc`）并构建前端生产包。
- **`preview`** – 预览生产构建结果。
- **`tauri`** – 调用 Tauri CLI（需配合子命令使用）。
- **`tauri:dev`** – 启动 Tauri 开发模式（同时运行前端开发服务器与本地应用）。
- **`tauri:build`** – 构建 Tauri 桌面应用（生成安装包）。
- **`t:d`** – `tauri:dev` 的快捷别名。
- **`t:b`** – `tauri:build` 的快捷别名。
- **`check`** – 同时运行前端类型检查与后端代码检查（`cargo clippy`）。
- **`check:frontend`** – 仅运行前端 TypeScript 类型检查。
- **`check:backend`** – 仅运行 Rust 代码的 Clippy 检查。
- **`sync:icons`** – 同步图标资源（将预设图标复制到应用数据目录）。

这些脚本可通过 `bun run <script>` 执行（例如 `bun run dev`）。在开发过程中，最常用的命令是 `bun run tauri:dev`（或 `bun run t:d`）以启动完整的桌面应用开发环境。

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

## 3. 核心开发规范

为了保证代码质量和项目可维护性，桌面端开发活动应遵循以下核心规范。

### 2.1. 错误处理

项目采用统一的全局错误处理机制，定义于 `src/utils/errorHandler.ts`。其核心设计是**模块化**和**自动日志记录**。

- **核心规范：必须使用模块化处理器**
  - 所有模块（如 `services`, `composables`, `stores`）都**必须**使用 `createModuleErrorHandler(moduleName)` 创建独立的错误处理器。这能确保错误来源清晰可追溯。
  - **禁止**直接导入和使用全局的 `errorHandler` 单例。
  - **示例**:
    ```typescript
    // a/b/c.ts
    import { createModuleErrorHandler } from "@/utils/errorHandler";
    const errorHandler = createModuleErrorHandler("a/b/c");
    ```

- **使用模式一：自动包装 (推荐)**
  - 使用 `wrapAsync` 和 `wrapSync` 函数可以极大地简化 `try...catch` 样板代码。
  - **重要**: 包装函数在捕获到错误后会返回 `null`。**调用方必须处理 `null` 返回值**，以避免后续逻辑出错。
  - **示例**:

    ```typescript
    const result = await errorHandler.wrapAsync(async () => someApiCall(), {
      userMessage: "获取数据失败，请重试",
    });

    if (result === null) {
      // 错误已被自动处理（提示用户 + 记录日志），此处执行回退逻辑
      return;
    }
    // ...继续处理 result
    ```

- **使用模式二：手动处理（快捷方法）**
  - 在 `try...catch` 块中，使用模块处理器的快捷方法 `.error()`, `.warn()` 等。
  - **重要**: `errorHandler` **会自动调用日志系统**。因此，**严禁**在 `catch` 块中同时调用 `logger.error()` 和 `errorHandler.error()`，这会导致日志重复记录。
  - **快捷方法签名**: `errorHandler.error(error, userMessage?, context?)`
    - 第二个参数为可选的用户提示消息
    - 第三个参数为可选的结构化上下文数据（用于日志调试）
  - **示例**:

    ```typescript
    try {
      // ...
    } catch (error) {
      // 正确：只调用 errorHandler，它会负责提示用户和记录日志
      errorHandler.error(error, "操作失败", { attachedData: 123 });

      // 错误：重复记录
      // logger.error('操作失败', error); // 不要这样做！
    }
    ```

- **使用模式三：手动处理（handle 方法，高级选项）**
  - 当需要更精细的控制时（如静默处理），使用 `.handle()` 方法。
  - **示例**:

    ```typescript
    try {
      // ...
    } catch (error) {
      // 静默处理：只记录日志，不向用户显示提示
      errorHandler.handle(error, {
        userMessage: "渲染失败",
        showToUser: false,
        context: { diagramType: "mermaid" },
      });
    }
    ```

- **关键选项（仅 `handle` 方法支持）**
  - `showToUser: false`: 静默处理错误，只记录日志而不向用户显示任何提示。适用于后台或非关键操作。
  - `userMessage: '...'`: 自定义向用户显示的消息，覆盖默认生成的友好提示。
  - `context: { ... }`: 附加的结构化数据，会一并记录到日志中，用于调试。
  - `level: ErrorLevel.WARNING`: 指定错误级别（INFO/WARNING/ERROR/CRITICAL）。
  - **特殊规则**: `AbortError` (通常由用户取消操作触发) 会被系统自动降级为 `INFO` 级别并且静默处理，业务代码中**无需**进行额外捕获和处理。

### 2.2. 日志系统

项目使用统一的日志系统，定义于 `src/utils/logger.ts`，支持结构化、分级和持久化。

- **核心规范：必须使用模块化日志**
  - 所有模块都**必须**使用 `createModuleLogger(moduleName)` 创建独立的日志记录器。
  - **示例**:
    ```typescript
    // a/b/c.ts
    import { createModuleLogger } from "@/utils/logger";
    const logger = createModuleLogger("a/b/c");
    ```

- **日志记录规范**
  - **结构化日志**: 所有日志方法 (`.info`, `.warn` 等) 的第二个参数用于传递结构化的 `data` 对象。**禁止**将数据通过字符串拼接的方式记录在消息中。
  - **错误日志**: `.error()` 方法的第二个参数应始终传递原始的 `Error` 对象，以保留完整的堆栈信息用于调试。
  - **控制台折叠**: 对于包含大量数据的日志，可以传递第三个参数 `collapsed: true`，使其在开发者控制台中默认折叠，保持日志主干清晰。
  - **示例**:

    ```typescript
    // 推荐做法
    logger.info("用户配置已加载", { userId: "abc", theme: "dark" });
    logger.error("API 请求失败", error, { url: "/api/data" });
    logger.debug(
      "组件状态更新",
      {
        newState: {
          /* ... */
        },
      },
      true
    ); // 折叠显示

    // 不推荐的做法
    logger.info(`用户 ${userId} 的配置已加载，主题是 ${theme}`);
    logger.error(`API 请求失败: ${error.message}`);
    ```

- **日志输出**: 日志会同时输出到开发者控制台和本地日志文件 (`appDataDir/logs/app-YYYY-MM-DD.log`)。

## 3. 自定义组件与封装

### 3.1. `customMessage` (消息提示)

- **文件路径**: `src/utils/customMessage.ts`
- **目的**: 封装 Element Plus 的 `ElMessage` 组件。
- **核心功能**: 自动为消息提示框添加 `offset`，防止其被自定义的无边框标题栏遮挡。
- **使用方法**: 调用方式与 `ElMessage` 完全一致，例如 `customMessage.success('操作成功')`。在项目中应优先使用 `customMessage` 而不是直接使用 `ElMessage`。

### 3.2. 通用 UI 组件

项目主要在 `src/components/common/` 目录下（部分位于 `src/components/` 或 `src/tools/`）封装了一系列可复用的通用组件，详细使用方法请参考各组件的示例文档：

- **BaseDialog** - 解决 Element Plus Dialog 样式问题的干净对话框组件，支持精确高度控制和 bare 模式。
  - **尺寸准则**: 对于功能性表单或管理界面，应优先使用响应式尺寸（如 `width="90%"` 或 `width="1200px"`），高度建议设为 `height="80vh"` 或以上，确保内容展示充分。
- **DraggablePanel** - 通用悬浮面板组件，支持拖拽移动、调整大小、最小化、视口自动吸附和状态持久化。
- **Avatar** - 通用头像组件，自动识别图片/Emoji/文字，支持 `appdata://` 路径，支持名字首字回退。
- **AvatarSelector** - 高级头像选择器（暂时只支持chat相关的头像选择），支持预设图标、本地图片引用、图片上传（自动存入 AppData）和历史记录管理。
- **RichCodeEditor** - 双引擎代码编辑器（CodeMirror/Monaco），自动适配主题。
- **LlmModelSelector** - LLM 模型下拉选择器，支持按能力筛选和分组显示。
- **ModelSelectDialog** - LLM 模型弹窗，提供可视化的模型选择界面和搜索筛选功能。
- **ImageViewer** - 基于 Viewer.js 的图片查看器组件，支持缩放、旋转等操作。
- **VideoPlayer** - 全功能视频播放器，支持倍速、画中画、截图、快捷键控制。
- **VideoViewer** - 基于 VideoPlayer 的模态框视频查看器。
- **FileIcon** - 文件图标组件，基于文件名后缀自动匹配 VSCode 风格或 Lucide 图标。
- **DropZone** - 文件拖放区域组件，支持文件类型过滤和自定义验证。
- **IconPresetSelector** - 图标预设选择器，支持搜索和分类过滤。
- **DynamicIcon** - 动态图标加载组件，用于从 URL 或路径加载 SVG/图片资源。其核心是支持主题自适应（特别是对 SVG 的动态着色），并提供懒加载和字符回退。注意：它并非通用图标组件，不应用于替代 `lucide-vue-next` 等常规图标。
- **DetachPreviewHint** - 可分离窗口的预览提示组件。
- **InfoCard** - 信息卡片组件，el-card的封装，用于展示结构化信息。
- **DocumentViewer** - 多格式文档预览组件，支持 Markdown 渲染、HTML 页面预览和代码文件预览，提供源码/预览模式切换和双引擎代码编辑器。
- **ComponentHeader** - (`src/components/`) 专用于**可分离/悬浮窗口组件**的头部，提供置顶、分离（弹出新窗口）等特定交互逻辑，并自动适配拖拽模式。普通工具页面不应使用。

## 4. 核心特性与 Composables

项目通过 Vue Composables 实现了许多核心功能的高度复用。

- **LLM 与 OCR 功能集成**:
  - `useLlmProfiles` 和 `useOcrProfiles` 负责管理用户的服务配置（如 API Key、模型偏好等）。
  - `useLlmRequest` 封装了向 LLM 发起请求的核心逻辑。
  - `useModelMetadata` 管理着不同 LLM 模型的元数据和能力信息。
  - `useModelSelectDialog` 提供全局的模型选择对话框功能。

- **资产管理**:
  - `useAssetManager` 提供统一的资产管理接口，支持文件导入、读取和协议转换等功能。

- **主题与样式**:
  - `useTheme` 负责应用整体主题（明/暗）的切换和管理。
  - `useThemeAwareIcon` 用于图标的主题自适应处理。

- **文件交互**:
  - `useFileDrop` 提供了文件拖拽到应用窗口的功能。
  - `useFileInteraction` 统一处理文件的拖放和粘贴交互，支持自动转换为 Asset 或直接处理文件对象。
  - `useChatFileInteraction` 专门用于聊天附件场景，自动将粘贴的文件转换为 Asset。
  - `useImageFileInteraction` 专门用于图片上传场景，只接受图片文件。

- **窗口管理**:
  - `useDetachable` 统一处理可分离组件/工具的拖拽逻辑，支持将组件拖拽为独立窗口。
  - `useDetachedManager` 管理分离窗口的生命周期和状态同步。

- **UI 交互**:
  - `useImageViewer` 提供全局的图片查看功能，支持缩放、旋转等操作。

## 5. 主题外观系统 (Theme Appearance)

项目包含一个强大的主题外观系统，允许用户动态调整应用的透明度、模糊等视觉效果。核心逻辑封装在 `src/composables/useThemeAppearance.ts` 中。

#### 核心机制

该系统通过在 `<html>` 根元素上动态设置 CSS 自定义属性 (CSS Variables) 来工作。所有组件都应优先使用这些变量来定义背景、边框等样式，以确保与用户设置保持一致。

#### 如何适配新组件

要使你的组件支持动态主题外观，请遵循以下原则：

1.  **背景**: 根据组件的角色，使用对应的背景变量。这些变量已经包含了基于用户设置的透明度。
    - **卡片/面板**: `background-color: var(--card-bg);`
    - **输入框**: `background-color: var(--input-bg);`
    - **侧边栏**: `background-color: var(--sidebar-bg);`
    - **对话框/遮罩层**: `background-color: var(--container-bg);`

2.  **模糊效果 (Glassmorphism)**: 如果希望组件拥有毛玻璃效果，请添加 `backdrop-filter` 属性。模糊强度由用户设置动态控制。
    - `backdrop-filter: blur(var(--ui-blur));`

3.  **边框**: 边框颜色已经预设了透明度，可以直接使用 `--border-color` 变量。
    - `border: 1px solid var(--border-color);`

4.  **代码编辑器**: 对于代码编辑区域（如 CodeMirror/Monaco），应使用特定变量以匹配用户设置：
    - `background-color: var(--vscode-editor-background);`

#### 示例

一个正确适配主题的卡片组件样式参考可能如下：

```css
.my-custom-card {
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-sizing: border-box;
  /*box-shadow: var(--el-box-shadow-light); /* 可选，复用 Element Plus 的阴影 */
}
```

通用组件中的已经预先适配过了

通过遵循 these 规范，可以确保所有 UI 元素都能响应设置中的“界面质感”调整，提供统一、高度可定制的用户体验。

---

# 移动端规范 (Mobile Protocols)

移动端开发遵循**“独立重构，全量对齐，架构自治”**的原则。移动端位于 `mobile/` 目录，作为一个与桌面端对等的完整系统。

## 1. 移动端技术栈

- **核心框架**: Vue 3 + Vite
- **UI 框架**: `@varlet/ui` (Material Design 3 风格)
- **状态管理**: Pinia
- **路由管理**: Vue Router (支持工具路由自动扫描)
- **调试工具**: `vConsole`
- **核心工具**: `@vueuse/core`, `lodash-es`, `lucide-vue-next`
- **跨平台框架**: Tauri ^2.0 (Android / iOS)

## 2. 核心开发规范

### 2.1. 架构原则：逻辑函数式化 (Functional Core)

移动端减少使用过于扁平、零散的 Composables，采取以下准则：

- **纯函数逻辑 (Pure Functional Logic)**: 复杂业务逻辑应抽离为纯函数，放置在工具的 `core/` 或 `logic/` 目录下。逻辑函数应保持“无状态”，不依赖 Vue 的 `ref` 或生命周期。
- **状态与逻辑分离**: Store 仅作为数据仓库；Logic 模块负责计算与请求；Composables 仅作为 UI 与 Logic/Store 之间的“粘合剂”。
- **逻辑物理聚合**: 工具内部逻辑必须通过子目录隔离（如 `composables/`, `components/`, `types/`），严禁在工具根目录铺开大量文件。

### 2.2. 工具自治特区 (Tool Autonomy)

移动端工具位于 `mobile/src/tools/` 下，每个工具都是一个自治单元。

- **注册机制**: 每个工具必须包含 `registry.ts`，定义工具的元数据（ID、名称、图标、路由）。
- **自动路由**: `mobile/src/router/index.ts` 会自动扫描所有工具的 `registry.ts` 并注册路由。
- **基础设施平替**: 移动端使用 `mobile/src/utils/` 下的平替工具（如 `errorHandler`, `logger`），它们保持与桌面端一致的接口，但内部对接 Varlet UI。

### 2.3. 响应式与单位规范 (Responsive & Units)

为了适配移动端多变的屏幕尺寸及用户个性化的字体缩放需求，必须遵循以下单位规范：

- **字体大小 (Font Size)**: **严禁使用 `px`**，必须使用 `rem`。
  - **基准**: 系统默认 `1rem = 14px` (在缩放比例为 1.0 时)。
  * **动态缩放**: `App.vue` 会根据用户设置动态调整根元素的 `font-size`，从而影响全局 `rem` 表现。
- **Varlet 变量同步**: 系统会自动同步更新 Varlet 的基础字号变量（`--font-size-md`, `--font-size-sm` 等），确保 UI 组件库与应用整体步调一致。
- **间距与尺寸**:
  - 容器内边距、外边距建议使用 `px` (固定感) 或 `rem` (随字缩放感)，视 UI 意图而定。
  - 图标大小 (`size` 属性) 建议根据重要程度决定是否硬编码。

### 2.4. 多语言架构 (i18n Strategy)

移动端采用 **"中文作为 Key (Source Text as Key)"** 的方案，以提高开发直观度。

#### 2.4.1. 核心原则

- **直观开发**: 代码中直接书写中文 Key，无需在文件间频繁跳转。
- **强类型推导**: 利用 TypeScript 从 `zh-CN.json` 自动推导 Key 的联合类型，确保拼写检查与自动补全。
- **命名空间隔离**: 通过层级结构区分不同模块的文案，避免冲突。

#### 2.4.2. 命名空间结构

语言包采用层级命名空间，核心结构如下：

```json
{
  "common": { "确认": "...", "取消": "...", "保存": "..." },
  "nav": { "首页": "...", "工具": "...", "设置": "..." },
  "settings": { "标题": "...", "外观": "..." },
  "tools": {
    "llm-api": { "编辑渠道": "...", "渠道名称": "..." },
    "llm-chat": { "发送消息": "...", "清空对话": "..." }
  }
}
```

- **`common`**: 全局通用文案（按钮文字、状态提示等），所有模块均可复用。
- **`nav`**: 导航栏相关文案。
- **`settings`**: 设置页面文案。
- **`tools.{toolId}`**: 工具私有文案，使用工具 ID 作为子命名空间。

#### 2.4.3. 翻译函数：`t()` vs `tRaw()`

系统提供两种翻译函数，适用于不同场景：

| 函数     | 类型安全  | 适用场景                   | 示例                             |
| -------- | --------- | -------------------------- | -------------------------------- |
| `t()`    | ✅ 强类型 | 核心语言包中的预定义 Key   | `t('common.确认')`               |
| `tRaw()` | ❌ 宽松   | 工具私有 Key、动态拼接 Key | `tRaw('tools.llm-api.编辑渠道')` |

**使用原则**:

- **优先使用 `t()`**: 对于 `common`, `nav`, `settings` 等核心命名空间，使用 `t()` 以获得类型检查和自动补全。
- **工具私有使用 `tRaw()`**: 工具私有文案（`tools.xxx`）由于是动态注册的，必须使用 `tRaw()`。

```typescript
import { useI18n } from "@/i18n";

const { t, tRaw } = useI18n();

// 通用文案使用 t()
t("common.确认");
t("common.取消");

// 工具私有文案使用 tRaw()
tRaw("tools.llm-api.编辑渠道");
tRaw("tools.llm-api.渠道名称");
```

#### 2.4.4. 工具私有语言包

工具私有文案存放在工具目录内的 `locales/` 下，通过 `registerToolLocales` 注册。

**目录结构**:

```
mobile/src/tools/llm-api/
├── registry.ts
├── locales/
│   ├── zh-CN.json
│   └── en-US.json
└── ...
```

**语言包格式** (无需包含 `tools.llm-api` 前缀):

```json
// locales/zh-CN.json
{
  "编辑渠道": "编辑渠道",
  "渠道名称": "渠道名称",
  "删除确认": "确定要删除渠道 \"{name}\" 吗？"
}

// locales/en-US.json
{
  "编辑渠道": "Edit Channel",
  "渠道名称": "Channel Name",
  "删除确认": "Are you sure you want to delete channel \"{name}\"?"
}
```

**注册方式** (在 `registry.ts` 中):

```typescript
import { registerToolLocales, useI18n } from "@/i18n";
import zhCN from "./locales/zh-CN.json";
import enUS from "./locales/en-US.json";

// 提前注册语言包，确保路由 meta.title 等 getter 能正确获取翻译
registerToolLocales("llm-api", {
  "zh-CN": zhCN,
  "en-US": enUS,
});

export default {
  id: "llm-api",
  get name() {
    const { tRaw } = useI18n();
    return tRaw("tools.llm-api.LLM 服务");
  },
  // ...
};
```

#### 2.4.5. 复用 common 与语序处理

**复用 common 的最佳实践**:

- 通用按钮文字（确认、取消、保存、删除等）使用 `common` 命名空间。
- 工具私有文案中不要重复定义已存在于 `common` 中的文案。

**语序差异处理**:

不同语言的语序可能不同（如中文"成功添加 5 个模型" vs 英文"Successfully added 5 models"）。使用**参数插值**而非字符串拼接来处理：

**复杂语序示例**:

```typescript
// 删除确认对话框
tRaw("tools.llm-api.删除确认", { name: profile.name });

// zh-CN: "删除确认": "确定要删除渠道 \"{name}\" 吗？"
// en-US: "删除确认": "Are you sure you want to delete channel \"{name}\"?"
```

#### 2.4.6. 覆盖机制

优先级为 `外部自定义 JSON > 工具私有包 > 内置核心包`。

## 3. 移动端专用脚本

为了方便开发，根目录 `package.json` 中内置了移动端命令的快捷入口：

- **`mtad`** – `tauri android dev` (Android 开发模式)。
- **`mtab`** – `tauri android build` (Android 构建)。
- **`mtid`** – `tauri ios dev` (iOS 开发模式)。
- **`mtib`** – `tauri ios build` (iOS 构建)。
