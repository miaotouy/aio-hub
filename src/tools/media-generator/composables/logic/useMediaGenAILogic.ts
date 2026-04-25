import { ref } from "vue";
import type { MediaMessage, MediaGeneratorSettings, GenerationSession } from "../../types";
import { createModuleLogger } from "@/utils/logger";
import { useLlmRequest } from "@/composables/useLlmRequest";
import { parseModelCombo } from "@/utils/modelIdUtils";
import { useNodeManager } from "../useNodeManager";

const logger = createModuleLogger("media-generator/ai-logic");

export function useMediaGenAILogic(options: {
  settings: { value: MediaGeneratorSettings };
  nodes: { value: Record<string, MediaMessage> };
  activeLeafId: { value: string };
  updateSessionName: (sessionId: string, name: string) => Promise<void>;
}) {
  const { settings, nodes, activeLeafId, updateSessionName } = options;
  const { sendRequest } = useLlmRequest();
  const nodeManager = useNodeManager();

  const isNaming = ref(false);
  const isTranslating = ref(false);
  const generatingSessionIds = ref<Set<string>>(new Set());

  /**
   * AI 自动命名会话
   */
  const generateSessionName = async (sessionId: string, currentName: string) => {
    if (isNaming.value || generatingSessionIds.value.has(sessionId)) return;

    const namingConfig = settings.value.topicNaming;
    if (!namingConfig.modelCombo) {
      logger.warn("未配置话题命名模型，跳过自动命名");
      return;
    }

    // 提取当前活跃路径作为上下文
    const tempSession = {
      nodes: nodes.value,
      activeLeafId: activeLeafId.value,
    } as GenerationSession;

    const activePath = nodeManager.getNodePath(tempSession, tempSession.activeLeafId);
    
    const context = activePath
      .filter((n) => n.role === "user" || (n.role === "assistant" && n.metadata?.isMediaTask))
      .map((n) => {
        if (n.role === "user") return `用户输入: ${n.content}`;
        return `生成任务: ${n.metadata?.taskSnapshot?.input?.prompt || n.content}`;
      })
      .filter(Boolean)
      .slice(-(namingConfig.contextMessageCount || 5))
      .join("\n\n");

    if (!context) {
      logger.warn("提取上下文为空，跳过命名", { sessionId });
      return;
    }

    // LlmModelSelector 返回的格式通常是 profileId:modelId
    const [profileId, modelId] = parseModelCombo(namingConfig.modelCombo);

    try {
      isNaming.value = true;
      generatingSessionIds.value.add(sessionId);
      
      const prompt = namingConfig.prompt.replace("{context}", context);
      const response = await sendRequest({
        profileId,
        modelId,
        messages: [{ role: "user", content: prompt }],
        temperature: namingConfig.temperature,
        maxTokens: namingConfig.maxTokens,
      });

      // 提取名称：去掉引号、去掉“标题：”或“Title:”前缀、去掉 Markdown 粗体等格式
      let newName = response.content.trim();
      
      // 移除包围的引号
      if ((newName.startsWith('"') && newName.endsWith('"')) || (newName.startsWith("'") && newName.endsWith("'"))) {
        newName = newName.slice(1, -1).trim();
      }
      
      // 移除常见的前缀和 Markdown 符号
      newName = newName
        .replace(/^(标题|名称|Title|Name)[:：]\s*/i, "")
        .replace(/[*#_~`>]/g, "")
        .replace(/[。！？，、；：""''（）《》【】…—·\.,!?;:\(\)\[\]<>]$/g, "") // 移除末尾标点
        .trim();

      if (newName && newName !== currentName) {
        await updateSessionName(sessionId, newName);
        logger.info("AI 命名成功", { sessionId, newName });
      }
    } catch (error) {
      logger.error("AI 命名失败", error);
    } finally {
      isNaming.value = false;
      generatingSessionIds.value.delete(sessionId);
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
