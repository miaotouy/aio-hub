import { computed } from 'vue';
import type { ColorFormat } from '../colorPicker.store';

/**
 * RGB 颜色对象
 */
export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

/**
 * HSL 颜色对象
 */
export interface HslColor {
  h: number; // 0-360
  s: number; // 0-100
  l: number; // 0-100
}

/**
 * 颜色转换工具 Composable
 * @param color 输入颜色，可以是 HEX 字符串或 RGB 对象
 * @param format 目标格式
 */
export function useColorConverter(color: string | RgbColor, format: ColorFormat) {
  /**
   * 将颜色转换为 RGB 对象
   */
  const toRgb = computed((): RgbColor => {
    if (typeof color === 'string') {
      return hexToRgb(color);
    }
    return color;
  });

  /**
   * 将颜色转换为 HEX 字符串
   */
  const toHex = computed((): string => {
    if (typeof color === 'string') {
      return color.toUpperCase();
    }
    return rgbToHex(color.r, color.g, color.b);
  });

  /**
   * 将颜色转换为 HSL 对象
   */
  const toHsl = computed((): HslColor => {
    const rgb = toRgb.value;
    return rgbToHsl(rgb.r, rgb.g, rgb.b);
  });

  /**
   * 根据目标格式返回格式化的颜色字符串
   */
  const formattedColor = computed((): string => {
    switch (format) {
      case 'hex':
        return toHex.value;
      case 'rgb':
        const rgb = toRgb.value;
        return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
      case 'hsl':
        const hsl = toHsl.value;
        return `hsl(${Math.round(hsl.h)}, ${Math.round(hsl.s)}%, ${Math.round(hsl.l)}%)`;
      default:
        return toHex.value;
    }
  });

  return {
    rgb: toRgb,
    hex: toHex,
    hsl: toHsl,
    formatted: formattedColor,
  };
}

/**
 * HEX 转 RGB
 * @param hex HEX 颜色字符串 (例如: "#FF5733" 或 "FF5733")
 */
export function hexToRgb(hex: string): RgbColor {
  // 移除 # 号
  const cleanHex = hex.replace('#', '');
  
  // 解析 R, G, B 值
  let r: number, g: number, b: number;
  
  if (cleanHex.length === 3) {
    // 短格式 HEX (例如: "F53")
    r = parseInt(cleanHex[0] + cleanHex[0], 16);
    g = parseInt(cleanHex[1] + cleanHex[1], 16);
    b = parseInt(cleanHex[2] + cleanHex[2], 16);
  } else if (cleanHex.length === 6) {
    // 标准 HEX 格式 (例如: "FF5733")
    r = parseInt(cleanHex.substring(0, 2), 16);
    g = parseInt(cleanHex.substring(2, 4), 16);
    b = parseInt(cleanHex.substring(4, 6), 16);
  } else {
    // 无效格式，返回黑色
    console.warn('无效的 HEX 颜色格式:', hex);
    return { r: 0, g: 0, b: 0 };
  }
  
  return { r, g, b };
}

/**
 * RGB 转 HEX
 * @param r 红色值 (0-255)
 * @param g 绿色值 (0-255)
 * @param b 蓝色值 (0-255)
 */
export function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => {
    const hex = Math.max(0, Math.min(255, n)).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };
  
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

/**
 * RGB 转 HSL
 * @param r 红色值 (0-255)
 * @param g 绿色值 (0-255)
 * @param b 蓝色值 (0-255)
 */
export function rgbToHsl(r: number, g: number, b: number): HslColor {
  // 将 RGB 值归一化到 0-1 范围
  r /= 255;
  g /= 255;
  b /= 255;
  
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }
  
  return {
    h: h * 360,
    s: s * 100,
    l: l * 100,
  };
}

/**
 * HSL 转 RGB
 * @param h 色相 (0-360)
 * @param s 饱和度 (0-100)
 * @param l 亮度 (0-100)
 */
export function hslToRgb(h: number, s: number, l: number): RgbColor {
  h /= 360;
  s /= 100;
  l /= 100;
  
  let r, g, b;
  
  if (s === 0) {
    // 灰色
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  
  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255),
  };
}

/**
 * 复制颜色到剪贴板
 * @param text 要复制的文本
 * @param onSuccess 复制成功回调
 * @param onError 复制失败回调
 */
export async function copyToClipboard(
  text: string, 
  onSuccess?: () => void,
  onError?: (error: Error) => void
): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    onSuccess?.();
    return true;
  } catch (error) {
    onError?.(error as Error);
    return false;
  }
}

/**
 * 验证 HEX 颜色格式
 * @param hex HEX 颜色字符串
 */
export function isValidHex(hex: string): boolean {
  const cleanHex = hex.replace('#', '');
  return /^[0-9A-Fa-f]{3}$|^[0-9A-Fa-f]{6}$/.test(cleanHex);
}

/**
 * 生成颜色的对比色（用于文字颜色）
 * @param hex HEX 颜色字符串
 */
export function getContrastColor(hex: string): string {
  const rgb = hexToRgb(hex);
  // 使用 YIQ 公式计算亮度
  const yiq = ((rgb.r * 299) + (rgb.g * 587) + (rgb.b * 114)) / 1000;
  return yiq >= 128 ? '#000000' : '#FFFFFF';
}