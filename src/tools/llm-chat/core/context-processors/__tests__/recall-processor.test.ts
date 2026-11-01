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

  it("does not process removed Knowledge envelope syntax", async () => {
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
    expect(resolvePlaceholderRetrieval).not.toHaveBeenCalled();
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
        {
          role: "user",
          content: "current query",
          sourceType: "session_history",
        },
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

  it("maps an explicit legacy profile before applying the global preset", async () => {
    const context = createContext({
      messages: [
        {
          role: "system",
          content: "【recall::collection=collection-1::profile=semantic】",
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
        recallSettings: { defaultPresetId: "algorithmic" },
      } as PipelineContext["agentConfig"],
    });

    await new RecallProcessor().execute(context);

    expect(resolvePlaceholderRetrieval).toHaveBeenCalledWith(
      expect.objectContaining({ presetId: "comprehensive" })
    );
  });

  it("reports invalid placeholders without blocking valid retrieval", async () => {
    const context = createContext({
      messages: [
        {
          role: "system",
          content: "【recall::old::4】 【recall::collection=collection-1】",
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

// Protect automatic-vs-explicit placement, original tool roles and request-only lifecycle.
describe("cache-friendly automatic Recall", () => {
  function optimized() {
    return createContext({
      messages: [
        {
          role: "system",
          content: "fixed",
          sourceType: "agent_preset",
          sourceId: "base",
        },
        {
          role: "user",
          content: "query",
          sourceType: "session_history",
          sourceId: "user",
        },
      ],
      traceProcessor: () => () => {},
      agentConfig: {
        parameters: { contextCacheOptimization: { enabled: true } },
        recallConfig: {
          enabled: true,
          autoInjectIfMacroMissing: true,
          autoInjectPosition: "context_head",
          bindings: [
            { recallId: "collection-1", recallName: "Memory", enabled: true },
          ],
        },
      } as PipelineContext["agentConfig"],
    });
  }
  beforeEach(() => {
    resolvePlaceholderRetrieval.mockReset();
    resolvePlaceholderRetrieval.mockResolvedValue({
      activated: true,
      content: "memory",
      resultCount: 1,
    });
  });
  it("keeps preset System text fixed and identifies automatic Recall and its placeholder", async () => {
    const ctx = optimized();
    await new RecallProcessor().execute(ctx);
    expect(ctx.messages.find((m) => m.sourceId === "base")?.content).toBe(
      "fixed"
    );
    expect(ctx.messages[ctx.messages.length - 2]).toMatchObject({
      role: "user",
      sourceId: "recall:auto",
      content: "<runtime-context>\nmemory\n</runtime-context>",
    });
    expect(ctx.messages[ctx.messages.length - 2]?._snapshotFragments).toEqual([
      expect.objectContaining({
        sourceId: "collection-1",
        collection: "collection-1",
        placeholder: "【recall::collection=collection-1】",
        content: "memory",
      }),
    ]);
    expect(ctx.messages[ctx.messages.length - 1]?.sourceId).toBe("user");
    expect(ctx.agentConfig.recallConfig?.autoInjectPosition).toBe(
      "context_head"
    );
  });
  it("retrieves from the original user query and inserts after normalized tool results", async () => {
    const ctx = optimized();
    ctx.messages.push(
      { role: "assistant", content: "calling", sourceType: "session_history" },
      {
        role: "user",
        _historyRole: "tool",
        content: "tool result",
        sourceType: "session_history",
      }
    );
    await new RecallProcessor().execute(ctx);
    expect(resolvePlaceholderRetrieval).toHaveBeenCalledWith(
      expect.objectContaining({ userText: "query", turnCount: 1 })
    );
    expect(ctx.messages[ctx.messages.length - 1]?.sourceId).toBe("recall:auto");
    expect(ctx.messages[ctx.messages.length - 2]?.content).toBe("tool result");
  });
  it("keeps explicit Recall in its configured role and position", async () => {
    const ctx = optimized();
    ctx.messages[0].content = "fixed 【recall::collection=collection-1】";
    await new RecallProcessor().execute(ctx);
    expect(ctx.messages.find((m) => m.sourceId === "base")).toMatchObject({
      role: "system",
      content: "fixed memory",
    });
    expect(
      ctx.messages.filter((m) => m.role === "user").map((m) => m.content)
    ).toEqual(["query"]);
  });
  it("removes inactive automatic blocks and regenerates only the current request's data", async () => {
    const first = optimized();
    await new RecallProcessor().execute(first);
    resolvePlaceholderRetrieval.mockResolvedValue({
      activated: false,
      content: "",
      resultCount: 0,
    });
    const second = optimized();
    await new RecallProcessor().execute(second);
    expect(
      second.messages.filter((m) => m.role === "user").map((m) => m.content)
    ).toEqual(["query"]);
    expect(first.detail).toEqual({});
    expect(second.detail).toEqual({});
  });
  it("preserves the configured legacy placement when optimization is disabled", async () => {
    const ctx = optimized();
    ctx.agentConfig.parameters!.contextCacheOptimization!.enabled = false;
    await new RecallProcessor().execute(ctx);
    expect(
      ctx.messages.map(({ role, content }) => ({ role, content }))
    ).toEqual([
      { role: "system", content: "fixed\n\nmemory" },
      { role: "user", content: "query" },
    ]);
  });
});
