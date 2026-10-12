import { createToolIcon } from "../createToolIcon";

/** ST 世界书：书本加地球 */
export const WorldbookIcon = createToolIcon("worldbook", [
  ["path", { d: "M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H15a1 1 0 0 1 1 1v5.5" }],
  ["path", { d: "M9 22H6.5a2.5 2.5 0 0 1 0-5H9" }],
  ["circle", { cx: 16.5, cy: 16.5, r: 5.5 }],
  ["path", { d: "M11 16.5h11" }],
  ["path", { d: "M16.5 11c-1.5 1.5-2.3 3.4-2.3 5.5s.8 4 2.3 5.5c1.5-1.5 2.3-3.4 2.3-5.5s-.8-4-2.3-5.5z" }],
]);
