// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { computed, inject, provide, ref } from "vue";
import type { ComputedRef, Ref } from "vue";
import type { ChatAgent, UserProfile, AgentEditData } from "../types";
import type { LlmModelInfo } from "@/types/llm-profiles";
import { useAgentStore } from "@/tools/agent-manager/stores/agentStore";
import { useUserProfileStore } from "../stores/userProfileStore";
import { useLlmChatStore } from "../stores/llmChatStore";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { useModelMetadata } from "@/composables/useModelMetadata";
import { useModelSelectDialog } from "@/composables/useModelSelectDialog";
import { useResolvedAgentAvatar } from "@/tools/agent-manager/utils/agentAssetUtils";
import { useResolvedProfileAvatar } from "@/tools/user-profile-manager/utils/profileAssetUtils";
import { useLlmChatUiState } from "./ui/useLlmChatUiState";
import { useWindowSyncBus } from "@/composables/useWindowSyncBus";
import { createModuleLogger } from "@utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";

export interface ChatAreaContext {
  currentAgent: ComputedRef<ChatAgent | null>;
  currentModel: ComputedRef<LlmModelInfo | undefined | null>;
  modelIcon: ComputedRef<string | null>;
  effectiveUserProfile: ComputedRef<UserProfile | null>;
  agentAvatarSrc: ComputedRef<string | null>;
  userProfileAvatarSrc: ComputedRef<string | null>;
  sortedAgents: ComputedRef<ChatAgent[]>;

  showEditAgentDialog: Ref<boolean>;
  initialEditTab: Ref<string | undefined>;
  initialEditSection: Ref<string | undefined>;
  showEditProfileDialog: Ref<boolean>;
  showQuickActionManager: Ref<boolean>;
  showChatSettings: Ref<boolean>;
  showSearchPanel: Ref<boolean>;

  handleEditAgent: (tab?: string, section?: string) => void;
  handleSelectModel: () => Promise<void>;
  handleSaveAgent: (
    data: AgentEditData,
    options?: { silent?: boolean; agentId?: string }
  ) => Promise<void>;
  handleQuickSwitchAgent: (agentId: string) => Promise<void>;
  handleSaveUserProfile: (
    updates: Partial<Omit<UserProfile, "id" | "createdAt">>
  ) => Promise<void>;
  handleEditUserProfile: () => void;
}

const CHAT_AREA_CONTEXT_KEY = Symbol("ChatAreaContext");

const logger = createModuleLogger("ChatAreaContext");
const errorHandler = createModuleErrorHandler("ChatAreaContext");

export function provideChatAreaContext(options: {
  currentAgentId: Ref<string | undefined> | ComputedRef<string | undefined>;
  currentModelId: Ref<string | undefined> | ComputedRef<string | undefined>;
}): ChatAreaContext {
  const agentStore = useAgentStore();
  const userProfileStore = useUserProfileStore();
  const { selectAgent } = useLlmChatUiState();
  const llmChatStore = useLlmChatStore();
  const bus = useWindowSyncBus();
  const { getProfileById } = useLlmProfiles();
  const { getModelIcon } = useModelMetadata();
  const { open: openModelSelectDialog } = useModelSelectDialog();

  const currentAgent = computed(() => {
    const agentId = options.currentAgentId.value;
    if (!agentId) return null;
    return agentStore.getAgentById(agentId) ?? null;
  });

  const agentAvatarSrc = useResolvedAgentAvatar(currentAgent);

  const currentModel = computed(() => {
    if (!currentAgent.value) return null;
    const profile = getProfileById(currentAgent.value.profileId);
    if (!profile) return null;
    const modelId = options.currentModelId.value || currentAgent.value.modelId;
    return profile.models.find((model) => model.id === modelId);
  });

  const modelIcon = computed(() => {
    if (!currentModel.value) return null;
    return getModelIcon(currentModel.value);
  });
  const effectiveUserProfile = computed(() => {
    return (
      userProfileStore.getEffectiveProfile(currentAgent.value?.userProfileId) ??
      null
    );
  });

  const userProfileAvatarSrc = useResolvedProfileAvatar(effectiveUserProfile);

  const sortedAgents = computed(() => agentStore.sortedAgents);

  const showEditProfileDialog = ref(false);
  const showEditAgentDialog = ref(false);
  const initialEditTab = ref<string | undefined>(undefined);
  const initialEditSection = ref<string | undefined>(undefined);
  const showChatSettings = ref(false);
  const showSearchPanel = ref(false);
  const showQuickActionManager = ref(false);

  const handleEditAgent = (tab?: string, section?: string) => {
    if (currentAgent.value) {
      logger.info("打开智能体编辑对话框", {
        agentId: currentAgent.value.id,
        tab,
        section,
      });
      initialEditTab.value = tab;
      initialEditSection.value = section;
      showEditAgentDialog.value = true;
    } else {
      logger.warn("无法编辑智能体：未找到当前智能体");
    }
  };

  const handleSelectModel = async () => {
    if (!currentAgent.value) {
      logger.warn("无法选择模型：未找到当前智能体");
      return;
    }

    logger.info("打开模型选择弹窗");

    let currentSelection = null;
    if (currentModel.value) {
      const profile = getProfileById(currentAgent.value.profileId);
      if (profile) {
        currentSelection = {
          profile,
          model: currentModel.value,
        };
      }
    }

    const result = await openModelSelectDialog({
      current: currentSelection,
      initialCapabilities: { embedding: false, rerank: false },
    });

    if (result) {
      logger.info("用户选择了新模型", {
        profile: result.profile.name,
        model: result.model.name,
      });

      const updates = {
        profileId: result.profile.id,
        modelId: result.model.id,
      };

      if (bus.windowType === "detached-component") {
        try {
          await bus.requestAction("llm-chat:update-agent", {
            agentId: currentAgent.value.id,
            updates,
          });
        } catch (error) {
          errorHandler.error(error, "请求更新智能体失败");
        }
      } else {
        agentStore.updateAgent(currentAgent.value.id, updates);
      }
    } else {
      logger.info("用户取消了模型选择");
    }
  };

  const handleSaveAgent = async (
    data: AgentEditData,
    options: { silent?: boolean; agentId?: string } = {}
  ) => {
    const targetId = options.agentId || currentAgent.value?.id;
    if (targetId) {
      logger.info("保存智能体", {
        agentId: targetId,
        data,
        silent: options.silent,
      });

      if (bus.windowType === "detached-component") {
        try {
          await bus.requestAction("llm-chat:update-agent", {
            agentId: targetId,
            updates: data,
          });
        } catch (error) {
          errorHandler.error(error, "请求更新智能体失败");
        }
      } else {
        agentStore.updateAgent(targetId, data);
      }
    }

    if (!options.silent) {
      showEditAgentDialog.value = false;
    }
  };

  const handleEditUserProfile = () => {
    if (effectiveUserProfile.value) {
      logger.info("打开用户档案编辑对话框", {
        profileId: effectiveUserProfile.value.id,
      });
      showEditProfileDialog.value = true;
    } else {
      logger.warn("无法编辑用户档案：未找到有效的用户档案");
    }
  };

  const handleQuickSwitchAgent = async (agentId: string) => {
    if (agentId === currentAgent.value?.id) return;

    logger.info("快捷切换智能体", { agentId });

    if (bus.windowType === "detached-component") {
      try {
        await bus.requestAction("llm-chat:select-agent", { agentId });
      } catch (error) {
        errorHandler.error(error, "请求切换智能体失败");
      }
    } else {
      selectAgent(agentId, {
        sessionId: llmChatStore.currentSessionId,
      });
    }
  };

  const handleSaveUserProfile = async (
    updates: Partial<Omit<UserProfile, "id" | "createdAt">>
  ) => {
    if (effectiveUserProfile.value) {
      logger.info("保存用户档案", {
        profileId: effectiveUserProfile.value.id,
        updates,
      });
      if (bus.windowType === "detached-component") {
        try {
          await bus.requestAction("llm-chat:update-user-profile", {
            profileId: effectiveUserProfile.value.id,
            updates,
          });
        } catch (error) {
          errorHandler.error(error, "请求更新用户档案失败");
        }
      } else {
        userProfileStore.updateProfile(effectiveUserProfile.value.id, updates);
      }
    }
    showEditProfileDialog.value = false;
  };

  const context: ChatAreaContext = {
    currentAgent,
    currentModel,
    modelIcon,
    effectiveUserProfile,
    agentAvatarSrc,
    userProfileAvatarSrc,
    sortedAgents,
    showEditAgentDialog,
    initialEditTab,
    initialEditSection,
    showEditProfileDialog,
    showQuickActionManager,
    showChatSettings,
    showSearchPanel,
    handleEditAgent,
    handleSelectModel,
    handleSaveAgent,
    handleQuickSwitchAgent,
    handleSaveUserProfile,
    handleEditUserProfile,
  };

  provide(CHAT_AREA_CONTEXT_KEY, context);
  return context;
}

export function useChatAreaContext(): ChatAreaContext {
  const context = inject<ChatAreaContext>(CHAT_AREA_CONTEXT_KEY);
  if (!context) {
    throw new Error(
      "useChatAreaContext must be used within a ChatArea component"
    );
  }
  return context;
}
