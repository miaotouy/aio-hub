import { markRaw } from "vue";
import type { ToolConfig } from "@/services/types";
import { Wrench } from "lucide-vue-next";

export const toolConfig: ToolConfig = {
  name: "工具调用测试",
  icon: markRaw(Wrench),
  path: "/tool-calling-tester",
  component: () => import("./ToolCallingTester.vue"),
  description: "内部工具调用系统的调试与验证矩阵",
};

