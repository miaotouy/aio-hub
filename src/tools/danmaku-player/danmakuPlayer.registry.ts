import { markRaw } from "vue";
import { Tv } from "lucide-vue-next";
import type { ToolRegistry, ToolConfig } from "@/services/types";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("danmaku-player/registry");

export default class DanmakuPlayerRegistry implements ToolRegistry {
  public readonly id = "danmaku-player";
  public readonly name = "弹幕播放器";
  public readonly description = "支持 ASS 格式弹幕的高性能视频播放器";

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
  description: "支持 ASS 弹幕，丰富的显示调整选项",
  category: ["媒体工具"],
};
