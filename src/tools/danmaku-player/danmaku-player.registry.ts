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

import { markRaw } from "vue";
import { Tv } from "lucide-vue-next";
import type { ToolRegistry, ToolConfig } from "@/services/types";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("danmaku-player/registry");

export default class DanmakuPlayerRegistry implements ToolRegistry {
  public readonly id = "danmaku-player";
  public readonly name = "弹幕播放器";
  public readonly description =
    "支持 ASS、B 站 JSON/XML 弹幕的高性能视频播放器";

  public async initialize() {
    logger.info("弹幕播放器初始化");
  }
}

export const danmakuPlayerRegistry = new DanmakuPlayerRegistry();

export const toolConfig: ToolConfig = {
  name: "弹幕播放器",
  path: "/danmaku-player",
  icon: markRaw(Tv),
  component: () => import("./DanmakuPlayer.vue"),
  description: "支持 ASS、B 站 JSON/XML 弹幕，丰富的显示调整选项",
  category: ["媒体工具"],
  version: "2.1.0",
};
