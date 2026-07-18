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

  it("leaves the Knowledge namespace to its own processor", async () => {
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

    expect(context.logs).toHaveLength(0);
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
    expect(resolvePlaceholderRetrieval).toHaveBeenCalledWith(
      expect.objectContaining({
        userText: "query",
        aiText: "",
        turnCount: 1,
        recentMessageTexts: ["query"],
      })
    );
    expect(context.messages[0]).toMatchObject({
      role: "user",
      sourceType: "depth_injection",
      content: "retrieved",
    });
    expect(context.messages[1].content).toBe("query");
  });

  it("builds gate and turn context only from session history", async () => {
    const context = createContext({
      messages: [
        {
          role: "system",
          content:
            "【recall::collection=collection-1::when=gate::gate-tags=rust】",
        },
        { role: "user", content: "preset user text" },
        {
          role: "assistant",
          content: "previous answer",
          sourceType: "session_history",
        },
        { role: "user", content: "current query", sourceType: "session_history" },
      ],
      agentConfig: {
        recallConfig: {
          enabled: true,
          bindings: [
            {
              recallId: "collection-1",
              recallName: "Engineering",
              enabled: true,
            },
          ],
        },
      } as PipelineContext["agentConfig"],
    });

    await new RecallProcessor().execute(context);

    expect(resolvePlaceholderRetrieval).toHaveBeenCalledWith(
      expect.objectContaining({
        userText: "current query",
        aiText: "previous answer",
        turnCount: 1,
        recentMessageTexts: ["previous answer", "current query"],
      })
    );
  });

  it("reports invalid placeholders without blocking valid retrieval", async () => {
    const context = createContext({
      messages: [
        {
          role: "system",
          content:
            "【recall::old::4】 【recall::collection=collection-1】",
        },
        { role: "user", content: "query", sourceType: "session_history" },
      ],
      agentConfig: {
        recallConfig: {
          enabled: true,
          bindings: [
            {
              recallId: "collection-1",
              recallName: "Engineering",
              enabled: true,
            },
          ],
        },
      } as PipelineContext["agentConfig"],
    });

    await new RecallProcessor().execute(context);

    expect(resolvePlaceholderRetrieval).toHaveBeenCalledOnce();
    expect(context.messages[0].content).toBe("【recall::old::4】 retrieved");
    expect(context.logs).toEqual([
      expect.objectContaining({
        level: "warn",
        message: "Recall 占位符参数必须使用 key=value",
        details: expect.objectContaining({
          messageIndex: 0,
          raw: "【recall::old::4】",
        }),
      }),
    ]);
  });
});
