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

/**
 * LLM API Key 状态管理 Composable
 */

import { ref } from "vue";
import type { KeyStatesStorage } from "../types/llm-key-manager";
import { createConfigManager } from "@utils/configManager";
import { createModuleLogger } from "@utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { createLlmKeyManagerRuntime } from "../llm-apis/configuration/keyManager";
import { createLlmKeyStateClient } from "../llm-apis/configuration/keyClient";
import { LLM_KEY_STATE_EVENT } from "../llm-apis/configuration/keyProtocol";
import { getElectronBridge, request } from "../platform/electron/client";
import { listen } from "../platform/electron/events";
export {
  ApiKeyUnavailableError,
  normalizeKeyStatesStorage,
} from "../llm-apis/configuration/keyManager";
export type { ApiKeyUnavailableReason } from "../llm-apis/configuration/keyManager";

const logger = createModuleLogger("LlmKeyManager");
const errorHandler = createModuleErrorHandler("LlmKeyManager");

// 配置文件管理器
const configManager = createConfigManager<KeyStatesStorage>({
  moduleName: "llm-service",
  fileName: "key-states.json",
  version: "1.1.0",
  createDefault: () => ({
    states: {},
    lastUsedIndices: {},
    profileSettings: {},
  }),
});

// 全局状态
const keyStates = ref<KeyStatesStorage>({
  states: {},
  lastUsedIndices: {},
  profileSettings: {},
});
const isLoaded = ref(false);
let runtime: ReturnType<typeof createLlmKeyManagerRuntime> | undefined;
let electronClient: ReturnType<typeof createLlmKeyStateClient> | undefined;

export function useLlmKeyManager() {
  if (getElectronBridge()) {
    electronClient ??= createLlmKeyStateClient({
      state: keyStates,
      call: (command) => request("llm.keys.call", { command }),
      subscribe: (receive) =>
        listen(LLM_KEY_STATE_EVENT, (event) =>
          receive(
            event.payload as import("../llm-apis/configuration/keyProtocol").KeyStateSnapshot
          )
        ),
      onError: (error) =>
        errorHandler.handle(error, {
          userMessage: "密钥状态同步失败，请重试或重新打开窗口",
          showToUser: true,
        }),
    });
    void electronClient
      .ensureLoaded()
      .catch((error) =>
        errorHandler.handle(error, {
          userMessage: "密钥状态加载失败，请检查配置文件后重试",
          showToUser: true,
        })
      );
    return electronClient;
  }
  runtime ??= createLlmKeyManagerRuntime({
    state: keyStates,
    loaded: isLoaded,
    storage: configManager,
    logger,
    errors: errorHandler,
  });
  if (!isLoaded.value) void runtime.ensureLoaded();
  return runtime;
}
