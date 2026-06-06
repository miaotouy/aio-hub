import { ref, computed, watch, type Ref, type ComputedRef } from "vue";
import { createModuleLogger } from "@/utils/logger";
import { useDebounceFn } from "@vueuse/core";
import { useLlmChatStore } from "../../../stores/llmChatStore";
import type { ChatMessageNode, UserProfile } from "../../../types";
import {
  MacroProcessor,
  createMacroContext,
  extractContextFromSession,
} from "../../../macro-engine";
import { useAnchorRegistry } from "../../../composables/ui/useAnchorRegistry";
import { calculateShortHash } from "@/utils/hash";
import { tokenCalculatorEngine } from "@/tools/token-calculator/composables/useTokenCalculator";

const logger = createModuleLogger("llm-chat/usePresetTokenCalculator");

export function usePresetTokenCalculator(options: {
  localMessages: Ref<ChatMessageNode[]>;
  modelId: Ref<string>;
  agentName: Ref<string>;
  effectiveUserProfile: ComputedRef<UserProfile | undefined>;
  agent: Ref<any>;
  onSyncNeeded: () => void;
}) {
  const {
    localMessages,
    modelId,
    agentName,
    effectiveUserProfile,
    agent,
    onSyncNeeded,
  } = options;
  const chatStore = useLlmChatStore();
  const anchorRegistry = useAnchorRegistry();

  const messageTokens = ref<Map<string, number>>(new Map());
  const isCalculatingTokens = ref(false);

  function isTemplateAnchorType(type?: string): boolean {
    if (!type) return false;
    return anchorRegistry.getAnchorById(type)?.hasTemplate === true;
  }

  function isPurePlaceholderAnchorType(type?: string): boolean {
    if (!type || type === "message") return false;
    const anchor = anchorRegistry.getAnchorById(type);
    return !!anchor && !anchor.hasTemplate;
  }

  function getAnchorDef(type?: string) {
    return type ? anchorRegistry.getAnchorById(type) : undefined;
  }

  async function runWithConcurrency<T>(
    tasks: (() => Promise<T>)[],
    concurrency: number
  ): Promise<T[]> {
    const results: T[] = [];
    let index = 0;
    async function runNext(): Promise<void> {
      while (index < tasks.length) {
        const i = index++;
        results[i] = await tasks[i]();
      }
    }
    await Promise.all(
      Array(Math.min(concurrency, tasks.length))
        .fill(null)
        .map(() => runNext())
    );
    return results;
  }

  const calculateAllTokens = async () => {
    if (!modelId.value || localMessages.value.length === 0) {
      messageTokens.value = new Map();
      return;
    }

    isCalculatingTokens.value = true;
    const newTokens = new Map<string, number>();
    let hasChanges = false;

    const baseContext = createMacroContext({
      userName: effectiveUserProfile.value?.name || "User",
      charName: agentName.value || "Assistant",
      userProfile: effectiveUserProfile.value || undefined,
      agent: agent.value as any,
    });

    if (chatStore.currentFullSession) {
      const sessionContext = extractContextFromSession(
        chatStore.currentFullSession.index,
        chatStore.currentFullSession.detail,
        agent.value as any,
        effectiveUserProfile.value || undefined
      );
      Object.assign(baseContext, sessionContext);
    }

    const macroProcessor = new MacroProcessor();
    const tokenizerResult = await tokenCalculatorEngine.calculateTokens(
      "",
      modelId.value
    );
    const tokenizerName = tokenizerResult.tokenizerName;

    const tasks = localMessages.value.map((message) => async () => {
      if (isPurePlaceholderAnchorType(message.type) || !message.isEnabled)
        return;
      try {
        let template = message.content;
        if (isTemplateAnchorType(message.type) && !template) {
          template = getAnchorDef(message.type)?.defaultTemplate || "";
        }
        if (!template) return;

        const contextKey = `${effectiveUserProfile.value?.id || "default"}:${agentName.value}`;
        const rawHashKey = `v3:${tokenizerName}:${template}:${contextKey}`;
        const contentHash = `v3:${tokenizerName}:${await calculateShortHash(rawHashKey)}`;

        if (
          message.metadata?.lastCalcHash === contentHash &&
          message.metadata?.contentTokens !== undefined
        ) {
          newTokens.set(message.id, message.metadata.contentTokens);
          return;
        }

        const processed = await macroProcessor.process(template, baseContext);
        const result = await tokenCalculatorEngine.calculateTokens(
          processed.output,
          modelId.value
        );
        newTokens.set(message.id, result.count);

        if (!message.metadata) message.metadata = {};
        if (
          message.metadata.contentTokens !== result.count ||
          message.metadata.lastCalcHash !== contentHash
        ) {
          message.metadata.contentTokens = result.count;
          message.metadata.lastCalcHash = contentHash;
          hasChanges = true;
        }
      } catch (error) {
        logger.error(
          `Failed to calculate tokens for message ${message.id}`,
          error as Error
        );
      }
    });

    await runWithConcurrency(tasks, 10);
    messageTokens.value = newTokens;
    isCalculatingTokens.value = false;

    if (hasChanges) onSyncNeeded();
  };

  const debouncedCalculateTokens = useDebounceFn(calculateAllTokens, 300);

  const totalTokens = computed(() => {
    let total = 0;
    for (const count of messageTokens.value.values()) total += count;
    return total;
  });

  watch(
    () =>
      [localMessages.value, modelId.value, effectiveUserProfile.value] as const,
    () => {
      if (modelId.value) debouncedCalculateTokens();
    },
    { deep: true, immediate: true }
  );

  return { messageTokens, isCalculatingTokens, totalTokens };
}
