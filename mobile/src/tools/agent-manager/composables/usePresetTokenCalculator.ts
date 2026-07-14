import {
  getCurrentScope,
  onScopeDispose,
  ref,
  type MaybeRef,
  toValue,
  watch,
} from "vue";
import { countTokensBatch } from "@/utils/tokenCounting";
import type { PresetMessage, PresetMessageGroup } from "../types/agent";

const CALCULATION_DEBOUNCE_MS = 500;

export function usePresetTokenCalculator(
  messages: MaybeRef<PresetMessage[] | undefined>,
  groups?: MaybeRef<PresetMessageGroup[] | undefined>
) {
  const totalTokens = ref(0);
  const tokenCounts = ref<Record<string, number>>({});
  const isCalculating = ref(false);
  const isFallback = ref(false);
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let requestSequence = 0;
  let disposed = false;

  function getEnabledMessages(): Array<{ id: string; content: string }> {
    const groupMap = new Map((toValue(groups) || []).map((group) => [group.id, group]));
    return (toValue(messages) || [])
      .filter((message) => {
        if (message.isEnabled === false) return false;
        return !message.groupId || groupMap.get(message.groupId)?.enabled !== false;
      })
      .map((message) => ({ id: message.id, content: message.content }));
  }

  async function calculate(
    sequence: number,
    enabledMessages: Array<{ id: string; content: string }>
  ): Promise<void> {
    const result = await countTokensBatch(enabledMessages.map((message) => message.content));
    if (disposed || sequence !== requestSequence) return;

    tokenCounts.value = Object.fromEntries(
      enabledMessages.map((message, index) => [message.id, result.counts[index] ?? 0])
    );
    totalTokens.value = result.total;
    isFallback.value = result.fallback;
    isCalculating.value = false;
  }

  function scheduleCalculation(): void {
    requestSequence += 1;
    const sequence = requestSequence;
    if (debounceTimer) clearTimeout(debounceTimer);

    const enabledMessages = getEnabledMessages();
    if (enabledMessages.length === 0) {
      tokenCounts.value = {};
      totalTokens.value = 0;
      isCalculating.value = false;
      isFallback.value = false;
      return;
    }

    isCalculating.value = true;
    debounceTimer = setTimeout(() => {
      void calculate(sequence, enabledMessages);
    }, CALCULATION_DEBOUNCE_MS);
  }

  watch(
    () => JSON.stringify(getEnabledMessages()),
    scheduleCalculation,
    { immediate: true }
  );

  if (getCurrentScope()) {
    onScopeDispose(() => {
      disposed = true;
      requestSequence += 1;
      if (debounceTimer) clearTimeout(debounceTimer);
    });
  }

  return {
    totalTokens,
    isCalculating,
    isFallback,
    getTokenCount: (messageId: string) => tokenCounts.value[messageId] ?? 0,
  };
}
