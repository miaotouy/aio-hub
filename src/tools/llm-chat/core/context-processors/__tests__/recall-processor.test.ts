// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PipelineContext } from "../../../types/pipeline";
import { RecallProcessor } from "../recall-processor";

const resolvePlaceholderRetrieval = vi.hoisted(() => vi.fn());

vi.mock("@/tools/recall/services/api", () => ({ resolvePlaceholderRetrieval }));

function createContext(
  overrides: Partial<PipelineContext> = {}
): PipelineContext {
  return {
    messages: [],
    agentConfig: {
      recallConfig: { enabled: false, bindings: [] },
    },
    logs: [],
    sharedData: new Map(),
    index: {} as PipelineContext["index"],
    detail: {} as PipelineContext["detail"],
    settings: {} as PipelineContext["settings"],
    timestamp: 0,
    ...overrides,
  } as PipelineContext;
}

describe("RecallProcessor", () => {
  beforeEach(() => {
    resolvePlaceholderRetrieval.mockReset();
    resolvePlaceholderRetrieval.mockResolvedValue({
      activated: true,
      content: "retrieved",
      resultCount: 1,
    });
  });

  it("does not report the new Knowledge namespace as legacy CAIU syntax", async () => {
    const context = createContext({
      messages: [
        {
          role: "system",
          content:
            "【knowledge::library=library-1::strategy=hybrid】 【knowledge::old::4】",
        },
      ],
    });

    await new RecallProcessor().execute(context);

    expect(context.logs).toHaveLength(1);
    expect(context.logs[0].details.raw).toBe("【knowledge::old::4】");
  });

  it("injects before session history and processes the generated placeholder", async () => {
    const context = createContext({
      messages: [
        { role: "user", content: "query", sourceType: "session_history" },
      ],
      agentConfig: {
        recallConfig: {
          enabled: true,
          autoInjectIfMacroMissing: true,
          autoInjectPosition: "context_head",
          bindings: [
            {
              recallId: "collection-1",
              recallName: "Engineering",
              enabled: true,
            },
          ],
        },
        recallSettings: { defaultProfile: "semantic" },
      } as PipelineContext["agentConfig"],
    });

    await new RecallProcessor().execute(context);

    expect(resolvePlaceholderRetrieval).toHaveBeenCalledOnce();
    expect(context.messages[0]).toMatchObject({
      role: "user",
      sourceType: "depth_injection",
      content: "retrieved",
    });
    expect(context.messages[1].content).toBe("query");
  });
});
