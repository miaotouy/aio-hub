// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { createSessionAccessManager } from "../sessionAccessManager";
import { createSessionGenerationManager } from "../sessionGenerationManager";
import { createSessionRuntimeManager } from "../sessionRuntimeManager";
import type { ChatMessageNode } from "../../../types/message";
import type {
  ChatSessionDetail,
  ChatSessionIndex,
} from "../../../types/session";

const mocks = vi.hoisted(() => ({
  sendMessage: vi.fn(),
  continueGeneration: vi.fn(),
  regenerateFromNode: vi.fn(),
}));

vi.mock("../../../composables/chat/useChatHandler", () => ({
  useChatHandler: () => ({
    sendMessage: mocks.sendMessage,
    continueGeneration: mocks.continueGeneration,
    regenerateFromNode: mocks.regenerateFromNode,
    completeInput: vi.fn(),
  }),
}));
vi.mock("@/tools/llm-chat/composables/chat/useChatHandler", () => ({
  useChatHandler: () => ({
    sendMessage: mocks.sendMessage,
    continueGeneration: mocks.continueGeneration,
    regenerateFromNode: mocks.regenerateFromNode,
    completeInput: vi.fn(),
  }),
}));

vi.mock("../../../composables/session/useSessionManager", () => ({
  useSessionManager: () => ({
    updateMessageCount: vi.fn(),
    updateSessionDisplayAgent: vi.fn(),
    persistSession: vi.fn(),
  }),
}));

vi.mock("../../../composables/input/useChatInputManager", () => ({
  useChatInputManager: () => ({
    clear: vi.fn(),
    addContent: vi.fn(),
  }),
}));
vi.mock("@/tools/llm-chat/composables/input/useChatInputManager", () => ({
  useChatInputManager: () => ({
    clear: vi.fn(),
    addContent: vi.fn(),
  }),
}));

function node(
  id: string,
  parentId: string | null,
  role: ChatMessageNode["role"],
  content = id
): ChatMessageNode {
  return {
    id,
    parentId,
    childrenIds: [],
    role,
    content,
    status: "complete",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function session(
  id: string,
  leafId: string,
  nodes: Record<string, ChatMessageNode>
): ChatSessionDetail {
  return {
    id,
    updatedAt: "2026-01-01T00:00:00.000Z",
    nodes,
    rootNodeId: `${id}-root`,
    activeLeafId: leafId,
    history: [],
    historyIndex: -1,
  };
}

function index(id: string): ChatSessionIndex {
  return {
    id,
    name: id,
    messageCount: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function createGenerationManagerForTest(
  details: Map<string, ChatSessionDetail>,
  currentSessionId: string,
  generatingNodeIds: string[] = [],
  queuedSessionIds: string[] = []
) {
  const sessionIndexMap = ref(
    new Map(Array.from(details.keys()).map((id) => [id, index(id)]))
  );
  const sessionDetailMap = ref(details);
  const currentSession = ref<string | null>(currentSessionId);
  const abortControllers = ref(new Map<string, AbortController>());
  const generatingNodes = ref(new Set(generatingNodeIds));
  const queuedIds = ref(new Set(queuedSessionIds));
  const queuedAgentIds = ref(new Map<string, string>());
  const access = createSessionAccessManager({
    sessionIndexMap,
    sessionDetailMap,
    currentSessionId: currentSession,
  });
  const runtime = createSessionRuntimeManager({
    sessionDetailMap,
    currentSessionId: currentSession,
    abortControllers,
    generatingNodes,
    queuedSessionIds: queuedIds,
    queuedSessionAgentIds: queuedAgentIds,
    findSessionIdByNodeId: access.findSessionIdByNodeId,
  });
  const generation = createSessionGenerationManager(
    {
      sessionIndexMap,
      sessionDetailMap,
      currentSessionId: currentSession,
      abortControllers,
      generatingNodes,
      queuedSessionIds: queuedIds,
      queuedSessionAgentIds: queuedAgentIds,
    },
    {
      access,
      runtime,
      history: { clearHistory: vi.fn() } as any,
      executeOrProxy: async (_action, _params, localFn) => localFn(),
      createChatHandler: () => ({
        sendMessage: mocks.sendMessage,
        continueGeneration: mocks.continueGeneration,
        regenerateFromNode: mocks.regenerateFromNode,
        completeInput: vi.fn(),
      }),
      createSessionManager: () => ({
        updateMessageCount: vi.fn(),
        updateSessionDisplayAgent: vi.fn(),
        persistSession: vi.fn(),
      }),
    }
  );

  return {
    generation,
    runtime,
    detailMap: sessionDetailMap,
    abortControllers,
    generatingNodes,
    queuedIds,
  };
}

describe("llm-chat session managers", () => {
  beforeEach(() => {
    mocks.sendMessage.mockReset();
    mocks.continueGeneration.mockReset();
    mocks.regenerateFromNode.mockReset();
    mocks.sendMessage.mockResolvedValue(undefined);
    mocks.continueGeneration.mockResolvedValue(undefined);
    mocks.regenerateFromNode.mockResolvedValue(undefined);
  });

  it("sends to a non-current session with that session's active path", async () => {
    const currentRoot = node("current-root", null, "system");
    const currentUser = node("current-user", "current-root", "user");
    currentRoot.childrenIds = ["current-user"];

    const targetRoot = node("target-root", null, "system");
    const targetUser = node("target-user", "target-root", "user");
    const targetAssistant = node(
      "target-assistant",
      "target-user",
      "assistant"
    );
    targetRoot.childrenIds = ["target-user"];
    targetUser.childrenIds = ["target-assistant"];

    const sessionIndexMap = ref(
      new Map([
        ["current", index("current")],
        ["target", index("target")],
      ])
    );
    const sessionDetailMap = ref(
      new Map([
        [
          "current",
          session("current", "current-user", {
            "current-root": currentRoot,
            "current-user": currentUser,
          }),
        ],
        [
          "target",
          session("target", "target-assistant", {
            "target-root": targetRoot,
            "target-user": targetUser,
            "target-assistant": targetAssistant,
          }),
        ],
      ])
    );
    const currentSessionId = ref<string | null>("current");
    const abortControllers = ref(new Map<string, AbortController>());
    const generatingNodes = ref(new Set<string>());
    const queuedSessionIds = ref(new Set<string>());
    const queuedSessionAgentIds = ref(new Map<string, string>());

    const access = createSessionAccessManager({
      sessionIndexMap,
      sessionDetailMap,
      currentSessionId,
    });
    const runtime = createSessionRuntimeManager({
      sessionDetailMap,
      currentSessionId,
      abortControllers,
      generatingNodes,
      queuedSessionIds,
      queuedSessionAgentIds,
      findSessionIdByNodeId: access.findSessionIdByNodeId,
    });
    const history = {
      clearHistory: vi.fn(),
    } as any;
    const generation = createSessionGenerationManager(
      {
        sessionIndexMap,
        sessionDetailMap,
        currentSessionId,
        abortControllers,
        generatingNodes,
        queuedSessionIds,
        queuedSessionAgentIds,
      },
      {
        access,
        runtime,
        history,
        executeOrProxy: async (_action, _params, localFn) => localFn(),
        createChatHandler: () => ({
          sendMessage: mocks.sendMessage,
          continueGeneration: vi.fn(),
          regenerateFromNode: vi.fn(),
          completeInput: vi.fn(),
        }),
        createSessionManager: () => ({
          updateMessageCount: vi.fn(),
          updateSessionDisplayAgent: vi.fn(),
          persistSession: vi.fn(),
        }),
      }
    );

    await generation.sendMessage("hello", { sessionId: "target" });

    expect(mocks.sendMessage).toHaveBeenCalledTimes(1);
    const [, , activePath] = mocks.sendMessage.mock.calls[0];
    expect(activePath.map((item: ChatMessageNode) => item.id)).toEqual([
      "target-user",
      "target-assistant",
    ]);
  });

  it("queues only when the target parent is on a generating path", async () => {
    const root = node("root", null, "system");
    const user = node("user", "root", "user");
    const generatingAssistant = node(
      "generating-assistant",
      "user",
      "assistant"
    );
    const parallelAssistant = node("parallel-assistant", "user", "assistant");
    root.childrenIds = ["user"];
    user.childrenIds = ["generating-assistant", "parallel-assistant"];

    const detail = session("chat", "generating-assistant", {
      root,
      user,
      "generating-assistant": generatingAssistant,
      "parallel-assistant": parallelAssistant,
    });
    const { generation } = createGenerationManagerForTest(
      new Map([["chat", detail]]),
      "chat",
      ["generating-assistant"]
    );

    await generation.sendMessage("same branch");
    expect(mocks.sendMessage.mock.calls[0][5]).toMatchObject({
      skipGeneration: true,
    });

    detail.activeLeafId = "parallel-assistant";
    await generation.sendMessage("other branch");
    expect(mocks.sendMessage.mock.calls[1][5]).toBeUndefined();
  });

  it("reuses an empty queued assistant placeholder instead of creating a sibling", async () => {
    const root = node("root", null, "system");
    const user = node("user", "root", "user");
    const queuedAssistant = node("queued-assistant", "user", "assistant", "");
    queuedAssistant.status = "waiting";
    queuedAssistant.metadata = { isQueued: true, agentId: "agent-queued" };
    root.childrenIds = ["user"];
    user.childrenIds = ["queued-assistant"];

    const detail = session("chat", "queued-assistant", {
      root,
      user,
      "queued-assistant": queuedAssistant,
    });
    const { generation } = createGenerationManagerForTest(
      new Map([["chat", detail]]),
      "chat",
      [],
      ["chat"]
    );

    await generation.triggerQueuedGenerationForSession("chat");

    expect(mocks.continueGeneration).toHaveBeenCalledTimes(1);
    expect(mocks.continueGeneration.mock.calls[0][1]).toBe("queued-assistant");
    expect(mocks.continueGeneration.mock.calls[0][4]).toEqual({
      agentId: "agent-queued",
      reuseNode: true,
    });
    expect(mocks.regenerateFromNode).not.toHaveBeenCalled();
  });

  it("triggers a queued branch when only another branch is still generating", async () => {
    const root = node("root", null, "system");
    const user = node("user", "root", "user");
    const branchA = node("branch-a", "user", "assistant");
    const branchB = node("branch-b", "user", "assistant");
    const branchC = node("branch-c", "user", "assistant");
    const queuedUser = node("queued-user", "branch-b", "user");
    queuedUser.status = "queued";
    queuedUser.metadata = { isQueued: true, agentId: "agent-b" };
    root.childrenIds = ["user"];
    user.childrenIds = ["branch-a", "branch-b", "branch-c"];
    branchB.childrenIds = ["queued-user"];

    const detail = session("chat", "queued-user", {
      root,
      user,
      "branch-a": branchA,
      "branch-b": branchB,
      "branch-c": branchC,
      "queued-user": queuedUser,
    });
    const generationState = createGenerationManagerForTest(
      new Map([["chat", detail]]),
      "chat",
      ["branch-a", "branch-b"],
      ["chat"]
    );
    const { generation, generatingNodes } = generationState;

    await generation.triggerQueuedGenerationForSession("chat");
    expect(mocks.regenerateFromNode).not.toHaveBeenCalled();

    // 非排队分支的请求完成后，不能把另一分支仍在等待的队列标记清掉。
    detail.activeLeafId = "branch-c";
    await generation.sendMessage("parallel branch");
    expect(mocks.sendMessage).toHaveBeenCalledTimes(1);
    expect(generationState.queuedIds.value.has("chat")).toBe(true);

    generatingNodes.value.delete("branch-b");
    await generation.triggerQueuedGenerationForSession("chat");

    expect(mocks.regenerateFromNode).toHaveBeenCalledTimes(1);
    expect(mocks.regenerateFromNode.mock.calls[0][1]).toBe("queued-user");
    expect(mocks.regenerateFromNode.mock.calls[0][5]).toEqual({
      agentId: "agent-b",
    });
    expect(generatingNodes.value.has("branch-a")).toBe(true);
  });

  it("marks queued messages as stopped after the preceding generation is manually stopped", async () => {
    const root = node("root", null, "system");
    const generatingAssistant = node(
      "generating-assistant",
      "root",
      "assistant",
      "partial response"
    );
    generatingAssistant.status = "generating";
    const queuedUser = node("queued-user", "generating-assistant", "user");
    queuedUser.status = "queued";
    queuedUser.metadata = { isQueued: true, agentId: "agent-queued" };
    root.childrenIds = ["generating-assistant"];
    generatingAssistant.childrenIds = ["queued-user"];

    const detail = session("chat", "queued-user", {
      root,
      "generating-assistant": generatingAssistant,
      "queued-user": queuedUser,
    });
    const generationState = createGenerationManagerForTest(
      new Map([["chat", detail]]),
      "chat",
      ["generating-assistant"],
      ["chat"]
    );
    const controller = new AbortController();
    generationState.abortControllers.value.set(
      "generating-assistant",
      controller
    );

    generationState.runtime.abortNodeGeneration("generating-assistant");

    expect(controller.signal.aborted).toBe(true);
    expect(generationState.queuedIds.value.has("chat")).toBe(false);
    expect(
      generationState.generatingNodes.value.has("generating-assistant")
    ).toBe(false);
    expect(queuedUser.status).toBe("error");
    expect(queuedUser.metadata).toMatchObject({
      error: "队列已停止",
    });
    expect(queuedUser.metadata?.isQueued).toBeUndefined();

    await generationState.generation.triggerQueuedGenerationForSession("chat");

    expect(mocks.regenerateFromNode).not.toHaveBeenCalled();
  });

  it("isolates generating state and abort queues by session", () => {
    const aRoot = node("a-root", null, "system");
    const aNode = node("a-node", "a-root", "assistant");
    const bRoot = node("b-root", null, "system");
    const bNode = node("b-node", "b-root", "assistant");
    const sessionDetailMap = ref(
      new Map([
        ["a", session("a", "a-node", { "a-root": aRoot, "a-node": aNode })],
        ["b", session("b", "b-node", { "b-root": bRoot, "b-node": bNode })],
      ])
    );
    const abortA = new AbortController();
    const abortB = new AbortController();
    const runtime = createSessionRuntimeManager({
      sessionDetailMap,
      currentSessionId: ref<string | null>("a"),
      abortControllers: ref(
        new Map([
          ["a-node", abortA],
          ["b-node", abortB],
        ])
      ),
      generatingNodes: ref(new Set(["a-node", "b-node"])),
      queuedSessionIds: ref(new Set(["a", "b"])),
      queuedSessionAgentIds: ref(
        new Map([
          ["a", "agent-a"],
          ["b", "agent-b"],
        ])
      ),
      findSessionIdByNodeId: (nodeId) => (nodeId.startsWith("a-") ? "a" : "b"),
    });

    runtime.abortSessionGeneration("a");

    expect(abortA.signal.aborted).toBe(true);
    expect(abortB.signal.aborted).toBe(false);
    expect(runtime.isSessionGenerating("a")).toBe(false);
    expect(runtime.isSessionGenerating("b")).toBe(true);
  });
});
