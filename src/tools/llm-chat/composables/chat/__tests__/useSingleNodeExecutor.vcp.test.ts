// Copyright 2025-2026 miaotouy(Github@miaotouy)
import { beforeEach, describe, expect, it, vi } from "vitest";
import { shallowRef } from "vue";
import { useNodeManager } from "../../session/useNodeManager";
import { createSessionRuntimeManager } from "../../../stores/session/sessionRuntimeManager";
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
  createModuleLogger: () => ({ info: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
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

import { useSingleNodeExecutor } from "../useSingleNodeExecutor";

const chunks = [
  { responseId: "first", content: "查询中" },
  { responseId: "first", finishReason: "stop" },
  { responseId: "chatcmpl-vcp-1", content: "工具结果" },
  { responseId: "second", content: "最终回答" },
];
const response = { content: "查询中工具结果最终回答" };

function createSession(): ChatSessionDetail {
  const assistantNode = {
    ...useNodeManager().createNode({
      role: "assistant",
      content: "",
      parentId: null,
    }),
    id: "assistant",
  };
  return {
    id: "session",
    nodes: { assistant: assistantNode },
    updatedAt: new Date().toISOString(),
    rootNodeId: assistantNode.id,
    activeLeafId: assistantNode.id,
    history: [],
    historyIndex: -1,
  };
}

async function execute(
  isVcpChannel = true,
  session = createSession(),
  onResponseNode?: (node: ChatMessageNode) => void
) {
  const assistantNode = session.nodes.assistant;
  await useSingleNodeExecutor().execute({
    session,
    assistantNode,
    currentPathToUserNode: [],
    splitVcpResponses: isVcpChannel,
    onResponseNode,
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

  // Each model round owns its latency and usage; tool execution time and the
  // first round's request start must not leak into the following round.
  it.each([true, false])(
    "records each round's timing with boundary=%s",
    async (withBoundary) => {
      mocks.settings.value.uiPreferences.splitVcpResponses = true;
      const session = createSession();
      session.nodes.assistant.metadata = { requestStartTime: 1000 };
      let now = 1000;
      const clock = vi.spyOn(Date, "now").mockImplementation(() => now);
      const firstUsage = {
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
      };
      const secondUsage = {
        promptTokens: 30,
        completionTokens: 8,
        totalTokens: 38,
      };
      mocks.sendRequest.mockImplementation(
        async (options: LlmRequestOptions) => {
          const emit = (
            time: number,
            chunk: Parameters<
              NonNullable<LlmRequestOptions["onResponseChunk"]>
            >[0]
          ) => {
            now = time;
            options.onResponseChunk?.(chunk);
          };
          emit(1100, { responseId: "first", content: "查询中" });
          emit(1500, {
            responseId: "first",
            finishReason: "stop",
            usage: firstUsage,
          });
          emit(2000, { responseId: "chatcmpl-vcp-1", content: "工具结果" });
          if (withBoundary) emit(2400, { responseId: "chatcmpl-vcp-end-1" });
          emit(3000, { responseId: "second", reasoningContent: "思考" });
          emit(3200, { responseId: "second", content: "最终回答" });
          emit(4000, {
            responseId: "second",
            finishReason: "stop",
            usage: secondUsage,
          });
          return response;
        }
      );
      try {
        await execute(true, session);
        const assistants = Object.values(session.nodes).filter(
          (node) => node.role === "assistant"
        );
        expect(assistants.map((node) => node.metadata)).toEqual([
          expect.objectContaining({
            requestStartTime: 1000,
            firstTokenTime: 1100,
            requestEndTime: 1500,
            usage: firstUsage,
          }),
          expect.objectContaining({
            requestStartTime: withBoundary ? 2400 : 2000,
            firstTokenTime: 3000,
            requestEndTime: 4000,
            usage: secondUsage,
          }),
        ]);
      } finally {
        clock.mockRestore();
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
      useNodeManager()
        .getNodePath(session, session.activeLeafId)
        .map((node) => node.role)
    ).toEqual(["assistant", "tool", "assistant"]);
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

// Queue paths must remain blocked by the same HTTP request across every VCP
// phase, including messages added while an intermediate tool segment streams.
describe("VCP response splitting with queued messages", () => {
  it.each(["combined", "chained"] as const)(
    "keeps the %s queue after all response phases and preserves branch selection",
    async (mode) => {
      mocks.settings.value.uiPreferences.splitVcpResponses = true;
      const manager = useNodeManager();
      const session = createSession();
      const generatingNodes = new Set(["assistant"]);
      const runtime = createSessionRuntimeManager({
        sessionDetailMap: shallowRef(new Map([[session.id, session]])),
        currentSessionId: shallowRef(session.id),
        abortControllers: shallowRef(new Map()),
        generatingNodes: shallowRef(generatingNodes),
        queuedSessionIds: shallowRef(new Set([session.id])),
        queuedSessionAgentIds: shallowRef(new Map()),
        findSessionIdByNodeId: () => session.id,
      });
      const queuedNodes: ChatMessageNode[] = [];
      const userNodes: ChatMessageNode[] = [];
      const enqueue = () => {
        const pair = manager.createMessagePair(
          session,
          "继续",
          session.activeLeafId
        );
        userNodes.push(pair.userNode);
        const queued = mode === "combined" ? pair.userNode : pair.assistantNode;
        if (mode === "combined")
          manager.hardDeleteNode(session, pair.assistantNode.id);
        queued.status = "queued";
        queued.metadata = { isQueued: true, agentId: "queued-agent" };
        manager.updateActiveLeaf(session, queued.id);
        queuedNodes.push(queued);
      };
      const unrelated = manager.createNode({
        role: "assistant",
        content: "另一分支",
        parentId: "assistant",
      });
      manager.addNodeToSession(session, unrelated);
      let activeResponseId = "assistant";
      const phases = [
        ...chunks,
        { responseId: "second", finishReason: "stop" },
        { responseId: "chatcmpl-vcp-2", content: "第二次工具结果" },
        { responseId: "third", content: "完成" },
      ];
      mocks.sendRequest.mockImplementation(
        async (options: LlmRequestOptions) => {
          for (const [index, chunk] of phases.entries()) {
            options.onResponseChunk?.(chunk);
            if (index === 0 || index === 2) enqueue();
            for (const queued of queuedNodes) {
              expect(runtime.isNodePathGenerating(session.id, queued.id)).toBe(
                true
              );
            }
            expect(session.activeLeafId).toBe(
              queuedNodes[queuedNodes.length - 1].id
            );
            expect(unrelated.parentId).toBe("assistant");
          }
          return response;
        }
      );

      await execute(true, session, (node) => {
        generatingNodes.delete(activeResponseId);
        activeResponseId = node.id;
        generatingNodes.add(node.id);
      });

      const responsePath = manager
        .getNodePath(session, userNodes[0].id)
        .slice(0, -1);
      expect(responsePath.map((node) => node.role)).toEqual([
        "assistant",
        "tool",
        "assistant",
        "tool",
        "assistant",
      ]);
      for (let index = 2; index < responsePath.length; index++) {
        expect(responsePath[index - 1].childrenIds).toEqual([
          responsePath[index].id,
        ]);
        expect(responsePath[index - 1].lastSelectedChildId).toBe(
          responsePath[index].id
        );
      }
      expect(session.nodes.assistant.childrenIds).toEqual([
        unrelated.id,
        responsePath[1].id,
      ]);
      expect(session.nodes.assistant.lastSelectedChildId).toBe(
        responsePath[1].id
      );
      expect(userNodes[1].parentId).toBe(queuedNodes[0].id);
      for (const queued of queuedNodes) {
        expect(queued.status).toBe("queued");
        expect(queued.metadata).toEqual({
          isQueued: true,
          agentId: "queued-agent",
        });
      }
      generatingNodes.clear();
      expect(runtime.isNodePathGenerating(session.id, queuedNodes[0].id)).toBe(
        false
      );
    }
  );

  it("leaves a user-selected branch active while a background response splits", async () => {
    mocks.settings.value.uiPreferences.splitVcpResponses = true;
    const manager = useNodeManager();
    const session = createSession();
    const unrelated = manager.createNode({
      role: "user",
      content: "另一分支",
      parentId: "assistant",
    });
    manager.addNodeToSession(session, unrelated);
    manager.updateActiveLeaf(session, unrelated.id);
    mocks.sendRequest.mockImplementation(async (options: LlmRequestOptions) => {
      for (const chunk of chunks) {
        options.onResponseChunk?.(chunk);
        expect(session.activeLeafId).toBe(unrelated.id);
        expect(session.nodes.assistant.lastSelectedChildId).toBe(unrelated.id);
      }
      return response;
    });
    await execute(true, session);
    expect(unrelated.parentId).toBe("assistant");
  });
});
