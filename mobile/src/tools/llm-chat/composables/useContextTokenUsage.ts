import {
  computed,
  getCurrentScope,
  onScopeDispose,
  ref,
  toValue,
  type MaybeRef,
  watch,
} from "vue";
import { countTokensBatch } from "@/utils/tokenCounting";
import { useAgentStore } from "@/tools/agent-manager/stores/agentStore";
import { useLlmProfilesStore } from "@/tools/llm-api/stores/llmProfiles";
import { useLlmChatStore } from "../stores/llmChatStore";
import { useChatSettings } from "./useChatSettings";
import {
  contentToTokenText,
  getContextRiskLevel,
} from "../utils/contextTokenUsage";

const CALCULATION_DEBOUNCE_MS = 500;

export function useContextTokenUsage(draft: MaybeRef<string>) {
  const chatStore = useLlmChatStore();
  const profilesStore = useLlmProfilesStore();
  const agentStore = useAgentStore();
  const { settings } = useChatSettings();
  const estimatedTokens = ref(0);
  const isCalculating = ref(false);
  const isFallback = ref(false);
  let requestSequence = 0;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;

  const activeAgent = computed(() =>
    agentStore.getAgentById(chatStore.currentSession?.displayAgentId)
  );

  const activeModel = computed(() => {
    const [selectedProfileId, selectedModelId] =
      chatStore.selectedModelValue.split(":");
    const profileId = activeAgent.value?.profileId || selectedProfileId;
    const modelId = activeAgent.value?.modelId || selectedModelId;
    return profilesStore.profiles
      .find((profile) => profile.id === profileId)
      ?.models.find((model) => model.id === modelId);
  });

  const contextLength = computed(
    () => activeModel.value?.tokenLimits?.contextLength
  );
  const usageRatio = computed(() => {
    const length = contextLength.value;
    return length && length > 0 ? estimatedTokens.value / length : undefined;
  });
  const riskLevel = computed(() =>
    getContextRiskLevel(
      estimatedTokens.value,
      contextLength.value,
      settings.value.contextManagement
    )
  );

  const latestActualPromptTokens = computed<number | undefined>(() => {
    const path = chatStore.currentActivePath;
    for (let index = path.length - 1; index >= 0; index -= 1) {
      const promptTokens = path[index].metadata?.usage?.promptTokens;
      if (typeof promptTokens === "number" && Number.isFinite(promptTokens)) {
        return promptTokens;
      }
    }
    return undefined;
  });

  function collectTexts(): string[] {
    const agent = activeAgent.value;
    const groupMap = new Map(
      (agent?.presetGroups || []).map((group) => [group.id, group])
    );
    const presetTexts = (agent?.presetMessages || [])
      .filter((message) => {
        if (!message.content.trim() || message.isEnabled === false)
          return false;
        return (
          !message.groupId || groupMap.get(message.groupId)?.enabled !== false
        );
      })
      .map((message) => message.content);
    const historyTexts = chatStore.currentActivePath
      .map((message) => contentToTokenText(message.content))
      .filter((content) => content.length > 0);
    const draftText = toValue(draft);
    return draftText
      ? [...presetTexts, ...historyTexts, draftText]
      : [...presetTexts, ...historyTexts];
  }

  async function calculate(sequence: number, texts: string[]): Promise<void> {
    const result = await countTokensBatch(texts);
    if (disposed || sequence !== requestSequence) return;

    estimatedTokens.value = result.total;
    isFallback.value = result.fallback;
    isCalculating.value = false;
  }

  function scheduleCalculation(): void {
    requestSequence += 1;
    const sequence = requestSequence;
    if (debounceTimer) clearTimeout(debounceTimer);
    const texts = collectTexts();

    if (texts.length === 0) {
      estimatedTokens.value = 0;
      isCalculating.value = false;
      isFallback.value = false;
      return;
    }

    isCalculating.value = true;
    debounceTimer = setTimeout(() => {
      void calculate(sequence, texts);
    }, CALCULATION_DEBOUNCE_MS);
  }

  watch(() => JSON.stringify(collectTexts()), scheduleCalculation, {
    immediate: true,
  });

  if (getCurrentScope()) {
    onScopeDispose(() => {
      disposed = true;
      requestSequence += 1;
      if (debounceTimer) clearTimeout(debounceTimer);
    });
  }

  return {
    estimatedTokens,
    contextLength,
    usageRatio,
    riskLevel,
    isCalculating,
    isFallback,
    latestActualPromptTokens,
  };
}
