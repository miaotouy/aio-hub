// src/tools/system-pulse/system-pulse.registry.ts
import type { ToolConfig } from "@/services/types";
import { Activity } from "lucide-vue-next";
import { markRaw } from "vue";

export const toolConfig: ToolConfig = {
  name: "系统脉搏",
  path: "/system-pulse",
  icon: markRaw(Activity),
  description: "实时硬件监控仪表盘：CPU、内存、磁盘、网络、GPU",
  component: () => import("./SystemPulse.vue"),
};
