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

import type { LlmProfile } from "../../types/llm-profiles";
import type {
  ApiKeyStatus,
  KeyStatesStorage,
} from "../../types/llm-key-manager";
export const LLM_KEY_STATE_EVENT = "llm://key-state";
export type KeyFailureOptions = {
  allowAutoDisable?: boolean;
  countTowardThreshold?: boolean;
  treatRateLimitAsImmediateBreak?: boolean;
  forceBroken?: boolean;
};
export type KeySelectionProfile = Pick<
  LlmProfile,
  "id" | "name" | "apiKeys" | "enabled"
>;
export type KeyCommand =
  | { method: "load" }
  | { method: "pick" | "sync"; profile: KeySelectionProfile }
  | { method: "success"; profileId: string; key: string }
  | {
      method: "failure";
      profileId: string;
      key: string;
      error: { message: string; status?: number; statusCode?: number };
      options?: KeyFailureOptions;
    }
  | {
      method: "update";
      profileId: string;
      key: string;
      updates: Partial<ApiKeyStatus>;
    }
  | { method: "remove"; profileId: string; key: string }
  | { method: "reset"; profileId: string }
  | { method: "enabled"; profileId: string; enabled: boolean }
  | { method: "autoDisable"; profileId: string; enabled: boolean }
  | { method: "recovery"; profileId: string; timeMs: number };
export interface KeyStateSnapshot {
  revision: number;
  storage: KeyStatesStorage;
}
export interface KeyCommandReply {
  snapshot: KeyStateSnapshot;
  key?: string;
  unavailable?: {
    message: string;
    reason: "all-disabled" | "all-enabled-circuit-broken";
    profileId: string;
    retryAt?: number;
  };
}
