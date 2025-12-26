# 主题系统架构

本文档详细介绍了 AIO Hub 的动态主题系统，该系统实现了深色模式切换、自定义主题色以及与 Element Plus 组件库的深度集成。

## 1. 架构概览

AIO Hub 的主题系统基于 **CSS 变量 (CSS Custom Properties)** 和 **VueUse** 构建，实现了高性能的动态换肤。

- **核心特性**:
  - **自动/手动模式**: 支持跟随系统 (`auto`) 或强制指定 (`light`/`dark`)。
  - **动态色板**: 仅需指定一个主色，自动生成全套色阶（Light/Dark 变体）。
  - **持久化**: 主题设置自动保存并跨窗口同步。
  - **无闪烁加载**: 在应用启动初期即应用缓存的主题配置。

## 2. 核心组件

### 2.1 状态管理 (`useTheme.ts`)

`useTheme` Composable 是主题系统的状态中心。

- **`currentTheme`**: 存储用户设置的主题模式 ('auto' | 'light' | 'dark')。
- **`isDark`**: 响应式的布尔值，表示当前实际是否为深色模式（由 `useDark` 管理）。
- **`applyTheme`**: 切换主题模式，并处理 `auto` 模式下的系统监听。

### 2.2 图标自适应系统 (`DynamicIcon.vue` & `useThemeAwareIcon.ts`)

为了解决外部 SVG 图标在深色模式下可能因硬编码颜色（如纯黑/纯白）而不可见的问题，系统实现了一套智能颜色反转机制。

- **`DynamicIcon` 组件**: 统一的图标渲染入口，支持远程 URL、本地路径、SVG 和位图。
- **`useThemeAwareIcon` 逻辑**:
  - **智能识别**: 自动识别 SVG 中的单色部分（黑色 `#000` 或白色 `#fff`）。
  - **动态替换**: 将这些单色属性（`fill`, `stroke`）替换为 CSS 变量 `currentColor`。
  - **彩色保留**: 非黑白的彩色部分保持不变，确保品牌色或多色图标的视觉呈现。
  - **CSS 联动**: 在组件样式中，`.dynamic-icon` 默认绑定 `color: var(--el-text-color-primary)`，从而实现图标随主题自动切换颜色。

### 2.3 颜色引擎 (`src/utils/themeColors.ts`)

负责颜色的计算逻辑，由 `main.ts` 或 `useTheme.ts` 调用进行注入。

- **`applyThemeColors`**: 接收基础色（如 `primary`），动态计算出色阶并注入到 `document.documentElement` 的 style 属性中（主要用于覆盖 Element Plus 的变量）。
- **颜色算法**:
  - **`lightenColor` / `darkenColor`**: 基于 RGB 混合算法生成颜色的变体。
  - **智能反转**: 在深色模式下，生成色阶时会自动调整混合比例，以确保视觉层级的一致性。

### 2.4 全局初始化 (`App.vue`)

- **初始化**: 在 `onMounted` 中调用 `initThemeAppearance`。
- **监听**: 监听 `app-settings-changed` 事件，实现跨窗口的主题同步（如在设置页修改主题，主窗口即时响应）。

## 3. CSS 变量体系

系统主要维护两类 CSS 变量：

### 3.1 基础变量 (Base Variables)

定义在 `src/styles/index.css` 中，作为全局样式的基石：

```css
:root {
  --bg-color: #f4f4f4;
  --container-bg: #fff;
  --text-color: #333;
  --border-color: rgba(var(--border-color-rgb), var(--border-opacity));
  /* ... */
}

html.dark {
  --bg-color: #1a1a1a;
  --container-bg: #242424;
  --text-color: #e5e5e5;
  --border-color: rgba(var(--border-color-rgb), var(--border-opacity));
  /* ... */
}
```

### 3.2 动态变量 (Dynamic Variables)

由 `themeColors.ts` 动态注入：

- **`--primary-color`**: 主色调。
- **`--el-color-primary`**: Element Plus 主色。
- **`--el-color-primary-light-[1-9]`**: 自动生成的主色变体，用于 hover/active 态。

## 4. 扩展指南

### 添加新的语义化颜色

1.  在 `themeColors.ts` 的 `applyThemeColors` 函数参数中添加新字段。
2.  添加对应的 CSS 变量生成逻辑。
3.  在组件中使用 `var(--new-color)`。

### 适配自定义组件

确保组件样式不使用硬编码的颜色值，而是引用 CSS 变量：

```css
.my-component {
  background-color: var(--bg-color); /* ✅ 正确 */
  color: var(--text-color); /* ✅ 正确 */
  border: 1px solid #ccc; /* ❌ 错误：在深色模式下会太亮 */
  border: 1px solid var(--border-color); /* ✅ 正确 */
}
```

## 5. 主题外观系统 (Theme Appearance)

除了基础的颜色主题（亮/暗模式、主色调）外，AIO Hub 还包含一个强大的**主题外观系统**，负责管理应用的视觉“质感”，如透明度、模糊效果和壁纸。该系统的核心是 `src/composables/useThemeAppearance.ts`。

### 5.1 核心功能

该系统独立于颜色主题，专注于更高级的视觉定制：

- **动态壁纸**:
  - 支持**静态图片**和**文件夹轮播**两种模式。
  - 提供多种填充方式 (`cover`, `contain`, `fill`, `tile`)。
  - 轮播模式支持间隔设置、随机播放和手动控制。
- **界面质感 (Glassmorphism)**:
  - **UI 模糊**: 为UI元素（如卡片、侧边栏）添加可调节强度的背景模糊（毛玻璃）效果。
  - **分层透明度**: UI 元素（卡片、输入框、侧边栏等）的背景透明度可独立或联动调节，创造视觉层次感。
  - **分离窗口独立设置**: 分离出的独立窗口可以拥有与主窗口不同的透明度配置。
- **背景色叠加**:
  - 在UI背景之上混合一层颜色，支持多种**混合模式** (`overlay`, `multiply` 等)。
  - **智能颜色提取**: 可自动从当前壁纸中提取主色调，并将其作为叠加颜色，使UI与壁纸风格协调统一。
- **窗口特效 (实验性)**:
  - 通过与 Tauri 后端交互，应用操作系统级别的窗口背景特效，如 Windows 平台的 `Mica` 和 `Acrylic`，以及 macOS 的 `blur`。

### 5.2 核心模块

#### 5.2.1 逻辑核心 (`useThemeAppearance.ts`)

这个 Composable 是整个外观系统的中枢，负责所有逻辑处理：

- **状态管理**: 维护一个响应式的 `appearanceSettings` 对象，包含所有外观相关的配置。
- **CSS 变量注入**: 监听 `appearanceSettings` 的变化，并动态地将对应的样式（如透明度、模糊值、壁纸URL）计算并注入到 `document.documentElement` 的 CSS 变量中。
- **持久化**: 使用 `appSettingsManager` 自动保存用户的外观设置。
- **副作用处理**: 管理壁纸轮播的定时器、调用 Tauri `invoke` 来应用窗口特效。
- **接口暴露**: 导出 `useThemeAppearance` 函数，供UI组件消费状态和调用控制方法（如 `selectWallpaper`, `updateAppearanceSetting`）。

#### 5.2.2 用户界面 (`ThemeAppearanceSettings.vue`)

该组件是外观系统的可视化配置面板，位于设置 -> 通用 -> 外观质感。

- **功能**: 为 `useThemeAppearance.ts` 管理的所有状态提供了完整的UI控件（开关、滑块、颜色选择器、下拉菜单等）。
- **交互**: 用户通过操作UI控件，调用从 `useThemeAppearance` 获取的函数来更新应用的外观设置。

### 5.3 关键 CSS 变量

外观系统通过注入以下关键的 CSS 变量来工作，组件开发时应优先使用这些变量以确保兼容性：

```css
:root {
  /* --- 壁纸 --- */
  --wallpaper-url: url(...);
  --wallpaper-opacity: 0.5;
  --wallpaper-size: cover;

  /* --- UI 质感 --- */
  --ui-blur: 15px; /* UI 元素的背景模糊强度，由 JS 动态更新 */
  --border-opacity: 0.9;

  /* --- 动态计算的背景色 (由 useThemeAppearance.ts 注入，包含透明度和颜色叠加) --- */
  --card-bg: rgba(...);
  --sidebar-bg: rgba(...);
  --container-bg: rgba(...);
  --input-bg: rgba(...);

  /* --- 窗口特效 --- */
  --window-bg-opacity: 0.8; /* 控制整个窗口背景的透明度 */
}
```

### 5.4 适配指南

为了让自定义组件能够正确响应外观系统的设置，开发时应遵循 `src/styles/theme-appearance.css` 中定义的规范：

- **背景**: 使用 `--card-bg`, `--sidebar-bg` 等语义化背景变量，而不是自己构造 `rgba()`。
- **模糊**: 需要毛玻璃效果的组件，应添加 `backdrop-filter: blur(var(--ui-blur));`。
- **边框**: 边框颜色应使用 `var(--border-color)`，其透明度会受 `--border-opacity` 的影响。

通过这种方式，所有UI元素都能与用户的个性化设置保持一致，提供统一且高度可定制的视觉体验。
