# 应用内动态壁纸设计方案

## 1. 概述

本设计旨在为 AIO Hub 引入“动态壁纸”功能，支持将视频（MP4/WebM）或网页（HTML/WebGL）作为应用背景。考虑到 AIO Hub 的**多窗口分离架构**，该功能必须支持在透明的分离窗口中独立渲染，同时具备智能的**音频焦点管理**和**性能优化**策略，以避免多窗口环境下的资源竞争和听觉干扰。

## 2. 核心架构

### 2.1. 可复用组件：`WallpaperLayer.vue`

创建一个通用的壁纸渲染组件 `src/components/wallpaper/WallpaperLayer.vue`，它不依赖于特定的父容器，而是作为通用的背景层被复用。

**使用场景：**

1.  **主窗口 (`App.vue`)**: 作为根节点的底层背景，覆盖整个应用。
2.  **分离组件 (`ChatArea.vue`, `MessageInput.vue`)**: 在组件内部作为最底层 (`z-index: -1`) 渲染，因为分离窗口本身是透明的，组件需要自带背景以实现“悬浮窗”效果。

**组件接口 (Props):**

```typescript
interface WallpaperLayerProps {
  // 强制覆盖全局设置（用于分离窗口的特殊配置）
  overrideSource?: string;
  overrideType?: "image" | "video" | "web";

  // 独立控制（默认跟随全局策略）
  forceMuted?: boolean;
  forcePaused?: boolean;

  // 样式微调
  opacity?: number;
  blur?: number;
}
```

### 2.2. 状态管理与控制器：`useWallpaperController`

为了处理复杂的播放逻辑，我们需要一个专门的 Composable `src/composables/useWallpaperController.ts`。

**核心职责：**

1.  **焦点感知 (Focus Awareness)**:
    - 使用 VueUse 的 `useWindowFocus` 监听当前窗口焦点。
    - 使用 `usePageVisibility` 监听页面可见性。
2.  **媒体互斥 (Media Mutex)**:
    - 利用 `WindowSyncBus` 监听应用内其他媒体（如 TTS、视频消息）的播放状态。
    - 当收到 `media-playing` 事件时，自动将壁纸静音。
3.  **决策逻辑**:
    - **播放决策**: `shouldPlay` = `enabled` && (`playInBackground` || `isWindowFocused`) && !`isLowPowerMode`
    - **音频决策**: `shouldUnmute` = `soundEnabled` && `isWindowFocused` && !`isInternalMediaPlaying`

### 2.3. 状态管理扩展 (`useThemeAppearance.ts`)

扩展 `AppearanceSettings` 以支持高级控制：

```typescript
interface AppearanceSettings {
  // ... 现有字段

  // [新增] 壁纸源
  wallpaperType: "auto" | "image" | "video" | "web";
  wallpaperSource: string; // 路径或 URL

  // [新增] 播放行为
  wallpaperMuted: boolean; // 全局默认静音
  wallpaperVolume: number; // 音量 (0-100)
  playOnlyOnFocus: boolean; // 仅当窗口获得焦点时播放视频
  muteOnBlur: boolean; // 失去焦点时静音（但继续播放画面）

  // [新增] 性能设置
  pauseOnBattery: boolean; // 使用电池时暂停动态壁纸

  // [新增] 分离窗口策略
  // 'sync': 同步主窗口设置（默认）
  // 'static': 强制降级为静态图片（高性能）
  // 'transparent': 不渲染壁纸（完全透明）
  detachedWallpaperStrategy: "sync" | "static" | "transparent";
}
```

## 3. UI/UX 交互设计

采用 **"双模态交互"** 策略，针对主窗口和分离窗口提供不同的控制体验。

### 3.1. 控制组件：`WallpaperControls.vue`

创建一个通用的控制组件，支持两种显示模式：

- **Inline Mode (内联模式)**: 图标按钮平铺展开，支持**响应式折叠**。在标题栏等空间受限区域，默认收起为图标，点击后横向展开完整控制条。
- **Popup Mode (气泡模式)**: 仅显示一个状态图标，Hover/点击时弹出控制面板，适合空间紧凑的区域。

### 3.2. 主窗口集成 (`TitleBar.vue`)

- **策略**: **直接集成 (Built-in)**。
- **位置**: 在主题切换按钮旁，直接嵌入 `WallpaperControls` (Inline Mode)。
- **交互**: 利用 Inline Mode 的折叠特性，默认显示为紧凑图标，点击后在标题栏内横向推开其他元素展开控制条。
- **理由**: 作为全局外观设置的一部分，直接展示能提供最快捷的访问路径，同时通过折叠保持标题栏整洁。

### 3.3. 分离窗口集成 (`ComponentHeader.vue`)

- **策略**: **插槽注入 (Slot Injection)**。
- **实现**:
  - 改造 `ComponentHeader`，增加 `actions-prepend` 插槽。
  - 在业务组件（如 `ChatArea`）中，通过插槽注入 `WallpaperControls` (Popup Mode)。
- **表现**: 默认只显示一个精致的小图标（指示壁纸状态），用户交互时通过 Popover 气泡展开详细控制（播放/暂停、音量）。
- **理由**: 分离窗口头部空间宝贵，气泡式交互能有效减少视觉干扰。

## 4. 详细交互逻辑

### 4.1. 多窗口音频管理

为了防止多个窗口同时播放壁纸声音导致混乱，采用以下策略：

1.  **仅焦点发声 (Focus-Only Audio)**:
    - 默认情况下，只有**当前获得焦点**的窗口（无论是主窗口还是分离窗口）才允许播放壁纸声音。
    - 当用户切换窗口焦点时，原窗口自动静音/淡出，新窗口取消静音/淡入。

2.  **应用内媒体优先 (Internal Media Priority)**:
    - 当应用内有其他媒体（如 TTS 语音、视频消息）开始播放时，壁纸层自动**静音**（Side-chaining / Ducking）。
    - 媒体播放结束后，壁纸声音自动恢复。

### 4.2. 性能优化策略

1.  **后台暂停**:
    - 当窗口最小化或完全被遮挡时，暂停视频渲染循环和解码。
    - 分离窗口如果失去焦点且设置了 `playOnlyOnFocus`，则暂停视频，显示最后一帧或 Poster 图片。

2.  **资源共享 (未来规划)**:
    - 目前各窗口独立加载资源。未来可考虑通过 Rust 后端解码视频帧，通过共享内存分发给各 WebView（技术难度较大，暂不作为第一阶段目标）。

## 5. 路由与传参优化

利用分离系统的 `metadata` 机制，在窗口创建时传递初始状态。

### 5.1. 发送端 (`ChatArea.vue`)

在 `startDetaching` 时，计算并注入配置：

```typescript
// 计算分离窗口的壁纸配置
const wallpaperMeta = {
  // 如果策略是 static，强制指定类型为 image
  type: settings.detachedWallpaperStrategy === "static" ? "image" : settings.wallpaperType,
  source: settings.wallpaperSource,
  // 传递初始静音状态（通常分离窗口起步时应静音，避免突然发出声音）
  muted: true,
};

startDetaching({
  // ...
  metadata: {
    wallpaper: wallpaperMeta,
  },
});
```

### 5.2. 接收端 (`WallpaperLayer.vue`)

组件挂载时，检查是否处于分离窗口（通过 `useDetachedManager` 或路由参数），并读取初始配置。

```typescript
const route = useRoute();
const detachedConfig = tryParseRouteConfig(route);

// 合并配置：优先使用路由参数中的 metadata，其次使用全局 Store
const finalConfig = computed(() => ({
  ...globalSettings.value,
  ...detachedConfig?.metadata?.wallpaper,
}));
```

## 6. 实现步骤

1.  **核心状态与控制**:
    - 实现 `useWallpaperController.ts`。
    - 更新 `useThemeAppearance.ts` 添加配置项。
2.  **UI 组件开发**:
    - 开发 `WallpaperLayer.vue` (渲染层)。
    - 开发 `WallpaperControls.vue` (控制层，支持 Inline/Popup 模式)。
3.  **主窗口集成**:
    - 修改 `App.vue` 引入 `WallpaperLayer`。
    - 修改 `TitleBar.vue` 集成 `WallpaperControls`。
4.  **分离窗口集成**:
    - 修改 `ComponentHeader.vue` 添加插槽。
    - 修改 `ChatArea.vue` 等组件，通过插槽注入 `WallpaperControls`。
5.  **设置界面**:
    - 在外观设置中添加“动态壁纸”相关选项。

## 7. 风险与挑战

- **Iframe 壁纸的安全性**: 加载外部网页作为壁纸时，必须严格限制 `sandbox` 权限，防止恶意脚本执行或弹窗。
- **视频无缝循环**: 某些浏览器内核在视频循环播放时可能会有短暂黑帧，需要使用双缓冲或 CSS 技巧掩盖。
