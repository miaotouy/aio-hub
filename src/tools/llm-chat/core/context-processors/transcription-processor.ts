import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import type { ContextProcessor, PipelineContext } from "../../types/pipeline";
import { useTranscriptionManager } from "../../composables/useTranscriptionManager";
import { resolveAttachmentContent } from "../../core/context-utils/attachment-resolver";
import { assetManagerEngine } from "@/composables/useAssetManager";
import type { LlmMessageContent } from "@/llm-apis/common";
import type { Asset } from "@/types/asset-management";

const logger = createModuleLogger("llm-chat/transcription-processor");
const errorHandler = createModuleErrorHandler("llm-chat/transcription-processor");

export const transcriptionProcessor: ContextProcessor = {
  id: "transcription-processor",
  name: "转写与文本提取器",
  description: "处理音频/视频转写及文本附件读取，将其转换为消息文本以便参与 Token 计算。",
  priority: 250, // 必须在 Token 限制 (300) 之前执行
  defaultEnabled: true,
  execute: async (context: PipelineContext) => {
    const transcriptionManager = useTranscriptionManager();
    const agentConfig = context.agentConfig;

    // 获取当前上下文使用的模型信息
    const modelId = agentConfig.modelId;
    const profileId = agentConfig.profileId;

    let processedCount = 0;
    let errorCount = 0;

    // 1. 预处理：收集所有附件并确保转写完成
    const allAttachments = context.messages.flatMap((msg) => msg._attachments || []);
    if (allAttachments.length > 0) {
      try {
        await transcriptionManager.ensureTranscriptions(
          allAttachments,
          modelId,
          profileId
        );
      } catch (error) {
        logger.warn("等待转写任务完成时出错或超时", error);
        context.logs.push({
          processorId: "transcription-processor",
          level: "warn",
          message: "部分附件转写可能未完成，将尝试使用原始附件。",
        });
      }
    }

    for (const msg of context.messages) {
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
        let assetToProcess = asset;
        try {
          const latestAsset = await assetManagerEngine.getAssetById(asset.id);
          assetToProcess = latestAsset || asset;

          const result = await resolveAttachmentContent(assetToProcess, modelId, profileId);

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