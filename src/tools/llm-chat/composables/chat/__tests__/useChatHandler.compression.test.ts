import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import type { ChatSessionDetail } from "../../../types";
import { createSessionRuntimeManager } from "../../../stores/session/sessionRuntimeManager";

const mocks = vi.hoisted(() => ({
  checkAndCompress: vi.fn(),
  executeRequest: vi.fn(),
  persistSession: vi.fn(),
  saveSession: vi.fn(),
}));
let session: ChatSessionDetail;
let runtime: ReturnType<typeof createSessionRuntimeManager>;
let controllers: Map<string, AbortController>;
let generating: Set<string>;
vi.mock("../../../stores/llmChatStore", () => ({
  useLlmChatStore: () => ({
    sessionIndexMap: new Map([[session.id, { id: session.id }]]),
    sessionDetailMap: new Map([[session.id, session]]),
    ...runtime,
  }),
}));
vi.mock("../../features/useContextCompressor", () => ({
  useContextCompressor: () => ({ checkAndCompress: mocks.checkAndCompress }),
}));
vi.mock("../useChatExecutor", () => ({
  useChatExecutor: () => ({
    executeRequest: mocks.executeRequest,
    calculateUserMessageTokens: vi.fn(),
    saveUserProfileSnapshot: vi.fn(),
  }),
}));
vi.mock("../useToolCallOrchestrator", () => ({
  useToolCallOrchestrator: () => ({}),
}));
vi.mock("../../session/useSessionManager", () => ({
  useSessionManager: () => ({ persistSession: mocks.persistSession }),
}));
vi.mock("../../storage/useChatStorageSeparated", () => ({
  useChatStorageSeparated: () => ({ saveSession: mocks.saveSession }),
}));
vi.mock("@/tools/agent-manager/stores/agentStore", () => ({
  useAgentStore: () => ({
    getAgentById: () => ({ id: "agent", name: "Agent" }),
    getAgentConfig: () => ({
      profileId: "profile",
      modelId: "model",
      parameters: {},
    }),
  }),
}));
vi.mock("../../../stores/userProfileStore", () => ({
  useUserProfileStore: () => ({ getEffectiveProfile: () => null }),
}));
vi.mock("../../ui/useLlmChatUiState", () => ({
  useLlmChatUiState: () => ({ currentAgentId: { value: "agent" } }),
}));
vi.mock("@/composables/useLlmProfiles", () => ({
  useLlmProfiles: () => ({ getProfileById: () => undefined }),
}));
vi.mock("@/composables/useLlmRequest", () => ({ useLlmRequest: () => ({}) }));
vi.mock("../../settings/useChatSettings", () => ({
  useChatSettings: () => ({
    settings: {
      value: { transcription: { enabled: false }, uiPreferences: {} },
    },
  }),
}));
vi.mock("../../../services/greetingService", () => ({
  solidifyGreetings: vi.fn(),
}));
vi.mock("../../../macro-engine/MacroProcessor", () => ({
  MacroProcessor: class {},
}));
vi.mock("../../../core/context-utils/macro", () => ({}));
vi.mock("../../../config/parameter-config", () => ({}));
vi.mock("@/tools/knowledge-base/services/reference", () => ({}));
vi.mock("@/tools/knowledge-base/services/access", () => ({}));
vi.mock("../../../services/explicitKnowledgeReference", () => ({}));
vi.mock("@/utils/logger", () => ({
  createModuleLogger: () => ({ info: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));
vi.mock("@/utils/errorHandler", () => ({
  createModuleErrorHandler: () => ({ handle: vi.fn() }),
}));

import { useChatHandler } from "../useChatHandler";
import { useNodeManager } from "../../session/useNodeManager";
import { awaitWithSignal } from "../../../utils/awaitWithSignal";

function startCompression() {
  let finish!: (value: { success: boolean }) => void;
  const result = new Promise<{ success: boolean }>((resolve) => {
    finish = resolve;
  });
  const task = runtime.runContextCompression(
    session.id,
    async (signal, showProgress) => {
      showProgress(2);
      return awaitWithSignal(result, signal);
    }
  );
  mocks.checkAndCompress.mockImplementation(() => task);
  return { task, finish };
}

function send() {
  return useChatHandler().sendMessage(
    session,
    "new question",
    [],
    controllers,
    generating,
    { disableMacroParsing: true },
    session.id
  );
}

// 保护可见消息与请求提交契约，使用真实节点管理器和会话运行态。
describe("sending while context compression is running", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const root = useNodeManager().createNode({
      role: "system",
      content: "",
      parentId: null,
    });
    session = {
      id: "session",
      nodes: { [root.id]: root },
      rootNodeId: root.id,
      activeLeafId: root.id,
      updatedAt: "2026-11-01T00:00:00Z",
      history: [],
      historyIndex: -1,
    };
    controllers = new Map();
    generating = new Set();
    runtime = createSessionRuntimeManager({
      sessionDetailMap: ref(new Map([[session.id, session]])),
      currentSessionId: ref(session.id),
      abortControllers: ref(controllers),
      generatingNodes: ref(generating),
      queuedSessionIds: ref(new Set()),
      queuedSessionAgentIds: ref(new Map()),
      findSessionIdByNodeId: () => session.id,
    });
    mocks.saveSession.mockResolvedValue(undefined);
  });

  it("saves and displays the message before waiting, then uses the newly committed summary", async () => {
    const compression = startCompression();
    const request = send();
    await vi.waitFor(() => expect(controllers.size).toBe(1));
    const user = Object.values(session.nodes).find(
      (node) => node.role === "user"
    )!;
    const assistant = Object.values(session.nodes).find(
      (node) => node.role === "assistant"
    )!;
    expect(user.content).toBe("new question");
    expect(assistant.status).toBe("waiting");
    expect(mocks.saveSession).toHaveBeenCalledOnce();
    expect(mocks.checkAndCompress).toHaveBeenCalledWith(
      expect.anything(),
      session,
      undefined,
      session.rootNodeId
    );
    expect(mocks.executeRequest).not.toHaveBeenCalled();
    const manager = useNodeManager();
    const summary = manager.createNode({
      role: "system",
      content: "summary",
      parentId: session.rootNodeId,
      metadata: { isCompressionNode: true },
    });
    manager.addNodeToSession(session, summary);
    session.nodes[session.rootNodeId!].childrenIds = [summary.id];
    summary.childrenIds = [user.id];
    user.parentId = summary.id;
    compression.finish({ success: true });
    await request;
    expect(mocks.executeRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        pathToUserNode: expect.arrayContaining([
          expect.objectContaining({ id: summary.id }),
        ]),
      })
    );
  });

  it("stops the pending request while retaining the saved question", async () => {
    const compression = startCompression();
    const request = send();
    await vi.waitFor(() => expect(controllers.size).toBe(1));
    const assistant = Object.values(session.nodes).find(
      (node) => node.role === "assistant"
    )!;
    runtime.abortNodeGeneration(assistant.id);
    await request;
    expect(
      Object.values(session.nodes).filter((node) => node.role === "user")
    ).toEqual([expect.objectContaining({ content: "new question" })]);
    expect(session.nodes[assistant.id]).toBeUndefined();
    expect(mocks.executeRequest).not.toHaveBeenCalled();
    expect(runtime.isSessionCompressing(session.id)).toBe(true);
    compression.finish({ success: true });
    await compression.task;
  });

  it("continues the waiting request with original context when compression is cancelled", async () => {
    const compression = startCompression();
    const request = send();
    await vi.waitFor(() => expect(controllers.size).toBe(1));
    runtime.cancelContextCompression(session.id);
    await compression.task;
    await request;
    expect(mocks.executeRequest).toHaveBeenCalledOnce();
    expect(runtime.getContextCompressionTask(session.id)?.status).toBe(
      "cancelled"
    );
  });
});
