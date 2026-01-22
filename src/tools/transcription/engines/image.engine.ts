import { assetManagerEngine } from "@/composables/useAssetManager";
import { useLlmRequest } from "@/composables/useLlmRequest";
import { createModuleLogger } from "@/utils/logger";
import SmartOcrRegistry from "@/tools/smart-ocr/smartOcr.registry";
import type { Asset } from "@/types/asset-management";
import type { LlmMessageContent } from "@/llm-apis/common";
import { getModelParams } from "./base";
import { cleanLlmOutput, detectRepetition } from "../utils/text";
import type { ITranscriptionEngine, EngineContext, EngineResult } from "../types";

const logger = createModuleLogger("transcription/engines/image");

export class ImageTranscriptionEngine implements ITranscriptionEngine {
  canHandle(asset: Asset): boolean {
    return asset.type === "image";
  }

  async execute(ctx: EngineContext): Promise<EngineResult> {
    const { task, config } = ctx;
    const { sendRequest } = useLlmRequest();

    const { modelIdentifier, prompt, temperature, maxTokens, timeout, enableRepetitionDetection } = getModelParams(ctx, "image");
    const [profileId, modelId] = modelIdentifier.split(":");

    if (!profileId || !modelId) {
      throw new Error(`无效的模型标识符: ${modelIdentifier}`);
    }

    // 1. 处理图片切块
    let imageBatchData: { base64: string }[] | undefined;
    const enableSlicer = config.enableImageSlicer;
    const slicerConfig = config.imageSlicerConfig;

    if (enableSlicer) {
      const buffer = await assetManagerEngine.getAssetBinary(task.path);
      const blob = new Blob([buffer], { type: task.mimeType });
      const dataUrl = URL.createObjectURL(blob);

      try {
        const img = new Image();
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          img.src = dataUrl;
        });

        const ocrRegistry = new SmartOcrRegistry();
        const { blocks } = await ocrRegistry.sliceImage(img, slicerConfig, task.assetId);

        if (blocks.length > 1) {
          logger.info(`图片触发智能切图，共切分为 ${blocks.length} 块`, { assetId: task.assetId });
          imageBatchData = blocks.map((b) => ({ base64: b.dataUrl.split(",")[1] }));
        }
      } catch (e) {
        logger.warn("图片切图检查失败，将使用原图", e);
      } finally {
        URL.revokeObjectURL(dataUrl);
      }
    }

    // 2. 构建请求
    let transcriptionText: string;
    const finalPrompt = task.filename ? prompt.replace(/\{filename\}/g, task.filename) : prompt;

    if (imageBatchData && imageBatchData.length > 1) {
      // 批量/切片模式
      const MAX_IMAGE_PER_REQUEST = 15;
      const totalBatches = Math.ceil(imageBatchData.length / MAX_IMAGE_PER_REQUEST);
      const batchTexts: string[] = new Array(totalBatches).fill("");

      // 针对 Gemini 等模型，顺序处理配合延迟以避免 429
      const delay = config.executionDelay || 500; // 批次间延迟

      const processBatch = async (i: number) => {
        // 在请求前增加基于索引的交错延迟，减少 429 概率
        if (i > 0) {
          const jitter = Math.random() * 200; // 增加随机抖动
          await new Promise(resolve => setTimeout(resolve, delay + jitter));
        }

        const start = i * MAX_IMAGE_PER_REQUEST;
        const end = Math.min(start + MAX_IMAGE_PER_REQUEST, imageBatchData!.length);
        const batch = imageBatchData!.slice(start, end);

        logger.info(`正在处理第 ${i + 1}/${totalBatches} 批图片切片 (${batch.length} 张)`, { assetId: task.assetId });

        const content: LlmMessageContent[] = [{ type: "text", text: finalPrompt }];
        for (const img of batch) {
          content.push({ type: "image", imageBase64: img.base64 });
        }

        const response = await sendRequest({
          profileId,
          modelId,
          messages: [{ role: "user", content }],
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

      transcriptionText = batchTexts.filter(t => t).join("\n\n");
    } else {
      // 单图模式
      const buffer = await assetManagerEngine.getAssetBinary(task.path);
      const content: LlmMessageContent[] = [
        { type: "text", text: finalPrompt },
        { type: "image", imageBase64: buffer }
      ];
      const response = await sendRequest({
        profileId,
        modelId,
        messages: [{ role: "user", content }],
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
      isEmpty: !cleanedText || cleanedText.trim().length === 0
    };
  }
}