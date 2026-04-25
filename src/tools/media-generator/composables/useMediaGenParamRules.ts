import { useModelMetadata } from "@/composables/useModelMetadata";
import type { MediaGenParamRules } from "@/types/model-metadata";

/**
 * 媒体生成参数规则 Composable
 *
 * 从模型元数据中读取 mediaGenParams 规则，提供给：
 * - ParameterPanel：动态渲染/隐藏控件
 * - useMediaGenerationManager：请求前清洁参数
 */
export function useMediaGenParamRules() {
  const { getMatchedProperties } = useModelMetadata();

  /**
   * 获取指定模型的生成参数规则
   */
  function getParamRules(modelId: string, provider?: string): MediaGenParamRules | undefined {
    const props = getMatchedProperties(modelId, provider);
    return props?.mediaGenParams as MediaGenParamRules | undefined;
  }

  /**
   * 判断模型是否使用 aspectRatioMode（xAI 等）而非标准 size 参数
   */
  function usesAspectRatioMode(rules: MediaGenParamRules): boolean {
    return !!rules.aspectRatioMode && !rules.size;
  }

  /**
   * 判断模型是否使用 geminiImageConfig（Gemini 图像生成接口）
   */
  function usesGeminiImageConfig(rules: MediaGenParamRules): boolean {
    return !!rules.geminiImageConfig;
  }

  /**
   * 根据规则清洁请求参数（剔除不支持的参数，修正超出范围的值）
   *
   * 注意：只处理 OpenAI 兼容接口的参数。
   * Gemini 接口参数清洁应在专用 Adapter 中处理。
   */
  function sanitizeParams(params: Record<string, any>, rules: MediaGenParamRules): Record<string, any> {
    const clean = { ...params };

    // negative_prompt
    if (rules.negativePrompt?.supported === false) {
      delete clean.negative_prompt;
      delete clean.negativePrompt;
    }

    // quality
    if (rules.quality !== undefined) {
      if (!rules.quality.supported) {
        delete clean.quality;
      } else if ("options" in rules.quality && rules.quality.options) {
        const validValues = rules.quality.options.map((o) => o.value);
        if (clean.quality && !validValues.includes(clean.quality)) {
          clean.quality = rules.quality.default || validValues[0];
        }
      }
    }

    // style
    if (rules.style === undefined || !rules.style.supported) {
      delete clean.style;
    } else if ("options" in rules.style && rules.style.options) {
      const validValues = rules.style.options.map((o) => o.value);
      if (clean.style && !validValues.includes(clean.style)) {
        clean.style = rules.style.default || validValues[0];
      }
    }

    // seed
    if (rules.seed?.supported === false) {
      delete clean.seed;
    }

    // steps / num_inference_steps
    if (rules.steps?.supported === false) {
      delete clean.num_inference_steps;
      delete clean.numInferenceSteps;
    }

    // guidanceScale / guidance_scale
    if (rules.guidanceScale?.supported === false) {
      delete clean.guidance_scale;
      delete clean.guidanceScale;
    }

    // background
    if (rules.background !== undefined) {
      if (!rules.background.supported) {
        delete clean.background;
      } else if (rules.background.options) {
        const validValues = rules.background.options.map((o) => o.value);
        if (clean.background && !validValues.includes(clean.background)) {
          // 用户选了不支持的值（如 transparent），重置为第一个有效选项
          clean.background = validValues[0];
        }
      }
    }

    // inputFidelity
    if (rules.inputFidelity?.supported === false) {
      delete clean.input_fidelity;
      delete clean.inputFidelity;
    }

    // moderation
    if (rules.moderation?.supported === false) {
      delete clean.moderation;
    }

    // outputFormat
    if (rules.outputFormat?.supported === false) {
      delete clean.output_format;
      delete clean.outputFormat;
    }

    // outputCompression
    if (rules.outputCompression?.supported === false) {
      delete clean.output_compression;
      delete clean.outputCompression;
    }

    // batchSize / n
    if (rules.batchSize?.supported === false) {
      clean.n = 1; // 强制为 1
    } else if (rules.batchSize) {
      const { min = 1, max = 10 } = rules.batchSize;
      if (clean.n !== undefined) {
        clean.n = Math.min(Math.max(Number(clean.n) || 1, min), max);
      }
    }

    // partialImages
    if (rules.partialImages?.supported === false) {
      delete clean.partial_images;
      delete clean.partialImages;
    }

    // size（preset 模式校验）
    if (rules.size?.mode === "preset" && rules.size.presets) {
      const validSizes = rules.size.presets.map((p) => p.value);
      if (clean.size && !validSizes.includes(clean.size)) {
        clean.size = rules.size.default || validSizes[0];
      }
    }

    // free size 模式不在这里校验（UI 层实时验证）

    return clean;
  }

  /**
   * 构建 xAI aspect_ratio + resolution 参数
   * 将 UI 状态映射为 xAI API 所需的格式
   */
  function buildXaiSizeParams(aspectRatio: string, resolution: string): { aspect_ratio: string; resolution: string } {
    return {
      aspect_ratio: aspectRatio,
      resolution: resolution.toLowerCase(), // xAI 要求小写 k
    };
  }

  return {
    getParamRules,
    sanitizeParams,
    usesAspectRatioMode,
    usesGeminiImageConfig,
    buildXaiSizeParams,
  };
}
