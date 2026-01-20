import { markRaw } from "vue";
import { Video } from "lucide-vue-next";
import type { ToolRegistry, ToolConfig } from "@/services/types";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("ffmpeg-tools/registry");

export default class FFmpegToolsRegistry implements ToolRegistry {
  public readonly id = "ffmpeg-tools";
  public readonly name = "FFmpeg 多媒体工作台";
  public readonly description = "高效的音视频压缩、转换与处理工具";

  public async initialize() {
    logger.info("FFmpeg 工具初始化");
  }
}

export const ffmpegToolsRegistry = new FFmpegToolsRegistry();

export const toolConfig: ToolConfig = {
  name: "FFmpeg 工具",
  path: "/ffmpeg-tools",
  icon: markRaw(Video),
  component: () => import("./FFmpegTool.vue"),
  description: "音视频压缩、提取音频、格式转换",
  category: "媒体工具",
};