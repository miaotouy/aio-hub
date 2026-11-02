import { createToolIcon } from "../createToolIcon";

/** LLM 服务：服务器机架上方一颗星芒 */
export const LlmServiceIcon = createToolIcon("llm-service", [
  ["path", { d: "M12 2c.4 1.7 1.3 2.6 3 3-1.7.4-2.6 1.3-3 3-.4-1.7-1.3-2.6-3-3 1.7-.4 2.6-1.3 3-3z" }],
  ["rect", { x: 2, y: 10.5, width: 20, height: 5, rx: 1.5 }],
  ["rect", { x: 2, y: 17, width: 20, height: 5, rx: 1.5 }],
  ["path", { d: "M6 13h.01" }],
  ["path", { d: "M6 19.5h.01" }],
]);
