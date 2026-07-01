import { describe, expect, it, vi } from "vitest";
import { sessionLoader } from "../session-loader";
import type { ChatMessageNode, ChatSessionDetail } from "@/tools/llm-chat/types";
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
});
