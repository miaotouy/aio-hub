import { createToolIcon } from "../createToolIcon";

/** AI 信息解析：图片加信息标记 */
export const MediaInfoReaderIcon = createToolIcon("media-info-reader", [
  ["path", { d: "M21 11V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6" }],
  ["circle", { cx: 9, cy: 9, r: 2 }],
  ["path", { d: "m3 16.5 3.6-3.6a2 2 0 0 1 2.8 0l2.6 2.6" }],
  ["circle", { cx: 17.5, cy: 17.5, r: 4.5 }],
  ["path", { d: "M17.5 19.5V17" }],
  ["path", { d: "M17.5 15h.01" }],
]);
