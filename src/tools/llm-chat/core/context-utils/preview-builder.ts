import type { PipelineContext } from "../pipeline/types";
import type { ContextPreviewData } from "../../types/context";
import { tokenCalculatorService } from "@/tools/token-calculator/tokenCalculator.registry";

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

  const messageProcessingPromises = messages.map(async (msg) => {
    const content =
      typeof msg.content === "string"
        ? msg.content
        : JSON.stringify(msg.content);
    const charCount = content.length;

    const tokenResult = await tokenCalculatorService.calculateTokens(
      content,
      agentConfig.modelId,
    );
    const tokenCount = tokenResult.count;

    if (tokenResult.isEstimated) {
      isEstimated = true;
    }
    // 只要还没有 tokenizerName，就用第一个返回的结果来设置它
    if (!tokenizerName && tokenResult.tokenizerName) {
      tokenizerName = tokenResult.tokenizerName;
    }

    if (
      msg.sourceType === "agent_preset" ||
      msg.sourceType === "user_profile" ||
      msg.sourceType === "depth_injection" ||
      msg.sourceType === "anchor_injection"
    ) {
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
    } else if (msg.sourceType === "session_history") {
      const sourceNode = session.nodes[msg.sourceId as string];
      chatHistory.push({
        role: msg.role as "user" | "assistant",
        content: content,
        charCount: charCount,
        tokenCount: tokenCount,
        source: "session_history",
        nodeId: msg.sourceId as string,
        index: typeof msg.sourceIndex === "number" ? msg.sourceIndex : -1,
        agentName: sourceNode?.metadata?.agentName,
        agentIcon: sourceNode?.metadata?.agentIcon,
        userName: sourceNode?.metadata?.userProfileName,
        userIcon: sourceNode?.metadata?.userProfileIcon,
        // attachments processing would be more complex, skipping for now
      });
      chatHistoryCharCount += charCount;
      chatHistoryTokenCount += tokenCount;
    }
    totalCharCount += charCount;
    totalTokenCount += tokenCount;
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
