import { createToolIcon } from "../createToolIcon";

/** 文本差异对比：并排的两份文档，左减右加 */
export const TextDiffIcon = createToolIcon("text-diff", [
  ["rect", { x: 2, y: 3, width: 9, height: 18, rx: 2 }],
  ["rect", { x: 13, y: 3, width: 9, height: 18, rx: 2 }],
  ["path", { d: "M4.5 12h4" }],
  ["path", { d: "M15.5 12h4" }],
  ["path", { d: "M17.5 10v4" }],
]);
