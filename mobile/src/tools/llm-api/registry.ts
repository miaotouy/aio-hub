import { Bot } from "lucide-vue-next";

export default {
  id: "llm-api",
  name: "LLM 服务",
  icon: Bot,
  description: "管理 LLM 渠道与模型配置",
  route: {
    path: "/tools/llm-api",
    name: "LlmSettings",
    component: () => import("./views/LlmSettingsView.vue"),
    meta: { title: "LLM 服务" },
  },
};