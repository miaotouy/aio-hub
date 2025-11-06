# 主题优化：背景壁纸与半透明模糊 UI 设计文档

## 1. 功能概述

本项目旨在增强应用的主题定制能力，在现有的自定义 CSS 功能基础上，提供更直观、更易于使用的外观设置选项。核心功能点包括：

- **背景壁纸系统**：
    - 支持选择**本地图片**作为背景。
    - 支持**预设壁纸**库。
    - 支持**壁纸目录循环**（幻灯片模式），可设置定时间隔。
- **高级 UI 特效**：
    - **应用内毛玻璃**：为卡片、侧边栏等元素增加半透明和背景模糊，透出应用壁纸。
    - **窗口级特效**：支持将整个应用窗口设置为半透明，并应用系统级模糊效果（如 Windows 的 Mica/Acrylic、macOS 的 Vibrancy），使应用能透出桌面内容。
- **分层透明度系统**：构建有层次感的 UI，不同层级（背景、侧边栏、内容区、弹窗）可拥有不同的透明度和模糊度，避免视觉混乱。

## 2. 技术方案

我们将采用分层架构来实现，涉及前端设置管理、样式动态注入以及后端窗口能力扩展。

### 2.1. 数据层：设置持久化

我们需要扩展 `AppearanceSettings` 以支持更复杂的壁纸配置和窗口特效。

**文件**: `src/utils/appSettings.ts`

```typescript
export type WallpaperMode = 'static' | 'slideshow';
export type WindowEffect = 'none' | 'blur' | 'acrylic' | 'mica' | 'vibrancy'; // 具体取决于 OS 支持

export interface AppearanceSettings {
  // --- 壁纸设置 ---
  wallpaperMode: WallpaperMode;
  wallpaperPath: string; // 单张图片路径 或 包含多张图片的目录路径
  wallpaperSlideshowInterval: number; // 轮播间隔 (分钟)
  
  // --- UI 层特效 (应用内) ---
  enableUiBlur: boolean; // 是否启用 UI 元素模糊 (backdrop-filter)
  uiBaseOpacity: number; // UI 基础不透明度 (0.0 - 1.0)
  uiBlurIntensity: number; // UI 模糊强度 (px)

  // --- 窗口层特效 (OS级) ---
  windowEffect: WindowEffect; // 窗口背景特效
  windowBackgroundOpacity: number; // 窗口背景色不透明度 (当使用特效时，需降低此值以透出桌面)
}

// 默认值示例
const defaultAppearance: AppearanceSettings = {
  wallpaperMode: 'static',
  wallpaperPath: '', // 默认为空，使用纯色主题背景
  wallpaperSlideshowInterval: 30,
  enableUiBlur: true,
  uiBaseOpacity: 0.85, // 稍微不透明一点，保证可读性
  uiBlurIntensity: 15,
  windowEffect: 'none',
  windowBackgroundOpacity: 1.0, // 默认不透明
};
```

### 2.2. 后端层：窗口特效支持 (Rust)

为了实现“窗口透明”并透出桌面，我们需要在 Tauri 后端集成系统级窗口特效能力。

**依赖**: `tauri-plugin-window-vibrancy`

**变更**:
1.  在 `src-tauri/Cargo.toml` 中添加依赖。
2.  在 `src-tauri/src/main.rs` 中注册插件。
3.  创建新的 Tauri 命令 `apply_window_effect(effect: String, opacity: f64)`，供前端调用以动态切换特效。
    - Windows: 调用 `apply_blur`, `apply_acrylic`, `apply_mica` 等。
    - macOS: 调用 `apply_vibrancy`.
    - Linux: 可能仅支持基础透明或特定合成器效果。
4.  **重要**: 需确保 `tauri.conf.json` 中主窗口的 `transparent` 设置为 `true` (或在运行时动态设置，如果 Tauri 支持)。通常建议设为 `true`，默认不透明由前端 CSS `html/body` 背景色控制。

### 2.3. 逻辑层：外观管理 Composable

为了将外观设置的逻辑与 UI 分离，我们将创建一个新的 Vue Composable。

**文件**: `src/composables/useThemeAppearance.ts` (新建)

**核心功能**:
- **`useThemeAppearance`**:
  - 提供响应式的 `appearanceSettings` 状态，从 `appSettings` 中读取。
  - 提供 `updateAppearanceSetting` 方法来更新设置并持久化。
  - 包含一个 `applyAppearanceStyles` 方法，该方法会在挂载时和设置变更时执行，动态地将 CSS 变量注入到 `document.documentElement` 的 `style` 属性中。

```typescript
import { computed } from 'vue';
import { useAppSettings } from '@/utils/appSettings';

export function useThemeAppearance() {
  const { settings, updateSetting } = useAppSettings();
  // ...

  // 1. 处理壁纸逻辑
  // 如果是 slideshow 模式，需要设置定时器切换 currentWallpaper
  const currentWallpaper = ref('');

  // 2. 应用 CSS 变量 (分层透明度)
  const applyAppearanceStyles = () => {
    const root = document.documentElement;
    const s = settings.value.appearance;

    // 基础壁纸
    root.style.setProperty('--wallpaper-image', currentWallpaper.value ? `url('${currentWallpaper.value}')` : 'none');
    
    // UI 特效
    root.style.setProperty('--ui-blur', s.enableUiBlur ? `${s.uiBlurIntensity}px` : '0px');
    root.style.setProperty('--ui-base-opacity', s.uiBaseOpacity.toString());

    // 分层透明度派生 (示例)
    // 侧边栏通常比内容区更不透明一些，或者反之
    root.style.setProperty('--sidebar-opacity', Math.min(1, s.uiBaseOpacity + 0.1).toString());
    root.style.setProperty('--dialog-opacity', Math.min(1, s.uiBaseOpacity + 0.15).toString());
    
    // 窗口背景透明度 (用于透出 OS 桌面)
    // 如果启用了 windowEffect，html/body 的背景色需要变为半透明
    root.style.setProperty('--window-bg-opacity', s.windowEffect !== 'none' ? s.windowBackgroundOpacity.toString() : '1');
  };

  // 3. 调用后端应用窗口特效
  const applyWindowEffect = async () => {
     // invoke('apply_window_effect', { ... })
  };

  // ... 监听设置变化，触发上述应用逻辑 ...
}
```

### 2.4. 表现层：全局样式与分层系统

#### 2.4.1. 分层透明度设计 (Layered Translucency)

为了避免“糊成一片”，我们需要定义清晰的 UI 层级，并利用 CSS 变量进行派生。

| 层级 (Layer) | 描述 | 建议透明度 (相对于 Base) | 模糊建议 |
| :--- | :--- | :--- | :--- |
| **L0: Window** | 应用窗口根容器 | 由 `windowBackgroundOpacity` 控制 | OS级负责 |
| **L1: Wallpaper**| 壁纸层 | 1.0 (如果需要透出桌面，壁纸本身也需半透明，可选高级设置) | 无 |
| **L2: Sidebar** | 侧边导航 | `Base + 0.1` (略厚) | 高模糊 |
| **L3: Content** | 主内容区背景 | `Base` (基准) | 中模糊 |
| **L4: Cards** | 内容卡片 | `Base + 0.05` | 低模糊 |
| **L5: Overlays** | 弹窗、下拉菜单 | `Base + 0.15` (最不透明，保证聚焦) | 无或高模糊 |

#### 2.4.2. CSS 实现

**文件**: `src/styles/theme-appearance.css` (新建，专门管理外观相关的变量和类)

```css
:root {
  /* --- 核心变量 (由 JS 动态更新) --- */
  --ui-base-opacity: 0.85;
  --ui-blur: 15px;
  --window-bg-opacity: 1;

  /* --- 派生变量 (分层系统) --- */
  --opacity-l2-sidebar: calc(var(--ui-base-opacity) + 0.1);
  --opacity-l3-content: var(--ui-base-opacity);
  --opacity-l4-card: calc(var(--ui-base-opacity) + 0.05);
  --opacity-l5-overlay: calc(var(--ui-base-opacity) + 0.15);

  /* --- 颜色与透明度组合工具 --- */
  /* 需确保基础颜色变量有对应的 RGB 版本，例如 --bg-color-rgb: 255, 255, 255 */
}

/* 通用毛玻璃类 */
.glass-effect {
  backdrop-filter: blur(var(--ui-blur));
  -webkit-backdrop-filter: blur(var(--ui-blur));
}

/* 应用到具体组件 (示例) */
.main-sidebar {
  background-color: rgba(var(--bg-color-rgb), var(--opacity-l2-sidebar)) !important;
  backdrop-filter: blur(var(--ui-blur));
}

.el-card {
    background-color: rgba(var(--card-bg-rgb), var(--opacity-l4-card)) !important;
    /* 卡片可能不需要太强的模糊，或者复用通用模糊 */
}
```

#### 2.4.3. 全局应用逻辑

在应用的根组件中，我们将使用新建的 Composable 来应用样式。

**文件**: `src/App.vue`

**变更**:
- 在 `<script setup>` 中调用 `useThemeAppearance` 并执行其 `applyAppearanceStyles` 方法。
- 监听设置变化以重新应用样式。

```vue
<script setup lang="ts">
import { onMounted } from 'vue';
import { useThemeAppearance } from '@/composables/useThemeAppearance';

const { applyAppearanceStyles } = useThemeAppearance();

onMounted(() => {
  applyAppearanceStyles();
});
</script>
```

### 2.5. UI 层：高级外观设置页面

设置页面需要重新设计以容纳更多选项，建议使用 Tabs 或折叠面板分组。

**文件**: `src/views/Settings/general/ThemeAppearanceSettings.vue`

**界面规划**:

1.  **壁纸管理 (Wallpaper)**
    *   **模式选择**: 单张 / 轮播。
    *   **源选择**:
        *   **预设库**: 展示内置的高质量壁纸网格。
        *   **本地图片**: 选择单张文件。
        *   **本地目录**: 选择一个文件夹，启用轮播时从该文件夹读取。
    *   **轮播设置**: 仅在轮播模式下显示，设置切换间隔。

2.  **窗口特效 (Window Effects)**
    *   **特效类型**: 下拉框选择 (None, Mica, Acrylic, Blur 等，根据 OS 动态显示可用项)。
    *   **窗口背景透明度**: 滑块，调整 HTML 根元素的透明度，以便透出 OS 特效。
    *   *提示信息*: 说明此功能可能依赖特定操作系统版本。

3.  **界面质感 (UI Texture)**
    *   **应用内模糊**: 开关。
    *   **基础不透明度**: 主滑块，控制整体 UI 的“厚度”。
    *   **模糊强度**: 滑块，控制毛玻璃的模糊程度。
    *   *(可选) 高级分层微调*: 折叠面板，内含侧边栏、卡片、弹窗的独立透明度微调滑块（相对于基础值的偏移量）。

#### 2.4.1. 注册设置页面

**文件**: `src/config/settings.ts`

**变更**:
- 在 `settingsModules` 数组中添加新的外观设置模块。

```typescript
export const settingsModules: SettingsModule[] = [
  // ...
  {
    id: "theme-appearance",
    title: "主题外观",
    component: defineAsyncComponent(() => import("../views/Settings/general/ThemeAppearanceSettings.vue")),
    minHeight: "auto",
  },
  // ...
];
```

## 3. 文件变更清单

### 新建
- `src/composables/useThemeAppearance.ts`: 核心逻辑。
- `src/views/Settings/general/ThemeAppearanceSettings.vue`: 设置界面。
- `src/styles/theme-appearance.css`: 专门的外观样式变量与类。
- `src-tauri/src/commands/window_effects.rs`: (可选) 如果特效逻辑复杂，单独拆分 Rust 命令文件。

### 修改
- `src/utils/appSettings.ts`: 扩展数据模型。
- `src/styles/index.css`: 引入新的 CSS 文件，定义 RGB 基础变量。
- `src/App.vue`: 集成 `useThemeAppearance`。
- `src-tauri/Cargo.toml`: 添加 `window-vibrancy` 依赖。
- `src-tauri/src/main.rs`: 注册插件和命令。
- `src-tauri/tauri.conf.json`: 配置窗口透明性。

## 4. 实施阶段规划

### 阶段一：基础框架与壁纸系统
1.  更新 `AppSettings` 数据结构。
2.  实现 `useThemeAppearance` 的基础版本（处理静态壁纸、基础 CSS 变量注入）。
3.  创建设置页面的基本 UI（壁纸选择、基础透明度滑块）。
4.  在 `App.vue` 中挂载并测试静态壁纸显示。

### 阶段二：高级 UI 特效（应用内）
1.  完善 CSS 分层变量系统 (`theme-appearance.css`)。
2.  修改核心组件（Sidebar, InfoCard, Dialog）以使用新的分层透明度变量和毛玻璃类。
3.  在设置页面增加模糊开关和强度滑块，测试应用内实时效果。

### 阶段三：后端窗口特效与壁纸轮播
1.  集成 Rust `window-vibrancy` 插件，实现前端调用窗口特效。
2.  在设置页面增加窗口特效选择器。
3.  实现壁纸轮播逻辑（定时器、目录读取）。
4.  全面测试不同组合下的表现（如：透明窗口+轮播壁纸+毛玻璃UI）。
