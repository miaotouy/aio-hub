import type { ToolRegistry, ToolConfig } from "@/services/types";
import { markRaw } from "vue";
import OcrIcon from "@/components/icons/OcrIcon.vue";
import type { SlicerConfig, ImageBlock } from "./types";
import { loadSmartOcrConfig } from "./config/config";
import { useImageSlicer } from "./composables/useImageSlicer";

/**
 * SmartOcr 服务
 *
 * 目前仅提供智能切图核心功能，由 transcription 引擎调用。
 * 完整的 OCR 业务流程已转移到 useSmartOcrRunner 和相关 composables 中。
 */
export default class SmartOcrRegistry implements ToolRegistry {
  public readonly id = "smart-ocr";
  public readonly name = "智能 OCR";
  public readonly description = "智能图片文字识别工具，支持智能切图";

  /**
   * [基础功能] 智能切图。
   * 将长图按照空白区域切割成多个块。
   */
  public async sliceImage(
    image: HTMLImageElement,
    config?: Partial<SlicerConfig>,
    imageId: string = "default"
  ): Promise<{ blocks: ImageBlock[]; lines: any[] }> {
    const { sliceImage } = useImageSlicer();

    // 加载默认配置并应用覆盖
    const fullConfig = await loadSmartOcrConfig();
    const mergedSlicerConfig = {
      ...fullConfig.slicerConfig,
      ...config,
    };

    return await sliceImage(image, mergedSlicerConfig, imageId);
  }

  // ==================== 元数据 ====================

  /**
   * 获取服务元数据
   */
  public getMetadata() {
    return {
      methods: [],
    };
  }
}

/**
 * UI 工具配置
 */
export const toolConfig: ToolConfig = {
  name: "智能 OCR",
  path: "/smart-ocr",
  icon: markRaw(OcrIcon),
  component: () => import("./SmartOcr.vue"),
  description: "智能OCR文字识别工具，支持多引擎和智能切图",
  category: "AI 工具",
};
