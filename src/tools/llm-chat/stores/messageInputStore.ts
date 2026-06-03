import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { useStorage } from "@vueuse/core";
import { useChatInputManager } from "../composables/input/useChatInputManager";
import { useChatInputTokenPreview } from "../composables/input/useChatInputTokenPreview";
import { useLlmProfiles } from "@/composables/useLlmProfiles";

export interface InputToolbarSettings {
  showTokenUsage: boolean;
  enableMacroParsing: boolean;
  extractBase64FromPaste: boolean;
  groupQuickActionsBySet: boolean;
}

export const useMessageInputStore = defineStore(
  "llm-chat-message-input",
  () => {
    // === 1. UI 菜单可见性 ===
    const macroSelectorVisible = ref(false);
    const sessionListVisible = ref(false);
    const toolSettingsVisible = ref(false);
    const moreMenuVisible = ref(false);
    const settingsVisible = ref(false);
    const canvasMenuOpen = ref(false);

    const anyMenuOpen = computed(
      () =>
        macroSelectorVisible.value ||
        sessionListVisible.value ||
        toolSettingsVisible.value ||
        moreMenuVisible.value ||
        settingsVisible.value ||
        canvasMenuOpen.value
    );

    // === 2. 持久化设置 ===
    const settings = useStorage<InputToolbarSettings>(
      "chat-input-settings",
      {
        showTokenUsage: true,
        enableMacroParsing: true,
        extractBase64FromPaste: true,
        groupQuickActionsBySet: false,
      },
      localStorage,
      { mergeDefaults: true }
    );

    // === 3. 输入状态代理 ===
    const inputManager = useChatInputManager();
    const { getProfileById } = useLlmProfiles();

    const inputText = inputManager.inputText;
    const attachments = inputManager.attachments;
    const isProcessingAttachments = inputManager.isProcessingAttachments;
    const hasAttachments = inputManager.hasAttachments;
    const temporaryModel = inputManager.temporaryModel;
    const continuationModel = inputManager.continuationModel;

    // === 4. Token 预览 ===
    const {
      tokenCount,
      isCalculatingTokens,
      tokenEstimated,
      triggerCalculation,
    } = useChatInputTokenPreview({ inputText, attachments, temporaryModel });

    // === 5. 模型信息计算属性 ===
    const temporaryModelInfo = computed(() => {
      if (!temporaryModel.value) return null;
      const profile = getProfileById(temporaryModel.value.profileId);
      const model = profile?.models.find(
        (m) => m.id === temporaryModel.value?.modelId
      );
      if (!profile || !model) return null;
      return { profileName: profile.name, modelName: model.name || model.id };
    });

    const continuationModelInfo = computed(() => {
      if (!continuationModel.value) return null;
      const profile = getProfileById(continuationModel.value.profileId);
      const model = profile?.models.find(
        (m) => m.id === continuationModel.value?.modelId
      );
      if (!profile || !model) return null;
      return { profileName: profile.name, modelName: model.name || model.id };
    });

    return {
      // 菜单可见性
      macroSelectorVisible,
      sessionListVisible,
      toolSettingsVisible,
      moreMenuVisible,
      settingsVisible,
      canvasMenuOpen,
      anyMenuOpen,
      // 持久化设置
      settings,
      // 输入状态代理
      inputText,
      attachments,
      isProcessingAttachments,
      hasAttachments,
      temporaryModel,
      continuationModel,
      // Token 预览
      tokenCount,
      isCalculatingTokens,
      tokenEstimated,
      triggerCalculation,
      // 模型信息
      temporaryModelInfo,
      continuationModelInfo,
    };
  }
);
