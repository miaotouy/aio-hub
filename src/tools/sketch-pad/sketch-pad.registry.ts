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

import type { ToolRegistry, ToolConfig } from "@/services/types";
import { markRaw } from "vue";
import { Brush } from "lucide-vue-next";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("tools/sketch-pad");

class SketchPadRegistry implements ToolRegistry {
  public readonly id = "sketch-pad";
  public readonly runMode = "main-only";
  public readonly name = "画板";
  public readonly description = "混合架构画板，支持像素画笔与矢量形状。";

  constructor() {
    logger.info("SketchPadRegistry 实例化");
  }

  public getMetadata() {
    return {
      methods: [],
    };
  }
}

export default SketchPadRegistry;

export const sketchPadRegistry = new SketchPadRegistry();

export const toolConfig: ToolConfig = {
  name: "画板",
  path: "/sketch-pad",
  runMode: "main-only",
  icon: markRaw(Brush),
  component: () => import("./SketchPad.vue"),
  description: "混合架构画板，支持像素画笔与矢量形状，可编辑文本与图层管理",
  category: ["媒体工具"],
  version: "1.3.0",
};
