import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import type { ContextProcessor, PipelineContext } from "../../types/pipeline";
import { resolveAttachmentContent } from "../../core/context-utils/attachment-resolver";
import type { LlmMessageContent } from "@/llm-apis/common";
import type { Asset } from "@/types/asset-management";
import type { TranscriptionConfig } from "../../composables/useChatSettings";

const logger = createModuleLogger("llm-chat/transcription-processor");
const errorHandler = createModuleErrorHandler("llm-chat/transcription-processor");

export const transcriptionProcessor: ContextProcessor = {
  id: "transcription-processor",
  name: "转写与文本提取器",
  description: "处理音频/视频转写及文本附件读取，将其转换为消息文本以便参与 Token 计算。",
  priority: 250, // 必须在 Token 限制 (300) 之前执行
  defaultEnabled: true,
  execute: async (context: PipelineContext) => {
    const agentConfig = context.agentConfig;
    const transcriptionConfig = context.sharedData.get(
      "transcriptionConfig",
    ) as TranscriptionConfig | undefined;

    // 获取当前上下文使用的模型信息
    const modelId = agentConfig.modelId;
    const profileId = agentConfig.profileId;

    let processedCount = 0;
    let errorCount = 0;

    // 1. 从 sharedData 获取预处理阶段准备好的 Asset 映射
    // 转写等待逻辑已在管道执行前由 useChatExecutor 完成
    const updatedAssetsMap = (context.sharedData.get("updatedAssetsMap") as Map<string, Asset>)
      || new Map<string, Asset>();

    const totalMessages = context.messages.length;
    for (let i = 0; i < totalMessages; i++) {
      const msg = context.messages[i];
      if (!msg._attachments || msg._attachments.length === 0) {
        continue;
      }

      const remainingAttachments: Asset[] = [];
      let contentModified = false;

      let currentContentParts: LlmMessageContent[] = [];
      if (typeof msg.content === "string") {
        if (msg.content) {
          currentContentParts.push({ type: "text", text: msg.content });
        }
      } else {
        currentContentParts = [...msg.content];
      }

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

          const result = await resolveAttachmentContent(
            assetToProcess,
            modelId,
            profileId,
            { force: forceTranscription },
          );

          if (result.type === "text" && result.content) {
            currentContentParts.push({
              type: "text",
              text: result.content,
            });

            processedCount++;
            contentModified = true;
          } else {
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

      if (contentModified) {
        msg.content = currentContentParts;
        msg._attachments = remainingAttachments;
      }
    }

    if (processedCount > 0) {
      const message = `已处理 ${processedCount} 个附件的转写内容。`;
      logger.info(message, { errorCount });
      context.logs.push({
        processorId: "transcription-processor",
        level: "info",
        message,
      });
    }
  },
};