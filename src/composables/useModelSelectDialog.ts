import { createGlobalState } from '@vueuse/core';
import { ref } from 'vue';
import type { LlmProfile, LlmModelInfo } from '@/types/llm-profiles';

export interface ModelSelection {
  profile: LlmProfile;
  model: LlmModelInfo;
}

export const useModelSelectDialog = createGlobalState(() => {
  const isDialogVisible = ref(false);
  const currentSelection = ref<ModelSelection | null>(null);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let _resolvePromise: (value: ModelSelection | null) => void = (
    _value: ModelSelection | null
  ) => {};

  const open = (current?: ModelSelection | null): Promise<ModelSelection | null> => {
    currentSelection.value = current || null;
    isDialogVisible.value = true;
    return new Promise((resolve) => {
      _resolvePromise = resolve;
    });
  };

  const close = () => {
    isDialogVisible.value = false;
  };

  const select = (selection: ModelSelection) => {
    _resolvePromise(selection);
    close();
  };

  const cancel = () => {
    _resolvePromise(null);
    close();
  };

  return {
    isDialogVisible,
    currentSelection,
    open,
    select,
    cancel,
  };
});