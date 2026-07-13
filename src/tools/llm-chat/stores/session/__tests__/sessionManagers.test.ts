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
}));

vi.mock("../../../composables/chat/useChatHandler", () => ({
  useChatHandler: () => ({
    sendMessage: mocks.sendMessage,
    continueGeneration: vi.fn(),
    regenerateFromNode: vi.fn(),
    completeInput: vi.fn(),
  }),
}));
vi.mock("@/tools/llm-chat/composables/chat/useChatHandler", () => ({
  useChatHandler: () => ({
    sendMessage: mocks.sendMessage,
    continueGeneration: vi.fn(),
    regenerateFromNode: vi.fn(),
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

describe("llm-chat session managers", () => {
  beforeEach(() => {
    mocks.sendMessage.mockReset();
    mocks.sendMessage.mockResolvedValue(undefined);
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
      userAbortedNodeIds: ref(new Set<string>()),
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
      userAbortedNodeIds: ref(new Set<string>()),
      findSessionIdByNodeId: (nodeId) => (nodeId.startsWith("a-") ? "a" : "b"),
    });

    runtime.abortSessionGeneration("a");

    expect(abortA.signal.aborted).toBe(true);
    expect(abortB.signal.aborted).toBe(false);
    expect(runtime.isSessionGenerating("a")).toBe(false);
    expect(runtime.isSessionGenerating("b")).toBe(true);
  });
});
