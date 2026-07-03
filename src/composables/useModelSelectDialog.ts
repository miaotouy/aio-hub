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

import { createGlobalState } from "@vueuse/core";
import { ref } from "vue";
import type { LlmProfile, LlmModelInfo } from "@/types/llm-profiles";

export interface ModelSelection {
  profile: LlmProfile;
  model: LlmModelInfo;
}

export interface ModelSelectOptions {
  current?: ModelSelection | null;
  initialCapabilities?: Record<string, boolean>;
}

export const useModelSelectDialog = createGlobalState(() => {
  const isDialogVisible = ref(false);
  const currentSelection = ref<ModelSelection | null>(null);
  const initialCapabilities = ref<Record<string, boolean>>({});

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let _resolvePromise: (value: ModelSelection | null) => void = (
    _value: ModelSelection | null
  ) => {};

  const open = (
    options?: ModelSelectOptions
  ): Promise<ModelSelection | null> => {
    currentSelection.value = options?.current || null;
    initialCapabilities.value = options?.initialCapabilities || {};
    isDialogVisible.value = true;
    return new Promise((resolve) => {
      _resolvePromise = resolve;
    });
  };

  const close = () => {
    isDialogVisible.value = false;
    initialCapabilities.value = {}; // 重置
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
