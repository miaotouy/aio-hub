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
import { MousePointerClick } from "lucide-vue-next";

/**
 * UI 工具配置
 */
export const toolConfig: ToolConfig = {
  name: "窗口自动化助手",
  path: "/window-automator",
  runMode: "any",
  icon: markRaw(MousePointerClick),
  component: () => import("./WindowAutomator.vue"),
  description:
    "为窗口化的轻量重复操作提供可视化的动作流执行器，支持后台点击、取色、截图、OCR",
  category: ["自动化", "开发工具"],
  version: "0.1.0",
};
