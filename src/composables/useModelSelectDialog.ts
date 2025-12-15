import { createGlobalState } from '@vueuse/core';
import { ref } from 'vue';
import type { LlmProfile, LlmModelInfo } from '@/types/llm-profiles';

export interface ModelSelection {
  profile: LlmProfile;
  model: LlmModelInfo;
}

export interface ModelSelectOptions {
  current?: ModelSelection | null;
  initialCapabilities?: string[];
}

export const useModelSelectDialog = createGlobalState(() => {
  const isDialogVisible = ref(false);
  const currentSelection = ref<ModelSelection | null>(null);
  const initialCapabilities = ref<string[]>([]);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let _resolvePromise: (value: ModelSelection | null) => void = (
    _value: ModelSelection | null
  ) => { };

  const open = (options?: ModelSelectOptions): Promise<ModelSelection | null> => {
    currentSelection.value = options?.current || null;
    initialCapabilities.value = options?.initialCapabilities || [];
    isDialogVisible.value = true;
    return new Promise((resolve) => {
      _resolvePromise = resolve;
    });
  };

  const close = () => {
    isDialogVisible.value = false;
    initialCapabilities.value = []; // 重置
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
    initialCapabilities,
    open,
    select,
    cancel,
  };
});