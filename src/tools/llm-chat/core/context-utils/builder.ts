import type { Asset } from "@/types/asset-management";
import type { LlmMessageContent } from "@/llm-apis/common";
import type { ModelCapabilities } from "@/types/llm-profiles";
import type { ChatSettings } from "../../composables/useChatSettings";
import {
  processAssetsForMessage,
  assetToMessageContent,
} from "./asset-processor";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("llm-chat/context-builder");

/**
 * 为 Token 计算准备简单消息格式
 */
export const prepareSimpleMessageForTokenCalc = async (
  text: string,
  attachments?: Asset[],
  settings?: ChatSettings,
  overrides?: { preferTranscribed?: boolean },
): Promise<{ combinedText: string; mediaAttachments: Asset[] }> => {
  if (!attachments || attachments.length === 0) {
    return {
      combinedText: text,
      mediaAttachments: [],
    };
  }
  const { textContent, mediaAssets } = await processAssetsForMessage(
    attachments,
    settings,
    overrides,
  );
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
 * 构建发送给 LLM 的消息内容
 */
export const buildMessageContentForLlm = async (
  text: string,
  attachments?: Asset[],
  capabilities?: ModelCapabilities,
  settings?: ChatSettings,
  overrides?: { preferTranscribed?: boolean },
): Promise<string | LlmMessageContent[]> => {
  if (!attachments || attachments.length === 0) {
    return text;
  }
  const messageContents: LlmMessageContent[] = [];
  if (text && text.trim() !== "") {
    messageContents.push({
      type: "text",
      text: text,
    });
  }
  for (const asset of attachments) {
    const attachmentContent = await assetToMessageContent(
      asset,
      capabilities,
      settings,
      overrides,
    );
    if (attachmentContent) {
      messageContents.push(attachmentContent);
    }
  }
  return messageContents;
};
