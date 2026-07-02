import { assetManagerEngine } from "@/composables/useAssetManager";
import { useLlmRequest } from "@/composables/useLlmRequest";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { convertPdfToImages } from "@/utils/pdfUtils";
import { parseModelCombo } from "@/utils/modelIdUtils";
import SmartOcrRegistry from "@/tools/smart-ocr/smart-ocr.registry";
import {
  getCurrentEngineConfig,
  loadSmartOcrConfig,
} from "@/tools/smart-ocr/config/config";
import type { OcrResult } from "@/tools/smart-ocr/types";
import { createModuleLogger } from "@/utils/logger";
import type { Asset } from "@/types/asset-management";
import type { LlmMessageContent } from "@/llm-apis/common";
import { getEffectiveConfig, getModelParams } from "./base";
import { cleanLlmOutput, detectRepetition } from "../utils/text";
import type {
  ITranscriptionEngine,
  EngineContext,
  EngineResult,
  DocumentSpecificConfig,
} from "../types";

const logger = createModuleLogger("transcription/engines/pdf");

// 文件大小阈值：超过此值使用 Rust 代理，避免 IPC 阻塞（10MB）
const FILE_SIZE_THRESHOLD = 10 * 1024 * 1024;

export class PdfTranscriptionEngine implements ITranscriptionEngine {
  canHandle(asset: Asset): boolean {
    return asset.type === "document" && asset.mimeType === "application/pdf";
  }

  async execute(ctx: EngineContext): Promise<EngineResult> {
    const { task } = ctx;
    const config = getEffectiveConfig(ctx);
    const documentConfig = config.document;
    const mode = documentConfig.mode ?? "llm";

    if (mode === "ocr") {
      return this.executeOcr(ctx);
    }

    const { sendRequest, getNetworkStrategy } = useLlmRequest();
    const { getProfileById } = useLlmProfiles();

    const {
      modelIdentifier,
      prompt,
      temperature,
      maxTokens,
      timeout,
      enableRepetitionDetection,
    } = getModelParams(ctx, "document");
    const [profileId, modelId] = parseModelCombo(modelIdentifier);

    const profile = getProfileById(profileId);
    const model = profile?.models.find((m) => m.id === modelId);
    const capabilities = model?.capabilities || {};

    // 获取资产对象以检查文件大小
    const asset = await assetManagerEngine.getAssetById(task.assetId);
    const fileSize = asset?.size || 0;

    const finalPrompt = task.filename
      ? prompt.replace(/\{filename\}/g, task.filename)
      : prompt;

    let transcriptionText: string;

    // 1. 如果模型原生支持 PDF
    if (capabilities.document) {
      let pdfData: string;
      const networkStrategy = getNetworkStrategy(profileId);
      const useLocalFile =
        networkStrategy !== "native" && fileSize > FILE_SIZE_THRESHOLD;

      // 智能选择数据传输方式
      if (useLocalFile) {
        // 大文件：使用 local-file:// 协议，让 Rust 代理处理
        const basePath = await assetManagerEngine.getAssetBasePath();
        const fullPath = `${basePath}/${task.path}`.replace(/\\/g, "/");
        pdfData = `local-file://${fullPath}`;
      } else {
        // 小文件或原生模式：直接读取 Base64
        pdfData = await assetManagerEngine.getAssetBase64(task.path);
      }

      const content: LlmMessageContent[] = [
        { type: "text", text: finalPrompt },
        {
          type: "document",
          source: {
            type: "base64",
            media_type: "application/pdf",
            data: pdfData,
          },
        },
      ];
      const response = await sendRequest({
        profileId,
        modelId,
        messages: [{ role: "user", content }],
        inspectorContext: {
          toolName: "transcription",
          sessionId: task.assetId,
          purpose: "transcribe-pdf-native",
        },
        stream: false,
        temperature,
        maxTokens,
        hasLocalFile: useLocalFile,
        timeout: timeout * 1000,
        signal: ctx.signal,
      });
      transcriptionText = response.content;
    }
    // 2. 如果模型不支持 PDF 但支持视觉，则将 PDF 转为图片
    else if (capabilities.vision) {
      // 视觉分支需要二进制数据，直接读取（可能对大文件有 IPC 开销，但视觉分支通常用于小文件）
      const pdfBuffer = await assetManagerEngine.getAssetBinary(task.path);
      const images = await convertPdfToImages(pdfBuffer);
      if (images.length === 0) {
        throw new Error("PDF 转图片失败：未生成任何图片");
      }

      // 这里为了简化，暂不支持分批处理，只取前几页或全部
      const PDF_BATCH_SIZE = 5;
      if (images.length <= PDF_BATCH_SIZE) {
        const content: LlmMessageContent[] = [
          { type: "text", text: finalPrompt },
        ];
        for (const img of images) {
          content.push({ type: "image", imageBase64: img.base64 });
        }
        const response = await sendRequest({
          profileId,
          modelId,
          messages: [{ role: "user", content }],
          inspectorContext: {
            toolName: "transcription",
            sessionId: task.assetId,
            purpose: "transcribe-pdf-vision",
          },
          stream: false,
          temperature,
          maxTokens,
          timeout: timeout * 1000,
          signal: ctx.signal,
        });
        transcriptionText = response.content;
      } else {
        // 分批逻辑迁移
        const batchResults: string[] = [];
        for (let i = 0; i < images.length; i += PDF_BATCH_SIZE) {
          const batch = images.slice(i, i + PDF_BATCH_SIZE);
          const startLabel = `第 ${i + 1} 页`;
          const endLabel = `第 ${Math.min(i + PDF_BATCH_SIZE, images.length)} 页`;

          const batchContent: LlmMessageContent[] = [
            {
              type: "text",
              text: `${finalPrompt}\n\n[这是内容的 ${startLabel} 到 ${endLabel}]`,
            },
          ];

          for (const item of batch) {
            batchContent.push({ type: "image", imageBase64: item.base64 });
          }

          const response = await sendRequest({
            profileId,
            modelId,
            messages: [{ role: "user", content: batchContent }],
            inspectorContext: {
              toolName: "transcription",
              sessionId: task.assetId,
              purpose: "transcribe-pdf-vision-batch",
            },
            stream: false,
            temperature,
            maxTokens,
            timeout: timeout * 1000,
            signal: ctx.signal,
          });
          batchResults.push(
            `## ${startLabel}-${endLabel}\n\n${response.content}`
          );
        }
        transcriptionText = batchResults.join("\n---\n\n");
      }
    } else {
      throw new Error(
        "无法处理 PDF：模型既不支持原生 PDF，也不支持视觉（图片）"
      );
    }

    const cleanedText = cleanLlmOutput(transcriptionText);
    const repetition = detectRepetition(
      cleanedText,
      ctx.config.repetitionConfig
    );

    if (enableRepetitionDetection && repetition.isRepetitive) {
      throw new Error(`检测到模型回复存在严重复读: ${repetition.reason}`);
    }

    return {
      text: cleanedText,
      isEmpty: !cleanedText || cleanedText.trim().length === 0,
    };
  }

  private async executeOcr(ctx: EngineContext): Promise<EngineResult> {
    const { task } = ctx;
    const config = getEffectiveConfig(ctx);
    const documentConfig = config.document;
    const imageConfig = config.image;
    const ocrRegistry = new SmartOcrRegistry();
    const smartOcrConfig = await loadSmartOcrConfig();

    const ocrEngineConfig = this.resolveOcrEngineConfig(
      smartOcrConfig,
      documentConfig.ocrEngineType ?? "default",
      documentConfig,
      imageConfig
    );

    logger.info(`开始 PDF OCR 转写，正在将 PDF 转换为图片...`, {
      assetId: task.assetId,
      engineType: ocrEngineConfig.type,
    });

    const pdfBuffer = await assetManagerEngine.getAssetBinary(task.path);
    const images = await convertPdfToImages(pdfBuffer);
    if (images.length === 0) {
      throw new Error("PDF 转图片失败：未生成任何图片");
    }

    logger.info(`PDF 转换图片成功，共 ${images.length} 页，开始 OCR 识别...`, {
      assetId: task.assetId,
    });

    const blocks = images.map((img, index) => ({
      id: `${task.assetId}_page_${index}`,
      imageId: task.assetId,
      canvas: null as any,
      dataUrl: `data:image/png;base64,${img.base64}`,
      startY: 0,
      endY: img.height || 1100,
      x: 0,
      y: 0,
      width: img.width || 800,
      height: img.height || 1100,
    }));

    const batchSize = documentConfig.ocrBatchSize ?? 3;
    const results: OcrResult[] = [];

    for (let i = 0; i < blocks.length; i += batchSize) {
      if (ctx.signal?.aborted) {
        break;
      }

      const batchBlocks = blocks.slice(i, i + batchSize);
      logger.info(
        `正在识别第 ${Math.floor(i / batchSize) + 1}/${Math.ceil(blocks.length / batchSize)} 批 OCR (${batchBlocks.length} 页)...`,
        {
          assetId: task.assetId,
        }
      );

      const batchResults = (await ocrRegistry.runOcr(
        batchBlocks,
        ocrEngineConfig,
        {
          signal: ctx.signal,
        }
      )) as OcrResult[];

      results.push(...batchResults);
    }

    const failedResults = results.filter(
      (r: OcrResult) => r.status === "error"
    );
    const cancelledResults = results.filter(
      (r: OcrResult) => r.status === "cancelled"
    );

    // 拼接每一页的识别结果，并加上页码标识
    const text = results
      .map((r: OcrResult, index: number) => {
        if (r.ignored || !r.text?.trim()) return "";
        return `## 第 ${index + 1} 页\n\n${r.text.trim()}`;
      })
      .filter((t: string) => t)
      .join("\n\n---\n\n");

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
          ? `OCR 有 ${failedResults.length} 页识别失败`
          : undefined,
    };
  }

  private resolveOcrEngineConfig(
    smartOcrConfig: any,
    engineType: string,
    documentConfig: DocumentSpecificConfig,
    imageConfig: any
  ): any {
    if (engineType === "default") {
      const imgEngineType = imageConfig.ocrEngineType ?? "default";
      if (imgEngineType === "default") {
        return getCurrentEngineConfig(smartOcrConfig);
      }
      return this.resolveOcrEngineConfig(
        smartOcrConfig,
        imgEngineType,
        imageConfig,
        imageConfig
      );
    }

    switch (engineType) {
      case "tesseract":
        return {
          type: "tesseract",
          ...smartOcrConfig.engineConfigs.tesseract,
        };
      case "native":
        return {
          type: "native",
          ...smartOcrConfig.engineConfigs.native,
        };
      case "cloud":
        return {
          type: "cloud",
          ...smartOcrConfig.engineConfigs.cloud,
        };
      case "plugin":
        return this.resolvePluginOcrEngineConfig(
          smartOcrConfig,
          documentConfig
        );
      default:
        return getCurrentEngineConfig(smartOcrConfig);
    }
  }

  private resolvePluginOcrEngineConfig(
    smartOcrConfig: any,
    documentConfig: DocumentSpecificConfig
  ): any {
    if (documentConfig.ocrPluginExtensionId) {
      const ocrRegistry = new SmartOcrRegistry();
      const extension = ocrRegistry
        .listOcrExtensions()
        .find((item) => item.id === documentConfig.ocrPluginExtensionId);

      if (!extension) {
        throw new Error(
          `未找到 OCR 插件扩展: ${documentConfig.ocrPluginExtensionId}`
        );
      }
      const modelProfile =
        extension.modelProfiles.find(
          (profile) => profile.id === documentConfig.ocrPluginModelProfile
        )?.id ||
        extension.defaultModelProfile ||
        extension.modelProfiles[0]?.id;
      const language =
        extension.languages.find(
          (item) => item.id === documentConfig.ocrPluginLanguage
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
      ...smartOcrConfig.engineConfigs.plugin,
    };
  }
}
