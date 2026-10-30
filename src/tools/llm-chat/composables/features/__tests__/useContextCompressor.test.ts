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
import { switchCompressionCountUnit } from "../../../utils/contextCompressionCounting";

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

  it.each([undefined, "previous summary"])(
    "includes full text materials in summary requests with previous summary=%s",
    async (previousSummary) => {
      const material = "  {{literal}}\r\n```ts\nconst value = 42;\n```\n😀  ";
      const { generateSummary } = useContextCompressor();
      await generateSummary(
        [
          {
            id: "material-message",
            role: "user",
            content: "问题正文",
            virtualAttachments: [
              {
                id: "material",
                kind: "text",
                title: "代码材料",
                text: material,
              },
              {
                id: "extra",
                kind: "text",
                title: "补充",
                text: "补充材料全文",
              },
            ],
          },
        ] as any,
        {
          summaryModel: { profileId: "profile-1", modelId: "model-1" },
          summaryPrompt: "SUMMARY\n{context}",
          continueSummaryPrompt: "PREVIOUS={previous_summary}\n{context}",
        } as any,
        undefined,
        previousSummary
      );
      const prompt = mocks.sendRequest.mock.calls[0][0].messages[0].content;
      expect(prompt).toContain("问题正文");
      expect(prompt).toContain(material);
      expect(prompt.split(material)).toHaveLength(2);
      expect(prompt).toContain("补充材料全文");
      if (previousSummary) expect(prompt).toContain(previousSummary);
    }
  );

  it.each(["message", "user-turn"] as const)(
    "uses the continuation prompt and replaces the prior summary in %s mode",
    async (countUnit) => {
      mocks.getAgentById().parameters.contextCompression.countUnit = countUnit;
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

      const path = [
        first,
        second,
        previousSummary,
        third,
        fourth,
        protectedNode,
      ];
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
    }
  );

  it("reports a request failure instead of treating it as insufficient history", async () => {
    const first: any = {
      id: "first",
      content: "first message",
      childrenIds: ["recent"],
      role: "user",
      status: "complete",
      metadata: { tokenCount: 10 },
    };
    const recent: any = {
      id: "recent",
      content: "recent message",
      parentId: first.id,
      childrenIds: [],
      role: "assistant",
      status: "complete",
      metadata: { tokenCount: 10 },
    };
    const detail = {
      activeLeafId: recent.id,
      nodes: {
        [first.id]: first,
        [recent.id]: recent,
      },
    };

    mocks.getNodePath.mockReturnValue([first, recent]);
    mocks.sendRequest.mockRejectedValue(new Error("API request failed"));

    const { manualCompress } = useContextCompressor();
    await expect(manualCompress({} as any, detail as any)).resolves.toEqual(
      expect.objectContaining({
        success: false,
        failureReason: "request-failed",
      })
    );
  });

  // 第一回合为原生工具链，第二回合为 VCP 拆分链，第三回合受保护。
  const prepareToolHistory = () => {
    const entries = [
      ["u1", "user"],
      ["a1", "assistant"],
      ["t1", "tool"],
      ["a2", "assistant"],
      ["u2", "user"],
      ["v1", "assistant"],
      ["vt", "tool"],
      ["v2", "assistant"],
      ["u3", "user"],
      ["a3", "assistant"],
    ];
    const path = entries.map(([id, role], index): any => ({
      id,
      role,
      content: id,
      parentId: entries[index - 1]?.[0] ?? null,
      childrenIds: entries[index + 1] ? [entries[index + 1][0]] : [],
      status: "complete",
      metadata: {
        tokenCount: 10,
        ...(id.startsWith("v")
          ? { vcpResponse: { requestId: "v1", kind: role } }
          : {}),
      },
    }));
    const detail = {
      activeLeafId: "a3",
      nodes: Object.fromEntries(path.map((node) => [node.id, node])),
    };
    mocks.getNodePath.mockReturnValue(path);
    mocks.addNodeToSession.mockImplementation((session, summaryNode) => {
      session.nodes[summaryNode.id] = summaryNode;
      session.nodes[summaryNode.parentId].childrenIds.push(summaryNode.id);
    });
    return detail;
  };

  it.each([
    { unit: undefined, count: 1, expected: ["u1"] },
    { unit: "user-turn", count: 1, expected: ["u1", "a1", "t1", "a2"] },
    {
      unit: "user-turn",
      count: 2,
      expected: ["u1", "a1", "t1", "a2", "u2", "v1", "vt", "v2"],
    },
  ])(
    "compresses $count $unit units while preserving the recent history",
    async ({ unit, count, expected }) => {
      const detail = prepareToolHistory();
      const agent = mocks.getAgentById();
      Object.assign(agent.parameters.contextCompression, {
        countUnit: unit,
        compressCount: count,
      });
      const { manualCompress } = useContextCompressor();
      const result = await manualCompress({} as any, detail as any);

      expect(result).toMatchObject({
        success: true,
        messageCount: expected.length,
      });
      const summary = detail.nodes["new-summary"];
      expect(summary.metadata.compressedNodeIds).toEqual(expected);
      expect(summary.childrenIds).toEqual([
        count === 2 ? "u3" : unit ? "u2" : "a1",
      ]);
      const prompt = mocks.sendRequest.mock.calls[0][0].messages[0].content;
      for (const id of expected) expect(prompt).toContain(id);
    }
  );

  it.each([
    { minimum: 4, threshold: 1, expected: false },
    { minimum: 1, threshold: 3, expected: false },
    { minimum: 3, threshold: 2, expected: true },
  ])(
    "checks automatic compression against user turns (minimum $minimum, threshold $threshold)",
    async ({ minimum, threshold, expected }) => {
      const detail = prepareToolHistory();
      const agent = mocks.getAgentById();
      Object.assign(agent.parameters.contextCompression, {
        countUnit: "user-turn",
        triggerMode: "count",
        minHistoryCount: minimum,
        countThreshold: threshold,
        compressCount: 1,
      });

      const { checkAndCompress } = useContextCompressor();
      const result = await checkAndCompress({} as any, detail as any);
      expect(result.success).toBe(expected);
      expect(mocks.sendRequest).toHaveBeenCalledTimes(expected ? 1 : 0);
    }
  );

  it("keeps the quantity settings for each counting mode across saved configuration", () => {
    const messageConfig = {
      protectRecentCount: 8,
      compressCount: 12,
      minHistoryCount: 16,
      countThreshold: 40,
    };
    const turnConfig = switchCompressionCountUnit(messageConfig, "user-turn");
    Object.assign(turnConfig, {
      protectRecentCount: 2,
      compressCount: 3,
      minHistoryCount: 4,
      countThreshold: 6,
    });
    const restoredMessages = switchCompressionCountUnit(turnConfig, "message");
    expect(restoredMessages).toMatchObject({
      ...messageConfig,
      countUnit: "message",
    });
    const saved = JSON.parse(JSON.stringify(restoredMessages));
    expect(switchCompressionCountUnit(saved, "user-turn")).toMatchObject({
      countUnit: "user-turn",
      protectRecentCount: 2,
      compressCount: 3,
      minHistoryCount: 4,
      countThreshold: 6,
    });
  });
  it("inherits the current logical request binding for summaries", async () => {
    const { generateSummary } = useContextCompressor();
    await generateSummary([], {} as any, undefined, undefined, {
      profileId: "virtual",
      modelId: "logical",
    });
    expect(mocks.sendRequest).toHaveBeenCalledWith(
      expect.objectContaining({ profileId: "virtual", modelId: "logical" })
    );
  });
  it("requires an explicit summary binding when the parent binding is unavailable", async () => {
    mocks.getAgentById.mockReturnValue(undefined);
    await expect(
      useContextCompressor().generateSummary([], {} as any)
    ).rejects.toThrow("配置摘要模型");
    expect(mocks.sendRequest).toHaveBeenCalledTimes(0);
  });
});
