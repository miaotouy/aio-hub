/**
 * 消息构建器 Composable
 * 负责将原始消息（文本+附件）转换为适合 Token 计算或 LLM 输入的格式
 *
 * 这是一个核心的消息处理模块，为以下场景提供统一的消息格式化能力：
 * 1. Token 计算 - prepareSimpleMessageForTokenCalc
 * 2. 构建发送给 LLM 的消息 - buildMessageContentForLlm
 * 3. 上下文分析 - prepareStructuredMessageForAnalysis
 */

import type { Asset } from "@/types/asset-management";
import type { LlmMessageContent } from "@/llm-apis/common";
import type { ModelCapabilities } from "@/types/llm-profiles";
import { useChatAssetProcessor } from "./useChatAssetProcessor";
import { createModuleLogger } from "@/utils/logger";
import { isTextFile } from "@/utils/fileTypeDetector";

const logger = createModuleLogger("llm-chat/message-builder");

export function useMessageBuilder() {
  const { getTextAttachmentsContent, assetToMessageContent } = useChatAssetProcessor();

  /**
   * 为 Token 计算准备简单消息格式
   *
   * 将文本附件内容提取并合并到文本中，同时分离出图片附件
   * 这样 TokenCalculator 可以分别计算文本和图片的 token
   *
   * @param text 原始文本
   * @param attachments 附件列表
   * @returns 合并后的文本和媒体附件列表（图片、视频、音频）
   */
  const prepareSimpleMessageForTokenCalc = async (
    text: string,
    attachments?: Asset[]
  ): Promise<{ combinedText: string; mediaAttachments: Asset[] }> => {
    if (!attachments || attachments.length === 0) {
      return {
        combinedText: text,
        mediaAttachments: [],
      };
    }

    // 提取所有文本附件的内容
    const textAttachmentsContent = await getTextAttachmentsContent(attachments);

    // 合并原始文本和文本附件内容
    const combinedText = textAttachmentsContent
      ? `${text}\n\n${textAttachmentsContent}`
      : text;

    // 过滤出媒体附件（图片、视频、音频）
    // 这些附件需要单独计算 Token，不能合并到文本中
    const mediaAttachments = attachments.filter(asset =>
      asset.type === 'image' || asset.type === 'video' || asset.type === 'audio'
    );

    logger.debug("消息准备完成（用于 Token 计算）", {
      originalTextLength: text.length,
      textAttachmentsCount: attachments.filter(a => a.type === 'document').length,
      textAttachmentsContentLength: textAttachmentsContent.length,
      combinedTextLength: combinedText.length,
      mediaAttachmentsCount: mediaAttachments.length,
    });

    return {
      combinedText,
      mediaAttachments,
    };
  };

  /**
   * 为上下文分析准备结构化消息
   * 
   * 将消息拆解为：原始文本、文本附件内容列表、图片附件列表、其他附件列表
   * 用于 UI 展示和分项 Token 计算，避免将附件内容合并到正文中
   * 
   * @param text 原始文本
   * @param attachments 附件列表
   */
  const prepareStructuredMessageForAnalysis = async (
    text: string,
    attachments?: Asset[]
  ): Promise<{
    originalText: string;
    textAttachments: Array<{ asset: Asset; content: string }>;
    imageAttachments: Asset[];
    videoAttachments: Asset[];
    audioAttachments: Asset[];
    otherAttachments: Asset[];
  }> => {
    const result = {
      originalText: text,
      textAttachments: [] as Array<{ asset: Asset; content: string }>,
      imageAttachments: [] as Asset[],
      videoAttachments: [] as Asset[],
      audioAttachments: [] as Asset[],
      otherAttachments: [] as Asset[],
    };

    if (!attachments || attachments.length === 0) {
      return result;
    }

    for (const asset of attachments) {
      if (asset.type === 'image') {
        result.imageAttachments.push(asset);
      } else if (asset.type === 'video') {
        result.videoAttachments.push(asset);
      } else if (asset.type === 'audio') {
        result.audioAttachments.push(asset);
      } else if (asset.type === 'document' && isTextFile(asset.name, asset.mimeType)) {
        // 对于文本文件，尝试读取内容
        try {
          // 这里我们利用 assetToMessageContent 来获取格式化后的内容
          // 注意：这里不传 capabilities，因为我们只想要基础的文本内容
          const content = await assetToMessageContent(asset);
          if (content && content.type === 'text' && content.text) {
            result.textAttachments.push({
              asset,
              content: content.text
            });
          } else {
            // 如果转换失败或不是文本类型（虽然检测说是文本文件），归类为其他
            result.otherAttachments.push(asset);
          }
        } catch (error) {
          logger.warn("读取文本附件内容失败", { assetId: asset.id, error });
          result.otherAttachments.push(asset);
        }
      } else {
        result.otherAttachments.push(asset);
      }
    }

    return result;
  };

  /**
   * 构建发送给 LLM 的消息内容
   *
   * 将文本和附件转换为 LLM API 所需的格式：
   * - 如果没有附件，返回纯文本
   * - 如果有附件，返回 LlmMessageContent[] 数组（多模态格式）
   *
   * @param text 消息文本内容
   * @param attachments 附件列表（可选）
   * @param capabilities 模型能力（可选，用于智能附件处理）
   * @returns 纯文本或多模态消息内容数组
   */
  const buildMessageContentForLlm = async (
    text: string,
    attachments?: Asset[],
    capabilities?: ModelCapabilities
  ): Promise<string | LlmMessageContent[]> => {
    // 如果没有附件，直接返回文本
    if (!attachments || attachments.length === 0) {
      return text;
    }

    const messageContents: LlmMessageContent[] = [];

    // 添加文本内容（如果有）
    if (text && text.trim() !== "") {
      messageContents.push({
        type: "text",
        text: text,
      });
    }

    // 转换附件
    for (const asset of attachments) {
      const attachmentContent = await assetToMessageContent(asset, capabilities);
      if (attachmentContent) {
        messageContents.push(attachmentContent);
        logger.debug("附件转换成功", {
          assetId: asset.id,
          assetName: asset.name,
          contentType: attachmentContent.type,
        });
      } else {
        logger.warn("附件转换失败或跳过", {
          assetId: asset.id,
          assetName: asset.name,
          assetType: asset.type,
        });
      }
    }

    logger.debug("多模态消息构建完成", {
      textLength: text.length,
      attachmentCount: attachments.length,
      finalPartsCount: messageContents.length,
    });

    return messageContents;
  };

  return {
    prepareSimpleMessageForTokenCalc,
    prepareStructuredMessageForAnalysis,
    buildMessageContentForLlm,
  };
}