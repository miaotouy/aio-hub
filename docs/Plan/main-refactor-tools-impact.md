# `main.ts` 重构对 Tools 注册系统影响调查报告

**状态**: Completed  
**调查人**: 咕咕 (Kilo 版)  
**关联文档**: `docs/Plan/main-refactor-spec-v2.md`, `docs/Plan/main-refactor-plugin-impact.md`

---

## 1. 执行摘要

本次调查确认了 `main.ts` 重构计划对工具注册系统的影响。核心结论如下：

| 影响领域           | 风险等级        | 结论                                                   |
| :----------------- | :-------------- | :----------------------------------------------------- |
| **基本 UI 注册**   | ✅ 低风险       | `autoRegisterServices` 可安全迁移至 `Bootstrapper.vue` |
| **Agent 工具注册** | ✅ 低风险       | `toolRegistryManager` 与 Pinia 解耦良好，迁移安全      |
| **SDK 全局挂载**   | ⚠️ **关键约束** | `window.AiohubSDK` 等必须保留在 `main.ts` Stage 0      |
| **分离窗口自愈**   | ⚠️ 需注意       | 依赖插件能力的组件需手动调用 `ensurePlugins()`         |

**建议**: 批准按 `main-refactor-spec-v2.md` 实施，但需遵守本报告第 4 节的约束。

---

## 2. 现状分析 (As-Is)

### 2.1 基本注册流程（UI 工具）

当前工具注册由 `autoRegisterServices()` 主导，流程如下：

1. **扫描阶段**: 使用 `import.meta.glob` 扫描 `src/tools/**/*.registry.ts`。
2. **UI 注册**: 将 `toolConfig` 注入 `toolsStore`，决定侧边栏显示。
3. **服务注册**: 实例化 `ToolRegistry` 并注册到 `toolRegistryManager`。
4. **状态标记**: 调用 `toolsStore.setReady()` 解锁应用加载状态。

### 2.2 Agent 工具注册流程（LLM 调用）

Agent 工具注册采用**被动发现**机制，由 `tool-calling/core/discovery.ts` 实现：

1. **元数据获取**: 调用 `toolRegistryManager.getAllTools()`。
2. **能力筛选**: 过滤出实现 `getMetadata()` 且标记为 `agentCallable: true` 的方法。
3. **Prompt 生成**: 将方法定义转换为 LLM 可理解的 JSON Schema (VCP 协议)。

### 2.3 分布式工具 (VCP)

VCP 连接器通过 `vcpBridgeFactory` 在 `onStartup` 阶段动态注册工具，这依赖于 `startupManager` 的执行时机。

---

## 3. 重构影响分析 (To-Be)

### 3.1 启动时序变化

根据 V2 规范，注册流程将从 `main.ts` 阻塞流程移至 `Bootstrapper.vue` 的并行任务池。

- **优势**: 插件扫描和加载可以与环境初始化（Theme, Appearance）并行，减少总等待时间。
- **风险**: 若 `toolsStore.setReady()` 触发过早，可能导致 UI 已渲染但工具列表尚未填充。

### 3.2 Agent 工具发现的安全性

由于 Agent 工具发现是**运行时动态调用**，只要 `Bootstrapper` 在进入主应用层（MainApp）前完成 `ensurePlugins` 和 `autoRegisterServices`，LLM 聊天功能就能正常获取工具列表。该机制与重构方案天然契合。

### 3.3 分离窗口的“假性缺失”

分离窗口默认跳过全量插件加载。如果某个分离组件（如 Chat）依赖插件提供的工具，会发现工具列表为空。

- **对策**: 必须实现“组件自愈”，在组件挂载前显式触发 `ensurePlugins()`。

---

## 4. 关键约束与实施规范

### 4.1 SDK 同步挂载约束 (⚠️ 强制)

插件在 `import` 阶段可能立即访问全局变量。

- **规范**: `window.Vue`, `window.ElementPlus`, `window.AiohubSDK`, `window.AiohubUI` 的挂载逻辑**严禁**移入异步任务，必须保留在 `main.ts` 的最顶层（Stage 0）。

### 4.2 异步 UI 注册优化

- **规范**: 原 `main.ts` 中对 `PluginUI.components` 的全量全局注册应移入 `ensurePlugins` 任务。
- **理由**: 只有在插件加载后，这些 UI 组件才有意义，异步化可进一步减少首屏 JS 束体积。

### 4.3 任务依赖链

在 `Bootstrapper.vue` 中，应遵守以下执行顺序：

1. **L0**: `ensureBuffer` (Polyfill)
2. **L1**: 环境初始化 (Settings -> Theme -> Appearance)
3. **L2**: 业务初始化 (Plugins -> UserProfiles -> ToolsRegistry)
4. **L3**: 解锁应用 (`resumeLoading` / `setReady`)

---

## 5. 结论

重构方案对工具系统是**重大利好**，能够显著提升主窗口响应速度并降低分离窗口的内存占用。只要确保 **SDK 同步挂载** 和 **组件自愈调用**，即可安全实施。
