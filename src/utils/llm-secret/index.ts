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

import { createObfuscatedStore } from "./storage";
import {
  createLlmSecretVaultRuntime,
  DEFAULT_LLM_SECRET_FILE_NAME,
} from "./vault";
export * from "./apiKeyHash";
export * from "./codec";
export * from "./keyStates";
export * from "./profiles";
export * from "./storage";
export * from "./vault";

export interface LlmSecretVaultOptions {
  resolveDir: () => Promise<string>;
  fileName?: string;
  debounceDelay?: number;
}

/** Renderer storage adapter; revision matching and history live in the shared kernel. */
export function createLlmSecretVault(options: LlmSecretVaultOptions) {
  return createLlmSecretVaultRuntime(
    createObfuscatedStore<unknown>({
      resolveDir: options.resolveDir,
      fileName: options.fileName ?? DEFAULT_LLM_SECRET_FILE_NAME,
      createDefault: () => ({
        formatVersion: 2,
        current: { revision: null, secrets: {} },
      }),
      debounceDelay: options.debounceDelay,
      label: "llm-secrets",
    })
  );
}
