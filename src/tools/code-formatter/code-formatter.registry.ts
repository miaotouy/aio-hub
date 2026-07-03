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
import { Setting } from "@element-plus/icons-vue";

/**
 * UI 工具配置
 */
export const toolConfig: ToolConfig = {
  name: "代码格式化",
  runMode: "any",
  path: "/code-formatter",
  icon: markRaw(Setting),
  component: () => import("./CodeFormatter.vue"),
  description: "格式化各种编程语言代码",
  category: ["文本处理"],
  version: "1.0.1",
};
