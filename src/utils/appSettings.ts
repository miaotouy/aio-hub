/**
 * 应用全局设置管理
 * 使用 Tauri 文件系统存储配置
 */

import { createConfigManager } from "./configManager";
import { logger } from "./logger";
import type { UserCssSettings } from "@/types/css-override";

// 壁纸模式类型
export type WallpaperMode = 'static' | 'slideshow';

// 窗口特效类型（根据不同操作系统支持）
export type WindowEffect = 'none' | 'blur' | 'acrylic' | 'mica' | 'vibrancy';

// 外观设置接口
export interface AppearanceSettings {
  // --- 壁纸设置 ---
  enableWallpaper: boolean;                    // 是否启用壁纸
  wallpaperMode: WallpaperMode;                // 壁纸模式：静态或轮播
  wallpaperPath: string;                       // 静态壁纸的图片路径
  wallpaperSlideshowPath: string;              // 目录轮播的目录路径
  wallpaperSlideshowInterval: number;          // 轮播间隔（分钟）
  wallpaperOpacity: number;                    // 壁纸透明度 (0.0 - 1.0)
  
  // --- UI 层特效 (应用内) ---
  enableUiBlur: boolean;                       // 是否启用 UI 元素模糊 (backdrop-filter)
  uiBaseOpacity: number;                       // UI 基础不透明度 (0.0 - 1.0)
  uiBlurIntensity: number;                     // UI 模糊强度 (px)
  borderOpacity: number;                       // 边线不透明度 (0.0 - 1.0)
  editorOpacity?: number;                      // 编辑器/代码区不透明度
  
  // --- 分层透明度微调 ---
  layerOpacityOffsets?: {                      // 各层级相对于基础值的偏移量
    sidebar?: number;                         // 侧边栏透明度偏移 (-0.2 ~ 0.2)
    content?: number;                         // 内容区透明度偏移
    card?: number;                            // 卡片透明度偏移
    overlay?: number;                         // 弹窗透明度偏移
  };
  
  // --- 窗口层特效 (OS级) ---
  windowEffect: WindowEffect;                  // 窗口背景特效类型
  windowBackgroundOpacity: number;             // 窗口背景色不透明度（用于透出桌面）
  backgroundColorOpacity?: number;             // 背景色不透明度（用于 CSS 变量）
}

export interface AppSettings {
  sidebarCollapsed: boolean;
  theme?: "light" | "dark" | "auto";

  // 通用设置
  showTrayIcon?: boolean; // 是否显示托盘图标（需要重启）
  minimizeToTray?: boolean; // 关闭时是否最小化到托盘（实时生效）
  autoAdjustWindowPosition?: boolean; // 新增：是否自动调整窗口位置

  // 主题颜色配置
  themeColor?: string; // 主色调 hex 值
  successColor?: string; // 成功色 hex 值
  warningColor?: string; // 警告色 hex 值
  dangerColor?: string; // 危险色 hex 值
  infoColor?: string; // 信息色 hex 值

  // 工具模块设置
  toolsVisible?: Record<string, boolean>;
  toolsOrder?: string[];

  // 日志配置
  logLevel?: "DEBUG" | "INFO" | "WARN" | "ERROR"; // 日志级别
  logToFile?: boolean; // 是否启用文件日志
  logToConsole?: boolean; // 是否启用控制台日志
  logBufferSize?: number; // 日志缓冲区大小

  // 关于信息
  version?: string;

  // CSS 覆盖配置
  cssOverride?: UserCssSettings;

  // 资产管理配置
  customAssetPath?: string; // 自定义资产存储路径

  // 插件管理器配置
  pluginManagerPanelWidth?: number; // 插件管理器右侧面板宽度（百分比）
  
  // 外观设置
  appearance?: AppearanceSettings;
}

// 默认外观设置
export const defaultAppearanceSettings: AppearanceSettings = {
  // 壁纸设置
  enableWallpaper: true, // 默认启用壁纸
  wallpaperMode: 'static',
  wallpaperPath: '', // 默认为空，使用纯色主题背景
  wallpaperSlideshowPath: '', // 目录轮播路径
  wallpaperSlideshowInterval: 30, // 30分钟切换
  wallpaperOpacity: 0.3, // 默认调低一点，避免喧宾夺主
  
  // UI 特效
  enableUiBlur: true,
  uiBaseOpacity: 0.85, // 稍微不透明一点，保证可读性
  uiBlurIntensity: 15, // 15px 模糊
  borderOpacity: 0.5, // 默认半透明
  editorOpacity: 0.9, // 编辑器/代码区不透明度
  
  // 分层透明度微调（默认不设置，使用自动计算的值）
  layerOpacityOffsets: {
    sidebar: 0.1,    // 侧边栏略厚一些
    content: 0,      // 内容区使用基准值
    card: 0.05,      // 卡片略厚
    overlay: 0.15,   // 弹窗最不透明
  },
  
  // 窗口特效
  windowEffect: 'none',
  windowBackgroundOpacity: 1.0, // 默认不透明
  
  // 背景色设置
  backgroundColorOpacity: 1.0, // 默认完全不透明
};

// 默认设置
export const defaultAppSettings: AppSettings = {
  sidebarCollapsed: false,
  theme: "auto",
  showTrayIcon: true, // 默认显示托盘图标
  minimizeToTray: true, // 默认最小化到托盘
  autoAdjustWindowPosition: true, // 默认开启
  // 默认主题颜色
  themeColor: "#409eff", // 主色调 - Element Plus 蓝色
  successColor: "#67c23a", // 成功色 - Element Plus 绿色
  warningColor: "#e6a23c", // 警告色 - Element Plus 橙色
  dangerColor: "#f56c6c", // 危险色 - Element Plus 红色
  infoColor: "#909399", // 信息色 - Element Plus 灰色
  toolsVisible: {
    regexApply: true,
    mediaInfoReader: true,
    textDiff: true,
    jsonFormatter: true,
    codeFormatter: true,
    symlinkMover: true,
    directoryTree: true,
    apiTester: true,
    llmProxy: true,
    gitAnalyzer: true,
  },
  toolsOrder: [],
  // 默认日志配置
  logLevel: "INFO", // 默认 INFO 级别
  logToFile: true, // 默认启用文件日志
  logToConsole: true, // 默认启用控制台日志
  logBufferSize: 1000, // 默认缓冲区大小
  version: "1.0.0",
  // 默认 CSS 覆盖配置
  cssOverride: {
    enabled: false,
    basedOnPresetId: null,
    customContent: "",
    userPresets: [],
    selectedPresetId: null,
  },
  // 插件管理器默认配置
  pluginManagerPanelWidth: 50, // 默认 50%
  // 外观设置
  appearance: defaultAppearanceSettings,
};

// 创建应用设置管理器实例
export const appSettingsManager = createConfigManager<AppSettings>({
  moduleName: "app-settings",
  fileName: "settings.json",
  version: "1.0.0",
  createDefault: () => defaultAppSettings,
  mergeConfig: (defaultConfig, loadedConfig) => {
    // 深度合并 toolsVisible 对象
    const mergedToolsVisible = {
      ...defaultConfig.toolsVisible,
      ...loadedConfig.toolsVisible,
    };
    
    // 深度合并 appearance 对象
    const mergedAppearance = loadedConfig.appearance ? {
      ...defaultConfig.appearance,
      ...loadedConfig.appearance,
      // 深度合并 layerOpacityOffsets
      layerOpacityOffsets: {
        ...defaultConfig.appearance?.layerOpacityOffsets,
        ...loadedConfig.appearance?.layerOpacityOffsets,
      },
    } : defaultConfig.appearance;

    return {
      ...defaultConfig,
      ...loadedConfig,
      toolsVisible: mergedToolsVisible,
      appearance: mergedAppearance,
    };
  },
});

// 缓存当前设置，避免频繁的异步读取
let cachedSettings: AppSettings | null = null;

/**
 * 加载应用设置（异步版本）
 */
export const loadAppSettingsAsync = async (): Promise<AppSettings> => {
  try {
    const settings = await appSettingsManager.load();
    cachedSettings = settings;
    logger.info("appSettings", "应用设置加载成功");
    return settings;
  } catch (error) {
    logger.error("appSettings", "加载应用设置失败", error, { operation: "load" });
    return defaultAppSettings;
  }
};

/**
 * 保存应用设置（异步版本）
 */
export const saveAppSettingsAsync = async (settings: AppSettings): Promise<void> => {
  try {
    await appSettingsManager.save(settings);
    cachedSettings = settings;
    logger.info("appSettings", "应用设置保存成功");
  } catch (error) {
    logger.error("appSettings", "保存应用设置失败", error, { operation: "save" });
    throw error;
  }
};

/**
 * 更新部分设置（异步版本）
 */
export const updateAppSettingsAsync = async (
  updates: Partial<AppSettings>
): Promise<AppSettings> => {
  try {
    const updatedSettings = await appSettingsManager.update(updates);
    cachedSettings = updatedSettings;
    logger.info("appSettings", "应用设置更新成功", {
      updatedKeys: Object.keys(updates),
    });
    return updatedSettings;
  } catch (error) {
    logger.error("appSettings", "更新应用设置失败", error, {
      operation: "update",
      updatedKeys: Object.keys(updates),
    });
    throw error;
  }
};

/**
 * 重置应用设置（异步版本）
 */
export const resetAppSettingsAsync = async (): Promise<AppSettings> => {
  try {
    await appSettingsManager.save(defaultAppSettings);
    cachedSettings = defaultAppSettings;
    logger.info("appSettings", "应用设置重置成功");
    return defaultAppSettings;
  } catch (error) {
    logger.error("appSettings", "重置应用设置失败", error, { operation: "reset" });
    throw error;
  }
};

// 创建防抖保存函数（500ms 延迟）
const debouncedSave = appSettingsManager.createDebouncedSave(500);

/**
 * 防抖保存设置
 */
export const saveAppSettingsDebounced = (settings: AppSettings): void => {
  cachedSettings = settings;
  debouncedSave(settings);
};

// 为了向后兼容，提供同步版本的 API（使用缓存）
// 注意：这些同步方法仅在初始化后才能正常工作

/**
 * 加载应用设置（同步版本，使用缓存）
 * 注意：首次调用前需要先调用 loadAppSettingsAsync 初始化
 */
export const loadAppSettings = (): AppSettings => {
  if (!cachedSettings) {
    logger.warn("appSettings", "设置尚未加载，返回默认设置", {
      operation: "loadSync",
      hint: "请先调用 loadAppSettingsAsync 初始化",
    });
    return defaultAppSettings;
  }
  return cachedSettings;
};

/**
 * 保存应用设置（同步版本，使用防抖）
 */
export const saveAppSettings = (settings: AppSettings): void => {
  saveAppSettingsDebounced(settings);
};

/**
 * 重置应用设置（同步版本）
 * 注意：这个方法会立即返回默认设置，但实际保存是异步的
 */
export const resetAppSettings = (): AppSettings => {
  cachedSettings = defaultAppSettings;
  // 异步保存，不等待结果
  resetAppSettingsAsync().catch((error) => {
    logger.error("appSettings", "异步重置设置失败", error, { operation: "resetAsync" });
  });
  return defaultAppSettings;
};

/**
 * 更新部分设置（同步版本）
 * 注意：更新会立即反映在缓存中，但实际保存是异步的
 */
export const updateAppSettings = (updates: Partial<AppSettings>): AppSettings => {
  const current = loadAppSettings();
  const updated = { ...current, ...updates };
  saveAppSettings(updated);
  return updated;
};
