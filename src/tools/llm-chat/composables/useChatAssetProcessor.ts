/**
 * 聊天附件处理 Composable
 * 负责处理所有与附件（Asset）相关的功能
 */

import type { Asset } from "@/types/asset-management";
import type { LlmMessageContent } from "@/llm-apis/common";
import { invoke } from "@tauri-apps/api/core";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("llm-chat/asset-processor");

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
    logger.error("资产导入超时", {
      timeout,
      stillPendingCount: assets.filter(
        (asset) => asset.importStatus === "pending" || asset.importStatus === "importing"
      ).length,
    });
    return false;
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
   * 支持图片和文档类型
   */
  const assetToMessageContent = async (asset: Asset): Promise<LlmMessageContent | null> => {
    try {
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
        // 判断是否为纯文本文件
        const textMimeTypes = [
          "text/plain",
          "text/markdown",
          "text/html",
          "text/css",
          "text/javascript",
          "application/json",
          "application/xml",
          "text/xml",
        ];

        const isTextFile =
          textMimeTypes.includes(asset.mimeType) ||
          asset.name.match(
            /\.(txt|md|json|xml|html|css|js|ts|tsx|jsx|py|java|c|cpp|h|hpp|rs|go|rb|php|sh|yaml|yml|toml|ini|conf|log)$/i
          );

        if (isTextFile) {
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
            logger.error("读取文本文件失败，尝试使用 base64", error as Error, {
              assetId: asset.id,
              assetName: asset.name,
            });
            // 如果读取失败，降级到 base64（用于非文本文档如 PDF）
          }
        }

        // 对于非文本文档（如 PDF），使用 base64 编码
        // 注意：只有 Claude API 支持 document 类型，其他 API 可能会忽略或报错
        const base64 = await convertAssetToBase64(asset.path);

        logger.debug("文档附件转换为 base64（仅 Claude 支持）", {
          assetId: asset.id,
          assetName: asset.name,
          mimeType: asset.mimeType,
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

      // 暂不支持的类型
      logger.warn("跳过不支持的附件类型", {
        assetType: asset.type,
        assetId: asset.id,
        assetName: asset.name,
      });
      return null;
    } catch (error) {
      logger.error("附件转换失败", error as Error, {
        assetId: asset.id,
        assetName: asset.name,
      });
      return null;
    }
  };

  return {
    waitForAssetsImport,
    convertAssetToBase64,
    assetToMessageContent,
  };
}
