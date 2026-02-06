import type { ToolRegistry, ToolConfig } from "@/services/types";
import { markRaw } from "vue";
import { Database } from "lucide-vue-next";

class KnowledgeBaseRegistry implements ToolRegistry {
  public readonly id = "knowledge-base";
  public readonly name = "知识库";
  public readonly description = "管理和检索结构化知识，支持 RAG 向量化";

  public getMetadata() {
    return {
      methods: [],
    };
  }
}

export default KnowledgeBaseRegistry;

/**
 * UI 工具配置
 */
export const toolConfig: ToolConfig = {
  name: "知识库",
  path: "/knowledge-base",
  icon: markRaw(Database),
  component: () => import("./KnowledgeBase.vue"),
  description: "管理和检索结构化知识，支持 RAG 向量化",
  category: "生产力",
};