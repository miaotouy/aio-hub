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
import { registerKnowledgeMacros } from "@/tools/llm-chat/macro-engine/macros/knowledge";
import {
  KnowledgeProcessor,
  scanPlaceholders,
} from "@/tools/llm-chat/core/context-processors/knowledge-processor";

const mocks = vi.hoisted(() => ({
  resolvePlaceholderRetrieval: vi.fn(),
}));

vi.mock("@/tools/recall/services/api", () => ({
  resolvePlaceholderRetrieval: mocks.resolvePlaceholderRetrieval,
}));

const behavior = baseline.agentBehavior;

describe("Recall migration baseline - Agent and Chat behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    MacroRegistry.getInstance().clear();
    registerKnowledgeMacros(MacroRegistry.getInstance());
  });

  it("freezes legacy macro names and generated placeholders", async () => {
    const registry = MacroRegistry.getInstance();
    expect(behavior.macros.every((name) => registry.hasMacro(name))).toBe(true);

    const macro = registry.getMacro("kb");
    expect(macro).toBeDefined();
    const output = await macro!.execute(
      {
        agent: {
          knowledgeBaseConfig: {
            enabled: true,
            bindings: behavior.bindings,
          },
        },
      } as any,
      []
    );
    expect(output).toBe(behavior.expectedMacroOutput);
  });

  it("freezes legacy placeholder parsing and history filtering", () => {
    const placeholders = scanPlaceholders([
      {
        role: "system",
        content: behavior.placeholderSample,
        sourceType: "preset",
      },
      {
        role: "user",
          content: "【kb::ignored-history】",
        sourceType: "session_history",
      },
    ] as any);

    expect(placeholders).toHaveLength(1);
    expect(placeholders[0]).toMatchObject(behavior.expectedParsedPlaceholder);
  });

  it("freezes automatic binding injection without requiring a handwritten macro", async () => {
    mocks.resolvePlaceholderRetrieval.mockResolvedValue({
      activated: true,
      content: "BASELINE_RECALL",
      resultCount: 2,
    });
    const context = {
      agentConfig: {
        knowledgeBaseConfig: {
          enabled: true,
          autoInjectIfMacroMissing: true,
          autoInjectPosition: "system_prompt_end",
          bindings: behavior.bindings,
        },
        knowledgeSettings: {
          defaultEngineId: "vector",
          enableCache: false,
        },
      },
      messages: [
        {
          role: "system",
          content: "System prompt",
          sourceType: "preset",
        },
        {
          role: "user",
          content: "Tell me about Rust migrations",
          sourceType: "session_history",
        },
      ],
      logs: [],
    } as any;

    await new KnowledgeProcessor().execute(context);

    expect(mocks.resolvePlaceholderRetrieval).toHaveBeenCalledTimes(2);
    expect(
      mocks.resolvePlaceholderRetrieval.mock.calls.map(([request]) => ({
        recallName: request.recallName,
        limit: request.limit,
        minScore: request.minScore,
        mode: request.mode,
        modeParams: request.modeParams,
      }))
    ).toEqual(
      behavior.bindings.map((binding) => ({
        recallName: binding.kbName,
        limit: binding.limit,
        minScore: binding.minScore,
        mode: binding.mode,
        modeParams: binding.modeParams,
      }))
    );
    expect(context.messages[0].content).toContain("BASELINE_RECALL");
  });
});
