/**
 * 聊天附件处理 Composable
 * 负责处理所有与附件（Asset）相关的功能
 */

import type { Asset } from "@/types/asset-management";
import type { LlmMessageContent } from "@/llm-apis/common";
import type { ModelCapabilities } from "@/types/llm-profiles";
import type { ChatSettings } from "./useChatSettings";
import { invoke } from "@tauri-apps/api/core";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { isTextFile } from "@/utils/fileTypeDetector";

const logger = createModuleLogger("llm-chat/asset-processor");
const errorHandler = createModuleErrorHandler("llm-chat/asset-processor");

export function useChatAssetProcessor() {
  /**
   * 等待资产导入完成
   * @param assets 资产数组
   * @param timeout 超时时间（毫秒），默认 30 秒
   * @returns 是否所有资产都成功导入
   */
  const waitForAssetsImport = async (
    assets: Asset[],
    timeout: number = 30000
  ): Promise<boolean> => {
    const startTime = Date.now();
    const pendingAssets = assets.filter(
      (asset) => asset.importStatus === "pending" || asset.importStatus === "importing"
    );

    if (pendingAssets.length === 0) {
      return true; // 没有待导入的资产
    }

    logger.info("等待资产导入完成", {
      totalAssets: assets.length,
      pendingCount: pendingAssets.length,
    });

    // 轮询检查导入状态
    while (Date.now() - startTime < timeout) {
      const stillPending = assets.filter(
        (asset) => asset.importStatus === "pending" || asset.importStatus === "importing"
      );

      if (stillPending.length === 0) {
        // 检查是否有导入失败的
        const failedAssets = assets.filter((asset) => asset.importStatus === "error");
        if (failedAssets.length > 0) {
          logger.warn("部分资产导入失败", {
            failedCount: failedAssets.length,
            failedAssets: failedAssets.map((a) => ({
              id: a.id,
              name: a.name,
              error: a.importError,
            })),
          });
          // 即使有失败的，也返回 true，让用户决定是否继续
          return true;
        }

        logger.info("所有资产导入完成");
        return true;
      }

      // 等待 100ms 后再次检查
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // 超时
    errorHandler.handle(new Error("资产导入超时"), {
     userMessage: "资产导入超时",
      context: {
        timeout,
        stillPendingCount: assets.filter(
          (asset) => asset.importStatus === "pending" || asset.importStatus === "importing"
        ).length,
      },
      showToUser: false,
    });
    return false;
  };

  /**
   * 决定资产内容的使用方式（转写文本 vs 原始媒体）
   * @param asset 资产对象
   * @param settings 聊天设置
   * @param overrides 临时覆盖设置
   */
  const resolveAssetContent = async (
    asset: Asset,
    settings?: ChatSettings,
    overrides?: { preferTranscribed?: boolean }
  ): Promise<{ useTranscription: boolean; content?: string }> => {
    // 1. 检查是否存在成功的转写数据
    const transcriptionData = asset.metadata?.derived?.transcription;
    const hasTranscription =
      transcriptionData && transcriptionData.path && !transcriptionData.error;

    if (!hasTranscription) {
      return { useTranscription: false };
    }

    let shouldTranscribe = false;

    // 2. 检查 overrides
    if (overrides?.preferTranscribed === true) {
      shouldTranscribe = true;
    }
    // 3. 检查全局设置 (仅当 overrides 未指定时)
    else if (
      overrides?.preferTranscribed === undefined &&
      settings?.transcription?.enabled &&
      settings?.transcription?.preferTranscribed
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
        // 读取失败，降级
        return { useTranscription: false };
      }
    }

    return { useTranscription: false };
  };

  /**
   * 将 Asset 的二进制数据转换为 base64
   * @param assetPath 资源相对路径
   * @returns base64 编码的字符串
   */
  const convertAssetToBase64 = async (assetPath: string): Promise<string> => {
    // 读取二进制数据
    const binaryData = await invoke<number[]>("get_asset_binary", {
      relativePath: assetPath,
    });

    // 转换为 Uint8Array
    const uint8Array = new Uint8Array(binaryData);

    // 转换为 base64（使用分块处理避免调用栈溢出）
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
   * 支持图片和文档类型，以及转写内容
   * @param asset 要转换的资产
   * @param capabilities 模型能力（可选，用于智能文档格式选择）
   * @param settings 聊天设置（可选，用于决策是否使用转写）
   * @param overrides 临时覆盖设置（可选）
   */
  const assetToMessageContent = async (
    asset: Asset,
    capabilities?: ModelCapabilities,
    settings?: ChatSettings,
    overrides?: { preferTranscribed?: boolean }
  ): Promise<LlmMessageContent | null> => {
    try {
      // 0. 尝试使用转写内容
      const { useTranscription, content: transcriptionContent } = await resolveAssetContent(
        asset,
        settings,
        overrides
      );

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

      // 处理图片类型
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

      // 处理文档类型
      if (asset.type === "document") {
        // 使用统一的文本文件判断工具
        const isText = isTextFile(asset.name, asset.mimeType);

        if (isText) {
          // 读取文本文件内容
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

            // 返回格式化的文本内容
            return {
              type: "text",
              text: `[文件: ${asset.name}]\n\`\`\`\n${textContent}\n\`\`\``,
            };
          } catch (error) {
            errorHandler.handle(error as Error, {
             userMessage: "读取文本文件失败，尝试使用 base64",
              context: {
                assetId: asset.id,
                assetName: asset.name,
              },
              showToUser: false,
            });
            // 如果读取失败，降级到 base64（用于非文本文档如 PDF）
          }
        }

        // 对于非文本文档（如 PDF）：根据模型能力选择合适的格式
        const base64 = await convertAssetToBase64(asset.path);
        
        // 根据模型的文档格式生成对应的内容
        const documentFormat = capabilities?.documentFormat || 'base64';
        
        if (documentFormat === 'openai_file') {
          // OpenAI Responses 格式：使用 file_data（base64 data URL）
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
          // Claude/Gemini 格式：使用 base64（默认格式，也作为兜底方案）
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

      // 暂不支持的类型
      logger.warn("跳过不支持的附件类型", {
        assetType: asset.type,
        assetId: asset.id,
        assetName: asset.name,
      });
      return null;
    } catch (error) {
      errorHandler.handle(error as Error, {
       userMessage: "附件转换失败",
        context: {
          assetId: asset.id,
          assetName: asset.name,
        },
        showToUser: false,
      });
      return null;
    }
  };

  /**
   * 处理附件列表，分离出文本内容（包括转写）和需要作为媒体处理的附件
   * 用于 Token 计算和消息构建
   *
   * @param attachments 附件列表
   * @param settings 聊天设置
   * @param overrides 覆盖设置
   */
  const processAssetsForMessage = async (
    attachments: Asset[],
    settings?: ChatSettings,
    overrides?: { preferTranscribed?: boolean }
  ): Promise<{ textContent: string; mediaAssets: Asset[] }> => {
    if (!attachments || attachments.length === 0) {
      return { textContent: "", mediaAssets: [] };
    }

    const textParts: string[] = [];
    const mediaAssets: Asset[] = [];

    for (const asset of attachments) {
      // 1. 尝试使用转写
      const { useTranscription, content: transcriptionContent } = await resolveAssetContent(
        asset,
        settings,
        overrides
      );

      if (useTranscription && transcriptionContent) {
        textParts.push(`[转写: ${asset.name}]\n${transcriptionContent}`);
        continue; // 已作为文本处理，跳过后续媒体处理
      }

      // 2. 如果不使用转写，检查是否为纯文本文件
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
          // 读取失败，如果是非文本文档，可能需要作为媒体处理？
          // 目前逻辑是如果读取失败就忽略，或者可以放入 mediaAssets 让上层决定
          // 保持原有行为：忽略
        }
      } else if (
        asset.type === "image" ||
        asset.type === "video" ||
        asset.type === "audio" ||
        asset.type === "document" // 非文本文档（如PDF）也作为媒体处理
      ) {
        // 3. 其他情况作为媒体附件
        mediaAssets.push(asset);
      }
    }

    return {
      textContent: textParts.join("\n\n"),
      mediaAssets,
    };
  };

  /**
   * 获取文本附件的完整内容（用于 Token 计算）
   * @deprecated 请使用 processAssetsForMessage 替代
   */
  const getTextAttachmentsContent = async (attachments?: Asset[]): Promise<string> => {
    const { textContent } = await processAssetsForMessage(attachments || []);
    return textContent;
  };

  return {
    waitForAssetsImport,
    convertAssetToBase64,
    assetToMessageContent,
    getTextAttachmentsContent,
    processAssetsForMessage,
    resolveAssetContent,
  };
}
