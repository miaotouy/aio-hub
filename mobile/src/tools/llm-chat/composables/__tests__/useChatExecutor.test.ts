import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatSession, MobileUserProfile } from "../../types";
import type { ChatAgent } from "@/tools/agent-manager/types/agent";

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
  pipelineStore: {
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
  },
  agentStore: {
    isLoaded: true,
    init: vi.fn(),
    getAgentById: vi.fn<(agentId?: string | null) => ChatAgent | undefined>(
      () => undefined
    ),
  },
  worldbookStore: {
    isLoaded: true,
    init: vi.fn(),
    getWorldbooksByIds: vi.fn(() => []),
  },
  userProfileStore: {
    isLoaded: true,
    init: vi.fn(),
    getEffectiveProfile: vi.fn<
      (agentProfileId?: string | null) => MobileUserProfile | null
    >(() => null),
    markUsed: vi.fn(),
  },
  nodeManager: {
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
    createContinuationBranch: vi.fn((session, sourceNodeId) => {
      const source = session.nodes[sourceNodeId];
      if (!source?.parentId || source.role !== "assistant") return null;

      const node = {
        id: "assistant-continuation",
        parentId: source.parentId,
        childrenIds: [],
        content: source.content,
        role: "assistant" as const,
        status: "generating" as const,
        metadata: {
          isContinuation: true,
          continuationPrefix: source.content,
        },
        timestamp: "2026-07-26T10:00:00.000Z",
      };
      session.nodes[node.id] = node;
      session.nodes[source.parentId].childrenIds.push(node.id);
      session.activeLeafId = node.id;
      return node;
    }),
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
  useNodeManager: () => state.nodeManager,
}));
vi.mock("../../stores/contextPipelineStore", () => ({
  useContextPipelineStore: () => state.pipelineStore,
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
  useAgentStore: () => state.agentStore,
}));
vi.mock("../../stores/userProfileStore", () => ({
  useUserProfileStore: () => state.userProfileStore,
}));
vi.mock("../../stores/worldbookStore", () => ({
  useWorldbookStore: () => state.worldbookStore,
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
  state.pipelineStore.executePipeline.mockClear();
  state.agentStore.getAgentById.mockReturnValue(undefined);
  state.userProfileStore.isLoaded = true;
  state.worldbookStore.isLoaded = true;
  state.worldbookStore.getWorldbooksByIds.mockReturnValue([]);
  state.userProfileStore.getEffectiveProfile.mockReturnValue(null);
  state.nodeManager.createContinuationBranch.mockClear();
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

describe("useChatExecutor agent generation parameters", () => {
  it("forwards the active agent's supported generation parameters", async () => {
    state.agentStore.getAgentById.mockReturnValue({
      id: "agent-1",
      name: "Parameter agent",
      profileId: "profile-1",
      modelId: "model-1",
      parameters: {
        temperature: 0.35,
        maxTokens: 2048,
        topP: 0.8,
        frequencyPenalty: 0.3,
        presencePenalty: -0.2,
        stop: ["END"],
      },
      createdAt: "2026-07-26T10:00:00.000Z",
    });

    await useChatExecutor().execute(
      { ...session(), displayAgentId: "agent-1" },
      "Hello"
    );

    expect(state.llmRequest.sendRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        temperature: 0.35,
        maxTokens: 2048,
        topP: 0.8,
        frequencyPenalty: 0.3,
        presencePenalty: -0.2,
        stop: ["END"],
      }),
      "profile-1"
    );
  });
});

describe("useChatExecutor user profile context", () => {
  it("provides the effective profile to the pipeline and records its usage", async () => {
    const profile = {
      id: "user-profile-1",
      name: "Ada",
      content: "I prefer concise answers.",
      enabled: true,
      createdAt: "2026-07-26T10:00:00.000Z",
    };
    state.userProfileStore.getEffectiveProfile.mockReturnValue(profile);

    await useChatExecutor().execute(session(), "Hello");

    expect(state.pipelineStore.executePipeline).toHaveBeenCalledWith(
      expect.objectContaining({ userProfile: profile })
    );
    expect(state.userProfileStore.markUsed).toHaveBeenCalledWith(profile.id);
  });

  it("does not record usage when no effective profile is available", async () => {
    await useChatExecutor().execute(session(), "Hello");

    expect(state.pipelineStore.executePipeline).toHaveBeenCalledWith(
      expect.objectContaining({ userProfile: null })
    );
    expect(state.userProfileStore.markUsed).not.toHaveBeenCalled();
  });
});

describe("useChatExecutor continue generation", () => {
  it("creates a sibling assistant branch with the source content as its request prefix", async () => {
    const targetSession = session();
    targetSession.nodes["user-1"] = {
      id: "user-1",
      parentId: "root",
      childrenIds: ["assistant-source"],
      role: "user",
      status: "complete",
      content: "Hello",
    };
    targetSession.nodes.root.childrenIds = ["user-1"];
    targetSession.nodes["assistant-source"] = {
      id: "assistant-source",
      parentId: "user-1",
      childrenIds: [],
      role: "assistant",
      status: "complete",
      content: "Original reply",
      metadata: { modelId: "old-model", usage: { promptTokens: 8, completionTokens: 3, totalTokens: 11 } },
    };
    targetSession.activeLeafId = "assistant-source";

    state.pipelineStore.executePipeline.mockImplementationOnce(async (context) => {
      context.messages = [
        {
          role: "user",
          content: "Hello",
          sourceType: "session_history",
          sourceId: "user-1",
        },
        {
          role: "assistant",
          content: "Original reply",
          sourceType: "session_history",
          sourceId: "assistant-continuation",
        },
      ];
    });
    state.responseHandler.handleStreamUpdate.mockImplementation(
      (currentSession: ChatSession, nodeId: string, chunk: string) => {
        currentSession.nodes[nodeId].content += chunk;
      }
    );
    state.llmRequest.sendRequest.mockImplementationOnce((options) => {
      options.onStream?.(" continued");
      return Promise.resolve({ content: " continued", isStream: false });
    });

    const continued = await useChatExecutor().continueGeneration(
      targetSession,
      targetSession.nodes["assistant-source"]
    );

    expect(continued).toBe(true);
    expect(state.nodeManager.createContinuationBranch).toHaveBeenCalledWith(
      targetSession,
      "assistant-source"
    );
    expect(targetSession.nodes["assistant-source"].content).toBe(
      "Original reply"
    );
    expect(targetSession.nodes["assistant-continuation"]).toMatchObject({
      parentId: "user-1",
      status: "generating",
      content: "Original reply continued",
      metadata: expect.objectContaining({
        isContinuation: true,
        continuationPrefix: "Original reply",
      }),
    });
    expect(targetSession.activeLeafId).toBe("assistant-continuation");
    expect(state.llmRequest.sendRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          { role: "user", content: "Hello" },
          { role: "assistant", content: "Original reply" },
        ],
      }),
      "profile-1"
    );
    expect(state.responseHandler.finalizeNode).toHaveBeenCalledWith(
      targetSession,
      "assistant-continuation",
      expect.objectContaining({ content: " continued" })
    );
  });

  it("keeps the copied prefix and partial continuation when stopped", async () => {
    const targetSession = session();
    targetSession.nodes["user-1"] = {
      id: "user-1",
      parentId: "root",
      childrenIds: ["assistant-source"],
      role: "user",
      status: "complete",
      content: "Hello",
    };
    targetSession.nodes.root.childrenIds = ["user-1"];
    targetSession.nodes["assistant-source"] = {
      id: "assistant-source",
      parentId: "user-1",
      childrenIds: [],
      role: "assistant",
      status: "complete",
      content: "Original reply",
    };
    targetSession.activeLeafId = "assistant-source";
    state.responseHandler.handleStreamUpdate.mockImplementation(
      (currentSession: ChatSession, nodeId: string, chunk: string) => {
        currentSession.nodes[nodeId].content += chunk;
      }
    );
    state.llmRequest.sendRequest.mockImplementationOnce((options) => {
      options.onStream?.(" partial");
      return new Promise((_, reject) => {
        options.signal?.addEventListener("abort", () => {
          reject(options.signal?.reason);
        });
      });
    });

    const executor = useChatExecutor();
    const execution = executor.continueGeneration(
      targetSession,
      targetSession.nodes["assistant-source"]
    );
    await vi.waitFor(() => {
      expect(state.llmRequest.sendRequest).toHaveBeenCalledOnce();
    });

    expect(executor.stop(targetSession)).toBe(true);
    await execution;

    expect(targetSession.nodes["assistant-continuation"]).toMatchObject({
      status: "complete",
      content: "Original reply partial",
      metadata: expect.objectContaining({
        interrupted: true,
        continuationPrefix: "Original reply",
      }),
    });
    expect(state.responseHandler.handleNodeError).not.toHaveBeenCalled();
  });

  it("refuses to start a continuation while another request is active", async () => {
    state.chatStore.isSending = true;
    const targetSession = session();
    const source = {
      id: "assistant-source",
      parentId: "root",
      childrenIds: [],
      role: "assistant" as const,
      status: "complete" as const,
      content: "Original reply",
    };
    targetSession.nodes[source.id] = source;

    await expect(
      useChatExecutor().continueGeneration(targetSession, source)
    ).resolves.toBe(false);
    expect(state.nodeManager.createContinuationBranch).not.toHaveBeenCalled();
  });
});

describe("useChatExecutor stop generation", () => {
  it("aborts the in-flight request and keeps streamed content as an interrupted complete message", async () => {
    const targetSession = session();
    state.responseHandler.handleStreamUpdate.mockImplementation(
      (currentSession: ChatSession, nodeId: string, chunk: string) => {
        currentSession.nodes[nodeId].content += chunk;
      }
    );
    state.llmRequest.sendRequest.mockImplementationOnce((options) => {
      options.onStream?.("Partial reply");
      return new Promise((_, reject) => {
        options.signal?.addEventListener("abort", () => {
          reject(options.signal?.reason);
        });
      });
    });

    const executor = useChatExecutor();
    const execution = executor.execute(targetSession, "Hello");
    await vi.waitFor(() => {
      expect(state.llmRequest.sendRequest).toHaveBeenCalledOnce();
    });

    expect(executor.stop(targetSession)).toBe(true);
    await execution;

    const assistant = targetSession.nodes["assistant-1"];
    expect(assistant).toMatchObject({
      status: "complete",
      content: "Partial reply",
      metadata: expect.objectContaining({ interrupted: true }),
    });
    expect(state.responseHandler.handleNodeError).not.toHaveBeenCalled();
  });
});
