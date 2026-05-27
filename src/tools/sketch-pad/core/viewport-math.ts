import type { Point } from "../types";

/**
 * 将屏幕/视口坐标转换为文档/画布坐标
 */
export function screenToDoc(
  screenPoint: Point,
  stagePos: Point,
  scale: number
): Point {
  return {
    x: (screenPoint.x - stagePos.x) / scale,
    y: (screenPoint.y - stagePos.y) / scale,
  };
}

/**
 * 将文档/画布坐标转换为屏幕/视口坐标
 */
export function docToScreen(
  docPoint: Point,
  stagePos: Point,
  scale: number
): Point {
  return {
    x: docPoint.x * scale + stagePos.x,
    y: docPoint.y * scale + stagePos.y,
  };
}
