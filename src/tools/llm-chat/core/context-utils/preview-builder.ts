import type { PipelineContext } from "../../types/pipeline";
import type { ContextPreviewData } from "../../types/context";
import { tokenCalculatorService } from "@/tools/token-calculator/tokenCalculator.registry";
import { getMatchedModelProperties } from "@/config/model-metadata";
import { tokenCalculatorEngine } from "@/tools/token-calculator/composables/useTokenCalculator";
import { resolveAttachmentContent } from "./attachment-resolver";
import type { Asset } from "@/types/asset-management";
import type { ProcessableMessage } from "../../types/context";

/**
 * 从已完成的管道上下文中构建用于 UI 展示的预览数据。
 * @param context - 已执行完毕的 PipelineContext。
 * @returns ContextPreviewData 对象。
 */
export async function buildPreviewDataFromContext(
  context: PipelineContext,
): Promise<ContextPreviewData> {
  const { messages, session, agentConfig, userProfile, timestamp } = context;

  const presetMessages: ContextPreviewData["presetMessages"] = [];
  const chatHistory: ContextPreviewData["chatHistory"] = [];

  let totalCharCount = 0;
  let presetMessagesCharCount = 0;
  let chatHistoryCharCount = 0;
  let totalTokenCount = 0;
  let presetMessagesTokenCount = 0;
  let chatHistoryTokenCount = 0;
  let isEstimated = false;
  let tokenizerName: string | undefined = undefined;

  // 获取模型元数据，用于视觉 token 计算
  const modelMetadata = agentConfig.modelId
    ? getMatchedModelProperties(agentConfig.modelId)
    : undefined;
  const visionTokenCost = modelMetadata?.capabilities?.visionTokenCost;

  // 递归处理消息函数
  const processMessage = async (msg: ProcessableMessage) => {
    // 递归处理合并消息
    if (msg.sourceType === "merged" && msg._mergedSources) {
      for (const subMsg of msg._mergedSources) {
        await processMessage(subMsg);
      }
      return;
    }

    // 提取纯文本内容，避免 Base64 污染
    let contentText = "";
    if (typeof msg.content === "string") {
      contentText = msg.content;
    } else if (Array.isArray(msg.content)) {
      // 只提取文本部分
      contentText = msg.content
        .filter((p): p is { type: "text"; text: string } => p.type === "text" && !!p.text)
        .map((p) => p.text)
        .join("\n");
    }
    const charCount = contentText.length;

    // 预设消息和注入消息的 token 计算（简单文本）
    if (
      msg.sourceType === "agent_preset" ||
      msg.sourceType === "user_profile" ||
      msg.sourceType === "depth_injection" ||
      msg.sourceType === "anchor_injection"
    ) {
      const tokenResult = await tokenCalculatorService.calculateTokens(
        contentText,
        agentConfig.modelId,
      );
      const tokenCount = tokenResult.count;

      if (tokenResult.isEstimated) {
        isEstimated = true;
      }
      if (!tokenizerName && tokenResult.tokenizerName) {
        tokenizerName = tokenResult.tokenizerName;
      }

      presetMessages.push({
        role: msg.role,
        content: contentText,
        charCount: charCount,
        tokenCount: tokenCount,
        source: "agent_preset", // 简化来源
        index: typeof msg.sourceIndex === "number" ? msg.sourceIndex : -1,
        isUserProfile: msg.sourceType === "user_profile",
      });
      presetMessagesCharCount += charCount;
      presetMessagesTokenCount += tokenCount;
      totalCharCount += charCount;
      totalTokenCount += tokenCount;
    } else if (msg.sourceType === "session_history") {
      // 会话历史消息：需要处理附件
      const sourceNode = session.nodes[msg.sourceId as string];
      if (!sourceNode) {
        // 回退到简单计算
        const tokenResult = await tokenCalculatorService.calculateTokens(
          contentText,
          agentConfig.modelId,
        );
        const tokenCount = tokenResult.count;
        if (tokenResult.isEstimated) isEstimated = true;
        if (!tokenizerName && tokenResult.tokenizerName)
          tokenizerName = tokenResult.tokenizerName;

        chatHistory.push({
          role: msg.role as "user" | "assistant",
          content: contentText,
          charCount: charCount,
          tokenCount: tokenCount,
          source: "session_history",
          nodeId: msg.sourceId as string,
          index: typeof msg.sourceIndex === "number" ? msg.sourceIndex : -1,
          agentName: undefined,
          agentIcon: undefined,
          userName: undefined,
          userIcon: undefined,
          // 没有附件信息
        });
        chatHistoryCharCount += charCount;
        chatHistoryTokenCount += tokenCount;
        totalCharCount += charCount;
        totalTokenCount += tokenCount;
        return;
      }

      // 准备用于 Token 计算的消息内容
      let combinedText = sourceNode.content;
      const mediaAttachments: Asset[] = [];

      if (sourceNode.attachments && sourceNode.attachments.length > 0) {
        for (const asset of sourceNode.attachments) {
          const result = await resolveAttachmentContent(
            asset,
            agentConfig.modelId,
            agentConfig.profileId
          );

          if (result.type === "text" && result.content) {
            combinedText += result.content;
          } else {
            mediaAttachments.push(asset);
          }
        }
      }

      // 计算文本 token
      let textTokenCount = 0;
      let textIsEstimated = false;
      let textTokenizerName: string | undefined;
      if (combinedText) {
        const tokenResult = await tokenCalculatorService.calculateTokens(
          combinedText,
          agentConfig.modelId,
        );
        textTokenCount = tokenResult.count;
        if (tokenResult.isEstimated) textIsEstimated = true;
        if (tokenResult.tokenizerName) textTokenizerName = tokenResult.tokenizerName;
      }

      // 计算媒体附件 token
      const attachmentsData: ContextPreviewData["chatHistory"][0]["attachments"] =
        [];
      let attachmentsTokenCount = 0;
      let attachmentsIsEstimated = false;

      for (const asset of mediaAttachments) {
        let tokenCount: number | undefined;
        let isAttachmentEstimated = false;
        let error: string | undefined;

        if (asset.type === "image") {
          if (visionTokenCost) {
            if (asset.metadata?.width && asset.metadata?.height) {
              try {
                tokenCount = tokenCalculatorEngine.calculateImageTokens(
                  asset.metadata.width,
                  asset.metadata.height,
                  visionTokenCost,
                );
              } catch (e) {
                error = e instanceof Error ? e.message : "图片 Token 计算异常";
                isAttachmentEstimated = true;
              }
            } else {
              error = "缺少图片尺寸信息，使用默认值估算";
              tokenCount = tokenCalculatorEngine.calculateImageTokens(
                1024,
                1024,
                visionTokenCost,
              );
              isAttachmentEstimated = true;
            }
          } else {
            error = "模型不支持视觉能力或计费规则未知";
            isAttachmentEstimated = true;
          }
        } else if (asset.type === "video") {
          if (asset.metadata?.duration) {
            try {
              tokenCount = tokenCalculatorEngine.calculateVideoTokens(
                asset.metadata.duration,
              );
            } catch (e) {
              error = e instanceof Error ? e.message : "视频 Token 计算异常";
              isAttachmentEstimated = true;
            }
          } else {
            error = "缺少视频时长信息，无法计算";
            isAttachmentEstimated = true;
          }
        } else if (asset.type === "audio") {
          if (asset.metadata?.duration) {
            try {
              tokenCount = tokenCalculatorEngine.calculateAudioTokens(
                asset.metadata.duration,
              );
            } catch (e) {
              error = e instanceof Error ? e.message : "音频 Token 计算异常";
              isAttachmentEstimated = true;
            }
          } else {
            error = "缺少音频时长信息，无法计算";
            isAttachmentEstimated = true;
          }
        } else {
          error = "暂不支持此类型附件的 Token 计算";
          isAttachmentEstimated = true;
        }

        if (tokenCount !== undefined) attachmentsTokenCount += tokenCount;
        if (isAttachmentEstimated) attachmentsIsEstimated = true;

        attachmentsData.push({
          id: asset.id,
          name: asset.name,
          type: asset.type,
          path: asset.path,
          importStatus: asset.importStatus,
          originalPath: asset.originalPath,
          size: asset.size,
          tokenCount,
          isEstimated: isAttachmentEstimated,
          metadata: asset.metadata,
          error,
        });
      }

      const totalNodeTokenCount = textTokenCount + attachmentsTokenCount;
      if (textIsEstimated || attachmentsIsEstimated) isEstimated = true;
      if (textTokenizerName && !tokenizerName) tokenizerName = textTokenizerName;

      chatHistory.push({
        role: msg.role as "user" | "assistant",
        content: combinedText,
        charCount: combinedText.length,
        tokenCount: totalNodeTokenCount,
        source: "session_history",
        nodeId: msg.sourceId as string,
        index: typeof msg.sourceIndex === "number" ? msg.sourceIndex : -1,
        agentName: sourceNode.metadata?.agentName,
        agentIcon: sourceNode.metadata?.agentIcon,
        userName: sourceNode.metadata?.userProfileName,
        userIcon: sourceNode.metadata?.userProfileIcon,
        attachments: attachmentsData.length > 0 ? attachmentsData : undefined,
      });

      chatHistoryCharCount += combinedText.length;
      chatHistoryTokenCount += totalNodeTokenCount;
      totalCharCount += combinedText.length;
      totalTokenCount += totalNodeTokenCount;
    } else {
      // 其他未知来源的消息，安全处理
      // 1. 计算文本 Token
      const tokenResult = await tokenCalculatorService.calculateTokens(
        contentText,
        agentConfig.modelId,
      );
      let tokenCount = tokenResult.count;

      // 2. 计算附件 Token (如果有)
      // 优先使用 _attachments 中的元数据进行精确计算
      if (msg._attachments && msg._attachments.length > 0) {
        for (const asset of msg._attachments) {
          try {
            if (asset.type === "image") {
              if (visionTokenCost && asset.metadata?.width && asset.metadata?.height) {
                tokenCount += tokenCalculatorEngine.calculateImageTokens(
                  asset.metadata.width,
                  asset.metadata.height,
                  visionTokenCost,
                );
              } else {
                // 如果没有元数据或不支持视觉Token，使用默认值
                tokenCount += 1000;
                isEstimated = true;
              }
            } else if (asset.type === "video" && asset.metadata?.duration) {
              tokenCount += tokenCalculatorEngine.calculateVideoTokens(asset.metadata.duration);
            } else if (asset.type === "audio" && asset.metadata?.duration) {
              tokenCount += tokenCalculatorEngine.calculateAudioTokens(asset.metadata.duration);
            } else if (asset.type === "document") {
              // 文档类型通常作为 base64 发送，Token 取决于大小或内容
              // 这里暂时使用固定估算值，直到有更好的计算方法
              tokenCount += 500;
              isEstimated = true;
            }
          } catch (e) {
            // 计算失败，回退到估算
            tokenCount += 500;
            isEstimated = true;
          }
        }
      }

      if (tokenResult.isEstimated) isEstimated = true;
      if (!tokenizerName && tokenResult.tokenizerName)
        tokenizerName = tokenResult.tokenizerName;

      totalCharCount += charCount;
      totalTokenCount += tokenCount;
      // 不加入 presetMessages 或 chatHistory
    }
  };

  // 串行执行以保证顺序
  for (const msg of messages) {
    await processMessage(msg);
  }

  return {
    presetMessages,
    chatHistory,
    finalMessages: messages,
    statistics: {
      totalCharCount,
      presetMessagesCharCount,
      chatHistoryCharCount,
      messageCount: messages.length,
      totalTokenCount,
      presetMessagesTokenCount,
      chatHistoryTokenCount,
      isEstimated,
      tokenizerName,
    },
    agentInfo: {
      id: agentConfig.id,
      name: agentConfig.name,
      icon: agentConfig.icon,
      profileId: agentConfig.profileId,
      modelId: agentConfig.modelId,
      virtualTimeConfig: agentConfig.virtualTimeConfig,
    },
    parameters: agentConfig.parameters,
    targetTimestamp: timestamp,
    userInfo: userProfile
      ? {
        id: userProfile.id,
        name: userProfile.name,
        displayName: userProfile.displayName,
        icon: userProfile.icon,
      }
      : undefined,
  };
}
