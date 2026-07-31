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

import { classifyProbeError, type ProbeErrorCategory } from "@aiohub/llm-core";

export type KeyHealthAction =
  | "success"
  | "authentication-failure"
  | "rate-limit-failure"
  | "transient-failure"
  | "record-only"
  | "ignore";

interface KeyHealthResult {
  success: boolean;
  category?: ProbeErrorCategory;
}

export function getKeyHealthAction(result: KeyHealthResult): KeyHealthAction {
  if (result.success) return "success";
  switch (result.category) {
    case "authentication":
      return "authentication-failure";
    case "rate-limit":
      return "rate-limit-failure";
    case "network":
    case "timeout":
    case "provider":
      return "transient-failure";
    case "authorization":
    case "model-unavailable":
    case "unsupported-capability":
    case "bad-request":
    case "configuration":
    case "unknown":
    case undefined:
      return "record-only";
    case "cancelled":
      return "ignore";
  }
}

export function getKeyHealthActionForError(
  error: unknown,
  signal?: AbortSignal
): KeyHealthAction {
  const classified = classifyProbeError(error, signal);
  return getKeyHealthAction({
    success: false,
    category: classified.category,
  });
}
