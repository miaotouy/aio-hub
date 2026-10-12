import { createToolIcon } from "../createToolIcon";

/** 目录结构浏览器：线性目录树 */
export const DirectoryTreeIcon = createToolIcon("directory-tree", [
  ["rect", { x: 3, y: 3, width: 11, height: 4, rx: 2 }],
  ["path", { d: "M6 7v11a1 1 0 0 0 1 1h5" }],
  ["path", { d: "M6 12h6" }],
  ["rect", { x: 13, y: 10, width: 8, height: 4, rx: 2 }],
  ["rect", { x: 13, y: 17, width: 8, height: 4, rx: 2 }],
]);
