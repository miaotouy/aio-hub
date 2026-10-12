import { createToolIcon } from "../createToolIcon";

/** 正则批量替换：正则记号 .* 加替换箭头 */
export const RegexApplierIcon = createToolIcon("regex-applier", [
  ["path", { d: "M17 3v10" }],
  ["path", { d: "m12.67 5.5 8.66 5" }],
  ["path", { d: "m12.67 10.5 8.66-5" }],
  ["rect", { x: 3, y: 16, width: 4, height: 4, rx: 1 }],
  ["path", { d: "M11 18h10" }],
  ["path", { d: "m18 15 3 3-3 3" }],
]);
