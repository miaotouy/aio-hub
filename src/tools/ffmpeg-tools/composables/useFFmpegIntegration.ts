import { useRouter } from "vue-router";
import { llmChatRegistry } from "@/tools/llm-chat/llmChat.registry";
import { transcriptionRegistry } from "@/tools/transcription/transcription.registry";
import { useAssetManager } from "@/composables/useAssetManager";
import { customMessage } from "@/utils/customMessage";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("ffmpeg-tools/integration");

export function useFFmpegIntegration() {
  const router = useRouter();
  const assetManager = useAssetManager();

  /**
   * 发送至 LLM Chat
   */
  const sendToChat = async (path: string) => {
    try {
      await llmChatRegistry.addAttachmentsFromPaths([path]);
      router.push("/llm-chat");
      customMessage.success("已发送至 LLM Chat");
    } catch (error) {
      logger.error("发送至 Chat 失败", error);
      customMessage.error("发送至 Chat 失败");
    }
  };

  /**
   * 发送至转写工具
   */
  const sendToTranscription = async (path: string) => {
    try {
      // 1. 导入为资产
      const asset = await assetManager.importAssetFromPath(path);
      if (!asset) throw new Error("资产导入失败");

      // 2. 添加转写任务
      transcriptionRegistry.addTask(asset);

      router.push("/transcription");
      customMessage.success("已发送至转写工具");
    } catch (error) {
      logger.error("发送至转写工具失败", error);
      customMessage.error("发送至转写工具失败");
    }
  };

  return {
    sendToChat,
    sendToTranscription,
  };
}