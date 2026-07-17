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

import { beforeEach, describe, expect, it, vi } from "vitest";
import baseline from "../__fixtures__/recall-migration-baseline-v1.json";
import { MacroRegistry } from "@/tools/llm-chat/macro-engine/MacroRegistry";
import { registerRecallMacros } from "@/tools/llm-chat/macro-engine/macros/recall";
import { scanRecallPlaceholders } from "@/tools/llm-chat/core/context-processors/recall-placeholder";
import { RecallProcessor } from "@/tools/llm-chat/core/context-processors/recall-processor";

const mocks = vi.hoisted(() => ({ resolvePlaceholderRetrieval: vi.fn() }));
vi.mock("@/tools/recall/services/api", () => ({
  resolvePlaceholderRetrieval: mocks.resolvePlaceholderRetrieval,
}));

const bindings = baseline.agentBehavior.bindings.map((binding) => ({
  recallId: binding.kbId,
  recallName: binding.kbName,
  enabled: binding.enabled,
  when: binding.mode,
  whenParams: binding.modeParams,
  limit: binding.limit,
  minScore: binding.minScore,
}));

describe("Recall migration baseline - Agent and Chat behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    MacroRegistry.getInstance().clear();
    registerRecallMacros(MacroRegistry.getInstance());
  });

  it("generates canonical Recall macros with stable collection IDs", async () => {
    const registry = MacroRegistry.getInstance();
    expect(registry.hasMacro("kb")).toBe(false);
    const output = await registry
      .getMacro("recall")!
      .execute(
        { agent: { recallConfig: { enabled: true, bindings } } } as any,
        []
      );
    expect(output).toContain(
      `collection=${encodeURIComponent(bindings[0].recallId)}`
    );
    expect(output).toContain("when=gate");
  });

  it("parses only Recall envelopes and skips history", () => {
    const placeholders = scanRecallPlaceholders([
      {
        role: "system",
        content: `【recall::collection=${bindings[0].recallId}::limit=5】`,
      },
      {
        role: "user",
        content: "【recall::limit=4】",
        sourceType: "session_history",
      },
    ] as any);
    expect(placeholders).toHaveLength(1);
    expect(placeholders[0]).toMatchObject({
      collection: bindings[0].recallId,
      limit: 5,
    });
  });

  it("injects Recall bindings without a handwritten macro", async () => {
    mocks.resolvePlaceholderRetrieval.mockResolvedValue({
      activated: true,
      content: "BASELINE_RECALL",
      resultCount: 2,
    });
    const context = {
      agentConfig: {
        recallConfig: {
          enabled: true,
          autoInjectIfMacroMissing: true,
          bindings,
        },
        recallSettings: { defaultProfile: "semantic", enableCache: false },
      },
      messages: [
        {
          role: "system",
          content: "System prompt",
          sourceType: "agent_preset",
        },
        {
          role: "user",
          content: "Tell me about Rust migrations",
          sourceType: "session_history",
        },
      ],
      logs: [],
    } as any;
    await new RecallProcessor().execute(context);
    expect(mocks.resolvePlaceholderRetrieval).toHaveBeenCalledTimes(
      bindings.length
    );
    expect(
      mocks.resolvePlaceholderRetrieval.mock.calls.map(
        ([request]) => request.recallId
      )
    ).toEqual(bindings.map((binding) => binding.recallId));
    expect(context.messages[0].content).toContain("BASELINE_RECALL");
  });
});
