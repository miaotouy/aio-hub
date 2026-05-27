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
  HAND: "hand",
  ...BRUSH_TYPES,
  ...SHAPE_TYPES,
} as const;

export type ToolType = (typeof TOOL_TYPES)[keyof typeof TOOL_TYPES];

/** 虚线样式预设 */
export const DASH_PRESETS: { label: string; value: number[] | null }[] = [
  { label: "实线", value: null },
  { label: "短虚线", value: [5, 5] },
  { label: "长虚线", value: [12, 6] },
  { label: "点线", value: [2, 4] },
  { label: "点划线", value: [12, 4, 2, 4] },
];

/** 线帽样式预设 */
export const LINE_CAP_OPTIONS: {
  label: string;
  value: "butt" | "round" | "square";
}[] = [
  { label: "平头", value: "butt" },
  { label: "圆头", value: "round" },
  { label: "方头", value: "square" },
];

/** 字体预设列表 */
export const FONT_PRESETS: { label: string; value: string }[] = [
  { label: "默认无衬线", value: "sans-serif" },
  { label: "衬线体", value: "serif" },
  { label: "等宽体", value: "monospace" },
  { label: "微软雅黑", value: "Microsoft YaHei" },
  { label: "宋体", value: "SimSun" },
  { label: "楷体", value: "KaiTi" },
  { label: "黑体", value: "SimHei" },
  { label: "Arial", value: "Arial" },
  { label: "Georgia", value: "Georgia" },
  { label: "Courier New", value: "Courier New" },
];
