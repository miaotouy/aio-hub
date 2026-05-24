import { format } from "date-fns";

export const DEFAULT_CANVAS_WIDTH = 1920;
export const DEFAULT_CANVAS_HEIGHT = 1080;

/** 生成带时间戳的默认草图名称，如 "草图 0524-1723" */
export function generateDefaultSketchName(): string {
  return `草图 ${format(new Date(), "MMdd-HHmm")}`;
}

export const PRESET_COLORS = [
  "#000000", // 黑
  "#ffffff", // 白
  "#ff4d4f", // 红
  "#ff9c6e", // 橙
  "#ffec3d", // 黄
  "#73d13d", // 绿
  "#5cdbd3", // 青
  "#40a9ff", // 蓝
  "#9254de", // 紫
  "#ff85c0", // 粉
  "#bfbfbf", // 灰
  "#8c5722", // 棕
];

export const BRUSH_TYPES = {
  PENCIL: "pencil",
  MARKER: "marker",
  ERASER: "eraser",
} as const;

export type BrushType = (typeof BRUSH_TYPES)[keyof typeof BRUSH_TYPES];

export const SHAPE_TYPES = {
  RECT: "rect",
  ELLIPSE: "ellipse",
  LINE: "line",
  ARROW: "arrow",
  TEXT: "text",
  IMAGE: "image",
} as const;

export type ShapeType = (typeof SHAPE_TYPES)[keyof typeof SHAPE_TYPES];

export const TOOL_TYPES = {
  SELECT: "select",
  ...BRUSH_TYPES,
  ...SHAPE_TYPES,
} as const;

export type ToolType = (typeof TOOL_TYPES)[keyof typeof TOOL_TYPES];
