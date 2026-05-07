import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import type { ContextProcessor, PipelineContext } from "../../types/pipeline";
import type { LlmMessageContent } from "@/llm-apis/common";
import { assetManagerEngine } from "@/composables/useAssetManager";
import { convertArrayBufferToBase64 } from "@/utils/base64";
import { convertPdfToImages } from "@/utils/pdfUtils";
import { getImageDimensions, resizeImage } from "@/utils/imageProcessor";

const logger = createModuleLogger("llm-chat/asset-resolver");
const errorHandler = createModuleErrorHandler("llm-chat/asset-resolver");

export const assetResolver: ContextProcessor = {
  id: "asset-resolver",
  name: "Base64 资源解析器",
  description: "将消息中的二进制附件引用转换为最终发送给 LLM 的 Base64 格式。",
  priority: 10000, // 确保最后执行
  defaultEnabled: true,
  execute: async (context: PipelineContext) => {
    const capabilities = context.capabilities;

    let processedCount = 0;
    let errorCount = 0;

    for (const msg of context.messages) {
      // 如果没有附件，跳过
      if (!msg._attachments || msg._attachments.length === 0) {
        continue;
      }

      const originalContent = msg.content;
      const newContentParts: LlmMessageContent[] = [];

      // 1. 保留原有内容
      if (typeof originalContent === "string") {
        if (originalContent.trim()) {
          newContentParts.push({ type: "text", text: originalContent });
        }
      } else if (Array.isArray(originalContent)) {
        newContentParts.push(...originalContent);
      }

      // 2. 处理附件
      for (const asset of msg._attachments) {
        try {
          // 获取二进制数据并转换为 Base64
          if (["image", "document", "audio", "video"].includes(asset.type)) {
            const buffer = await assetManagerEngine.getAssetBinary(asset.path);
            const base64 = await convertArrayBufferToBase64(buffer);

            if (asset.type === "image") {
              // ---- 两层图片缩放处理 ----
              let finalBase64 = base64;

              // 第一层：模型安全约束缩放
              const maxDim = context.capabilities?.maxImageDimension;
              if (maxDim && maxDim > 0) {
                try {
                  const dims = await getImageDimensions(finalBase64);
                  if (dims.width > maxDim || dims.height > maxDim) {
                    const dataUrl = await resizeImage(finalBase64, {
                      maxWidth: maxDim,
                      maxHeight: maxDim,
                    });
                    const commaIdx = dataUrl.indexOf(",");
                    finalBase64 = commaIdx !== -1 ? dataUrl.slice(commaIdx + 1) : dataUrl;

                    logger.debug("模型安全约束：图片已自动缩放", {
                      assetId: asset.id,
                      original: `${dims.width}×${dims.height}`,
                      maxDim,
                    });
                  }
                } catch (e) {
                  logger.warn("模型安全约束缩放失败，保持原始图片", {
                    assetId: asset.id,
                    error: e,
                  });
                }
              }

              // 第二层：用户压缩策略
              const imgConfig = context.agentConfig?.parameters?.imageCompression;
              if (imgConfig?.enabled) {
                try {
                  const resizeOpts: any = {};
                  if (imgConfig.maxDimension && imgConfig.maxDimension > 0) {
                    resizeOpts.maxWidth = imgConfig.maxDimension;
                    resizeOpts.maxHeight = imgConfig.maxDimension;
                  }
                  if (imgConfig.format && imgConfig.format !== "original") {
                    resizeOpts.format = imgConfig.format;
                    resizeOpts.quality = imgConfig.quality ?? 0.85;
                  }

                  if (resizeOpts.maxWidth || resizeOpts.format) {
                    if (!resizeOpts.maxWidth) {
                      resizeOpts.maxWidth = 4096;
                      resizeOpts.maxHeight = 4096;
                    }
                    const dataUrl = await resizeImage(finalBase64, resizeOpts);
                    const commaIdx = dataUrl.indexOf(",");
                    finalBase64 = commaIdx !== -1 ? dataUrl.slice(commaIdx + 1) : dataUrl;

                    logger.debug("用户压缩策略已应用", {
                      assetId: asset.id,
                      format: imgConfig.format,
                      quality: imgConfig.quality,
                      maxDimension: imgConfig.maxDimension,
                    });
                  }
                } catch (e) {
                  logger.warn("用户压缩策略失败，保持当前图片", {
                    assetId: asset.id,
                    error: e,
                  });
                }
              }

              logger.debug("图片附件处理完成", {
                assetId: asset.id,
                assetName: asset.name,
                base64Length: finalBase64.length,
              });
              newContentParts.push({
                type: "image",
                imageBase64: finalBase64,
              });
            } else if (asset.type === "document") {
              // 核心改进：如果模型【完全不支持】原生文档，但支持视觉，才现场转图片序列
              if (asset.mimeType === "application/pdf" && !capabilities?.document && capabilities?.vision) {
                logger.info("模型不支持原生 PDF 但支持视觉，正在现场将 PDF 转换为图片序列...", {
                  assetName: asset.name,
                });
                try {
                  const pdfImages = await convertPdfToImages(buffer);
                  if (pdfImages.length > 0) {
                    for (const img of pdfImages) {
                      newContentParts.push({
                        type: "image",
                        imageBase64: img.base64,
                      });
                    }
                    processedCount++;
                    continue; // 成功转换，跳过后续 document 处理
                  }
                } catch (pdfError) {
                  logger.error("现场 PDF 转图片失败，回退到原始文档模式", pdfError as Error);
                }
              }

              const documentFormat = capabilities?.documentFormat || "base64";
              if (documentFormat === "openai_file") {
                logger.warn("documentFormat: openai_file 尚未完全支持，暂时回退到 base64");
              }
              newContentParts.push({
                type: "document",
                source: {
                  type: "base64",
                  media_type: asset.mimeType,
                  data: base64,
                },
              });
            } else if (asset.type === "audio") {
              newContentParts.push({
                type: "audio",
                source: {
                  type: "base64",
                  media_type: asset.mimeType,
                  data: base64,
                },
              });
            } else if (asset.type === "video") {
              newContentParts.push({
                type: "video",
                source: {
                  type: "base64",
                  media_type: asset.mimeType,
                  data: base64,
                },
              });
            }
            processedCount++;
          } else {
            logger.warn("跳过不支持的附件类型", {
              assetType: asset.type,
              assetId: asset.id,
              assetName: asset.name,
            });
          }
        } catch (error) {
          errorCount++;
          errorHandler.handle(error as Error, {
            userMessage: `附件 [${asset.name}] 解析失败`,
            context: { assetId: asset.id },
            showToUser: false,
          });
          logger.error("附件解析失败", error, { assetId: asset.id });
        }
      }

      // 3. 更新消息内容
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
