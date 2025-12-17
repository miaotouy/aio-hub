import type { PipelineContext } from "../../types/pipeline";
import type { ContextPreviewData } from "../../types/context";
import { tokenCalculatorService } from "@/tools/token-calculator/tokenCalculator.registry";
import { getMatchedModelProperties } from "@/config/model-metadata";
import { tokenCalculatorEngine } from "@/tools/token-calculator/composables/useTokenCalculator";
import { resolveAttachmentContent } from "./attachment-resolver";
import { assetManagerEngine } from "@/composables/useAssetManager";
import { useTranscriptionManager } from "../../composables/useTranscriptionManager";
import { useChatSettings } from "../../composables/useChatSettings";
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

  // 从 sharedData 获取 Profile 信息（可能是实时对象，也可能是从元数据恢复的临时对象）
  const profile = context.sharedData.get("profile") as
    | { name?: string; type?: string }
    | undefined;
  const visionTokenCost = modelMetadata?.capabilities?.visionTokenCost;

  // 获取转写设置
  const { settings } = useChatSettings();
  const transcriptionConfig = settings.value.transcription;

  // 计算每条消息的深度映射（用于判断强制转写）
  // 深度 = 总消息数 - 1 - 当前索引（最后一条消息深度为 0）
  const messageDepthMap = new Map<string | number, number>();

  // 找出所有会话历史消息，按顺序计算深度
  const historyMessages = messages.filter(m => m.sourceType === "session_history");
  const totalHistoryCount = historyMessages.length;
  historyMessages.forEach((msg, idx) => {
    const depth = totalHistoryCount - 1 - idx;
    if (msg.sourceId !== undefined) {
      messageDepthMap.set(msg.sourceId, depth);
    }
  });

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
        originalContent: msg._originalContent,
        charCount: charCount,
        tokenCount: tokenCount,
        source: "agent_preset", // 简化来源
        index: typeof msg.sourceIndex === "number" ? msg.sourceIndex : -1,
        timestamp: msg._timestamp,
        userName: msg._userName,
        userIcon: msg._userIcon,
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

      // 获取当前消息的深度
      const currentMessageDepth = messageDepthMap.get(msg.sourceId as string) ?? 0;

      if (sourceNode.attachments && sourceNode.attachments.length > 0) {
        for (const asset of sourceNode.attachments) {
          // 关键修复：在解析前获取最新的 Asset 对象，确保能拿到转写结果
          const latestAsset = await assetManagerEngine.getAssetById(asset.id);
          const assetToProcess = latestAsset || asset;

          const result = await resolveAttachmentContent(
            assetToProcess,
            agentConfig.modelId,
            agentConfig.profileId,
            { messageDepth: currentMessageDepth }
          );

          if (result.type === "text" && result.content) {
            combinedText += result.content;
          } else {
            mediaAttachments.push(assetToProcess);
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
      const transcriptionManager = useTranscriptionManager();

      for (const asset of mediaAttachments) {
        let tokenCount: number | undefined;
        let isAttachmentEstimated = false;
        let error: string | undefined;

        // 检查附件是否已有转写
        const hasTranscription = transcriptionManager.getTranscriptionStatus(asset) === "success";

        // 检查附件是否会因为消息深度被强制转写
        // 这意味着即使模型支持，也会使用转写内容
        const willForceTranscribe =
          transcriptionConfig.enabled &&
          transcriptionConfig.strategy === "smart" &&
          transcriptionConfig.forceTranscriptionAfter > 0 &&
          currentMessageDepth >= transcriptionConfig.forceTranscriptionAfter &&
          (asset.type === "image" || asset.type === "audio" || asset.type === "video");

        // 如果附件会被强制转写，但还没有转写内容，显示提示信息
        if (willForceTranscribe) {
          if (hasTranscription) {
            // 有转写，但由于某些原因（例如 resolveAttachmentContent 返回 media）没有被使用
            // 这是一个异常情况，理论上不应该发生
            error = "此附件因消息深度将使用转写，但转写未被正确应用";
          } else {
            error = "此附件因消息深度将被强制转写，但尚无转写内容";
          }
          isAttachmentEstimated = true;
        } else if (asset.type === "image") {
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
            // 模型不支持视觉能力，但如果有转写就不显示硬错误
            if (hasTranscription) {
              error = "模型不支持直接处理此媒体，但已有转写内容可用";
            } else {
              error = "模型不支持视觉能力或计费规则未知";
            }
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
            if (hasTranscription) {
              error = "缺少视频时长信息，但已有转写内容可用";
            } else {
              error = "缺少视频时长信息，无法计算";
            }
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
            if (hasTranscription) {
              error = "缺少音频时长信息，但已有转写内容可用";
            } else {
              error = "缺少音频时长信息，无法计算";
            }
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
      displayName: agentConfig.displayName,
      icon: agentConfig.icon,
      profileId: agentConfig.profileId,
      profileName: profile?.name,
      providerType: profile?.type,
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
