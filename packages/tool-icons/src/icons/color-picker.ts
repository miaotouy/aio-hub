import { createToolIcon } from "../createToolIcon";

/** 图片色彩分析：图片下方的一排色块 */
export const ColorPickerIcon = createToolIcon("color-picker", [
  ["rect", { x: 3, y: 2, width: 18, height: 12, rx: 2 }],
  ["circle", { cx: 8, cy: 6.5, r: 1.5 }],
  ["path", { d: "m21 10.5-2.6-2.6a1.8 1.8 0 0 0-2.5 0L10 14" }],
  ["rect", { x: 3, y: 17, width: 4, height: 4, rx: 1 }],
  ["rect", { x: 10, y: 17, width: 4, height: 4, rx: 1 }],
  ["rect", { x: 17, y: 17, width: 4, height: 4, rx: 1 }],
]);
