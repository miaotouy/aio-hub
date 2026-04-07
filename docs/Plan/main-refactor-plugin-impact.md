# `main.ts` 重构对插件系统的影响调查报告

**状态**: Completed
**关联文档**: `docs/Plan/main-refactor-spec-v2.md`
**调查人**: 咕咕 (Kilo 版)

---

## 1. 现状分析 (As-Is)

目前插件系统的初始化嵌入在 `main.ts` 的 `initializeApp` 流程中：

1.  **加载时机**：在 `autoRegisterServices` 的 `loadRemaining` 阶段触发。
2.  **执行顺序**：
    - `pluginManager.initialize()`：初始化状态服务、监听跨窗口事件、创建加载器。
    - `pluginManager.loadAllPlugins()`：扫描目录、创建代理、根据持久化状态调用 `plugin.enable()`。
    - **UI 注册**：调用 `registerPluginUi` 将插件路径（如 `/plugin-xxx`）注入 `toolsStore`。
3.  **依赖关系**：
    - 强依赖 `Pinia` (用于 `toolsStore` 和 `contextPipelineStore`)。
    - 强依赖 `Tauri API` (文件系统、事件、路径)。
    - 插件的 `enable` 阶段可能访问 `appSettingsStore` 或其他已注册服务。

## 2. 重构后的预期变化 (To-Be)

根据 `main-refactor-spec-v2.md`，插件初始化将迁移至 `ensurePlugins` 任务。

### 2.1 初始化时序的改变

- **主窗口**：插件加载从 `main.ts` 阻塞流程移至 `Bootstrapper.vue` 的并行任务中。
- **分离窗口**：默认跳过 `Bootstrapper`，插件不会被自动加载，除非组件通过 `ensurePlugins()` 显式触发。

### 2.2 影响评估

#### A. 启动性能 (正面影响)

- **并行化**：插件扫描和加载可以与环境初始化（Theme, Appearance）并行，减少总等待时间。
- **按需加载**：分离窗口不再自动加载全量插件，显著降低内存占用和 Bundle 体积。

#### B. 插件 UI 注册 (潜在风险)

- **风险点**：`toolsStore.setReady()` 的触发时机。
- **调查发现**：当前的 `loadRemaining` 会在插件加载完成后才调用 `setReady()`。在重构版中，`Bootstrapper` 必须确保 `ensurePlugins` 完成后再执行 `resumeLoading`（即 `setReady`），否则侧边栏可能会出现插件图标“闪现”或缺失的情况。

#### C. 插件 Context 注入

- **风险点**：插件 `enable(context)` 依赖 `useContextPipelineStore`。
- **结论**：由于 `Bootstrapper` 挂载时 Pinia 已经就绪，且 `ensurePlugins` 内部通过动态 `import` 获取 Store，此链路安全。

#### D. 分离窗口中的插件能力

- **风险点**：若某个分离工具（如 Chat）依赖插件提供的 `Processor`，而分离窗口跳过了插件加载。
- **对策**：需要在相关业务组件（如 `ChatArea.vue`）中增加 `onBeforeMount(() => ensurePlugins())` 调用，实现“组件自愈”。

## 3. 插件 SDK 与 UI 组件调查 (SDK & UI Impact)

### 3.1 SDK 挂载机制调查

- **现状**：`main.ts` 早期（Line 40-45）通过静态导入将 `Vue`, `ElementPlus`, `PluginSDK`, `PluginUI` 挂载到 `window` 对象。
- **风险**：重构后若 `main.ts` 变为极简入口，这些挂载逻辑可能被遗漏或延迟。
- **结论**：**必须保留在引导层 (Stage 0)**。插件在加载（`import`）时可能立即访问 `window.Vue` 或 `window.AiohubSDK`。如果挂载晚于 `ensurePlugins`，会导致插件加载崩溃。

### 3.2 UI 组件全局注册

- **现状**：`main.ts` (Line 132) 遍历 `PluginUI.components` 进行全局注册。
- **风险**：`PluginUI` 内部通过 `import.meta.glob` 扫描了大量组件。
- **优化建议**：将全局注册逻辑移至 `ensurePlugins` 任务中。由于插件 UI 只有在插件加载后才有意义，这样做可以进一步瘦身引导层。

### 3.3 插件适配器与 Context

- **调查**：`JsPluginAdapter` 在 `enable` 时调用插件的 `activate(context)`。
- **结论**：`context` 的创建（`pluginManager.createPluginContext`）依赖 `contextPipelineStore`。重构方案中 `ensurePlugins` 在 Pinia 注册后执行，满足此依赖要求。

### 3.4 插件内部逻辑深度调查 (以 `vcp-forum-connector` 为例)

- **依赖分析**：
  - **顶层导入**：`import { ... } from "aiohub-sdk"`。这证实了 **3.1** 的结论，`window.AiohubSDK` 必须同步就绪，否则 `import` 阶段就会抛出 `TypeError`。
  - **Composables 依赖**：插件内部使用了 `./composables/useForumApi`。这意味着插件的业务逻辑通常是自包含的，不直接依赖宿主环境的全局组件，但依赖 SDK 提供的工具类。
  - **异步初始化**：`activate` 钩子中执行了 `await settings().getAll()`。这依赖于 `pluginConfigService`，而该服务又依赖于底层的 `configManager` (磁盘 IO)。
- **结论**：
  1. 插件的 `activate` 过程是**重度异步**的（涉及磁盘 IO 和网络请求）。
  2. 将其移入 `Bootstrapper` 的并行任务池是正确的选择，可以避免阻塞主线程。
  3. **SDK 隔离性**：插件通过 `PluginContext` 访问 `settings` 和 `storage`。只要 `pluginManager` 初始化正确，插件内部逻辑在重构后无需任何修改。

### 3.5 插件 UI 组件深度调查 (以 `PostDetail.vue` 为例)

- **调查**：该组件通过 `import { Avatar, RichTextRenderer } from "aiohub-ui"` 导入宿主组件。
- **重构影响**：
  - **组件别名**：`aiohub-ui` 别名必须在插件组件加载前解析完成。
  - **重型组件链**：`RichTextRenderer` 依赖 `markdown-it` 和 `katex`。目前这些是在 `main.ts` 静态导入的。
- **优化决策**：
  - **创建 `ensureRichText` 任务**：将 `katex.css` 和相关渲染引擎移入异步任务。
  - **自愈机制**：在插件组件中，通过 `onBeforeMount(() => Promise.all([ensurePlugins(), ensureRichText()]))` 确保环境就绪。
  - **样式安全**：组件内使用的 `var(--border-color)` 依赖 `initThemeAppearance`，这强化了“环境初始化必须前置”的结论。

## 4. 实施建议 (Implementation Notes)

### 4.1 `src/init/guards.ts` 中的实现

```typescript
export const ensurePlugins = () =>
  ensureTask("plugins", async () => {
    const { pluginManager } = await import("@/services/plugin-manager");
    await pluginManager.initialize();
    await pluginManager.loadAllPlugins();
    // 此时插件已完成加载并注册到 toolsStore
  });
```

### 3.2 `Bootstrapper.vue` 的任务权重

建议将插件加载权重设为 `0.2`（属于重型任务），并将其放在环境任务（Settings/Theme）之后，以确保插件 `enable` 时能读取到正确的主题配置。

### 3.3 插件图标解析优化

重构时应保持 `resolvePluginIconUrl` 的异步特性，确保 `Bootstrapper` 进度条能真实反映图标解析的进度（如果有大量插件）。

## 5. 结论

`main.ts` V2 重构方案对插件系统是**重大利好**，但也存在关键约束：

1.  **SDK 挂载必须前置**：`window.AiohubSDK` 等全局挂载必须留在 `main.ts` 的最顶层，严禁移入异步任务。
2.  **UI 注册异步化**：原 `main.ts` 中的全量组件注册应移入 `ensurePlugins`，以实现真正的按需加载。
3.  **分离窗口自愈**：必须在文档中明确，若工具依赖插件能力，需手动触发 `ensurePlugins`。

**建议批准实施。**
