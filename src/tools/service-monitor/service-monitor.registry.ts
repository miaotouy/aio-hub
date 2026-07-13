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
import { Menu } from "@element-plus/icons-vue";

/**
 * UI 工具配置
 */
export const toolConfig: ToolConfig = {
  name: "服务注册表浏览器",
  path: "/service-monitor",
  icon: markRaw(Menu),
  component: () => import("./ServiceMonitor.vue"),
  description: "可视化查看和浏览所有已注册的工具服务及其元数据",
  category: ["开发工具"],
  version: "1.0.2",
};
