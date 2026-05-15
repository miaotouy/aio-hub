import type { ToolConfig } from "@/services/types";
import { markRaw } from "vue";
import { Setting } from "@element-plus/icons-vue";

/**
 * UI 工具配置
 */
export const toolConfig: ToolConfig = {
  name: "代码格式化",
  runMode: "any",
  path: "/code-formatter",
  icon: markRaw(Setting),
  component: () => import("./CodeFormatter.vue"),
  description: "格式化各种编程语言代码",
  category: ["文本处理"],
};
