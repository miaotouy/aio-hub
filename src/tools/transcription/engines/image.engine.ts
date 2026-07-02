import { assetManagerEngine } from "@/composables/useAssetManager";
import { useLlmRequest } from "@/composables/useLlmRequest";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { getImageDimensions, resizeImage } from "@/utils/imageProcessor";
import { createModuleLogger } from "@/utils/logger";
import { parseModelCombo } from "@/utils/modelIdUtils";
import SmartOcrRegistry from "@/tools/smart-ocr/smart-ocr.registry";
import {
  getCurrentEngineConfig,
  loadSmartOcrConfig,
} from "@/tools/smart-ocr/config/config";
import type { Asset } from "@/types/asset-management";
import type { LlmMessageContent } from "@/llm-apis/common";
import type { OcrEngineConfig } from "@/tools/smart-ocr/types";
import { getEffectiveConfig, getModelParams } from "./base";
import { cleanLlmOutput, detectRepetition } from "../utils/text";
import type {
  ITranscriptionEngine,
  EngineContext,
  EngineResult,
  ImageOcrEngineType,
  ImageSpecificConfig,
} from "../types";

const logger = createModuleLogger("transcription/engines/image");

/** 将 data URL 直接转为 ArrayBuffer，避免 fetch 触发 CSP 限制 */
function dataUrlToArrayBuffer(dataUrl: string): ArrayBuffer {
  const base64Idx = dataUrl.indexOf(",");
  const base64Str = dataUrl.slice(base64Idx + 1);
  const binaryStr = atob(base64Str);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return bytes.buffer;
}

async function loadImageFromTask(task: EngineContext["task"]) {
  const buffer = await assetManagerEngine.getAssetBinary(task.path);
  const blob = new Blob([buffer], { type: task.mimeType });
  const objectUrl = URL.createObjectURL(blob);
  const img = new Image();

  try {
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("图片加载失败"));
      img.src = objectUrl;
    });

    return { img, objectUrl };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

export class ImageTranscriptionEngine implements ITranscriptionEngine {
  canHandle(asset: Asset): boolean {
    return asset.type === "image";
  }

  async execute(ctx: EngineContext): Promise<EngineResult> {
    const config = getEffectiveConfig(ctx);
    const mode = config.image?.mode ?? "vlm";

    if (mode === "ocr") {
      return this.executeOcr(ctx);
    }

    return this.executeVlm(ctx);
  }

  private async executeOcr(ctx: EngineContext): Promise<EngineResult> {
    const { task } = ctx;
    const config = getEffectiveConfig(ctx);
    const imageConfig = config.image;
    const ocrRegistry = new SmartOcrRegistry();
    const smartOcrConfig = await loadSmartOcrConfig();
    const ocrEngineConfig =
      imageConfig.ocrEngineType && imageConfig.ocrEngineType !== "default"
        ? this.resolveOcrEngineConfig(
            smartOcrConfig,
            imageConfig.ocrEngineType,
            imageConfig
          )
        : getCurrentEngineConfig(smartOcrConfig);

    const { img, objectUrl } = await loadImageFromTask(task);

    try {
      const slicerConfig = {
        ...config.imageSlicerConfig,
        enabled: config.enableImageSlicer,
        aspectRatioThreshold: config.enableImageSlicer
          ? config.imageSlicerConfig.aspectRatioThreshold
          : 99999,
      };
      const { blocks } = await ocrRegistry.sliceImage(
        img,
        slicerConfig,
        task.assetId
      );

      logger.info(`开始 OCR 图片转写，共 ${blocks.length} 个切片`, {
        assetId: task.assetId,
        engineType: ocrEngineConfig.type,
      });

      const batchSize = imageConfig.ocrBatchSize ?? 3;
      const results: any[] = [];

      for (let i = 0; i < blocks.length; i += batchSize) {
        if (ctx.signal?.aborted) {
          break;
        }

        const batchBlocks = blocks.slice(i, i + batchSize);
        logger.info(
          `正在识别第 ${Math.floor(i / batchSize) + 1}/${Math.ceil(blocks.length / batchSize)} 批 OCR (${batchBlocks.length} 个切片)...`,
          {
            assetId: task.assetId,
          }
        );

        const batchResults = await ocrRegistry.runOcr(
          batchBlocks,
          ocrEngineConfig,
          {
            signal: ctx.signal,
          }
        );

        results.push(...batchResults);
      }

      const failedResults = results.filter((r) => r.status === "error");
      const cancelledResults = results.filter((r) => r.status === "cancelled");
      const text = results
        .filter((r) => !r.ignored && r.text?.trim())
        .map((r) => r.text.trim())
        .join("\n\n");

      if ((ctx.signal?.aborted || cancelledResults.length > 0) && !text) {
        throw new Error("OCR 识别已取消");
      }

      if (failedResults.length === results.length) {
        const firstError = failedResults.find((r) => r.error)?.error;
        throw new Error(firstError || "OCR 识别失败");
      }

      return {
        text,
        isEmpty: text.length === 0,
        warning:
          failedResults.length > 0
            ? `OCR 有 ${failedResults.length} 个切片识别失败`
            : undefined,
      };
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  private resolveOcrEngineConfig(
    config: Awaited<ReturnType<typeof loadSmartOcrConfig>>,
    engineType: Exclude<ImageOcrEngineType, "default">,
    imageConfig: ImageSpecificConfig
  ): OcrEngineConfig {
    switch (engineType) {
      case "tesseract":
        return {
          type: "tesseract",
          ...config.engineConfigs.tesseract,
        };
      case "native":
        return {
          type: "native",
          ...config.engineConfigs.native,
        };
      case "cloud":
        return {
          type: "cloud",
          ...config.engineConfigs.cloud,
        };
      case "plugin":
        return this.resolvePluginOcrEngineConfig(config, imageConfig);
    }
  }

  private resolvePluginOcrEngineConfig(
    config: Awaited<ReturnType<typeof loadSmartOcrConfig>>,
    imageConfig: ImageSpecificConfig
  ): OcrEngineConfig {
    if (imageConfig.ocrPluginExtensionId) {
      const ocrRegistry = new SmartOcrRegistry();
      const extension = ocrRegistry
        .listOcrExtensions()
        .find((item) => item.id === imageConfig.ocrPluginExtensionId);

      if (!extension) {
        throw new Error(
          `未找到 OCR 插件扩展: ${imageConfig.ocrPluginExtensionId}`
        );
      }
      const modelProfile =
        extension.modelProfiles.find(
          (profile) => profile.id === imageConfig.ocrPluginModelProfile
        )?.id ||
        extension.defaultModelProfile ||
        extension.modelProfiles[0]?.id;
      const language =
        extension.languages.find(
          (item) => item.id === imageConfig.ocrPluginLanguage
        )?.id ||
        extension.defaultLanguage ||
        extension.languages[0]?.id;

      return {
        type: "plugin",
        name: extension.name,
        pluginId: extension.pluginId,
        method: extension.method,
        modelProfile,
        language,
      };
    }

    return {
      type: "plugin",
      ...config.engineConfigs.plugin,
    };
  }

  private async executeVlm(ctx: EngineContext): Promise<EngineResult> {
    const { task } = ctx;
    const config = getEffectiveConfig(ctx);
    const { sendRequest } = useLlmRequest();
    const { getProfileById } = useLlmProfiles();

    const {
      modelIdentifier,
      prompt,
      temperature,
      maxTokens,
      timeout,
      enableRepetitionDetection,
    } = getModelParams(ctx, "image");
    const [profileId, modelId] = parseModelCombo(modelIdentifier);

    if (!profileId || !modelId) {
      throw new Error(`无效的模型标识符: ${modelIdentifier}`);
    }

    const profile = getProfileById(profileId);
    const model = profile?.models.find((m) => m.id === modelId);
    const maxDim = model?.capabilities?.maxImageDimension;

    // 1. 处理图片切块
    let imageBatchData: { base64: string }[] | undefined;
    const enableSlicer = config.enableImageSlicer;
    const slicerConfig = config.imageSlicerConfig;

    if (enableSlicer) {
      const { img, objectUrl } = await loadImageFromTask(task);

      try {
        const ocrRegistry = new SmartOcrRegistry();
        const { blocks } = await ocrRegistry.sliceImage(
          img,
          slicerConfig,
          task.assetId
        );

        if (blocks.length > 1) {
          logger.info(`图片触发智能切图，共切分为 ${blocks.length} 块`, {
            assetId: task.assetId,
          });

          imageBatchData = await Promise.all(
            blocks.map(async (b) => {
              let buffer = dataUrlToArrayBuffer(b.dataUrl);

              if (maxDim && maxDim > 0) {
                try {
                  const dims = await getImageDimensions(buffer);
                  if (dims.width > maxDim || dims.height > maxDim) {
                    buffer = await resizeImage(buffer, {
                      maxWidth: maxDim,
                      maxHeight: maxDim,
                    });
                  }
                } catch (e) {
                  logger.warn("切片缩放失败", e);
                }
              }

              const base64 = btoa(
                new Uint8Array(buffer).reduce(
                  (data, byte) => data + String.fromCharCode(byte),
                  ""
                )
              );
              return { base64 };
            })
          );
        }
      } catch (e) {
        logger.warn("图片切图检查失败，将使用原图", e);
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    }

    // 2. 构建请求
    let transcriptionText: string;
    const finalPrompt = task.filename
      ? prompt.replace(/\{filename\}/g, task.filename)
      : prompt;

    if (imageBatchData && imageBatchData.length > 1) {
      // 批量/切片模式
      const MAX_IMAGE_PER_REQUEST = 15;
      const totalBatches = Math.ceil(
        imageBatchData.length / MAX_IMAGE_PER_REQUEST
      );
      const batchTexts: string[] = new Array(totalBatches).fill("");

      // 针对 Gemini 等模型，顺序处理配合延迟以避免 429
      const delay = config.executionDelay || 500; // 批次间延迟

      const processBatch = async (i: number) => {
        // 在请求前增加基于索引的交错延迟，减少 429 概率
        if (i > 0) {
          const jitter = Math.random() * 200; // 增加随机抖动
          await new Promise((resolve) => setTimeout(resolve, delay + jitter));
        }

        const start = i * MAX_IMAGE_PER_REQUEST;
        const end = Math.min(
          start + MAX_IMAGE_PER_REQUEST,
          imageBatchData!.length
        );
        const batch = imageBatchData!.slice(start, end);

        logger.info(
          `正在处理第 ${i + 1}/${totalBatches} 批图片切片 (${batch.length} 张)`,
          { assetId: task.assetId }
        );

        const content: LlmMessageContent[] = [
          { type: "text", text: finalPrompt },
        ];
        for (const img of batch) {
          content.push({ type: "image", imageBase64: img.base64 });
        }

        const response = await sendRequest({
          profileId,
          modelId,
          messages: [{ role: "user", content }],
          inspectorContext: {
            toolName: "transcription",
            sessionId: task.assetId,
            purpose: "transcribe-image-batch",
          },
          stream: false,
          temperature,
          maxTokens,
          timeout: timeout * 1000,
          signal: ctx.signal,
        });

        if (response.content) {
          batchTexts[i] = response.content;
        }
      };

      // 顺序处理每个批次
      for (let i = 0; i < totalBatches; i++) {
        await processBatch(i);
      }

      transcriptionText = batchTexts.filter((t) => t).join("\n\n");
    } else {
      // 单图模式
      let buffer = await assetManagerEngine.getAssetBinary(task.path);

      if (maxDim && maxDim > 0) {
        try {
          const dims = await getImageDimensions(buffer);
          if (dims.width > maxDim || dims.height > maxDim) {
            buffer = await resizeImage(buffer, {
              maxWidth: maxDim,
              maxHeight: maxDim,
            });
            logger.debug("转写单图已缩放", {
              original: `${dims.width}×${dims.height}`,
              maxDim,
            });
          }
        } catch (e) {
          logger.warn("单图缩放失败", e);
        }
      }

      const content: LlmMessageContent[] = [
        { type: "text", text: finalPrompt },
        { type: "image", imageBase64: buffer },
      ];
      const response = await sendRequest({
        profileId,
        modelId,
        messages: [{ role: "user", content }],
        inspectorContext: {
          toolName: "transcription",
          sessionId: task.assetId,
          purpose: "transcribe-image",
        },
        stream: false,
        temperature,
        maxTokens,
        timeout: timeout * 1000,
        signal: ctx.signal,
      });
      transcriptionText = response.content;
    }

    const cleanedText = cleanLlmOutput(transcriptionText);
    const repetition = detectRepetition(cleanedText, config.repetitionConfig);

    if (enableRepetitionDetection && repetition.isRepetitive) {
      throw new Error(`检测到模型回复存在严重复读: ${repetition.reason}`);
    }

    return {
      text: cleanedText,
      isEmpty: !cleanedText || cleanedText.trim().length === 0,
    };
  }
}
