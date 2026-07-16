/**
 * 移动端应用设置类型定义
 */

export type ThemeMode = "light" | "dark" | "auto";

export interface AppearanceLayerOpacityOffsets {
  /** 卡片层相对基础透明度偏移 */
  card: number;
  /** 输入层相对基础透明度偏移 */
  input: number;
  /** 工具栏/导航层相对基础透明度偏移 */
  toolbar: number;
  /** 弹层相对基础透明度偏移 */
  overlay: number;
}

export type AppearanceWallpaperPreset =
  "none" | "aurora" | "morning" | "canyon" | "ink";

export interface AppearanceWallpaperSettings {
  /** 是否启用壁纸背景 */
  enabled: boolean;
  /** 内置壁纸预设 */
  preset: AppearanceWallpaperPreset;
  /** 壁纸遮罩强度 (0.0 - 1.0) */
  dimOpacity: number;
  /** 壁纸自身模糊强度 (px) */
  blurIntensity: number;
}

export interface AppearanceSettings {
  /** 主题模式 */
  theme: ThemeMode;
  /** 主题种子颜色 */
  themeColor?: string;
  /** 壁纸背景 */
  wallpaper: AppearanceWallpaperSettings;
  /** 是否启用触感反馈 */
  hapticFeedback: boolean;
  /** 字体大小缩放 (1.0 为正常) */
  fontSizeScale: number;
  /** 是否启用界面质感效果 */
  enableUiEffects: boolean;
  /** 是否启用 UI 元素模糊 */
  enableUiBlur: boolean;
  /** UI 模糊强度 (px) */
  uiBlurIntensity: number;
  /** UI 基础不透明度 (0.0 - 1.0) */
  uiBaseOpacity: number;
  /** 边线不透明度 (0.0 - 1.0) */
  borderOpacity: number;
  /** 边线宽度 (px) */
  borderWidth: number;
  /** 圆角缩放 (1.0 为正常) */
  radiusScale: number;
  /** 分层透明度微调 */
  layerOpacityOffsets: AppearanceLayerOpacityOffsets;
}

export interface NetworkSettings {
  /** 代理模式 */
  proxyMode: "none" | "system" | "custom";
  /** 自定义代理地址 */
  proxyUrl?: string;
}

export interface MobileAppSettings {
  /** 外观设置 */
  appearance: AppearanceSettings;
  /** 网络设置 */
  network: NetworkSettings;
  /** 语言设置 */
  language: string;
  /** 是否已完成首次启动引导 */
  hasCompletedOnboarding: boolean;
  /** 调试模式 */
  debugMode: boolean;
}

/**
 * 默认设置
 */
export const DEFAULT_APP_SETTINGS: MobileAppSettings = {
  appearance: {
    theme: "auto",
    themeColor: "#409EFF",
    wallpaper: {
      enabled: false,
      preset: "aurora",
      dimOpacity: 0.34,
      blurIntensity: 0,
    },
    hapticFeedback: true,
    fontSizeScale: 1.0,
    enableUiEffects: false,
    enableUiBlur: true,
    uiBlurIntensity: 10,
    uiBaseOpacity: 0.94,
    borderOpacity: 0.72,
    borderWidth: 1,
    radiusScale: 1,
    layerOpacityOffsets: {
      card: 0.02,
      input: 0.04,
      toolbar: 0.06,
      overlay: 0.1,
    },
  },
  network: {
    proxyMode: "system",
  },
  language: "zh-CN",
  hasCompletedOnboarding: false,
  debugMode: false,
};
