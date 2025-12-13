import type { PipelineContext } from "../pipeline/types";
import type { ContextPreviewData } from "../../types/context";
import { tokenCalculatorService } from "@/tools/token-calculator/tokenCalculator.registry";
import { prepareSimpleMessageForTokenCalc } from "./builder";
import { getMatchedModelProperties } from "@/config/model-metadata";
import { tokenCalculatorEngine } from "@/tools/token-calculator/composables/useTokenCalculator";

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

  const messageProcessingPromises = messages.map(async (msg) => {
    const content =
      typeof msg.content === "string"
        ? msg.content
        : JSON.stringify(msg.content);
    const charCount = content.length;

    // 预设消息和注入消息的 token 计算（简单文本）
    if (
      msg.sourceType === "agent_preset" ||
      msg.sourceType === "user_profile" ||
      msg.sourceType === "depth_injection" ||
      msg.sourceType === "anchor_injection"
    ) {
      const tokenResult = await tokenCalculatorService.calculateTokens(
        content,
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
        content: content,
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
          content,
          agentConfig.modelId,
        );
        const tokenCount = tokenResult.count;
        if (tokenResult.isEstimated) isEstimated = true;
        if (!tokenizerName && tokenResult.tokenizerName)
          tokenizerName = tokenResult.tokenizerName;

        chatHistory.push({
          role: msg.role as "user" | "assistant",
          content: content,
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

      // 使用 prepareSimpleMessageForTokenCalc 获取文本和媒体附件
      const { combinedText, mediaAttachments } =
        await prepareSimpleMessageForTokenCalc(
          sourceNode.content,
          sourceNode.attachments,
          undefined, // settings 可选
        );

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
      // 其他未知来源的消息，简单处理
      const tokenResult = await tokenCalculatorService.calculateTokens(
        content,
        agentConfig.modelId,
      );
      const tokenCount = tokenResult.count;
      if (tokenResult.isEstimated) isEstimated = true;
      if (!tokenizerName && tokenResult.tokenizerName)
        tokenizerName = tokenResult.tokenizerName;

      totalCharCount += charCount;
      totalTokenCount += tokenCount;
      // 不加入 presetMessages 或 chatHistory
    }
  });

  await Promise.all(messageProcessingPromises);

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
