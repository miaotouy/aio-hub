import type { LlmMessageContent } from "@/tools/llm-api/types";
import { createModuleLogger } from "@/utils/logger";
import { useAgentStorage } from "@/tools/agent-manager/composables/useAgentStorage";
import {
  resolveAgentAttachmentParts,
  type AgentAssetReader,
  type AgentAttachmentInlineSupport,
  type AgentAttachmentResolutionStats,
} from "../../context-utils/preset-attachment-resolver";
import {
  processorResult,
  type ContextProcessor,
  type PipelineContext,
  type ProcessableMessage,
} from "../../../types";

const logger = createModuleLogger("primary:preset-attachment-processor");

export function createAgentAssetReader(): AgentAssetReader {
  return async (agentId, relativePath) => {
    if (!agentId) return null;
    const storage = useAgentStorage();
    return await storage.readAgentAsset(agentId, relativePath);
  };
}

function appendParts(
  content: ProcessableMessage["content"],
  parts: LlmMessageContent[]
): LlmMessageContent[] {
  const base: LlmMessageContent[] =
    typeof content === "string"
      ? content
        ? [{ type: "text", text: content }]
        : []
      : content;
  return [...base, ...parts];
}

/**
 * 解析消息上暂存的 Agent 私有附件引用：图片内联 base64 进入 vision，
 * 音频/视频在模型能力未显式关闭时内联 base64 进请求，文本文档以内联
 * 文本块回退，无法表达时降级为文本描述。
 *
 * 位于 `message-formatter` 之后，避免私有图片在连续的 system / 同角色消息
 * 合并时被文本化丢弃；处理完成后清空引用字段，无附件时不改变任何消息。
 */
export const presetAttachmentProcessor: ContextProcessor = {
  id: "primary:preset-attachment-processor",
  name: "Agent 私有附件解析",
  description:
    "从 Agent 私有目录读取预设消息与开局消息附件，图片进入 vision，音频/视频按模型能力内联，文本以内联块回退，其余类型降级为文本描述。",
  priority: 850,
  isCore: true,
  defaultEnabled: true,
  execute: async (context: PipelineContext) => {
    const messages = context.messages.filter(
      (message) => message._privateAttachments?.length
    );
    if (!messages.length) {
      return processorResult.skipped("当前没有 Agent 私有附件需要解析。");
    }

    const agent = context.agentConfig;
    const readBytes = createAgentAssetReader();
    const inlineSupport: AgentAttachmentInlineSupport = {
      audio: context.capabilities?.audio,
      video: context.capabilities?.video,
    };
    const stats: AgentAttachmentResolutionStats = {
      totalCount: 0,
      imageCount: 0,
      audioCount: 0,
      videoCount: 0,
      textFallbackCount: 0,
      degradedCount: 0,
      missingCount: 0,
    };
    const warnings: string[] = [];

    for (const message of messages) {
      const refs = message._privateAttachments ?? [];
      message._privateAttachments = undefined;
      const result = await resolveAgentAttachmentParts(
        refs,
        agent?.id ?? "",
        agent?.assets,
        readBytes,
        inlineSupport
      );
      if (result.parts.length) {
        message.content = appendParts(message.content, result.parts);
      }
      stats.totalCount += result.stats.totalCount;
      stats.imageCount += result.stats.imageCount;
      stats.audioCount += result.stats.audioCount;
      stats.videoCount += result.stats.videoCount;
      stats.textFallbackCount += result.stats.textFallbackCount;
      stats.degradedCount += result.stats.degradedCount;
      stats.missingCount += result.stats.missingCount;
      warnings.push(...result.warnings);
    }

    context.sharedData.set("presetAttachmentResolutionStats", stats);
    const details = { ...stats, warnings };
    const message = `Agent 私有附件解析完成：图片 ${stats.imageCount} 个，音频 ${stats.audioCount} 个，视频 ${stats.videoCount} 个，文本回退 ${stats.textFallbackCount} 个，降级 ${stats.degradedCount} 个，缺失 ${stats.missingCount} 个。`;

    if (stats.degradedCount || stats.missingCount) {
      logger.warn(message, details);
      return processorResult.degraded(message, details);
    }
    if (
      !stats.imageCount &&
      !stats.audioCount &&
      !stats.videoCount &&
      !stats.textFallbackCount
    ) {
      logger.info(message, details);
      return processorResult.skipped(message, details);
    }

    logger.info(message, details);
    return processorResult.applied(message, details);
  },
};
