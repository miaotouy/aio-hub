// Copyright 2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from "vitest";
import { PresetConfigurationError } from "@aiohub/agent-preset-core";
import { executeContextPipeline } from "../src/tools/llm-chat/core/pipeline/executeContextPipeline";
import { createSessionLoader } from "../src/tools/llm-chat/core/pipeline/processors/session-loader";
import { createRegexProcessor } from "../src/tools/llm-chat/core/pipeline/processors/regex-processor";
import { createVariableProcessor } from "../src/tools/llm-chat/core/pipeline/processors/variable-processor";
import { createWorldbookProcessors } from "../src/tools/llm-chat/core/pipeline/processors/worldbook-processor";
import { createTokenLimiter } from "../src/tools/llm-chat/core/pipeline/processors/token-limiter";
import { createMessageFormatters } from "../src/tools/llm-chat/core/pipeline/processors/message-format-processors";
import { STWorldbookPosition } from "../src/tools/st-worldbook-manager/types/worldbook";
import type { ChatMessageNode } from "../src/tools/llm-chat/types/message";
import type {
  ContextProcessor,
  PipelineContext,
} from "../src/tools/llm-chat/types/pipeline";
import type { ContextTokenPorts } from "../src/tools/llm-chat/core/pipeline/ports";

const logger = { debug() {}, info() {}, warn() {}, error() {} };
const ports = () => ({ logger, reportProcessorError: vi.fn(async () => {}) });
const node = (
  id: string,
  parentId: string | null,
  role: ChatMessageNode["role"],
  content: string
): ChatMessageNode => ({
  id,
  parentId,
  childrenIds: [],
  role,
  content,
  status: "complete",
});
function context(): PipelineContext {
  const nodes = {
    root: node("root", null, "system", "root"),
    old: node(
      "old",
      "root",
      "assistant",
      "<p>seed</p><think>raw <b>state</b></think>"
    ),
    latest: node("latest", "old", "user", "seed"),
    other: node("other", "root", "user", "other branch"),
  };
  return {
    messages: [],
    index: { id: "session" },
    detail: { id: "session", rootNodeId: "root", activeLeafId: "other", nodes },
    agentConfig: { id: "agent", modelId: "model", parameters: {} },
    settings: {
      contextOptimization: { convertHtmlToMd: true, htmlToMdLastMessages: 1 },
    },
    timestamp: Date.now(),
    logs: [],
    sharedData: new Map<string, any>([
      ["contextPreviewTargetNodeId", "latest"],
    ]),
  } as unknown as PipelineContext;
}
const stage = (
  id: string,
  execute: ContextProcessor["execute"]
): ContextProcessor => ({
  id,
  name: id,
  description: id,
  priority: 1,
  execute,
});
const tokenPorts = (): ContextTokenPorts => ({
  logger,
  // Deterministic budget service: these tests exercise selection and attachment forwarding.
  getContextTokenCalculator: () =>
    ({
      calculateTokens: async (text: string) => ({ count: text.length }),
      calculateMessageTokens: async (
        text: string,
        _model: string,
        attachments: unknown[] = []
      ) => ({ count: text.length + attachments.length * 100 }),
    }) as ReturnType<ContextTokenPorts["getContextTokenCalculator"]>,
});

describe("shared context pipeline in Node", () => {
  it("builds the requested branch, converts HTML with protected reasoning, and keeps fresh attachment metadata and pending input", async () => {
    const loader = createSessionLoader({ logger });
    const ctx = context();
    ctx.detail.nodes.old.localMedia = [
      {
        id: "image",
        type: "image",
        size: 1,
        name: "frame",
        path: "C:/frame.png",
        mimeType: "image/png",
      },
    ];
    ctx.sharedData.set("pendingInput", {
      text: "draft",
      originalText: "raw draft",
    });
    await executeContextPipeline(ctx, [loader], ports());
    expect(ctx.messages.map((m) => m.sourceId)).toEqual([
      "old",
      "latest",
      expect.stringContaining("virtual-pending-input-"),
    ]);
    expect(ctx.messages[0].content).toContain("seed");
    expect(ctx.messages[0].content).toContain(
      "<think>raw <b>state</b></think>"
    );
    expect(ctx.messages[0].content).toContain(
      "converted from HTML to Markdown"
    );
    expect(ctx.messages.slice(1).map((m) => m.content)).toEqual([
      "seed",
      "draft",
    ]);
    expect(ctx.messages[0]._attachments).toEqual([
      expect.objectContaining({
        type: "image",
        source: { kind: "local-file", path: "C:/frame.png" },
      }),
    ]);
    expect(ctx.messages[2]).toMatchObject({
      sourceId: expect.stringContaining("virtual"),
      _originalContent: "raw draft",
    });
    ctx.detail.nodes.old.metadata = { modelId: "new-model" };
    await executeContextPipeline(ctx, [loader], ports());
    expect(ctx.messages[0].metadata?.modelId).toBe("new-model");
    expect(ctx.detail.nodes.old.content).toContain("<p>seed</p>");
  });

  it("uses request-owned regex settings independently across executions and preserves non-text parts", async () => {
    const regex = createRegexProcessor({ logger });
    const first = context();
    const second = context();
    const rules = (replacement: string) => ({
      presets: [
        {
          id: "rules",
          name: "rules",
          enabled: true,
          rules: [
            {
              id: "r",
              enabled: true,
              regex: "/seed/g",
              replacement,
              targetRoles: ["user"],
              applyTo: { request: true, render: false },
              depthRange: { max: 0 },
            },
          ],
        },
      ],
    });
    first.settings.regexConfig = rules("one") as any;
    second.settings.regexConfig = rules("two") as any;
    for (const ctx of [first, second])
      ctx.messages = [
        { role: "user", content: "seed" },
        {
          role: "user",
          content: [
            { type: "text", text: "seed" },
            {
              type: "image_url",
              image_url: { url: "data:image/png;base64,AA==" },
            },
          ],
        },
      ];
    await Promise.all([
      executeContextPipeline(first, [regex], ports()),
      executeContextPipeline(second, [regex], ports()),
    ]);
    expect(first.messages[0].content).toBe("seed");
    expect(first.messages[1].content).toEqual([
      { type: "text", text: "one" },
      { type: "image_url", image_url: { url: "data:image/png;base64,AA==" } },
    ]);
    expect((second.messages[1].content as any[])[0].text).toBe("two");
  });

  it("matches worldbook history, resumes variable snapshots, and formats without combining protected replay state", async () => {
    const ctx = context();
    ctx.messages = [
      {
        role: "assistant",
        content: "old <svar name=hp op=+ value=99 />",
        metadata: {
          sessionVariableSnapshot: { values: { hp: 7 }, timestamp: 1 },
        },
      },
      {
        role: "assistant",
        content: "signed",
        reasoningArtifacts: [
          {
            provider: "openai",
            kind: "response.output_item",
            replayPolicy: "always",
            payload: { id: "signed" },
          },
        ],
      },
      {
        role: "user",
        content: "latest <svar name=hp op=+ value=2 /> hp=$[hp]",
        sourceType: "session_history",
      },
    ];
    ctx.agentConfig.variableConfig = { enabled: true, definitions: [] } as any;
    ctx.agentConfig.parameters!.contextPostProcessing = {
      rules: [{ type: "post:merge-consecutive-roles", enabled: true }],
    };
    ctx.settings.worldbook = { defaultScanDepth: 1 } as any;
    ctx.sharedData.set("loadedWorldbooks", [
      {
        metadata: { name: "book" },
        entries: {
          1: {
            uid: 1,
            key: ["latest"],
            keysecondary: [],
            content: "world facts",
            order: 1,
            position: STWorldbookPosition.Outlet,
            probability: 100,
            depth: 0,
            preventRecursion: true,
          },
        },
      },
    ]);
    await executeContextPipeline(
      ctx,
      [
        createWorldbookProcessors({ logger }).worldbookProcessor,
        createVariableProcessor({ logger }),
        createMessageFormatters(tokenPorts()).messageFormatter,
      ],
      ports()
    );
    expect(ctx.sharedData.get("activatedWorldbookEntries")).toEqual([
      expect.objectContaining({
        raw: expect.objectContaining({ content: "world facts" }),
        matchedKeys: ["latest"],
      }),
    ]);
    expect(ctx.messages).toHaveLength(3);
    expect(ctx.messages[1].reasoningArtifacts?.[0].payload).toEqual({
      id: "signed",
    });
    expect(ctx.messages[2].content).toContain("hp=9");
    expect(ctx.messages[2].metadata?.sessionVariableSnapshot?.values).toEqual({
      hp: 9,
    });
    expect(ctx.detail.nodes.latest.metadata).toBeUndefined();
  });

  it("preserves preset and newest history under the budget, reports dropped replay artifacts and forwards effective image dimensions", async () => {
    const ctx = context();
    ctx.messages = [
      {
        role: "assistant",
        content: "12345",
        sourceType: "session_history",
        sourceId: "old",
        reasoningArtifacts: [
          {
            provider: "openai",
            kind: "response.output_item",
            replayPolicy: "always",
            payload: { id: "old" },
          },
        ],
      },
      {
        role: "system",
        content: "p",
        sourceType: "agent_preset",
        sourceId: "preset",
      },
      {
        role: "user",
        content: "1234",
        sourceType: "session_history",
        sourceId: "latest",
      },
    ];
    ctx.agentConfig.parameters!.contextManagement = {
      enabled: true,
      maxContextTokens: 5,
    } as any;
    ctx.agentConfig.parameters!.imageCompression = {
      enabled: true,
      maxDimension: 1024,
    };
    Object.assign(ctx, { capabilities: { maxImageDimension: 2048 } });
    const services = tokenPorts();
    const calc = vi.fn(
      services.getContextTokenCalculator().calculateMessageTokens
    );
    services.getContextTokenCalculator = () => ({
      ...tokenPorts().getContextTokenCalculator(),
      calculateMessageTokens: calc,
    });
    await executeContextPipeline(ctx, [createTokenLimiter(services)], ports());
    expect(ctx.messages.map((m) => m.sourceId)).toEqual(["preset", "latest"]);
    expect(ctx.sharedData.get("reasoningArtifactsDropped")).toEqual([
      expect.objectContaining({ sourceId: "old", artifactCount: 1 }),
    ]);
    expect(calc).toHaveBeenCalledWith("1234", "model", undefined, {
      maxImageDimension: 1024,
    });
  });

  it("reports ordinary processor failure once, isolates diagnostic trace failures and continues shared state", async () => {
    const ctx = context();
    const services = ports();
    ctx.traceProcessor = () => {
      throw new Error("diagnostic only");
    };
    await executeContextPipeline(
      ctx,
      [
        stage("broken", async () => {
          throw new Error("broken");
        }),
        stage("next", async (c) => {
          c.sharedData.set("next", true);
        }),
      ],
      services
    );
    expect(services.reportProcessorError).toHaveBeenCalledOnce();
    expect(ctx.sharedData.get("next")).toBe(true);
  });

  it("fails fast on preset configuration errors while closing the processor trace", async () => {
    const ctx = context();
    const services = ports();
    const trace = vi.fn();
    const later = vi.fn();
    ctx.traceProcessor = () => trace;
    const error = new PresetConfigurationError("invalid preset");
    await expect(
      executeContextPipeline(
        ctx,
        [
          stage("preset", async () => {
            throw error;
          }),
          stage("later", later),
        ],
        services
      )
    ).rejects.toBe(error);
    expect(trace).toHaveBeenCalledOnce();
    expect(services.reportProcessorError).toHaveBeenCalledWith(
      error,
      expect.objectContaining({ id: "preset" })
    );
    expect(later).not.toHaveBeenCalled();
  });

  it.each(["resolve", "reject"] as const)(
    "honors pre-abort and cancellation across an awaited processor (%s)",
    async (settlement) => {
      const controller = new AbortController();
      const ctx = Object.assign(context(), { signal: controller.signal });
      const services = ports();
      const later = vi.fn();
      let entered!: () => void;
      const started = new Promise<void>((resolve) => {
        entered = resolve;
      });
      let finish!: () => void;
      const blocked = new Promise<void>((resolve, reject) => {
        finish = () =>
          settlement === "resolve"
            ? resolve()
            : reject(controller.signal.reason);
      });
      const running = executeContextPipeline(
        ctx,
        [
          stage("wait", async () => {
            entered();
            await blocked;
          }),
          stage("later", later),
        ],
        services
      );
      await started;
      controller.abort();
      finish();
      await expect(running).rejects.toMatchObject({ name: "AbortError" });
      await expect(
        executeContextPipeline(ctx, [stage("later", later)], services)
      ).rejects.toMatchObject({ name: "AbortError" });
      expect(later).not.toHaveBeenCalled();
      expect(services.reportProcessorError).not.toHaveBeenCalled();
    }
  );
});
