import { Bot } from "lucide-vue-next";
import type { ToolRegistry } from "@/types/tool";

export const registry: ToolRegistry = {
  id: "llm",
  name: "LLM 服务",
  icon: Bot,
  description: "管理 LLM 渠道与模型配置",
  component: () => import("./views/LlmSettingsView.vue"),
  route: {
    path: "/llm",
    name: "LlmSettings",
    component: () => import("./views/LlmSettingsView.vue"),
    meta: { title: "LLM 服务" },
  },
};

export default registry;