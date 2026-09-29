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

/**
 * 坐标转换纯函数集合（中心坐标系核心）
 *
 * y 翻转是最大出错点：center 的 y 向上为正、屏幕 y 向下为正。
 * 所有转换必须集中在本文件内并配测试，
 * 禁止在执行器/配置面板各自内联换算。
 */

import type { Coordinate, CoordinateOrigin } from "../types";
import type { ClientSize } from "./flowUtils";

/** 坐标解析结果；clamped 表示 center 模式下越界被收边 */
export interface ResolvedPoint {
  x: number;
  y: number;
  clamped: boolean;
}

/** 极坐标转直角偏移（angle 单位度，正右方 0°，逆时针为正；dy 沿数学惯例向上为正） */
export function polarToCartesian(
  angleDeg: number,
  radius: number
): { dx: number; dy: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return { dx: radius * Math.cos(rad), dy: radius * Math.sin(rad) };
}

/** 直角偏移转极坐标（dy 向上为正；angle 单位度，正右方 0°，逆时针为正） */
export function cartesianToPolar(
  dx: number,
  dy: number
): { angle: number; radius: number } {
  return {
    angle: (Math.atan2(dy, dx) * 180) / Math.PI,
    radius: Math.hypot(dx, dy),
  };
}

/** 象限判定（数学惯例：Q1 右上 / Q2 左上 / Q3 左下 / Q4 右下；坐标轴上为 null） */
export function getQuadrant(x: number, y: number): 1 | 2 | 3 | 4 | null {
  if (x === 0 || y === 0) return null;
  if (x > 0) return y > 0 ? 1 : 4;
  return y > 0 ? 2 : 3;
}

/** 象限显示名（用于徽标 / 悬停提示） */
export function quadrantLabel(q: 1 | 2 | 3 | 4 | null): string {
  switch (q) {
    case 1:
      return "第一象限 · 右上";
    case 2:
      return "第二象限 · 左上";
    case 3:
      return "第三象限 · 左下";
    case 4:
      return "第四象限 · 右下";
    default:
      return "位于坐标轴上";
  }
}

/** 把原点（percent）解析为客户区像素位置；null 时取几何中心 */
export function resolveOriginPixel(
  origin: CoordinateOrigin | null,
  size: ClientSize
): { x: number; y: number } {
  const xPercent = origin ? origin.xPercent : 50;
  const yPercent = origin ? origin.yPercent : 50;
  return {
    x: (xPercent / 100) * size.width,
    y: (yPercent / 100) * size.height,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * 把任意坐标解析为客户区像素坐标。
 *
 * - pixel：直通（保持既有行为，不 clamp）；
 * - percent：按客户区尺寸换算（保持既有行为，不 clamp）；
 * - center：极坐标先归一化为直角，再叠加原点并翻转 y 轴，越界 clamp 收边。
 *
 * clientSize 为 null（获取失败）时 percent/center 返回原点退化值 {0,0}。
 */
export function resolveCoordinate(
  coord: Coordinate,
  clientSize: ClientSize | null,
  origin: CoordinateOrigin | null
): ResolvedPoint {
  if (coord.mode === "pixel") {
    return { x: coord.x, y: coord.y, clamped: false };
  }
  if (!clientSize) return { x: 0, y: 0, clamped: false };
  if (coord.mode === "percent") {
    return {
      x: Math.round((coord.x / 100) * clientSize.width),
      y: Math.round((coord.y / 100) * clientSize.height),
      clamped: false,
    };
  }
  // center 模式
  let dx = coord.x;
  let dy = coord.y;
  if (coord.form === "polar") {
    const c = polarToCartesian(coord.x, coord.y);
    dx = c.dx;
    dy = c.dy;
  }
  const o = resolveOriginPixel(origin, clientSize);
  const x = Math.round(o.x + dx);
  // y 翻转：center 的 y 向上为正，屏幕 y 向下为正
  const y = Math.round(o.y - dy);
  const maxX = Math.max(0, clientSize.width - 1);
  const maxY = Math.max(0, clientSize.height - 1);
  const clampedX = clamp(x, 0, maxX);
  const clampedY = clamp(y, 0, maxY);
  return {
    x: clampedX,
    y: clampedY,
    clamped: clampedX !== x || clampedY !== y,
  };
}
