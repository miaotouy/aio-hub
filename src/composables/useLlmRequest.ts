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

import { reactive } from "vue";
import { useLlmProfiles } from "./useLlmProfiles";
import { useLlmKeyManager } from "./useLlmKeyManager";
import { createModuleLogger } from "../utils/logger";
import { createModuleErrorHandler } from "../utils/errorHandler";
import { fetchWithTimeout } from "../llm-apis/common";
import { adapters } from "../llm-apis/adapters";
import { inspectorHookRegistry } from "../tools/llm-inspector/core/hookRegistry";
import { useVcpStore } from "../tools/vcp-connector/stores/vcpConnectorStore";
import { createModelRequestExecutor } from "../llm-apis/execution/modelRequestExecutor";

const logger = createModuleLogger("LlmRequest");
const errorHandler = createModuleErrorHandler("LlmRequest");

/** Renderer host services for the shared model request middleware. */
export function useLlmRequest() {
  const { profiles } = useLlmProfiles();
  const keys = useLlmKeyManager();
  return createModelRequestExecutor({
    getProfiles: () => profiles.value,
    getVcpWsUrl: () => useVcpStore().config.wsUrl,
    keys,
    adapters,
    inspector: inspectorHookRegistry,
    makeToolDiagnostics: (value) => reactive(value),
    interruptFetch: fetchWithTimeout,
    logger,
    errors: errorHandler,
  });
}
