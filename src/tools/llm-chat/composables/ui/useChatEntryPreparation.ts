// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { useModelSelectDialog } from "@/composables/useModelSelectDialog";
import { useAgentStore } from "@/tools/agent-manager/stores/agentStore";
import { useLlmChatStore } from "../../stores/llmChatStore";
import { useLlmChatUiState } from "./useLlmChatUiState";
import type { ModelIdentifier } from "../../types";

export function useChatEntryPreparation() {
  const store = useLlmChatStore();
  const agentStore = useAgentStore();
  const { currentAgentId, selectAgent } = useLlmChatUiState();
  const { enabledProfiles } = useLlmProfiles();
  const { open } = useModelSelectDialog();

  function getModelSelection(identifier: ModelIdentifier | null | undefined) {
    if (!identifier) return null;
    const profile = enabledProfiles.value.find(
      (item) => item.id === identifier.profileId
    );
    const model = profile?.models.find(
      (item) => item.id === identifier.modelId
    );
    return profile && model ? { profile, model } : null;
  }

  async function ensureChatEntryReady(
    options: {
      promptForModel?: boolean;
      temporaryModel?: ModelIdentifier | null;
    } = {}
  ): Promise<boolean> {
    const draft = store.newSessionDraft;
    const entryAgentId =
      draft && store.currentSessionId === draft.index.id
        ? draft.index.displayAgentId || currentAgentId.value
        : currentAgentId.value;
    let agent = entryAgentId ? agentStore.getAgentById(entryAgentId) : null;
    agent ||= agentStore.defaultAgent;
    let selection =
      getModelSelection(options.temporaryModel) || getModelSelection(agent);

    if (!selection) {
      // 页面初始化只恢复已有配置；模型选择由发送动作触发。
      if (!options.promptForModel) return false;
      selection = await open({
        current: null,
        initialCapabilities: { embedding: false, rerank: false },
      });
      if (!selection) return false;
      if (agent) {
        agentStore.updateAgent(agent.id, {
          profileId: selection.profile.id,
          modelId: selection.model.id,
        });
      }
    }

    if (!agent) {
      await agentStore.createDefaultAgents({
        profileId: selection.profile.id,
        modelId: selection.model.id,
      });
      agent = agentStore.defaultAgent;
    }
    if (!agent) return false;

    if (currentAgentId.value !== agent.id) {
      await selectAgent(agent.id, { sessionId: undefined });
    }
    await agentStore.loadAgentDetails(agent.id);
    if (store.sessionRecovery.status === "ready" && !store.currentSessionId) {
      await store.beginNewSession(agent.id);
    }
    return !!store.currentSessionId;
  }

  return { ensureChatEntryReady };
}
