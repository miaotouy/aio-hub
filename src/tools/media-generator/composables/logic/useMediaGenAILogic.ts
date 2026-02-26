import { ref } from "vue";
import type { MediaMessage, MediaGeneratorSettings } from "../../types";
import { createModuleLogger } from "@/utils/logger";
import { useLlmRequest } from "@/composables/useLlmRequest";
import { parseModelCombo } from "@/utils/modelIdUtils";

const logger = createModuleLogger("media-generator/ai-logic");

export function useMediaGenAILogic(options: {
  settings: { value: MediaGeneratorSettings };
  nodes: { value: Record<string, MediaMessage> };
  updateSessionName: (sessionId: string, name: string) => Promise<void>;
}) {
  const { settings, nodes, updateSessionName } = options;
  const { sendRequest } = useLlmRequest();

  const isNaming = ref(false);
  const isTranslating = ref(false);

  /**
   * AI 自动命名会话
   */
  const generateSessionName = async (sessionId: string, currentName: string) => {
    if (isNaming.value) return;

    const namingConfig = settings.value.topicNaming;
    if (!namingConfig.modelCombo) {
      throw new Error("请先在设置中配置命名模型");
    }

    // 提取上下文：使用当前节点树中的任务内容
    const context = Object.values(nodes.value)
      .filter((n) => n.metadata?.isMediaTask)
      .map((n) => n.metadata?.taskSnapshot?.input?.prompt)
      .filter(Boolean)
      .slice(0, 5) // 仅取前5个任务作为上下文，避免上下文过长
      .join("\n");

    if (!context) return;

    // LlmModelSelector 返回的格式通常是 profileId:modelId
    const [profileId, modelId] = parseModelCombo(namingConfig.modelCombo);

    try {
      isNaming.value = true;
      const prompt = namingConfig.prompt.replace("{context}", context);
      const response = await sendRequest({
        profileId,
        modelId,
        messages: [{ role: "user", content: prompt }],
        temperature: namingConfig.temperature,
        maxTokens: namingConfig.maxTokens,
      });

      // 提取名称：去掉引号、去掉“标题：”或“Title:”前缀、去掉 Markdown 粗体等格式
      let newName = response.content
        .trim()
        .replace(/^["'「『]|["'」』]$/g, "")
        .replace(/^(标题|名称|Title|Name)[:：]\s*/i, "")
        .replace(/[*#_~`>]/g, "") // 移除常见的 MD 符号
        .trim();

      if (newName && newName !== currentName) {
        await updateSessionName(sessionId, newName);
        logger.info("AI 命名成功", { sessionId, newName });
      }
    } catch (error) {
      logger.error("AI 命名失败", error);
      throw error;
    } finally {
      isNaming.value = false;
    }
  };

  /**
   * 翻译提示词
   */
  const translatePrompt = async (text: string, targetLang?: string) => {
    const config = settings.value.translation;
    if (!config.enabled || !config.modelIdentifier || !text) return text;

    const [profileId, modelId] = parseModelCombo(config.modelIdentifier);

    try {
      isTranslating.value = true;
      const target = targetLang || config.inputTargetLang;

      // 构造翻译提示词
      const systemPrompt = config.prompt
        .replace("{targetLang}", target)
        .replace("{thinkTags}", "<thought>, <style>")
        .replace("{text}", text);

      const response = await sendRequest({
        profileId,
        modelId,
        messages: [{ role: "user", content: systemPrompt }],
        temperature: config.temperature,
        maxTokens: config.maxTokens,
      });

      const translated = response.content.trim();
      logger.info("提示词翻译成功", { original: text, translated, target });
      return translated;
    } catch (error) {
      logger.error("提示词翻译失败", error);
      return text; // 失败时返回原文，不中断流程
    } finally {
      isTranslating.value = false;
    }
  };

  return {
    isNaming,
    isTranslating,
    generateSessionName,
    translatePrompt,
  };
}
