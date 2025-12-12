/**
 * 聊天附件处理核心算法
 * 负责处理所有与附件（Asset）相关的无状态转换逻辑
 */

import type { Asset } from "@/types/asset-management";
import type { LlmMessageContent } from "@/llm-apis/common";
import type { ModelCapabilities } from "@/types/llm-profiles";
import type { ChatSettings } from "@/tools/llm-chat/composables/useChatSettings";
import { invoke } from "@tauri-apps/api/core";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { isTextFile } from "@/utils/fileTypeDetector";

const logger = createModuleLogger("llm-chat/core/asset-processor");
const errorHandler = createModuleErrorHandler("llm-chat/core/asset-processor");

/**
 * 决定资产内容的使用方式（转写文本 vs 原始媒体）
 */
export const resolveAssetContent = async (
  asset: Asset,
  settings?: ChatSettings,
  overrides?: { preferTranscribed?: boolean },
): Promise<{ useTranscription: boolean; content?: string }> => {
  const transcriptionData = asset.metadata?.derived?.transcription;
  const hasTranscription =
    transcriptionData && transcriptionData.path && !transcriptionData.error;

  if (!hasTranscription) {
    return { useTranscription: false };
  }

  let shouldTranscribe = false;

  if (overrides?.preferTranscribed === true) {
    shouldTranscribe = true;
  } else if (
    overrides?.preferTranscribed === undefined &&
    settings?.transcription?.enabled
  ) {
    shouldTranscribe = true;
  }

  if (shouldTranscribe) {
    try {
      const content = await invoke<string>("read_text_file", {
        relativePath: transcriptionData!.path,
      });
      return { useTranscription: true, content };
    } catch (error) {
      logger.warn("读取转写文件失败，降级为原始附件", {
        assetId: asset.id,
        assetName: asset.name,
        error,
      });
      return { useTranscription: false };
    }
  }

  return { useTranscription: false };
};

/**
 * 将 Asset 的二进制数据转换为 base64
 */
export const convertAssetToBase64 = async (
  assetPath: string,
): Promise<string> => {
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

/**
 * 将 Asset 转换为 LlmMessageContent
 */
export const assetToMessageContent = async (
  asset: Asset,
  capabilities?: ModelCapabilities,
  settings?: ChatSettings,
  overrides?: { preferTranscribed?: boolean },
): Promise<LlmMessageContent | null> => {
  try {
    const { useTranscription, content: transcriptionContent } =
      await resolveAssetContent(asset, settings, overrides);

    if (useTranscription && transcriptionContent) {
      logger.debug("使用转写内容作为附件消息", {
        assetId: asset.id,
        assetName: asset.name,
      });
      return {
        type: "text",
        text: `[转写: ${asset.name}]\n${transcriptionContent}`,
      };
    }

    if (asset.type === "image") {
      const base64 = await convertAssetToBase64(asset.path);
      logger.debug("图片附件转换为 base64", {
        assetId: asset.id,
        assetName: asset.name,
        mimeType: asset.mimeType,
        base64Length: base64.length,
      });
      return {
        type: "image",
        imageBase64: base64,
      };
    }

    if (asset.type === "document") {
      const isText = isTextFile(asset.name, asset.mimeType);
      if (isText) {
        try {
          const textContent = await invoke<string>("read_text_file", {
            relativePath: asset.path,
          });
          logger.debug("文本文件附件读取成功", {
            assetId: asset.id,
            assetName: asset.name,
            mimeType: asset.mimeType,
            contentLength: textContent.length,
          });
          return {
            type: "text",
            text: `[文件: ${asset.name}]\n\`\`\`\n${textContent}\n\`\`\``,
          };
        } catch (error) {
          errorHandler.handle(error as Error, {
            userMessage: "读取文本文件失败，尝试使用 base64",
            context: { assetId: asset.id, assetName: asset.name },
            showToUser: false,
          });
        }
      }

      const base64 = await convertAssetToBase64(asset.path);
      const documentFormat = capabilities?.documentFormat || "base64";

      if (documentFormat === "openai_file") {
        logger.debug("文档附件转换为 OpenAI Responses 格式", {
          assetId: asset.id,
          assetName: asset.name,
          mimeType: asset.mimeType,
          format: "file_data (base64 data URL)",
        });
        return {
          type: "document",
          documentSource: {
            type: "file_data",
            filename: asset.name,
            file_data: `data:${asset.mimeType};base64,${base64}`,
          },
        };
      } else {
        logger.debug("文档附件转换为 base64 格式", {
          assetId: asset.id,
          assetName: asset.name,
          mimeType: asset.mimeType,
          format: capabilities?.documentFormat || "base64 (default)",
        });
        return {
          type: "document",
          documentSource: {
            type: "base64",
            media_type: asset.mimeType,
            data: base64,
          },
        };
      }
    }

    logger.warn("跳过不支持的附件类型", {
      assetType: asset.type,
      assetId: asset.id,
      assetName: asset.name,
    });
    return null;
  } catch (error) {
    errorHandler.handle(error as Error, {
      userMessage: "附件转换失败",
      context: { assetId: asset.id, assetName: asset.name },
      showToUser: false,
    });
    return null;
  }
};

/**
 * 处理附件列表，分离出文本内容（包括转写）和需要作为媒体处理的附件
 */
export const processAssetsForMessage = async (
  attachments: Asset[],
  settings?: ChatSettings,
  overrides?: { preferTranscribed?: boolean },
): Promise<{ textContent: string; mediaAssets: Asset[] }> => {
  if (!attachments || attachments.length === 0) {
    return { textContent: "", mediaAssets: [] };
  }

  const textParts: string[] = [];
  const mediaAssets: Asset[] = [];

  for (const asset of attachments) {
    const { useTranscription, content: transcriptionContent } =
      await resolveAssetContent(asset, settings, overrides);

    if (useTranscription && transcriptionContent) {
      textParts.push(`[转写: ${asset.name}]\n${transcriptionContent}`);
      continue;
    }

    if (asset.type === "document" && isTextFile(asset.name, asset.mimeType)) {
      try {
        const textContent = await invoke<string>("read_text_file", {
          relativePath: asset.path,
        });
        textParts.push(`[文件: ${asset.name}]\n\`\`\`\n${textContent}\n\`\`\``);
      } catch (error) {
        logger.warn("读取文本附件失败", {
          assetId: asset.id,
          assetName: asset.name,
          error,
        });
      }
    } else if (
      asset.type === "image" ||
      asset.type === "video" ||
      asset.type === "audio" ||
      asset.type === "document"
    ) {
      mediaAssets.push(asset);
    }
  }

  return {
    textContent: textParts.join("\n\n"),
    mediaAssets,
  };
};
