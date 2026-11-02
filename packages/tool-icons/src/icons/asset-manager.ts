import { createToolIcon } from "../createToolIcon";

/** 资产管理器：叠放的媒体卡片 */
export const AssetManagerIcon = createToolIcon("asset-manager", [
  ["path", { d: "M7 2h10" }],
  ["path", { d: "M5 6h14" }],
  ["rect", { x: 3, y: 10, width: 18, height: 12, rx: 2 }],
  ["circle", { cx: 8, cy: 14.5, r: 1.5 }],
  ["path", { d: "m21 18.5-2.6-2.6a1.8 1.8 0 0 0-2.5 0L9 22" }],
]);
