import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import type { ContextProcessor, PipelineContext } from "../../types/pipeline";
import type { LlmMessageContent } from "@/llm-apis/common";
import { assetManagerEngine } from "@/composables/useAssetManager";
import { convertArrayBufferToBase64 } from "@/utils/base64";
import { convertPdfToImages } from "@/utils/pdfUtils";
import { getImageDimensions, resizeImage } from "@/utils/imageProcessor";
import type { ResizeOptions } from "@/utils/imageProcessor";

const logger = createModuleLogger("llm-chat/asset-resolver");
const errorHandler = createModuleErrorHandler("llm-chat/asset-resolver");

/**
 * 处理图片附件：包括模型安全缩放、用户压缩策略及 Base64 转换
 */
async function processImageAsset(
  asset: any,
  buffer: ArrayBuffer,
  context: PipelineContext,
): Promise<LlmMessageContent[]> {
  let imageBuffer: ArrayBuffer = buffer;

  // 1. 模型安全约束缩放
  const maxDim = context.capabilities?.maxImageDimension;
  if (maxDim && maxDim > 0) {
    try {
      const dims = await getImageDimensions(imageBuffer);
      if (dims.width > maxDim || dims.height > maxDim) {
        imageBuffer = await resizeImage(imageBuffer, {
          maxWidth: maxDim,
          maxHeight: maxDim,
        });
        logger.debug("模型安全约束：图片已自动缩放", {
          assetId: asset.id,
          original: `${dims.width}×${dims.height}`,
          maxDim,
        });
      }
    } catch (e) {
      logger.warn("模型安全约束缩放失败，保持原始图片", { assetId: asset.id, error: e });
    }
  }

  // 2. 用户压缩策略
  const imgConfig = context.agentConfig?.parameters?.imageCompression;
  if (imgConfig?.enabled) {
    try {
      const resizeOpts: ResizeOptions = {
        maxWidth: imgConfig.maxDimension || 4096,
        maxHeight: imgConfig.maxDimension || 4096,
      };
      if (imgConfig.format && imgConfig.format !== "original") {
        resizeOpts.format = imgConfig.format;
        resizeOpts.quality = imgConfig.quality ?? 0.85;
      }
      imageBuffer = await resizeImage(imageBuffer, resizeOpts);
      logger.debug("用户压缩策略已应用", { assetId: asset.id, ...imgConfig });
    } catch (e) {
      logger.warn("用户压缩策略失败，保持当前图片", { assetId: asset.id, error: e });
    }
  }

  const finalBase64 = await convertArrayBufferToBase64(imageBuffer);
  return [{ type: "image", imageBase64: finalBase64 }];
}

/**
 * 处理文档附件：支持 PDF 转图片序列或直接 Base64
 */
async function processDocumentAsset(
  asset: any,
  buffer: ArrayBuffer,
  context: PipelineContext,
): Promise<LlmMessageContent[]> {
  const capabilities = context.capabilities;

  // 核心改进：如果模型【完全不支持】原生文档，但支持视觉，且是 PDF，则现场转图片序列
  if (asset.mimeType === "application/pdf" && !capabilities?.document && capabilities?.vision) {
    logger.info("模型不支持原生 PDF 但支持视觉，正在现场将 PDF 转换为图片序列...", { assetName: asset.name });
    try {
      const pdfImages = await convertPdfToImages(buffer);
      if (pdfImages.length > 0) {
        return pdfImages.map((img) => ({ type: "image", imageBase64: img.base64 }));
      }
    } catch (pdfError) {
      logger.error("现场 PDF 转图片失败，回退到原始文档模式", pdfError as Error);
    }
  }

  const docBase64 = await convertArrayBufferToBase64(buffer);
  const documentFormat = capabilities?.documentFormat || "base64";
  if (documentFormat === "openai_file") {
    logger.warn("documentFormat: openai_file 尚未完全支持，暂时回退到 base64");
  }

  return [
    {
      type: "document",
      source: {
        type: "base64",
        media_type: asset.mimeType,
        data: docBase64,
      },
    },
  ];
}

/**
 * 处理音视频附件
 */
async function processMediaAsset(
  asset: any,
  buffer: ArrayBuffer,
  type: "audio" | "video",
): Promise<LlmMessageContent[]> {
  const base64 = await convertArrayBufferToBase64(buffer);
  return [
    {
      type,
      source: {
        type: "base64",
        media_type: asset.mimeType,
        data: base64,
      },
    } as LlmMessageContent,
  ];
}

export const assetResolver: ContextProcessor = {
  id: "asset-resolver",
  name: "Base64 资源解析器",
  description: "将消息中的二进制附件引用转换为最终发送给 LLM 的 Base64 格式。",
  priority: 10000, // 确保最后执行
  defaultEnabled: true,
  execute: async (context: PipelineContext) => {
    let processedCount = 0;
    let errorCount = 0;

    for (const msg of context.messages) {
      if (!msg._attachments || msg._attachments.length === 0) continue;

      const newContentParts: LlmMessageContent[] = [];

      // 1. 保留原有内容
      if (typeof msg.content === "string") {
        if (msg.content.trim()) newContentParts.push({ type: "text", text: msg.content });
      } else if (Array.isArray(msg.content)) {
        newContentParts.push(...msg.content);
      }

      // 2. 处理附件
      for (const asset of msg._attachments) {
        try {
          if (!["image", "document", "audio", "video"].includes(asset.type)) {
            logger.warn("跳过不支持的附件类型", { assetType: asset.type, assetName: asset.name });
            continue;
          }

          const buffer = await assetManagerEngine.getAssetBinary(asset.path);
          let parts: LlmMessageContent[] = [];

          switch (asset.type) {
            case "image":
              parts = await processImageAsset(asset, buffer, context);
              break;
            case "document":
              parts = await processDocumentAsset(asset, buffer, context);
              break;
            case "audio":
            case "video":
              parts = await processMediaAsset(asset, buffer, asset.type as any);
              break;
          }

          newContentParts.push(...parts);
          processedCount++;
        } catch (error) {
          errorCount++;
          errorHandler.handle(error as Error, {
            userMessage: `附件 [${asset.name}] 解析失败`,
            context: { assetId: asset.id },
            showToUser: false,
          });
        }
      }

      msg.content = newContentParts;
    }

    if (processedCount > 0 || errorCount > 0) {
      logger.info("资产解析完成", { processedCount, errorCount });
      context.logs.push({
        processorId: "asset-resolver",
        level: errorCount > 0 ? "warn" : "info",
        message: `解析了 ${processedCount} 个附件，失败 ${errorCount} 个。`,
      });
    }
  },
};
