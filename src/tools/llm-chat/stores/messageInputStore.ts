import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { useStorage } from "@vueuse/core";

export interface InputToolbarSettings {
  showTokenUsage: boolean;
  enableMacroParsing: boolean;
  extractBase64FromPaste: boolean;
  groupQuickActionsBySet: boolean;
}

export const useMessageInputStore = defineStore(
  "llm-chat-message-input",
  () => {
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

    return {
      macroSelectorVisible,
      sessionListVisible,
      toolSettingsVisible,
      moreMenuVisible,
      settingsVisible,
      canvasMenuOpen,
      anyMenuOpen,
      settings,
    };
  }
);
