import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import type { ContextProcessor, PipelineContext } from "../../types/pipeline";
import type { LlmMessageContent } from "@/llm-apis/common";
import { assetManagerEngine } from "@/composables/useAssetManager";
import { convertArrayBufferToBase64 } from "@/utils/base64";

const logger = createModuleLogger("llm-chat/asset-resolver");
const errorHandler = createModuleErrorHandler("llm-chat/asset-resolver");

export const assetResolver: ContextProcessor = {
  id: "asset-resolver",
  name: "Base64 资源解析器",
  description: "将消息中的二进制附件引用转换为最终发送给 LLM 的 Base64 格式。",
  priority: 10000, // 确保最后执行
  isCore: true,
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
          // 统一处理所有类型的 Base64 转换逻辑，减少重复代码
          if (["image", "document", "audio", "video"].includes(asset.type)) {
            const buffer = await assetManagerEngine.getAssetBinary(asset.path);
            const base64 = await convertArrayBufferToBase64(buffer);

            if (asset.type === "image") {
              logger.debug("图片附件转换为 base64", {
                assetId: asset.id,
                assetName: asset.name,
                base64Length: base64.length,
              });
              newContentParts.push({
                type: "image",
                imageBase64: base64,
              });
            } else if (asset.type === "document") {
              const documentFormat = capabilities?.documentFormat || "base64";
              if (documentFormat === "openai_file") {
                newContentParts.push({
                  type: "document",
                  documentSource: {
                    type: "file_data",
                    filename: asset.name,
                    file_data: `data:${asset.mimeType};base64,${base64}`,
                  },
                });
              } else {
                newContentParts.push({
                  type: "document",
                  documentSource: {
                    type: "base64",
                    media_type: asset.mimeType,
                    data: base64,
                  },
                });
              }
            } else {
              // audio or video
              logger.debug("音视频附件转换为 base64", {
                assetId: asset.id,
                assetName: asset.name,
                type: asset.type,
                base64Length: base64.length,
              });
              newContentParts.push({
                type: "document",
                documentSource: {
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
            showToUser: false
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