# 插件 UI 集成方案

**版本:** 1.0
**状态:** 方案设计
**制定者:** 咕咕

## 1. 背景与问题

当前插件系统虽然支持后台逻辑的扩展，但完全缺乏与主程序UI集成的标准机制。插件无法拥有自己的用户界面，导致其功能无法直观地暴露给用户，极大地限制了插件的想象空间和实用性。

经过调查发现，主程序的工具UI（侧边栏、设置页、路由）是基于一个静态配置文件 `src/config/tools.ts` 构建的，这套机制无法支持在运行时动态加载的插件。

本项目旨在设计并实现一套完整的插件UI集成方案，使插件能够像原生内置工具一样，无缝地融入到主应用的UI体系中。

## 2. 设计目标

- **无缝集成**: 插件UI应自动出现在主侧边栏、工具设置等所有工具列表中，享受与内置工具同等的待遇。
- **动态加载**: 系统应支持在运行时动态加载、注册和卸载插件UI，无需重启应用。
- **配置驱动**: 插件应能通过 `manifest.json` 简单清晰地声明其UI入口及元数据。
- **最小侵入**: 方案应尽可能复用现有系统架构（如服务注册、路由机制），避免引入不必要的复杂性。

## 3. 核心设计：动态工具配置中心

为了解决静态配置的局限性，我们引入一个全局的、响应式的“动态工具配置中心”作为新的UI数据源。我们将使用 Pinia（或一个简单的响应式对象）来实现这个中心。

```mermaid
graph TD
    subgraph "启动时"
        A[静态 `toolsConfig.ts`] --> B{初始化};
    end

    subgraph "运行时"
        C[插件加载器] -- manifest含ui --> D{构建 ToolConfig 对象};
        D --> E[调用 Store Action];
    end
    
    B --> F[Pinia Store (useToolsStore)];
    E --> F;

    subgraph "UI 层 (响应式)"
        F -- 提供响应式 aPI --> G[MainSidebar.vue];
        F -- 提供响应式 aPI --> H[ToolsSettings.vue];
        F -- 提供响应式 aPI --> I[Router];
    end

    G -- 渲染 --> J[侧边栏菜单];
    H -- 渲染 --> K[设置页面];
    I -- 注册 --> L[动态路由];
```

### 3.1. Pinia Store: `useToolsStore`

-   **State**: `tools: ToolConfig[]` - 存储所有工具（内置+插件）的配置信息。
-   **Initialization**: Store在创建时，会用 `src/config/tools.ts` 的内容作为 `tools` 数组的初始值。
-   **Actions**:
    -   `addTool(tool: ToolConfig)`: 用于在运行时添加一个新工具（由插件加载器调用）。
    -   `removeTool(toolId: string)`: 用于在插件卸载时移除对应的工具。

### 3.2. 插件清单 `manifest.json` 扩展

我们将在 `PluginManifest` 类型中增加一个 `ui` 字段，用于声明UI信息。

```typescript
// in src/services/plugin-types.ts
export interface PluginUiConfig {
  /** 显示名称, 如果不提供则使用插件主名称 */
  displayName?: string;
  /** UI 组件入口文件 (相对于插件根目录的路径) */
  component: string;
  /** 图标 (未来支持) */
  icon?: string; 
}

export interface PluginManifest {
  // ... other fields
  ui?: PluginUiConfig;
}
```

## 4. 实施步骤

### 步骤一：创建 `useToolsStore`

1.  在 `src/stores/` 目录下创建 `tools.ts` 文件。
2.  定义并导出 `useToolsStore`，包含 `tools` 状态和 `addTool`/`removeTool` actions。
3.  在应用主入口 (`main.ts`) 初始化这个store。

### 步骤二：改造UI组件

1.  **`src/components/MainSidebar.vue`**:
    -   移除对 `../config/tools` 的静态导入。
    -   引入 `useToolsStore`。
    -   将 `v-for` 的数据源从 `visibleTools` (基于静态config) 修改为 `toolsStore.tools` (经过可见性过滤后)。
2.  **`src/views/components/ToolsSettings.vue`**:
    -   进行与 `MainSidebar.vue` 相同的改造，将数据源切换到 `useToolsStore`。

### 步骤三：改造路由 `router/index.ts`

1.  移除基于静态 `toolsConfig` 生成路由的逻辑。
2.  创建一个新的服务或在 `main.ts` 中，监听 `useToolsStore` 的 `tools` 数组。
3.  使用 `watch` 或类似机制，当 `tools` 数组发生变化时，通过 `router.addRoute()` 动态添加新路由，或 `router.removeRoute()` 移除路由。

### 步骤四：改造插件管理器 `plugin-manager.ts`

1.  在插件加载逻辑中，检查 `manifest.ui` 字段是否存在。
2.  如果存在，则：
    a.  构造一个 `ToolConfig` 对象，映射 `manifest` 中的信息。
    b.  **处理组件加载**: `component` 属性需要一个特殊的动态导入函数。由于插件位于外部目录，不能直接使用 `import()`。我们将创建一个辅助函数 `createPluginComponentLoader(pluginPath, componentFile)`，它内部会使用Tauri的 `convertFileSrc` API将文件路径转换为 `http://` URL，然后可能需要一个简单的包装器组件来异步加载这个URL。
    c.  调用 `useToolsStore().addTool(pluginToolConfig)` 将插件UI注册到全局。
3.  在插件卸载逻辑中，调用 `useToolsStore().removeTool(pluginId)`。

## 5. 技术难点与解决方案

-   **动态加载外部Vue组件**:
    -   **问题**: Vite的 `import()` 无法处理 `src` 目录之外的文件。
    -   **方案**: 使用 `import { convertFileSrc } from '@tauri-apps/api/tauri';` 将插件的 `.vue` 文件路径转换为 Tauri 提供的本地 HTTP 服务 URL。然后，我们可以通过一个“代理”或“包装器”组件，利用 Vue 的异步组件特性来加载这个 URL。这可能需要一些实验来确保其稳定工作。

## 6. 窗口分离系统集成

### 6.1. 现有窗口分离机制概述

项目已经实现了完整的窗口分离系统，支持两种分离模式：

#### 6.1.1. 工具窗口分离 (`DetachedWindowContainer.vue`)
- **用途**: 将整个工具页面分离为独立窗口
- **特点**: 包含标题栏、完整的工具界面
- **路由**: `/detached-window/:toolPath`
- **适用场景**: 多显示器、需要同时查看多个工具

#### 6.1.2. 组件分离 (`DetachedComponentContainer.vue`)
- **用途**: 将工具内的单个组件分离为透明浮窗
- **特点**: 无边框、透明背景、可拖拽定位
- **路由**: `/detached-component/:componentId`
- **注册机制**: 通过 `src/config/detachable-components.ts` 中的 `detachableComponentRegistry` 注册
- **适用场景**: 聊天框、预览窗等需要"浮在上面"的组件

#### 6.1.3. 统一分离管理器 (`useDetachedManager`)
- **单例模式**: 全局统一管理所有分离窗口状态
- **核心功能**:
  - 监听窗口分离/附着事件
  - 窗口创建、聚焦、位置调整、关闭
  - 定期检查窗口位置，防止窗口跑到屏幕外
- **状态追踪**: 维护 `detachedWindows` Map，记录所有已分离窗口

### 6.2. 插件窗口分离支持设计

插件需要能够复用现有的窗口分离机制，以下是两种分离模式的集成方案：

#### 6.2.1. 工具级分离（基础支持）

**实现路径**:
1. 插件工具被注册到 `useToolsStore` 后，自动获得对应的路由
2. 当用户点击"分离窗口"按钮时，系统调用 `createToolWindow`，传入工具的路径
3. 后端创建新窗口，加载 `/detached-window/{plugin-tool-path}` 路由
4. `DetachedWindowContainer.vue` 从 `toolsStore` 中查找插件工具配置，动态加载组件

**所需改造**:
- `DetachedWindowContainer.vue` 当前从静态 `toolsConfig` 查找工具，需改为从 `useToolsStore` 获取
- 确保插件工具的 `component` 加载函数能在分离窗口中正常工作

**manifest 扩展** (可选):
```typescript
export interface PluginUiConfig {
  displayName?: string;
  component: string;
  icon?: string;
  /** 是否支持工具级分离 (默认 true) */
  detachable?: boolean;
}
```

#### 6.2.2. 组件级分离（高级功能）

组件级分离更加复杂，因为它需要插件声明哪些内部组件可以被分离，并提供对应的逻辑钩子。

**挑战**:
- 现有 `detachableComponentRegistry` 是静态的、针对内置组件设计的
- 插件组件位于外部目录，加载路径不同
- 需要一个动态注册机制，允许插件运行时注册可分离组件

**设计方案**:

1. **扩展 manifest**:
```typescript
export interface DetachableComponent {
  /** 组件 ID (唯一标识) */
  id: string;
  /** 组件显示名称 */
  name: string;
  /** 组件文件路径 (相对于插件根目录) */
  component: string;
  /** 逻辑钩子文件路径 (导出 logicHook 函数) */
  logicHook: string;
}

export interface PluginUiConfig {
  // ... 其他字段
  /** 可分离的组件列表 */
  detachableComponents?: DetachableComponent[];
}
```

2. **动态注册到全局注册表**:
   - 在 `plugin-manager.ts` 加载插件时，如果发现 `manifest.ui.detachableComponents`
   - 遍历每个组件配置，构造 `DetachableComponentRegistration` 对象
   - 调用新增的 `registerDetachableComponent(id, config)` 函数，动态添加到注册表
   - 在插件卸载时，调用 `unregisterDetachableComponent(id)` 清理

3. **组件加载适配**:
   - 创建 `createPluginDetachableComponentLoader(pluginPath, componentFile)` 辅助函数
   - 使用 Tauri 的 `convertFileSrc` 将插件组件路径转换为可加载的 URL
   - logicHook 也需要类似处理（可能需要插件在主窗口中提前注入全局函数）

**技术难点**:
- **跨窗口状态同步**: 分离的组件需要与主窗口共享状态（如聊天消息）
  - 解决方案：使用现有的 `useWindowSyncBus` 机制，插件需提供序列化的状态
- **logicHook 执行**: 插件的 JS 代码如何在分离窗口中执行
  - 方案A：要求插件将 logicHook 注册为全局可访问的函数
  - 方案B：在分离窗口中重新加载插件的 JS bundle（可能影响性能）

### 6.3. 实施建议

**阶段一：工具级分离** (推荐优先实现)
- 改造 `DetachedWindowContainer.vue` 以支持动态工具
- 修改 `useToolsStore` 确保插件工具可分离
- 测试插件工具的分离和重新附着

**阶段二：组件级分离** (可选，按需实现)
- 仅当插件有明确需求时才实现
- 设计并实现动态组件注册机制
- 需要与插件开发者协商 API 设计

## 7. 预期成果

完成改造后，任何一个JS插件，只需在 `manifest.json` 中增加几行 `ui` 配置，其界面就会自动出现在应用的所有工具入口处，并拥有自己的独立页面，实现与内置工具完全一致的用户体验。

**核心能力**:
- ✅ 插件UI自动集成到侧边栏和设置页
- ✅ 插件拥有独立的路由页面
- ✅ 插件工具支持窗口分离（与内置工具一致）
- 🔄 插件组件支持分离（高级功能，按需实现）