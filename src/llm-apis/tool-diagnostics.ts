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

import type { InspectorToolDiagnostics } from "@/tools/llm-inspector/types/hooks";

interface ToolCallLike {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

interface ToolResponseLike {
  content: string;
  finishReason?: string | null;
  toolCalls?: ToolCallLike[];
}

/** Matches all VCP call/result block delimiters that may leak into visible text. */
const VCP_TOOL_MARKER =
  /<<<\[(?:TOOL_REQUEST|END_TOOL_REQUEST|TOOL_RESULT|END_TOOL_RESULT)\]>>>/;

/**
 * Reads the native-tool declaration count from the exact JSON body sent to the
 * upstream API. Gemini groups function declarations inside each `tools` item;
 * the other supported provider families expose one declaration per item.
 */
export function inspectNativeToolRequestBody(
  body?: string
):
  | Pick<InspectorToolDiagnostics, "requestToolCount" | "hasNativeTools">
  | undefined {
  if (!body) return undefined;

  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch {
    return undefined;
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const tools = (value as Record<string, unknown>).tools;
  if (!Array.isArray(tools)) {
    return { requestToolCount: 0, hasNativeTools: false };
  }

  const requestToolCount = tools.reduce((count, tool) => {
    if (!tool || typeof tool !== "object" || Array.isArray(tool)) {
      return count;
    }
    const functionDeclarations = (tool as Record<string, unknown>)
      .functionDeclarations;
    return (
      count +
      (Array.isArray(functionDeclarations) ? functionDeclarations.length : 1)
    );
  }, 0);

  return {
    requestToolCount,
    hasNativeTools: requestToolCount > 0,
  };
}

/** Produces the normalized Adapter result shown alongside the raw Inspector response. */
export function buildDecodedToolDiagnostics(
  response: ToolResponseLike
): Pick<
  InspectorToolDiagnostics,
  "decodedFinishReason" | "decodedToolCalls" | "responseContainsVcpMarker"
> {
  return {
    decodedFinishReason: response.finishReason ?? null,
    decodedToolCalls: response.toolCalls?.map((toolCall) => ({
      id: toolCall.id,
      name: toolCall.function.name,
      arguments: toolCall.function.arguments,
    })),
    responseContainsVcpMarker: VCP_TOOL_MARKER.test(response.content),
  };
}
