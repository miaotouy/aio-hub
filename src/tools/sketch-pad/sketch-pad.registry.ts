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
