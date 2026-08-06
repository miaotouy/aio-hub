import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";

const mocks = vi.hoisted(() => ({
  addNodeToSession: vi.fn(),
  calculateTokens: vi.fn(),
  getAgentById: vi.fn(),
  getNodePath: vi.fn(),
  persistSessions: vi.fn(),
  refreshContextStats: vi.fn(),
  sendRequest: vi.fn(),
}));

vi.mock("@/tools/llm-chat/composables/ui/useLlmChatUiState", () => ({
  useLlmChatUiState: () => ({ currentAgentId: ref("agent-1") }),
}));

vi.mock("../../session/useNodeManager", () => ({
  useNodeManager: () => ({
    getNodePath: mocks.getNodePath,
    createNode: (node: Record<string, unknown>) => ({
      ...node,
      id: "new-summary",
      childrenIds: [],
      metadata: node.metadata ?? {},
    }),
    addNodeToSession: mocks.addNodeToSession,
  }),
}));

vi.mock("@/composables/useLlmRequest", () => ({
  useLlmRequest: () => ({ sendRequest: mocks.sendRequest }),
}));

vi.mock("../../settings/useChatSettings", () => ({
  useChatSettings: () => ({
    settings: ref({ modelPreferences: { defaultModel: "profile-1:model-1" } }),
  }),
}));

vi.mock("@/tools/agent-manager/stores/agentStore", () => ({
  useAgentStore: () => ({ getAgentById: mocks.getAgentById }),
}));

vi.mock("@/tools/llm-chat/stores/llmChatStore", () => ({
  useLlmChatStore: () => ({
    contextStats: undefined,
    persistSessions: mocks.persistSessions,
    refreshContextStats: mocks.refreshContextStats,
  }),
}));

vi.mock("@/composables/useLlmProfiles", () => ({
  useLlmProfiles: () => ({ enabledProfiles: ref([]) }),
}));

vi.mock("@/utils/logger", () => ({
  createModuleLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock("@/utils/errorHandler", () => ({
  createModuleErrorHandler: () => ({ handle: vi.fn() }),
}));

vi.mock("@/tools/token-calculator/token-calculator.registry", () => ({
  tokenCalculatorService: { calculateTokens: mocks.calculateTokens },
}));

import { useContextCompressor } from "../useContextCompressor";

describe("useContextCompressor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sendRequest.mockResolvedValue({ content: "updated summary" });
    mocks.calculateTokens.mockResolvedValue({ count: 10 });
    mocks.getAgentById.mockReturnValue({
      profileId: "profile-1",
      modelId: "model-1",
      parameters: {
        contextCompression: {
          enabled: true,
          protectRecentCount: 1,
          compressCount: 2,
          continueSummaryPrompt:
            "CONTINUE\nPREVIOUS={previous_summary}\nCONTEXT={context}",
        },
      },
    });
  });

  it("uses the continuation prompt and replaces the prior summary on consecutive compression", async () => {
    const node = (id: string, content: string, parentId?: string): any => ({
      id,
      content,
      parentId,
      childrenIds: [],
      role: "user",
      status: "complete",
      metadata: { tokenCount: 10 },
    });
    const first: any = node("first", "first message");
    const second: any = node("second", "second message", first.id);
    const previousSummary: any = {
      ...node("previous-summary", "old summary", second.id),
      role: "system",
      metadata: {
        isCompressionNode: true,
        compressedNodeIds: [first.id, second.id],
        originalMessageCount: 2,
        originalTokenCount: 20,
        tokenCount: 8,
      },
    };
    const third: any = node("third", "new message 1", previousSummary.id);
    const fourth: any = node("fourth", "new message 2", third.id);
    const protectedNode: any = node("protected", "recent message", fourth.id);

    first.childrenIds = [second.id];
    second.childrenIds = [previousSummary.id];
    previousSummary.childrenIds = [third.id];
    third.childrenIds = [fourth.id];
    fourth.childrenIds = [protectedNode.id];

    const path = [first, second, previousSummary, third, fourth, protectedNode];
    const detail = {
      activeLeafId: protectedNode.id,
      nodes: Object.fromEntries(path.map((item) => [item.id, item])),
    };

    mocks.getNodePath.mockReturnValue(path);
    mocks.addNodeToSession.mockImplementation((session, summaryNode) => {
      session.nodes[summaryNode.id] = summaryNode;
      session.nodes[summaryNode.parentId].childrenIds.push(summaryNode.id);
    });

    const { manualCompress } = useContextCompressor();
    const result = await manualCompress({} as any, detail as any);

    expect(result.success).toBe(true);
    expect(mocks.sendRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          expect.objectContaining({
            content: expect.stringContaining("PREVIOUS=old summary"),
          }),
        ],
      })
    );
    expect(mocks.sendRequest.mock.calls[0][0].messages[0].content).toContain(
      "new message 1"
    );
    expect(detail.nodes["new-summary"].metadata.compressedNodeIds).toEqual([
      "previous-summary",
      "third",
      "fourth",
    ]);
    expect(detail.nodes["new-summary"].metadata.originalMessageCount).toBe(4);
  });
});
