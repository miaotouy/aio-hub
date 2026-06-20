import type { InjectionKey, ComputedRef } from "vue";
import type { BubbleLayoutOverride } from "../../composables/ui/useMessageLayout";

/** 折叠策略 */
export type CollapseStrategy =
  | "preserve"
  | "config"
  | "override-expand"
  | "override-collapse";

// -------------- V4: 背景与间距配置 --------------

/** 截图背景类型 */
export type ScreenshotBgType = "theme" | "solid" | "wallpaper";

/** 壁纸平铺方式 (仅当 bgConfig.type === "wallpaper" 时生效) */
export type WallpaperMode = "cover" | "contain" | "tile" | "stretch";

/** 截图背景配置 */
export interface ScreenshotBgConfig {
  type: ScreenshotBgType;
  /** 纯色背景时的 HEX 颜色值 */
  color: string;
  /** 壁纸不透明度 (0.0 - 1.0) */
  wallpaperOpacity: number;
  /** 壁纸平铺方式, 默认 cover (与系统主界面壁纸行为一致) */
  wallpaperMode: WallpaperMode;
}

/** 截图背景配置默认值 */
export const SCREENSHOT_BG_CONFIG_DEFAULT: ScreenshotBgConfig = {
  type: "theme",
  color: "#ffffff",
  wallpaperOpacity: 0.6,
  wallpaperMode: "cover",
};

/** 消息间距默认值: undefined 表示跟随布局模式自动 (卡片 8px, 气泡 12px) */
export const SCREENSHOT_GAP_DEFAULT: number | undefined = undefined;
/** 消息间距范围 */
export const SCREENSHOT_GAP_MIN = 0;
export const SCREENSHOT_GAP_MAX = 32;

/** 四周留白默认值 (px) */
export const SCREENSHOT_PADDING_DEFAULT = 16;
/** 四周留白范围 */
export const SCREENSHOT_PADDING_MIN = 0;
export const SCREENSHOT_PADDING_MAX = 64;

/** 卡片装饰默认值 */
export const SCREENSHOT_DECORATION_DEFAULT = true;

// -------------- V5: 水印配置 --------------

/** 水印配置 */
export interface ScreenshotWatermarkConfig {
  /** 是否启用水印 */
  enable: boolean;
  /** 水印文字 */
  text: string;
  /** 水印颜色 (支持 rgba / hex, 含透明度) */
  color: string;
  /** 字号 (px) */
  fontSize: number;
  /** 平铺间距 (px) — 两个相邻水印中心点之间的距离 */
  gap: number;
  /** 旋转角度 (deg) */
  angle: number;
}

/** 水印默认值 (关闭, 与系统视觉保持一致) */
export const SCREENSHOT_WATERMARK_DEFAULT: ScreenshotWatermarkConfig = {
  enable: false,
  text: "AIO Hub",
  color: "rgba(0, 0, 0, 0.08)",
  fontSize: 18,
  gap: 220,
  angle: -22,
};

/** 水印字号范围 */
export const SCREENSHOT_WATERMARK_FONT_SIZE_MIN = 10;
export const SCREENSHOT_WATERMARK_FONT_SIZE_MAX = 48;
/** 水印间距范围 */
export const SCREENSHOT_WATERMARK_GAP_MIN = 80;
export const SCREENSHOT_WATERMARK_GAP_MAX = 600;
/** 水印角度范围 */
export const SCREENSHOT_WATERMARK_ANGLE_MIN = -90;
export const SCREENSHOT_WATERMARK_ANGLE_MAX = 90;

// -------------- V5: 应用标识 (头/脚) 配置 --------------

/** 标识显示位置 */
export type BrandShowMode = "none" | "top" | "bottom" | "both";

/** 标识配置 */
export interface ScreenshotBrandConfig {
  /** 显示位置: 不显示 / 仅顶部 / 仅底部 / 顶部和底部 */
  show: BrandShowMode;
  /** 自定义文案 (副标题 / 副品牌), 默认与 AIO Hub 一致 */
  text: string;
  /** 是否显示 Logo (项目内置 aio-icon-color) */
  showLogo: boolean;
}

/** 标识默认值 (关闭, 不打扰用户) */
export const SCREENSHOT_BRAND_DEFAULT: ScreenshotBrandConfig = {
  show: "none",
  text: "AIO Hub",
  showLogo: true,
};

// -------------- 截图元素显示覆盖配置 --------------

/** 截图元素显示覆盖配置 */
export interface ScreenshotElementOverrides {
  showAvatar: boolean;
  showTimestamp: boolean;
  showTokenCount: boolean;
  showTokenCountForBlocks: boolean;
  showCharCount: boolean;
  showModelInfo: boolean;
  showPerformanceMetrics: boolean;
}

/** 元素显示开关的别名, 与 ScreenshotElementOverrides 同义, 便于对话框内表达 */
export type ElementToggles = ScreenshotElementOverrides;

/**
 * 布局覆盖配置 (ShareScreenshotDialog 用)。
 * - 气泡相关字段 (mode / borderRadius) 走 useMessageLayout 的合并逻辑
 * - fontSize 走 CSS 变量 (--message-font-size), 由 MessageContent /
 *   ToolCallMessage 通过 var(...) 兜底读取
 */
export interface LayoutOverrides extends BubbleLayoutOverride {
  /** 临时覆盖字体大小 (px), undefined 表示沿用系统设置 */
  fontSize: number | undefined;
}

/** 渲染宽度的取值方式 */
export type RenderWidthMode = "auto" | "fixed";

/** 截图渲染选项 — 真实影响最终输出图片的尺寸与清晰度 */
export interface ScreenshotRenderOptions {
  /**
   * 渲染容器宽度 (CSS px), 决定消息气泡/卡片的换行宽度。
   * - widthMode = "auto" : 每次打开对话框时按消息区宽度快照, 向下取整并 clamp 到 [MIN, MAX]
   * - widthMode = "fixed": 使用用户手动设置的值, 跨会话保留
   * 同步贯通到 ScreenshotRenderer 与 captureMessagesAndStitch。
   */
  width: number;
  /**
   * 渲染宽度取值方式:
   * - "auto"  跟随消息区宽度 (打开对话框时采样, 向下取整, clamp 到 [480, 1280])
   * - "fixed" 使用手动指定的值
   */
  widthMode: RenderWidthMode;
  /**
   * 输出像素倍率 (DPR), 决定最终 PNG 的像素密度。
   * 1 = 标准, 2 = 2x 高清(默认), 3 = 3x 超清。
   * 真实图片尺寸 = width * scale (横向)。
   */
  scale: number;

  // --- V4: 背景与间距配置 ---
  /** 背景配置 */
  bgConfig: ScreenshotBgConfig;
  /** 消息间距 (px), undefined 表示跟随布局模式自动 (卡片 8px, 气泡 12px) */
  gap: number | undefined;
  /** 四周留白 (内边距, px) */
  padding: number;
  /** 是否启用卡片外边框与投影装饰 */
  enableDecoration: boolean;

  // --- V5: 水印 ---
  /** 水印配置 */
  watermark: ScreenshotWatermarkConfig;
  // --- V5: 应用标识 (头/脚) ---
  /** 品牌标识配置 */
  brand: ScreenshotBrandConfig;
}

/** provide/inject key: 截图元素覆盖 */
export const SCREENSHOT_OVERRIDES_KEY: InjectionKey<
  ComputedRef<ScreenshotElementOverrides>
> = Symbol("screenshotElementOverrides");

/** 渲染宽度的合法范围 (px) */
export const RENDER_WIDTH_MIN = 480;
export const RENDER_WIDTH_MAX = 1280;
export const RENDER_WIDTH_STEP = 40;
export const RENDER_WIDTH_DEFAULT = 720;

/** 渲染宽度模式默认值: 跟随消息区宽度 */
export const RENDER_WIDTH_MODE_DEFAULT: RenderWidthMode = "auto";

/** 输出像素倍率的合法选项 */
export const CAPTURE_SCALE_OPTIONS = [1, 2, 3] as const;
export const CAPTURE_SCALE_DEFAULT = 2;

