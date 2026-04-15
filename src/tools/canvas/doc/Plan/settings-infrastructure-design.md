# Canvas 设置页基建设计报告

**状态**: Draft  
**创建时间**: 2026-04-15  
**作者**: 咕咕 (Kilo 版)

---

## 1. 背景与动机

在实现“运行时错误反馈机制”的过程中，发现 Canvas 工具缺乏一个统一的配置管理中心和 UI 设置界面。为了保证代码的优雅和功能的可维护性，需要先搭建 Canvas 的设置页基建。

## 2. 设计方案

### 2.1 配置管理 (Store 层)

在 `canvasStore.ts` 中引入 `config` 对象，并使用 `localStorage` 进行持久化。

**配置项定义**:

- `maxRuntimeErrors`: 上下文中包含的最大错误数量（默认 10）。
- `autoIncludeErrors`: 是否自动将预览错误注入 Agent 上下文（默认 true）。
- `autoOpenPreview`: 创建画布后是否自动打开预览窗口（默认 true）。
- `fontSize`: 编辑器字号（默认 14）。

### 2.2 UI 渲染 (Component 层)

创建 `CanvasSettings.vue`，复用项目成熟的 `SettingListRenderer` 组件。

**界面结构**:

- **基础配置**: 包含预览行为、模板偏好。
- **Agent 协作**: 包含错误反馈策略、上下文注入限制。
- **编辑器设置**: 包含字号、换行等。

### 2.3 注册集成 (Registry 层)

更新 `canvas.registry.ts`，确保 `settingsSchema` 与 Store 中的 `config` 保持同步。

---

## 3. 实施步骤

1. **类型定义**: 创建 `src/tools/canvas/types/config.ts`。
2. **配置元数据**: 创建 `src/tools/canvas/config.ts`，定义 `DEFAULT_CANVAS_CONFIG` 和 `canvasSettingsConfig`。
3. **Store 增强**: 在 `canvasStore.ts` 中实现配置持久化逻辑。
4. **UI 实现**: 编写 `CanvasSettings.vue`。
5. **入口集成**: 在 `CanvasWorkbench.vue` 中添加设置切换逻辑。

---

## 4. 预期效果

- 用户可以自主控制 Agent 能够感知的错误数量。
- 提供了 Canvas 工具的个性化配置能力。
- 为后续的自动化反馈机制提供了稳定的配置读取接口。
