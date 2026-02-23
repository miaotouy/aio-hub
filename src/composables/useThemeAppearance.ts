import { ref, computed, watch } from "vue";
import debounce from "lodash-es/debounce";
import shuffle from "lodash-es/shuffle";
import {
  type AppearanceSettings,
  type WindowEffect,
  type BlendMode,
  defaultAppearanceSettings,
  BUILTIN_WALLPAPERS,
} from "@/utils/appSettings";
import { useAppSettingsStore } from "@/stores/appSettingsStore";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { useTheme } from "@/composables/useTheme";
import { open } from "@tauri-apps/plugin-dialog";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import ColorThief from "color-thief-ts";

/**
 * 获取内置壁纸的完整 URL
 */
function getBuiltinWallpaperUrl(filename: string): string {
  // 在 Tauri/Vite 环境中，public 目录下的资源可以直接通过根路径访问
  // 注意：生产构建后，这些资源位于资源根目录
  return `/wallpapers/${filename}`;
}

// --- 颜色混合工具 ---

export type RGB = { r: number; g: number; b: number };

/**
 * 将 ColorThief 返回的颜色统一转换为 RGB 数组
 * color-thief-ts 可能返回 string (HEX) 或 number[] (RGB)
 */
function formatToRgbArray(color: string | number[]): number[] {
  if (typeof color === "string") {
    // HEX 字符串转 RGB 数组
    const hex = color.startsWith("#") ? color.slice(1) : color;
    return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
  }
  if (Array.isArray(color)) {
    return color;
  }
  // 异常情况，返回黑色
  logger.warn("ColorThief 返回了未预期的颜色格式", { color });
  return [0, 0, 0];
}

/**
 * 计算颜色的感知亮度 (0-1)
 */
function calculateLuminance(rgb: number[]): number {
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * 将 HEX 颜色字符串转换为 RGB 对象。
 */
export function hexToRgb(hex: string): RGB | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}

/**
 * 将指定的混合模式应用于两种 RGB 颜色。
 * @param base - 基础颜色 {r, g, b}。
 * @param active - 要混合的活动颜色 {r, g, b}。
 * @param opacity - 活动颜色的不透明度。
 * @param mode - 混合模式。
 * @returns 混合后的结果颜色 {r, g, b}。
 */
export function applyBlendMode(base: RGB, active: RGB, opacity: number, mode: BlendMode): RGB {
  const blend = (b: number, a: number): number => {
    switch (mode) {
      case "multiply":
        return (b * a) / 255;
      case "screen":
        return 255 - ((255 - b) * (255 - a)) / 255;
      case "overlay":
        return b < 128 ? (2 * b * a) / 255 : 255 - (2 * (255 - b) * (255 - a)) / 255;
      case "darken":
        return Math.min(b, a);
      case "lighten":
        return Math.max(b, a);
      case "color-dodge":
        return a === 255 ? 255 : Math.min(255, (b * 255) / (255 - a));
      case "color-burn":
        return a === 0 ? 0 : Math.max(0, 255 - ((255 - b) * 255) / a);
      case "hard-light":
        return a < 128 ? (2 * b * a) / 255 : 255 - (2 * (255 - b) * (255 - a)) / 255;
      case "soft-light":
        return a < 128
          ? b - (1 - 2 * (a / 255)) * b * (1 - b / 255)
          : b + (2 * (a / 255) - 1) * ((b < 64 ? ((16 * b - 12) * b + 4) * b : Math.sqrt(b * 255)) - b);
      case "difference":
        return Math.abs(b - a);
      case "exclusion":
        return b + a - (2 * b * a) / 255;
      default:
        return a; // 'normal' 混合模式
    }
  };

  const blendedR = blend(base.r, active.r);
  const blendedG = blend(base.g, active.g);
  const blendedB = blend(base.b, active.b);

  // 与不透明度混合
  const r = Math.round(base.r * (1 - opacity) + blendedR * opacity);
  const g = Math.round(base.g * (1 - opacity) + blendedG * opacity);
  const b = Math.round(base.b * (1 - opacity) + blendedB * opacity);

  return { r, g, b };
}

/**
 * 获取经过颜色混合处理后的完整背景色字符串
 * 此函数会读取当前的全局外观设置，并应用颜色叠加
 * @param baseRgbVar - 基础 RGB CSS 变量名（如 '--card-bg-rgb'）
 * @param opacity - 最终不透明度
 * @returns 完整的 rgba() 颜色字符串
 */
export function getBlendedBackgroundColor(baseRgbVar: string, opacity: number): string {
  const root = document.documentElement;
  const baseRgbString = getComputedStyle(root).getPropertyValue(baseRgbVar).trim();

  if (!baseRgbString) {
    // 如果无法获取 RGB 值，返回透明色
    return `rgba(0, 0, 0, ${opacity})`;
  }

  const [r, g, b] = baseRgbString.split(",").map(Number);
  let finalRgb: RGB = { r, g, b };

  // 检查是否启用了颜色叠加
  const settings = appearanceSettings.value;
  const overlayEnabled = settings.backgroundColorOverlayEnabled ?? false;

  if (overlayEnabled) {
    // 如果开启了自动取色并且存在提取的颜色，则使用它
    const overlayColorHex =
      settings.autoExtractColorFromWallpaper && settings.wallpaperExtractedColor
        ? settings.wallpaperExtractedColor
        : (settings.backgroundColorOverlayColor ?? "#000000");
    const overlayOpacity = settings.backgroundColorOverlayOpacity ?? 0;
    const blendMode = settings.backgroundColorOverlayBlendMode ?? "normal";
    const overlayColorRgb = hexToRgb(overlayColorHex);

    if (overlayColorRgb) {
      finalRgb = applyBlendMode(finalRgb, overlayColorRgb, overlayOpacity, blendMode);
    }
  }

  return `rgba(${finalRgb.r}, ${finalRgb.g}, ${finalRgb.b}, ${opacity})`;
}

// --- 模块级状态 (单例模式) ---
const logger = createModuleLogger("ThemeAppearance");
const errorHandler = createModuleErrorHandler("ThemeAppearance");
const colorThief = new ColorThief();

const debouncedCssUpdate = debounce(
  (settings: AppearanceSettings) => {
    _updateCssVariables(settings);
  },
  50,
  { leading: false, trailing: true }
);

// 这些是运行时 UI 状态，不持久化
const appearanceSettings = ref<AppearanceSettings>(defaultAppearanceSettings);
const currentWallpaper = ref<string>("");
const isSlideshowPaused = ref(false); // 新增:幻灯片是否暂停

let slideshowTimer: number | null = null;
const wallpaperList = ref<string[]>([]); // 原始顺序列表
const shuffledList = ref<string[]>([]); // 打乱后的列表
let isInitialized = false; // 防止多次初始化
let themeObserver: MutationObserver | null = null;
let isDetachedWindow = false; // 标记当前是否为分离窗口

// --- 模块级函数 ---

// 自动保存设置的防抖函数
const debouncedSave = debounce((settingsToSave: AppearanceSettings) => {
  const appSettingsStore = useAppSettingsStore();
  appSettingsStore.update({ appearance: { ...settingsToSave } });
  logger.info("外观设置已自动保存");
}, 400);

/**
 * 更新外观设置的核心函数
 * @param updates - 要更新的设置
 * @param options - 包含 debounceUi 标志的选项，用于对 UI 更新进行防抖
 */
const updateAppearanceSetting = (updates: Partial<AppearanceSettings>, options: { debounceUi?: boolean } = {}) => {
  const newAppearance = {
    ...appearanceSettings.value,
    ...updates,
  };

  // 立即更新 ref 以触发 vue 的响应式系统（但不一定会更新 CSS）
  appearanceSettings.value = newAppearance;

  // 根据选项决定是立即更新 CSS 还是防抖更新
  if (options.debounceUi) {
    debouncedCssUpdate(newAppearance);
  } else {
    debouncedCssUpdate.cancel(); // 取消任何待定的防抖调用
    _updateCssVariables(newAppearance);
  }

  // 安排一个防抖的保存操作
  debouncedSave(newAppearance);
};

function _updateCssVariables(settings: AppearanceSettings) {
  const root = document.documentElement;

  // 根据开关状态设置窗口背景不透明度
  if (settings.enableWindowEffects) {
    root.style.setProperty(
      "--window-bg-opacity",
      String(settings.windowBackgroundOpacity ?? defaultAppearanceSettings.windowBackgroundOpacity)
    );
  } else {
    // 关闭特效时，窗口恢复不透明
    root.style.setProperty("--window-bg-opacity", "1");
  }

  if (settings.enableWallpaper && currentWallpaper.value) {
    root.style.setProperty("--wallpaper-url", `url('${currentWallpaper.value}')`);
    root.style.setProperty("--wallpaper-opacity", String(settings.wallpaperOpacity));
    root.style.setProperty("--bg-color", "transparent");
    // 如果是分离窗口，给 body 添加特殊类名以隐藏全局壁纸（body::before）
    // 但保留 --wallpaper-url 变量供组件内部使用
    if (isDetachedWindow) {
      document.body.classList.add("no-global-wallpaper");
    } else {
      document.body.classList.remove("no-global-wallpaper");
    }

    // --- 壁纸适应与平铺模式 ---
    const fit = settings.wallpaperFit ?? "cover";
    const tileOptions = {
      ...defaultAppearanceSettings.wallpaperTileOptions,
      ...settings.wallpaperTileOptions,
    };

    const wallpaperSizeMap: Record<string, string> = {
      cover: "cover",
      contain: "contain",
      fill: "100% 100%",
      // 对于平铺模式，scale 用于确定单个平铺相对于容器的大小。
      tile: `${(tileOptions.scale ?? 1.0) * 100}%`,
    };

    root.style.setProperty("--wallpaper-size", wallpaperSizeMap[fit]);
    root.style.setProperty("--wallpaper-repeat", fit === "tile" ? "repeat" : "no-repeat");

    // 对于平铺模式的变换，这些变量可以被伪元素使用。
    const scaleX = tileOptions.flipHorizontal ? -1 : 1;
    const scaleY = tileOptions.flipVertical ? -1 : 1;
    const rotation = tileOptions.rotation ?? 0;
    root.style.setProperty("--wallpaper-tile-transform", `scale(${scaleX}, ${scaleY}) rotate(${rotation}deg)`);
  } else {
    root.style.setProperty("--wallpaper-url", "none");
    root.style.setProperty("--wallpaper-opacity", "0");
    // 恢复为原始背景色
    root.style.removeProperty("--bg-color");
  }

  // --- UI 特效逻辑 ---
  if (settings.enableUiEffects) {
    const blurValue = settings.enableUiBlur ? `${settings.uiBlurIntensity}px` : "0px";
    root.style.setProperty("--ui-blur", blurValue);

    // 基础透明度 - 分离窗口现在使用 --detached-base-bg 作为底层背景，
    // 所以 --card-bg 等 UI 元素不再需要特殊处理，保持通透
    const baseOpacity = settings.uiBaseOpacity;
    const offsets = settings.layerOpacityOffsets || {};

    const calculateOpacity = (offset = 0) => Math.max(0.1, Math.min(1.0, baseOpacity + offset)).toFixed(2);

    // --- 背景色叠加逻辑 ---
    const overlayEnabled = settings.backgroundColorOverlayEnabled ?? false;
    // 如果开启了自动取色并且存在提取的颜色，则使用它
    const overlayColorHex =
      settings.autoExtractColorFromWallpaper && settings.wallpaperExtractedColor
        ? settings.wallpaperExtractedColor
        : (settings.backgroundColorOverlayColor ?? "#000000");
    const overlayOpacity = settings.backgroundColorOverlayOpacity ?? 0;
    const blendMode = settings.backgroundColorOverlayBlendMode ?? "normal";
    const overlayColorRgb = hexToRgb(overlayColorHex);

    /**
     * 计算并设置元素的最终背景色，考虑了颜色叠加
     * @param element - 'sidebar' | 'card' | 'header' | 'input' | 'container'
     * @param opacityValue - 最终的透明度
     */
    const setElementBackground = (
      element: "sidebar" | "card" | "header" | "input" | "container",
      opacityValue: string | number
    ) => {
      // 决定使用哪个基础 RGB 变量
      let baseRgbVar = "";
      switch (element) {
        case "sidebar":
          baseRgbVar = "--sidebar-bg-rgb";
          break;
        case "container":
          baseRgbVar = "--container-bg-rgb";
          break;
        case "card":
        case "header":
        case "input":
        default:
          baseRgbVar = "--card-bg-rgb";
          break;
      }

      const finalBgVar = `--${element}-bg`;
      const baseRgbString = getComputedStyle(root).getPropertyValue(baseRgbVar).trim();

      if (baseRgbString) {
        const [r, g, b] = baseRgbString.split(",").map(Number);
        let finalRgb: RGB = { r, g, b };

        if (overlayEnabled && overlayColorRgb) {
          finalRgb = applyBlendMode(finalRgb, overlayColorRgb, overlayOpacity, blendMode);
        }

        root.style.setProperty(finalBgVar, `rgba(${finalRgb.r}, ${finalRgb.g}, ${finalRgb.b}, ${opacityValue})`);
      }
    };

    const sidebarOpacityValue = calculateOpacity(offsets.sidebar);
    root.style.setProperty("--sidebar-opacity", sidebarOpacityValue);
    setElementBackground("sidebar", sidebarOpacityValue);

    const contentOpacityValue = calculateOpacity(offsets.content);
    root.style.setProperty("--content-opacity", contentOpacityValue);

    const cardOpacityValue = calculateOpacity(offsets.card);
    root.style.setProperty("--card-opacity", cardOpacityValue);
    setElementBackground("card", cardOpacityValue);
    setElementBackground("header", cardOpacityValue);
    setElementBackground("input", cardOpacityValue);

    const overlayOpacityValue = calculateOpacity(offsets.overlay);
    root.style.setProperty("--overlay-opacity", overlayOpacityValue);
    setElementBackground("container", overlayOpacityValue);

    // --- 分离窗口专用底层背景 ---
    // 这个变量用于分离窗口的最底层背景，需要较高的不透明度来支撑模糊效果
    // 壁纸会叠加在这个背景之上，而 UI 内容（使用 --card-bg）则在壁纸之上
    const detachedBaseOpacity = settings.detachedUiBaseOpacity ?? 0.85;
    const detachedBaseRgb = getComputedStyle(root).getPropertyValue("--card-bg-rgb").trim();
    if (detachedBaseRgb) {
      const [r, g, b] = detachedBaseRgb.split(",").map(Number);
      let finalRgb: RGB = { r, g, b };

      if (overlayEnabled && overlayColorRgb) {
        finalRgb = applyBlendMode(finalRgb, overlayColorRgb, overlayOpacity, blendMode);
      }

      root.style.setProperty(
        "--detached-base-bg",
        `rgba(${finalRgb.r}, ${finalRgb.g}, ${finalRgb.b}, ${detachedBaseOpacity})`
      );
    }

    root.style.setProperty("--border-opacity", String(settings.borderOpacity));

    // 代码块背景：使用独立的透明度设置
    const codeBlockOpacity = settings.codeBlockOpacity ?? defaultAppearanceSettings.codeBlockOpacity;
    root.style.setProperty("--code-block-opacity", String(codeBlockOpacity));

    // 为代码块计算完整的背景色（包含颜色混合）
    const codeBlockBgVar = "--code-block-bg";
    const codeBlockBaseRgb = getComputedStyle(root).getPropertyValue("--card-bg-rgb").trim();
    if (codeBlockBaseRgb) {
      const [r, g, b] = codeBlockBaseRgb.split(",").map(Number);
      let finalRgb: RGB = { r, g, b };

      if (overlayEnabled && overlayColorRgb) {
        finalRgb = applyBlendMode(finalRgb, overlayColorRgb, overlayOpacity, blendMode);
      }

      root.style.setProperty(codeBlockBgVar, `rgba(${finalRgb.r}, ${finalRgb.g}, ${finalRgb.b}, ${codeBlockOpacity})`);
    }

    // --- 滚动条颜色 ---
    root.style.setProperty("--scrollbar-thumb-opacity", String(settings.borderOpacity * 0.6));
    root.style.setProperty("--scrollbar-thumb-hover-opacity", String(settings.borderOpacity * 0.8));
    const trackBaseRgb =
      getComputedStyle(root).getPropertyValue("--container-bg-rgb").trim() ||
      getComputedStyle(root).getPropertyValue("--card-bg-rgb").trim();
    if (trackBaseRgb) {
      root.style.setProperty("--scrollbar-track-color", `rgba(${trackBaseRgb}, 0.1)`);
    }
  } else {
    // 禁用UI特效，恢复默认不透明样式
    root.style.setProperty("--ui-blur", "0px");
    root.style.removeProperty("--sidebar-bg");
    root.style.removeProperty("--card-bg");
    root.style.removeProperty("--header-bg");
    root.style.removeProperty("--input-bg");
    root.style.removeProperty("--vscode-editor-background");
    root.style.removeProperty("--vscode-editorGutter-background");
    root.style.removeProperty("--container-bg");
    root.style.removeProperty("--code-block-bg");
    root.style.setProperty("--sidebar-opacity", "1");
    root.style.setProperty("--content-opacity", "1");
    root.style.setProperty("--card-opacity", "1");
    root.style.setProperty("--overlay-opacity", "1");
    root.style.setProperty("--border-opacity", "1");
    root.style.removeProperty("--code-block-opacity");
    root.style.removeProperty("--scrollbar-thumb-opacity");
    root.style.removeProperty("--scrollbar-thumb-hover-opacity");
    root.style.removeProperty("--scrollbar-track-color");
  }

  logger.debug("CSS 变量已更新", { settings });
}

function _stopSlideshow() {
  if (slideshowTimer) {
    clearInterval(slideshowTimer);
    slideshowTimer = null;
    logger.info("幻灯片定时器已停止");
  }
}

async function _switchToWallpaper(index: number, settings: AppearanceSettings) {
  const list = settings.wallpaperSlideshowShuffle ? shuffledList.value : wallpaperList.value;
  if (index < 0 || index >= list.length) {
    logger.warn(`无效的壁纸索引: ${index}`);
    return;
  }

  const imagePath = list[index];
  try {
    // 如果是内置壁纸 URL，直接使用；否则进行路径转换
    if (imagePath.startsWith("/wallpapers/")) {
      currentWallpaper.value = imagePath;
    } else {
      currentWallpaper.value = convertFileSrc(imagePath);
    }
    _updateCssVariables(settings);

    // 更新并保存当前索引
    if (appearanceSettings.value.wallpaperSlideshowCurrentIndex !== index) {
      const updates: Partial<AppearanceSettings> = {
        wallpaperSlideshowCurrentIndex: index,
      };

      // 同步更新专用索引字段 (记忆功能)
      const source = settings.wallpaperSource ?? "builtin";
      if (source === "builtin") {
        updates.builtinWallpaperSlideshowIndex = index;
      } else {
        updates.customWallpaperSlideshowIndex = index;
      }

      // 直接调用模块级的更新函数，避免递归调用
      updateAppearanceSetting(updates);
    }
    logger.debug("幻灯片切换", { index, path: imagePath });

    // 如果开启了自动取色，从新壁纸提取颜色
    if (settings.autoExtractColorFromWallpaper && currentWallpaper.value) {
      const extractedColor = await _extractColorFromWallpaper(currentWallpaper.value);
      if (extractedColor) {
        updateAppearanceSetting({
          wallpaperExtractedColor: extractedColor,
          backgroundColorOverlayEnabled: true,
        });
      }
    }
  } catch (error) {
    errorHandler.warn(error, `转换壁纸路径失败: ${imagePath}`, {
      operation: "转换壁纸路径",
      path: imagePath,
    });
  }
}

async function _startSlideshow(settings: AppearanceSettings) {
  _stopSlideshow();
  const { wallpaperSlideshowPath, wallpaperSlideshowInterval, wallpaperSlideshowShuffle, wallpaperSource } = settings;

  // 确定壁纸来源
  const source = wallpaperSource ?? "builtin";

  try {
    if (source === "builtin") {
      // 内置壁纸模式：直接使用内置列表
      wallpaperList.value = BUILTIN_WALLPAPERS.map((w) => getBuiltinWallpaperUrl(w.filename));
      logger.info("加载内置轮播列表", { count: wallpaperList.value.length });
    } else {
      // 自定义模式：扫描目录
      if (!wallpaperSlideshowPath) {
        logger.warn("幻灯片目录路径为空，无法启动");
        wallpaperList.value = [];
        shuffledList.value = [];
        return;
      }

      wallpaperList.value = await invoke<string[]>("list_directory_images", {
        directory: wallpaperSlideshowPath,
      });
    }

    if (wallpaperList.value.length > 0) {
      shuffledList.value = shuffle(wallpaperList.value); // 总是预先生成随机列表

      logger.info("幻灯片已启动", {
        imageCount: wallpaperList.value.length,
        interval: wallpaperSlideshowInterval,
        shuffle: wallpaperSlideshowShuffle,
      });

      const playNext = () => {
        if (isSlideshowPaused.value) return;
        const list = appearanceSettings.value.wallpaperSlideshowShuffle ? shuffledList.value : wallpaperList.value;
        const currentIndex = appearanceSettings.value.wallpaperSlideshowCurrentIndex ?? 0;
        const nextIndex = (currentIndex + 1) % list.length;
        _switchToWallpaper(nextIndex, appearanceSettings.value);
      };

      // 恢复到上次的索引 (根据来源读取对应的记忆索引)
      let initialIndex = 0;
      if (source === "builtin") {
        initialIndex = settings.builtinWallpaperSlideshowIndex ?? 0;
      } else {
        initialIndex = settings.customWallpaperSlideshowIndex ?? 0;
      }

      // 越界检查 (防止列表变动导致索引无效)
      const list = settings.wallpaperSlideshowShuffle ? shuffledList.value : wallpaperList.value;
      if (initialIndex >= list.length) {
        logger.warn("保存的轮播索引越界，已重置为 0", {
          source,
          savedIndex: initialIndex,
          listLength: list.length,
        });
        initialIndex = 0;
      }

      _switchToWallpaper(initialIndex, settings);

      // 启动定时器
      if (settings.enableWallpaper && wallpaperSlideshowInterval > 0) {
        slideshowTimer = window.setInterval(playNext, wallpaperSlideshowInterval * 60 * 1000);
      }
    } else {
      logger.warn("幻灯片列表为空", { source, path: wallpaperSlideshowPath });
      wallpaperList.value = [];
      shuffledList.value = [];
    }
  } catch (error) {
    errorHandler.error(error, "启动幻灯片失败", {
      operation: "启动幻灯片",
      source,
      path: wallpaperSlideshowPath,
    });
  }
}

async function _extractColorFromWallpaper(wallpaperUrl: string): Promise<string | null> {
  const { isDark } = useTheme(); // 获取当前主题状态

  try {
    const img = new Image();
    img.crossOrigin = "Anonymous";

    return new Promise((resolve) => {
      img.onload = () => {
        try {
          // 获取调色板，而不是单一颜色
          const rawPalette = colorThief.getPalette(img, 5);
          if (!rawPalette || rawPalette.length === 0) {
            logger.warn("无法从壁纸获取调色板");
            resolve(null);
            return;
          }

          // 统一格式为 RGB 数组
          const palette = (rawPalette as (string | number[])[]).map(formatToRgbArray);

          // 根据亮度排序
          const sortedPalette = palette
            .map((color) => ({ color, luminance: calculateLuminance(color) }))
            .sort((a, b) => a.luminance - b.luminance);

          let selectedColorRgb: number[];

          // 姐姐说得对，不能闪瞎眼。暗色模式用较暗的颜色，亮色模式用较亮的颜色。
          if (isDark.value) {
            // 暗色模式：选择第二暗的颜色，如果只有一个颜色就选最暗的
            selectedColorRgb = sortedPalette[1]?.color ?? sortedPalette[0].color;
          } else {
            // 亮色模式：选择第二亮的颜色，如果只有一个颜色就选最亮的
            selectedColorRgb =
              sortedPalette[sortedPalette.length - 2]?.color ?? sortedPalette[sortedPalette.length - 1].color;
          }

          const hexColor = `#${selectedColorRgb.map((c) => c.toString(16).padStart(2, "0")).join("")}`;

          if (hexColor) {
            logger.info("从壁纸智能提取颜色成功", {
              color: hexColor,
              theme: isDark.value ? "dark" : "light",
            });
            resolve(hexColor);
          } else {
            resolve(null);
          }
        } catch (error) {
          errorHandler.warn(error, "提取壁纸颜色时发生错误", {
            operation: "提取壁纸颜色",
          });
          resolve(null);
        }
      };

      img.onerror = () => {
        logger.warn("加载壁纸图片失败，无法提取颜色");
        resolve(null);
      };

      img.src = wallpaperUrl;
    });
  } catch (error) {
    errorHandler.warn(error, "提取壁纸颜色失败", {
      operation: "提取壁纸颜色",
    });
    return null;
  }
}

async function _updateWallpaper(settings: AppearanceSettings, oldSettings?: AppearanceSettings) {
  _stopSlideshow(); // 默认先停止旧的轮播

  // 检查模式是否从静态切换到幻灯片以防止闪烁
  const modeJustSwitchedToSlideshow =
    oldSettings && settings.wallpaperMode === "slideshow" && oldSettings.wallpaperMode !== "slideshow";

  if (settings.wallpaperMode === "static") {
    // 处理静态壁纸（内置或自定义）
    try {
      let wallpaperUrl = "";
      const source = settings.wallpaperSource ?? "builtin";

      if (source === "builtin") {
        const filename = settings.builtinWallpaperName || BUILTIN_WALLPAPERS[0].filename;
        wallpaperUrl = getBuiltinWallpaperUrl(filename);
        logger.info("加载内置壁纸", { filename, url: wallpaperUrl });
      } else if (settings.wallpaperPath) {
        wallpaperUrl = convertFileSrc(settings.wallpaperPath);
        logger.info("加载自定义壁纸", { path: settings.wallpaperPath, url: wallpaperUrl });
      }

      if (wallpaperUrl) {
        wallpaperList.value = []; // 清空列表
        shuffledList.value = [];
        currentWallpaper.value = wallpaperUrl;
        logger.info("静态壁纸加载成功");

        // 如果开启了自动取色，从壁纸提取颜色
        if (settings.autoExtractColorFromWallpaper && currentWallpaper.value) {
          const extractedColor = await _extractColorFromWallpaper(currentWallpaper.value);
          if (extractedColor) {
            updateAppearanceSetting({
              wallpaperExtractedColor: extractedColor,
              backgroundColorOverlayEnabled: true, // 自动启用颜色叠加
            });
          }
        }
      } else {
        // 如果是自定义模式但没有路径，或者其他异常情况
        currentWallpaper.value = "";
        logger.warn("未找到有效的壁纸路径");
      }
    } catch (error) {
      errorHandler.error(error, "加载静态壁纸失败", {
        operation: "加载静态壁纸",
        settings,
      });
      currentWallpaper.value = "";
    }
  } else if (settings.wallpaperMode === "slideshow") {
    // 切换到轮播模式时，立即清除当前壁纸，防止显示旧的静态壁纸
    // 仅在刚刚切换到幻灯片模式时清除。
    if (modeJustSwitchedToSlideshow) {
      currentWallpaper.value = "";
    }
    // 无论是 builtin 还是 custom，都由 _startSlideshow 内部处理
    await _startSlideshow(settings);
  } else {
    // 如果当前模式没有设置路径，则清除壁纸
    currentWallpaper.value = "";
    wallpaperList.value = [];
    shuffledList.value = [];
    logger.info("当前壁纸模式无有效路径，壁纸已清除");
  }
  _updateCssVariables(settings);
}

async function _applyWindowEffect(effect: WindowEffect, enabled: boolean) {
  const finalEffect = enabled ? effect : "none";
  try {
    await invoke("apply_window_effect", { effect: finalEffect });
    logger.info("窗口特效已应用", { effect: finalEffect });
  } catch (error) {
    errorHandler.warn(error, `应用窗口特效失败: ${finalEffect}`, {
      operation: "应用窗口特效",
      effect: finalEffect,
    });
  }
}

// --- 导出的初始化和清理函数 ---

/**
 * 初始化主题外观逻辑
 * 应该在 App.vue 中调用一次
 * @param isDetached - 是否为分离窗口（分离窗口将禁用根元素壁纸，防止双重显示）
 */
export async function initThemeAppearance(isDetached = false) {
  if (isInitialized) {
    logger.warn("主题外观已经初始化，跳过重复初始化");
    return;
  }
  isInitialized = true;
  isDetachedWindow = isDetached;

  const { isDark } = useTheme();

  try {
    // 加载设置
    const appSettingsStore = useAppSettingsStore();
    // 确保已经加载
    if (!appSettingsStore.isLoaded) {
      await appSettingsStore.load();
    }

    const settings = appSettingsStore.settings;
    if (settings.appearance) {
      appearanceSettings.value = { ...settings.appearance };
      logger.info("外观设置已加载", settings.appearance);

      // 初始化设置
      await _updateWallpaper(appearanceSettings.value);
      _updateCssVariables(appearanceSettings.value);
      // 总是应用窗口特效设置，即使是 'none'
      await _applyWindowEffect(
        appearanceSettings.value.windowEffect,
        appearanceSettings.value.enableWindowEffects ?? true
      );
    }

    // 监听主题变化（亮/暗模式切换），如果开启了自动取色，则重新提取适合当前主题的颜色
    watch(isDark, async () => {
      const settings = appearanceSettings.value;
      if (settings.autoExtractColorFromWallpaper && currentWallpaper.value) {
        logger.info("主题已切换，重新提取适合当前主题的壁纸颜色...");
        const extractedColor = await _extractColorFromWallpaper(currentWallpaper.value);
        if (extractedColor) {
          updateAppearanceSetting({
            wallpaperExtractedColor: extractedColor,
          });
        }
      }
    });

    // 监听设置变化并更新 UI
    watch(
      appearanceSettings,
      async (newSettings, oldSettings) => {
        if (!newSettings) return;

        logger.debug("外观设置变化", { newSettings, oldSettings });

        const old = oldSettings || defaultAppearanceSettings;

        // 检查是否需要重新加载壁纸系统（涉及文件列表扫描等重操作）
        const shouldReloadWallpaper =
          newSettings.enableWallpaper !== old.enableWallpaper ||
          newSettings.wallpaperMode !== old.wallpaperMode ||
          newSettings.wallpaperSource !== old.wallpaperSource ||
          newSettings.builtinWallpaperName !== old.builtinWallpaperName ||
          newSettings.wallpaperPath !== old.wallpaperPath ||
          newSettings.wallpaperSlideshowPath !== old.wallpaperSlideshowPath ||
          newSettings.wallpaperSlideshowInterval !== old.wallpaperSlideshowInterval;

        if (shouldReloadWallpaper) {
          await _updateWallpaper(newSettings, old);
        } else if (
          newSettings.wallpaperMode === "slideshow" &&
          newSettings.wallpaperSlideshowCurrentIndex !== old.wallpaperSlideshowCurrentIndex
        ) {
          // 如果只是轮播索引变化，直接切换壁纸，避免重新扫描目录
          await _switchToWallpaper(newSettings.wallpaperSlideshowCurrentIndex ?? 0, newSettings);
        }

        // 如果自动取色开关发生变化，且当前有壁纸，则重新提取颜色
        if (
          newSettings.autoExtractColorFromWallpaper !== old.autoExtractColorFromWallpaper &&
          newSettings.autoExtractColorFromWallpaper &&
          currentWallpaper.value
        ) {
          const extractedColor = await _extractColorFromWallpaper(currentWallpaper.value);
          if (extractedColor) {
            updateAppearanceSetting({
              wallpaperExtractedColor: extractedColor,
              backgroundColorOverlayEnabled: true,
            });
          }
        }

        if (
          newSettings.windowEffect !== old.windowEffect ||
          (newSettings.enableWindowEffects ?? true) !== (old.enableWindowEffects ?? true)
        ) {
          await _applyWindowEffect(newSettings.windowEffect, newSettings.enableWindowEffects ?? true);
        }
      },
      { deep: true }
    );

    // 监听根元素 class 的变化（例如主题切换），并重新应用 CSS 变量
    themeObserver = new MutationObserver(() => {
      logger.debug("根元素上的主题类已更改，正在重新应用外观 CSS 变量");
      _updateCssVariables(appearanceSettings.value);
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    logger.info("主题外观初始化完成");
  } catch (error) {
    errorHandler.error(error, "初始化主题外观失败", {
      operation: "初始化主题外观",
    });
  }
}

/**
 * 清理主题外观资源
 * 应该在 App.vue 的 onUnmounted 中调用
 */
export function cleanupThemeAppearance() {
  _stopSlideshow();
  if (themeObserver) {
    themeObserver.disconnect();
    themeObserver = null;
  }
  isInitialized = false;
  logger.info("主题外观资源已清理");
}

/**
 * Composable：供组件使用的主题外观接口
 */
export function useThemeAppearance() {
  /**
   * 选择壁纸图片
   */
  const selectWallpaper = async () => {
    try {
      const selected = await open({
        multiple: false,
        title: "选择壁纸图片",
        filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "avif"] }],
      });

      if (typeof selected === "string") {
        updateAppearanceSetting({
          wallpaperPath: selected,
          wallpaperMode: "static",
          wallpaperSource: "custom", // 自动切换到自定义模式
        });
        logger.info("壁纸已选择", { path: selected });
      }
    } catch (error) {
      errorHandler.error(error, "选择壁纸失败", {
        operation: "选择壁纸",
      });
    }
  };

  /**
   * 选择内置壁纸
   */
  const selectBuiltinWallpaper = (filename: string) => {
    const settings = appearanceSettings.value;
    const targetUrl = getBuiltinWallpaperUrl(filename);

    // 如果当前已经在内置轮播模式，则尝试在当前列表中跳转，保持轮播状态
    if (settings.wallpaperMode === "slideshow" && settings.wallpaperSource === "builtin") {
      const list = settings.wallpaperSlideshowShuffle ? shuffledList.value : wallpaperList.value;
      const index = list.indexOf(targetUrl);

      if (index !== -1) {
        updateAppearanceSetting({
          wallpaperSlideshowCurrentIndex: index,
          // 同时更新记忆索引，以便下次启动时记住这张
          builtinWallpaperSlideshowIndex: index,
        });
        logger.info("已在轮播模式下跳转到指定壁纸", { filename, index });
        return;
      }
    }

    // 其他情况（静态模式，或从自定义模式切换过来），切换到静态模式
    updateAppearanceSetting({
      builtinWallpaperName: filename,
      wallpaperMode: "static",
      wallpaperSource: "builtin",
    });
    logger.info("已选择内置壁纸", { filename });
  };

  /**
   * 选择壁纸目录（用于幻灯片）
   */
  const selectWallpaperDirectory = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "选择壁纸目录",
      });

      if (typeof selected === "string") {
        updateAppearanceSetting({
          wallpaperSlideshowPath: selected,
          wallpaperMode: "slideshow",
          wallpaperSource: "custom", // 自动切换到自定义模式
          wallpaperSlideshowCurrentIndex: 0, // 重置索引
        });
        logger.info("壁纸目录已选择", { path: selected });
      }
    } catch (error) {
      errorHandler.error(error, "选择壁纸目录失败", {
        operation: "选择壁纸目录",
      });
    }
  };

  /**
   * 清除壁纸
   */
  const clearWallpaper = () => {
    try {
      // 清除两个路径以确保完全干净
      updateAppearanceSetting({
        wallpaperPath: "",
        wallpaperSlideshowPath: "",
        enableWallpaper: true,
        wallpaperSlideshowCurrentIndex: 0,
      });
      logger.info("壁纸已清除");
    } catch (error) {
      errorHandler.error(error, "清除壁纸失败", {
        operation: "清除壁纸",
      });
    }
  };

  // --- 幻灯片控制函数 ---
  const playNextWallpaper = () => {
    const list = appearanceSettings.value.wallpaperSlideshowShuffle ? shuffledList.value : wallpaperList.value;
    if (list.length === 0) return;
    const currentIndex = appearanceSettings.value.wallpaperSlideshowCurrentIndex ?? 0;
    const nextIndex = (currentIndex + 1) % list.length;
    _switchToWallpaper(nextIndex, appearanceSettings.value);
  };

  const playPreviousWallpaper = () => {
    const list = appearanceSettings.value.wallpaperSlideshowShuffle ? shuffledList.value : wallpaperList.value;
    if (list.length === 0) return;
    const currentIndex = appearanceSettings.value.wallpaperSlideshowCurrentIndex ?? 0;
    const prevIndex = (currentIndex - 1 + list.length) % list.length;
    _switchToWallpaper(prevIndex, appearanceSettings.value);
  };

  const switchToWallpaper = (index: number) => {
    _switchToWallpaper(index, appearanceSettings.value);
  };

  const toggleSlideshowPlayback = () => {
    isSlideshowPaused.value = !isSlideshowPaused.value;
    logger.info(`幻灯片播放已 ${isSlideshowPaused.value ? "暂停" : "恢复"}`);
  };

  const toggleShuffle = () => {
    const currentShuffle = appearanceSettings.value.wallpaperSlideshowShuffle ?? false;
    const newShuffle = !currentShuffle;

    // 智能切换：保持当前图片不变
    const currentIndex = appearanceSettings.value.wallpaperSlideshowCurrentIndex ?? 0;
    const currentList = currentShuffle ? shuffledList.value : wallpaperList.value;
    const currentImagePath = currentList[currentIndex];

    const newList = newShuffle ? shuffledList.value : wallpaperList.value;
    const newIndex = newList.indexOf(currentImagePath);

    updateAppearanceSetting({
      wallpaperSlideshowShuffle: newShuffle,
      wallpaperSlideshowCurrentIndex: newIndex >= 0 ? newIndex : 0,
    });
    logger.info(`随机播放已 ${newShuffle ? "开启" : "关闭"}`);
  };

  const reshuffle = () => {
    // 按钮的 disabled 状态保证了 isShuffleEnabled (wallpaperSlideshowShuffle) 为 true
    if (wallpaperList.value.length > 0) {
      const currentIndex = appearanceSettings.value.wallpaperSlideshowCurrentIndex ?? 0;
      // 索引越界是可能的，例如在文件列表更改后。添加一个保护。
      if (currentIndex >= shuffledList.value.length) {
        shuffledList.value = shuffle(wallpaperList.value);
        _switchToWallpaper(0, appearanceSettings.value);
        logger.info("壁纸列表已重新洗牌（检测到索引越界）");
        return;
      }
      const currentImagePath = shuffledList.value[currentIndex];

      // 重新洗牌
      shuffledList.value = shuffle(wallpaperList.value);

      // 在新列表中找到旧壁纸的位置
      const newIndex = shuffledList.value.indexOf(currentImagePath);

      // 切换到该位置，如果找不到（例如图片被删除），则切换到列表头部
      _switchToWallpaper(newIndex >= 0 ? newIndex : 0, appearanceSettings.value);
      logger.info("壁纸列表已重新洗牌，并保持当前壁纸");
    }
  };

  const refreshWallpaperList = async () => {
    await _startSlideshow(appearanceSettings.value);
    logger.info("壁纸列表已刷新");
  };

  /**
   * 手动从当前壁纸提取颜色
   */
  const extractColorFromCurrentWallpaper = async () => {
    if (!currentWallpaper.value) {
      logger.warn("当前没有壁纸，无法提取颜色");
      return;
    }

    try {
      const extractedColor = await _extractColorFromWallpaper(currentWallpaper.value);
      if (extractedColor) {
        updateAppearanceSetting({
          backgroundColorOverlayColor: extractedColor,
          backgroundColorOverlayEnabled: true,
        });
        logger.info("手动提取壁纸颜色成功", { color: extractedColor });
      }
    } catch (error) {
      errorHandler.error(error, "手动提取壁纸颜色失败", {
        operation: "手动提取壁纸颜色",
      });
    }
  };

  return {
    appearanceSettings: computed(() => appearanceSettings.value),
    currentWallpaper: computed(() => currentWallpaper.value),
    currentWallpaperList: computed(() =>
      appearanceSettings.value.wallpaperSlideshowShuffle ? shuffledList.value : wallpaperList.value
    ),
    isSlideshowPaused: computed(() => isSlideshowPaused.value),
    isShuffleEnabled: computed(() => appearanceSettings.value.wallpaperSlideshowShuffle ?? false),

    updateAppearanceSetting,
    selectWallpaper,
    selectBuiltinWallpaper,
    selectWallpaperDirectory,
    clearWallpaper,

    // 幻灯片控制
    playNextWallpaper,
    playPreviousWallpaper,
    switchToWallpaper,
    toggleSlideshowPlayback,
    toggleShuffle,
    reshuffle,
    refreshWallpaperList,

    // 颜色提取
    extractColorFromCurrentWallpaper,
  };
}
