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
import { Monitor } from "lucide-vue-next";

/**
 * UI 工具配置
 */
export const toolConfig: ToolConfig = {
  name: "壁纸探测器",
  path: "/wallpaper-detector",
  icon: markRaw(Monitor),
  component: () => import("./WallpaperDetector.vue"),
  description: "获取系统当前多屏壁纸，支持一键定位壁纸所在目录并高亮选中",
  category: ["系统工具", "效率工具"],
  version: "1.0.0",
};
