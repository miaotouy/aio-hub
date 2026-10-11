// Copyright 2025-2026 miaotouy(Github@miaotouy)
import { computed } from "vue";
import { useAgentStore } from "@/tools/agent-manager/stores/agentStore";
import { useUserProfileStore } from "../../stores/userProfileStore";
import { useQuickActionStore } from "../../stores/quickActionStore";
import { useLlmChatUiState } from "../ui/useLlmChatUiState";
import { useChatSettings } from "../settings/useChatSettings";
import type { QuickActionSet } from "../../types/quick-action";

/** Explicitly linked groups for the independent shortcut bar, including detached input windows. */
export function useActiveQuickActionSets() {
  const { currentAgentId } = useLlmChatUiState();
  const { settings } = useChatSettings();
  const agentStore = useAgentStore();
  const profileStore = useUserProfileStore();
  const quickActionStore = useQuickActionStore();
  return computed(() => {
    const agent = currentAgentId.value
      ? agentStore.getAgentById(currentAgentId.value)
      : null;
    const profile = profileStore.getEffectiveProfile(agent?.userProfileId);
    const ids = [
      ...new Set([
        ...(settings.value.quickActionSetIds || []),
        ...(agent?.quickActionSetIds || []),
        ...(profile?.quickActionSetIds || []),
      ]),
    ];
    if (ids.length) quickActionStore.ensureSetsLoaded(ids);
    return ids
      .map((id) => quickActionStore.loadedSets.get(id))
      .filter((set): set is QuickActionSet => Boolean(set));
  });
}
