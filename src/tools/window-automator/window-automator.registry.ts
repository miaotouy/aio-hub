import type { ToolConfig } from "@/services/types";
import { markRaw } from "vue";
import { MousePointerClick } from "lucide-vue-next";

/**
 * UI 工具配置
 */
export const toolConfig: ToolConfig = {
  name: "窗口自动化助手",
  path: "/window-automator",
  runMode: "any",
  icon: markRaw(MousePointerClick),
  component: () => import("./WindowAutomator.vue"),
  description:
    "为窗口化的轻量重复操作提供可视化的动作流执行器，支持后台点击、取色、截图、OCR",
  category: ["自动化", "开发工具"],
  version: "0.1.0",
};
