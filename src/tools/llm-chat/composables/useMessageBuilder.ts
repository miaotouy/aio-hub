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
import type { ChatSettings } from "./useChatSettings";
import { useChatAssetProcessor } from "./useChatAssetProcessor";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("llm-chat/message-builder");

export function useMessageBuilder() {
  const { processAssetsForMessage, assetToMessageContent } = useChatAssetProcessor();

  /**
   * 为 Token 计算准备简单消息格式
   *
   * 将文本附件内容（包括转写）提取并合并到文本中，同时分离出媒体附件
   * 这样 TokenCalculator 可以分别计算文本和图片的 token
   *
   * @param text 原始文本
   * @param attachments 附件列表
   * @param settings 聊天设置
   * @param overrides 覆盖设置
   * @returns 合并后的文本和媒体附件列表（图片、视频、音频）
   */
  const prepareSimpleMessageForTokenCalc = async (
    text: string,
    attachments?: Asset[],
    settings?: ChatSettings,
    overrides?: { preferTranscribed?: boolean }
  ): Promise<{ combinedText: string; mediaAttachments: Asset[] }> => {
    if (!attachments || attachments.length === 0) {
      return {
        combinedText: text,
        mediaAttachments: [],
      };
    }

    // 处理附件：分离文本内容（含转写）和媒体附件
    const { textContent, mediaAssets } = await processAssetsForMessage(
      attachments,
      settings,
      overrides
    );

    // 合并原始文本和文本附件内容
    const combinedText = textContent ? `${text}\n\n${textContent}` : text;

    logger.debug("消息准备完成（用于 Token 计算）", {
      originalTextLength: text.length,
      textAttachmentsContentLength: textContent.length,
      combinedTextLength: combinedText.length,
      mediaAttachmentsCount: mediaAssets.length,
    });

    return {
      combinedText,
      mediaAttachments: mediaAssets,
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
   * @param settings 聊天设置
   */
  const prepareStructuredMessageForAnalysis = async (
    text: string,
    attachments?: Asset[],
    settings?: ChatSettings
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
      // 尝试使用转写
      // 注意：这里我们使用 assetToMessageContent 来复用转写决策逻辑
      // 但我们需要手动分类
      const content = await assetToMessageContent(asset, undefined, settings);

      if (content && content.type === "text" && content.text) {
        // 如果返回了文本（无论是文本文件还是转写），都归类为 textAttachments
        result.textAttachments.push({
          asset,
          content: content.text,
        });
        continue;
      }

      // 如果没有转为文本，则按类型归类
      if (asset.type === "image") {
        result.imageAttachments.push(asset);
      } else if (asset.type === "video") {
        result.videoAttachments.push(asset);
      } else if (asset.type === "audio") {
        result.audioAttachments.push(asset);
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
   * @param settings 聊天设置（可选）
   * @param overrides 覆盖设置（可选）
   * @returns 纯文本或多模态消息内容数组
   */
  const buildMessageContentForLlm = async (
    text: string,
    attachments?: Asset[],
    capabilities?: ModelCapabilities,
    settings?: ChatSettings,
    overrides?: { preferTranscribed?: boolean }
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
      const attachmentContent = await assetToMessageContent(
        asset,
        capabilities,
        settings,
        overrides
      );
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