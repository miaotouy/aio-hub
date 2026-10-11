import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatMessageNode } from "../../../types/message";

const chat = vi.hoisted(() => ({
  sessionDetailMap: new Map(),
  getActivePathBySessionId: vi.fn(),
}));

vi.mock("@/tools/llm-chat/stores/llmChatStore", () => ({
  useLlmChatStore: () => chat,
}));
vi.mock("@/tools/llm-chat/stores/toolCallingStore", () => ({
  setApprovalArbiter: vi.fn(),
  setTaskApprovalBridge: vi.fn(),
}));
vi.mock("@/services/decision-arbiter", () => ({
  createDecisionArbiter: vi.fn(),
  getDecisionChannelSettings: vi.fn(),
  loadDecisionChannelSettings: vi.fn(),
}));
vi.mock("@/services/background-tasks/approvalBridge", () => ({
  backgroundTaskApprovalBridge: {},
}));
vi.mock("@/tools/agent-manager/stores/agentStore", () => ({
  useAgentStore: vi.fn(),
}));
vi.mock("@/composables/useLlmRequest", () => ({ useLlmRequest: vi.fn() }));
vi.mock("@/composables/useLlmProfiles", () => ({
  useLlmProfiles: vi.fn(),
}));

import { getRecentUserMessage } from "../setupApprovalArbiter";

const node = (
  id: string,
  content: string,
  extra: Partial<ChatMessageNode> = {}
): ChatMessageNode => ({
  id,
  role: "user",
  status: "complete",
  content,
  parentId: null,
  childrenIds: [],
  timestamp: "2026-10-11T00:00:00.000Z",
  ...extra,
});

describe("审批用户意图上下文", () => {
  beforeEach(() => {
    chat.sessionDetailMap.clear();
    chat.getActivePathBySessionId.mockReset();
  });

  it("只采用请求所属会话活动分支的最近用户指令", () => {
    const first = node("first", "早期指令", {
      timestamp: "2026-10-11T03:00:00.000Z",
    });
    const active = node("active", "当前分支指令");
    const other = node("other", "其他分支的危险指令", {
      timestamp: "2026-10-11T04:00:00.000Z",
    });
    chat.sessionDetailMap.set("requested-session", {
      nodes: { first, active, other },
    });
    chat.getActivePathBySessionId.mockImplementation((sessionId: string) =>
      sessionId === "requested-session" ? [first, active] : [other]
    );

    expect(getRecentUserMessage("requested-session")).toBe("当前分支指令");
  });

  it("忽略活动路径上的停用、空白与助手消息，并保留摘要长度限制", () => {
    chat.getActivePathBySessionId.mockReturnValue([
      node("user", "a".repeat(500)),
      node("disabled", "停用的指令", { isEnabled: false }),
      node("blank", "   "),
      node("assistant", "助手内容", { role: "assistant" }),
    ]);

    expect(getRecentUserMessage("session")).toBe("a".repeat(400));
  });

  it("缺少本地会话或活动路径时保持上下文隔离", () => {
    chat.getActivePathBySessionId.mockReturnValue([]);
    expect(getRecentUserMessage()).toBeUndefined();
    expect(chat.getActivePathBySessionId).not.toHaveBeenCalled();
    expect(getRecentUserMessage("missing-session")).toBeUndefined();
  });
});
