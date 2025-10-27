import { createModuleLogger } from "./logger";
import { useDark } from "@vueuse/core";

const logger = createModuleLogger("ThemeColors");
const isDark = useDark();

/**
 * 颜色处理工具函数 - 将十六进制颜色转换为 RGB 对象
 */
export const hexToRgb = (hex: string) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
};

/**
 * 颜色处理工具函数 - 将颜色变亮指定百分比
 */
export const lightenColor = (hex: string, percent: number) => {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;

  const r = Math.min(255, Math.floor(rgb.r + (255 - rgb.r) * (percent / 100)));
  const g = Math.min(255, Math.floor(rgb.g + (255 - rgb.g) * (percent / 100)));
  const b = Math.min(255, Math.floor(rgb.b + (255 - rgb.b) * (percent / 100)));

  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
};

/**
 * 颜色处理工具函数 - 将颜色变暗指定百分比
 */
export const darkenColor = (hex: string, percent: number) => {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;

  const r = Math.max(0, Math.floor(rgb.r * (1 - percent / 100)));
  const g = Math.max(0, Math.floor(rgb.g * (1 - percent / 100)));
  const b = Math.max(0, Math.floor(rgb.b * (1 - percent / 100)));

  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
};

/**
 * 应用主题色系统到 DOM
 */
export const applyThemeColors = (colors: {
  primary?: string;
  success?: string;
  warning?: string;
  danger?: string;
  info?: string;
}) => {
  const root = document.documentElement;
  
  // 根据当前主题选择颜色调整函数
  // 暗色模式下使用 darkenColor（让颜色更暗），亮色模式下使用 lightenColor（让颜色更浅）
  const adjustColor = isDark.value ? darkenColor : lightenColor;

  // 应用主色调
  if (colors.primary && /^#[0-9A-F]{6}$/i.test(colors.primary)) {
    root.style.setProperty("--primary-color", colors.primary);
    const hoverColor = adjustColor(colors.primary, 20);
    root.style.setProperty("--primary-hover-color", hoverColor);
    const rgb = hexToRgb(colors.primary);
    if (rgb) {
      root.style.setProperty("--primary-color-rgb", `${rgb.r}, ${rgb.g}, ${rgb.b}`);
    }
    root.style.setProperty("--el-color-primary", colors.primary);
    root.style.setProperty("--el-color-primary-light-3", adjustColor(colors.primary, 30));
    root.style.setProperty("--el-color-primary-light-5", adjustColor(colors.primary, 50));
    root.style.setProperty("--el-color-primary-light-7", adjustColor(colors.primary, 70));
    root.style.setProperty("--el-color-primary-light-9", adjustColor(colors.primary, 90));
  }

  // 应用成功色
  if (colors.success && /^#[0-9A-F]{6}$/i.test(colors.success)) {
    root.style.setProperty("--el-color-success", colors.success);
    root.style.setProperty("--el-color-success-light-3", adjustColor(colors.success, 30));
    root.style.setProperty("--el-color-success-light-5", adjustColor(colors.success, 50));
    root.style.setProperty("--el-color-success-light-7", adjustColor(colors.success, 70));
    root.style.setProperty("--el-color-success-light-9", adjustColor(colors.success, 90));
  }

  // 应用警告色
  if (colors.warning && /^#[0-9A-F]{6}$/i.test(colors.warning)) {
    root.style.setProperty("--el-color-warning", colors.warning);
    root.style.setProperty("--el-color-warning-light-3", adjustColor(colors.warning, 30));
    root.style.setProperty("--el-color-warning-light-5", adjustColor(colors.warning, 50));
    root.style.setProperty("--el-color-warning-light-7", adjustColor(colors.warning, 70));
    root.style.setProperty("--el-color-warning-light-9", adjustColor(colors.warning, 90));
  }

  // 应用危险色
  if (colors.danger && /^#[0-9A-F]{6}$/i.test(colors.danger)) {
    root.style.setProperty("--el-color-danger", colors.danger);
    root.style.setProperty("--el-color-danger-light-3", adjustColor(colors.danger, 30));
    root.style.setProperty("--el-color-danger-light-5", adjustColor(colors.danger, 50));
    root.style.setProperty("--el-color-danger-light-7", adjustColor(colors.danger, 70));
    root.style.setProperty("--el-color-danger-light-9", adjustColor(colors.danger, 90));
  }

  // 应用信息色
  if (colors.info && /^#[0-9A-F]{6}$/i.test(colors.info)) {
    root.style.setProperty("--el-color-info", colors.info);
    root.style.setProperty("--el-color-info-light-3", adjustColor(colors.info, 30));
    root.style.setProperty("--el-color-info-light-5", adjustColor(colors.info, 50));
    root.style.setProperty("--el-color-info-light-7", adjustColor(colors.info, 70));
    root.style.setProperty("--el-color-info-light-9", adjustColor(colors.info, 90));
  }

  // 缓存到 localStorage 以避免下次启动时的闪烁
  try {
    if (colors.primary) localStorage.setItem("app-theme-color", colors.primary);
    if (colors.success) localStorage.setItem("app-success-color", colors.success);
    if (colors.warning) localStorage.setItem("app-warning-color", colors.warning);
    if (colors.danger) localStorage.setItem("app-danger-color", colors.danger);
    if (colors.info) localStorage.setItem("app-info-color", colors.info);
  } catch (error) {
    logger.warn("缓存主题色到 localStorage 失败", { colors, error });
  }
};