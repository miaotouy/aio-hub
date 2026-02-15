import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import type { ContextProcessor, PipelineContext } from "../../types/pipeline";
import { resolveAttachmentContent } from "../../core/context-utils/attachment-resolver";
import type { LlmMessageContent } from "@/llm-apis/common";
import type { Asset } from "@/types/asset-management";
import type { ChatTranscriptionConfig } from "../../types/settings";

const logger = createModuleLogger("llm-chat/transcription-processor");
const errorHandler = createModuleErrorHandler("llm-chat/transcription-processor");

/**
 * 占位符正则表达式：匹配 【file::assetId】
 * assetId 支持 UUID 格式和普通字符串
 */
const PLACEHOLDER_REGEX = /【file::([^\s】]+)】/g;

/**
 * 根据 assetId 查找附件
 */
function findAttachmentById(attachments: Asset[], assetId: string): Asset | undefined {
  return attachments.find((a) => a.id === assetId);
}

/**
 * 生成附件序号标注（用于多模态指向性增强）
 */
function generateAttachmentLabel(index: number, name: string): string {
  return `[附件: ${index + 1} - ${name}]`;
}

/**
 * 替换文本中的占位符
 * @param text 原始文本
 * @param assets 当前消息的附件列表
 * @param transcriptionResults 转写结果映射
 * @returns 替换后的文本
 */
function replacePlaceholders(
  text: string,
  assets: Asset[],
  transcriptionResults: Map<string, string>
): { content: string; claimedAssets: Set<string>; unmatchedPlaceholders: string[] } {
  const claimedAssets = new Set<string>();
  const unmatchedPlaceholders: string[] = [];

  // 先解析所有占位符，收集所有需要替换的位置
  const replacements: { start: number; end: number; assetId: string; replacement: string }[] = [];

  // 使用 exec 循环查找所有占位符
  let match: RegExpExecArray | null;
  const regex = new RegExp(PLACEHOLDER_REGEX);
  while ((match = regex.exec(text)) !== null) {
    const fullMatch = match[0]; // 完整匹配 【file::xxx】
    const assetId = match[1]; // 捕获的 assetId
    const start = match.index;
    const end = start + fullMatch.length;

    const attachment = findAttachmentById(assets, assetId);

    if (attachment) {
      // 标记为已认领
      claimedAssets.add(assetId);

      // 检查是否有转写结果
      const transcription = transcriptionResults.get(assetId);
      if (transcription) {
        // 有转写结果，直接使用已格式化的内容（resolveAttachmentContent 已包含标记）
        replacements.push({ start, end, assetId, replacement: transcription });
      } else {
        // 无转写结果但有附件，替换为附件标注（增强多模态指向性）
        const index = assets.findIndex((a) => a.id === assetId);
        const replacement = generateAttachmentLabel(index, attachment.name);
        replacements.push({ start, end, assetId, replacement });
      }
    } else {
      // 占位符指向的附件不存在，保留原占位符
      unmatchedPlaceholders.push(assetId);
      logger.debug("占位符指向的附件不存在，保留原占位符", { assetId });
    }
  }

  // 如果没有需要替换的占位符，直接返回原文本
  if (replacements.length === 0) {
    return { content: text, claimedAssets, unmatchedPlaceholders };
  }

  // 从后往前替换（避免索引偏移问题）
  replacements.sort((a, b) => b.start - a.start);

  let result = text;
  for (const rep of replacements) {
    result = result.substring(0, rep.start) + rep.replacement + result.substring(rep.end);
  }

  logger.debug("占位符替换完成", {
    totalFound: replacements.length + unmatchedPlaceholders.length,
    replaced: replacements.length,
    unmatched: unmatchedPlaceholders.length,
  });

  return { content: result, claimedAssets, unmatchedPlaceholders };
}

/**
 * 构建附件内容文本（追加到消息末尾）
 */
function buildAttachmentContent(
  unclaimedAssets: Asset[],
  transcriptionResults: Map<string, string>
): LlmMessageContent[] {
  const contents: LlmMessageContent[] = [];

  for (const asset of unclaimedAssets) {
    const transcription = transcriptionResults.get(asset.id);
    if (transcription) {
      // 有转写结果，直接使用已格式化的内容（resolveAttachmentContent 已包含标记）
      contents.push({
        type: "text",
        text: transcription,
      });
    }
    // 注意：没有转写结果的附件（如纯图片）不会追加任何内容
    // 它们会作为多模态内容直接发送给模型
  }

  return contents;
}

export const transcriptionProcessor: ContextProcessor = {
  id: "transcription-processor",
  name: "转写与文本提取器",
  description:
    "处理音频/视频转写及文本附件读取，将其转换为消息文本以便参与 Token 计算。支持资产占位符【file::assetId】替换。",
  priority: 250, // 必须在 Token 限制 (300) 之前执行
  defaultEnabled: true,
  execute: async (context: PipelineContext) => {
    const agentConfig = context.agentConfig;
    const transcriptionConfig = context.sharedData.get("transcriptionConfig") as
      | ChatTranscriptionConfig
      | undefined;

    // 获取当前上下文使用的模型信息
    const modelId = agentConfig.modelId;
    const profileId = agentConfig.profileId;

    let processedCount = 0;
    let errorCount = 0;
    let placeholderReplacedCount = 0;

    // 1. 从 sharedData 获取预处理阶段准备好的 Asset 映射
    // 转写等待逻辑已在管道执行前由 useChatExecutor 完成
    const updatedAssetsMap =
      (context.sharedData.get("updatedAssetsMap") as Map<string, Asset>) ||
      new Map<string, Asset>();

    const totalMessages = context.messages.length;
    for (let i = 0; i < totalMessages; i++) {
      const msg = context.messages[i];
      if (!msg._attachments || msg._attachments.length === 0) {
        continue;
      }

      const remainingAttachments: Asset[] = [];
      let contentModified = false;

      // 用于存储转写结果
      const transcriptionResults = new Map<string, string>();

      // 预先处理所有附件，获取转写结果
      for (const asset of msg._attachments) {
        // 使用预处理阶段获取的最新 Asset，避免重复异步调用
        const assetToProcess = updatedAssetsMap.get(asset.id) || asset;

        try {
          // 检查是否需要强制转写
          let forceTranscription = false;
          if (
            transcriptionConfig?.strategy === "smart" &&
            transcriptionConfig.forceTranscriptionAfter > 0
          ) {
            const messageIndexFromEnd = totalMessages - 1 - i;
            if (messageIndexFromEnd >= transcriptionConfig.forceTranscriptionAfter) {
              forceTranscription = true;
            }
          }

          const result = await resolveAttachmentContent(assetToProcess, modelId, profileId, {
            force: forceTranscription,
          });

          if (result.type === "text" && result.content) {
            // 保存转写结果到映射中
            transcriptionResults.set(assetToProcess.id, result.content);
            processedCount++;
          } else {
            // 无法产生文本的附件保留在 remainingAttachments 中
            remainingAttachments.push(assetToProcess);
          }
        } catch (error) {
          errorCount++;
          remainingAttachments.push(assetToProcess);

          errorHandler.handle(error as Error, {
            userMessage: `处理附件转写 [${assetToProcess.name}] 失败`,
            context: { assetId: assetToProcess.id },
            showToUser: false,
          });
        }
      }

      // 2. 处理消息内容中的占位符替换
      // 获取当前消息的附件列表（用于占位符匹配）
      const currentAttachments = msg._attachments;

      // 累积所有被占位符认领的 assetId（从 replacePlaceholders 返回值中收集）
      const allClaimedAssetIds = new Set<string>();

      // 处理字符串类型的内容
      if (typeof msg.content === "string" && msg.content) {
        const result = replacePlaceholders(msg.content, currentAttachments, transcriptionResults);

        if (result.claimedAssets.size > 0) {
          // 有占位符被替换
          msg.content = result.content;
          placeholderReplacedCount += result.claimedAssets.size;
          contentModified = true;
          // 累积已认领的 assetId
          for (const id of result.claimedAssets) {
            allClaimedAssetIds.add(id);
          }

          // 标记日志
          if (result.unmatchedPlaceholders.length > 0) {
            logger.debug("存在未匹配的占位符", {
              unmatched: result.unmatchedPlaceholders,
              messageIndex: i,
            });
          }
        }
      } else if (Array.isArray(msg.content)) {
        // 处理多部分内容
        const newContentParts: LlmMessageContent[] = [];
        let arrayContentModified = false;

        for (const part of msg.content) {
          if (part.type === "text" && part.text) {
            const result = replacePlaceholders(part.text, currentAttachments, transcriptionResults);

            if (result.claimedAssets.size > 0) {
              // 有占位符被替换
              newContentParts.push({ type: "text", text: result.content });
              placeholderReplacedCount += result.claimedAssets.size;
              arrayContentModified = true;
              // 累积已认领的 assetId
              for (const id of result.claimedAssets) {
                allClaimedAssetIds.add(id);
              }
            } else {
              // 无变化，保持原样
              newContentParts.push(part);
            }
          } else {
            // 非文本部分保持不变
            newContentParts.push(part);
          }
        }

        if (arrayContentModified) {
          msg.content = newContentParts;
          contentModified = true;
        }
      }

      // 3. 处理未被占位符认领的转写附件
      // 从原始附件列表中找出"有转写结果但未被占位符认领"的附件
      const unclaimedWithTranscription = currentAttachments.filter(
        (a) => transcriptionResults.has(a.id) && !allClaimedAssetIds.has(a.id)
      );

      // 如果有需要追加的内容（回退到末尾追加模式）
      if (unclaimedWithTranscription.length > 0) {
        const additionalContent = buildAttachmentContent(
          unclaimedWithTranscription,
          transcriptionResults
        );

        // 过滤出文本类型的 content
        const textContent = additionalContent
          .filter((c): c is { type: "text"; text: string } => c.type === "text")
          .map((c) => c.text);

        if (textContent.length > 0) {
          // 追加到消息内容
          const textToAppend = "\n" + textContent.join("\n");
          if (typeof msg.content === "string") {
            msg.content = msg.content + textToAppend;
          } else if (Array.isArray(msg.content)) {
            msg.content = [
              ...(Array.isArray(msg.content) ? msg.content : []),
              ...additionalContent,
            ];
          }
          contentModified = true;
        }
      }

      // 更新附件列表：
      // - 保留非文本附件（remainingAttachments 中未被占位符认领的）
      // - 移除所有已被处理的附件（被占位符认领的 + 转写内容已追加的）
      if (contentModified) {
        const processedAssetIds = new Set([
          ...allClaimedAssetIds,
          ...unclaimedWithTranscription.map((a) => a.id),
        ]);
        msg._attachments = remainingAttachments.filter((a) => !processedAssetIds.has(a.id));
      }
    }

    // 记录日志
    const logMessages: string[] = [];
    if (processedCount > 0) {
      logMessages.push(`已处理 ${processedCount} 个附件的转写内容`);
    }
    if (placeholderReplacedCount > 0) {
      logMessages.push(`已替换 ${placeholderReplacedCount} 个占位符`);
    }
    if (errorCount > 0) {
      logMessages.push(`处理失败 ${errorCount} 个`);
    }

    if (logMessages.length > 0) {
      const message = logMessages.join("，") + "。";
      logger.info(message);
      context.logs.push({
        processorId: "transcription-processor",
        level: "info",
        message,
      });
    }
  },
};

/**
 * 生成资产占位符
 * @param assetId 资产 ID
 * @returns 占位符字符串
 */
export function generateAssetPlaceholder(assetId: string): string {
  return `【file::${assetId}】`;
}

/**
 * 生成上传中的资产占位符（带 uploading: 前缀）
 * 用于粘贴场景下 asset 还在后台上传时的临时标记
 * @param tempId 临时 ID
 * @returns 上传中占位符字符串，格式：【file::uploading:tempId】
 */
export function generateUploadingPlaceholder(tempId: string): string {
  return `【file::uploading:${tempId}】`;
}
