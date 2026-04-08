# 应用启动结构重构计划

**状态**: Implementing (已审议，纳入影响范围分析修订)
**创建时间**: 2026-04-08
**修订时间**: 2026-04-08
**涉及范围**: 全局 — 启动流程、根组件、布局层
**关联文档**: [影响范围与副作用分析报告](./app-startup-refactor-impact-analysis.md)

---

## 一、背景与现状问题

### 1.1 调查范围

本次调查涉及以下核心文件：

| 文件                                       | 角色                                     |
| ------------------------------------------ | ---------------------------------------- |
| `src/main.ts`                              | 应用入口，手动执行异步初始化             |
| `src/App.vue`                              | 根组件，包含布局、骨架屏、初始化逻辑混杂 |
| `src/components/TitleBar.vue`              | 自定义无边框标题栏                       |
| `src/components/MainSidebar.vue`           | 主侧边栏                                 |
| `src/components/SidebarMenu.vue`           | 侧边栏菜单，支持拖拽排序和工具分离       |
| `src/views/HomePage.vue`                   | 主页，有独立的骨架屏                     |
| `src/views/DetachedWindowContainer.vue`    | 分离窗口容器                             |
| `src/views/DetachedComponentContainer.vue` | 分离组件容器                             |

### 1.2 核心痛点

**痛点一：初始化逻辑碎片化**

初始化代码分散在多个文件中，职责不清晰：

- `main.ts` → `initializeApp()` 中执行：`appSettingsStore.load()`、第一阶段服务注册
- `App.vue` → `onMounted` 中执行：分离管理器初始化、用户档案加载、主题外观初始化
- `DetachedWindowContainer.vue` → 重复执行：主题初始化、颜色加载
- `DetachedComponentContainer.vue` → 再次重复：主题初始化、颜色加载

**痛点二：`App.vue` 职责过重**

`App.vue` 当前承载了：布局（TitleBar + Sidebar + 主内容区）、骨架屏 UI、路由监听、Tauri 窗口事件监听、多个 store 的初始化调用。文件约 380 行不长但很复杂，难以维护。

**痛点三：加载体验割裂**

用户从点击图标到看到完整界面，会经历：

1. `index.html` 静态 Loading CSS 动画（无进度反馈）
2. `App.vue` 骨架屏（el-skeleton，粗糙）
3. 各页面骨架屏（如 `HomePage.vue` 的独立骨架屏）

三次视觉跳变，且全程无法感知如"正在加载哪个插件"等有意义的进度信息。

**痛点四：分离窗口无法复用主窗口初始化成果**

分离窗口是独立进程，需要自行初始化，但由于没有统一的初始化模块，导致主题、颜色等初始化代码在多个容器组件中手动重复。

---

## 一（补充）、根组件初始化重叠分析

### 1.3 三个根组件初始化逻辑对比

通过逐行对比 `App.vue`、`DetachedWindowContainer.vue`、`DetachedComponentContainer.vue` 的初始化代码，发现以下重叠模式：

#### A. 三个根组件完全重叠的初始化（公共层）

| 初始化动作                     | App.vue        | DetachedWindow | DetachedComponent   | 备注                         |
| ------------------------------ | -------------- | -------------- | ------------------- | ---------------------------- |
| `useTheme()`                   | setup 顶层     | setup 顶层     | setup 顶层          | 完全相同                     |
| `detachedManager.initialize()` | onMounted      | onMounted      | onMounted           | 完全相同                     |
| `initThemeAppearance()`        | onMounted 无参 | onMounted 无参 | onMounted 传 `true` | 参数不同                     |
| `applyThemeColors(settings)`   | onMounted      | onMounted      | onMounted           | 完全相同的 settings 读取逻辑 |
| `cleanupThemeAppearance()`     | onUnmounted    | onUnmounted    | onUnmounted         | 完全相同                     |
| 包裹 `<GlobalProviders>`       | template       | template       | template            | 完全相同                     |

#### B. 两个分离窗口容器重叠的初始化（分离窗口层）

| 初始化动作                          | DetachedWindow         | DetachedComponent      | 备注                           |
| ----------------------------------- | ---------------------- | ---------------------- | ------------------------------ |
| `checkIfFinalized()`                | onMounted 内定义并调用 | onMounted 内定义并调用 | 逻辑几乎完全相同（~30 行重复） |
| `listen("finalize-component-view")` | onMounted              | onMounted              | 完全相同                       |
| 预览/固定模式状态 (`isPreview`)     | ref + 样式             | ref + 样式             | 完全相同                       |

#### C. main.ts 与 App.vue 之间的重复

| 重复项                      | main.ts 位置 | App.vue 位置 | 备注                                   |
| --------------------------- | ------------ | ------------ | -------------------------------------- |
| `applyLogConfig()` 函数定义 | 第 54-85 行  | 第 97-117 行 | **完全重复的函数定义**，两处各写了一遍 |

#### D. 各根组件的独有逻辑（不应抽取）

| 组件                             | 独有逻辑                                                                                                                                                              |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `App.vue`                        | 侧边栏状态同步、路由监听（openTool）、Tauri 事件监听（navigate-to-settings / window-detached / window-attached / request-close-confirmation）、Deep Link 处理、骨架屏 |
| `DetachedWindowContainer.vue`    | watch `toolsStore.isReady` → 动态加载工具组件、TitleBar 显示                                                                                                          |
| `DetachedComponentContainer.vue` | 从 URL query 解析组件配置、执行 `initializeEnvironment` 钩子、logicHook props/listeners 绑定                                                                          |

### 1.4 结论

当前三个根组件中有约 **40-50 行完全重复的初始化代码**，两个分离窗口容器之间还有额外 **~40 行重复的预览/固定模式逻辑**。这些重复代码应该被抽取为公共模块，类似 `GlobalProviders.vue` 在模板层做的事情——但这次是在逻辑层。

---

## 二、重构方案

### 2.1 架构目标

> **物理隔离、逻辑标准化、初始化可观测**

维持 `main.ts` 的根组件切换逻辑以确保物理隔离（防止分离窗口意外跳转回主页），但统一所有根组件的启动模式。

```
main.ts（根据路径选择 Root）
  ├── App.vue (主窗口 Root)
  │     └── LoadingScreen -> MainLayout (Sidebar + Content)
  ├── DetachedWindowContainer (分离窗口 Root)
  │     └── LoadingScreen -> ToolComponent
  └── DetachedComponentContainer (分离组件 Root)
        └── LoadingScreen -> DetachableComponent
```

### 2.2 新增核心模块

#### `src/composables/useRootInit.ts`（新增 — 公共初始化层）

封装所有根组件共享的初始化/清理逻辑，消除三处重复代码。

```typescript
// 示意结构
export function useRootInit(options?: { isDetachedComponent?: boolean }) {
  // === setup 阶段（同步，顶层调用） ===
  useTheme();

  // === onMounted 阶段（异步） ===
  async function initCommon() {
    await detachedManager.initialize();
    await initThemeAppearance(options?.isDetachedComponent ?? false);

    const settings = appSettingsStore.settings;
    applyThemeColors({
      primary: settings.themeColor,
      success: settings.successColor,
      warning: settings.warningColor,
      danger: settings.dangerColor,
      info: settings.infoColor,
    });

    // 显式初始化通信总线（必须在 autoRegisterServices 之后，确保 executor 处理器可用）
    const { initializeSyncBus } = useWindowSyncBus();
    await initializeSyncBus();
  }

  // === onUnmounted 阶段 ===
  function cleanupCommon() {
    cleanupThemeAppearance();
  }

  // 自动注册生命周期
  onMounted(() => initCommon());
  onUnmounted(() => cleanupCommon());

  return { initCommon, cleanupCommon };
}
```

#### `src/composables/useDetachedPreview.ts`（新增 — 分离窗口预览层）

封装两个分离窗口容器共享的预览/固定模式逻辑。

```typescript
// 示意结构
export function useDetachedPreview() {
  const isPreview = ref(true);

  async function checkIfFinalized() {
    const currentWindow = getCurrentWebviewWindow();
    const label = currentWindow.label;
    const windows = await invoke<Array<{ id: string; label: string }>>("get_all_detached_windows");
    isPreview.value = !windows.some((w) => w.label === label);
  }

  onMounted(async () => {
    await checkIfFinalized();
    await listen("finalize-component-view", () => {
      isPreview.value = false;
    });
  });

  return { isPreview };
}
```

#### `src/utils/logConfig.ts`（新增 — 消除重复定义）

将 `applyLogConfig()` 从 `main.ts` 和 `App.vue` 中抽取为独立模块，两处改为 `import { applyLogConfig } from '@/utils/logConfig'`。

#### `src/stores/appInitStore.ts`

统一管理初始化状态和编排异步任务序列。

```typescript
// 状态结构（示意）
interface AppInitState {
  progress: number; // 0-100
  statusText: string; // "正在加载插件..."
  isReady: boolean; // 是否初始化完成
  error: Error | null; // 初始化错误
}
```

初始化序列（主窗口）：

| 步骤 | 任务                                    | 完成进度 | 备注                                                    |
| ---- | --------------------------------------- | -------- | ------------------------------------------------------- |
| 1    | `appSettingsStore.load()`               | 10%      | 纯磁盘读取，无副作用                                    |
| 2    | `applyLogConfig(settings)`              | 15%      | 从 `logConfig.ts` 导入，消除重复定义                    |
| 3    | `initTheme()`                           | 25%      | 仅明暗模式，不含壁纸/透明度                             |
| 4    | `autoRegisterServices(priorityToolId?)` | 60%      | 保留两阶段设计；分离窗口传入优先级工具 ID               |
| 5    | `userProfileStore.loadProfiles()`       | 70%      | 仅主窗口执行                                            |
| 6    | `startupManager.run()`                  | 80%      | 仅主窗口执行，异步不阻塞                                |
| 7    | `detachedManager.initialize()`          | 90%      | 依赖步骤 1（读取 `autoAdjustWindowPosition` 设置）      |
| 8    | `initializeSyncBus()`                   | 95%      | **新增**；依赖步骤 4（executor 处理器需要已注册的服务） |
| 9    | 标记 `isReady = true`                   | 100%     | 触发 `App.vue` 切换到 `MainLayout`                      |

> **注意**：`initThemeAppearance()`（壁纸/透明度/模糊）由 `useRootInit` 在组件 `onMounted` 中调用，不在 `appInitStore` 序列内。这样可以确保它在 DOM 挂载后执行，避免 CSS 变量注入时机问题。

分离窗口序列 `initDetachedApp()` 执行步骤 1-3 和步骤 4（传入 `priorityToolId`）、步骤 7-8，跳过步骤 5、6（用户档案和启动项仅主窗口需要）。

#### `src/components/LoadingScreen.vue`

替代现有的骨架屏和 `index.html` 静态 Loading，提供：

- 居中显示应用图标（带 CSS 动画）
- 线性进度条（绑定 `appInitStore.progress`）
- 当前任务文字（绑定 `appInitStore.statusText`）
- 错误状态展示与重试按钮

#### `src/views/MainLayout.vue`

承接从 `App.vue` 剥离的布局和生命周期逻辑：

- 模板：`TitleBar` + `MainSidebar` + `router-view` + `LlmDeepLinkConfirmDialog`
- 生命周期：路由监听（`watch route.path` → 更新 openedToolPaths）
- 事件：Tauri `window-detached`、`window-attached`、`window-close` 事件监听
- 样式：迁移 `App.vue` 中的布局相关样式

---

## 三、详细执行计划

### 第一阶段：基础设施建设

**任务 A — 创建 `src/stores/appInitStore.ts`**

- [ ] 定义 `AppInitState` 类型
- [ ] 实现 `initMainApp()` 异步方法（带进度报告）
- [ ] 实现 `initDetachedApp(priorityToolId?)` 异步方法（轻量版，支持优先级工具）
- [ ] 实现错误捕获和 `retry()` 方法
- [ ] 从 `src/utils/logConfig.ts` 导入 `applyLogConfig`（消除 `main.ts` 和 `App.vue` 的重复定义）
- [ ] 在步骤 8 调用 `initializeSyncBus()`（显式初始化通信总线）

**任务 B — 创建 `src/components/LoadingScreen.vue`**

- [ ] 图标 + CSS 动画（使用 `aio-icon-black/white.svg`，主题自适应）
- [ ] 进度条（基于 `el-progress`，绑定 `appInitStore.progress`）
- [ ] 状态文字（绑定 `appInitStore.statusText`）
- [ ] 错误界面（显示错误消息 + 重试按钮）

### 第二阶段：布局解耦

**任务 C — 创建 `src/views/MainLayout.vue`**

- [ ] 迁移 `App.vue` 的 `<template>` 中的布局结构
- [ ] 迁移 `App.vue` 的 `watch route.path` 路由监听逻辑
- [ ] 迁移 `App.vue` 的 Tauri `listen` 事件监听（`onMounted`/`onUnmounted`）
- [ ] 迁移 `App.vue` 的布局相关 `<style>` 代码
- [ ] 迁移 `LlmDeepLinkConfirmDialog` 的使用

### 第三阶段：根组件与入口重构

**任务 D — 重写 `src/App.vue`**

- [ ] 移除所有布局代码（由 `MainLayout.vue` 承接）
- [ ] 移除骨架屏代码（由 `LoadingScreen.vue` 承接）
- [ ] 移除所有 `onMounted` 初始化调用（由 `appInitStore` 承接）
- [ ] 保留 `GlobalProviders`（el-config-provider 等）
- [ ] 新增状态切换逻辑：`isReady ? MainLayout : LoadingScreen`
- [ ] 在 `onMounted` 中触发 `appInitStore.initMainApp()`

目标体积：约 50 行以内。

**任务 E — 重构 `src/main.ts`**

- [ ] **保留以下同步前置操作**（必须在 Vue 应用创建前执行）：
  - [ ] `window.Vue` / `window.ElementPlus` / `window.AiohubSDK` / `window.AiohubUI` 全局挂载（插件前提）
  - [ ] 早期主题色缓存读取（`localStorage` → `applyThemeColors`，防闪烁）
  - [ ] 根组件选择逻辑（`isDetachedWindow()` / `isDetachedComponentLoader()`）
  - [ ] 全局错误处理器注册（`app.config.errorHandler`、`unhandledrejection`、`error`）
  - [ ] `PluginUI.components` 全局组件注册
- [ ] **移除 `initializeApp` 异步函数**（初始化逻辑迁移到 `appInitStore`）
- [ ] **保持路由注册时序**：`app.use(pinia)` → `initDynamicRoutes()` → `app.use(router)` → `app.mount('#app')`
- [ ] **注意**：不能"改为同步挂载"——`initDynamicRoutes()` 依赖 `toolsStore.tools`，必须在 `autoRegisterServices` 之后调用。但 `app.mount()` 可以在 `appInitStore.init()` 之前执行，因为初始化由 `App.vue` 的 `onMounted` 触发。

### 第四阶段：清理与收尾

**任务 F — 优化分离窗口容器**

- [ ] `DetachedWindowContainer.vue`：改用 `useRootInit()` + `useDetachedPreview()` + `appInitStore.initDetachedApp(priorityToolId)`
- [ ] `DetachedComponentContainer.vue`：改用 `useRootInit({ isDetachedComponent: true })` + `useDetachedPreview()` + `appInitStore.initDetachedApp()`
- [ ] 删除两个容器组件中的重复初始化代码（主题初始化 ~15 行、主题色应用 ~15 行、checkIfFinalized ~30 行、finalize 监听 ~5 行）
- [ ] 验证：每个分离窗口容器减少约 60-70 行重复代码
- [ ] **注意**：`useRootInit` 内部会调用 `initializeSyncBus()`，确保分离窗口的通信总线在 `appInitStore` 完成服务注册后初始化

**任务 G — 清理遗留代码**

- [ ] 删除 `HomePage.vue` 中旧的骨架屏代码（`isLoading` 状态）
- [ ] 移除 `index.html` 中的静态 Loading CSS（交由 `LoadingScreen.vue` 接管）
- [ ] 更新 `src/router/index.ts`：注册 `MainLayout` 路由（如需要）

---

## 四、风险与注意事项

| 风险                                            | 等级 | 缓解措施                                                                                                                                                                                                                                      |
| ----------------------------------------------- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **插件 SDK 全局挂载时序**                       | 高   | `main.ts` 中的 `window.Vue` / `ElementPlus` / `AiohubSDK` / `AiohubUI` 挂载必须保留在同步阶段（Vue 应用创建前），不能移入 `appInitStore`。这是所有 JS 插件运行的前提。                                                                        |
| **路由注册时序冲突**                            | 高   | `initDynamicRoutes()` 依赖 `toolsStore.tools`，必须在 `autoRegisterServices` 之后调用。`main.ts` 的执行顺序必须是：`app.use(pinia)` → `initDynamicRoutes()` → `app.use(router)` → `app.mount()`。不能在 `autoRegisterServices` 之前挂载路由。 |
| **`toolsStore.initializeOrder()` 双重调用**     | 中   | 当前在 `auto-register.ts` 和 `App.vue` 各调用一次。重构后应由 `appInitStore` 统一调用一次（在 `autoRegisterServices` 内部）。                                                                                                                 |
| **`WindowSyncBus` 初始化时机**                  | 中   | 当前是隐式按需初始化。重构后在 `useRootInit` 中显式调用 `initializeSyncBus()`，确保在 `autoRegisterServices` 之后执行（因为 executor 处理器依赖已注册的服务）。                                                                               |
| **`appSettingsStore` 在主题初始化前未就绪**     | 中   | `appInitStore` 严格按顺序执行，步骤 1（`load()`）完成后才执行步骤 2-3（主题初始化）。                                                                                                                                                         |
| **分离窗口的 Pinia Store 状态隔离**             | 中   | `initDetachedApp` 独立初始化，不共享主窗口 Store 实例。                                                                                                                                                                                       |
| **路由监听迁移后时序问题**                      | 中   | 在 `MainLayout.vue` 中测试工具标签页的打开/关闭是否正常。                                                                                                                                                                                     |
| **`index.html` 静态 Loading 与 Vue 渲染的衔接** | 低   | `LoadingScreen.vue` 初始进度为 0，与静态动画视觉风格对齐。                                                                                                                                                                                    |

---

## 五、预期收益

- **`App.vue` 代码量减少约 80%**（从 ~380 行 → ~50 行）
- **启动体验连贯**：单一 Loading 界面，有进度反馈，无多次骨架屏闪烁
- **初始化可观测**：任何阶段出错都能精确定位到步骤，支持重试
- **分离窗口初始化统一**：消除 2 处重复代码，共用 `initDetachedApp` 序列
