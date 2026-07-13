// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

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

// --- OKLCH 色彩空间处理 ---

/**
 * OKLCH 颜色对象
 */
export interface OKLCH {
  l: number; // Lightness (0-1)
  c: number; // Chroma (0-0.4)
  h: number; // Hue (0-360)
}

/**
 * 将 HEX 转换为 OKLCH
 * 算法参考: https://bottosson.github.io/posts/oklab/
 */
export const hexToOklch = (hex: string): OKLCH | null => {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;

  // 1. sRGB to Linear sRGB
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;

  const toLinear = (c: number) =>
    c > 0.04045 ? Math.pow((c + 0.055) / 1.055, 2.4) : c / 12.92;
  const lr = toLinear(r);
  const lg = toLinear(g);
  const lb = toLinear(b);

  // 2. Linear sRGB to LMS
  const l_ = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
  const m_ = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
  const s_ = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;

  // 3. LMS to Oklab
  const l_root = Math.cbrt(l_);
  const m_root = Math.cbrt(m_);
  const s_root = Math.cbrt(s_);

  const lab_l =
    0.2104542553 * l_root + 0.793617785 * m_root - 0.0040720401 * s_root;
  const lab_a =
    1.9779984951 * l_root - 2.428592205 * m_root + 0.4505937099 * s_root;
  const lab_b =
    0.0259040371 * l_root + 0.7827717662 * m_root - 0.808675766 * s_root;

  // 4. Oklab to OKLCH
  const chroma = Math.sqrt(lab_a * lab_a + lab_b * lab_b);
  let hue = (Math.atan2(lab_b, lab_a) * 180) / Math.PI;
  if (hue < 0) hue += 360;

  return { l: lab_l, c: chroma, h: hue };
};

/**
 * 将 OKLCH 转换为 HEX
 */
export const oklchToHex = (oklch: OKLCH): string => {
  const { l, c, h } = oklch;
  const h_rad = (h * Math.PI) / 180;
  const lab_a = c * Math.cos(h_rad);
  const lab_b = c * Math.sin(h_rad);

  // 1. Oklab to LMS
  const l_ = Math.pow(l + 0.3963377774 * lab_a + 0.2158037573 * lab_b, 3);
  const m_ = Math.pow(l - 0.1055613458 * lab_a - 0.0638541728 * lab_b, 3);
  const s_ = Math.pow(l - 0.0894841775 * lab_a - 1.291485548 * lab_b, 3);

  // 2. LMS to Linear sRGB
  const lr = +4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_;
  const lg = -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_;
  const lb = -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_;

  // 3. Linear sRGB to sRGB
  const toSRGB = (comp: number) =>
    Math.max(
      0,
      Math.min(
        255,
        Math.round(
          255 *
            (comp <= 0.0031308
              ? 12.92 * comp
              : 1.055 * Math.pow(comp, 1 / 2.4) - 0.055)
        )
      )
    );

  const resR = toSRGB(lr);
  const resG = toSRGB(lg);
  const resB = toSRGB(lb);

  return `#${((1 << 24) + (resR << 16) + (resG << 8) + resB).toString(16).slice(1)}`;
};

/**
 * 使用 OKLCH 算法修正颜色，使其符合感知亮度和彩度的安全范围
 * @param hex 原始 HEX 颜色
 * @param isDark 是否为暗色模式
 */
export const harmonizeColorOKLCH = (hex: string, isDark: boolean): string => {
  const oklch = hexToOklch(hex);
  if (!oklch) return hex;

  // 1. 修正感知亮度 (L)
  // 亮色模式：0.45 - 0.60 (保证在白底上的对比度)
  // 暗色模式：0.70 - 0.85 (保证在黑底上的发光感)
  const minL = isDark ? 0.7 : 0.45;
  const maxL = isDark ? 0.85 : 0.6;
  const harmonizedL = Math.max(minL, Math.min(maxL, oklch.l));

  // 2. 修正彩度 (C)
  // 0.10 - 0.25 (保证颜色不脏且不刺眼)
  const harmonizedC = Math.max(0.1, Math.min(0.25, oklch.c));

  const result = oklchToHex({
    l: harmonizedL,
    c: harmonizedC,
    h: oklch.h,
  });

  logger.debug("OKLCH 颜色修正", {
    before: hex,
    after: result,
    beforeLCH: oklch,
    isDark,
  });

  return result;
};

/**
 * 应用主题色系统到 DOM
 */
export const applyThemeColors = (
  colors: {
    primary?: string;
    success?: string;
    warning?: string;
    danger?: string;
    info?: string;
  },
  darkOverride?: boolean
) => {
  // 优先使用传入的 darkOverride，否则使用 useDark 的实时值
  const activeIsDark = darkOverride !== undefined ? darkOverride : isDark.value;

  const root = document.documentElement;

  // 派生颜色根据主题模式调整：亮色模式变亮，暗色模式变暗
  const adjustColor = activeIsDark ? darkenColor : lightenColor;

  // 应用主色调
  if (colors.primary && /^#[0-9A-F]{6}$/i.test(colors.primary)) {
    root.style.setProperty("--primary-color", colors.primary);
    const rgb = hexToRgb(colors.primary);
    if (rgb) {
      root.style.setProperty(
        "--primary-color-rgb",
        `${rgb.r}, ${rgb.g}, ${rgb.b}`
      );
    }
    root.style.setProperty("--el-color-primary", colors.primary);
    for (let i = 1; i <= 9; i++) {
      root.style.setProperty(
        `--el-color-primary-light-${i}`,
        adjustColor(colors.primary, i * 10)
      );
    }

    // hover 颜色根据当前主题模式调整
    const hoverAdjustFn = activeIsDark ? lightenColor : darkenColor;
    const hoverColor = hoverAdjustFn(colors.primary, 20);
    root.style.setProperty("--primary-hover-color", hoverColor);
  }

  // 应用成功色
  if (colors.success && /^#[0-9A-F]{6}$/i.test(colors.success)) {
    root.style.setProperty("--el-color-success", colors.success);
    for (let i = 1; i <= 9; i++) {
      root.style.setProperty(
        `--el-color-success-light-${i}`,
        adjustColor(colors.success, i * 10)
      );
    }
  }

  // 应用警告色
  if (colors.warning && /^#[0-9A-F]{6}$/i.test(colors.warning)) {
    root.style.setProperty("--el-color-warning", colors.warning);
    for (let i = 1; i <= 9; i++) {
      root.style.setProperty(
        `--el-color-warning-light-${i}`,
        adjustColor(colors.warning, i * 10)
      );
    }
  }

  // 应用危险色
  if (colors.danger && /^#[0-9A-F]{6}$/i.test(colors.danger)) {
    root.style.setProperty("--el-color-danger", colors.danger);
    for (let i = 1; i <= 9; i++) {
      root.style.setProperty(
        `--el-color-danger-light-${i}`,
        adjustColor(colors.danger, i * 10)
      );
    }
  }

  // 应用信息色
  if (colors.info && /^#[0-9A-F]{6}$/i.test(colors.info)) {
    root.style.setProperty("--el-color-info", colors.info);
    for (let i = 1; i <= 9; i++) {
      root.style.setProperty(
        `--el-color-info-light-${i}`,
        adjustColor(colors.info, i * 10)
      );
    }
  }

  // 缓存到 localStorage 以避免下次启动时的闪烁
  try {
    if (colors.primary) localStorage.setItem("app-theme-color", colors.primary);
    if (colors.success)
      localStorage.setItem("app-success-color", colors.success);
    if (colors.warning)
      localStorage.setItem("app-warning-color", colors.warning);
    if (colors.danger) localStorage.setItem("app-danger-color", colors.danger);
    if (colors.info) localStorage.setItem("app-info-color", colors.info);
  } catch (error) {
    logger.warn("缓存主题色到 localStorage 失败", { colors, error });
  }
};
