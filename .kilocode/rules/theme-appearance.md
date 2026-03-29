# 主题外观系统 (Theme Appearance)

项目包含一个强大的主题外观系统，允许用户动态调整应用的透明度、模糊等视觉效果。核心逻辑封装在 `src/composables/useThemeAppearance.ts` 中。

## 核心机制

该系统通过在 `<html>` 根元素上动态设置 CSS 自定义属性 (CSS Variables) 来工作。所有组件都应优先使用这些变量来定义背景、边框等样式，以确保与用户设置保持一致。

## 颜色使用规范

为了保持与主题外观系统的兼容性，避免出现"死沉"的实色背景，请遵循以下颜色使用规范：

- **禁止直接使用 Element Plus 的 `light` 系列颜色作为背景色**（如 `--el-color-primary-light-9`、`--el-color-success-light-9` 等）。这些颜色是**实色**（已经混合了白色/黑色），与透明度系统不兼容，会破坏通透感。
- **正确做法**：使用主题外观系统提供的背景变量，这些变量已经包含了基于用户设置的透明度、颜色叠加和模糊效果。
  - 卡片/面板：`background-color: var(--card-bg);`
  - 输入框：`background-color: var(--input-bg);`
  - 侧边栏：`background-color: var(--sidebar-bg);`
  - 对话框/遮罩层：`background-color: var(--container-bg);`
- **如果需要使用 Element Plus 的基础颜色并附加透明度**（如模拟 `light-9` 效果），应使用其 RGB 变量配合 `rgba()` 函数，并**乘以全局透明度变量**以保持通透感。例如：

  ```css
  /* 不推荐：实色背景，不通透 */
  background-color: var(--el-color-primary-light-9);

  /* 不那么推荐：固定透明度，不响应用户设置 */
  background-color: rgba(var(--el-color-primary-rgb), 0.1);

  /* 推荐：响应全局透明度设置 */
  background-color: rgba(var(--el-color-primary-rgb), calc(var(--card-opacity) * 0.1));
  ```

  常见的对应关系：
  - `light-9` 效果：`calc(var(--card-opacity) * 0.1)`
  - `light-8` 效果：`calc(var(--card-opacity) * 0.15)`
  - `light-7` 效果：`calc(var(--card-opacity) * 0.2)`
  - `light-5` 效果：`calc(var(--card-opacity) * 0.3)`
  - `light-3` 效果：`calc(var(--card-opacity) * 0.7)`

  注意：`--card-opacity` 在禁用 UI 特效时会自动变为 `1`，确保了样式的鲁棒性。

## 如何适配新组件

要使你的组件支持动态主题外观，请遵循以下原则：

1.  **背景**: 根据组件的角色，使用对应的背景变量。这些变量已经包含了基于用户设置的透明度。
    - **卡片/面板**: `background-color: var(--card-bg);`
    - **输入框**: `background-color: var(--input-bg);`
    - **侧边栏**: `background-color: var(--sidebar-bg);`
    - **对话框/遮罩层**: `background-color: var(--container-bg);`

2.  **模糊效果 (Glassmorphism)**: 如果希望组件拥有毛玻璃效果，请添加 `backdrop-filter` 属性。模糊强度由用户设置动态控制。
    - `backdrop-filter: blur(var(--ui-blur));`

3.  **边框**: 边框颜色已经预设了透明度，可以直接使用 `--border-color` 变量。
    - `border: var(--border-width) solid var(--border-color);`

4.  **代码编辑器**: 对于代码编辑区域（如 CodeMirror/Monaco），应使用特定变量以匹配用户设置：
    - `background-color: var(--vscode-editor-background);`

## 示例

一个正确适配主题的卡片组件样式参考可能如下：

```css
.my-custom-card {
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  box-sizing: border-box;
  /* box-shadow: var(--el-box-shadow-light); */ /* 可选，复用 Element Plus 的阴影 */
}
```

通用组件中的已经预先适配过了。

通过遵循这些规范，可以确保所有 UI 元素都能响应设置中的"界面质感"调整，提供统一、高度可定制的用户体验。
