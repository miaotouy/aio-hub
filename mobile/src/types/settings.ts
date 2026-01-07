/**
 * 移动端应用设置类型定义
 */

export type ThemeMode = "light" | "dark" | "auto";

export interface AppearanceSettings {
  /** 主题模式 */
  theme: ThemeMode;
  /** 主题种子颜色 */
  themeColor?: string;
  /** 是否启用触感反馈 */
  hapticFeedback: boolean;
  /** 字体大小缩放 (1.0 为正常) */
  fontSizeScale: number;
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
    hapticFeedback: true,
    fontSizeScale: 1.0,
  },
  network: {
    proxyMode: "system",
  },
  language: "zh-CN",
  hasCompletedOnboarding: false,
  debugMode: false,
};