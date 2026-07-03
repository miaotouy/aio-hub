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
  version: "1.0.1",
};
