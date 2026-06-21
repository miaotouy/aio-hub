/**
 * 动作流通用工具函数（与运行时解耦的纯函数集合）
 *
 * 集中放置坐标转换、颜色解析、延时、变量插值等通用逻辑，
 * 方便 step 执行器、截图取点等模块复用。
 */

import type { Coordinate, StepParams } from "../types";

// ===================== 坐标 / 区域 =====================

/** 客户区尺寸（用于百分比坐标转像素） */
export interface ClientSize {
  width: number;
  height: number;
}

/**
 * 把任意坐标按当前客户区尺寸转换为像素坐标。
 * 像素模式直通；百分比模式需要 getClientSize 提供窗口尺寸。
 */
export async function resolveCoordinate(
  x: number,
  y: number,
  mode: Coordinate["mode"],
  getClientSize: () => Promise<ClientSize | null>
): Promise<{ x: number; y: number }> {
  if (mode === "pixel") return { x, y };
  const size = await getClientSize();
  if (!size) return { x: 0, y: 0 };
  return {
    x: Math.round((x / 100) * size.width),
    y: Math.round((y / 100) * size.height),
  };
}

/** 把区域按客户区尺寸从百分比换算为像素（同步版本） */
export function resolveRect(
  rect: { x: number; y: number; width: number; height: number; mode: Coordinate["mode"] },
  size: ClientSize | null
): { x: number; y: number; width: number; height: number } {
  if (rect.mode === "pixel" || !size) {
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  }
  return {
    x: Math.round((rect.x / 100) * size.width),
    y: Math.round((rect.y / 100) * size.height),
    width: Math.round((rect.width / 100) * size.width),
    height: Math.round((rect.height / 100) * size.height),
  };
}

// ===================== 延时 =====================

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

export function sleepWithRandom(base: number, range: number): Promise<void> {
  if (!range) return sleep(base);
  const offset = (Math.random() * 2 - 1) * range;
  return sleep(Math.max(0, base + offset));
}

// ===================== 颜色 =====================

/** 把 #RRGGBB 解析为 0~255 的 RGB 三元组 */
export function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m || !m[1]) return null;
  const v = parseInt(m[1], 16);
  return { r: (v >> 16) & 0xff, g: (v >> 8) & 0xff, b: v & 0xff };
}

/** 把 0~255 的 RGB 转 #RRGGBB 字符串 */
export function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => n.toString(16).padStart(2, "0").toUpperCase();
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** 欧氏颜色距离占最大可能距离的百分比（0~100） */
export function colorDistancePercent(hex1: string, hex2: string): number {
  const a = parseHex(hex1);
  const b = parseHex(hex2);
  if (!a || !b) return 100;
  const d = Math.sqrt(
    Math.pow(a.r - b.r, 2) + Math.pow(a.g - b.g, 2) + Math.pow(a.b - b.b, 2)
  );
  return (d / Math.sqrt(255 * 255 * 3)) * 100;
}

// ===================== 图像 / 文本 =====================

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = url;
  });
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + "...";
}

/** 把 {varName} 占位符替换为 variables 中的值；未定义保留原样 */
export function interpolateVariables(
  text: string,
  variables: Record<string, string>
): string {
  return text.replace(/\{([a-zA-Z0-9_]+)\}/g, (full, key: string) => {
    if (Object.prototype.hasOwnProperty.call(variables, key)) {
      return variables[key] ?? full;
    }
    return full;
  });
}

/** 步骤配置的简短标签（用于日志） */
export function stepTypeLabel(c: StepParams): string {
  return c.type;
}
