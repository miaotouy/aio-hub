// Copyright 2025-2026 miaotouy(Github@miaotouy)
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LlmRequestOptions } from "@/llm-apis/common";
import type {
  ChatAgent,
  ChatMessageNode,
  ChatSessionDetail,
} from "../../../types";

const mocks = vi.hoisted(() => ({
  settings: {
    value: {
      uiPreferences: { isStreaming: true, splitVcpResponses: false },
      requestSettings: { maxRetries: 0 },
    },
  },
  sendRequest: vi.fn(),
  handleStreamUpdate: vi.fn(),
  finalizeNode: vi.fn(),
  completeStreamSegment: vi.fn(),
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
  useLlmChatStore: () => ({ sessionIndexMap: new Map() }),
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
vi.mock("@/utils/logger", () => ({
  createModuleLogger: () => ({ info: vi.fn(), warn: vi.fn() }),
}));
vi.mock("../../../config/parameter-config", () => ({
  buildEffectiveParameters: () => ({}),
}));
vi.mock("../useChatResponseHandler", () => ({
  useChatResponseHandler: () => ({
    handleStreamUpdate: mocks.handleStreamUpdate,
    finalizeNode: mocks.finalizeNode,
    completeStreamSegment: mocks.completeStreamSegment,
    validateAndFixUsage: vi.fn(),
  }),
}));
vi.mock("../../session/useNodeManager", () => ({
  useNodeManager: () => ({
    createNode: (data: Partial<ChatMessageNode>) => ({
      ...data,
      id: `node-${data.parentId}`,
    }),
    addNodeToSession: (session: ChatSessionDetail, node: ChatMessageNode) => {
      session.nodes[node.id] = node;
    },
    updateActiveLeaf: vi.fn(),
  }),
}));

import { useSingleNodeExecutor } from "../useSingleNodeExecutor";

const chunks = [
  { responseId: "first", content: "查询中" },
  { responseId: "first", finishReason: "stop" },
  { responseId: "chatcmpl-vcp-1", content: "工具结果" },
  { responseId: "second", content: "最终回答" },
];
const response = { content: "查询中工具结果最终回答" };

async function execute(isVcpChannel = true) {
  const assistantNode = {
    id: "assistant",
    role: "assistant",
    content: "",
  } as ChatMessageNode;
  const session: ChatSessionDetail = {
    id: "session",
    nodes: { assistant: assistantNode },
    updatedAt: new Date().toISOString(),
    rootNodeId: assistantNode.id,
    activeLeafId: assistantNode.id,
    history: [],
    historyIndex: -1,
  };
  await useSingleNodeExecutor().execute({
    session,
    assistantNode,
    currentPathToUserNode: [],
    splitVcpResponses: isVcpChannel,
    agentConfig: { profileId: "profile", modelId: "model", parameters: {} },
    executionAgent: { id: "agent" } as ChatAgent,
    effectiveUserProfile: null,
    abortController: new AbortController(),
  });
  return session;
}

// Protects the user opt-in: the same upstream reply stays in one node when off,
// and splits only for a streaming VCP channel when on.
describe("VCP message splitting preference", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.settings.value.uiPreferences = {
      isStreaming: true,
      splitVcpResponses: false,
    };
    mocks.sendRequest.mockImplementation(async (options: LlmRequestOptions) => {
      for (const chunk of chunks) {
        options.onResponseChunk?.(chunk);
        if (chunk.content) options.onStream?.(chunk.content);
      }
      return response;
    });
  });

  it.each([
    { enabled: false, streaming: true, vcp: true },
    { enabled: true, streaming: false, vcp: true },
    { enabled: true, streaming: true, vcp: false },
  ])(
    "keeps a single reply for enabled=$enabled streaming=$streaming vcp=$vcp",
    async ({ enabled, streaming, vcp }) => {
      mocks.settings.value.uiPreferences = {
        isStreaming: streaming,
        splitVcpResponses: enabled,
      };
      const session = await execute(vcp);
      const options = mocks.sendRequest.mock.calls[0][0];
      expect(options.onResponseChunk).toBeUndefined();
      expect(options.streamOptions).toBeUndefined();
      expect(Object.keys(session.nodes)).toEqual(["assistant"]);
      expect(mocks.finalizeNode).toHaveBeenCalledWith(
        session,
        "assistant",
        response,
        "agent"
      );
      if (streaming) {
        expect(
          mocks.handleStreamUpdate.mock.calls.map((call) => call.slice(1))
        ).toEqual([
          ["assistant", "查询中", false],
          ["assistant", "工具结果", false],
          ["assistant", "最终回答", false],
        ]);
      }
    }
  );

  it("applies the changed preference to the next request and splits VCP phases", async () => {
    await execute();
    mocks.settings.value.uiPreferences.splitVcpResponses = true;
    const session = await execute();
    expect(mocks.sendRequest.mock.calls[1][0].streamOptions).toEqual({
      includeUsage: true,
    });
    expect(Object.values(session.nodes).map((node) => node.role)).toEqual([
      "assistant",
      "tool",
      "assistant",
    ]);
    expect(
      mocks.finalizeNode.mock.calls
        .slice(1)
        .map((call) => [session.nodes[call[1]].role, call[2].content])
    ).toEqual([
      ["assistant", "查询中"],
      ["assistant", "最终回答"],
    ]);
    expect(
      mocks.handleStreamUpdate.mock.calls
        .slice(3)
        .map((call) => [session.nodes[call[1]].role, call[2], call[3]])
    ).toEqual([
      ["assistant", "查询中", false],
      ["tool", "工具结果", false],
      ["assistant", "最终回答", false],
    ]);
  });
});
