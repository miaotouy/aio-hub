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

import { describe, expect, it, vi } from "vitest";
import type { ProcessableMessage } from "@/tools/llm-chat/types/context";
import type { LlmReasoningArtifact } from "@/llm-apis/common";
import {
  handleConvertSystemToUser,
  handleEnsureAlternatingRoles,
  handleMergeConsecutiveRoles,
  handleMergeSystemToHead,
} from "../message-format-processors";

vi.mock("@/utils/logger", () => ({
  createModuleLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock("@/tools/token-calculator/token-calculator.registry", () => ({
  tokenCalculatorService: {
    calculateTokens: vi.fn(async (content: string) => ({
      count: content.length,
    })),
  },
}));

const replayArtifact: LlmReasoningArtifact = {
  provider: "openai",
  kind: "response.output_item",
  replayPolicy: "always",
  payload: { type: "reasoning", id: "rs_1" },
};

const msg = (
  role: ProcessableMessage["role"],
  content: string,
  reasoningArtifacts?: LlmReasoningArtifact[]
): ProcessableMessage => ({
  role,
  content,
  ...(reasoningArtifacts ? { reasoningArtifacts } : {}),
});

describe("message-format-processors reasoning artifact protection", () => {
  it("does not merge system messages that carry replay artifacts", () => {
    const protectedSystem = msg("system", "signed state", [replayArtifact]);
    const result = handleMergeSystemToHead(
      [
        msg("system", "first"),
        protectedSystem,
        msg("system", "second"),
        msg("user", "hello"),
      ],
      "\n---\n"
    );

    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({
      role: "system",
      content: "first\n---\nsecond",
      sourceType: "merged",
    });
    expect(result[0]._mergedSources).toHaveLength(2);
    expect(result[1]).toBe(protectedSystem);
    expect(result[2]).toMatchObject({ role: "user", content: "hello" });
  });

  it("does not merge consecutive roles across replay artifacts", () => {
    const protectedAssistant = msg("assistant", "signed state", [
      replayArtifact,
    ]);
    const result = handleMergeConsecutiveRoles(
      [
        msg("assistant", "a"),
        msg("assistant", "b"),
        protectedAssistant,
        msg("assistant", "c"),
        msg("assistant", "d"),
      ],
      "\n"
    );

    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({
      role: "assistant",
      content: "a\nb",
      sourceType: "merged",
    });
    expect(result[1]).toBe(protectedAssistant);
    expect(result[2]).toMatchObject({
      role: "assistant",
      content: "c\nd",
      sourceType: "merged",
    });
  });

  it("does not convert system messages that carry replay artifacts", () => {
    const protectedSystem = msg("system", "signed state", [replayArtifact]);
    const result = handleConvertSystemToUser([
      msg("system", "plain"),
      protectedSystem,
    ]);

    expect(result[0]).toMatchObject({ role: "user", content: "plain" });
    expect(result[1]).toBe(protectedSystem);
    expect(result[1].role).toBe("system");
  });

  it("does not insert alternating placeholders around replay artifacts", () => {
    const protectedAssistant = msg("assistant", "signed state", [
      replayArtifact,
    ]);
    const result = handleEnsureAlternatingRoles(
      [msg("assistant", "plain"), protectedAssistant, msg("assistant", "next")],
      "continue",
      "ok"
    );

    expect(result).toEqual([
      msg("assistant", "plain"),
      protectedAssistant,
      msg("assistant", "next"),
    ]);
  });
});
