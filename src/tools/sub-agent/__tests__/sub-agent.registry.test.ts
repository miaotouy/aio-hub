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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolContext } from "@/services/types";
import type {
  ChatMessageNode,
  ChatSessionDetail,
} from "@/tools/llm-chat/types";
import { backgroundTaskRegistry } from "@/services/background-tasks";
import SubAgentRegistry from "../sub-agent.registry";

const mocks = vi.hoisted(() => ({
  sendMessage: vi.fn(),
  abortSending: vi.fn(),
  getSessions: vi.fn(),
  createDetachedSession: vi.fn(),
  appendMessageNode: vi.fn(),
  updateMessageMetadata: vi.fn(),
  sessionDetailMap: new Map<string, unknown>(),
}));

vi.mock("@/tools/llm-chat/services/llmChatService", () => ({
  llmChatService: {
    ensureInitialized: vi.fn().mockResolvedValue(undefined),
    getCurrentSession: () => null,
    getSessions: mocks.getSessions,
    sendMessage: mocks.sendMessage,
  },
}));
vi.mock("@/tools/agent-manager/stores/agentStore", () => ({
  useAgentStore: () => ({
    loadAgentDetails: async (id: string) => ({
      id,
      name: id,
      displayName: `Agent ${id}`,
      subAgentConfig: { enabled: true },
    }),
  }),
}));
vi.mock("@/tools/llm-chat/stores/llmChatStore", () => ({
  useLlmChatStore: () => ({
    sessionDetailMap: mocks.sessionDetailMap,
    createDetachedSession: mocks.createDetachedSession,
    appendMessageNode: mocks.appendMessageNode,
    updateMessageMetadata: mocks.updateMessageMetadata,
    abortSending: mocks.abortSending,
  }),
}));

function createDetail(id: string): ChatSessionDetail {
  const root: ChatMessageNode = {
    id: `${id}-root`,
    parentId: null,
    childrenIds: [],
    role: "system",
    content: "",
    status: "complete",
    isEnabled: true,
    timestamp: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  return {
    id,
    rootNodeId: root.id,
    activeLeafId: root.id,
    nodes: { [root.id]: root },
    updatedAt: root.updatedAt,
    history: [],
    historyIndex: -1,
  } as ChatSessionDetail;
}

function appendNode(
  detail: ChatSessionDetail,
  role: ChatMessageNode["role"],
  content: string,
  metadata?: ChatMessageNode["metadata"]
): string {
  const id = `node-${Object.keys(detail.nodes).length}`;
  const parentId = detail.activeLeafId;
  const node: ChatMessageNode = {
    id,
    parentId,
    childrenIds: [],
    role,
    content,
    metadata,
    status: "complete",
    isEnabled: true,
    timestamp: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  detail.nodes[id] = node;
  detail.nodes[parentId]?.childrenIds.push(id);
  detail.activeLeafId = id;
  return id;
}

const callerContext = {
  agent: { id: "agent-parent" },
  isAsync: false,
  reportStatus: () => undefined,
} satisfies ToolContext;

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}

async function settle(): Promise<void> {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
}

describe("SubAgentRegistry 后台续聊", () => {
  afterEach(async () => {
    // ConfigManager 的防抖保存完成后再进入下一个用例，避免交叉写入索引。
    await new Promise((resolve) => setTimeout(resolve, 600));
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.sessionDetailMap.clear();
    mocks.createDetachedSession.mockImplementation(async () => {
      const sessionId = `child-${Date.now()}-${Math.random()}`;
      mocks.sessionDetailMap.set(sessionId, createDetail(sessionId));
      return sessionId;
    });
    mocks.getSessions.mockImplementation(() =>
      [...mocks.sessionDetailMap.keys()].map((id) => ({ id }))
    );
    mocks.appendMessageNode.mockImplementation(
      (
        sessionId: string,
        message: {
          role: ChatMessageNode["role"];
          content: string;
          metadata?: ChatMessageNode["metadata"];
        }
      ) => {
        const detail = mocks.sessionDetailMap.get(sessionId) as
          ChatSessionDetail | undefined;
        if (!detail) return null;
        return appendNode(
          detail,
          message.role,
          message.content,
          message.metadata
        );
      }
    );
    mocks.updateMessageMetadata.mockImplementation(
      (sessionId: string, nodeId: string, patch: Record<string, unknown>) => {
        const detail = mocks.sessionDetailMap.get(
          sessionId
        ) as ChatSessionDetail;
        const node = detail.nodes[nodeId];
        if (!node) return false;
        node.metadata = { ...node.metadata, ...patch };
        return true;
      }
    );
    await backgroundTaskRegistry.loadFromPersistence();
  });

  it("重建 registry 后继续同一子会话，未知句柄明确失败", async () => {
    const registry = new SubAgentRegistry();
    mocks.sendMessage.mockImplementation(
      async (content: string, options: { sessionId: string }) => {
        const detail = mocks.sessionDetailMap.get(
          options.sessionId
        ) as ChatSessionDetail;
        appendNode(detail, "user", content);
        appendNode(detail, "assistant", `reply:${content}`);
      }
    );

    const first = JSON.parse(
      await registry.ask(
        { agentId: "agent-child", message: "first", mode: "background" },
        callerContext
      )
    );
    await settle();
    await new Promise((resolve) => setTimeout(resolve, 600));

    const restored = new SubAgentRegistry();
    const continued = JSON.parse(
      await restored.ask(
        {
          agentId: "agent-child",
          message: "follow-up",
          conversationId: first.conversationId,
          mode: "background",
        },
        callerContext
      )
    );
    expect(continued.childSessionId).toBe(first.childSessionId);
    expect(mocks.createDetachedSession).toHaveBeenCalledTimes(1);
    await expect(
      restored.ask(
        {
          agentId: "agent-child",
          message: "unknown",
          conversationId: "sub-missing",
        },
        callerContext
      )
    ).rejects.toThrow("conversationId 不存在");
  });

  it("同一子会话串行执行；取消排队任务不会中止当前生成，追加指令保留 Agent 身份", async () => {
    const registry = new SubAgentRegistry();
    const firstGeneration = deferred();
    mocks.sendMessage.mockImplementation(
      async (content: string, options: { sessionId: string }) => {
        if (content === "first") await firstGeneration.promise;
        const detail = mocks.sessionDetailMap.get(
          options.sessionId
        ) as ChatSessionDetail;
        appendNode(detail, "user", content);
        appendNode(detail, "assistant", `reply:${content}`);
      }
    );

    const first = JSON.parse(
      await registry.ask(
        { agentId: "agent-child", message: "first", mode: "background" },
        callerContext
      )
    );
    await settle();
    expect(mocks.sendMessage).toHaveBeenCalledTimes(1);

    const second = JSON.parse(
      await registry.ask(
        {
          agentId: "agent-child",
          message: "second",
          conversationId: first.conversationId,
          mode: "background",
        },
        callerContext
      )
    );
    expect(backgroundTaskRegistry.getSnapshot(second.taskId)?.state).toBe(
      "queued"
    );
    expect(mocks.sendMessage).toHaveBeenCalledTimes(1);
    backgroundTaskRegistry.cancelTask(second.taskId, "停止排队任务");
    expect(mocks.abortSending).not.toHaveBeenCalled();

    const appended = registry.send_task_message(
      { taskId: first.taskId, message: "additional" },
      callerContext
    );
    firstGeneration.resolve();
    const appendResult = JSON.parse(await appended);
    await settle();

    expect(appendResult).toMatchObject({
      appended: true,
      delivery: "append_only",
    });
    expect(appendResult.origin).toMatchObject({
      kind: "agent",
      channel: "sub_agent",
      actorId: "agent-parent",
    });
    expect(mocks.sendMessage).toHaveBeenCalledTimes(1);
    expect(backgroundTaskRegistry.getSnapshot(first.taskId)?.state).toBe(
      "completed"
    );
    expect(backgroundTaskRegistry.getSnapshot(second.taskId)?.state).toBe(
      "cancelled"
    );
    const detail = mocks.sessionDetailMap.get(
      first.childSessionId
    ) as ChatSessionDetail;
    expect(detail.nodes[appendResult.nodeId].metadata?.origin).toMatchObject({
      kind: "agent",
      actorId: "agent-parent",
    });
    const assistant = Object.values(detail.nodes).find(
      (node) => node.content === "reply:first"
    );
    expect(assistant?.metadata?.origin).toMatchObject({
      kind: "agent",
      actorId: "agent-child",
    });
  });
});
