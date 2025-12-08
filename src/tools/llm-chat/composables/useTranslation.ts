import { useChatSettings } from "./useChatSettings";
import { useLlmRequest } from "@/composables/useLlmRequest";
import { useRichTextRendererStore } from "@/tools/rich-text-renderer/store";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { customMessage } from "@/utils/customMessage";

const logger = createModuleLogger("useTranslation");
const errorHandler = createModuleErrorHandler("useTranslation");

export function useTranslation() {
  const { settings } = useChatSettings();
  const { sendRequest } = useLlmRequest();
  const richTextRendererStore = useRichTextRendererStore();

  /**
   * 翻译文本
   * @param text 待翻译的文本
   * @param onStream 流式输出回调（可选）
   * @param abortSignal AbortSignal（可选）
   * @returns 翻译后的文本
   */
  const translateText = async (
    text: string,
    onStream?: (chunk: string) => void,
    abortSignal?: AbortSignal,
    targetLang?: string
  ): Promise<string> => {
    const config = settings.value.translation;

    if (!config.enabled) {
      customMessage.warning("翻译功能未启用，请在设置中开启");
      return "";
    }

    // 确定使用的模型：优先使用配置的翻译模型，否则回退到默认模型
    let modelIdentifier = config.modelIdentifier;
    if (!modelIdentifier) {
      // 尝试使用全局默认模型
      const defaultModel = settings.value.modelPreferences.defaultModel;
      if (defaultModel) {
        modelIdentifier = defaultModel;
        logger.info("未配置翻译模型，使用全局默认模型", { modelIdentifier });
      } else {
        customMessage.warning("未配置翻译模型，请在设置中选择");
        return "";
      }
    }

    const [profileId, modelId] = modelIdentifier.split(":");
    if (!profileId || !modelId) {
      customMessage.error(`翻译模型配置无效: ${modelIdentifier}`);
      return "";
    }

    // 构建 Prompt
    let prompt = config.prompt || "Please translate the following text to {targetLang}.\n\nImportant: If the text contains any of the following XML-style tag blocks: {thinkTags}, please keep the XML tags themselves unchanged, but translate the text content inside the tags.\n\n{text}";
    // 优先使用传入的目标语言，否则回退到消息默认语言（作为兜底）
    const finalTargetLang = targetLang || config.messageTargetLang || "Chinese";

    // 获取思考块标签列表
    const thinkTags = richTextRendererStore.llmThinkRules
      .map(rule => `<${rule.tagName}>...<${rule.tagName}>`)
      .join(", ");

    // 处理 {thinkTags} 占位符
    if (prompt.includes("{thinkTags}")) {
      prompt = prompt.split("{thinkTags}").join(thinkTags || "<think>...</think>");
    }
    
    // 使用全局替换，支持提示词中多次出现占位符
    prompt = prompt.split("{targetLang}").join(finalTargetLang);
    prompt = prompt.split("{text}").join(text);

    try {
      logger.info("开始翻译任务", {
        profileId,
        modelId,
        textLength: text.length,
        targetLang: finalTargetLang,
      });

      const response = await sendRequest({
        profileId,
        modelId,
        messages: [{ role: "user", content: prompt }],
        temperature: config.temperature,
        maxTokens: config.maxTokens,
        stream: !!onStream,
        onStream: onStream,
        signal: abortSignal,
      });

      return response.content;
    } catch (error) {
      errorHandler.error(error, "翻译失败，请检查配置或重试");
      throw error;
    }
  };

  return {
    translateText,
  };
}