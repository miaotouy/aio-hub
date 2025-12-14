import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import type { ContextProcessor, PipelineContext } from "../../types/pipeline";
import { invoke } from "@tauri-apps/api/core";
import type { LlmMessageContent } from "@/llm-apis/common";

const logger = createModuleLogger("llm-chat/asset-resolver");
const errorHandler = createModuleErrorHandler("llm-chat/asset-resolver");

/**
 * 将 Asset 的二进制数据转换为 base64
 * (内联实现，避免依赖已移除的外部工具)
 */
const convertAssetToBase64 = async (assetPath: string): Promise<string> => {
  const binaryData = await invoke<number[]>("get_asset_binary", {
    relativePath: assetPath,
  });
  const uint8Array = new Uint8Array(binaryData);
  let base64 = "";
  const chunkSize = 0x8000; // 32KB chunks
  for (let i = 0; i < uint8Array.length; i += chunkSize) {
    const chunk = uint8Array.subarray(i, i + chunkSize);
    base64 += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return btoa(base64);
};

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
          if (asset.type === "image") {
            const base64 = await convertAssetToBase64(asset.path);
            logger.debug("图片附件转换为 base64", {
              assetId: asset.id,
              assetName: asset.name,
              base64Length: base64.length,
            });
            newContentParts.push({
              type: "image",
              imageBase64: base64,
            });
            processedCount++;
          } else if (asset.type === "document") {
            // 二进制文档处理 (文本文件已在 transcription-processor 中处理)
            const base64 = await convertAssetToBase64(asset.path);
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
            processedCount++;
          } else if (asset.type === "audio" || asset.type === "video") {
            // 音频和视频处理：作为 document 类型发送 (base64)
            // 这适用于支持原生音视频输入的模型（如 Gemini 1.5 Pro）
            const base64 = await convertAssetToBase64(asset.path);
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