// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  executeSingleNode,
  type SingleNodeExecutionPorts,
} from "../src/tools/llm-chat/core/execution/singleNodeExecutor";
import type {
  SingleNodeExecuteParams,
  CreateNodeConfig,
} from "../src/tools/llm-chat/core/execution/types";
import type {
  ChatMessageNode,
  ChatSessionDetail,
  ChatSessionIndex,
} from "../src/tools/llm-chat/types";
import type { ChatSettings } from "../src/tools/llm-chat/types/settings";
import type { LlmRequestOptions, LlmResponse } from "../src/llm-apis/common";
import type { Asset } from "../src/types/asset-management";
import type { PipelineContext } from "../src/tools/llm-chat/types/pipeline";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function node(
  id: string,
  config: Partial<CreateNodeConfig> = {}
): ChatMessageNode {
  return {
    id,
    role: "assistant",
    content: "",
    parentId: null,
    childrenIds: [],
    isEnabled: true,
    timestamp: new Date().toISOString(),
    status: "waiting",
    ...config,
  } as ChatMessageNode;
}
function fixture() {
  const assistant = node("assistant");
  const session = {
    id: "session",
    nodes: { assistant },
    activeLeafId: "assistant",
  } as unknown as ChatSessionDetail;
  const settings = {
    continuation: { mode: "auto", deduplicate: true },
    uiPreferences: { isStreaming: true, splitVcpResponses: true },
    requestSettings: {
      maxRetries: 2,
      retryInterval: 30000,
      retryMode: "fixed",
      timeout: 60000,
    },
    transcription: {
      enabled: true,
      strategy: "smart",
      forceTranscriptionAfter: 1,
    },
    worldbookIds: [],
  } as unknown as ChatSettings;
  const params: SingleNodeExecuteParams = {
    session,
    assistantNode: assistant,
    currentPathToUserNode: [],
    splitVcpResponses: false,
    agentConfig: {
      profileId: "logical-profile",
      modelId: "model",
      parameters: {},
    },
    executionAgent: {
      id: "execution-agent",
    } as SingleNodeExecuteParams["executionAgent"],
    effectiveUserProfile: null,
    abortController: new AbortController(),
  };
  let sequence = 0;
  const capture = vi.fn(() => ({
    observer: {},
    complete: vi.fn(),
    error: vi.fn(),
  }));
  const supplement = vi.fn();
  const ports = {
    getSettings: () => settings,
    getSessionIndex: vi.fn(() => ({ id: "session" }) as ChatSessionIndex),
    getProfileById: vi.fn(() => undefined),
    buildEffectiveParameters: vi.fn(() => ({ temperature: 0.2 })),
    getAvailableAnchors: vi.fn(() => ["anchor"]),
    loadWorldbooks: vi.fn(async () => ["worldbook"]),
    ensureTranscriptions: vi.fn(
      async (assets: Asset[]) =>
        new Map(assets.map((asset) => [asset.id, asset]))
    ),
    executePipeline: vi.fn(async (context: PipelineContext) => {
      context.messages = [
        { role: "user", content: "question", sourceId: "user" },
      ];
    }),
    sendRequest: vi.fn(
      async (_options: LlmRequestOptions) =>
        ({ content: "answer" }) as LlmResponse
    ),
    handleStreamUpdate: vi.fn(
      (
        target: ChatSessionDetail,
        id: string,
        text: string,
        reasoning: boolean
      ) => {
        const current = target.nodes[id];
        if (reasoning) {
          current.metadata ??= {};
          current.metadata.reasoningContent =
            (current.metadata.reasoningContent ?? "") + text;
        } else current.content += text;
      }
    ),
    completeStreamSegment: vi.fn(),
    validateAndFixUsage: vi.fn(async () => {}),
    finalizeNode: vi.fn(async () => {}),
    checkAndCompress: vi.fn(async () => {}),
    isAbortError: (error: unknown, signal?: AbortSignal) =>
      signal?.aborted ||
      (error instanceof Error && error.name === "AbortError") ||
      false,
    nodes: {
      createNode: vi.fn((config: CreateNodeConfig) =>
        node(`node-${++sequence}`, config)
      ),
      addNodeToSession: vi.fn(
        (target: ChatSessionDetail, child: ChatMessageNode) => {
          target.nodes[child.id] = child;
          if (child.parentId)
            target.nodes[child.parentId].childrenIds.push(child.id);
        }
      ),
      reparentSubtree: vi.fn(),
      getNodePath: vi.fn(() => []),
      updateActiveLeaf: vi.fn((target: ChatSessionDetail, id: string) => {
        target.activeLeafId = id;
      }),
    },
    snapshots: {
      loadSettings: vi.fn(async () => ({
        enabled: false,
        saveTextPreview: false,
      })),
      prepare: vi.fn(async () => 7),
      reportError: vi.fn(),
      createRecorder: vi.fn<
        SingleNodeExecutionPorts["snapshots"]["createRecorder"]
      >(() => ({ capture, supplement })),
    },
    logger: { info: vi.fn(), warn: vi.fn() },
  } satisfies SingleNodeExecutionPorts;
  return {
    params,
    ports,
    settings,
    session,
    assistant,
    capture,
    supplement,
    run: () => executeSingleNode(params, ports),
  };
}

afterEach(() => vi.useRealTimers());

// These contracts apply to both Renderer and Node owners. No Vue, window or
// store mocks are loaded: imports execute the production shared request path.
describe("single-node execution in Node", () => {
  it("passes the run's context, forced-depth assets and logical binding to the existing sender", async () => {
    const f = fixture();
    f.settings.worldbookIds = ["global", "shared"];
    f.params.executionAgent.worldbookIds = ["agent", "shared"];
    f.params.effectiveUserProfile = {
      worldbookIds: ["user"],
    } as SingleNodeExecuteParams["effectiveUserProfile"];
    const image = { id: "image", type: "image" } as Asset;
    const recent = { id: "audio", type: "audio" } as Asset;
    f.params.currentPathToUserNode = [
      node("old", { attachments: [image] }),
      node("new", { attachments: [recent] }),
    ];
    const result = await f.run();
    expect(f.ports.loadWorldbooks).toHaveBeenCalledWith([
      "global",
      "shared",
      "user",
      "agent",
    ]);
    expect(f.ports.ensureTranscriptions).toHaveBeenCalledWith(
      [image, recent],
      "model",
      "logical-profile",
      new Set(["image"])
    );
    const context = f.ports.executePipeline.mock.calls[0][0];
    expect(context.agentConfig).toBe(f.params.executionAgent);
    expect(context.sharedData.get("loadedWorldbooks")).toEqual(["worldbook"]);
    expect(context.sharedData.get("updatedAssetsMap").get("audio")).toBe(
      recent
    );
    expect(f.ports.sendRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        profileId: "logical-profile",
        modelId: "model",
        messages: result.messagesForRequest,
        temperature: 0.2,
        signal: f.params.abortController.signal,
      })
    );
    expect(f.ports.finalizeNode).toHaveBeenCalledWith(
      f.session,
      "assistant",
      result.response,
      "execution-agent"
    );
  });

  it("preserves continuation source attribution and hands capture to the existing snapshot recorder", async () => {
    const f = fixture();
    f.params.isContinuation = true;
    f.params.currentPathToUserNode = [node("user", { role: "user" })];
    f.ports.snapshots.loadSettings.mockResolvedValue({
      enabled: true,
      saveTextPreview: false,
    });
    f.ports.executePipeline.mockImplementation(async (context) => {
      context.messages = [
        {
          role: "assistant",
          content: "partial",
          sourceId: "assistant",
          reasoningContent: "thought",
        },
        { role: "system", content: "tail injection" },
      ];
    });
    const result = await f.run();
    expect(result.messagesForRequest.map((message) => message.prefix)).toEqual([
      true,
      undefined,
    ]);
    expect(result.messagesForRequest[0].reasoningContent).toBe("thought");
    expect(f.assistant.metadata?.continuationDeduplicate).toBe(true);
    const context = f.ports.snapshots.createRecorder.mock.calls[0][0];
    expect(context).toMatchObject({
      sessionId: "session",
      requestId: "assistant",
      triggerNodeId: "user",
      logicalProfileId: "logical-profile",
      logicalModelId: "model",
      epoch: 7,
    });
    expect(context.assistantNodeIds()).toEqual(["assistant"]);
    expect(await context.sources).toHaveLength(2);
    expect(f.ports.sendRequest.mock.calls[0][0].requestCapture).toBe(f.capture);
    expect(f.supplement).toHaveBeenCalledWith(result.response);
  });

  it("continues with original attachments when transcription fails", async () => {
    const f = fixture();
    const asset = { id: "image", type: "image" } as Asset;
    f.params.currentPathToUserNode = [node("user", { attachments: [asset] })];
    f.ports.ensureTranscriptions.mockRejectedValue(
      new Error("transcription unavailable")
    );
    await f.run();
    expect(
      f.ports.executePipeline.mock.calls[0][0].sharedData.get(
        "updatedAssetsMap"
      )
    ).toEqual(new Map([["image", asset]]));
    expect(f.ports.sendRequest).toHaveBeenCalledOnce();
  });

  it.each([
    "snapshot settings",
    "snapshot prepare",
    "worldbooks",
    "transcription",
    "pipeline",
  ])(
    "stops before dispatch when cancelled during %s preparation",
    async (phase) => {
      const f = fixture();
      const pending = deferred<any>();
      if (phase === "snapshot settings")
        f.ports.snapshots.loadSettings.mockReturnValue(pending.promise);
      if (phase === "snapshot prepare") {
        f.ports.snapshots.loadSettings.mockResolvedValue({
          enabled: true,
          saveTextPreview: false,
        });
        f.ports.snapshots.prepare.mockReturnValue(pending.promise);
      }
      if (phase === "worldbooks") {
        f.settings.worldbookIds = ["world"];
        f.ports.loadWorldbooks.mockReturnValue(pending.promise);
      }
      if (phase === "transcription") {
        f.params.currentPathToUserNode = [
          node("user", {
            attachments: [{ id: "image", type: "image" } as Asset],
          }),
        ];
        f.ports.ensureTranscriptions.mockReturnValue(pending.promise);
      }
      if (phase === "pipeline")
        f.ports.executePipeline.mockReturnValue(pending.promise);
      const run = f.run();
      const rejection = expect(run).rejects.toMatchObject({
        name: "AbortError",
      });
      await vi.waitFor(() => {
        const invoked =
          phase === "snapshot settings"
            ? f.ports.snapshots.loadSettings
            : phase === "snapshot prepare"
              ? f.ports.snapshots.prepare
              : phase === "worldbooks"
                ? f.ports.loadWorldbooks
                : phase === "transcription"
                  ? f.ports.ensureTranscriptions
                  : f.ports.executePipeline;
        expect(invoked).toHaveBeenCalledOnce();
      });
      f.params.abortController.abort();
      pending.resolve(undefined);
      await rejection;
      expect(f.ports.sendRequest).not.toHaveBeenCalled();
      expect(f.ports.finalizeNode).not.toHaveBeenCalled();
    }
  );

  it("releases a retry wait on Stop without sending another request", async () => {
    vi.useFakeTimers();
    const f = fixture();
    f.ports.sendRequest.mockRejectedValue(
      Object.assign(new Error("rate limited"), { status: 429 })
    );
    const run = f.run();
    const rejection = expect(run).rejects.toMatchObject({ name: "AbortError" });
    await vi.advanceTimersByTimeAsync(0);
    expect(f.ports.sendRequest).toHaveBeenCalledOnce();
    f.params.abortController.abort();
    await rejection;
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(60000);
    expect(f.ports.sendRequest).toHaveBeenCalledOnce();
  });

  it("ignores retired attempt callbacks during backoff, a new attempt, and after success", async () => {
    vi.useFakeTimers();
    const f = fixture();
    let first!: LlmRequestOptions;
    let second!: LlmRequestOptions;
    f.ports.sendRequest
      .mockImplementationOnce(async (options) => {
        first = options;
        throw Object.assign(new Error("retry"), { status: 503 });
      })
      .mockImplementationOnce(async (options) => {
        second = options;
        first.onStream?.("stale");
        first.onReasoningStream?.("stale thought");
        first.onPartialImage?.("stale image", 0);
        options.onStream?.("current");
        return { content: "current" } as LlmResponse;
      });
    const run = f.run();
    await vi.advanceTimersByTimeAsync(0);
    first.onStream?.("backoff");
    await vi.advanceTimersByTimeAsync(30000);
    await run;
    second.onStream?.("after completion");
    second.onPartialImage?.("after image", 0);
    expect(f.assistant.content).toBe("current");
    expect(f.ports.handleStreamUpdate).toHaveBeenCalledOnce();
    expect(f.ports.sendRequest).toHaveBeenCalledTimes(2);
  });

  it("flushes partial content and skips retry after a stream fails", async () => {
    const f = fixture();
    const failure = Object.assign(new Error("stream failed"), { status: 503 });
    f.ports.sendRequest.mockImplementation(async (options) => {
      options.onStream?.("partial");
      throw failure;
    });
    await expect(f.run()).rejects.toBe(failure);
    expect(f.assistant.content).toBe("partial");
    expect(f.ports.completeStreamSegment).toHaveBeenCalledWith(
      f.session,
      "assistant"
    );
    expect(f.ports.sendRequest).toHaveBeenCalledOnce();
  });

  it("drops late VCP, text, reasoning and image updates when an aborted provider resolves", async () => {
    const f = fixture();
    f.params.splitVcpResponses = true;
    f.ports.sendRequest.mockImplementation(async (options) => {
      options.onResponseChunk?.({ responseId: "first", content: "accepted" });
      f.params.abortController.abort();
      options.onResponseChunk?.({
        responseId: "chatcmpl-vcp-late",
        content: "late tool",
      });
      options.onStream?.("late text");
      options.onReasoningStream?.("late thought");
      options.onPartialImage?.("late image", 0);
      return { content: "late result" } as LlmResponse;
    });
    await expect(f.run()).rejects.toMatchObject({ name: "AbortError" });
    expect(f.assistant.content).toBe("accepted");
    expect(Object.keys(f.session.nodes)).toEqual(["assistant"]);
    expect(f.ports.handleStreamUpdate).toHaveBeenCalledOnce();
    expect(f.ports.finalizeNode).not.toHaveBeenCalled();
    expect(f.ports.checkAndCompress).not.toHaveBeenCalled();
    expect(f.ports.completeStreamSegment).toHaveBeenCalledWith(
      f.session,
      "assistant"
    );
  });

  it("drains the stream owner when Stop arrives during asynchronous usage finalization", async () => {
    const f = fixture();
    f.ports.sendRequest.mockImplementation(async (options) => {
      options.onStream?.("partial");
      return { content: "partial" } as LlmResponse;
    });
    f.ports.validateAndFixUsage.mockImplementation(async () => {
      f.params.abortController.abort();
    });
    await expect(f.run()).rejects.toMatchObject({ name: "AbortError" });
    expect(f.ports.completeStreamSegment).toHaveBeenCalledWith(
      f.session,
      "assistant"
    );
    expect(f.ports.finalizeNode).not.toHaveBeenCalled();
    expect(f.ports.checkAndCompress).not.toHaveBeenCalled();
  });
});
