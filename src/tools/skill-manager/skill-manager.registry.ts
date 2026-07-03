// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

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
  version: "1.5.0",
};

// 默认导出：SkillBridgeFactory 会由 toolRegistryManager 在启动时注册
export default [skillBridgeFactory];
