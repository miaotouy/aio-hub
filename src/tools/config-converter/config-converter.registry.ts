import type { ToolConfig } from "@/services/types";
import { markRaw } from "vue";
import { RefreshCw } from "lucide-vue-next";

/**
 * UI 工具配置
 */
export const toolConfig: ToolConfig = {
  name: "配置转换器",
  runMode: "any",
  path: "/config-converter",
  icon: markRaw(RefreshCw),
  component: () => import("./ConfigConverter.vue"),
  description:
    "支持 JSON, YAML, TOML, INI, XML, .env 格式的语法级互转与批量处理",
  category: ["文本处理"],
  version: "1.0.0",
};
