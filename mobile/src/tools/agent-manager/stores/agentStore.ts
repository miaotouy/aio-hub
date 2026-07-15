import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { v4 as uuidv4 } from "uuid";
import { useLlmProfilesStore } from "@/tools/llm-api/stores/llmProfiles";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { createModuleLogger } from "@/utils/logger";
import { useAgentStorage } from "../composables/useAgentStorage";
import type { ChatAgent } from "../types/agent";

const logger = createModuleLogger("agent-manager/store");
const errorHandler = createModuleErrorHandler("agent-manager/store");

export const useAgentStore = defineStore("agent-manager", () => {
  const agents = ref<ChatAgent[]>([]);
  const isLoaded = ref(false);
  const isLoading = ref(false);
  const storage = useAgentStorage();
  const profilesStore = useLlmProfilesStore();

  const sortedAgents = computed(() =>
    [...agents.value].sort((a, b) =>
      (b.lastUsedAt || b.createdAt).localeCompare(a.lastUsedAt || a.createdAt)
    )
  );

  async function init(): Promise<void> {
    if (isLoaded.value || isLoading.value) return;
    isLoading.value = true;
    try {
      if (!profilesStore.isLoaded) await profilesStore.init();
      agents.value = await storage.loadAgents();
      if (agents.value.length === 0) await createDefaultAgent();
      isLoaded.value = true;
      logger.info("智能体加载完成", { count: agents.value.length });
    } catch (error) {
      errorHandler.handle(error as Error, {
        userMessage: "初始化智能体管理器失败",
        showToUser: false,
      });
    } finally {
      isLoading.value = false;
    }
  }

  function getAgentById(agentId: string | null | undefined): ChatAgent | null {
    if (!agentId) return null;
    return agents.value.find((agent) => agent.id === agentId) || null;
  }

  async function createAgent(overrides: Partial<ChatAgent> = {}): Promise<ChatAgent | null> {
    if (!profilesStore.isLoaded) await profilesStore.init();
    const profile = profilesStore.enabledProfiles.find((item) => item.models.length > 0);
    if (!profile) return null;

    const now = new Date().toISOString();
    const agent: ChatAgent = {
      id: uuidv4(),
      version: 2,
      name: "assistant",
      displayName: "默认助手",
      description: "通用 AI 助手",
      icon: "Sparkles",
      profileId: profile.id,
      modelId: profile.models[0].id,
      presetMessages: [],
      parameters: { temperature: 1, maxTokens: 4096 },
      createdAt: now,
      ...overrides,
    };
    agents.value.unshift(agent);
    await storage.saveAgent(agent);
    return agent;
  }

  async function createDefaultAgent(): Promise<void> {
    const profile = profilesStore.enabledProfiles.find((item) => item.models.length > 0);
    if (!profile) {
      logger.info("暂无可用模型，跳过创建默认智能体");
      return;
    }
    await createAgent();
  }

  async function updateAgent(agentId: string, updates: Partial<ChatAgent>): Promise<ChatAgent | null> {
    const index = agents.value.findIndex((agent) => agent.id === agentId);
    if (index < 0) return null;
    const updated: ChatAgent = { ...agents.value[index], ...updates, id: agentId };
    agents.value[index] = updated;
    await storage.saveAgent(updated);
    return updated;
  }

  async function removeAgent(agentId: string): Promise<void> {
    await storage.deleteAgent(agentId);
    agents.value = agents.value.filter((agent) => agent.id !== agentId);
  }

  async function markUsed(agentId: string): Promise<void> {
    await updateAgent(agentId, { lastUsedAt: new Date().toISOString() });
  }

  return {
    agents,
    sortedAgents,
    isLoaded,
    isLoading,
    init,
    getAgentById,
    createAgent,
    updateAgent,
    removeAgent,
    markUsed,
  };
});
