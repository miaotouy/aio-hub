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

import type { LlmMessage, LlmReasoningArtifact } from "@/llm-apis/common";

export const DEEPSEEK_PROVIDER = "deepseek";
export const DEEPSEEK_REASONING_CONTENT_KIND = "reasoning_content";

export function isDeepSeekModel(modelId: string): boolean {
  return modelId.toLowerCase().includes("deepseek");
}

export function extractDeepSeekReasoningArtifacts(
  reasoningContent: unknown,
  hasToolCalls: boolean
): LlmReasoningArtifact[] | undefined {
  if (typeof reasoningContent !== "string" || !reasoningContent) {
    return undefined;
  }

  return [
    {
      provider: DEEPSEEK_PROVIDER,
      kind: DEEPSEEK_REASONING_CONTENT_KIND,
      replayPolicy: hasToolCalls ? "with_tool_calls" : "never",
      payload: {
        reasoning_content: reasoningContent,
      },
      visibleText: reasoningContent,
    },
  ];
}

export function getDeepSeekReplayReasoningContent(
  message: LlmMessage
): string | undefined {
  const artifact = message.reasoningArtifacts?.find(
    (item) =>
      item.provider === DEEPSEEK_PROVIDER &&
      item.kind === DEEPSEEK_REASONING_CONTENT_KIND &&
      item.replayPolicy === "with_tool_calls"
  );
  const content = (artifact?.payload as any)?.reasoning_content;
  return typeof content === "string" && content ? content : undefined;
}
