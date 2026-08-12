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

import {
  resolveAdapterIdForEndpointType,
  type LlmOperation,
  type ModelRouteBinding,
} from "@aiohub/llm-core";
import type { ChannelProbeResult } from "./types";

export interface ProbeRouteApplication {
  modelId: string;
  operation: LlmOperation;
  binding: ModelRouteBinding;
}

/**
 * Converts a successful probe result into a persisted model route application.
 *
 * Returns null when the result cannot be turned into a route: failures,
 * unresolved "auto" endpoints, unknown endpoint types, or operations that the
 * endpoint does not serve. The user must confirm before applying; this helper
 * never guesses a protocol.
 */
export function createProbeRouteApplication(
  result: ChannelProbeResult
): Omit<ProbeRouteApplication, "modelId"> | null {
  if (!result.success) return null;
  if (!result.capability) return null;
  if (result.endpointType === "auto") return null;

  const operation = result.capability;
  const adapterId = resolveAdapterIdForEndpointType(
    result.endpointType,
    operation
  );
  if (!adapterId) return null;

  return {
    operation,
    binding: {
      adapterId,
      endpointType: result.endpointType,
      source: "probe",
    },
  };
}
