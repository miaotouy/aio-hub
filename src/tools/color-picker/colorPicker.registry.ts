import type { ServiceMetadata, ToolRegistry, ToolConfig } from "@/services/types";
import { markRaw } from "vue";
import { Pipette } from "lucide-vue-next";

/**
 * Color Picker 注册器
 *
 * 提供工具的基本信息用于系统注册。
 * 实际业务逻辑由 ColorPicker.vue 直接调用 composables 实现。
 */
export default class ColorPickerRegistry implements ToolRegistry {
  public readonly id = "color-picker";
  public readonly runMode = "any";
  public readonly name = "图片色彩分析";
  public readonly description = "从图片中提取和分析颜色方案";

  /**
   * 提供服务的元数据，用于服务监控和文档。
   */
  public getMetadata(): ServiceMetadata {
    return {
      methods: [],
    };
  }
}

/**
 * UI 工具配置
 */
export const toolConfig: ToolConfig = {
  name: "图片色彩分析",
  path: "/color-picker",
  runMode: "any",
  icon: markRaw(Pipette),
  component: () => import("./ColorPicker.vue"),
  description: "从图片中提取颜色，支持多种算法分析主色调、调色板和平均色",
  category: "AI 工具",
};
