import type { ToolConfig } from "@/services/types";
import { markRaw } from "vue";
import ConnectorIcon from "@/components/icons/ConnectorIcon.vue";

/**
 * UI 工具配置
 */
export const toolConfig: ToolConfig = {
  name: "API 测试工具",
  path: "/api-tester",
  icon: markRaw(ConnectorIcon),
  component: () => import("./ApiTester.vue"),
  description: "测试各类 API 接口，内置 REST、GraphQL、主流 LLM 与本地模型预设",
  category: ["开发工具"],
  version: "1.6.0",
};
