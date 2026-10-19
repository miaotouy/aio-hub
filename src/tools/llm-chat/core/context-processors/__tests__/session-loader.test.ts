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

import { describe, expect, it, vi } from "vitest";
import { sessionLoader } from "../session-loader";
import type {
  ChatMessageNode,
  ChatSessionDetail,
} from "@/tools/llm-chat/types";
import type { PipelineContext } from "@/tools/llm-chat/types/pipeline";

vi.mock("@/utils/logger", () => ({
  createModuleLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

const node = (
  id: string,
  parentId: string | null,
  role: ChatMessageNode["role"],
  content: string,
  childrenIds: string[] = []
): ChatMessageNode => ({
  id,
  parentId,
  childrenIds,
  role,
  content,
  status: "complete",
});

const createContext = (
  session: ChatSessionDetail,
  sharedData = new Map<string, any>()
): PipelineContext =>
  ({
    messages: [],
    index: {
      id: session.id,
      name: "Test session",
      messageCount: 0,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    detail: session,
    agentConfig: {},
    settings: {},
    timestamp: Date.now(),
    sharedData,
    logs: [],
  }) as unknown as PipelineContext;

describe("sessionLoader", () => {
  it("loads preview history only up to the requested target node", async () => {
    const nodes = {
      root: node("root", null, "system", "root", ["u1"]),
      u1: node("u1", "root", "user", "first user", ["a1"]),
      a1: node("a1", "u1", "assistant", "first assistant", ["u2"]),
      u2: node("u2", "a1", "user", "second user", ["a2"]),
      a2: node("a2", "u2", "assistant", "second assistant"),
    };
    const session: ChatSessionDetail = {
      id: "session-1",
      updatedAt: "2026-01-01T00:00:00.000Z",
      nodes,
      rootNodeId: "root",
      activeLeafId: "a2",
      history: [],
      historyIndex: -1,
    };
    const context = createContext(
      session,
      new Map([["contextPreviewTargetNodeId", "u1"]])
    );

    await sessionLoader.execute(context);

    expect(context.messages.map((message) => message.sourceId)).toEqual(["u1"]);
    expect(context.messages[0]).toMatchObject({
      role: "user",
      content: "first user",
    });
  });
  it("replays VCP response segments once and sends upstream tool text as user content", async () => {
    const nodes = {
      root: node("root", null, "system", "root", ["u"]),
      u: node("u", "root", "user", "question", ["a1"]),
      a1: node("a1", "u", "assistant", "tool request", ["t"]),
      t: node("t", "a1", "tool", "tool result", ["a2"]),
      a2: node("a2", "t", "assistant", "answer"),
    };
    nodes.t.metadata = { vcpResponse: { requestId: "a1", kind: "tool" } };
    nodes.a1.metadata = {
      vcpResponse: { requestId: "a1", kind: "assistant" },
      reasoningContent: "intermediate thought",
    };
    nodes.a2.metadata = {
      vcpResponse: { requestId: "a1", kind: "assistant" },
      reasoningContent: "final thought",
    };
    const context = createContext({
      id: "vcp",
      nodes,
      rootNodeId: "root",
      activeLeafId: "a2",
      history: [],
      historyIndex: -1,
    } as unknown as ChatSessionDetail);
    context.agentConfig!.toolCallConfig = {
      convertToolRoleToUser: false,
    } as any;
    await sessionLoader.execute(context);
    expect(
      context.messages.map((message) => [message.role, message.content])
    ).toEqual([
      ["user", "question"],
      ["assistant", "tool request"],
      ["user", "tool result"],
      ["assistant", "answer"],
    ]);
    expect(context.messages[1].reasoningContent).toBe("intermediate thought");
    expect(context.messages[3].reasoningContent).toBeUndefined();
  });
  it("replays tool local media references as user media even when text tools keep their role", async () => {
    const nodes = {
      u: node("u", null, "user", "read photo", ["t"]),
      t: node("t", "u", "tool", "read succeeded", ["a"]),
      a: node("a", "t", "assistant", "answer"),
    };
    nodes.t.localMedia = [
      {
        id: "photo",
        type: "image",
        name: "photo.png",
        mimeType: "image/png",
        path: "C:/media/photo.png",
        size: 3,
      },
    ];
    const context = createContext({
      id: "media",
      updatedAt: "2026-10-19T00:00:00Z",
      nodes,
      rootNodeId: "u",
      activeLeafId: "a",
      history: [],
      historyIndex: -1,
    } as ChatSessionDetail);
    context.agentConfig!.toolCallConfig = {
      convertToolRoleToUser: false,
    } as any;
    await sessionLoader.execute(context);
    expect(
      context.messages.find((message) => message.sourceId === "t")
    ).toMatchObject({
      role: "user",
      content: "read succeeded",
      _attachments: [
        {
          type: "image",
          source: { kind: "local-file", path: "C:/media/photo.png" },
        },
      ],
    });
  });
});
