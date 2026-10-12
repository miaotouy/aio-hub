import { createToolIcon } from "../createToolIcon";

/** LLM 检查器：放大镜里的请求 / 响应双向箭头 */
export const LlmInspectorIcon = createToolIcon("llm-inspector", [
  ["circle", { cx: 11, cy: 11, r: 8 }],
  ["path", { d: "m21 21-4.3-4.3" }],
  ["path", { d: "M8 14.5v-7" }],
  ["path", { d: "m5.75 9.75 2.25-2.25 2.25 2.25" }],
  ["path", { d: "M14 7.5v7" }],
  ["path", { d: "m11.75 12.25 2.25 2.25 2.25-2.25" }],
]);
