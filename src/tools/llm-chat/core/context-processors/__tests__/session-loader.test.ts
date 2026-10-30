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
  it.each([
    "<think>**raw <x>value</x> &amp;**</think>",
    "<guguthink>open <x>value</x>",
  ])("repeated HTML conversion preserves think blocks: %s", async (block) => {
    const source = "<p>body</p>" + block;
    const nodes = {
      root: node("root", null, "system", "root"),
      old: node("old", "root", "assistant", source),
      latest: node("latest", "old", "user", "<b>recent</b>"),
    };
    const session = {
      id: "html",
      nodes,
      rootNodeId: "root",
      activeLeafId: "latest",
      updatedAt: "2026-10-28",
      history: [],
      historyIndex: -1,
    } satisfies ChatSessionDetail;
    const build = async () => {
      const ctx = createContext(session);
      ctx.settings.contextOptimization = {
        convertHtmlToMd: true,
        htmlToMdLastMessages: 1,
      };
      await sessionLoader.execute(ctx);
      return ctx;
    };
    const first = await build();
    const repeated = await build();
    expect(first.messages[0].content).toContain(block);
    expect(repeated.messages[0].content).toBe(first.messages[0].content);
    expect(repeated.messages[1].content).toBe("<b>recent</b>");
    nodes.old.content = "<p>changed</p>";
    const changed = await build();
    expect(changed.messages[0].content).toBe(
      "changed\n[note: this message was converted from HTML to Markdown for context compression]"
    );
  });

  it("HTML reuse respects think configuration, conversion eligibility and current metadata", async () => {
    const source = "<analysis>keep <b>raw</b></analysis><p>body</p>";
    const nodes = {
      root: node("root", null, "system", "root"),
      old: node("old", "root", "assistant", source),
      latest: node("latest", "old", "user", "latest"),
    };
    const session = {
      id: "html-config",
      nodes,
      rootNodeId: "root",
      activeLeafId: "latest",
      updatedAt: "2026-10-28",
      history: [],
      historyIndex: -1,
    } satisfies ChatSessionDetail;
    const build = async (custom: boolean, enabled = true, recent = 1) => {
      const ctx = createContext(session);
      ctx.settings.contextOptimization = {
        convertHtmlToMd: enabled,
        htmlToMdLastMessages: recent,
      };
      ctx.agentConfig.llmThinkRules = custom
        ? [
            {
              id: "custom",
              kind: "xml_tag",
              tagName: "analysis",
              displayName: "Analysis",
            },
          ]
        : [];
      await sessionLoader.execute(ctx);
      return ctx;
    };
    const plain = await build(false);
    expect(plain.messages[0].content).toContain("**raw**");
    const protectedResult = await build(true);
    expect(protectedResult.messages[0].content).toContain(
      "<analysis>keep <b>raw</b></analysis>"
    );
    nodes.old.metadata = { modelId: "updated" };
    const repeated = await build(true);
    expect(repeated.messages[0].metadata).toEqual({ modelId: "updated" });
    expect(repeated.messages[0].content).toBe(
      protectedResult.messages[0].content
    );
    expect((await build(true, false)).messages[0].content).toBe(source);
    expect((await build(true, true, 2)).messages[0].content).toBe(source);
  });

  it("keeps branch order and applies compression only after its summary is reached", async () => {
    const nodes = {
      root: node("root", null, "system", "root"),
      u: node("u", "root", "user", "question"),
      a: node("a", "u", "assistant", "answer"),
      summary: node("summary", "a", "assistant", "compressed"),
      next: node("next", "summary", "user", "next"),
      sibling: node("sibling", "a", "user", "other branch"),
    };
    nodes.summary.metadata = {
      isCompressionNode: true,
      compressedNodeIds: ["u", "a"],
    };
    const session = {
      id: "compressed",
      nodes,
      rootNodeId: "root",
      activeLeafId: "next",
      updatedAt: "2026-10-28",
      history: [],
      historyIndex: -1,
    } satisfies ChatSessionDetail;
    const current = createContext(session);
    await sessionLoader.execute(current);
    expect(current.messages.map((m) => m.sourceId)).toEqual([
      "summary",
      "next",
    ]);
    const before = createContext(
      session,
      new Map([["contextPreviewTargetNodeId", "a"]])
    );
    await sessionLoader.execute(before);
    expect(before.messages.map((m) => m.sourceId)).toEqual(["u", "a"]);
  });

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

it("loads attachment-only user messages and pending text materials without changing their text", async () => {
  const user = node("user", "root", "user", "");
  user.virtualAttachments = [
    { id: "text", kind: "text", title: "材料", text: "  {{literal}}\r\n😀 " },
  ];
  const session = {
    id: "text-only",
    nodes: { root: node("root", null, "system", ""), user },
    rootNodeId: "root",
    activeLeafId: "user",
    updatedAt: "2026-10-30",
    history: [],
    historyIndex: -1,
  } satisfies ChatSessionDetail;
  const context = createContext(
    session,
    new Map([
      [
        "pendingInput",
        { text: "", virtualAttachments: user.virtualAttachments },
      ],
    ])
  );
  await sessionLoader.execute(context);
  expect(context.messages).toHaveLength(2);
  for (const message of context.messages) {
    expect(message._attachments?.[0].source).toEqual({
      kind: "message-text",
      text: user.virtualAttachments[0].text,
    });
  }
});
