import { createToolIcon } from "../createToolIcon";

/** Web Canvas：浏览器窗口里的代码 */
export const WebCanvasIcon = createToolIcon("web-canvas", [
  ["rect", { x: 2, y: 3, width: 20, height: 18, rx: 2 }],
  ["path", { d: "M2 8h20" }],
  ["path", { d: "m9 12.5-2.5 2.5 2.5 2.5" }],
  ["path", { d: "m15 12.5 2.5 2.5-2.5 2.5" }],
  ["path", { d: "m13 11.5-2 7" }],
]);
