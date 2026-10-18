// Copyright 2025-2026 miaotouy(Github@miaotouy)
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LlmRequestOptions } from "@/llm-apis/common";
import type { ChatAgent, ChatSessionDetail } from "../../../types";

const mocks = vi.hoisted(() => ({
  sendRequest: vi.fn(),
  parseToolRequests: vi.fn(),
  processCycle: vi.fn(),
  settings: {
    value: {
      uiPreferences: { isStreaming: true, splitVcpResponses: false },
      requestSettings: { maxRetries: 0, enableIncrementalSave: false },
    },
  },
}));

vi.mock("../../settings/useChatSettings", () => ({
  useChatSettings: () => ({ settings: mocks.settings }),
}));
vi.mock("../../ui/useLlmChatUiState", () => ({
  useLlmChatUiState: () => ({ currentAgentId: { value: "agent" } }),
}));
vi.mock("@/composables/useLlmRequest", () => ({
  useLlmRequest: () => ({ sendRequest: mocks.sendRequest }),
}));
vi.mock("@/composables/useLlmProfiles", () => ({
  useLlmProfiles: () => ({ getProfileById: () => undefined }),
}));
vi.mock("../../../stores/llmChatStore", () => ({
  useLlmChatStore: () => ({
    sessionIndexMap: new Map(),
    generateSessionTopic: vi.fn(),
  }),
}));
vi.mock("../../../stores/contextPipelineStore", () => ({
  useContextPipelineStore: () => ({ executePipeline: vi.fn() }),
}));
vi.mock("../../features/useContextCompressor", () => ({
  useContextCompressor: () => ({ checkAndCompress: vi.fn() }),
}));
vi.mock("../../features/useTranscriptionManager", () => ({
  useTranscriptionManager: () => ({}),
}));
vi.mock("../../ui/useAnchorRegistry", () => ({
  useAnchorRegistry: () => ({ getAvailableAnchors: () => [] }),
}));
vi.mock("@/tools/st-worldbook-manager/stores/worldbookStore", () => ({
  useWorldbookStore: () => ({}),
}));
vi.mock("@/tools/tool-calling/core/parser", () => ({
  parseToolRequests: mocks.parseToolRequests,
}));
vi.mock("@/tools/tool-calling/composables/useToolCalling", () => ({
  useToolCalling: () => ({
    resolveProtocol: () => ({}),
    processCycle: mocks.processCycle,
    formatCycleResults: () => "tool result",
  }),
}));
vi.mock("../../../stores/toolCallingStore", () => ({
  useToolCallingStore: () => ({ requestApproval: vi.fn() }),
}));
vi.mock("../../../config/parameter-config", () => ({
  buildEffectiveParameters: () => ({}),
}));
vi.mock("@/tools/token-calculator/token-calculator.registry", () => ({
  tokenCalculatorService: {},
}));
vi.mock("@/composables/useAttachmentProcessor", () => ({
  processInlineData: async (text: string) => ({
    processedText: text,
    newAssets: [],
  }),
}));
vi.mock("../../session/useSessionManager", () => ({
  useSessionManager: () => ({ persistSession: vi.fn() }),
}));
vi.mock("@/composables/useWindowSyncBus", () => ({
  useWindowSyncBus: () => ({ syncState: vi.fn() }),
}));
vi.mock("@/utils/logger", () => ({
  createModuleLogger: () => ({ info: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));
vi.mock("@/utils/errorHandler", () => ({
  ErrorLevel: { ERROR: "error" },
  createModuleErrorHandler: () => ({ handle: vi.fn() }),
}));

import { useSingleNodeExecutor } from "../useSingleNodeExecutor";
import { useToolCallOrchestrator } from "../useToolCallOrchestrator";
import { useChatResponseHandler } from "../useChatResponseHandler";
import { disposeStreamingMessageSource } from "../useStreamingMessageSources";
import { useNodeManager } from "../../session/useNodeManager";

// Interrupted replies must retain the text already shown by the stream and
// stop reasoning timing, even before the throttled node writes have run.
describe("interrupted streaming replies", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-19T00:00:00Z"));
    vi.clearAllMocks();
  });

  afterEach(() => {
    disposeStreamingMessageSource("assistant");
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it.each([
    { reason: "cancelled", body: "partial reply" },
    { reason: "disconnected", body: "partial reply" },
    { reason: "cancelled", body: "" },
  ])(
    "preserves buffered output when $reason (body=$body)",
    async ({ reason, body }) => {
      const node = {
        ...useNodeManager().createNode({
          role: "assistant",
          content: "",
          parentId: null,
          status: "waiting",
        }),
        id: "assistant",
      };
      const session: ChatSessionDetail = {
        id: "session",
        nodes: { assistant: node },
        rootNodeId: node.id,
        activeLeafId: node.id,
        updatedAt: new Date().toISOString(),
        history: [],
        historyIndex: -1,
      };
      const error =
        reason === "cancelled"
          ? new DOMException("Request canceled", "AbortError")
          : new Error("Connection reset");
      mocks.sendRequest.mockImplementation(
        async (options: LlmRequestOptions) => {
          if (body) options.onStream?.(body);
          options.onReasoningStream?.("partial reasoning");
          vi.setSystemTime(Date.now() + 1200);
          throw error;
        }
      );

      await expect(
        useSingleNodeExecutor().execute({
          session,
          assistantNode: node,
          currentPathToUserNode: [],
          agentConfig: {
            profileId: "profile",
            modelId: "model",
            parameters: {},
          },
          executionAgent: { id: "agent" } as ChatAgent,
          effectiveUserProfile: null,
          abortController: new AbortController(),
        })
      ).rejects.toBe(error);

      // The orchestrator records errors through a separate handler instance.
      useChatResponseHandler().handleNodeError(
        session,
        node.id,
        error,
        "请求执行"
      );
      expect(node.status).toBe("error");
      expect(node.content).toBe(body);
      expect(node.metadata).toMatchObject({
        reasoningContent: "partial reasoning",
        reasoningActive: false,
        reasoningDurationMs: 1200,
        requestEndTime: Date.now(),
      });

      await vi.advanceTimersByTimeAsync(2500);
      expect(node.content).toBe(body);
      expect(node.metadata?.reasoningContent).toBe("partial reasoning");
      expect(node.metadata?.reasoningDurationMs).toBe(1200);
    }
  );
});
// A tool result starts a fresh assistant response. Its visible reasoning and
// elapsed reasoning time must describe that response alone.
describe("reasoning across tool-call iterations", () => {
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("keeps each response's reasoning text and duration independent", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-19T00:00:00Z"));
    vi.clearAllMocks();
    const first = useNodeManager().createNode({
      role: "assistant",
      content: "",
      parentId: null,
      status: "waiting",
      metadata: { agentId: "agent", profileId: "profile", modelId: "model" },
    });
    const session: ChatSessionDetail = {
      id: "session",
      nodes: { [first.id]: first },
      rootNodeId: first.id,
      activeLeafId: first.id,
      updatedAt: new Date().toISOString(),
      history: [],
      historyIndex: -1,
    };
    const toolRequest = { requestId: "request", toolName: "lookup", args: {} };
    mocks.parseToolRequests.mockImplementation((text: string) =>
      text === "tool request" ? [toolRequest] : []
    );
    mocks.processCycle
      .mockResolvedValueOnce({
        hasToolRequests: true,
        parsedRequests: [toolRequest],
        executionResults: [
          { ...toolRequest, status: "success", durationMs: 1 },
        ],
      })
      .mockResolvedValueOnce({ hasToolRequests: false });
    let iteration = 0;
    let liveReasoning: string | undefined;
    mocks.sendRequest.mockImplementation(async (options: LlmRequestOptions) => {
      iteration++;
      const reasoning = `reasoning ${iteration}`;
      options.onReasoningStream?.(reasoning);
      await vi.advanceTimersByTimeAsync(iteration === 1 ? 1000 : 500);
      if (iteration === 2) {
        liveReasoning =
          session.nodes[session.activeLeafId].metadata?.reasoningContent;
      }
      const content = iteration === 1 ? "tool request" : "answer";
      options.onStream?.(content);
      return {
        content,
        reasoningContent: reasoning,
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      };
    });

    try {
      await useToolCallOrchestrator().orchestrate({
        session,
        assistantNode: first,
        pathToUserNode: [],
        agentConfig: { profileId: "profile", modelId: "model", parameters: {} },
        executionAgent: {
          id: "agent",
          toolCallConfig: { enabled: true, protocol: "vcp", maxIterations: 3 },
        } as ChatAgent,
        effectiveUserProfile: null,
        abortControllers: new Map(),
        generatingNodes: new Set(),
        consumeTextCallsLocally: true,
      });

      const last = session.nodes[session.activeLeafId];
      expect(last.content).toBe("answer");
      expect(liveReasoning).toBe("reasoning 2");
      expect(last.metadata?.reasoningDurationMs).toBe(500);
      expect(first.metadata?.reasoningContent).toBe("reasoning 1");
      expect(first.metadata?.reasoningDurationMs).toBe(1000);
    } finally {
      for (const id of Object.keys(session.nodes))
        disposeStreamingMessageSource(id);
    }
  });
});
