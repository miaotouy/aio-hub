// Copyright 2025-2026 miaotouy(Github@miaotouy)
import type { MonitorRect } from "../types";

/** 窗口边框和标题栏按来源窗口的缩放内收，保留虚拟桌面的物理原点。 */
export function getPhysicalCaptureRect(
  rect: MonitorRect | null,
  legacyScale = 1
) {
  if (!rect) return null;
  const scale = rect.scaleFactor ?? legacyScale;
  if (!Number.isFinite(scale) || scale <= 0) return null;
  const outer = rect.physicalBounds ?? {
    x: rect.x * scale,
    y: rect.y * scale,
    width: rect.width * scale,
    height: rect.height * scale,
  };
  if (!Object.values(outer).every(Number.isFinite)) return null;
  const x = Math.round(outer.x + 2 * scale);
  const y = Math.round(outer.y + 26 * scale);
  const right = Math.round(outer.x + outer.width - 2 * scale);
  const bottom = Math.round(outer.y + outer.height - 2 * scale);
  const width = right - x,
    height = bottom - y;
  return width > 0 && height > 0 ? { x, y, width, height } : null;
}
