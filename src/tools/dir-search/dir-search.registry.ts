import type { ToolConfig } from "@/services/types";
import { FolderSearch } from "lucide-vue-next";
import { markRaw } from "vue";

export const toolConfig: ToolConfig = {
  name: "目录搜索",
  path: "/dir-search",
  icon: markRaw(FolderSearch),
  description: "在指定目录中搜索文件内容，支持正则、全词匹配和批量替换",
  category: ["文件管理"],
  component: () => import("./DirSearch.vue"),
};
