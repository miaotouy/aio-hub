import type { ToolConfig } from "@/services/types";
import { markRaw } from "vue";
import { BookOpenText } from "lucide-vue-next";

export const toolConfig: ToolConfig = {
  name: "知识资料库",
  path: "/knowledge-base",
  icon: markRaw(BookOpenText),
  component: () => import("./KnowledgeBase.vue"),
  description: "导入、索引并检索带来源回溯的本地文档资料。",
  category: ["AI 工具"],
  version: "2.0.0",
};
