import { useTranscriptionManager } from "../../composables/useTranscriptionManager";
import { isTextFile } from "@/utils/fileTypeDetector";
import { smartDecode } from "@/utils/encoding";
import { createModuleLogger } from "@/utils/logger";
import type { Asset } from "@/types/asset-management";
import { assetManagerEngine } from "@/composables/useAssetManager";

const logger = createModuleLogger("llm-chat/attachment-resolver");

export interface ResolvedAttachment {
  type: "text" | "media";
  /** 格式化后的文本内容 (包含 [文件: xxx] 或 [转写: xxx] 包装) */
  content?: string;
  /** 纯文本内容 (不包含包装) */
  rawText?: string;
  asset: Asset;
  source?: "file" | "transcription";
}

/**
 * 解析附件内容
 * 尝试将附件解析为文本（读取文本文件或获取转写内容），如果无法解析为文本则返回媒体类型
 *
 * @param asset 资产对象
 * @param modelId 当前模型 ID
 * @param profileId 当前配置 ID
 * @param options 选项
 * @param options.force 强制使用转写
 * @param options.messageDepth 消息深度（用于判断是否触发强制转写）
 */
export async function resolveAttachmentContent(
  asset: Asset,
  modelId: string,
  profileId: string,
  options: { force?: boolean; messageDepth?: number } = {}
): Promise<ResolvedAttachment> {
  const transcriptionManager = useTranscriptionManager();

  try {
    // 1. 优先处理纯文本文件
    if (asset.type === "document" && isTextFile(asset.name, asset.mimeType)) {
      try {
        // 使用资产管理器获取二进制数据，然后在前端解码
        const buffer = await assetManagerEngine.getAssetBinary(asset.path);
        const textContent = smartDecode(buffer);
        
        // 记录日志：读取成功
        // logger.debug("读取文本附件内容", { assetId: asset.id, assetName: asset.name });

        return {
          type: "text",
          content: `\n[文件: ${asset.name}]\n\`\`\`\n${textContent}\n\`\`\`\n`,
          rawText: textContent,
          asset,
          source: "file",
        };
      } catch (err) {
        logger.warn("读取文本附件失败，将尝试作为媒体附件处理", {
          assetId: asset.id,
          error: err,
        });
        // 读取失败，继续走下面的流程（虽然下面可能也处理不了，最终会留给 asset-resolver 报错或作为媒体处理）
      }
    }

    // 2. 检查是否需要转写 (针对 Image/Audio/Video)
    // 使用 computeWillUseTranscription，它同时考虑模型能力和消息深度
    let shouldTranscribe = transcriptionManager.computeWillUseTranscription(
      asset,
      modelId,
      profileId,
      options.messageDepth
    );

    // 如果外部强制要求，则覆盖判断
    if (options.force) {
      shouldTranscribe = true;
    }

    // 3. 尝试获取转写内容
    const transcriptionText = await transcriptionManager.getTranscriptionText(asset);

    // 决策逻辑：
    // 只有在有转写内容且确实需要转写时，才使用转写内容
    // 如果模型支持该媒体（shouldTranscribe = false），则忽略已存在的转写，优先使用原始媒体。
    if (transcriptionText && shouldTranscribe) {
      // logger.debug("应用转写内容 (模型需要或策略强制)", { assetId: asset.id, assetName: asset.name });

      return {
        type: "text",
        content: `\n[转写: ${asset.name}]\n${transcriptionText}\n`,
        rawText: transcriptionText,
        asset,
        source: "transcription",
      };
    }

    if (shouldTranscribe) {
      logger.warn("需要转写但未找到转写结果 (可能失败或超时)，保留原始附件", {
        assetId: asset.id,
      });
    }

    // 4. 既不是文本文件，也没有转写内容（或者不需要转写） -> 视为媒体附件
    return {
      type: "media",
      asset,
    };
  } catch (error) {
    logger.error("解析附件内容出错", error, { assetId: asset.id });
    // 出错时降级为媒体附件，避免阻断流程
    return {
      type: "media",
      asset,
    };
  }
}