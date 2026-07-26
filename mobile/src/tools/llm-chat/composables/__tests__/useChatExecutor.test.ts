import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatSession } from "../../types";

const state = vi.hoisted(() => ({
  chatStore: {
    isSending: false,
    selectedModelValue: "profile-1:model-1",
    persistCurrentSession: vi.fn(),
  },
  llmRequest: { sendRequest: vi.fn() },
  profilesStore: {
    profiles: [
      {
        id: "profile-1",
        enabled: true,
        name: "Test profile",
        models: [{ id: "model-1", name: "Test model", capabilities: {} }],
      },
    ],
  },
  responseHandler: {
    handleStreamUpdate: vi.fn(),
    finalizeNode: vi.fn(),
    handleNodeError: vi.fn(),
  },
  settings: {
    value: {
      uiPreferences: { isStreaming: false },
      requestSettings: { timeout: 60_000 },
      contextManagement: { warningRatio: 0.8, criticalRatio: 0.9 },
    },
  },
}));

vi.mock("../../stores/llmChatStore", () => ({
  useLlmChatStore: () => state.chatStore,
}));
vi.mock("../../../llm-api/composables/useLlmRequest", () => ({
  useLlmRequest: () => state.llmRequest,
}));
vi.mock("../../../llm-api/stores/llmProfiles", () => ({
  useLlmProfilesStore: () => state.profilesStore,
}));
vi.mock("../../utils/modelSelection", () => ({
  parseSelectedModelValue: () => ["profile-1", "model-1"],
}));
vi.mock("../useNodeManager", () => ({
  useNodeManager: () => ({
    createNode: vi.fn((config) => ({
      id: config.role === "user" ? "user-1" : "assistant-1",
      parentId: config.parentId,
      childrenIds: [],
      content: config.content,
      role: config.role,
      status: config.status ?? "complete",
      metadata: config.metadata,
      timestamp: "2026-07-26T10:00:00.000Z",
    })),
    addNodeToSession: vi.fn((session, node) => {
      session.nodes[node.id] = node;
    }),
    updateActiveLeaf: vi.fn((session, nodeId) => {
      session.activeLeafId = nodeId;
    }),
  }),
}));
vi.mock("../../stores/contextPipelineStore", () => ({
  useContextPipelineStore: () => ({
    executePipeline: vi.fn(async (context) => {
      context.messages = [
        {
          role: "user",
          content: "Hello",
          sourceType: "session_history",
          sourceId: "user-1",
        },
      ];
    }),
  }),
}));
vi.mock("../useChatResponseHandler", () => ({
  useChatResponseHandler: () => state.responseHandler,
}));
vi.mock("../useTopicNamer", () => ({
  useTopicNamer: () => ({
    shouldAutoName: () => false,
    generateTopicName: vi.fn(),
  }),
}));
vi.mock("../useChatSettings", () => ({
  useChatSettings: () => ({ settings: state.settings, loadSettings: vi.fn() }),
}));
vi.mock("@/tools/agent-manager/stores/agentStore", () => ({
  useAgentStore: () => ({ isLoaded: true, getAgentById: () => undefined }),
}));
vi.mock("@/utils/tokenCounting", () => ({
  countTokensBatch: vi.fn(async () => ({
    counts: [1],
    fallback: false,
    tokenizer: "test",
  })),
}));
vi.mock("@/utils/feedback", () => ({ customMessage: vi.fn() }));
vi.mock("@/i18n", () => ({ useI18n: () => ({ tRaw: (key: string) => key }) }));
vi.mock("../../utils/contextTokenUsage", () => ({
  contentToTokenText: (content: unknown) => String(content),
  createLocalContextUsage: () => ({ riskLevel: "normal" }),
}));
vi.mock("../../utils/attachmentContent", () => ({
  buildMessageContent: (content: unknown) => content,
}));
vi.mock("../../utils/attachmentStatus", () => ({
  getAttachmentAvailabilityMap: vi.fn(),
  partitionAttachmentsByAvailability: vi.fn(),
}));
vi.mock("../../services/agentSessionService", () => ({
  createAssistantAgentSnapshot: () => ({}),
}));

import { useChatExecutor } from "../useChatExecutor";

const session = (): ChatSession => ({
  id: "session-1",
  name: "Test session",
  nodes: {
    root: {
      id: "root",
      parentId: null,
      childrenIds: [],
      role: "system",
      status: "complete",
      content: "",
      timestamp: "2026-07-26T10:00:00.000Z",
    },
  },
  rootNodeId: "root",
  activeLeafId: "root",
  createdAt: "2026-07-26T10:00:00.000Z",
  updatedAt: "2026-07-26T10:00:00.000Z",
});

beforeEach(() => {
  vi.clearAllMocks();
  state.chatStore.isSending = false;
  state.settings.value.uiPreferences.isStreaming = false;
  state.llmRequest.sendRequest.mockResolvedValue({
    content: "Complete response",
    isStream: false,
  });
});

describe("useChatExecutor streaming preference", () => {
  it("passes the disabled streaming preference through to the LLM request", async () => {
    await useChatExecutor().execute(session(), "Hello");

    expect(state.llmRequest.sendRequest).toHaveBeenCalledWith(
      expect.objectContaining({ stream: false }),
      "profile-1"
    );
    expect(state.responseHandler.finalizeNode).toHaveBeenCalledOnce();
  });
});
