import type { ToolConfig } from "@/services/types";
import { markRaw } from "vue";
import { BookOpenText } from "lucide-vue-next";

export const toolConfig: ToolConfig = {
  name: "知识资料库",
  path: "/knowledge-base",
  icon: markRaw(BookOpenText),
  component: () => import("./KnowledgeBase.vue"),
  description: "文档资料库能力正在建设中。",
  category: ["AI 工具"],
  version: "1.3.0",
};
