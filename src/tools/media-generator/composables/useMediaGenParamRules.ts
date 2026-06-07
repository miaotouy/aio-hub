import type { LlmModelInfo } from "@/types/llm-profiles";
import type { MediaGenParamRules } from "@/types/model-metadata";

/**
 * 媒体生成参数规则 Composable
 *
 * 从模型信息中读取 mediaGenParams 规则，提供给：
 * - ParameterPanel：动态渲染/隐藏控件
 * - useMediaGenerationManager：请求前清洁参数
 *
 * 元数据规则只用于添加/导入模型时写入初始模型信息。运行态如果已经
 * 有具体模型对象，必须以模型对象上的配置为准，避免用户修改模型后
 * 又被全局元数据规则覆盖。
 */
export function useMediaGenParamRules() {
  const deleteKeys = (target: Record<string, any>, keys: string[]) => {
    keys.forEach((key) => delete target[key]);
  };

  const sanitizeOptionValue = <T extends string | number>(
    clean: Record<string, any>,
    keys: string[],
    options: Array<{ value: T }> | undefined,
    defaultValue: T | undefined,
    fillDefaults: boolean
  ) => {
    if (!options?.length) return;
    const validValues = options.map((o) => o.value);
    const currentKey = keys.find((key) => clean[key] !== undefined) || keys[0];
    const currentValue = clean[currentKey];
    if (fillDefaults && defaultValue !== undefined) {
      clean[keys[0]] = defaultValue;
    } else if (
      currentValue !== undefined &&
      !validValues.includes(currentValue)
    ) {
      clean[keys[0]] = defaultValue ?? validValues[0];
    }
  };

  const sanitizeNumericValue = (
    clean: Record<string, any>,
    keys: string[],
    rule:
      | {
          supported: boolean;
          min?: number;
          max?: number;
          step?: number;
          default?: number;
        }
      | undefined,
    fillDefaults: boolean
  ) => {
    if (!rule) return;
    if (rule.supported === false) {
      deleteKeys(clean, keys);
      return;
    }
    if (fillDefaults && rule.default !== undefined) {
      clean[keys[0]] = rule.default;
      return;
    }
    const currentKey = keys.find((key) => clean[key] !== undefined);
    if (!currentKey) return;
    const numeric = Number(clean[currentKey]);
    if (!Number.isFinite(numeric)) {
      delete clean[currentKey];
      return;
    }
    const min = rule.min ?? numeric;
    const max = rule.max ?? numeric;
    clean[keys[0]] = Math.min(Math.max(numeric, min), max);
  };

  const sanitizeBooleanValue = (
    clean: Record<string, any>,
    keys: string[],
    rule: { supported: boolean; default?: boolean } | undefined,
    fillDefaults: boolean
  ) => {
    if (!rule) return;
    if (rule.supported === false) {
      deleteKeys(clean, keys);
      return;
    }
    if (fillDefaults && rule.default !== undefined) {
      clean[keys[0]] = rule.default;
    }
  };

  function hasParamRules(
    rules: MediaGenParamRules | undefined
  ): rules is MediaGenParamRules {
    return !!rules && Object.keys(rules).length > 0;
  }

  /**
   * 获取模型实例的生成参数规则
   */
  function getModelParamRules(
    model: LlmModelInfo | undefined
  ): MediaGenParamRules | undefined {
    return hasParamRules(model?.mediaGenParams)
      ? model.mediaGenParams
      : undefined;
  }

  /**
   * 判断模型是否使用 aspectRatioMode（xAI 等）而非标准 size 参数
   */
  function usesAspectRatioMode(rules: MediaGenParamRules): boolean {
    return !!rules.aspectRatioMode;
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
   *
   * @param params 待清洁参数
   * @param rules 参数规则
   * @param options.fillDefaults 是否填充默认值（通常用于模型切换时重置参数）
   */
  function sanitizeParams(
    params: Record<string, any>,
    rules: MediaGenParamRules,
    options: { fillDefaults?: boolean } = {}
  ): Record<string, any> {
    const clean = { ...params };
    const { fillDefaults = false } = options;

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
        if (fillDefaults && rules.quality.default) {
          clean.quality = rules.quality.default;
        } else if (clean.quality && !validValues.includes(clean.quality)) {
          clean.quality = rules.quality.default || validValues[0];
        }
      }
    }

    // style
    if (rules.style === undefined || !rules.style.supported) {
      delete clean.style;
    } else if ("options" in rules.style && rules.style.options) {
      const validValues = rules.style.options.map((o) => o.value);
      if (fillDefaults && rules.style.default) {
        clean.style = rules.style.default;
      } else if (clean.style && !validValues.includes(clean.style)) {
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
      delete clean.steps;
    } else if (fillDefaults && rules.steps?.default !== undefined) {
      clean.num_inference_steps = rules.steps.default;
      clean.numInferenceSteps = rules.steps.default;
      clean.steps = rules.steps.default;
    }

    // guidanceScale / guidance_scale
    if (rules.guidanceScale?.supported === false) {
      delete clean.guidance_scale;
      delete clean.guidanceScale;
      delete clean.cfgScale;
    } else if (fillDefaults && rules.guidanceScale?.default !== undefined) {
      clean.guidance_scale = rules.guidanceScale.default;
      clean.guidanceScale = rules.guidanceScale.default;
      clean.cfgScale = rules.guidanceScale.default;
    }

    // background
    if (rules.background !== undefined) {
      if (!rules.background.supported) {
        delete clean.background;
      } else if (rules.background.options) {
        const validValues = rules.background.options.map((o) => o.value);
        if (fillDefaults && rules.background.options[0]) {
          clean.background = rules.background.options[0].value;
        } else if (
          clean.background &&
          !validValues.includes(clean.background)
        ) {
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
    } else if (fillDefaults && rules.moderation?.default !== undefined) {
      clean.moderation = rules.moderation.default;
    }

    // outputFormat
    if (rules.outputFormat?.supported === false) {
      delete clean.output_format;
      delete clean.outputFormat;
    } else if (fillDefaults && rules.outputFormat?.default) {
      clean.output_format = rules.outputFormat.default;
    }

    // outputCompression
    if (rules.outputCompression?.supported === false) {
      delete clean.output_compression;
      delete clean.outputCompression;
    } else if (fillDefaults && rules.outputCompression?.default !== undefined) {
      clean.output_compression = rules.outputCompression.default;
    }

    // batchSize / n
    if (rules.batchSize?.supported === false) {
      clean.n = 1; // 强制为 1
    } else if (rules.batchSize) {
      const { min = 1, max = 10 } = rules.batchSize;
      if (fillDefaults && rules.batchSize.default !== undefined) {
        clean.n = rules.batchSize.default;
      } else if (clean.n !== undefined) {
        clean.n = Math.min(Math.max(Number(clean.n) || 1, min), max);
      }
    }

    // partialImages
    if (rules.partialImages?.supported === false) {
      delete clean.partial_images;
      delete clean.partialImages;
    } else if (fillDefaults && rules.partialImages?.default !== undefined) {
      clean.partial_images = rules.partialImages.default;
    }

    // size（preset 模式校验）
    if (rules.size?.mode === "preset" && rules.size.presets) {
      const validSizes = rules.size.presets.map((p) => p.value);
      if (fillDefaults && rules.size.default) {
        clean.size = rules.size.default;
      } else if (clean.size && !validSizes.includes(clean.size)) {
        clean.size = rules.size.default || validSizes[0];
      }
    }

    if (rules.aspectRatioMode) {
      sanitizeOptionValue(
        clean,
        ["aspectRatio", "aspect_ratio"],
        rules.aspectRatioMode.ratios,
        rules.aspectRatioMode.defaultRatio,
        fillDefaults
      );
      if (rules.aspectRatioMode.resolutions?.length) {
        sanitizeOptionValue(
          clean,
          ["resolution"],
          rules.aspectRatioMode.resolutions,
          rules.aspectRatioMode.defaultResolution,
          fillDefaults
        );
      }
    }

    // duration / durationSeconds
    if (rules.duration) {
      if (rules.duration.supported === false) {
        deleteKeys(clean, ["duration", "durationSeconds", "seconds"]);
      } else {
        if (rules.duration.options?.length) {
          sanitizeOptionValue(
            clean,
            ["durationSeconds", "duration", "seconds"],
            rules.duration.options,
            rules.duration.default,
            fillDefaults
          );
        } else {
          sanitizeNumericValue(
            clean,
            ["durationSeconds", "duration", "seconds"],
            rules.duration,
            fillDefaults
          );
        }
        sanitizeNumericValue(
          clean,
          ["durationSeconds", "duration", "seconds"],
          rules.duration,
          false
        );
        if (clean.durationSeconds !== undefined) {
          clean.duration = clean.durationSeconds;
        }
      }
    } else if (
      clean.duration !== undefined &&
      clean.durationSeconds === undefined
    ) {
      clean.durationSeconds = Number(clean.duration);
    }

    sanitizeBooleanValue(
      clean,
      ["promptEnhancement", "prompt_enhancement", "promptOptimizer"],
      rules.promptEnhancement,
      fillDefaults
    );
    sanitizeBooleanValue(
      clean,
      ["generateAudio", "generate_audio", "bgm"],
      rules.generateAudio,
      fillDefaults
    );
    sanitizeBooleanValue(clean, ["watermark"], rules.watermark, fillDefaults);
    sanitizeBooleanValue(
      clean,
      ["cameraFixed", "camera_fixed"],
      rules.cameraFixed,
      fillDefaults
    );

    if (rules.movementAmplitude !== undefined) {
      if (!rules.movementAmplitude.supported) {
        deleteKeys(clean, ["movementAmplitude", "movement_amplitude"]);
      } else {
        sanitizeOptionValue(
          clean,
          ["movementAmplitude", "movement_amplitude"],
          rules.movementAmplitude.options,
          rules.movementAmplitude.default,
          fillDefaults
        );
      }
    }

    // free size 模式不在这里校验（UI 层实时验证）

    return clean;
  }

  /**
   * 构建 xAI aspect_ratio + resolution 参数
   * 将 UI 状态映射为 xAI API 所需的格式
   */
  function buildXaiSizeParams(
    aspectRatio: string,
    resolution?: string
  ): { aspectRatio: string; aspect_ratio: string; resolution?: string } {
    const params: {
      aspectRatio: string;
      aspect_ratio: string;
      resolution?: string;
    } = {
      aspectRatio,
      aspect_ratio: aspectRatio,
    };
    if (resolution) {
      // xAI 要求小写 k；其他 provider 通常忽略或自行处理。
      params.resolution = resolution.toLowerCase();
    }
    return params;
  }

  return {
    getModelParamRules,
    sanitizeParams,
    usesAspectRatioMode,
    usesGeminiImageConfig,
    buildXaiSizeParams,
  };
}
