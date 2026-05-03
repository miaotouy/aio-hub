import type { ToolConfig } from "@/services/types";
import { markRaw } from "vue";
import { BookOpen } from "lucide-vue-next";
import { skillBridgeFactory } from "./services/SkillBridgeFactory";

export const toolConfig: ToolConfig = {
  name: "技能管理",
  path: "/skill-manager",
  runMode: "main-only",
  icon: markRaw(BookOpen),
  component: () => import("./SkillManager.vue"),
  description: "Skill 技能管理 - 浏览、启用/禁用、安装 Agent Skill",
  category: ["系统工具", "AI 工具"],
};

// 默认导出：SkillBridgeFactory 会由 toolRegistryManager 在启动时注册
export default [skillBridgeFactory];
